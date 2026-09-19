import {
  ASR_NOT_CONFIGURED,
  MULTIMODAL_PLUGIN_ID,
  ONTOLOGY_PLUGIN_ID,
  type AgentIdentity,
  type CockpitDashboardMetrics,
  type Company,
  type CompanyArtifact,
  type CompanyArtifactsQuery,
  type CompanyArtifactsResponse,
  type CreateIssueInput,
  type DashboardSummary,
  type ExecutionWorkspace,
  type GetWorkspaceDiffParams,
  type Issue,
  type IssueAttachment,
  type IssueWorkProduct,
  type OntologyDomain,
  type OntologyDomainLifecycleState,
  type OntologyGraphSnapshot,
  type SessionUser,
  type SetDomainLifecycleOptions,
  type VoiceDispatchInput,
  type VoiceDispatchResult,
  type WorkspaceDiffResponse,
  type WorkspaceRuntimeService,
} from "./types";

export interface CoolieClientOptions {
  /** Instance base URL, e.g. "http://100.84.124.71:3100". No trailing slash. */
  baseUrl: string;
  /**
   * Returns auth headers for each request. Two schemes work:
   *  - user session: after sign-in, echo the session cookie / bearer.
   *  - agent API key: return { Authorization: `Bearer ${apiKey}` }.
   * Return {} for unauthenticated calls (sign-in/sign-up).
   */
  getAuthHeader?: () => Promise<Record<string, string>> | Record<string, string>;
  /** Injectable fetch (RN/Expo and browsers both provide global fetch). */
  fetchImpl?: typeof fetch;
  /**
   * Value for the `Origin` request header, e.g. the instance's own origin.
   *
   * Browsers set this themselves and forbid code from overriding it, so web
   * clients should leave it unset. A **native** client is not a browser: it sends
   * no Origin at all, and the host then refuses cookie-authenticated mutations
   * with "Board mutation requires trusted browser origin" (measured: a session
   * cookie POSTing an issue without this header gets 403; with it, 201). The
   * value the host accepts is the instance's own origin — the same host this
   * client is already talking to — so deriving it from `baseUrl` is both correct
   * and the minimum it can be.
   */
  originHeader?: string;
}

export class CoolieApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body?: unknown;

  constructor(
    status: number,
    message: string,
    code?: string,
    body?: unknown,
  ) {
    super(message);
    this.name = "CoolieApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/**
 * Framework-agnostic Coolie REST client covering the mobile/web happy path:
 * auth, companies, tasks, and voice dispatch. Used by both clients/expo and
 * clients/h5. For the full API, generate from /api/openapi.json.
 */
export class CoolieClient {
  private readonly baseUrl: string;
  private readonly getAuthHeader: NonNullable<CoolieClientOptions["getAuthHeader"]>;
  private readonly fetchImpl: typeof fetch;
  private readonly originHeader?: string;

  constructor(opts: CoolieClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.getAuthHeader = opts.getAuthHeader ?? (() => ({}));
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.originHeader = opts.originHeader;
    if (!this.fetchImpl) throw new Error("No fetch available; pass fetchImpl");
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: { auth?: boolean },
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.originHeader) headers.Origin = this.originHeader;
    if (opts?.auth !== false) Object.assign(headers, await this.getAuthHeader());

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
    });

    const text = await res.text();
    const parsed = text ? safeJson(text) : null;
    if (!res.ok) {
      const code = isRecord(parsed) && typeof parsed.error === "string" ? parsed.error : undefined;
      const message =
        (isRecord(parsed) && typeof parsed.message === "string" && parsed.message) ||
        code ||
        `Request failed: ${res.status}`;
      throw new CoolieApiError(res.status, message, code, parsed);
    }
    return parsed as T;
  }

  // --- auth ---------------------------------------------------------------
  signInEmail(input: { email: string; password: string }): Promise<unknown> {
    return this.request("POST", "/api/auth/sign-in/email", input, { auth: false });
  }
  signUpEmail(input: { name: string; email: string; password: string }): Promise<unknown> {
    return this.request("POST", "/api/auth/sign-up/email", input, { auth: false });
  }
  async getSession(): Promise<{ user: SessionUser } | null> {
    return this.request("GET", "/api/auth/get-session");
  }
  /**
   * Drops the session server-side. Requires `originHeader`: Better Auth guards
   * this one with "Missing or null Origin" (measured 403 without it), even though
   * sign-in itself needs no Origin — there is no session cookie to protect yet at
   * that point, which is exactly the difference.
   */
  signOut(): Promise<unknown> {
    return this.request("POST", "/api/auth/sign-out");
  }

  /**
   * Identity of the agent the current key belongs to. This is the right
   * agent-key health check: it is the agent-authenticated call that states which
   * company the key is scoped to.
   */
  getAgentIdentity(): Promise<AgentIdentity> {
    return this.request<AgentIdentity>("GET", "/api/agents/me");
  }

  // --- companies ----------------------------------------------------------
  /**
   * Board/session only. An **agent** key gets 403 here (host-enforced), so an
   * agent-key app must take its company from `getAgentIdentity()` instead.
   */
  async listCompanies(): Promise<Company[]> {
    const body = await this.request<{ companies?: Company[] } | Company[]>("GET", "/api/companies");
    return Array.isArray(body) ? body : (body.companies ?? []);
  }

  getCompany(companyId: string): Promise<Company> {
    return this.request<Company>("GET", `/api/companies/${encodeURIComponent(companyId)}`);
  }

  // --- tasks (issues) -----------------------------------------------------
  // Issues are company-scoped in the path. `/api/issues?companyId=…` does not
  // exist and answers 400 — this called it, so every task call used to fail.
  async listIssues(companyId: string, opts?: { status?: string; limit?: number }): Promise<Issue[]> {
    const q = new URLSearchParams();
    if (opts?.status) q.set("status", opts.status);
    if (opts?.limit) q.set("limit", String(opts.limit));
    const suffix = q.size > 0 ? `?${q.toString()}` : "";
    const body = await this.request<{ issues?: Issue[] } | Issue[]>(
      "GET",
      `/api/companies/${encodeURIComponent(companyId)}/issues${suffix}`,
    );
    return Array.isArray(body) ? body : (body.issues ?? []);
  }

  async createIssue(input: CreateIssueInput): Promise<Issue> {
    const { companyId, ...fields } = input;
    const body = await this.request<{ issue?: Issue } | Issue>(
      "POST",
      `/api/companies/${encodeURIComponent(companyId)}/issues`,
      fields,
    );
    return isRecord(body) && "issue" in body ? (body.issue as Issue) : (body as Issue);
  }

  // --- dashboard & efficiency telemetry (Top1 驾驶舱) --------------------
  /**
   * 获取公司效能大盘摘要，内含六大指标 (额度/进度/空闲度/交付周期/车间效率/失败率)
   */
  getDashboard(companyId: string): Promise<DashboardSummary> {
    return this.request<DashboardSummary>(
      "GET",
      `/api/companies/${encodeURIComponent(companyId)}/dashboard`,
    );
  }

  /**
   * 获取公司驾驶舱专用六大指标卡片数据包
   */
  getCockpitMetrics(companyId: string): Promise<CockpitDashboardMetrics> {
    return this.request<CockpitDashboardMetrics>(
      "GET",
      `/api/companies/${encodeURIComponent(companyId)}/metrics/cockpit`,
    );
  }

  // --- voice dispatch -----------------------------------------------------
  /**
   * Send recorded audio to the multimodal plugin. With createIssue (default
   * true) the recognized speech becomes a task. Throws CoolieApiError with
   * code ASR_NOT_CONFIGURED (status 501) when the instance has no Tencent keys.
   */
  async voiceDispatch(input: VoiceDispatchInput): Promise<VoiceDispatchResult> {
    return this.request<VoiceDispatchResult>(
      "POST",
      `/api/plugins/${MULTIMODAL_PLUGIN_ID}/api/transcriptions`,
      {
        companyId: input.companyId,
        audioBase64: input.audioBase64,
        format: input.format ?? "mp3",
        createIssue: input.createIssue ?? true,
        priority: input.priority,
      },
    );
  }

  // --- workspace diff (Top2 代码审查需求④) --------------------------------
  /**
   * 获取指定工作区的 Git Diff 差异 (支持 working-tree 或 head 视图)
   */
  async getWorkspaceDiff(params: GetWorkspaceDiffParams): Promise<WorkspaceDiffResponse> {
    const { companyId, workspaceId, ...rest } = params;
    try {
      const res = await this.request<{ data?: WorkspaceDiffResponse } | WorkspaceDiffResponse>(
        "POST",
        `/api/plugins/paperclip.workspace-diff/data/workspace-diff`,
        {
          companyId,
          params: {
            companyId,
            workspaceId,
            ...rest,
          },
        },
      );
      if (isRecord(res) && "data" in res && res.data) {
        return res.data as WorkspaceDiffResponse;
      }
      return res as WorkspaceDiffResponse;
    } catch (err) {
      if (err instanceof CoolieApiError && (err.status === 404 || err.status === 405)) {
        // Fallback to /api/workspace-diff if routed through plugin scoped API
        const res = await this.request<{ data?: WorkspaceDiffResponse } | WorkspaceDiffResponse>(
          "POST",
          `/api/plugins/paperclip.workspace-diff/api/workspace-diff`,
          {
            companyId,
            workspaceId,
            ...rest,
          },
        );
        if (isRecord(res) && "data" in res && res.data) {
          return res.data as WorkspaceDiffResponse;
        }
        return res as WorkspaceDiffResponse;
      }
      throw err;
    }
  }

  /**
   * 查询执行工作区列表 (可按 issueId 或 projectId 过滤)
   */
  async listExecutionWorkspaces(
    companyId: string,
    opts?: { issueId?: string; projectId?: string; status?: string },
  ): Promise<ExecutionWorkspace[]> {
    const q = new URLSearchParams();
    if (opts?.issueId) q.set("issueId", opts.issueId);
    if (opts?.projectId) q.set("projectId", opts.projectId);
    if (opts?.status) q.set("status", opts.status);
    const suffix = q.size > 0 ? `?${q.toString()}` : "";
    const body = await this.request<ExecutionWorkspace[]>(
      "GET",
      `/api/companies/${encodeURIComponent(companyId)}/execution-workspaces${suffix}`,
    );
    return Array.isArray(body) ? body : [];
  }

  /**
   * 查询指定工单的交付产物列表 (包含代码库工作区、原型、附件等)
   * 对应 GET /api/issues/:id/work-products
   */
  async listWorkProducts(
    issueId: string,
    opts?: { refreshPullRequests?: boolean },
  ): Promise<IssueWorkProduct[]> {
    const q = new URLSearchParams();
    if (opts?.refreshPullRequests) q.set("refreshPullRequests", "true");
    const suffix = q.size > 0 ? `?${q.toString()}` : "";
    const body = await this.request<IssueWorkProduct[]>(
      "GET",
      `/api/issues/${encodeURIComponent(issueId)}/work-products${suffix}`,
    );
    return Array.isArray(body) ? body : [];
  }

  /**
   * 查询公司产物中心投影列表 (需求③看产物)
   * 聚合工单交付物(work products)、附件(attachments)与文档(documents)
   * 对应 GET /api/companies/:companyId/artifacts
   */
  async listArtifacts(
    companyId: string,
    query?: CompanyArtifactsQuery,
  ): Promise<CompanyArtifactsResponse> {
    const q = new URLSearchParams();
    if (query?.kind && query.kind !== "all") q.set("kind", query.kind);
    if (query?.projectId) q.set("projectId", query.projectId);
    if (query?.q) q.set("q", query.q);
    if (query?.groupBy && query.groupBy !== "none") q.set("groupBy", query.groupBy);
    if (query?.groupIssueId) q.set("groupIssueId", query.groupIssueId);
    if (query?.starred !== undefined) q.set("starred", String(query.starred));
    if (query?.limit !== undefined) q.set("limit", String(query.limit));
    if (query?.cursor) q.set("cursor", query.cursor);

    const suffix = q.size > 0 ? `?${q.toString()}` : "";
    const res = await this.request<CompanyArtifactsResponse | { artifacts?: CompanyArtifact[] }>(
      "GET",
      `/api/companies/${encodeURIComponent(companyId)}/artifacts${suffix}`,
    );

    if (isRecord(res) && Array.isArray(res.artifacts)) {
      return {
        artifacts: res.artifacts,
        groups: Array.isArray((res as CompanyArtifactsResponse).groups)
          ? (res as CompanyArtifactsResponse).groups
          : undefined,
        selectedGroup: (res as CompanyArtifactsResponse).selectedGroup ?? null,
        nextCursor: typeof (res as CompanyArtifactsResponse).nextCursor === "string"
          ? (res as CompanyArtifactsResponse).nextCursor
          : null,
      };
    }
    if (Array.isArray(res)) {
      return { artifacts: res, nextCursor: null };
    }
    return { artifacts: [], nextCursor: null };
  }

  /**
   * 查询指定工单的附件列表 (需求③)
   * 对应 GET /api/issues/:issueId/attachments
   */
  async listAttachments(
    issueId: string,
    companyId?: string,
  ): Promise<IssueAttachment[]> {
    try {
      const body = await this.request<IssueAttachment[]>(
        "GET",
        `/api/issues/${encodeURIComponent(issueId)}/attachments`,
      );
      return Array.isArray(body) ? body : [];
    } catch (err) {
      if (companyId && err instanceof CoolieApiError && (err.status === 404 || err.status === 405)) {
        const body = await this.request<IssueAttachment[]>(
          "GET",
          `/api/companies/${encodeURIComponent(companyId)}/issues/${encodeURIComponent(issueId)}/attachments`,
        );
        return Array.isArray(body) ? body : [];
      }
      throw err;
    }
  }

  /**
   * 查询执行工作区内运行中的服务暴露地址与状态 (需求⑤看原型)
   * 遍历 execution-workspaces 获取 workspace_runtime_services
   */
  async listRuntimeServices(
    companyId: string,
    opts?: { issueId?: string; projectId?: string; status?: string },
  ): Promise<WorkspaceRuntimeService[]> {
    const workspaces = await this.listExecutionWorkspaces(companyId, opts);
    const services: WorkspaceRuntimeService[] = [];
    for (const ws of workspaces) {
      if (Array.isArray(ws.runtimeServices)) {
        for (const s of ws.runtimeServices) {
          if (!s.executionWorkspaceId && ws.id) {
            s.executionWorkspaceId = ws.id;
          }
          if (opts?.status && s.status !== opts.status) {
            continue;
          }
          services.push(s);
        }
      }
    }
    return services;
  }

  /**
   * 查询业务本体域列表 (需求⑪)
   * 对应 GET /api/plugins/paperclipai.plugin-ontology/api/domains
   */
  async listOntologyDomains(companyId: string): Promise<OntologyDomain[]> {
    const q = new URLSearchParams({ companyId });
    const res = await this.request<{ domains?: OntologyDomain[] } | OntologyDomain[]>(
      "GET",
      `/api/plugins/${ONTOLOGY_PLUGIN_ID}/api/domains?${q.toString()}`,
    );
    if (Array.isArray(res)) return res;
    if (isRecord(res) && Array.isArray(res.domains)) return res.domains;
    return [];
  }

  /**
   * 查询本体域详情与图快照摘要 (需求⑪)
   * 支持 /domains/:id/snapshot 与 /graph 回退
   */
  async getOntologySnapshot(
    companyId: string,
    domainId: string,
    nodeLimit = 200,
  ): Promise<OntologyGraphSnapshot> {
    const q = new URLSearchParams({
      companyId,
      domainId,
      nodeLimit: String(nodeLimit),
    });
    try {
      const res = await this.request<{ snapshot?: OntologyGraphSnapshot; graph?: OntologyGraphSnapshot } | OntologyGraphSnapshot>(
        "GET",
        `/api/plugins/${ONTOLOGY_PLUGIN_ID}/api/domains/${encodeURIComponent(domainId)}/snapshot?${q.toString()}`,
      );
      if (isRecord(res)) {
        if ("snapshot" in res && res.snapshot) return res.snapshot as OntologyGraphSnapshot;
        if ("graph" in res && res.graph) return res.graph as OntologyGraphSnapshot;
        if ("counts" in res) return res as unknown as OntologyGraphSnapshot;
      }
      return res as unknown as OntologyGraphSnapshot;
    } catch (err) {
      if (err instanceof CoolieApiError && (err.status === 404 || err.status === 405)) {
        const res = await this.request<{ graph?: OntologyGraphSnapshot } | OntologyGraphSnapshot>(
          "GET",
          `/api/plugins/${ONTOLOGY_PLUGIN_ID}/api/graph?${q.toString()}`,
        );
        if (isRecord(res) && "graph" in res && res.graph) {
          return res.graph as OntologyGraphSnapshot;
        }
        return res as unknown as OntologyGraphSnapshot;
      }
      throw err;
    }
  }

  /**
   * 变更本体域生命周期状态 / 紧急熔断 (需求⑪)
   * 支持 /domains/:id/lifecycle 与 /domains/:id/transition 回退
   */
  async setDomainLifecycle(
    companyId: string,
    domainId: string,
    state: OntologyDomainLifecycleState,
    opts?: SetDomainLifecycleOptions,
  ): Promise<OntologyDomain> {
    const targetState = state === "locked" ? "archived" : state;
    const body = {
      companyId,
      domainId,
      to: targetState,
      state: targetState,
      actor: opts?.actor ?? "cockpit-mobile",
      reason: opts?.reason ?? (state === "locked" ? "Emergency kill switch triggered" : undefined),
      deviceInfo: opts?.deviceInfo,
    };
    try {
      const res = await this.request<{ domain?: OntologyDomain } | OntologyDomain>(
        "POST",
        `/api/plugins/${ONTOLOGY_PLUGIN_ID}/api/domains/${encodeURIComponent(domainId)}/lifecycle`,
        body,
      );
      if (isRecord(res) && "domain" in res && res.domain) {
        return res.domain as OntologyDomain;
      }
      return res as unknown as OntologyDomain;
    } catch (err) {
      if (err instanceof CoolieApiError && (err.status === 404 || err.status === 405)) {
        const res = await this.request<{ domain?: OntologyDomain } | OntologyDomain>(
          "POST",
          `/api/plugins/${ONTOLOGY_PLUGIN_ID}/api/domains/${encodeURIComponent(domainId)}/transition`,
          body,
        );
        if (isRecord(res) && "domain" in res && res.domain) {
          return res.domain as OntologyDomain;
        }
        return res as unknown as OntologyDomain;
      }
      throw err;
    }
  }
}

export function isAsrNotConfigured(err: unknown): boolean {
  return err instanceof CoolieApiError && (err.code === ASR_NOT_CONFIGURED || err.status === 501);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
