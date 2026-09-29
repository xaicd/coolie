import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { boardConversations, issues as issuesTable } from "@paperclipai/db";

const mockGetExperimental = vi.hoisted(() => vi.fn());
const mockIssueService = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  addComment: vi.fn(),
  listComments: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  instanceSettingsService: () => ({ getExperimental: mockGetExperimental }),
  issueService: () => mockIssueService,
}));

vi.mock("../routes/authz.js", () => ({
  getActorInfo: () => ({ actorId: "user-1", actorType: "user", agentId: null, runId: null }),
  assertCompanyAccess: vi.fn(),
}));

/**
 * wave148: the board-chat issue endpoint now resolves a *conversation* first and
 * then its per-conversation issue. These tests drive the route with a small
 * table-aware fake of the drizzle client so find/insert/update chains behave.
 */
function makeFakeDb(opts: { conversations?: any[]; issues?: any[] } = {}) {
  const conversations = opts.conversations ?? [];
  const issueRows = opts.issues ?? [];
  const rowsFor = (table: unknown) =>
    table === boardConversations ? conversations : table === issuesTable ? issueRows : [];
  const select = vi.fn(() => {
    let table: unknown;
    const chain: any = {
      from: (t: unknown) => {
        table = t;
        return chain;
      },
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then: (resolve: any, reject: any) =>
        Promise.resolve(rowsFor(table)).then(resolve, reject),
    };
    return chain;
  });
  const update = vi.fn(() => {
    const chain: any = {
      set: () => chain,
      where: () => chain,
      then: (resolve: any, reject: any) => Promise.resolve([]).then(resolve, reject),
    };
    return chain;
  });
  const insert = vi.fn(() => {
    let captured: Record<string, unknown> = {};
    const chain: any = {
      values: (v: Record<string, unknown>) => {
        captured = v;
        return chain;
      },
      returning: () => chain,
      then: (resolve: any, reject: any) =>
        Promise.resolve([
          {
            id: "conv-new",
            companyId: "company-1",
            projectId: null,
            issueId: null,
            title: "Board Operations",
            createdByUserId: null,
            lastMessageAt: new Date(),
            archivedAt: null,
            createdAt: new Date(),
            ...captured,
          },
        ]).then(resolve, reject),
    };
    return chain;
  });
  return { select, update, insert } as never;
}

async function createApp(
  deploymentMode: "local_trusted" | "authenticated" | "hosted" = "local_trusted",
  db: unknown = makeFakeDb(),
) {
  const { boardChatRoutes } = await import("../routes/board-chat.js");
  const app = express();
  app.use(express.json());
  app.use("/api", boardChatRoutes(db as never, { deploymentMode }));
  return app;
}

/**
 * wave135 + wave148: the App resolves the standing issue for a conversation
 * *before* uploading a workshop attachment. These cover the endpoint contract
 * the App relies on: same flag/deployment gates as the stream, company access
 * enforced, and find-or-create semantics that always land on the conversation's
 * own issue.
 */
describe("POST /api/board/chat/issue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 FEATURE_DISABLED when Conference Room Chat is off", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: false });
    const app = await createApp();

    const res = await request(app)
      .post("/api/board/chat/issue")
      .send({ companyId: "company-1" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FEATURE_DISABLED");
    expect(mockIssueService.list).not.toHaveBeenCalled();
    expect(mockIssueService.create).not.toHaveBeenCalled();
  });

  it("returns 403 DEPLOYMENT_MODE_UNSUPPORTED outside the single-operator set", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
    const app = await createApp("hosted");

    const res = await request(app)
      .post("/api/board/chat/issue")
      .send({ companyId: "company-1" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("DEPLOYMENT_MODE_UNSUPPORTED");
  });

  it("requires companyId", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
    const app = await createApp();

    const res = await request(app).post("/api/board/chat/issue").send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "companyId is required" });
  });

  it("adopts the existing Board Operations issue into the default conversation without creating one", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
    mockIssueService.list.mockResolvedValue([
      { id: "board-issue-1", title: "Board Operations", status: "todo" },
    ]);
    // The adopted issue exists, so ensureBoardConversationIssue returns it as-is.
    const db = makeFakeDb({ issues: [{ id: "board-issue-1" }] });
    const app = await createApp("local_trusted", db);

    const res = await request(app)
      .post("/api/board/chat/issue")
      .send({ companyId: "company-1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ issueId: "board-issue-1", conversationId: "conv-new" });
    expect(mockIssueService.create).not.toHaveBeenCalled();
  });

  it("creates the conversation's issue for a brand-new company", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
    mockIssueService.list.mockResolvedValue([]);
    mockIssueService.create.mockResolvedValue({ id: "new-board-issue" });
    const app = await createApp();

    const res = await request(app)
      .post("/api/board/chat/issue")
      .send({ companyId: "company-1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ issueId: "new-board-issue", conversationId: "conv-new" });
    expect(mockIssueService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ title: "Board Operations", status: "todo" }),
    );
  });

  it("ignores a done/cancelled namesake and creates a fresh standing issue", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
    mockIssueService.list.mockResolvedValue([
      { id: "old", title: "Board Operations", status: "done" },
    ]);
    mockIssueService.create.mockResolvedValue({ id: "fresh" });
    const app = await createApp();

    const res = await request(app)
      .post("/api/board/chat/issue")
      .send({ companyId: "company-1" });

    expect(res.body).toEqual({ issueId: "fresh", conversationId: "conv-new" });
    expect(mockIssueService.create).toHaveBeenCalled();
  });
});
