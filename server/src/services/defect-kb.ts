import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { defectKb } from "@paperclipai/db";

/**
 * Coolie fork — wave152 (D): defect knowledge base.
 *
 * Repeated defects are what a playbook prevents. Two defects are "the same" if
 * their normalized titles match; severity is folded in because it is the one
 * stable taxonomy the defect payload carries. `source` is deliberately NOT part
 * of the fingerprint: the same defect is found from different surfaces (web vs
 * app), so folding it in would split one recurring defect across rows and
 * defeat the aggregate. `reproSteps` / `evidenceAttachmentIds` are per-sighting
 * and equally excluded.
 *
 * At `DEFECT_PLAYBOOK_THRESHOLD` closed sightings the runtime opens a playbook
 * task for the company (see `handleClosedDefect`).
 */

export const DEFECT_PLAYBOOK_THRESHOLD = 3;

export interface DefectFingerprintInput {
  title: string;
  severity?: string | null;
}

export function normalizeDefectTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function defectFingerprint(input: DefectFingerprintInput): string {
  const severity = (input.severity ?? "").trim().toLowerCase();
  return createHash("sha1")
    .update(`${normalizeDefectTitle(input.title)}|${severity}`)
    .digest("hex");
}

export interface DefectKbRecord {
  id: string;
  companyId: string;
  fingerprint: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  sampleIssueId: string | null;
  suggestedPlaybook: string | null;
  playbookTaskId: string | null;
}

export function defectKbService(db: Db) {
  /** Count one closed sighting of a fingerprint and return the aggregate row. */
  async function recordClosed(input: {
    companyId: string;
    fingerprint: string;
    sampleIssueId?: string | null;
  }): Promise<DefectKbRecord> {
    const now = new Date();
    const [row] = await db
      .insert(defectKb)
      .values({
        companyId: input.companyId,
        fingerprint: input.fingerprint,
        count: 1,
        firstSeen: now,
        lastSeen: now,
        sampleIssueId: input.sampleIssueId ?? null,
      })
      .onConflictDoUpdate({
        target: [defectKb.companyId, defectKb.fingerprint],
        set: {
          count: sql`${defectKb.count} + 1`,
          lastSeen: now,
          updatedAt: now,
          ...(input.sampleIssueId ? { sampleIssueId: input.sampleIssueId } : {}),
        },
      })
      .returning();
    return row as DefectKbRecord;
  }

  /** Link the playbook task opened for a fingerprint (idempotent). */
  async function markPlaybookSuggested(
    companyId: string,
    fingerprint: string,
    input: { taskId: string; note: string },
  ): Promise<void> {
    await db
      .update(defectKb)
      .set({
        suggestedPlaybook: input.note,
        playbookTaskId: input.taskId,
        updatedAt: new Date(),
      })
      .where(and(eq(defectKb.companyId, companyId), eq(defectKb.fingerprint, fingerprint)));
  }

  function list(companyId: string, opts: { limit?: number; minCount?: number } = {}) {
    const limit = Math.max(1, Math.min(500, opts.limit ?? 100));
    return db
      .select()
      .from(defectKb)
      .where(
        opts.minCount && opts.minCount > 1
          ? and(eq(defectKb.companyId, companyId), sql`${defectKb.count} >= ${opts.minCount}`)
          : eq(defectKb.companyId, companyId),
      )
      .orderBy(desc(defectKb.count), desc(defectKb.lastSeen))
      .limit(limit);
  }

  return { recordClosed, markPlaybookSuggested, list };
}

export type DefectKbService = ReturnType<typeof defectKbService>;
