import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, issueComments, issues } from "@paperclipai/db";

/**
 * Coolie fork — the DS production veto (gate G4).
 *
 * DS is the only role allowed to say "this can ship to users", and it says so as
 * a `go` decision on the company's most recent issue after walking the business
 * journey. Until that decision exists, a release of the company's product is
 * refused — a veto that needs no business-impact argument (see
 * `.agents/skills/ds/SKILL.md`, gate G4).
 *
 * The decision is read from the issue thread rather than a new table: a comment
 * authored by an agent whose role is `ds`, on that issue, reading `go`. Its
 * author, issue and timestamp are returned so the caller can show evidence
 * rather than a bare boolean.
 */

/** Stable error code a caller (route, script) can branch on. */
export const RELEASE_REJECTED_NEEDS_DS = "RELEASE_REJECTED_NEEDS_DS";

/** Thrown by `requireDsApproval` when no DS `go` decision exists. */
export class ReleaseGateError extends Error {
  readonly code = RELEASE_REJECTED_NEEDS_DS;

  constructor(message: string) {
    super(message);
    this.name = "ReleaseGateError";
  }
}

export interface DsApprovalDecision {
  approved: boolean;
  /** Why it was refused, or the evidence when approved. */
  reason: string;
  /** The issue the decision was (or should have been) made on. */
  issueId: string | null;
  /** The DS agent that signed off, when approved. */
  approvedByAgentId: string | null;
  /** The `go` comment, when approved. */
  approvalCommentId: string | null;
  /** The DS agents on the roster at check time. */
  dsAgentIds: string[];
}

/**
 * A `go` decision is a standalone `go` token. `no go` / `no-go` is an explicit
 * refusal and never counts, and the word boundaries keep "good", "going" and
 * "google" out of it.
 */
export function commentIsGoDecision(body: string): boolean {
  const text = body.toLowerCase();
  if (/(^|[^a-z])no[\s-]?go([^a-z]|$)/.test(text)) return false;
  return /(^|[^a-z])go([^a-z]|$)/.test(text);
}

/**
 * Read the current DS decision for a company. Never throws — an unapproved
 * release is a normal answer here, and the caller decides whether to enforce.
 */
export async function evaluateDsApproval(db: Db, companyId: string): Promise<DsApprovalDecision> {
  const dsAgents = await db
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(and(eq(agents.companyId, companyId), eq(agents.role, "ds"), ne(agents.status, "terminated")));
  const dsAgentIds = dsAgents.map((agent) => agent.id);

  if (dsAgentIds.length === 0) {
    return {
      approved: false,
      reason: "No DS agent on this company; add one before releasing (无可用 DS，建议添加).",
      issueId: null,
      approvedByAgentId: null,
      approvalCommentId: null,
      dsAgentIds,
    };
  }

  const latestIssue = await db
    .select({ id: issues.id })
    .from(issues)
    .where(eq(issues.companyId, companyId))
    .orderBy(desc(issues.createdAt))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!latestIssue) {
    return {
      approved: false,
      reason: "This company has no issue for DS to walk the business journey on.",
      issueId: null,
      approvedByAgentId: null,
      approvalCommentId: null,
      dsAgentIds,
    };
  }

  const comments = await db
    .select({
      id: issueComments.id,
      authorAgentId: issueComments.authorAgentId,
      derivedAuthorAgentId: issueComments.derivedAuthorAgentId,
      body: issueComments.body,
    })
    .from(issueComments)
    .where(
      and(
        eq(issueComments.companyId, companyId),
        eq(issueComments.issueId, latestIssue.id),
        isNull(issueComments.deletedAt),
      ),
    )
    .orderBy(asc(issueComments.createdAt));

  const approval = comments
    .filter((comment) => {
      // A DS decision counts whether it was attributed directly or derived from
      // the run that wrote it (the non-human sentinel path).
      const author = comment.authorAgentId ?? comment.derivedAuthorAgentId;
      return author !== null && dsAgentIds.includes(author);
    })
    .at(-1);

  // The LATEST DS word wins: a `go` followed by a `no-go` is a refusal, so this
  // reads the last decision rather than the last approval.
  if (!approval) {
    return {
      approved: false,
      reason: `DS has not posted a decision on the most recent issue (${latestIssue.id}).`,
      issueId: latestIssue.id,
      approvedByAgentId: null,
      approvalCommentId: null,
      dsAgentIds,
    };
  }

  if (!commentIsGoDecision(approval.body)) {
    return {
      approved: false,
      reason: `DS's latest decision on the most recent issue (${latestIssue.id}) is not a go.`,
      issueId: latestIssue.id,
      approvedByAgentId: null,
      approvalCommentId: approval.id,
      dsAgentIds,
    };
  }

  return {
    approved: true,
    reason: "DS signed off with a go decision on the most recent issue.",
    issueId: latestIssue.id,
    approvedByAgentId: approval.authorAgentId ?? approval.derivedAuthorAgentId,
    approvalCommentId: approval.id,
    dsAgentIds,
  };
}

/**
 * Enforce the DS veto: throw `ReleaseGateError` unless DS has signed off.
 * Returns the decision when approved so the caller can record the evidence.
 */
export async function requireDsApproval(db: Db, companyId: string): Promise<DsApprovalDecision> {
  const decision = await evaluateDsApproval(db, companyId);
  if (!decision.approved) {
    throw new ReleaseGateError(`Release rejected: needs DS approval. ${decision.reason}`);
  }
  return decision;
}
