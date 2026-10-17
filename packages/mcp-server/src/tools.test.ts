import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaperclipApiClient } from "./client.js";
import { createToolDefinitions } from "./tools.js";

// The upload tools read the file from disk; the tests only need a determinate
// buffer, so the read is stubbed rather than a real temp file being created.
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => Buffer.from("requirement document body")),
}));

const COMPANY_A = "11111111-1111-1111-1111-111111111111";
const COMPANY_B = "99999999-9999-4999-8999-999999999999";

function makeClient(companyId: string = COMPANY_A) {
  return new PaperclipApiClient({
    apiUrl: "http://localhost:3100/api",
    apiKey: "token-123",
    tokenType: "agent",
    companyId,
    agentId: "22222222-2222-2222-2222-222222222222",
    runId: "33333333-3333-3333-3333-333333333333",
  });
}

function getTool(name: string) {
  const tool = createToolDefinitions(makeClient()).find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  return tool;
}

function getToolFor(name: string, client: PaperclipApiClient) {
  const tool = createToolDefinitions(client).find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  return tool;
}

function mockJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("paperclip MCP tools", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("adds auth headers and run id to mutating requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ ok: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = getTool("paperclipUpdateIssue");
    await tool.execute({
      issueId: "PAP-1135",
      status: "done",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/PAP-1135");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer token-123");
    expect((init.headers as Record<string, string>)["X-Paperclip-Run-Id"]).toBe(
      "33333333-3333-3333-3333-333333333333",
    );
  });

  it("lists the company skill library with the default company id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse([{ key: "paperclipai/bundled/product/wireframe", name: "wireframe" }]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = getTool("paperclipListSkills");
    const response = await tool.execute({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(String(url)).toBe(
      "http://localhost:3100/api/companies/11111111-1111-1111-1111-111111111111/skills",
    );
    expect(response.content[0]?.text).toContain("wireframe");
  });

  it("uses default company id for company-scoped list tools", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse([{ id: "issue-1" }]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = getTool("paperclipListIssues");
    const response = await tool.execute({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(String(url)).toBe(
      "http://localhost:3100/api/companies/11111111-1111-1111-1111-111111111111/issues",
    );
    expect(response.content[0]?.text).toContain("issue-1");
  });

  it("uses default agent id for checkout requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ id: "PAP-1135", status: "in_progress" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = getTool("paperclipCheckoutIssue");
    await tool.execute({
      issueId: "PAP-1135",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      agentId: "22222222-2222-2222-2222-222222222222",
      expectedStatuses: ["todo", "backlog", "blocked"],
    });
  });

  it("allows create issue requests to omit status so the API applies assignee defaults", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ id: "issue-1", status: "todo" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = getTool("paperclipCreateIssue");
    await tool.execute({
      title: "Assigned follow-up",
      assigneeAgentId: "22222222-2222-2222-2222-222222222222",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(
      "http://localhost:3100/api/companies/11111111-1111-1111-1111-111111111111/issues",
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      title: "Assigned follow-up",
      workMode: "standard",
      priority: "medium",
      assigneeAgentId: "22222222-2222-2222-2222-222222222222",
      requestDepth: 0,
      allowDuplicate: false,
    });
  });

  it("defaults issue document format to markdown", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ key: "plan", latestRevisionNumber: 2 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = getTool("paperclipUpsertIssueDocument");
    await tool.execute({
      issueId: "PAP-1135",
      key: "plan",
      body: "# Updated",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      format: "markdown",
      body: "# Updated",
    });
  });

  it("controls issue workspace services through the current execution workspace", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({
        currentExecutionWorkspace: {
          id: "44444444-4444-4444-8444-444444444444",
          runtimeServices: [],
        },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        operation: { id: "operation-1" },
        workspace: {
          id: "44444444-4444-4444-8444-444444444444",
          runtimeServices: [
            {
              id: "55555555-5555-4555-8555-555555555555",
              serviceName: "web",
              status: "running",
              url: "http://127.0.0.1:5173",
            },
          ],
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const tool = getTool("paperclipControlIssueWorkspaceServices");
    await tool.execute({
      issueId: "PAP-1135",
      action: "restart",
      workspaceCommandId: "web",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [lookupUrl, lookupInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(lookupUrl)).toBe("http://localhost:3100/api/issues/PAP-1135/heartbeat-context");
    expect(lookupInit.method).toBe("GET");

    const [controlUrl, controlInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(String(controlUrl)).toBe(
      "http://localhost:3100/api/execution-workspaces/44444444-4444-4444-8444-444444444444/runtime-services/restart",
    );
    expect(controlInit.method).toBe("POST");
    expect(JSON.parse(String(controlInit.body))).toEqual({
      workspaceCommandId: "web",
    });
  });

  it("waits for an issue workspace runtime service URL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({
        currentExecutionWorkspace: {
          id: "44444444-4444-4444-8444-444444444444",
          runtimeServices: [
            {
              id: "55555555-5555-4555-8555-555555555555",
              serviceName: "web",
              status: "running",
              healthStatus: "healthy",
              url: "http://127.0.0.1:5173",
            },
          ],
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const tool = getTool("paperclipWaitForIssueWorkspaceService");
    const response = await tool.execute({
      issueId: "PAP-1135",
      serviceName: "web",
      timeoutSeconds: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.content[0]?.text).toContain("http://127.0.0.1:5173");
  });

  it("creates suggest_tasks interactions with the expected issue-scoped payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ id: "interaction-1", kind: "suggest_tasks" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = getTool("paperclipSuggestTasks");
    await tool.execute({
      issueId: "PAP-1135",
      idempotencyKey: "run-1:suggest",
      payload: {
        version: 1,
        tasks: [{ clientKey: "task-1", title: "One" }],
      },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/PAP-1135/interactions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      kind: "suggest_tasks",
      continuationPolicy: "wake_assignee",
      idempotencyKey: "run-1:suggest",
      payload: {
        version: 1,
        tasks: [{ clientKey: "task-1", title: "One" }],
      },
    });
  });

  it("creates request_confirmation interactions with plan target payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ id: "interaction-1", kind: "request_confirmation" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = getTool("paperclipRequestConfirmation");
    await tool.execute({
      issueId: "PAP-1135",
      idempotencyKey: "confirmation:PAP-1135:plan:33333333-3333-4333-8333-333333333333",
      title: "Plan approval",
      payload: {
        version: 1,
        prompt: "Accept this plan?",
        acceptLabel: "Accept plan",
        allowDeclineReason: true,
        rejectLabel: "Request changes",
        rejectRequiresReason: true,
        supersedeOnUserComment: true,
        target: {
          type: "issue_document",
          key: "plan",
          revisionId: "33333333-3333-4333-8333-333333333333",
          revisionNumber: 3,
        },
      },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/PAP-1135/interactions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      kind: "request_confirmation",
      continuationPolicy: "none",
      idempotencyKey: "confirmation:PAP-1135:plan:33333333-3333-4333-8333-333333333333",
      title: "Plan approval",
      payload: {
        version: 1,
        prompt: "Accept this plan?",
        acceptLabel: "Accept plan",
        allowDeclineReason: true,
        rejectLabel: "Request changes",
        rejectRequiresReason: true,
        supersedeOnUserComment: true,
        target: {
          type: "issue_document",
          key: "plan",
          revisionId: "33333333-3333-4333-8333-333333333333",
          revisionNumber: 3,
        },
      },
    });
  });

  it("creates request_checkbox_confirmation interactions with checkbox payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ id: "interaction-1", kind: "request_checkbox_confirmation" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = getTool("paperclipRequestCheckboxConfirmation");
    await tool.execute({
      issueId: "PAP-1135",
      idempotencyKey: "confirmation:PAP-1135:files",
      title: "Choose files",
      payload: {
        version: 1,
        prompt: "Which files should be included?",
        detailsMarkdown: "Pick the files to attach.",
        options: [
          { id: "file-a", label: "File A", description: "Primary draft" },
          { id: "file-b", label: "File B" },
        ],
        defaultSelectedOptionIds: ["file-a"],
        minSelected: 1,
        maxSelected: 2,
        acceptLabel: "Use selected files",
        rejectLabel: "Do not attach files",
        rejectRequiresReason: true,
        allowDeclineReason: false,
      },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/PAP-1135/interactions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      kind: "request_checkbox_confirmation",
      continuationPolicy: "wake_assignee",
      idempotencyKey: "confirmation:PAP-1135:files",
      title: "Choose files",
      payload: {
        version: 1,
        prompt: "Which files should be included?",
        detailsMarkdown: "Pick the files to attach.",
        options: [
          { id: "file-a", label: "File A", description: "Primary draft" },
          { id: "file-b", label: "File B" },
        ],
        defaultSelectedOptionIds: ["file-a"],
        minSelected: 1,
        maxSelected: 2,
        acceptLabel: "Use selected files",
        rejectLabel: "Do not attach files",
        rejectRequiresReason: true,
        allowDeclineReason: false,
      },
    });
  });

  it("creates approvals with the expected company-scoped payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ id: "approval-1" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = getTool("paperclipCreateApproval");
    await tool.execute({
      type: "hire_agent",
      payload: { branch: "pap-1167" },
      issueIds: ["44444444-4444-4444-4444-444444444444"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(
      "http://localhost:3100/api/companies/11111111-1111-1111-1111-111111111111/approvals",
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      type: "hire_agent",
      payload: { branch: "pap-1167" },
      issueIds: ["44444444-4444-4444-4444-444444444444"],
    });
  });

  it("rejects invalid generic request paths", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const tool = getTool("paperclipApiRequest");
    const response = await tool.execute({
      method: "GET",
      path: "issues",
    });

    expect(response.content[0]?.text).toContain("path must start with /");
  });

  it("fetches company dashboard using default company id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ agentsCount: 6, openTasksCount: 12 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = getTool("paperclipGetCompanyDashboard");
    await tool.execute({});

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(
      "http://localhost:3100/api/companies/11111111-1111-1111-1111-111111111111/dashboard",
    );
    expect(init.method).toBe("GET");
  });

  it("creates project with name and description", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ id: "project-1", name: "GuoXin ChanRong" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = getTool("paperclipCreateProject");
    await tool.execute({
      name: "GuoXin ChanRong",
      description: "Supply chain agent integration",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(
      "http://localhost:3100/api/companies/11111111-1111-1111-1111-111111111111/projects",
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      name: "GuoXin ChanRong",
      description: "Supply chain agent integration",
    });
  });

  it("dispatches task to FDA role by finding matching agent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse([
          { id: "agent-fda-123", name: "fda-agent", role: "Forward Deployed Architect" },
          { id: "agent-fdse-456", name: "fdse-agent", role: "Forward Deployed Software Engineer" },
        ]),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({ id: "issue-999", title: "Design Multi-tenant Isolation" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const tool = getTool("paperclipDispatchTaskToRole");
    await tool.execute({
      role: "fda",
      title: "Design Multi-tenant Isolation",
      cmmiPhase: "architecture",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [issueUrl, issueInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(String(issueUrl)).toBe(
      "http://localhost:3100/api/companies/11111111-1111-1111-1111-111111111111/issues",
    );
    expect(JSON.parse(String(issueInit.body))).toMatchObject({
      title: "Design Multi-tenant Isolation",
      assigneeAgentId: "agent-fda-123",
    });
    expect(JSON.parse(String(issueInit.body)).description).toContain("[CMMI 阶段要求: ARCHITECTURE]");
  });

  it("records boss decision to issue decision-log document", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse({ content: "### 决策: 初始架构\n- 仅用6个员工" }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({ key: "decision-log", version: 2 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const tool = getTool("paperclipRecordBossDecision");
    await tool.execute({
      issueId: "issue-abc-123",
      topic: "Hermes总控与DSH定位",
      decision: "Hermes直面微信QQ总控，DSH做后台算力",
      rationale: "避免多重转发与长程记忆丢失",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [putUrl, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(String(putUrl)).toBe(
      "http://localhost:3100/api/issues/issue-abc-123/documents/decision-log",
    );
    expect(putInit.method).toBe("PUT");
    const payload = JSON.parse(String(putInit.body));
    expect(payload.content).toContain("Hermes总控与DSH定位");
    expect(payload.content).toContain("Hermes直面微信QQ总控");
  });

  it("assigns an issue through the issue patch route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "PAP-1", status: "todo" }));
    vi.stubGlobal("fetch", fetchMock);

    await getTool("paperclipAssignIssue").execute({
      issueId: "PAP-1",
      assigneeAgentId: "22222222-2222-4222-8222-222222222222",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/PAP-1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      assigneeAgentId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("uploads an issue attachment as multipart under the company-scoped route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "att-1" }, 201));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipUploadIssueAttachment").execute({
      issueId: "PAP-1",
      filePath: "/tmp/spec.md",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(
      `http://localhost:3100/api/companies/${COMPANY_A}/issues/PAP-1/attachments`,
    );
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer token-123");
    expect(headers["X-Paperclip-Api-Key"]).toBe("token-123");
    // fetch must own the boundary — a JSON content-type here would break parsing.
    expect(headers["Content-Type"]).toBeUndefined();
    expect(response.content[0]?.text).toContain("att-1");
  });

  it("analyzes a project document before project creation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ suggestedName: "进销存", source: "content" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipAnalyzeProjectDocument").execute({
      filePath: "/tmp/req.docx",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(
      `http://localhost:3100/api/companies/${COMPANY_A}/projects/analyze-document`,
    );
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(response.content[0]?.text).toContain("content");
  });

  it("records a work product on an issue", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "wp-1" }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await getTool("paperclipCreateWorkProduct").execute({
      issueId: "PAP-1",
      type: "artifact",
      title: "Release APK",
      provider: "coolie",
      url: "https://dls.xrobinai.cn/coolie/app/0.5.88/coolie-release.apk",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/PAP-1/work-products");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      type: "artifact",
      title: "Release APK",
      provider: "coolie",
      url: "https://dls.xrobinai.cn/coolie/app/0.5.88/coolie-release.apk",
    });
  });

  it("sets a company budget through the board-only budgets route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "company-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await getTool("paperclipUpdateCompanyBudget").execute({ budgetMonthlyCents: 500000 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/budgets`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ budgetMonthlyCents: 500000 });
  });

  it("stops and resumes a company through the kill-switch routes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await getTool("paperclipEmergencyStopCompany").execute({
      reason: "预算异常",
      reasonKind: "budget",
    });
    await getTool("paperclipEmergencyResumeCompany").execute({});

    const [stopUrl, stopInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(stopUrl)).toBe(
      `http://localhost:3100/api/companies/${COMPANY_A}/emergency-stop`,
    );
    expect(stopInit.method).toBe("POST");
    expect(JSON.parse(String(stopInit.body))).toEqual({
      reason: "预算异常",
      reasonKind: "budget",
    });

    const [resumeUrl, resumeInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(String(resumeUrl)).toBe(
      `http://localhost:3100/api/companies/${COMPANY_A}/emergency-resume`,
    );
    expect(resumeInit.method).toBe("POST");
  });

  it("reads scheduler heartbeats from the instance route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse([{ agentId: "a-1", schedulerActive: true }]),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getTool("paperclipListSchedulerHeartbeats").execute({});

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/instance/scheduler-heartbeats");
    expect(init.method).toBe("GET");
  });

  it("keeps company-scoped reads inside the configured company (company A cannot see company B)", async () => {
    const listA = getToolFor("paperclipListIssues", makeClient(COMPANY_A));
    const listB = getToolFor("paperclipListIssues", makeClient(COMPANY_B));

    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    await listA.execute({});
    await listB.execute({});

    // The default company is the client's own — a client pinned to A never
    // silently resolves to B.
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `http://localhost:3100/api/companies/${COMPANY_A}/issues`,
    );
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      `http://localhost:3100/api/companies/${COMPANY_B}/issues`,
    );

    // Asking A's client for B is an explicit cross-company request; the backend
    // refuses it, and the tool must report that refusal rather than return B's
    // data. A restriction that silently returns something is a restriction in
    // name only.
    const denied = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", denied);

    const response = await getToolFor("paperclipGetCompanyDashboard", makeClient(COMPANY_A)).execute({
      companyId: COMPANY_B,
    });

    expect(denied).toHaveBeenCalledTimes(1);
    expect(String(denied.mock.calls[0][0])).toBe(
      `http://localhost:3100/api/companies/${COMPANY_B}/dashboard`,
    );
    const text = response.content[0]?.text ?? "";
    expect(text).toContain("403");
    expect(text).toContain("Forbidden");
  });
});

describe("spec-driven MCP tools (wave147)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("spec_create starts from a template, then writes the primary body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({ issueId: "ISSUE-1" }))
      .mockResolvedValueOnce(mockJsonResponse({ issueId: "ISSUE-1", specKind: "requirement" }));
    vi.stubGlobal("fetch", fetchMock);

    await getTool("spec_create").execute({
      kind: "requirement",
      parentIssueId: "PARENT-1",
      title: "Receipt",
      body: "Show a receipt",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url1, init1] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url1)).toBe(
      `http://localhost:3100/api/companies/${COMPANY_A}/specs/from-template`,
    );
    expect(init1.method).toBe("POST");
    expect(JSON.parse(String(init1.body))).toEqual({
      kind: "requirement",
      parentIssueId: "PARENT-1",
      title: "Receipt",
    });

    const [url2, init2] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(String(url2)).toBe("http://localhost:3100/api/issues/ISSUE-1/spec");
    expect(JSON.parse(String(init2.body))).toMatchObject({
      kind: "requirement",
      requirement: { body: "Show a receipt" },
    });
  });

  it("spec_tree reads the company tree with an optional project filter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ roots: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await getTool("spec_tree").execute({ projectId: "PROJ-1" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(
      `http://localhost:3100/api/companies/${COMPANY_A}/specs/tree?projectId=PROJ-1`,
    );
    expect(init.method).toBe("GET");
  });

  it("spec_template_apply writes a skeleton onto an existing issue", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ issueId: "ISSUE-2" }));
    vi.stubGlobal("fetch", fetchMock);

    await getTool("spec_template_apply").execute({ issueId: "ISSUE-2", templateName: "task" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/ISSUE-2/spec");
    const body = JSON.parse(String(init.body));
    expect(body.kind).toBe("task");
    expect(Array.isArray(body.task.files)).toBe(true);
    expect(body.parentSpecId).toBeNull();
  });

  it("paperclipGetCompanyOntologyGraph fetches graph with parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ nodes: [], edges: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await getTool("paperclipGetCompanyOntologyGraph").execute({
      rootType: "agent",
      rootId: "22222222-2222-2222-2222-222222222222",
      depth: 2,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(
      `http://localhost:3100/api/companies/${COMPANY_A}/ontology/graph?root_type=agent&root_id=22222222-2222-2222-2222-222222222222&depth=2`,
    );
    expect(init.method).toBe("GET");
  });

  it("paperclipGetCompanyOntologyStats fetches stats", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ totalEntities: 10, totalRelations: 20 }));
    vi.stubGlobal("fetch", fetchMock);

    await getTool("paperclipGetCompanyOntologyStats").execute({});

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(
      `http://localhost:3100/api/companies/${COMPANY_A}/ontology/stats`,
    );
    expect(init.method).toBe("GET");
  });

  it("paperclipListPluginTools lists plugin tools with optional pluginId", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ name: "plugin-ontology:query" }]));
    vi.stubGlobal("fetch", fetchMock);

    await getTool("paperclipListPluginTools").execute({ pluginId: "plugin-ontology" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/plugins/tools?pluginId=plugin-ontology");
    expect(init.method).toBe("GET");
  });

  it("paperclipExecutePluginTool posts to execute endpoint with run context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ result: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await getTool("paperclipExecutePluginTool").execute({
      tool: "plugin-ontology:query",
      parameters: { domain: "scm" },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/plugins/tools/execute");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body.tool).toBe("plugin-ontology:query");
    expect(body.parameters).toEqual({ domain: "scm" });
    expect(body.runContext.companyId).toBe(COMPANY_A);
    expect(body.runContext.agentId).toBe("22222222-2222-2222-2222-222222222222");
    expect(body.runContext.runId).toBe("33333333-3333-3333-3333-333333333333");
  });
});

describe("company discovery MCP tool (wave379)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists companies without needing a company scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse([{ id: COMPANY_A, name: "Coolie 本地施工总社" }]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipListCompanies").execute({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/companies");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("Coolie 本地施工总社");
  });

  it("passes scope=accessible through to the company list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await getTool("paperclipListCompanies").execute({ scope: "accessible" });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/companies?scope=accessible");
  });
});

describe("QA automation MCP tools", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists navigable routes via qaPageListRoutes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ total: 2, routes: [{ id: "inbox" }, { id: "projects" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("qaPageListRoutes").execute({ platform: "mobile" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain(`/companies/${COMPANY_A}/automation/routes?platform=mobile`);
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("inbox");
  });

  it("inspects page elements via qaPageInspectElements", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ total: 1, elements: [{ testId: "tab-inbox", role: "button" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("qaPageInspectElements").execute({ role: "button" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/automation/inspect-elements`);
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("tab-inbox");
  });

  it("triggers 4-state visual snapshot via qaQuadSnapshot", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ passedAllStates: true, routeName: "StudioScreen" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("qaQuadSnapshot").execute({ routeName: "StudioScreen" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/automation/quad-snapshot`);
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("passedAllStates");
  });

  it("asserts geometric occlusion via qaOcclusionAssert", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ passed: true, occlusionRatio: 0.02 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("qaOcclusionAssert").execute({ targetId: "action-confirm" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/automation/occlusion-assert`);
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("passed");
  });

  it("audits minimalist two-letter UI via qaTwoLetterAudit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ allPassed: true, totalAudited: 5 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("qaTwoLetterAudit").execute({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/automation/two-letter-audit`);
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("allPassed");
  });
});

describe("Ops Cockpit MCP tools", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("translates boss oral voice to proposal via opsVoiceToProposal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ proposalId: "prop-123", actionType: "gate_approval", title: "门禁裁决" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("opsVoiceToProposal").execute({
      utterance: "板材利用率超85%，通过G4门禁",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/automation/voice-to-proposal`);
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("prop-123");
  });

  it("fetches real-time telemetry via opsMetricsTelemetry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ totalIssues: 120, activeAgents: 4, healthStatus: "HEALTHY_FOUNDRY" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("opsMetricsTelemetry").execute({ timeRange: "today" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/automation/metrics-telemetry`);
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("HEALTHY_FOUNDRY");
  });

  it("executes daily reconciliation via opsTriggerReconciliation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ balanced: true, immutableSeal: "sha256:abc123" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("opsTriggerReconciliation").execute({ date: "2026-10-17" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/automation/reconciliation-settle`);
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("sha256:abc123");
  });

  it("controls emergency killswitch via opsEmergencyKillswitch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ effectiveStatus: "EMERGENCY_STOPPED" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("opsEmergencyKillswitch").execute({
      action: "trigger",
      reason: "Budget risk alert",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/automation/killswitch`);
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("EMERGENCY_STOPPED");
  });
});

describe("Full-spectrum MCP Tools 100% Coverage (95/95)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("searches connection intents via connections_search", async () => {
    process.env.PAPERCLIP_RUNTIME_TOOLS_CONNECTIONS_SEARCH_URL = "http://runtime-tools/search";
    process.env.PAPERCLIP_RUNTIME_TOOLS_TOKEN = "token-test";
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("connections_search").execute({ query: "slack" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://runtime-tools/search");
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("results");
  });

  it("requests connection intent via connection_request", async () => {
    process.env.PAPERCLIP_RUNTIME_TOOLS_CONNECTION_REQUEST_URL = "http://runtime-tools/request";
    process.env.PAPERCLIP_RUNTIME_TOOLS_TOKEN = "token-test";
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ status: "requested" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("connection_request").execute({ service: "github" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://runtime-tools/request");
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("requested");
  });

  it("gets current actor details via paperclipMe", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "agent-1", name: "Hermes" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipMe").execute({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/agents/me");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("Hermes");
  });

  it("gets inbox-lite assignment list via paperclipInboxLite", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ id: "issue-1", title: "Task 1" }]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipInboxLite").execute({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/agents/me/inbox-lite");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("Task 1");
  });

  it("lists company agents via paperclipListAgents", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ id: "agent-1", name: "Core SWE" }]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipListAgents").execute({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/agents`);
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("Core SWE");
  });

  it("gets single agent via paperclipGetAgent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "agent-1", role: "core-swe" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipGetAgent").execute({ agentId: "agent-1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/agents/agent-1");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("core-swe");
  });

  it("gets single issue via paperclipGetIssue", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "issue-123", title: "Issue 123" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipGetIssue").execute({ issueId: "issue-123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/issue-123");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("Issue 123");
  });

  it("gets heartbeat context via paperclipGetHeartbeatContext", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ issue: { id: "issue-123" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipGetHeartbeatContext").execute({ issueId: "issue-123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/issue-123/heartbeat-context");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("issue-123");
  });

  it("lists issue comments via paperclipListComments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ id: "c-1", body: "Hello" }]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipListComments").execute({ issueId: "issue-123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/issue-123/comments");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("Hello");
  });

  it("gets specific comment via paperclipGetComment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "c-1", body: "Specific comment" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipGetComment").execute({
      issueId: "issue-123",
      commentId: "33333333-3333-3333-3333-333333333333",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/issue-123/comments/33333333-3333-3333-3333-333333333333");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("Specific comment");
  });

  it("lists issue approvals via paperclipListIssueApprovals", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ id: "app-1", status: "pending" }]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipListIssueApprovals").execute({ issueId: "issue-123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/issue-123/approvals");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("pending");
  });

  it("lists issue documents via paperclipListDocuments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ key: "srs", title: "SRS" }]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipListDocuments").execute({ issueId: "issue-123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/issue-123/documents");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("srs");
  });

  it("gets one issue document via paperclipGetDocument", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ key: "plan", content: "# Plan" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipGetDocument").execute({ issueId: "issue-123", key: "plan" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/issue-123/documents/plan");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("Plan");
  });

  it("lists document revisions via paperclipListDocumentRevisions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ id: "rev-1", revisionNumber: 1 }]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipListDocumentRevisions").execute({ issueId: "issue-123", key: "plan" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/issue-123/documents/plan/revisions");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("rev-1");
  });

  it("lists projects via paperclipListProjects", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ id: "proj-1", name: "Project Alpha" }]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipListProjects").execute({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/projects`);
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("Project Alpha");
  });

  it("gets project via paperclipGetProject", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "proj-1", name: "Project Alpha" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipGetProject").execute({ projectId: "proj-1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/projects/proj-1");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("Project Alpha");
  });

  it("updates project via paperclipUpdateProject", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "proj-1", name: "Renamed Project" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipUpdateProject").execute({ projectId: "proj-1", name: "Renamed Project" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/projects/proj-1");
    expect(init.method).toBe("PATCH");
    expect(response.content[0]?.text).toContain("Renamed Project");
  });

  it("lists project workspaces via paperclipListProjectWorkspaces", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ id: "ws-1", name: "workspace-a" }]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipListProjectWorkspaces").execute({ projectId: "proj-1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/projects/proj-1/workspaces");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("workspace-a");
  });

  it("creates project workspace via paperclipCreateProjectWorkspace", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "ws-1", name: "main-ws" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipCreateProjectWorkspace").execute({
      projectId: "proj-1",
      name: "main-ws",
      sourceType: "git_repo",
      repoUrl: "https://github.com/xaicd/ruoyi-all-next.git",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/projects/proj-1/workspaces");
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("main-ws");
  });

  it("controls project workspace runtime via paperclipControlProjectWorkspaceRuntime", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ status: "started" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipControlProjectWorkspaceRuntime").execute({
      projectId: "proj-1",
      workspaceId: "ws-1",
      action: "start",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/projects/proj-1/workspaces/ws-1/runtime-services/start");
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("started");
  });

  it("gets issue workspace runtime via paperclipGetIssueWorkspaceRuntime", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({
      currentExecutionWorkspace: { id: "ws-1", runtimeServices: [] },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipGetIssueWorkspaceRuntime").execute({ issueId: "issue-123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/issue-123/heartbeat-context");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("ws-1");
  });

  it("lists goals via paperclipListGoals", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ id: "goal-1", title: "Goal 1" }]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipListGoals").execute({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/goals`);
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("Goal 1");
  });

  it("gets goal by id via paperclipGetGoal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "55555555-5555-5555-5555-555555555555", title: "Target" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipGetGoal").execute({ goalId: "55555555-5555-5555-5555-555555555555" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/goals/55555555-5555-5555-5555-555555555555");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("Target");
  });

  it("lists approvals via paperclipListApprovals", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ id: "app-1", title: "App 1" }]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipListApprovals").execute({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/approvals`);
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("App 1");
  });

  it("gets approval by id via paperclipGetApproval", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "66666666-6666-6666-6666-666666666666", title: "Approve deploy" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipGetApproval").execute({ approvalId: "66666666-6666-6666-6666-666666666666" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/approvals/66666666-6666-6666-6666-666666666666");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("Approve deploy");
  });

  it("lists issues linked to approval via paperclipGetApprovalIssues", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ id: "issue-1" }]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipGetApprovalIssues").execute({ approvalId: "66666666-6666-6666-6666-666666666666" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/approvals/66666666-6666-6666-6666-666666666666/issues");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("issue-1");
  });

  it("lists approval comments via paperclipListApprovalComments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ id: "ac-1", body: "Approved by Boss" }]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipListApprovalComments").execute({ approvalId: "66666666-6666-6666-6666-666666666666" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/approvals/66666666-6666-6666-6666-666666666666/comments");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("Approved by Boss");
  });

  it("releases issue checkout via paperclipReleaseIssue", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "issue-123", status: "open" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipReleaseIssue").execute({ issueId: "issue-123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/issue-123/release");
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("open");
  });

  it("adds comment to issue via paperclipAddComment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "c-1", body: "New note" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipAddComment").execute({ issueId: "issue-123", body: "New note" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/issue-123/comments");
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("New note");
  });

  it("creates ask user questions interaction via paperclipAskUserQuestions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "int-1", type: "ask_user_questions" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipAskUserQuestions").execute({
      issueId: "issue-123",
      payload: {
        version: 1,
        questions: [{ id: "env", prompt: "Target env?", selectionMode: "single", required: true, options: [{ id: "dev", label: "Dev" }] }],
        questionSet: { schema: "paperclip.question_set.v1", questions: [{ id: "env", prompt: "Target env?", answerMode: "single_select", required: true, options: [{ id: "dev", label: "Dev" }] }] },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/issue-123/interactions");
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("ask_user_questions");
  });

  it("restores document revision via paperclipRestoreIssueDocumentRevision", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "doc-1", restored: true }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipRestoreIssueDocumentRevision").execute({
      issueId: "issue-123",
      key: "srs",
      revisionId: "77777777-7777-7777-7777-777777777777",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/issue-123/documents/srs/revisions/77777777-7777-7777-7777-777777777777/restore");
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("restored");
  });

  it("links approval to issue via paperclipLinkIssueApproval", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ linked: true }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipLinkIssueApproval").execute({
      issueId: "issue-123",
      approvalId: "88888888-8888-8888-8888-888888888888",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/issue-123/approvals");
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("linked");
  });

  it("unlinks approval from issue via paperclipUnlinkIssueApproval", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ unlinked: true }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipUnlinkIssueApproval").execute({
      issueId: "issue-123",
      approvalId: "88888888-8888-8888-8888-888888888888",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/issue-123/approvals/88888888-8888-8888-8888-888888888888");
    expect(init.method).toBe("DELETE");
    expect(response.content[0]?.text).toContain("unlinked");
  });

  it("submits approval decision via paperclipApprovalDecision", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ status: "approved" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipApprovalDecision").execute({
      approvalId: "88888888-8888-8888-8888-888888888888",
      action: "approve",
      decisionNote: "Passed all gates",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/approvals/88888888-8888-8888-8888-888888888888/approve");
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("approved");
  });

  it("adds approval comment via paperclipAddApprovalComment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "com-1", body: "LGTM" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipAddApprovalComment").execute({
      approvalId: "88888888-8888-8888-8888-888888888888",
      body: "LGTM",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/approvals/88888888-8888-8888-8888-888888888888/comments");
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("LGTM");
  });

  it("lists issue attachments via paperclipListIssueAttachments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ id: "att-1", name: "spec.pdf" }]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipListIssueAttachments").execute({ issueId: "issue-123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/issue-123/attachments");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("spec.pdf");
  });

  it("lists work products via paperclipListWorkProducts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ id: "wp-1", title: "Build Report" }]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipListWorkProducts").execute({ issueId: "issue-123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/issues/issue-123/work-products");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("Build Report");
  });

  it("lists project documents via paperclipListProjectDocuments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ id: "doc-1", title: "SRS" }]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipListProjectDocuments").execute({ projectId: "proj-1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/projects/proj-1/documents`);
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("SRS");
  });

  it("uploads project document via paperclipUploadProjectDocument", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ id: "doc-up-1", title: "Uploaded SRS" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipUploadProjectDocument").execute({
      projectId: "proj-1",
      filePath: "/fake/path/srs.md",
      title: "Uploaded SRS",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/projects/proj-1/documents`);
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("Uploaded SRS");
  });

  it("gets cost summary via paperclipGetCostsSummary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ totalCostCents: 15000 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipGetCostsSummary").execute({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/costs/summary`);
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("15000");
  });

  it("gets cost by agent via paperclipGetCostsByAgent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([{ agentId: "a-1", costCents: 5000 }]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipGetCostsByAgent").execute({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/costs/by-agent`);
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("5000");
  });

  it("gets budgets overview via paperclipGetBudgetsOverview", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ totalBudgetCents: 100000 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipGetBudgetsOverview").execute({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/budgets/overview`);
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("100000");
  });

  it("updates agent budget via paperclipUpdateAgentBudget", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ updated: true }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipUpdateAgentBudget").execute({
      agentId: "agent-1",
      budgetMonthlyCents: 20000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/agents/agent-1/budgets");
    expect(init.method).toBe("PATCH");
    expect(response.content[0]?.text).toContain("updated");
  });

  it("gets agent runtime state via paperclipGetAgentRuntimeState", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ state: "active", totalRuns: 10 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("paperclipGetAgentRuntimeState").execute({ agentId: "agent-1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:3100/api/agents/agent-1/runtime-state");
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("active");
  });

  it("gets active page state via qaPageGetActiveState", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ currentRoute: "StudioScreen", isInteractive: true }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("qaPageGetActiveState").execute({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/automation/active-state`);
    expect(init.method).toBe("GET");
    expect(response.content[0]?.text).toContain("StudioScreen");
  });

  it("simulates tap via qaPageTap", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ success: true, targetId: "action-confirm" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("qaPageTap").execute({ target: { testId: "action-confirm" } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/automation/tap`);
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("success");
  });

  it("simulates typing via qaPageType", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ success: true, typedLength: 12 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("qaPageType").execute({ target: { testId: "input-task-title" }, text: "New Task Title" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/automation/type`);
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("typedLength");
  });

  it("simulates scroll via qaPageScroll", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ scrolled: true, direction: "down" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("qaPageScroll").execute({ direction: "down", distancePx: 200 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/automation/scroll`);
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("scrolled");
  });

  it("detects blank screen via qaDetectBlankScreen", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ isBlank: false, colorVariance: 0.85 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("qaDetectBlankScreen").execute({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/automation/detect-blank-screen`);
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("colorVariance");
  });

  it("highlights element via opsHighlightElement", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ highlighted: true, targetId: "btn-submit" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("opsHighlightElement").execute({ componentId: "btn-submit", tooltip: "spotlight" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/automation/highlight-element`);
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("highlighted");
  });

  it("captures chart snapshot via opsCaptureChart", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ chartId: "c-1", snapshotUrl: "http://img/c1.png" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("opsCaptureChart").execute({ chartSelector: "#chart-1", title: "Burndown" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/automation/capture-chart`);
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("snapshotUrl");
  });

  it("executes modal confirm via opsModalConfirm", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ confirmed: true, action: "approve" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("opsModalConfirm").execute({ approvalId: "app-1", decision: "approve" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/automation/modal-confirm`);
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("confirmed");
  });

  it("dispatches routine keeper via opsRoutineDispatch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ dispatched: true, routineId: "rout-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTool("opsRoutineDispatch").execute({ projectId: "proj-1", routineType: "inspection" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`http://localhost:3100/api/companies/${COMPANY_A}/automation/routine-dispatch`);
    expect(init.method).toBe("POST");
    expect(response.content[0]?.text).toContain("dispatched");
  });
});



