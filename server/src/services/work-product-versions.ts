import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issueWorkProducts } from "@paperclipai/db";
import type { WorkProductVersion } from "@paperclipai/shared";

type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * wave141 — deliverable version chain.
 *
 * A logical deliverable is identified by its issue plus its logical file name
 * (`metadata.originalFilename` when present, else `title`). Every artifact work
 * product created for that key becomes the next version; only the newest row is
 * `isLatest`. Version creation is deliberately centralized here so the HTTP
 * attachment upload, the manual `POST /work-products` call, and the native
 * runner hand-off all agree on the chain.
 */

/** Normalized group key: trimmed, lower-cased logical file name. */
export function normalizeVersionKey(name: string): string {
  return name.trim().toLowerCase();
}

export type ArtifactVersionResolution =
  | {
      /** Uploaded bytes duplicate the current latest version — create nothing. */
      kind: "unchanged";
      workProductId: string;
      versionGroupId: string | null;
      versionNumber: number;
      contentSha256: string;
    }
  | {
      kind: "create";
      values: {
        versionGroupId: string;
        versionNumber: number;
        isLatest: true;
        contentSha256: string | null;
        versionNote: string | null;
      };
    };

/**
 * Decide the next version for an artifact work product about to be created.
 *
 * On `create` this also demotes the previous latest row of the group so the
 * chain keeps exactly one latest entry. Must run inside the same transaction
 * that inserts the new row.
 */
export async function resolveArtifactVersion(
  tx: Db,
  input: {
    companyId: string;
    issueId: string;
    /** Logical file name (filename, falling back to title). */
    versionKey: string;
    contentSha256?: string | null;
    versionNote?: string | null;
    /**
     * When false, always append a new version even if the bytes match the
     * current latest (used by the storage-side upload path, where the caller
     * has already decided the write should land).
     */
    dedupe?: boolean;
  },
): Promise<ArtifactVersionResolution> {
  const dedupe = input.dedupe ?? true;
  const key = normalizeVersionKey(input.versionKey);
  const normalizedSha = input.contentSha256?.trim().toLowerCase() || null;
  const rows = await tx
    .select({
      id: issueWorkProducts.id,
      versionGroupId: issueWorkProducts.versionGroupId,
      versionNumber: issueWorkProducts.versionNumber,
      contentSha256: issueWorkProducts.contentSha256,
    })
    .from(issueWorkProducts)
    .where(
      and(
        eq(issueWorkProducts.companyId, input.companyId),
        eq(issueWorkProducts.issueId, input.issueId),
        eq(issueWorkProducts.type, "artifact"),
        eq(issueWorkProducts.provider, "paperclip"),
        sql`lower(btrim(coalesce(nullif(${issueWorkProducts.metadata}->>'originalFilename', ''), ${issueWorkProducts.title}))) = ${key}`,
      ),
    )
    .orderBy(desc(issueWorkProducts.versionNumber), desc(issueWorkProducts.updatedAt));

  const latest = rows[0] ?? null;

  if (
    dedupe &&
    latest &&
    normalizedSha &&
    latest.contentSha256 &&
    latest.contentSha256.trim().toLowerCase() === normalizedSha
  ) {
    return {
      kind: "unchanged",
      workProductId: latest.id,
      versionGroupId: latest.versionGroupId ?? latest.id,
      versionNumber: latest.versionNumber,
      contentSha256: latest.contentSha256,
    };
  }

  const versionGroupId = latest?.versionGroupId ?? latest?.id ?? randomUUID();
  if (latest) {
    await tx
      .update(issueWorkProducts)
      .set({
        isLatest: false,
        // Link legacy (pre-wave141) latest rows into the new chain.
        ...(latest.versionGroupId ? {} : { versionGroupId }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(issueWorkProducts.companyId, input.companyId),
          eq(issueWorkProducts.versionGroupId, versionGroupId),
        ),
      );
  }

  return {
    kind: "create",
    values: {
      versionGroupId,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      isLatest: true,
      contentSha256: normalizedSha ?? null,
      versionNote: input.versionNote?.trim() || null,
    },
  };
}

type VersionRow = typeof issueWorkProducts.$inferSelect;

function metadataString(metadata: unknown, field: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

function metadataNumber(metadata: unknown, field: string): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Flatten a stored work-product row into the wire shape the App/Web render. */
export function toWorkProductVersion(
  row: VersionRow,
  agent: { id: string; name: string } | null,
): WorkProductVersion {
  const attachmentId = metadataString(row.metadata, "attachmentId");
  const contentPath = metadataString(row.metadata, "contentPath");
  return {
    id: row.id,
    versionGroupId: row.versionGroupId ?? null,
    versionNumber: row.versionNumber ?? 1,
    isLatest: row.isLatest ?? true,
    title: row.title,
    summary: row.summary ?? null,
    versionNote: row.versionNote ?? null,
    contentSha256: row.contentSha256 ?? null,
    contentType: metadataString(row.metadata, "contentType"),
    byteSize: metadataNumber(row.metadata, "byteSize"),
    originalFilename: metadataString(row.metadata, "originalFilename"),
    attachmentId,
    contentPath,
    openPath: metadataString(row.metadata, "openPath") ?? contentPath,
    downloadPath: metadataString(row.metadata, "downloadPath") ?? (contentPath ? `${contentPath}?download=1` : null),
    createdByAgent: agent,
    createdByUserId: null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
