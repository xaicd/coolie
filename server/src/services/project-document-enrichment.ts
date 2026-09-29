import type { Db } from "@paperclipai/db";
import { issues } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";
import { extractDocumentText } from "./document-extractor.js";
import { goalService } from "./goals.js";
import { projectService } from "./projects.js";
import { buildWbsDraft } from "./wbs-draft.js";
import { logActivity } from "./activity-log.js";
import { logger } from "../middleware/logger.js";

/**
 * Background enrichment for a project's uploaded requirement document.
 *
 * wave123: the upload route must answer immediately, so the read-and-parse work
 * happens off the request path. The job is heuristic and local (no LLM): it
 * backfills an empty project description and turns a document's goal/scope/
 * deliverable section — or, failing a recognisable one, its list items — into
 * Goal rows linked to the project, then records one activity entry so the
 * backfill is visible in the project feed.
 *
 * wave139: a Chinese 技术规范书 rarely marks sections with markdown. The section
 * and entry readers now accept the plain numbered forms (`2.1 技术目标`, `一、项目
 * 说明`, `第X章`, `（1）`), the numbered lists (`1.`/`1)`/`1、`), and the flattened
 * row labels of a Word table under a 功能/范围/交付 section. The caps and the
 * conservative rules are unchanged: at most 8 goals, 80 chars each, written only
 * while the project has none, and a failure stays silent to the upload caller.
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

/** A section title up to this length is a heading; longer text is prose. */
const MAX_HEADING_LABEL_CHARS = 40;

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
/**
 * List items, in the forms a requirement document carries: markdown bullets,
 * `1.`/`1)`/`1、`, `一、`, and the parenthesised `（1）`/`(1)` variants a Chinese
 * spec uses for its numbered points. The captured group is the item's text.
 */
const LIST_ITEM_RE =
  /^(?:[-*+]|(?:\d+|[一二三四五六七八九十百零〇]+)\s*[.)、．]|[（(]\s*(?:\d+|[一二三四五六七八九十百零〇]+)\s*[）)])\s*(.+)$/;
/**
 * Plain-text section headings a Word/TXT export produces, since a requirement
 * document rarely uses markdown: `2.1 技术目标`, `3.1.1 办公条件约定`, `一、项目说明`,
 * `第X章 …`. Each alternative's first group is the numbering and its last group the
 * title. The parenthesised `（1）` form is deliberately NOT a heading — a Chinese
 * spec uses it for list entries (see LIST_ITEM_RE), and reading it as one hides
 * those entries from a 建设目标 section.
 */
const NUM_HEADING_RE = /^[★☆※\s]*(\d+(?:[.．]\d+)+)\s*[、.．]?\s*(.+)$/;
const CN_HEADING_RE = /^[★☆※\s]*([一二三四五六七八九十百零〇]+)\s*[、.．]\s*(.+)$/;
const CHAPTER_HEADING_RE = /^[★☆※\s]*第([一二三四五六七八九十百零〇\d]+)\s*[章篇]\s*(.+)$/;
/** A flattened table cell: a row ordinal on a line of its own (`12`). */
const ROW_ORDINAL_RE = /^\d+$/;
/**
 * Sections whose contents are worth reading as project goals. The first group is
 * the broad 目标/交付 and English forms; the rest are the concrete titles a
 * Chinese 技术规范书 puts above a 功能/范围 list.
 */
const GOAL_SECTION_RE =
  /建设目标|项目目标|业务目标|技术目标|建设内容|交付内容|业务场景|功能清单|建设范围|功能模块|系统功能|目标|里程碑|交付|scope|deliverable|objective|goal/i;

/**
 * Whether a candidate label reads as a sentence rather than a title. Used only
 * for heading detection and flattened-table cells — never for an explicit list
 * item, where a longer line is still an entry (truncated to 80 chars).
 */
function looksLikeProse(value: string): boolean {
  return (
    value.length > MAX_HEADING_LABEL_CHARS ||
    /[。；！？：]/.test(value) ||
    /[，,]$/.test(value)
  );
}

/**
 * Read a `#`/`##` heading, or null when the line is not one. The level lets a
 * later same-or-higher heading close a 目标 section.
 */
function readHeading(line: string): { level: number; text: string } | null {
  const match = HEADING_RE.exec(line);
  if (!match) return null;
  return { level: match[1].length, text: match[2].trim() };
}

/**
 * Read a section heading in either markdown or the plain numbered forms above,
 * or null when the line is not one. A numbered line whose text reads as prose
 * (`1. 与核心业务系统…`) is a list item, not a heading, so the caller reaches it
 * through `readListItem`. The level closes a same-or-higher 目标 section.
 */
function readSectionHeading(line: string): { level: number; text: string } | null {
  const markdown = readHeading(line);
  if (markdown) return markdown;

  let match: RegExpExecArray | null;
  if ((match = CHAPTER_HEADING_RE.exec(line)) && !looksLikeProse(match[2].trim())) {
    return { level: 1, text: match[2].trim() };
  }
  if ((match = CN_HEADING_RE.exec(line)) && !looksLikeProse(match[2].trim())) {
    return { level: 1, text: match[2].trim() };
  }
  if ((match = NUM_HEADING_RE.exec(line)) && !looksLikeProse(match[2].trim())) {
    // `2.1` is two levels deep, `3.1.1` three — so a subsection cannot close its parent.
    return { level: match[1].split(/[.．]/).length, text: match[2].trim() };
  }
  return null;
}

/** Read a bullet/numbered list item's text, or null when the line is not one. */
function readListItem(line: string): string | null {
  const match = LIST_ITEM_RE.exec(line);
  return match ? match[1] : null;
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
 * Goal titles from a document: entries under a 目标/里程碑/交付/功能模块 (or 建设内容/
 * 交付内容/业务场景/功能清单/建设范围/系统功能, and the English scope/deliverable/
 * objective/goal) heading when there is one, otherwise the document's entries.
 * An entry is an explicit bullet or numbered item, or — when a Word table is
 * flattened to one cell per line — the short label of a table row, identified by
 * the bare row ordinal that opens it, so a row's prose description is not read as
 * a goal. Deduplicated, capped at MAX_GOALS, each title at most 80 chars.
 */
export function extractProjectGoals(text: string): string[] {
  const sectionItems: string[] = [];
  const allItems: string[] = [];
  let inGoalSection = false;
  let goalSectionLevel = 0;
  let sawRowOrdinal = false;

  const pushTitle = (raw: string, into: string[]): void => {
    const title = stripInlineMarkdown(raw).slice(0, MAX_GOAL_TITLE_CHARS).trim();
    if (title.length >= MIN_GOAL_TITLE_CHARS) into.push(title);
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = readSectionHeading(line);
    if (heading) {
      if (GOAL_SECTION_RE.test(heading.text)) {
        inGoalSection = true;
        goalSectionLevel = heading.level;
        sawRowOrdinal = false;
      } else if (inGoalSection && heading.level <= goalSectionLevel) {
        inGoalSection = false;
      }
      continue;
    }

    const item = readListItem(line);
    if (item) {
      pushTitle(item, allItems);
      if (inGoalSection) pushTitle(item, sectionItems);
      continue;
    }

    // A flattened table: a bare ordinal opens a row, and the short label that
    // follows names it. Cells above the first ordinal are the table header, so
    // they are not goals; a row's long description reads as prose and is skipped.
    if (ROW_ORDINAL_RE.test(line)) {
      sawRowOrdinal = true;
      continue;
    }
    if (inGoalSection && sawRowOrdinal && !looksLikeProse(line)) {
      pushTitle(line, sectionItems);
    }
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

/**
 * Goals are backfilled only while a project has none, so re-uploading a document
 * (or adding a second one) can never append a second, differently-shaped set.
 */
export function projectAlreadyHasGoals(project: {
  goalIds?: string[] | null;
  goals?: unknown[] | null;
}): boolean {
  return (project.goalIds?.length ?? 0) > 0 || (project.goals?.length ?? 0) > 0;
}

export interface ProjectDocumentEnrichmentResult {
  descriptionAdded: boolean;
  goalsCreated: number;
  /** Number of nodes in the WBS draft produced this run (0 when not eligible). */
  wbsDraftItems: number;
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

/**
 * Whether the project already carries 里程碑/主线 tasks. A project that has
 * adopted a WBS must never be re-drafted, so this is one of the two idempotency
 * guards (the other is `projects.wbs_draft` already being set).
 */
async function projectHasMilestones(db: Db, projectId: string): Promise<boolean> {
  const rows = await db
    .select({ id: issues.id })
    .from(issues)
    .where(and(eq(issues.projectId, projectId), eq(issues.isMilestone, true)))
    .limit(1);
  return rows.length > 0;
}

function buildSummary(descriptionAdded: boolean, goalsCreated: number, wbsDraftItems: number): string {
  const parts: string[] = [];
  if (descriptionAdded) parts.push("补充描述");
  if (goalsCreated > 0) parts.push(`${goalsCreated} 条建设目标`);
  if (wbsDraftItems > 0) parts.push(`WBS 草案(${wbsDraftItems} 项)`);
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
    return { descriptionAdded: false, goalsCreated: 0, wbsDraftItems: 0, summary: null, skipped: "unsupported_format" };
  }

  const projects = projectService(input.db);
  const project = await projects.getById(input.projectId);
  if (!project || project.companyId !== input.companyId) {
    return { descriptionAdded: false, goalsCreated: 0, wbsDraftItems: 0, summary: null, skipped: "project_not_found" };
  }

  const description = project.description?.trim() ? null : extractProjectDescription(extracted.text);

  // Goals are a backfill, not an override: they are added only while the project
  // has none, so a re-upload (or a second document) can never append a second
  // set. The title filter stays as the inner guard against duplicates in one doc.
  const goalTitles = projectAlreadyHasGoals(project) ? [] : extractProjectGoals(extracted.text);

  const existingTitles = new Set(
    (project.goals ?? []).map((goal) => stripInlineMarkdown(goal.title).toLowerCase()),
  );
  const newTitles = goalTitles.filter((title) => !existingTitles.has(title.toLowerCase()));

  // WBS draft (wave140): produced once per project, only while no draft exists
  // and no 里程碑 has been adopted, so a re-upload can never append a second,
  // differently-shaped breakdown. Never silently materialised into issues — the
  // project head adopts or dismisses it in the UI.
  const draftEligible =
    project.wbsDraft == null && !(await projectHasMilestones(input.db, input.projectId));
  const draftGoalTitles = [
    ...(project.goals ?? []).map((goal) => stripInlineMarkdown(goal.title)),
    ...newTitles,
  ];

  if (!description && newTitles.length === 0 && !draftEligible) {
    return { descriptionAdded: false, goalsCreated: 0, wbsDraftItems: 0, summary: null, skipped: "no_changes" };
  }

  const goals = goalService(input.db);
  const createdGoalIds: string[] = [];
  for (const title of newTitles) {
    const row = await goals.create(input.companyId, { title, level: "task", status: "planned" });
    createdGoalIds.push(row.id);
  }

  const wbsDraft = draftEligible
    ? buildWbsDraft({ projectName: project.name, goalTitles: draftGoalTitles, source: input.filename })
    : null;

  await projects.update(input.projectId, {
    ...(description ? { description } : {}),
    ...(createdGoalIds.length > 0
      ? { goalIds: [...(project.goalIds ?? []), ...createdGoalIds] }
      : {}),
    ...(wbsDraft ? { wbsDraft } : {}),
  });

  const wbsDraftItems = wbsDraft?.items.length ?? 0;
  const summary = buildSummary(Boolean(description), createdGoalIds.length, wbsDraftItems);
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
      wbsDraftItems,
      summary,
    },
  });

  return {
    descriptionAdded: Boolean(description),
    goalsCreated: createdGoalIds.length,
    wbsDraftItems,
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
