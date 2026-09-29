import { and, desc, eq, gte, lt, lte, type SQL } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { auditLog } from "@paperclipai/db";

/**
 * Coolie fork — wave152: governance audit trail.
 *
 * `activity_log` is a feed (something happened, read as a timeline). This
 * service writes the stronger record: who changed which governed object, from
 * what (`before`) to what (`after`). Every mutation site that calls
 * `writeAuditLog` names the action explicitly, so the set of governed actions
 * is auditable by grepping for `writeAuditLog` / `recordAudit`.
 */

export interface AuditContext {
  companyId: string;
  actorUserId?: string | null;
  actorAgentId?: string | null;
}

export interface AuditTarget {
  /** e.g. "issue" | "board_conversation" | "issue_work_product" | "issue_attachment" */
  type: string;
  /** uuid or identifier text */
  id: string;
}

export interface AuditListFilters {
  companyId: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  actorAgentId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  /** ISO timestamp; returns rows strictly older than it (newest-first paging). */
  cursor?: string;
}

export const DEFAULT_AUDIT_LIMIT = 100;
export const MAX_AUDIT_LIMIT = 500;

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_AUDIT_LIMIT;
  return Math.max(1, Math.min(MAX_AUDIT_LIMIT, Math.floor(limit ?? DEFAULT_AUDIT_LIMIT)));
}

function asJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export interface AuditWriteResult {
  id: string;
  createdAt: Date;
}

export function auditService(db: Db) {
  async function write(
    ctx: AuditContext,
    action: string,
    target: AuditTarget,
    before: unknown,
    after: unknown,
  ): Promise<AuditWriteResult> {
    const [row] = await db
      .insert(auditLog)
      .values({
        companyId: ctx.companyId,
        actorUserId: ctx.actorUserId ?? null,
        actorAgentId: ctx.actorAgentId ?? null,
        action,
        targetType: target.type,
        targetId: target.id,
        before: asJsonObject(before),
        after: asJsonObject(after),
      })
      .returning({ id: auditLog.id, createdAt: auditLog.createdAt });
    return row;
  }

  async function list(filters: AuditListFilters) {
    const conditions: SQL[] = [eq(auditLog.companyId, filters.companyId)];
    if (filters.action) conditions.push(eq(auditLog.action, filters.action));
    if (filters.targetType) conditions.push(eq(auditLog.targetType, filters.targetType));
    if (filters.targetId) conditions.push(eq(auditLog.targetId, filters.targetId));
    if (filters.actorAgentId) conditions.push(eq(auditLog.actorAgentId, filters.actorAgentId));
    if (filters.from) conditions.push(gte(auditLog.createdAt, filters.from));
    if (filters.to) conditions.push(lte(auditLog.createdAt, filters.to));
    if (filters.cursor) conditions.push(lt(auditLog.createdAt, new Date(filters.cursor)));

    const limit = normalizeLimit(filters.limit);
    const rows = await db
      .select()
      .from(auditLog)
      .where(and(...conditions))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: hasMore && last ? last.createdAt.toISOString() : null,
    };
  }

  return { write, list };
}

export type AuditService = ReturnType<typeof auditService>;

/**
 * Standalone writer for call sites that only have a `Db`/transaction and no
 * constructed service. Prefer `auditService(db).write` inside a transaction so
 * the audit row commits atomically with the change it describes.
 */
export function writeAuditLog(
  db: Db,
  ctx: AuditContext,
  action: string,
  target: AuditTarget,
  before: unknown,
  after: unknown,
): Promise<AuditWriteResult> {
  return auditService(db).write(ctx, action, target, before, after);
}
