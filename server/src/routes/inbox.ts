import { Router } from "express";
import { and, desc, eq, ilike, isNotNull, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, approvals, heartbeatRuns, issueComments, issues, joinRequests } from "@paperclipai/db";
import { badRequest } from "../errors.js";
import { assertBoardOrAgent, assertCompanyAccess } from "./authz.js";

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
 * The mobile inbox: one company-scoped feed of the things a user
 * opens the app to act on — approvals waiting on a decision, tasks that have
 * stalled (`blocked`), failed runs needing retry, join requests, and agent mentions.
 */
export function inboxRoutes(db: Db) {
  const router = Router();

  router.get("/inbox", async (req, res) => {
    assertBoardOrAgent(req);
    const companyId = readCompanyId(req.query.companyId);
    assertCompanyAccess(req, companyId);
    const limit = readLimit(req.query.limit);

    const [pendingApprovals, failures, mentionedBy, pendingJoinRequests, failedHeartbeatRuns] = await Promise.all([
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
      db
        .select({
          id: joinRequests.id,
          companyId: joinRequests.companyId,
          requestType: joinRequests.requestType,
          status: joinRequests.status,
          requestIp: joinRequests.requestIp,
          requestingUserId: joinRequests.requestingUserId,
          requestEmailSnapshot: joinRequests.requestEmailSnapshot,
          agentName: joinRequests.agentName,
          adapterType: joinRequests.adapterType,
          createdAt: joinRequests.createdAt,
          updatedAt: joinRequests.updatedAt,
        })
        .from(joinRequests)
        .where(and(eq(joinRequests.companyId, companyId), eq(joinRequests.status, "pending_approval")))
        .orderBy(desc(joinRequests.createdAt))
        .limit(limit),
      db
        .select({
          id: heartbeatRuns.id,
          agentId: heartbeatRuns.agentId,
          agentName: agents.name,
          companyId: heartbeatRuns.companyId,
          status: heartbeatRuns.status,
          error: heartbeatRuns.error,
          contextSnapshot: heartbeatRuns.contextSnapshot,
          createdAt: heartbeatRuns.createdAt,
          updatedAt: heartbeatRuns.updatedAt,
        })
        .from(heartbeatRuns)
        .leftJoin(agents, eq(agents.id, heartbeatRuns.agentId))
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            or(eq(heartbeatRuns.status, "failed"), eq(heartbeatRuns.status, "timed_out")),
          ),
        )
        .orderBy(desc(heartbeatRuns.createdAt))
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
      joinRequests: pendingJoinRequests.map((row) => ({
        id: row.id,
        companyId: row.companyId,
        requestType: row.requestType,
        status: row.status,
        requestIp: row.requestIp,
        requestingUserId: row.requestingUserId,
        requestEmailSnapshot: row.requestEmailSnapshot,
        agentName: row.agentName,
        adapterType: row.adapterType,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      failedRuns: failedHeartbeatRuns.map((row) => {
        const snapshot = (row.contextSnapshot ?? {}) as Record<string, unknown>;
        const issueId =
          typeof snapshot.issueId === "string"
            ? snapshot.issueId
            : typeof snapshot.taskId === "string"
              ? snapshot.taskId
              : null;
        return {
          id: row.id,
          agentId: row.agentId,
          agentName: row.agentName ?? "员工",
          companyId: row.companyId,
          status: row.status,
          error: row.error,
          issueId,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt?.toISOString() ?? row.createdAt.toISOString(),
        };
      }),
    });
  });

  return router;
}
