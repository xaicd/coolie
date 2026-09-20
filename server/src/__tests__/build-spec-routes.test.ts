import express from "express";
import { EventEmitter } from "node:events";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The build-spec chain, from the route to the plugin boundary.
 *
 * Two things here are worth more than the rest of the file, because they are the
 * two claims the feature is built on and neither is visible from a type check:
 *
 *   1. **Nothing reaches the ontology before an approval.** The import call must
 *      not appear on the wire for a spec that has not been approved. Asserted as
 *      "the worker never saw `import-document`", not as a status code — a 409 says
 *      the handler refused, while the wire shows whether anything was attempted.
 *   2. **A rejected document leaves no trace.** A plan that cannot be validated
 *      creates no issue, no approval and no document, so there is nothing to clean
 *      up and nothing that looks approvable.
 *
 * The plugin worker is a fake object, so this also pins the in-process call shape:
 * `handleApiRequest` addressed by `routeKey`, with the actor and company the
 * request carried rather than ones the server invents.
 */

const mockIssueService = vi.hoisted(() => ({
  create: vi.fn(),
  getById: vi.fn(),
}));
const mockAgentService = vi.hoisted(() => ({ list: vi.fn() }));
const mockDocumentService = vi.hoisted(() => ({
  upsertIssueDocument: vi.fn(),
  getIssueDocumentByKey: vi.fn(),
}));
const mockApprovalService = vi.hoisted(() => ({ create: vi.fn() }));
const mockIssueApprovalService = vi.hoisted(() => ({
  listApprovalsForIssue: vi.fn(),
  linkManyForApproval: vi.fn(),
}));
const mockRegistry = vi.hoisted(() => ({ getByKey: vi.fn() }));
const mockSpawn = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({ spawn: mockSpawn }));

vi.mock("../services/index.js", () => ({
  issueService: () => mockIssueService,
  agentService: () => mockAgentService,
}));

vi.mock("../services/documents.js", () => ({
  documentService: () => mockDocumentService,
}));

vi.mock("../services/approvals.js", () => ({
  approvalService: () => mockApprovalService,
}));

vi.mock("../services/issue-approvals.js", () => ({
  issueApprovalService: () => mockIssueApprovalService,
}));

vi.mock("../services/plugin-registry.js", () => ({
  pluginRegistryService: () => mockRegistry,
}));

vi.mock("../routes/authz.js", () => ({
  getActorInfo: () => ({
    actorType: "user",
    actorId: "user-1",
    agentId: null,
    runId: null,
  }),
  assertCompanyAccess: () => {},
  assertBoard: () => {},
}));

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const BUILD_ID = "22222222-2222-4222-8222-222222222222";
const APPROVAL_ID = "33333333-3333-4333-8333-333333333333";

/** A planner answer the validator will accept. */
function plannerAnswer(overrides: { format?: string } = {}) {
  return JSON.stringify({
    specVersion: "0.1",
    document: {
      format: overrides.format ?? "paperclip.ontology/1",
      name: "电商平台",
      source: { domainSlug: "ecommerce" },
      objectTypes: [
        {
          key: "product",
          displayName: "商品",
          orderSource: "declared",
          properties: [{ name: "productId", type: "string", isIdentifier: true }],
        },
      ],
      relationTypes: [],
    },
    build: {
      steps: ["requirements", "design", "impl", "test", "release"].map((kind) => ({
        kind,
        nodeTypes: kind === "impl" ? ["product"] : [],
      })),
    },
  });
}

function makeFakeProc(stdout: string) {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: (value: string) => void; end: () => void };
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { write: vi.fn(), end: vi.fn() };
  // Emit on the next tick so the caller has attached its listeners.
  setImmediate(() => {
    proc.stdout.emit("data", Buffer.from(stdout));
    proc.emit("close", 0);
  });
  return proc;
}

/**
 * Arrange the planner's answer.
 *
 * `mockImplementation`, not `mockReturnValue`: the fake schedules its output on
 * the next tick, so the fake has to be *constructed* when `spawn` is called.
 * Building it while arranging the test fires the output into an emitter with no
 * listeners yet, and the planner then waits forever — which reads as a timeout,
 * not as a bad stub.
 */
function arrangePlannerAnswer(stdout: string) {
  mockSpawn.mockImplementation(() => makeFakeProc(stdout));
}

/** The plugin worker the routes reach through `workerManager.call`. */
function fakeWorkerManager(
  responses: Record<string, { status?: number; body?: unknown }>,
) {
  return {
    call: vi.fn(async (_pluginId: string, method: string, params: { routeKey: string }) => {
      if (method !== "handleApiRequest") throw new Error(`unexpected method ${method}`);
      const response = responses[params.routeKey];
      if (!response) throw new Error(`unexpected routeKey ${params.routeKey}`);
      return response;
    }),
  };
}

async function createApp(workerManager: unknown, deploymentMode: "local_trusted" | "authenticated" = "local_trusted") {
  const [{ buildRoutes }, { errorHandler }] = await Promise.all([
    import("../routes/build.js"),
    import("../middleware/error-handler.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    buildRoutes({} as never, {
      deploymentMode,
      pluginWorkerManager: workerManager as never,
    }),
  );
  // The routes refuse by throwing; without this the refusal surfaces as a bare
  // 500 and the status assertion would pass or fail for the wrong reason.
  app.use(errorHandler);
  return app;
}

/** The routeKeys the worker was asked to answer, in order. */
function calledRouteKeys(workerManager: { call: { mock: { calls: unknown[][] } } }): string[] {
  return workerManager.call.mock.calls.map(
    (call) => (call[2] as { routeKey: string }).routeKey,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRegistry.getByKey.mockResolvedValue({
    id: "plugin-1",
    pluginKey: "paperclipai.plugin-ontology",
    status: "ready",
  });
  mockAgentService.list.mockResolvedValue([]);
  mockIssueService.create.mockResolvedValue({
    id: BUILD_ID,
    identifier: "PAP-1",
    status: "todo",
    assigneeAgentId: null,
  });
  mockDocumentService.upsertIssueDocument.mockResolvedValue({
    document: { id: "doc-1", key: "ontology-spec", latestRevisionNumber: 1 },
  });
  mockApprovalService.create.mockResolvedValue({
    id: APPROVAL_ID,
    type: "ontology_spec",
    status: "pending",
  });
  mockIssueApprovalService.linkManyForApproval.mockResolvedValue(undefined);
});

describe("POST /api/build/spec/start", () => {
  it("refuses a prompt that is not a domain request", async () => {
    const app = await createApp(fakeWorkerManager({}));

    const res = await request(app)
      .post("/api/build/spec/start")
      .send({ companyId: COMPANY_ID, prompt: "帮我看看今天的花销" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NOT_A_DOMAIN_TRIGGER");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("plans, validates through the plugin, then parks the spec behind an approval", async () => {
    arrangePlannerAnswer(plannerAnswer());
    const workerManager = fakeWorkerManager({
      "validate-document": { status: 200, body: { problems: [], lint: [], loadable: true } },
    });
    const app = await createApp(workerManager);

    const res = await request(app)
      .post("/api/build/spec/start")
      .send({ companyId: COMPANY_ID, prompt: "建域 电商平台：商品、SKU、订单" });

    expect(res.status).toBe(201);
    expect(res.body.specId).toBe(BUILD_ID);
    expect(res.body.approvalId).toBe(APPROVAL_ID);
    expect(res.body.planSource).toBe("hermes");

    // Validated before it was kept, and only validated — the write path is a
    // separate, later, approval-gated call.
    expect(calledRouteKeys(workerManager)).toEqual(["validate-document"]);

    // The approval is what a human decides, and it is linked to the issue that
    // holds the spec.
    expect(mockApprovalService.create).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.objectContaining({ type: "ontology_spec", status: "pending" }),
    );
    expect(mockIssueApprovalService.linkManyForApproval).toHaveBeenCalledWith(
      APPROVAL_ID,
      [BUILD_ID],
      expect.anything(),
    );
  });

  it("stores the document verbatim under the ontology-spec key", async () => {
    arrangePlannerAnswer(plannerAnswer());
    const workerManager = fakeWorkerManager({
      "validate-document": { status: 200, body: { problems: [], loadable: true } },
    });
    const app = await createApp(workerManager);

    await request(app)
      .post("/api/build/spec/start")
      .send({ companyId: COMPANY_ID, prompt: "建域 电商平台" });

    const saved = mockDocumentService.upsertIssueDocument.mock.calls[0]![0] as {
      key: string;
      body: string;
    };
    expect(saved.key).toBe("ontology-spec");

    const stored = JSON.parse(saved.body);
    const product = stored.document.objectTypes.find(
      (type: { key: string }) => type.key === "product",
    );
    // The identifier flag has to survive the whole round trip, not just
    // normalization: `validateDocument` rejects an object type without one, so
    // losing it here would make every stored spec unimportable later.
    expect(product.properties[0].isIdentifier).toBe(true);
  });

  it("leaves no trace when the plugin refuses the document", async () => {
    arrangePlannerAnswer(plannerAnswer());
    const workerManager = fakeWorkerManager({
      "validate-document": {
        status: 200,
        body: {
          problems: [
            {
              severity: "error",
              code: "relation-type/target-unknown",
              subject: "HAS_SKU",
              message: "target endpoint is not an object type here",
            },
          ],
          loadable: false,
        },
      },
    });
    const app = await createApp(workerManager);

    const res = await request(app)
      .post("/api/build/spec/start")
      .send({ companyId: COMPANY_ID, prompt: "建域 电商平台" });

    expect(res.status).toBe(200);
    expect(res.body.planSource).toBe("rejected");
    expect(res.body.spec).toBeNull();
    expect(res.body.problems).toHaveLength(1);
    // Zero side effects: nothing to approve, and nothing to clean up.
    expect(mockIssueService.create).not.toHaveBeenCalled();
    expect(mockApprovalService.create).not.toHaveBeenCalled();
    expect(mockDocumentService.upsertIssueDocument).not.toHaveBeenCalled();
  });

  it("reports 503 rather than storing a spec nobody validated when the plugin is down", async () => {
    arrangePlannerAnswer(plannerAnswer());
    mockRegistry.getByKey.mockResolvedValue(null);
    const app = await createApp(fakeWorkerManager({}));

    const res = await request(app)
      .post("/api/build/spec/start")
      .send({ companyId: COMPANY_ID, prompt: "建域 电商平台" });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("ONTOLOGY_PLUGIN_UNAVAILABLE");
    expect(mockDocumentService.upsertIssueDocument).not.toHaveBeenCalled();
  });

  it("refuses a malformed planner answer instead of half-reading it", async () => {
    arrangePlannerAnswer("not json at all");
    const app = await createApp(fakeWorkerManager({}));

    const res = await request(app)
      .post("/api/build/spec/start")
      .send({ companyId: COMPANY_ID, prompt: "建域 电商平台" });

    expect(res.status).toBe(200);
    expect(res.body.planSource).toBe("rejected");
    expect(mockIssueService.create).not.toHaveBeenCalled();
  });

  it("is refused on a deployment mode that is not single-operator", async () => {
    const { buildRoutes } = await import("../routes/build.js");
    const restricted = express();
    restricted.use(express.json());
    restricted.use(
      "/api",
      buildRoutes({} as never, {
        deploymentMode: "hosted" as never,
        pluginWorkerManager: fakeWorkerManager({}) as never,
      }),
    );

    const res = await request(restricted)
      .post("/api/build/spec/start")
      .send({ companyId: COMPANY_ID, prompt: "建域 电商平台" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("DEPLOYMENT_MODE_UNSUPPORTED");
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

describe("POST /api/build/spec/:specId/instantiate", () => {
  const specBody = JSON.stringify({
    specVersion: "0.1",
    document: {
      format: "paperclip.ontology/1",
      name: "电商平台",
      source: { domainSlug: "ecommerce" },
      objectTypes: [
        {
          key: "product",
          displayName: "商品",
          orderSource: "declared",
          properties: [{ name: "productId", type: "string", isIdentifier: true }],
        },
      ],
      relationTypes: [],
    },
    build: {
      steps: ["requirements", "design", "impl", "test", "release"].map((kind) => ({
        kind,
        nodeTypes: kind === "impl" ? ["product"] : [],
      })),
    },
  });

  function arrangeStoredSpec() {
    mockIssueService.getById.mockResolvedValue({
      id: BUILD_ID,
      companyId: COMPANY_ID,
      title: "构建本体: 电商平台",
      status: "todo",
    });
    mockDocumentService.getIssueDocumentByKey.mockResolvedValue({
      id: "doc-1",
      key: "ontology-spec",
      body: specBody,
      latestRevisionNumber: 3,
    });
  }

  it("refuses to write a spec that has not been approved", async () => {
    arrangeStoredSpec();
    mockIssueApprovalService.listApprovalsForIssue.mockResolvedValue([
      { id: APPROVAL_ID, type: "ontology_spec", status: "pending" },
    ]);
    const workerManager = fakeWorkerManager({
      "import-document": { status: 201, body: { domainId: "domain-1", slug: "ecommerce" } },
    });
    const app = await createApp(workerManager);

    const res = await request(app).post(`/api/build/spec/${BUILD_ID}/instantiate`);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SPEC_NOT_APPROVED");
    // The important assertion: the wire never carried an import. A refusal that
    // had already called the plugin would be a write, not a gate.
    expect(calledRouteKeys(workerManager)).toEqual([]);
    expect(mockDocumentService.upsertIssueDocument).not.toHaveBeenCalled();
  });

  it("refuses when no approval is attached at all", async () => {
    arrangeStoredSpec();
    mockIssueApprovalService.listApprovalsForIssue.mockResolvedValue([]);
    const workerManager = fakeWorkerManager({});
    const app = await createApp(workerManager);

    const res = await request(app).post(`/api/build/spec/${BUILD_ID}/instantiate`);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SPEC_APPROVAL_MISSING");
    expect(calledRouteKeys(workerManager)).toEqual([]);
  });

  it("writes the model and creates the build chain once approved", async () => {
    arrangeStoredSpec();
    mockIssueApprovalService.listApprovalsForIssue.mockResolvedValue([
      { id: APPROVAL_ID, type: "ontology_spec", status: "approved" },
    ]);
    const workerManager = fakeWorkerManager({
      "import-document": {
        status: 201,
        body: {
          domainId: "domain-1",
          slug: "ecommerce",
          reused: false,
          created: { nodeTypes: 1, relationTypes: 0 },
        },
      },
    });
    const app = await createApp(workerManager);

    const res = await request(app).post(`/api/build/spec/${BUILD_ID}/instantiate`);

    expect(res.status).toBe(201);
    expect(res.body.domainId).toBe("domain-1");
    expect(calledRouteKeys(workerManager)).toEqual(["import-document"]);

    // One card per phase, with `impl` expanded per object type, and only the
    // first phase runnable — the rest wait on their blockers.
    const created = mockIssueService.create.mock.calls.map((call) => call[1] as {
      title: string;
      status: string;
      blockedByIssueIds?: string[];
    });
    expect(created.map((issue) => issue.title)).toEqual([
      "需求梳理",
      "方案设计",
      "实现对象类型 product",
      "测试验收",
      "发布上线",
    ]);
    expect(created[0]!.status).toBe("todo");
    expect(created.slice(1).every((issue) => issue.status === "blocked")).toBe(true);
    expect(created[1]!.blockedByIssueIds).toEqual([BUILD_ID]);

    // Where the domain went, recorded next to the spec.
    const resultDoc = mockDocumentService.upsertIssueDocument.mock.calls[0]![0] as {
      key: string;
      body: string;
    };
    expect(resultDoc.key).toBe("ontology-spec-result");
    expect(JSON.parse(resultDoc.body).domainId).toBe("domain-1");
  });

  it("stays idempotent: a reused domain still yields exactly one chain", async () => {
    arrangeStoredSpec();
    mockIssueApprovalService.listApprovalsForIssue.mockResolvedValue([
      { id: APPROVAL_ID, type: "ontology_spec", status: "approved" },
    ]);
    // A stateful plugin: the first import creates the domain, the second finds
    // it. That is the behaviour being pinned — the route must report what the
    // plugin decided rather than inventing a second domain id.
    let imported = false;
    const workerManager = {
      call: vi.fn(async (_pluginId: string, method: string, params: { routeKey: string }) => {
        expect(method).toBe("handleApiRequest");
        expect(params.routeKey).toBe("import-document");
        const reused = imported;
        imported = true;
        return {
          status: reused ? 200 : 201,
          body: {
            domainId: "domain-1",
            slug: "ecommerce",
            reused,
            created: reused
              ? { nodeTypes: 0, relationTypes: 0 }
              : { nodeTypes: 1, relationTypes: 0 },
          },
        };
      }),
    };
    const app = await createApp(workerManager);

    const first = await request(app).post(`/api/build/spec/${BUILD_ID}/instantiate`);
    const second = await request(app).post(`/api/build/spec/${BUILD_ID}/instantiate`);

    expect(first.body.reused).toBe(false);
    expect(second.body.reused).toBe(true);
    expect(second.body.domainId).toBe(first.body.domainId);
  });
});
