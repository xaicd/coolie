import express from "express";
import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetExperimental = vi.hoisted(() => vi.fn());
const mockIssueService = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  addComment: vi.fn(),
  listComments: vi.fn(),
}));
const mockSpawn = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  instanceSettingsService: () => ({ getExperimental: mockGetExperimental }),
  issueService: () => mockIssueService,
}));

vi.mock("node:child_process", () => ({ spawn: mockSpawn }));

vi.mock("../routes/authz.js", () => ({
  getActorInfo: () => ({ actorId: "user-1", agentId: null, runId: null }),
  assertCompanyAccess: () => {},
}));

async function createApp(deploymentMode: "local_trusted" | "authenticated" = "local_trusted") {
  const { boardChatRoutes } = await import("../routes/board-chat.js");
  const app = express();
  app.use(express.json());
  app.use("/api", boardChatRoutes({} as any, { deploymentMode }));
  return app;
}

describe("POST /api/board/chat/stream feature flag guard (PAP-137)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 FEATURE_DISABLED when enableConferenceRoomChat is off", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: false });
    const app = await createApp();

    const res = await request(app)
      .post("/api/board/chat/stream")
      .send({ companyId: "company-1", message: "hello" });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: "Conference Room Chat is not enabled",
      code: "FEATURE_DISABLED",
    });
    // The guard must fire before anything is persisted.
    expect(mockIssueService.addComment).not.toHaveBeenCalled();
    expect(mockIssueService.create).not.toHaveBeenCalled();
  });

  /**
   * Coolie fork divergence, stated the other way round from upstream.
   *
   * Upstream's version of this test asserted that `authenticated` is refused.
   * This fork's board chat deliberately allows it — the deployment is
   * single-operator (one boss), and `board-chat.ts` says so at its gate. Since
   * `DEPLOYMENT_MODES` contains exactly `local_trusted` and `authenticated`, that
   * assertion cannot hold here: with both modes allowed the guard admits every
   * legal value.
   *
   * The refusal branch is still covered, one case down, because the guard's real
   * job is forward compatibility — it must not let a mode added to the union
   * later inherit board chat by default.
   */
  it("admits authenticated mode, which this fork allows", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
    const app = await createApp("authenticated");

    // Stops at validation rather than at the guard, which is what "admitted"
    // means here.
    const res = await request(app).post("/api/board/chat/stream").send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "companyId and message are required" });
  });

  it("returns 403 DEPLOYMENT_MODE_UNSUPPORTED for a mode outside the single-operator set", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
    // Not a member of `DEPLOYMENT_MODES` today. Written this way on purpose: the
    // guard is about modes that do not exist yet, so the test names one that does
    // not exist yet rather than mislabelling a real mode as refused.
    const app = await createApp("hosted" as never);

    const res = await request(app)
      .post("/api/board/chat/stream")
      .send({ companyId: "company-1", message: "hello" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("DEPLOYMENT_MODE_UNSUPPORTED");
    expect(mockIssueService.addComment).not.toHaveBeenCalled();
  });

  it("lets requests past the guard when the flag is on (400 on missing body, not 403)", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
    const app = await createApp();

    // Omit the body so the request stops at validation — proves the guard
    // admitted it without spawning the chat subprocess.
    const res = await request(app).post("/api/board/chat/stream").send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "companyId and message are required" });
  });
});

describe("board-chat client disconnect", () => {
  function makeFakeProc() {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = { write: vi.fn(), end: vi.fn() };
    proc.exitCode = null;
    proc.killed = false;
    proc.kill = vi.fn(() => {
      proc.killed = true;
    });
    return proc;
  }

  it("kills the spawned subprocess when the client disconnects mid-stream", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
    mockIssueService.list.mockResolvedValue([
      { id: "issue-1", title: "Board Operations", status: "todo" },
    ]);
    mockIssueService.addComment.mockResolvedValue({ id: "comment-1" });
    mockIssueService.listComments.mockResolvedValue([]);
    const fakeProc = makeFakeProc();
    mockSpawn.mockReturnValue(fakeProc);
    const app = await createApp();

    const req = request(app)
      .post("/api/board/chat/stream")
      .send({ companyId: "company-1", message: "hello" });
    // Start the request without awaiting the (never-ending) SSE response.
    const pending = req.then(
      () => undefined,
      () => undefined,
    );

    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
    expect(fakeProc.kill).not.toHaveBeenCalled();

    // Client walks away mid-stream.
    req.abort();
    await vi.waitFor(() => expect(fakeProc.kill).toHaveBeenCalledWith("SIGTERM"));

    // Let the subprocess close handler run so the slot is released.
    fakeProc.exitCode = 143;
    fakeProc.emit("close", 143);
    await pending;
  });
});

describe("board-chat failure surfacing", () => {
  const servers: Server[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (s) =>
          new Promise<void>((done) => {
            s.closeIdleConnections();
            s.close(() => done());
          }),
      ),
    );
  });

  function makeFakeProc() {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = { write: vi.fn(), end: vi.fn() };
    proc.exitCode = null;
    proc.killed = false;
    proc.kill = vi.fn(() => {
      proc.killed = true;
    });
    return proc;
  }

  /**
   * Start the request against a real HTTP listener and return the promise for
   * the finished SSE body. supertest buffers unknown content types and never
   * settles on `text/event-stream`, so the streaming cases go through `fetch`.
   */
  async function startChat(proc: any) {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
    mockIssueService.list.mockResolvedValue([
      { id: "issue-1", title: "Board Operations", status: "todo" },
    ]);
    mockIssueService.addComment.mockResolvedValue({ id: "comment-1" });
    mockIssueService.listComments.mockResolvedValue([]);
    mockSpawn.mockReturnValue(proc);
    const app = await createApp();

    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((done) => server.once("listening", () => done()));
    const { port } = server.address() as { port: number };

    // Await the response headers before emitting on the fake process: the route
    // flushes them before spawning, so this guarantees the `close` listener is
    // registered by the time the test drives the subprocess.
    const response = await fetch(
      `http://127.0.0.1:${port}/api/board/chat/stream`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId: "company-1", message: "ping" }),
      },
    );
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
    return { pending: response.text() };
  }

  it("emits an error event + persists a comment when hermes exits non-zero with no output", async () => {
    const proc = makeFakeProc();
    const { pending } = await startChat(proc);

    // hermes 429: the terminal error line lands on stdout (now that
    // stripCliNoise no longer swallows `API call failed`); stderr has only the
    // session id.
    proc.stdout.emit(
      "data",
      Buffer.from(
        "API call failed after 3 retries: HTTP 429: 您已达到每周/每月使用上限\n",
      ),
    );
    proc.stderr.emit("data", Buffer.from("session_id: 20260923_014402_4b299d\n"));
    proc.exitCode = 1;
    proc.emit("close", 1);

    const text = await pending;

    expect(text).toContain('"type":"error"');
    expect(text).not.toContain('"type":"done"');
    // The boss-visible reason must survive the round trip.
    expect(text).toContain("HTTP 429");

    const errorCall = mockIssueService.addComment.mock.calls.find((call: any[]) =>
      String(call[1]).includes("[hermes-error]"),
    );
    expect(errorCall).toBeTruthy();
    expect(errorCall?.[2]).toEqual({ userId: "board-concierge" });
    // No authorType override: `addComment` requires it to match the actor, so
    // forcing "system" for a userId actor throws and nothing is persisted.
    expect(errorCall?.[3]).toBeUndefined();
  });

  it("emits an error event when hermes exits 0 but answers with nothing", async () => {
    const proc = makeFakeProc();
    const { pending } = await startChat(proc);

    proc.exitCode = 0;
    proc.emit("close", 0);

    const text = await pending;

    expect(text).toContain('"type":"error"');
    expect(text).not.toContain('"type":"done"');
  });

  it("emits done and persists the reply on a successful run", async () => {
    const proc = makeFakeProc();
    const { pending } = await startChat(proc);

    proc.stdout.emit("data", Buffer.from("Hello, boss.\n"));
    proc.exitCode = 0;
    proc.emit("close", 0);

    const text = await pending;

    expect(text).toContain('"type":"done"');
    expect(text).not.toContain('"type":"error"');

    const replyCall = mockIssueService.addComment.mock.calls.find((call: any[]) =>
      String(call[1]).includes("Hello, boss."),
    );
    expect(replyCall).toBeTruthy();
    expect(replyCall?.[2]).toEqual({ userId: "board-concierge" });
  });
});

describe("board-chat history role classification", () => {
  it("treats only board-concierge comments as assistant turns", async () => {
    const { isConciergeReply } = await import("../routes/board-chat.js");

    // The relay's own persisted replies.
    expect(
      isConciergeReply({ authorAgentId: null, authorUserId: "board-concierge" }),
    ).toBe(true);

    // A human board user.
    expect(isConciergeReply({ authorAgentId: null, authorUserId: "user-1" })).toBe(
      false,
    );

    // An agent commenting on the standing issue is NOT this assistant — its
    // words must not be serialized as the assistant's own prior turns.
    expect(
      isConciergeReply({ authorAgentId: "agent-1", authorUserId: null }),
    ).toBe(false);

    // Defensive: an agent comment can never impersonate the concierge even if
    // both author fields are somehow set.
    expect(
      isConciergeReply({ authorAgentId: "agent-1", authorUserId: "board-concierge" }),
    ).toBe(false);
  });
});
