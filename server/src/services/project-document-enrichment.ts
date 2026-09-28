import type { Db } from "@paperclipai/db";
import { extractDocumentText } from "./document-extractor.js";
import { goalService } from "./goals.js";
import { projectService } from "./projects.js";
import { logActivity } from "./activity-log.js";
import { logger } from "../middleware/logger.js";

/**
 * Background enrichment for a project's uploaded requirement document.
 *
 * wave123: the upload route must answer immediately, so the read-and-parse work
 * happens off the request path. The job is heuristic and local (no LLM): it
 * backfills an empty project description and turns a document's 目标/里程碑/交付/
 * 功能模块 list into Goal rows linked to the project, then records one activity
 * entry so the backfill is visible in the project feed.
 */

/** Read at most this much text: a doc is a hint, not a contract. */
const MAX_ENRICHMENT_CHARS = 8_000;
const MAX_DESCRIPTION_CHARS = 200;
const MIN_DESCRIPTION_CHARS = 6;
const MAX_GOAL_TITLE_CHARS = 80;
const MIN_GOAL_TITLE_CHARS = 2;
const MAX_GOALS = 8;

/** Hard cap on one job so a pathological document cannot pin the event loop. */
export const PROJECT_DOCUMENT_ENRICHMENT_TIMEOUT_MS = 10_000;

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const LIST_ITEM_RE = /^([-*+]|\d+[.)、])\s+(.+)$/;
const GOAL_SECTION_RE = /目标|里程碑|交付|功能模块/;

/**
 * Read a `#`/`##` heading, or null when the line is not one. The level lets a
 * later same-or-higher heading close a 目标 section.
 */
function readHeading(line: string): { level: number; text: string } | null {
  const match = HEADING_RE.exec(line);
  if (!match) return null;
  return { level: match[1].length, text: match[2].trim() };
}

/** Read a `-`/`*`/`+`/`1.` list item's text, or null when the line is not one. */
function readListItem(line: string): string | null {
  const match = LIST_ITEM_RE.exec(line);
  return match ? match[2] : null;
}

/** Strip the inline markup a heading, list item or paragraph can carry. */
function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * First prose paragraph, up to ~200 chars, for a project with no description.
 * Headings and list items are skipped — a name or a bullet is not a description.
 */
export function extractProjectDescription(text: string): string | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || readHeading(line) || readListItem(line)) continue;
    if (stripInlineMarkdown(line).length >= MIN_DESCRIPTION_CHARS) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let paragraph = stripInlineMarkdown(lines[start]);
  for (let i = start + 1; i < lines.length && paragraph.length < MAX_DESCRIPTION_CHARS; i += 1) {
    const line = lines[i];
    if (!line || readHeading(line) || readListItem(line)) break;
    paragraph = `${paragraph} ${stripInlineMarkdown(line)}`.trim();
  }
  return paragraph.slice(0, MAX_DESCRIPTION_CHARS).trim() || null;
}

/**
 * Goal titles from a document: list items under a 目标/里程碑/交付/功能模块
 * heading when there is one, otherwise the document's list items. Deduplicated,
 * capped at MAX_GOALS, each title at most 80 chars.
 */
export function extractProjectGoals(text: string): string[] {
  const sectionItems: string[] = [];
  const allItems: string[] = [];
  let inGoalSection = false;
  let goalSectionLevel = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = readHeading(line);
    if (heading) {
      if (GOAL_SECTION_RE.test(heading.text)) {
        inGoalSection = true;
        goalSectionLevel = heading.level;
      } else if (inGoalSection && heading.level <= goalSectionLevel) {
        inGoalSection = false;
      }
      continue;
    }
    const item = readListItem(line);
    if (!item) continue;
    const title = stripInlineMarkdown(item).slice(0, MAX_GOAL_TITLE_CHARS).trim();
    if (title.length < MIN_GOAL_TITLE_CHARS) continue;
    allItems.push(title);
    if (inGoalSection) sectionItems.push(title);
  }

  const chosen = sectionItems.length > 0 ? sectionItems : allItems;
  const goals: string[] = [];
  const seen = new Set<string>();
  for (const title of chosen) {
    if (seen.has(title)) continue;
    seen.add(title);
    goals.push(title);
    if (goals.length >= MAX_GOALS) break;
  }
  return goals;
}

export interface ProjectDocumentEnrichmentResult {
  descriptionAdded: boolean;
  goalsCreated: number;
  /** Human-readable summary recorded on the activity entry. */
  summary: string | null;
  skipped: "unsupported_format" | "project_not_found" | "no_changes" | null;
}

export interface ProjectDocumentEnrichmentInput {
  db: Db;
  companyId: string;
  projectId: string;
  filename: string;
  body: Buffer;
  contentType?: string;
  /** `projects/<companyId>/<projectId>/coolie-docs/<filename>` when known. */
  relativePath?: string | null;
}

const ACTOR_ID = "project-document-enrichment";

function buildSummary(descriptionAdded: boolean, goalsCreated: number): string {
  const parts: string[] = [];
  if (descriptionAdded) parts.push("补充描述");
  if (goalsCreated > 0) parts.push(`${goalsCreated} 条建设目标`);
  return parts.length > 0 ? `文档解析: ${parts.join(" + ")}` : "文档解析: 无可用补充";
}

async function runEnrichment(
  input: ProjectDocumentEnrichmentInput,
): Promise<ProjectDocumentEnrichmentResult> {
  const extracted = await extractDocumentText(
    input.body,
    input.filename,
    input.contentType,
    MAX_ENRICHMENT_CHARS,
  );
  if (!extracted) {
    return { descriptionAdded: false, goalsCreated: 0, summary: null, skipped: "unsupported_format" };
  }

  const projects = projectService(input.db);
  const project = await projects.getById(input.projectId);
  if (!project || project.companyId !== input.companyId) {
    return { descriptionAdded: false, goalsCreated: 0, summary: null, skipped: "project_not_found" };
  }

  const description = project.description?.trim() ? null : extractProjectDescription(extracted.text);
  const goalTitles = extractProjectGoals(extracted.text);

  // Re-uploading the same document must not duplicate a goal already on the project.
  const existingTitles = new Set(
    (project.goals ?? []).map((goal) => stripInlineMarkdown(goal.title).toLowerCase()),
  );
  const newTitles = goalTitles.filter((title) => !existingTitles.has(title.toLowerCase()));

  if (!description && newTitles.length === 0) {
    return { descriptionAdded: false, goalsCreated: 0, summary: null, skipped: "no_changes" };
  }

  const goals = goalService(input.db);
  const createdGoalIds: string[] = [];
  for (const title of newTitles) {
    const row = await goals.create(input.companyId, { title, level: "task", status: "planned" });
    createdGoalIds.push(row.id);
  }

  await projects.update(input.projectId, {
    ...(description ? { description } : {}),
    ...(createdGoalIds.length > 0
      ? { goalIds: [...(project.goalIds ?? []), ...createdGoalIds] }
      : {}),
  });

  const summary = buildSummary(Boolean(description), createdGoalIds.length);
  await logActivity(input.db, {
    companyId: input.companyId,
    actorType: "system",
    actorId: ACTOR_ID,
    action: "project.document_enriched",
    entityType: "project",
    entityId: input.projectId,
    details: {
      filename: input.filename,
      relativePath: input.relativePath ?? null,
      descriptionAdded: Boolean(description),
      goalsCreated: createdGoalIds.length,
      goalTitles: newTitles,
      summary,
    },
  });

  return {
    descriptionAdded: Boolean(description),
    goalsCreated: createdGoalIds.length,
    summary,
    skipped: null,
  };
}

/**
 * Run the enrichment under a hard timeout. The caller is a background job, so
 * the timeout is the only thing that can reject; failures are handled by the
 * scheduler below.
 */
export async function enrichProjectDocument(
  input: ProjectDocumentEnrichmentInput,
): Promise<ProjectDocumentEnrichmentResult> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      runEnrichment(input),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `project document enrichment timed out after ${PROJECT_DOCUMENT_ENRICHMENT_TIMEOUT_MS}ms`,
              ),
            ),
          PROJECT_DOCUMENT_ENRICHMENT_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fire-and-forget the enrichment off the request path. `setImmediate` lets the
 * upload response flush first; the job's own catch keeps a failure from escaping
 * as an unhandled rejection or from ever blocking the caller.
 */
export function scheduleProjectDocumentEnrichment(input: ProjectDocumentEnrichmentInput): void {
  setImmediate(() => {
    void enrichProjectDocument(input).catch((error) => {
      logger.warn(
        { err: error, projectId: input.projectId, filename: input.filename },
        "project document enrichment failed",
      );
    });
  });
}
