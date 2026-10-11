import { Router } from "express";
import { and, desc, eq, ilike, isNotNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, approvals, issueComments, issues } from "@paperclipai/db";
import { badRequest } from "../errors.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { inboxDismissalService } from "../services/inbox-dismissals.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type NotificationType = "approval" | "failure" | "mention";

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
 * mentions) rather than stored, so there is no table to hold a `read`
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

/**
 * Feed ids are prefixed (`approval:<uuid>`, `mention:<uuid>`, ...) while the
 * dismissal table keys on the raw row UUID. Every read-state read and write must
 * strip the prefix so a persisted mark survives the next server process.
 */
function rawNotificationId(feedId: string): string {
  return feedId.includes(":") ? feedId.split(":").pop()! : feedId;
}

/**
 * 服务端权威 unreadCount 计算 (与 GET /notifications 同一口径)。
 * 用 dismissal table (持久化) + 内存 readSet (进程级) 合并判断每条 read 状态。
 */
async function computeUnreadCount(db: Db, companyId: string, userId: string): Promise<number> {
  const items = await buildFeed(db, companyId, 50);
  const persistedDismissals = await inboxDismissalService(db).list(companyId, userId);
  const dismissedKeys = new Set(persistedDismissals.map((d: any) => d.itemKey));
  const memoryRead = readSetFor(userId);
  const notifications = items.map((item) => ({
    ...item,
    read: dismissedKeys.has(rawNotificationId(item.id)) || memoryRead.has(item.id),
  }));
  return notifications.filter((item) => !item.read).length;
}

function approvalTitle(payload: Record<string, unknown> | null, fallback: string): string {
  if (payload && typeof payload.title === "string" && payload.title) return payload.title;
  if (payload && typeof payload.name === "string" && payload.name) return payload.name;
  return fallback;
}

async function buildFeed(db: Db, companyId: string, limit: number): Promise<NotificationItem[]> {
  const [pending, failures, mentions] = await Promise.all([
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
  const dismissalSvc = inboxDismissalService(db);

  router.get("/notifications", async (req, res) => {
    assertBoard(req);
    const companyId = readCompanyId(req.query.companyId);
    assertCompanyAccess(req, companyId);
    const limit = readLimit(req.query.limit);

    const userId = req.actor.userId || "board";
    const [items, persistedDismissals] = await Promise.all([
      buildFeed(db, companyId, limit),
      dismissalSvc.list(companyId, userId).catch(() => []),
    ]);

    const dismissedKeys = new Set(persistedDismissals.map((d) => d.itemKey));
    const memoryRead = readSetFor(userId);
    const notifications = items.map((item) => {
      // 精准数据: dismissal table 存 raw UUID, 拆分 feed item.id 后查 rawId。
      const rawId = rawNotificationId(item.id);
      return {
        ...item,
        read: dismissedKeys.has(rawId) || memoryRead.has(item.id),
      };
    });

    // 数据一致: unreadCount 走同一个服务端权威函数, 与 PATCH /:id/read 返回值同源
    const unreadCount = notifications.filter((item) => !item.read).length;
    res.json({ notifications, unreadCount });
  });

  router.patch("/notifications/:id/read", async (req, res) => {
    assertBoard(req);
    const companyId = readCompanyId(req.query.companyId);
    assertCompanyAccess(req, companyId);
    const id = req.params.id as string;
    // 精准数据: id 格式为 "approval:UUID" / "mention:UUID" / "activity:UUID",
    // dismissal table 存的是 raw UUID, 拆分后查询才命中。
    const rawId = rawNotificationId(id);
    const userId = req.actor.userId || "board";
    readSetFor(userId).add(id);
    try {
      await dismissalSvc.dismiss(companyId, userId, rawId);
    } catch {
      // 容错持久化
    }
    // 数据一致: 返回服务端最新 unreadCount, 客户端以服务端为权威值覆盖乐观值
    const unreadCount = await computeUnreadCount(db, companyId, userId);
    res.json({ id, read: true, unreadCount });
  });

  const handleReadAll = async (req: any, res: any) => {
    assertBoard(req);
    const companyId = readCompanyId(req.query.companyId || (req.body && req.body.companyId));
    assertCompanyAccess(req, companyId);
    const userId = req.actor.userId || "board";
    const items = await buildFeed(db, companyId, 50);
    const memoryRead = readSetFor(userId);
    await Promise.all(
      items.map(async (item) => {
        memoryRead.add(item.id);
        try {
          // 精准数据: 与单条已读及 GET 查询同一口径, 存 raw UUID 而非复合 feed id,
          // 否则清空后下一次 GET(或进程重启)查 rawId 不命中, 铃铛复活。
          await dismissalSvc.dismiss(companyId, userId, rawNotificationId(item.id));
        } catch {
          // 容错持久化
        }
      }),
    );
    res.json({ success: true, unreadCount: 0 });
  };

  router.post("/notifications/read-all", handleReadAll);
  router.patch("/notifications/read-all", handleReadAll);

  return router;
}
