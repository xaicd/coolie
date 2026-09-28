import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeProjectUrlKey } from "@paperclipai/shared";
import { resolvePaperclipInstanceRoot, resolveProjectCoolieDocsDir } from "../home-paths.js";
import { extractDocumentText } from "./document-extractor.js";

/**
 * Reduce an uploaded name to a bare basename so `../` or an absolute path
 * cannot escape the project's docs folder.
 */
export function sanitizeProjectDocumentFilename(raw: string): string {
  const base = path.basename(String(raw ?? "").replace(/\\/g, "/"));
  // Strip control characters that would corrupt a path.
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return "";
  return cleaned.slice(0, 200);
}

function relativeToInstanceRoot(absolutePath: string): string {
  return path
    .relative(resolvePaperclipInstanceRoot(), absolutePath)
    .split(path.sep)
    .join(path.posix.sep);
}

export interface LandedProjectDocument {
  projectId: string;
  filename: string;
  /** Path relative to the instance root, e.g. `projects/<companyId>/<projectId>/coolie-docs/<filename>`. */
  relativePath: string;
  byteSize: number;
  sha256: string;
  originalFilename: string | null;
}

export interface ProjectDocumentEntry {
  filename: string;
  byteSize: number;
  modifiedAt: string;
}

/**
 * Write one uploaded document into the project's plain-storage docs directory:
 * `<instanceRoot>/projects/<companyId>/<projectId>/coolie-docs/<filename>`.
 *
 * No git: the coolie-docs directory is a sibling of the managed repo checkout,
 * so an upload never dirties a checkout and nothing is committed. Versioning is
 * a later concern.
 */
export async function landProjectDocument(input: {
  companyId: string;
  projectId: string;
  filename: string;
  body: Buffer;
  originalFilename?: string | null;
}): Promise<LandedProjectDocument> {
  const directory = resolveProjectCoolieDocsDir(input.companyId, input.projectId);
  await fs.mkdir(directory, { recursive: true });
  const absolutePath = path.join(directory, input.filename);
  await fs.writeFile(absolutePath, input.body);
  return {
    projectId: input.projectId,
    filename: input.filename,
    relativePath: relativeToInstanceRoot(absolutePath),
    byteSize: input.body.length,
    sha256: createHash("sha256").update(input.body).digest("hex"),
    originalFilename: input.originalFilename ?? null,
  };
}

/**
 * List the documents landed for one project. A project that has never received
 * an upload has no directory yet, which is an empty list rather than an error.
 */
export async function listProjectDocuments(input: {
  companyId: string;
  projectId: string;
}): Promise<ProjectDocumentEntry[]> {
  const directory = resolveProjectCoolieDocsDir(input.companyId, input.projectId);
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const documents: ProjectDocumentEntry[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const stat = await fs.stat(path.join(directory, entry.name));
    documents.push({
      filename: entry.name,
      byteSize: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  }
  documents.sort(
    (a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || a.filename.localeCompare(b.filename),
  );
  return documents;
}

/** Longest name we will suggest: a project name is a label, not a paragraph. */
const MAX_SUGGESTED_NAME_CHARS = 60;

export interface ProjectDocumentAnalysis {
  suggestedName: string;
  /** Lowercase-hyphen ASCII slug, unique against the company's existing projects. */
  suggestedSlug: string;
  summary: string;
  /** Where `suggestedName` came from: the document body, or the filename stem. */
  source: "content" | "filename";
  extractedChars: number;
  /** False when this format has no text extractor yet (PDF, this wave). */
  textSupported: boolean;
}

/** Strip markdown/punctuation so a heading or first line reads as a plain name. */
export function sanitizeSuggestedProjectName(raw: string | null | undefined): string {
  const cleaned = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[#>*`_~|]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s:：\-–—·、.]+/, "")
    .replace(/[\s:：\-–—·、.]+$/, "")
    .trim();
  return cleaned.slice(0, MAX_SUGGESTED_NAME_CHARS).trim();
}

/**
 * Heuristic title for a document: any Markdown heading wins, otherwise the first
 * short line that is not a list/quote marker. Content-only — the caller falls
 * back to the filename stem when this returns null.
 */
export function suggestProjectNameFromText(text: string): string | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (heading) {
      const name = sanitizeSuggestedProjectName(heading[1]);
      if (name.length >= 2) return name;
    }
  }
  for (const line of lines) {
    if (/^([-*+>|]|\d+[.)、])\s/.test(line)) continue;
    const name = sanitizeSuggestedProjectName(line);
    if (name.length >= 2) return name;
  }
  return null;
}

/** The filename without extension, as a human-readable name (`prd_v2.md` -> `prd v2`). */
export function projectNameFromFilename(filename: string): string {
  const base = path.basename(String(filename ?? "").replace(/\\/g, "/"));
  const stem = base.replace(/\.[^./\\]+$/, "");
  return sanitizeSuggestedProjectName(stem.replace(/[_-]+/g, " "));
}

/**
 * A lowercase-hyphen ASCII slug that `createProject` will accept as a unique
 * shortname. Mirrors `resolveProjectNameForUniqueShortname`'s collision rule
 * (append `-2`, `-3`, …) so the suggested slug matches what the service would
 * derive for the name.
 */
export function suggestUniqueProjectSlug(input: {
  name: string;
  filenameStem: string;
  existingProjectNames: readonly string[];
}): string {
  const used = new Set(
    input.existingProjectNames
      .map((existing) => normalizeProjectUrlKey(existing))
      .filter((value): value is string => value !== null),
  );
  const base =
    normalizeProjectUrlKey(input.name) ??
    normalizeProjectUrlKey(input.filenameStem) ??
    "project";
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  // Deterministic guard for a pathological naming collision.
  return `${base}-${createHash("sha256").update(input.name).digest("hex").slice(0, 6)}`;
}

/** First prose line of the document, for the one-line summary. */
function firstContentLine(text: string): string | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const content = lines.find((line) => !/^#{1,6}\s+/.test(line));
  return content ? content.replace(/\s+/g, " ").slice(0, 120) : null;
}

/**
 * Auto-recognize an uploaded requirement document so the create-project flow can
 * prefill 项目名称. Deterministic and local — no LLM call: the title/H1 becomes
 * the display name, an ASCII slug is derived and made unique, and one summary
 * line is returned. Formats without an extractor (PDF, this wave) still yield a
 * name from the filename stem, with `textSupported: false` to say so.
 */
export async function analyzeProjectDocument(input: {
  body: Buffer;
  filename: string;
  contentType?: string;
  existingProjectNames: readonly string[];
}): Promise<ProjectDocumentAnalysis> {
  const extracted = await extractDocumentText(input.body, input.filename, input.contentType, 4_000);
  const stem = projectNameFromFilename(input.filename);
  const fromText = extracted ? suggestProjectNameFromText(extracted.text) : null;
  const suggestedName = fromText ?? (stem || "未命名项目");
  return {
    suggestedName,
    suggestedSlug: suggestUniqueProjectSlug({
      name: suggestedName,
      filenameStem: stem,
      existingProjectNames: input.existingProjectNames,
    }),
    summary:
      (extracted ? firstContentLine(extracted.text) : null) ??
      `来自文档「${path.basename(input.filename) || suggestedName}」`,
    source: fromText ? "content" : "filename",
    extractedChars: extracted?.charCount ?? 0,
    textSupported: extracted !== null,
  };
}
