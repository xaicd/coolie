import {
  ASR_NOT_CONFIGURED,
  MULTIMODAL_PLUGIN_ID,
  ONTOLOGY_PLUGIN_ID,
  type AdapterModel,
  type Agent,
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
  type IssueLabel,
  type IssueWorkProduct,
  type InboxFeed,
  type OntologyDomain,
  type OntologyDomainLifecycleState,
  type OntologyGraphCounts,
  type OntologyGraphSnapshot,
  type Project,
  type SessionUser,
  type SetDomainLifecycleOptions,
  type UploadFilePart,
  type VoiceDispatchInput,
  type VoiceDispatchResult,
  type WorkspaceDiffResponse,
  type WorkspaceRuntimeService,
  type Approval,
  type ApprovalComment,
  type BoardChatMessage,
  type BoardChatStreamCallbacks,
  type BoardChatStreamEvent,
  type BoardChatStreamInput,
  type ListApprovalsOptions,
  type ResolveApprovalOptions,
  type GitCredential,
  type SaveGitCredentialInput,
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
 * Result of the `seed-samples` plugin action — the instance nodes/edges planted
 * in one ontology domain. The route wraps the worker's return value as
 * `{ data }`; `seedDomainSamples` unwraps it before handing this back.
 */
export interface SeedDomainSamplesResult {
  /**
   * True when the domain was empty and the samples were planted. False when the
   * domain already had nodes, in which case nothing was written — the action
   * never overwrites existing data.
   */
  seeded: boolean;
  reason?: string;
  counts?: OntologyGraphCounts;
  created?: {
    nodeTypes: number;
    relationTypes: number;
    nodes: number;
    edges: number;
  };
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
    // Bind the global fetch to globalThis before storing it. Called as
    // `this.fetchImpl(...)` the receiver would be the client instance, which
    // browsers reject with "Failed to execute 'fetch' on 'Window': Illegal
    // invocation" (React Native's fetch ignores the receiver, so only browser
    // callers hit this).
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImpl) throw new Error("No fetch available; pass fetchImpl");
    this.fetchImpl = fetchImpl;
    this.originHeader = opts.originHeader;
  }

  /** @internal expo 壳层需要直接打杂项 API */
  async request<T>(
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

    return this.decode<T>(res);
  }

  /**
   * Multipart POST for uploads — mirrors the Coolie Web `api.postForm`.
   *
   * `Content-Type` is deliberately absent: only the runtime knows the multipart
   * boundary, so setting it by hand would produce a body the server cannot
   * parse.
   */
  private async postForm<T>(path: string, form: FormData): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.originHeader) headers.Origin = this.originHeader;
    Object.assign(headers, await this.getAuthHeader());

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      // React Native's FormData is not a DOM `BodyInit`; the cast keeps one
      // code path for both runtimes, which both accept the value as-is.
      body: form as unknown as BodyInit,
      credentials: "include",
    });

    return this.decode<T>(res);
  }

  /** Shared status/error handling for every transport in this client. */
  private async decode<T>(res: Response): Promise<T> {
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

  // --- agents -------------------------------------------------------------
  /**
   * Company agents — the same call the Coolie Web composer makes
   * (`agentsApi.list` → `GET /companies/:id/agents`) to fill its assignee rail.
   */
  async listAgents(companyId: string): Promise<Agent[]> {
    const body = await this.request<Agent[] | { agents?: Agent[] }>(
      "GET",
      `/api/companies/${encodeURIComponent(companyId)}/agents`,
    );
    return Array.isArray(body) ? body : (body.agents ?? []);
  }

  /**
   * Models an adapter can run — the same call the Coolie Web dialog makes
   * (`agentsApi.adapterModels` → `GET /companies/:id/adapters/:type/models`) to
   * fill its model-override picker.
   */
  async listAdapterModels(
    companyId: string,
    type: string,
    opts?: { provider?: string },
  ): Promise<AdapterModel[]> {
    const params = new URLSearchParams();
    if (opts?.provider) params.set("provider", opts.provider);
    const query = params.size > 0 ? `?${params.toString()}` : "";
    const body = await this.request<AdapterModel[] | { models?: AdapterModel[] }>(
      "GET",
      `/api/companies/${encodeURIComponent(companyId)}/adapters/${encodeURIComponent(type)}/models${query}`,
    );
    return Array.isArray(body) ? body : (body.models ?? []);
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

  /**
   * 收件箱快捷归档 —— 与 Coolie Web 的 `InboxArchiveButton` / `SwipeToArchive`
   * 同一个端点 (`POST /issues/:id/inbox-archive`)。归档是 per-user 的收件箱状态,
   * 不是删除任务: 任务本体和详情页都不受影响。
   */
  async archiveIssueFromInbox(
    issueId: string,
  ): Promise<{ id: string; archivedAt: string | Date }> {
    return this.request<{ id: string; archivedAt: string | Date }>(
      "POST",
      `/api/issues/${encodeURIComponent(issueId)}/inbox-archive`,
      {},
    );
  }

  /** 撤销收件箱归档 (`DELETE /issues/:id/inbox-archive`)。 */
  async unarchiveIssueFromInbox(
    issueId: string,
  ): Promise<{ id: string; archivedAt: string | Date } | { ok: true }> {
    return this.request<{ id: string; archivedAt: string | Date } | { ok: true }>(
      "DELETE",
      `/api/issues/${encodeURIComponent(issueId)}/inbox-archive`,
    );
  }

  /**
   * 派活 —— 设/清任务的 agent 负责人。
   * `PATCH /issues/:id`, body 走 `updateIssueSchema` 的 `assigneeAgentId` 字段。
   */
  async setIssueAssignee(issueId: string, assigneeAgentId: string | null): Promise<unknown> {
    return this.request<unknown>(
      "PATCH",
      `/api/issues/${encodeURIComponent(issueId)}`,
      { assigneeAgentId },
    );
  }

  /**
   * 收件箱三段聚合 (`GET /api/inbox`) —— 与 Coolie Web 收件箱同一份数据:
   * 待审批 / 受阻任务 / @我。
   */
  async getInbox(companyId: string, limit = 20): Promise<InboxFeed> {
    return this.request<InboxFeed>(
      "GET",
      `/api/inbox?companyId=${encodeURIComponent(companyId)}&limit=${limit}`,
    );
  }

  /**
   * Projects a task can be filed into — the same call the Coolie Web composer
   * makes (`projectsApi.list` → `GET /companies/:id/projects`).
   */
  async listProjects(companyId: string): Promise<Project[]> {
    const body = await this.request<Project[] | { projects?: Project[] }>(
      "GET",
      `/api/companies/${encodeURIComponent(companyId)}/projects`,
    );
    return Array.isArray(body) ? body : (body.projects ?? []);
  }

  /**
   * Labels a task can carry — `GET /companies/:id/labels`.
   *
   * The ids travel as `labelIds` on the create payload (the server joins them
   * through `issue_labels`), which is how the Coolie Web composer attaches tags.
   */
  async listLabels(companyId: string): Promise<IssueLabel[]> {
    const body = await this.request<IssueLabel[] | { labels?: IssueLabel[] }>(
      "GET",
      `/api/companies/${encodeURIComponent(companyId)}/labels`,
    );
    return Array.isArray(body) ? body : (body.labels ?? []);
  }

  /**
   * Attach a file to an existing task.
   *
   * Mirrors the Coolie Web composer (`issuesApi.uploadAttachment` →
   * `POST /companies/:companyId/issues/:issueId/attachments`): the task must
   * exist first, which is why the composers upload after the create call
   * instead of staging the file into the create body.
   */
  uploadAttachment(
    companyId: string,
    issueId: string,
    file: UploadFilePart,
    issueCommentId?: string | null,
  ): Promise<IssueAttachment> {
    const form = new FormData();
    // A native `{ uri, name, type }` part carries its own name, so the extra
    // filename argument is only for Blob parts (browsers).
    form.append("file", file as unknown as Blob);
    if (issueCommentId) form.append("issueCommentId", issueCommentId);
    return this.postForm<IssueAttachment>(
      `/api/companies/${encodeURIComponent(companyId)}/issues/${encodeURIComponent(issueId)}/attachments`,
      form,
    );
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
   *
   * mode="transcribe-only" returns the text without creating a task, for the
   * in-conversation mic where the user confirms before sending.
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
        mode: input.mode,
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
   * wave70 — Git provider 凭证列表 (App 端凭证管理屏使用).
   * 镜像 GET /api/git-credentials, 返回当前用户的元数据 (无 token).
   */
  async listGitCredentials(): Promise<GitCredential[]> {
    const body = await this.request<{ credentials?: GitCredential[] } | GitCredential[]>(
      "GET",
      "/api/git-credentials",
    );
    if (Array.isArray(body)) return body;
    return Array.isArray(body?.credentials) ? body.credentials : [];
  }

  /**
   * wave70 — 新建/覆盖一个 Git provider 凭证.
   * 镜像 POST /api/git-credentials, 返回存储后的元数据 (无 token).
   */
  async saveGitCredential(input: SaveGitCredentialInput): Promise<GitCredential> {
    const body = await this.request<{ credential?: GitCredential } | GitCredential>(
      "POST",
      "/api/git-credentials",
      input,
    );
    if (body && typeof body === "object" && "credential" in body && body.credential) {
      return body.credential;
    }
    return body as GitCredential;
  }

  /**
   * wave70 — 删除一个 Git provider 凭证.
   * 镜像 DELETE /api/git-credentials/:id.
   */
  async deleteGitCredential(id: string): Promise<void> {
    await this.request<unknown>("DELETE", `/api/git-credentials/${encodeURIComponent(id)}`);
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

  /**
   * Plant the instance data (nodes + edges) of one ontology domain.
   *
   * Complementary to `seedSampleDomains`: that action builds the *skeleton*
   * (object types and relation types), while the instance rows come from this
   * one. Calling only the skeleton action is why an instance could show seven
   * domains whose graphs were all empty.
   *
   * The action parameters must sit under `params`: the route forwards only
   * `body.params` to the worker, so flattening `companyId`/`domainId` to the top
   * level answers 502 `Missing required field: domainId`.
   */
  async seedDomainSamples(
    companyId: string,
    domainId: string,
  ): Promise<SeedDomainSamplesResult> {
    const res = await this.request<{ data?: SeedDomainSamplesResult }>(
      "POST",
      `/api/plugins/${ONTOLOGY_PLUGIN_ID}/actions/seed-samples`,
      { companyId, params: { companyId, domainId } },
    );
    return res.data ?? { seeded: false };
  }

  // ── Board Chat & Concierge Streaming (需求⑫ 驾驶舱问答) ────────────

  /**
   * 驾驶舱流式问答 (POST /api/board/chat/stream)
   * 消费 SSE text/event-stream 事件流 (start, status, chunk, done, error)
   */
  async streamBoardChat(
    input: BoardChatStreamInput,
    callbacks?: BoardChatStreamCallbacks,
  ): Promise<{ fullText: string; issueId?: string }> {
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    };
    if (this.originHeader) headers.Origin = this.originHeader;
    Object.assign(headers, await this.getAuthHeader());

    const res = await this.fetchImpl(`${this.baseUrl}/api/board/chat/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        companyId: input.companyId,
        message: input.message,
        taskId: input.taskId,
        ...(input.attachmentIds && input.attachmentIds.length > 0
          ? { attachmentIds: input.attachmentIds }
          : {}),
      }),
      signal: input.signal,
      credentials: "include",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const parsed = text ? safeJson(text) : null;
      const code =
        isRecord(parsed) && typeof parsed.code === "string"
          ? parsed.code
          : isRecord(parsed) && typeof parsed.error === "string"
            ? parsed.error
            : undefined;
      const message =
        (isRecord(parsed) && typeof parsed.message === "string" && parsed.message) ||
        (isRecord(parsed) && typeof parsed.error === "string" && parsed.error) ||
        `Board chat stream request failed: ${res.status}`;
      const err = new CoolieApiError(res.status, message, code, parsed);
      callbacks?.onError?.(err);
      throw err;
    }

    let buffer = "";
    let fullText = "";
    let resolvedIssueId: string | undefined = input.taskId;

    const dispatchLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const jsonStr = trimmed.replace(/^data:\s*/, "");
      if (!jsonStr) return;
      try {
        const event = JSON.parse(jsonStr) as BoardChatStreamEvent;
        callbacks?.onEvent?.(event);
        if (event.type === "start") {
          resolvedIssueId = event.issueId;
          callbacks?.onStart?.(event.issueId);
        } else if (event.type === "status") {
          callbacks?.onStatus?.(event.text);
        } else if (event.type === "chunk") {
          fullText += event.text;
          callbacks?.onChunk?.(event.text);
        } else if (event.type === "done") {
          if (event.issueId) resolvedIssueId = event.issueId;
          callbacks?.onDone?.(event);
        } else if (event.type === "error") {
          callbacks?.onError?.(event.message);
        }
      } catch {
        // Ignore partial/unparseable SSE lines
      }
    };

    if (res.body && typeof (res.body as any).getReader === "function") {
      const reader = (res.body as any).getReader();
      const decoder = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder
            ? decoder.decode(value, { stream: true })
            : typeof value === "string"
              ? value
              : String.fromCharCode(...value);
          buffer += chunk;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            dispatchLine(line);
          }
        }
      } catch (err: any) {
        if (input.signal?.aborted) {
          return { fullText, issueId: resolvedIssueId };
        }
        callbacks?.onError?.(err instanceof Error ? err : String(err));
        throw err;
      }
    } else if (res.body && Symbol.asyncIterator in (res.body as any)) {
      const decoder = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;
      try {
        for await (const value of res.body as any) {
          const chunk = decoder
            ? decoder.decode(value, { stream: true })
            : typeof value === "string"
              ? value
              : String.fromCharCode(...value);
          buffer += chunk;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            dispatchLine(line);
          }
        }
      } catch (err: any) {
        if (input.signal?.aborted) {
          return { fullText, issueId: resolvedIssueId };
        }
        callbacks?.onError?.(err instanceof Error ? err : String(err));
        throw err;
      }
    } else {
      const text = await res.text();
      for (const line of text.split("\n")) {
        dispatchLine(line);
      }
    }

    if (buffer.trim()) {
      dispatchLine(buffer);
    }

    return { fullText, issueId: resolvedIssueId };
  }

  /**
   * 获取任务评论列表 (GET /api/issues/:id/comments)
   */
  async listIssueComments(issueId: string): Promise<
    Array<{
      id: string;
      body: string;
      createdAt: string;
      authorUserId?: string | null;
      authorAgentId?: string | null;
    }>
  > {
    return this.request(
      "GET",
      `/api/issues/${encodeURIComponent(issueId)}/comments?order=asc`,
    );
  }

  /**
   * 获取驾驶舱问答历史会话 (基于常驻 "Board Operations" Issue)
   */
  async getBoardChatHistory(
    companyId: string,
    taskId?: string,
  ): Promise<{ issueId: string | null; messages: BoardChatMessage[] }> {
    let issueId = taskId;
    if (!issueId) {
      const issues = await this.listIssues(companyId, { limit: 50 });
      const boardIssue = issues.find(
        (i) =>
          i.title === "Board Operations" &&
          i.status !== "done" &&
          i.status !== "cancelled",
      );
      if (boardIssue) {
        issueId = boardIssue.id;
      }
    }

    if (!issueId) {
      return { issueId: null, messages: [] };
    }

    try {
      const comments = await this.listIssueComments(issueId);
      const messages: BoardChatMessage[] = comments.map((c) => ({
        id: c.id,
        role: !c.authorAgentId && c.authorUserId === "board-concierge" ? "assistant" : "user",
        text: c.body,
        createdAt: c.createdAt,
      }));
      return { issueId, messages };
    } catch {
      return { issueId, messages: [] };
    }
  }

  /**
   * 清空工坊对话框历史 (coolie fork wave71: 老板点 🗑️ 一键清空)。
   *
   * 实际是 DELETE /api/board/chat/conversation/:issueId?companyId=:companyId,
   * 会把该 issue 下所有未删除的评论软删 (deletedAt 标记), 会话本身保留。
   * 返回 { ok, deletedCount } — 前端拿 deletedCount 做「已清空 N 条」提示。
   */
  async clearBoardConversation(
    companyId: string,
    issueId: string,
  ): Promise<{ ok: boolean; deletedCount: number }> {
    return this.request<{ ok: boolean; deletedCount: number }>(
      "DELETE",
      `/api/board/chat/conversation/${encodeURIComponent(issueId)}?companyId=${encodeURIComponent(companyId)}`,
    );
  }

  // ── Approvals & Governance (快捷审批闭环) ───────────────────────────

  /**
   * 查询公司审批列表 (GET /api/companies/:companyId/approvals)
   */
  async listApprovals(
    companyId: string,
    opts?: string | ListApprovalsOptions,
  ): Promise<Approval[]> {
    const status = typeof opts === "string" ? opts : opts?.status;
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return this.request<Approval[]>(
      "GET",
      `/api/companies/${encodeURIComponent(companyId)}/approvals${query}`,
    );
  }

  /**
   * 查询审批单详情 (GET /api/approvals/:id)
   */
  async getApproval(id: string): Promise<Approval> {
    return this.request<Approval>("GET", `/api/approvals/${encodeURIComponent(id)}`);
  }

  /**
   * 同意/批准审批 (POST /api/approvals/:id/approve)
   */
  async approveApproval(id: string, decisionNote?: string): Promise<Approval> {
    return this.request<Approval>(
      "POST",
      `/api/approvals/${encodeURIComponent(id)}/approve`,
      { decisionNote },
    );
  }

  /**
   * 驳回审批 (POST /api/approvals/:id/reject)
   */
  async rejectApproval(id: string, decisionNote?: string): Promise<Approval> {
    return this.request<Approval>(
      "POST",
      `/api/approvals/${encodeURIComponent(id)}/reject`,
      { decisionNote },
    );
  }

  /**
   * 裁决审批 (一键同意或驳回，兼容 resolve / approve / reject 语义)
   */
  async resolveApproval(
    id: string,
    decisionOrOpts: "approve" | "reject" | ResolveApprovalOptions,
    decisionNote?: string,
  ): Promise<Approval> {
    const decision =
      typeof decisionOrOpts === "object" ? decisionOrOpts.decision : decisionOrOpts;
    const note =
      typeof decisionOrOpts === "object" ? decisionOrOpts.decisionNote : decisionNote;
    if (decision === "approve") {
      return this.approveApproval(id, note);
    }
    return this.rejectApproval(id, note);
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
