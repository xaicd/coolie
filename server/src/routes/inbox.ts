import { Router } from "express";
import { and, desc, eq, ilike, isNotNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, approvals, issueComments, issues } from "@paperclipai/db";
import { badRequest } from "../errors.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function readLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (typeof value !== "string") throw badRequest("limit must be an integer");
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw badRequest("limit must be a positive integer");
  return Math.min(parsed, MAX_LIMIT);
}

function readCompanyId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw badRequest("companyId is required");
  return value.trim();
}

/**
 * The mobile inbox: one company-scoped feed of the three things a board user
 * opens the app to act on — approvals waiting on a decision, tasks that have
 * stalled (`blocked`), and agent comments that mention someone with `@`.
 *
 * Each bucket is queried independently and returned whole; the screen renders
 * them as three lists rather than a merged stream, so no cross-bucket ordering
 * is attempted here.
 */
export function inboxRoutes(db: Db) {
  const router = Router();

  router.get("/inbox", async (req, res) => {
    assertBoard(req);
    const companyId = readCompanyId(req.query.companyId);
    assertCompanyAccess(req, companyId);
    const limit = readLimit(req.query.limit);

    const [pendingApprovals, failures, mentionedBy] = await Promise.all([
      db
        .select({
          id: approvals.id,
          title: approvals.type,
          type: approvals.type,
          status: approvals.status,
          payload: approvals.payload,
          createdAt: approvals.createdAt,
        })
        .from(approvals)
        .where(and(eq(approvals.companyId, companyId), eq(approvals.status, "pending")))
        .orderBy(desc(approvals.createdAt))
        .limit(limit),
      db
        .select({
          id: issues.id,
          title: issues.title,
          status: issues.status,
          priority: issues.priority,
          updatedAt: issues.updatedAt,
        })
        .from(issues)
        .where(and(eq(issues.companyId, companyId), eq(issues.status, "blocked")))
        .orderBy(desc(issues.updatedAt))
        .limit(limit),
      db
        .select({
          id: issueComments.id,
          issueId: issueComments.issueId,
          issueTitle: issues.title,
          body: issueComments.body,
          authorName: agents.name,
          createdAt: issueComments.createdAt,
        })
        .from(issueComments)
        .innerJoin(issues, eq(issues.id, issueComments.issueId))
        .leftJoin(agents, eq(agents.id, issueComments.authorAgentId))
        .where(
          and(
            eq(issueComments.companyId, companyId),
            isNotNull(issueComments.authorAgentId),
            ilike(issueComments.body, "%@%"),
          ),
        )
        .orderBy(desc(issueComments.createdAt))
        .limit(limit),
    ]);

    res.json({
      pendingApprovals: pendingApprovals.map((row) => ({
        id: row.id,
        title:
          typeof row.payload?.title === "string" && row.payload.title
            ? row.payload.title
            : typeof row.payload?.name === "string" && row.payload.name
              ? row.payload.name
              : row.title,
        type: row.type,
        status: row.status,
        createdAt: row.createdAt,
      })),
      failures,
      mentionedBy: mentionedBy.map((row) => ({
        id: row.id,
        issueId: row.issueId,
        issueTitle: row.issueTitle,
        body: row.body,
        authorName: row.authorName ?? "员工",
        createdAt: row.createdAt,
      })),
    });
  });

  return router;
}
