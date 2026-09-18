import {
  ASR_NOT_CONFIGURED,
  MULTIMODAL_PLUGIN_ID,
  type AgentIdentity,
  type CockpitDashboardMetrics,
  type Company,
  type CreateIssueInput,
  type DashboardSummary,
  type Issue,
  type SessionUser,
  type VoiceDispatchInput,
  type VoiceDispatchResult,
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
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "CoolieApiError";
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
