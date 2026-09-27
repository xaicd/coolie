import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * wave115 guards.
 *
 * Bug 2 (boss 23:33): a transient "正在连接会话助手…" status line must never be
 * persisted as a concierge bubble. The store-time guard is
 * `isBoardChatStatusLine` (used to reject a status-only reply before
 * `addComment`).
 *
 * Bug 1 + the clear semantics: 「清空对话」 must HARD-delete the conversation's
 * comment rows. The old soft delete left tombstones that the history read path
 * rendered as empty transparent bubbles.
 */

const mockGetExperimental = vi.hoisted(() =>
  vi.fn(async () => ({ enableConferenceRoomChat: true })),
);

vi.mock("../services/index.js", () => ({
  instanceSettingsService: () => ({ getExperimental: mockGetExperimental }),
  issueService: () => ({}),
}));

vi.mock("../routes/authz.js", () => ({
  getActorInfo: () => ({ actorId: "user-1", agentId: null, actorType: "user", runId: null }),
  assertCompanyAccess: () => {},
}));

describe("isBoardChatStatusLine", () => {
  it("flags the transient status lines the client shows", async () => {
    const { isBoardChatStatusLine } = await import("../routes/board-chat.js");
    expect(isBoardChatStatusLine("正在连接会话助手…")).toBe(true);
    expect(isBoardChatStatusLine("正在连接会话助手")).toBe(true);
    expect(isBoardChatStatusLine("思考中…")).toBe(true);
    expect(isBoardChatStatusLine("正在生成回复…")).toBe(true);
    expect(isBoardChatStatusLine("会话助手正在处理并调取数据…")).toBe(true);
    expect(isBoardChatStatusLine("Connecting...")).toBe(true);
    expect(isBoardChatStatusLine("Thinking...")).toBe(true);
  });

  it("passes real replies and blank strings through", async () => {
    const { isBoardChatStatusLine } = await import("../routes/board-chat.js");
    expect(isBoardChatStatusLine("我是 xrobinai 董事长助理")).toBe(false);
    expect(isBoardChatStatusLine("正在连接会话助手…之后呢")).toBe(false);
    expect(isBoardChatStatusLine("")).toBe(false);
    expect(isBoardChatStatusLine("   ")).toBe(false);
  });
});

interface MockDb {
  db: { select: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  deleteFn: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
}

function makeDb(rows: Array<{ id: string; companyId: string }>): MockDb {
  const returning = vi.fn(async () => [{ id: "c1" }, { id: "c2" }]);
  const deleteFn = vi.fn(() => ({ where: () => ({ returning }) }));
  const select = vi.fn(() => ({
    from: () => ({ where: () => Promise.resolve(rows) }),
  }));
  return { db: { select, delete: deleteFn }, deleteFn, returning };
}

async function createApp(db: unknown) {
  const { boardChatRoutes } = await import("../routes/board-chat.js");
  const app = express();
  app.use(express.json());
  app.use("/api", boardChatRoutes(db as never, { deploymentMode: "authenticated" }));
  return app;
}

describe("DELETE /api/board/chat/conversation/:id", () => {
  beforeEach(() => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
  });

  it("hard-deletes the conversation rows and reports the count", async () => {
    const { db, deleteFn } = makeDb([{ id: "issue-1", companyId: "co-1" }]);
    const app = await createApp(db);

    const res = await request(app).delete(
      "/api/board/chat/conversation/issue-1?companyId=co-1",
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deletedCount: 2 });
    // Hard delete, not a soft-delete UPDATE.
    expect(deleteFn).toHaveBeenCalledTimes(1);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("refuses an issue that belongs to another company", async () => {
    const { db, deleteFn } = makeDb([{ id: "issue-1", companyId: "co-OTHER" }]);
    const app = await createApp(db);

    const res = await request(app).delete(
      "/api/board/chat/conversation/issue-1?companyId=co-1",
    );

    expect(res.status).toBe(404);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it("does nothing while the feature flag is off", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: false });
    const { db, deleteFn } = makeDb([{ id: "issue-1", companyId: "co-1" }]);
    const app = await createApp(db);

    const res = await request(app).delete(
      "/api/board/chat/conversation/issue-1?companyId=co-1",
    );

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FEATURE_DISABLED");
    expect(deleteFn).not.toHaveBeenCalled();
  });
});
