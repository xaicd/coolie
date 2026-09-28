import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

async function createApp(
  deploymentMode: "local_trusted" | "authenticated" | "hosted" = "local_trusted",
) {
  const { boardChatRoutes } = await import("../routes/board-chat.js");
  const app = express();
  app.use(express.json());
  app.use("/api", boardChatRoutes({} as any, { deploymentMode }));
  return app;
}

/**
 * wave135: the App resolves the standing Board Operations issue *before*
 * uploading a workshop attachment. These cover the endpoint contract the App
 * relies on: same flag/deployment gates as the stream, company access enforced,
 * and find-or-create semantics that always land on the same issue as the stream.
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

  it("returns the existing Board Operations issue id without creating one", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
    mockIssueService.list.mockResolvedValue([
      { id: "board-issue-1", title: "Board Operations", status: "todo" },
    ]);
    const app = await createApp();

    const res = await request(app)
      .post("/api/board/chat/issue")
      .send({ companyId: "company-1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ issueId: "board-issue-1" });
    expect(mockIssueService.create).not.toHaveBeenCalled();
  });

  it("creates the Board Operations issue for a brand-new company", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
    mockIssueService.list.mockResolvedValue([]);
    mockIssueService.create.mockResolvedValue({ id: "new-board-issue" });
    const app = await createApp();

    const res = await request(app)
      .post("/api/board/chat/issue")
      .send({ companyId: "company-1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ issueId: "new-board-issue" });
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

    expect(res.body).toEqual({ issueId: "fresh" });
    expect(mockIssueService.create).toHaveBeenCalled();
  });
});
