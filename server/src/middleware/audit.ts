import type { Request } from "express";
import type { Db } from "@paperclipai/db";
import { auditService, type AuditTarget } from "../services/audit.js";
import { logger } from "./logger.js";

/**
 * Coolie fork — wave152: audit write helpers.
 *
 * There is no generic Express middleware that can audit correctly: an audit
 * record needs the *semantic* diff of a governed object (before → after), which
 * only the mutation site knows. So this module gives every mutation site the
 * same small surface — who acted, what changed — and every governed write calls
 * it. Keep the action verbs here or in the service consistent (`issue.*`,
 * `board_conversation.*`, `issue_work_product.*`, `issue_attachment.*`).
 *
 * Noise policy: heartbeat runs, reads and lists are NOT audited. Only state
 * transitions on governed objects are.
 */

export interface AuditActor {
  actorUserId: string | null;
  actorAgentId: string | null;
}

/** The acting identity as it should appear in the audit row. */
export function auditActorFromRequest(req: Request): AuditActor {
  if (req.actor.type === "agent") {
    return { actorUserId: null, actorAgentId: req.actor.agentId ?? null };
  }
  if (req.actor.type === "board") {
    // A local_implicit board actor has no user id; name it explicitly rather
    // than leaving the actor empty, so the row still answers "who".
    return { actorUserId: req.actor.userId ?? "local-board", actorAgentId: null };
  }
  return { actorUserId: null, actorAgentId: null };
}

/** Keep only the named keys that are actually present (no fabricated nulls). */
export function pickFields(
  source: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): Record<string, unknown> | null {
  if (!source) return null;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
  }
  return Object.keys(out).length > 0 ? out : null;
}

export interface RecordAuditInput {
  companyId: string;
  action: string;
  target: AuditTarget;
  before?: unknown;
  after?: unknown;
}

/**
 * Best-effort audit write from a request handler. A failure to record must not
 * fail the user's operation, so this logs and swallows. Use it where the write
 * happens outside a transaction; inside a transaction, call
 * `auditService(tx).write(...)` directly so the audit row is atomic with the
 * change.
 */
export async function recordAudit(
  db: Db,
  req: Request,
  input: RecordAuditInput,
): Promise<void> {
  try {
    const actor = auditActorFromRequest(req);
    await auditService(db).write(
      { companyId: input.companyId, ...actor },
      input.action,
      input.target,
      input.before ?? null,
      input.after ?? null,
    );
  } catch (err) {
    logger.warn(
      { err, action: input.action, target: input.target },
      "audit log write failed",
    );
  }
}
