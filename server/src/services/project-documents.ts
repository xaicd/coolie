import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolvePaperclipInstanceRoot, resolveProjectCoolieDocsDir } from "../home-paths.js";

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
