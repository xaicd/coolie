import {
  ASR_NOT_CONFIGURED,
  MULTIMODAL_PLUGIN_ID,
  type Company,
  type CreateIssueInput,
  type Issue,
  type SessionUser,
  type VoiceDispatchInput,
  type VoiceDispatchResult,
} from "./types.js";

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

  constructor(opts: CoolieClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.getAuthHeader = opts.getAuthHeader ?? (() => ({}));
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
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

  // --- companies ----------------------------------------------------------
  async listCompanies(): Promise<Company[]> {
    const body = await this.request<{ companies?: Company[] } | Company[]>("GET", "/api/companies");
    return Array.isArray(body) ? body : (body.companies ?? []);
  }

  // --- tasks (issues) -----------------------------------------------------
  async listIssues(companyId: string, opts?: { status?: string; limit?: number }): Promise<Issue[]> {
    const q = new URLSearchParams({ companyId });
    if (opts?.status) q.set("status", opts.status);
    if (opts?.limit) q.set("limit", String(opts.limit));
    const body = await this.request<{ issues?: Issue[] } | Issue[]>("GET", `/api/issues?${q.toString()}`);
    return Array.isArray(body) ? body : (body.issues ?? []);
  }
  async createIssue(input: CreateIssueInput): Promise<Issue> {
    const body = await this.request<{ issue?: Issue } | Issue>("POST", "/api/issues", input);
    return isRecord(body) && "issue" in body ? (body.issue as Issue) : (body as Issue);
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
