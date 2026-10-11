import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { activityLog, agents, approvals, companies, heartbeatRuns, inboxDismissals, issues } from "@paperclipai/db";
import { notificationRoutes } from "../routes/notifications.js";
import { inboxDismissalService } from "../services/inbox-dismissals.js";
import {
  resetCompanyIssueFixtures,
  routeApp,
  seedCompanyWithBoardAccess,
  useEmbeddedPostgres,
} from "./helpers/route-test-harness.js";

const ctx = useEmbeddedPostgres("paperclip-notifications-routes-", {
  resetEach: async (db) => {
    await db.delete(inboxDismissals);
    await db.delete(activityLog);
    await db.delete(approvals);
    await db.delete(heartbeatRuns);
    await db.delete(agents);
    await resetCompanyIssueFixtures(db);
  },
});

/**
 * wave369 "精准数据" bell contract:
 *   - 点开一个 = 铃铛少一个 (single PATCH persists read state, unreadCount -1)
 *   - 重复点开不算 (idempotent; no duplicate dismissal rows, no extra API churn)
 *   - 长按清空 = 全部归零且持久化 (read-all must persist keys the GET lookup matches)
 *
 * The notifications feed is derived, so read state lives in the inbox dismissal
 * table keyed by raw row UUID while feed ids are prefixed (`approval:<uuid>`).
 * The GET lookup compares against the raw UUID, so every write path must persist
 * the raw UUID — otherwise a cleared bell resurrects on the next server process.
 */
describe("notification routes (wave369 bell)", () => {
  it("marks one notification read: unreadCount drops by one (精准数据)", async () => {
    const { companyId, userId, actor } = await seedCompanyWithBoardAccess(ctx.db, "BellSingle");
    const approvalId = randomUUID();
    await ctx.db.insert(approvals).values({
      id: approvalId,
      companyId,
      type: "hire_agent",
      status: "pending",
      payload: { title: "新员工入职" },
      createdAt: new Date("2026-10-11T01:00:00.000Z"),
      updatedAt: new Date("2026-10-11T01:00:00.000Z"),
    });

    const app = routeApp(ctx.db, actor, notificationRoutes);
    const feedId = `approval:${approvalId}`;

    const before = await request(app)
      .get(`/api/notifications?companyId=${companyId}`)
      .expect(200);
    expect(before.body.unreadCount).toBe(1);
    expect(before.body.notifications).toHaveLength(1);
    expect(before.body.notifications[0]).toMatchObject({ id: feedId, read: false });

    await request(app)
      .patch(`/api/notifications/${encodeURIComponent(feedId)}/read?companyId=${companyId}`)
      .expect(200)
      .expect((res) =>
        expect(res.body).toEqual({ id: feedId, read: true, unreadCount: 0 }),
      );

    const after = await request(app)
      .get(`/api/notifications?companyId=${companyId}`)
      .expect(200);
    expect(after.body.unreadCount).toBe(0);
    expect(after.body.notifications[0]).toMatchObject({ id: feedId, read: true });

    // Persisted under the raw UUID so the GET lookup (which compares raw UUIDs)
    // matches on a fresh process, not only via the in-memory read set.
    const dismissals = await inboxDismissalService(ctx.db).list(companyId, userId);
    expect(dismissals.map((d) => d.itemKey)).toEqual([approvalId]);
  });

  it("treats a repeated read as a no-op (重复点开不算)", async () => {
    const { companyId, userId, actor } = await seedCompanyWithBoardAccess(ctx.db, "BellIdempotent");
    const approvalId = randomUUID();
    await ctx.db.insert(approvals).values({
      id: approvalId,
      companyId,
      type: "hire_agent",
      status: "pending",
      payload: {},
      createdAt: new Date("2026-10-11T01:00:00.000Z"),
      updatedAt: new Date("2026-10-11T01:00:00.000Z"),
    });

    const app = routeApp(ctx.db, actor, notificationRoutes);
    const feedId = `approval:${approvalId}`;

    await request(app)
      .patch(`/api/notifications/${encodeURIComponent(feedId)}/read?companyId=${companyId}`)
      .expect(200);
    await request(app)
      .patch(`/api/notifications/${encodeURIComponent(feedId)}/read?companyId=${companyId}`)
      .expect(200);

    const dismissals = await inboxDismissalService(ctx.db).list(companyId, userId);
    expect(dismissals).toHaveLength(1);
    expect(dismissals[0]?.itemKey).toBe(approvalId);

    const after = await request(app)
      .get(`/api/notifications?companyId=${companyId}`)
      .expect(200);
    expect(after.body.unreadCount).toBe(0);
  });

  it("clears every notification and persists raw keys (长按清空)", async () => {
    const { companyId, userId, actor } = await seedCompanyWithBoardAccess(ctx.db, "BellClearAll");
    const approvalIds = [randomUUID(), randomUUID()];
    await ctx.db.insert(approvals).values(
      approvalIds.map((id, index) => ({
        id,
        companyId,
        type: "hire_agent",
        status: "pending",
        payload: { title: `审批 ${index}` },
        createdAt: new Date(`2026-10-11T0${index + 1}:00:00.000Z`),
        updatedAt: new Date(`2026-10-11T0${index + 1}:00:00.000Z`),
      })),
    );

    const app = routeApp(ctx.db, actor, notificationRoutes);

    const before = await request(app)
      .get(`/api/notifications?companyId=${companyId}`)
      .expect(200);
    expect(before.body.unreadCount).toBe(2);

    await request(app)
      .post(`/api/notifications/read-all?companyId=${companyId}`)
      .expect(200)
      .expect((res) => expect(res.body).toEqual({ success: true, unreadCount: 0 }));

    const after = await request(app)
      .get(`/api/notifications?companyId=${companyId}`)
      .expect(200);
    expect(after.body.unreadCount).toBe(0);
    expect(after.body.notifications.every((n: { read: boolean }) => n.read)).toBe(true);

    // Every persisted dismissal must be the raw UUID the GET lookup compares
    // against, so the cleared bell survives a server restart.
    const dismissals = await inboxDismissalService(ctx.db).list(companyId, userId);
    expect(dismissals.map((d) => d.itemKey).sort()).toEqual([...approvalIds].sort());
  });

  it("surfaces failed runs in the bell feed (铃铛显示失败运行)", async () => {
    const { companyId, actor } = await seedCompanyWithBoardAccess(ctx.db, "BellFailedRun");
    const runId = randomUUID();
    const agentId = randomUUID();
    const issueId = randomUUID();
    await ctx.db.insert(agents).values({ id: agentId, companyId, name: "铁匠贰号" });
    await ctx.db.insert(heartbeatRuns).values({
      id: runId,
      companyId,
      agentId,
      status: "failed",
      error: "boomed",
      contextSnapshot: { issueId },
      createdAt: new Date("2026-10-11T02:00:00.000Z"),
      updatedAt: new Date("2026-10-11T02:00:00.000Z"),
    });

    const app = routeApp(ctx.db, actor, notificationRoutes);
    const res = await request(app).get(`/api/notifications?companyId=${companyId}`).expect(200);

    expect(res.body.unreadCount).toBe(1);
    expect(res.body.notifications[0]).toMatchObject({
      id: `failure:${runId}`,
      type: "failure",
      read: false,
      target: { kind: "issue", id: issueId },
    });
  });
});
