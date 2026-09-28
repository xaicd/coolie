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

