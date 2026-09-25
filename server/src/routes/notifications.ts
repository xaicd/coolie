import { Router } from "express";
import { and, desc, eq, ilike, isNotNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { activityLog, agents, approvals, issueComments, issues } from "@paperclipai/db";
import { badRequest } from "../errors.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type NotificationType = "approval" | "failure" | "mention" | "activity";

type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** Where tapping the row should navigate. */
  target: { kind: "issue" | "approval"; id: string } | null;
  createdAt: string;
};

/**
 * Read state for a derived feed.
 *
 * Notifications are computed from existing rows (approvals, blocked issues,
 * mentions, activity) rather than stored, so there is no table to hold a `read`
 * flag. A per-process set is enough for the mobile badge: it resets on restart,
 * which at worst re-shows a badge, and it never blocks a decision. A durable
 * table is deliberately out of scope for this wave.
 */
const readState = new Map<string, Set<string>>();

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

function readSetFor(userId: string): Set<string> {
  const existing = readState.get(userId);
  if (existing) return existing;
  const created = new Set<string>();
  readState.set(userId, created);
  return created;
}

function approvalTitle(payload: Record<string, unknown> | null, fallback: string): string {
  if (payload && typeof payload.title === "string" && payload.title) return payload.title;
  if (payload && typeof payload.name === "string" && payload.name) return payload.name;
  return fallback;
}

async function buildFeed(db: Db, companyId: string, limit: number): Promise<NotificationItem[]> {
  const [pending, failures, mentions, activity] = await Promise.all([
    db
      .select({
        id: approvals.id,
        type: approvals.type,
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
        id: activityLog.id,
        action: activityLog.action,
        entityType: activityLog.entityType,
        entityId: activityLog.entityId,
        actorType: activityLog.actorType,
        details: activityLog.details,
        createdAt: activityLog.createdAt,
      })
      .from(activityLog)
      .where(eq(activityLog.companyId, companyId))
      .orderBy(desc(activityLog.createdAt))
      .limit(limit),
  ]);

  const items: NotificationItem[] = [
    ...pending.map((row) => ({
      id: `approval:${row.id}`,
      type: "approval" as const,
      title: `待审批：${approvalTitle(row.payload, row.type)}`,
      body: row.type,
      target: { kind: "approval" as const, id: row.id },
      createdAt: row.createdAt.toISOString(),
    })),
    ...failures.map((row) => ({
      id: `failure:${row.id}`,
      type: "failure" as const,
      title: `任务受阻：${row.title}`,
      body: "该任务已标记为受阻，等待人工介入。",
      target: { kind: "issue" as const, id: row.id },
      createdAt: row.updatedAt.toISOString(),
    })),
    ...mentions.map((row) => ({
      id: `mention:${row.id}`,
      type: "mention" as const,
      title: `${row.authorName ?? "员工"} 在「${row.issueTitle}」提到了你`,
      body: row.body,
      target: { kind: "issue" as const, id: row.issueId },
      createdAt: row.createdAt.toISOString(),
    })),
    ...activity.map((row) => {
      const isIssue = row.entityType === "issue";
      const isApproval = row.entityType === "approval";
      let title: string;
      let body: string | null = null;
      const d = row.details as Record<string, unknown> | null;
      const issueTitle = (d?.title as string) || (d?.name as string) || null;
      const issueIdent = (d?.identifier as string) || null;

      if (row.action === "issue.created") {
        title = `Hermes 派工通知：已安排「${issueTitle ?? "新任务"}」`;
        body = issueIdent ? `工号 ${issueIdent} 已立项，正在由责任人推进` : "任务已立项并分配责任人";
      } else if (row.action === "issue.assigned") {
        title = `Hermes 派工通知：${issueTitle ? `「${issueTitle}」已分配` : "任务责任人已安排"}`;
        body = issueIdent ? `工号 ${issueIdent} 责任人已明确` : "任务责任人已变更";
      } else if (row.action === "issue.updated") {
        title = `任务动态：${issueTitle ?? "工单更新"}`;
        body = typeof d?.status === "string" ? `状态更新为：${d.status}` : (issueIdent ? `工号 ${issueIdent} 有新进展` : "任务已有最新进展");
      } else {
        title = `${row.actorType === "agent" ? "员工" : "系统"}：${row.action}`;
        body = `${row.entityType} · ${row.entityId}`;
      }

      const target = isIssue
        ? ({ kind: "issue" as const, id: row.entityId })
        : isApproval
        ? ({ kind: "approval" as const, id: row.entityId })
        : null;

      return {
        id: `activity:${row.id}`,
        type: "activity" as const,
        title,
        body,
        target,
        createdAt: row.createdAt.toISOString(),
      };
    }),
  ];

  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return items.slice(0, limit);
}

/**
 * Notification center feed. Derived from the same rows the inbox reads plus the
 * company activity log, so the bell badge reflects real, recent events without
 * a dedicated notifications table.
 */
export function notificationRoutes(db: Db) {
  const router = Router();

  router.get("/notifications", async (req, res) => {
    assertBoard(req);
    const companyId = readCompanyId(req.query.companyId);
    assertCompanyAccess(req, companyId);
    const limit = readLimit(req.query.limit);

    const items = await buildFeed(db, companyId, limit);
    const read = req.actor.userId ? readSetFor(req.actor.userId) : new Set<string>();
    const notifications = items.map((item) => ({ ...item, read: read.has(item.id) }));

    res.json({
      notifications,
      unreadCount: notifications.filter((item) => !item.read).length,
    });
  });

  router.patch("/notifications/:id/read", async (req, res) => {
    assertBoard(req);
    const companyId = readCompanyId(req.query.companyId);
    assertCompanyAccess(req, companyId);
    const id = req.params.id as string;
    if (req.actor.userId) readSetFor(req.actor.userId).add(id);
    res.json({ id, read: true });
  });

  return router;
}
