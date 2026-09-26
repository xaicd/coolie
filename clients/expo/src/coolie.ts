import * as SecureStore from "expo-secure-store";
import {
  CoolieApiError,
  CoolieClient as BaseCoolieClient,
  type Agent,
  type AgentIdentity,
  type Company,
  type Issue,
  type OntologyDomain,
  type Project,
  type SessionUser,
} from "@coolie/api-client";

export type { Project };

// ── Linear 设计系统色彩令牌 ─────────────────────────────────────────
// 单一来源在 src/theme.ts (与 Coolie Web 对齐); 这里再导出, 让 30+ 个
// `import { C } from "../coolie"` 的既有调用点无需改动。
export { C } from "./theme";

/**
 * Instance base URL. Override per build with `EXPO_PUBLIC_COOLIE_BASE_URL`
 * (Expo inlines `EXPO_PUBLIC_*` at bundle time), so one build can point at a
 * customer's private instance instead of ours.
 *
 * The default is the live HTTPS instance, so an installed build works out of the
 * box for anyone with an account on it. Local development points elsewhere:
 *
 *   EXPO_PUBLIC_COOLIE_BASE_URL=http://192.168.3.85:3100 npx expo run:ios --device
 *
 * The access below MUST stay a plain `process.env.EXPO_PUBLIC_COOLIE_BASE_URL`
 * member expression. babel-preset-expo inlines only that exact form; an optional
 * chain (`process?.env?.X`) compiles to an OptionalMemberExpression the inliner
 * does not match, so the value stayed a runtime lookup that resolves to
 * undefined in a release build. Every installed APK then silently fell back to
 * the default and could not reach the instance at all (measured on a 0.5.6 APK:
 * requests to 127.0.0.1 died with "Network request failed"). The `typeof` guard
 * keeps it safe in a host without a `process` global, and being a ternary does
 * not stop the inliner from matching the member expression.
 */
declare const process: { env?: Record<string, string | undefined> } | undefined;

const inlinedBaseUrl =
  typeof process !== "undefined" && process.env
    ? process.env.EXPO_PUBLIC_COOLIE_BASE_URL
    : undefined;

export const COOLIE_BASE_URL = inlinedBaseUrl ?? "https://xrobinai.cn";

/**
 * The origin this native client declares on every request.
 *
 * A native app sends no `Origin` header, and the host then refuses
 * cookie-authenticated mutations ("Board mutation requires trusted browser
 * origin", measured 403) — even though the same request succeeds with a bearer
 * credential. Declaring the instance's own origin is the same-origin evidence
 * the guard asks for, and it is derived from the target rather than configured,
 * so it cannot drift from where requests actually go.
 *
 * Parsed with a regex, not `URL`: React Native's `URL` is a partial polyfill and
 * this runs at import time, where a throw would take the whole app down.
 */
export const COOLIE_ORIGIN = /^(https?:\/\/[^/]+)/i.exec(COOLIE_BASE_URL)?.[1];

const AUTH_KEY = "coolie.authToken";
const SESSION_TOKEN_KEY = "coolie.sessionToken";

/**
 * Persist a bearer credential (agent API key or board API key). SecureStore keeps
 * it in the device keychain/keystore. Session cookies are not stored here — the
 * platform's own cookie jar holds them.
 */
export async function saveAuthToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(AUTH_KEY, token);
}
export async function clearAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync(AUTH_KEY);
}
export async function getAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(AUTH_KEY);
}

/**
 * Persist the Better Auth session token specifically for the WebContainerScreen
 * session bridge (/api/auth/exchange). Kept separate from AUTH_KEY so session tokens
 * are never mistaken for bearer tokens nor erased by bearer token classifiers.
 */
export async function saveSessionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
}
export async function clearSessionToken(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}
export async function getSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

/**
 * Resolve the token to use for WebContainerScreen session bridge.
 * Prioritizes the active session token; falls back to server query or board API key.
 */
export async function getWebExchangeToken(): Promise<string | null> {
  let token = await getSessionToken();
  if (!token) {
    try {
      const res = await coolie.getSessionToken();
      if (res?.token) {
        token = res.token;
        await saveSessionToken(token);
      }
    } catch {
      // Best effort
    }
  }
  if (!token) {
    token = await getAuthToken();
  }
  return token;
}

/**
 * 员工(agents)行。
 *
 * 形状来自 `@coolie/api-client` 的 `Agent` —— 与 Coolie Web 的 `agentsApi.list`
 * 同一个端点/同一份字段, 组件层 (ForRow / IssuesList 等) 30+ 处仍照旧名字引用。
 */
export type AgentRow = Agent;

/** 按智能体聚合的消耗行 — GET /costs/by-agent */
export interface AgentCostRow {
  agentId: string;
  agentName: string;
  agentStatus?: string;
  costCents: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  subscriptionRunCount?: number;
  apiRunCount?: number;
}

/** 任务树消耗汇总 — GET /issues/:id/cost-summary */
export interface IssueCostSummary {
  issueId: string;
  issueCount: number;
  costCents: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  runCount: number;
  runtimeMs: number;
}

export type { BoardChatMessage } from "@coolie/api-client";

/** 实时运行行 — GET /api/companies/:id/live-runs */
export interface LiveRunRow {
  id: string;
  agentId: string;
  agentName: string;
  status: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string | null;
  adapterType?: string | null;
}

/** 事件时间线活动者 */
export interface WorkTimelineActor {
  id: string;
  type: string;
  name: string;
  avatar?: string | null;
}

/** 事件时间线单条事件 */
export interface WorkTimelineEvent {
  actorId: string;
  kind: string;
  issueId: string;
  at: string;
}

/** 最近时间线结果 — GET /api/companies/:id/timeline */
export interface WorkTimelineResult {
  actors: WorkTimelineActor[];
  events: WorkTimelineEvent[];
  pagination?: {
    limit: number;
    offset: number;
    totalIssues: number;
    hasMore: boolean;
  };
}

/**
 * 收件箱聚合类型 —— 单一来源在 `@coolie/api-client` (App 与 h5 共用同一份),
 * 这里再导出, 让既有 `import { type InboxFeed } from "../coolie"` 的调用点无需改动。
 */
export type {
  InboxApprovalItem,
  InboxFailureItem,
  InboxMentionItem,
  InboxFeed,
} from "@coolie/api-client";

export type NotificationKind = "approval" | "failure" | "mention" | "activity";

/** 通知中心一条 — GET /api/notifications */
export interface NotificationItem {
  id: string;
  type: NotificationKind;
  title: string;
  body: string | null;
  target: { kind: "issue" | "approval"; id: string } | null;
  createdAt: string;
  read: boolean;
}

export interface NotificationFeed {
  notifications: NotificationItem[];
  unreadCount: number;
}

export interface SearchAgentResult {
  id: string;
  name: string;
  role: string;
  status: string;
}

export interface SearchTaskResult {
  id: string;
  title: string;
  status: string;
  priority: string;
  updatedAt: string;
}

export interface SearchDocumentResult {
  id: string;
  title: string;
  updatedAt: string;
}

/** 全局搜索结果 — GET /api/search */
export interface SearchResults {
  query: string;
  agents: SearchAgentResult[];
  tasks: SearchTaskResult[];
  documents: SearchDocumentResult[];
}

/** 注册输入 — POST /api/auth/register */
export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  companyName: string;
}

export interface RegisterResult {
  user: SessionUser;
  company: Company;
}

/** 员工技能快照 — GET /api/agents/:id/skills */
export interface AgentSkillsSnapshot {
  adapterType?: string;
  supported?: boolean;
  desiredSkills?: string[];
  entries?: Array<{ key: string; name?: string; description?: string }>;
  skills?: Array<{ key: string; name?: string; description?: string }>;
}

/** 员工配置详情 — GET /api/agents/:id/configuration */
export interface AgentConfiguration {
  id: string;
  companyId: string;
  name: string;
  adapterType: string;
  status: string;
  role?: string | null;
  title?: string | null;
  adapterConfig?: Record<string, unknown>;
  updatedAt?: string | null;
}

/** 任务评论 — GET /api/issues/:id/comments */
export interface IssueComment {
  id: string;
  body: string;
  createdAt: string;
  authorUserId?: string | null;
  authorAgentId?: string | null;
}

/** 任务附件 — GET /api/issues/:id/attachments */
export interface IssueAttachment {
  id: string;
  originalFilename?: string | null;
  filename?: string | null;
  contentType?: string | null;
  byteSize?: number | null;
  contentPath?: string;
  openPath?: string;
  downloadPath?: string;
}

/** 示例域骨架注入的逐域结果 — POST .../actions/seed-sample-domains */
export interface SeededDomainSummary {
  slug: string;
  displayName: string;
  status: "created" | "skipped-existing" | "failed";
  nodeTypes?: number;
  relationTypes?: number;
  withEndpoints?: number;
  reason?: string;
}

/**
 * 一条 pipeline 列表行 — GET /api/companies/:id/pipelines
 * (paperclip 上游路由, 只读复用; 这里只取列表要展示的字段)
 */
export interface PipelineListRow {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  archivedAt?: string | null;
  stageCount: number;
  openCaseCount?: number;
  inMotionCount?: number;
  attentionCount?: number;
  lastActivityAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** 示例域骨架注入报告 — POST .../actions/seed-sample-domains */
export interface SeedSampleDomainsReport {
  domains: SeededDomainSummary[];
  created: number;
  skipped: number;
  failed: number;
}

export class CoolieClient extends BaseCoolieClient {
  /** GET /api/companies/:id/costs/by-agent — 按智能体聚合 token/花费 */
  async costsByAgent(companyId: string): Promise<AgentCostRow[]> {
    return this.request<AgentCostRow[]>(
      "GET",
      `/api/companies/${encodeURIComponent(companyId)}/costs/by-agent`,
    );
  }

  /** GET /api/issues/:id/cost-summary — 单任务(含子任务)消耗 */
  async issueCostSummary(issueId: string): Promise<IssueCostSummary> {
    return this.request<IssueCostSummary>(
      "GET",
      `/api/issues/${encodeURIComponent(issueId)}/cost-summary`,
    );
  }

  /** PATCH /api/agents/:id — 改员工(状态/头衔等) */
  async updateAgent(
    agentId: string,
    fields: { status?: string; title?: string | null; name?: string },
  ): Promise<AgentRow> {
    return this.request<AgentRow>(
      "PATCH",
      `/api/agents/${encodeURIComponent(agentId)}`,
      fields,
    );
  }

  /** GET /api/approvals/:id/issues — 审批单关联的任务 (详情深链 / 气泡关联任务链接) */
  async getApprovalIssues(approvalId: string): Promise<Issue[]> {
    return this.request<Issue[]>(
      "GET",
      `/api/approvals/${encodeURIComponent(approvalId)}/issues`,
    );
  }

  /** PATCH /api/issues/:id — 改任务状态 */
  async updateIssueStatus(issueId: string, status: string): Promise<unknown> {
    return this.request<unknown>(
      "PATCH",
      `/api/issues/${encodeURIComponent(issueId)}`,
      { status },
    );
  }

  /** GET /api/companies/:id/live-runs — 正在运行的 run 数 + agent 名 */
  async getLiveRuns(companyId: string): Promise<LiveRunRow[]> {
    return this.request<LiveRunRow[]>(
      "GET",
      `/api/companies/${encodeURIComponent(companyId)}/live-runs`,
    );
  }

  /** GET /api/companies/:id/timeline — 最近事件流 */
  async getTimeline(
    companyId: string,
    limit: number = 8,
  ): Promise<WorkTimelineResult> {
    return this.request<WorkTimelineResult>(
      "GET",
      `/api/companies/${encodeURIComponent(companyId)}/timeline?limit=${limit}`,
    );
  }

  /** GET /api/agents/:id/skills — 员工配置与技能 */
  async getAgentSkills(agentId: string): Promise<AgentSkillsSnapshot> {
    return this.request<AgentSkillsSnapshot>(
      "GET",
      `/api/agents/${encodeURIComponent(agentId)}/skills`,
    );
  }

  /** GET /api/agents/:id/configuration — 员工详细配置 */
  async getAgentConfiguration(agentId: string): Promise<AgentConfiguration> {
    return this.request<AgentConfiguration>(
      "GET",
      `/api/agents/${encodeURIComponent(agentId)}/configuration`,
    );
  }

  /** POST /api/issues/:id/comments — 新增任务评论 */
  async addIssueComment(issueId: string, body: string): Promise<IssueComment> {
    return this.request<IssueComment>(
      "POST",
      `/api/issues/${encodeURIComponent(issueId)}/comments`,
      { body },
    );
  }

  /** GET /api/issues/:id/comments — 获取任务评论列表 */
  async getIssueComments(issueId: string): Promise<IssueComment[]> {
    return this.request<IssueComment[]>(
      "GET",
      `/api/issues/${encodeURIComponent(issueId)}/comments?order=asc`,
    );
  }

  /** GET /api/issues/:id/attachments — 获取任务附件列表 */
  async getIssueAttachments(issueId: string): Promise<IssueAttachment[]> {
    return this.request<IssueAttachment[]>(
      "GET",
      `/api/issues/${encodeURIComponent(issueId)}/attachments`,
    );
  }

  /** PATCH /api/issues/:id — 修改任务优先级 */
  async updateIssuePriority(
    issueId: string,
    priority: string,
  ): Promise<unknown> {
    return this.request<unknown>(
      "PATCH",
      `/api/issues/${encodeURIComponent(issueId)}`,
      { priority },
    );
  }

  /**
   * POST /api/plugins/paperclipai.plugin-ontology/actions/seed-sample-domains
   *
   * 注入示例本体域——只建骨架(对象类型 + 关系类型),**不含实例节点/边**。
   * 返回逐域报告,调用方靠 `status === "created"` 分辨这次真正建了哪些域,
   * 再拿 slug 去 `seedDomainSamples` 补实例。
   */
  async seedSampleDomains(companyId: string): Promise<SeedSampleDomainsReport> {
    const res = await this.request<{ data?: SeedSampleDomainsReport }>(
      "POST",
      "/api/plugins/paperclipai.plugin-ontology/actions/seed-sample-domains",
      { companyId },
    );
    return res.data ?? { domains: [], created: 0, skipped: 0, failed: 0 };
  }

  /**
   * POST /api/plugins/paperclipai.plugin-ontology/actions/seed-samples
   *
   * 为单个域补种实例节点与关系。参数走 `params` 下(见基类说明),平铺会被
   * 路由拒绝。
   */
  seedDomainSamples(companyId: string, domainId: string) {
    return super.seedDomainSamples(companyId, domainId);
  }

  /**
   * POST /api/plugins/paperclipai.plugin-ontology/actions/create-domain
   *
   * 新建本体域，支持关联文件夹目录/代码工程路径。
   */
  async createOntologyDomain(
    companyId: string,
    params: {
      slug: string;
      displayName: string;
      description?: string;
      category?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<OntologyDomain> {
    const res = await this.request<{ data?: { domain?: OntologyDomain }; domain?: OntologyDomain }>(
      "POST",
      "/api/plugins/paperclipai.plugin-ontology/actions/create-domain",
      {
        companyId,
        ...params,
      },
    );
    const domain = res.data?.domain ?? res.domain;
    if (!domain) {
      throw new Error("创建本体域失败: 服务端未返回有效域对象");
    }
    return domain;
  }

  /**
   * POST /api/auth/register — 自助注册。
   *
   * 服务端经 Better Auth 建账号并顺带建首个公司,响应已带会话 cookie,
   * 所以注册成功即是登录成功(用返回的 user 直接进主页)。
   */
  async register(input: RegisterInput): Promise<RegisterResult> {
    return this.request<RegisterResult>("POST", "/api/auth/register", input, { auth: false });
  }

  /** GET /api/notifications — 通知中心列表 + 未读数 */
  async listNotifications(companyId: string, limit = 20): Promise<NotificationFeed> {
    return this.request<NotificationFeed>(
      "GET",
      `/api/notifications?companyId=${encodeURIComponent(companyId)}&limit=${limit}`,
    );
  }

  /** PATCH /api/notifications/:id/read — 标记单条已读 */
  async markNotificationRead(id: string, companyId: string): Promise<{ id: string; read: boolean }> {
    return this.request<{ id: string; read: boolean }>(
      "PATCH",
      `/api/notifications/${encodeURIComponent(id)}/read?companyId=${encodeURIComponent(companyId)}`,
    );
  }

  /**
   * GET /api/companies/:id/pipelines — 公司全部 pipeline (只读)。
   *
   * 直接复用 paperclip 上游列表路由 (server/src/routes/pipelines.ts); 创建/编辑仍在
   * Coolie Web 的 PipelineEditor 里做, App 只列 + 深链过去, 不在这边重发明编辑器。
   */
  async listPipelines(companyId: string): Promise<PipelineListRow[]> {
    return this.request<PipelineListRow[]>(
      "GET",
      `/api/companies/${encodeURIComponent(companyId)}/pipelines`,
    );
  }

  /**
   * plan 任务列表 — 服务端没有 plans 端点 (见 BoardChatScreen.startPlan)。
   * wave19 起 plan 以标题 `Plan: xxx` 的任务承载, 这里按标题前缀过滤,
   * 与创建侧同一个约定, 不另立一套模型。
   */
  async listPlanIssues(companyId: string): Promise<Issue[]> {
    const issues = await this.listIssues(companyId, { limit: 200 });
    return issues.filter((issue) => /^plan[:\s]/i.test(issue.title.trim()));
  }

  /** GET /api/search — 全局搜索 (员工/任务/文档) */
  async search(companyId: string, q: string): Promise<SearchResults> {
    return this.request<SearchResults>(
      "GET",
      `/api/search?companyId=${encodeURIComponent(companyId)}&q=${encodeURIComponent(q)}`,
    );
  }
}

/**
 * Shared Coolie client. Auth is either a bearer token from SecureStore or the
 * session cookie the platform's own cookie jar holds after sign-in; both travel
 * in the same `Authorization`/`Cookie` headers RN already manages.
 */
export const coolie = new CoolieClient({
  baseUrl: COOLIE_BASE_URL,
  originHeader: COOLIE_ORIGIN,
  // Explicit return type: without it the unauth branch infers as
  // `{ Authorization?: undefined }`, which is not a `Record<string, string>`.
  getAuthHeader: async (): Promise<Record<string, string>> => {
    const token = await getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});

/** How we got in. Decides whether a company has to be chosen. */
export type Credential =
  | { kind: "agent"; token: string; identity: AgentIdentity }
  | { kind: "board"; token: string }
  | { kind: "session"; user: SessionUser };

function probeWith(token: string): CoolieClient {
  return new CoolieClient({
    baseUrl: COOLIE_BASE_URL,
    originHeader: COOLIE_ORIGIN,
    getAuthHeader: () => ({ Authorization: `Bearer ${token}` }),
  });
}

/**
 * Work out what a pasted bearer token is by using it, rather than by asking the
 * user to say. Both kinds arrive in the same `Authorization: Bearer` header and
 * the host prefers board keys, so `GET /api/agents/me` is the discriminator: an
 * agent key answers 200 there, a board key answers 401 ("Agent authentication
 * required") and then lists companies.
 *
 * A bad key fails both probes, which is the point — the app should say "this key
 * isn't accepted", not show an empty task list.
 */
export async function classifyToken(token: string): Promise<Credential> {
  const probe = probeWith(token);
  try {
    return { kind: "agent", token, identity: await probe.getAgentIdentity() };
  } catch (e) {
    if (!(e instanceof CoolieApiError) || e.status === 0) throw e;
  }
  try {
    await probe.listCompanies();
    return { kind: "board", token };
  } catch (e) {
    throw new Error(
      `This instance did not accept that key (${
        e instanceof CoolieApiError ? `${e.status} ${e.message}` : String(e)
      }).`,
    );
  }
}

/**
 * Sign in with email and password, returning the session user.
 *
 * Any stored bearer token is cleared first: the shared client sends both, and a
 * stale token would shadow the session cookie for every later call. The
 * session cookie Better Auth mints is also captured into `expo-secure-store`
 * so `WebContainerScreen` can replay it through `/api/auth/exchange` and the
 * Web full-feature board inherits the App's session — otherwise the WebView's
 * own cookie jar never sees the cookie and the user lands on the sign-in
 * screen again.
 */
export async function signInWithEmail(input: {
  email: string;
  password: string;
}): Promise<SessionUser> {
  await clearAuthToken();
  await clearSessionToken();
  const result = await coolie.signInEmail(input);
  let sessionToken = result.token;
  if (!sessionToken) {
    try {
      const fetched = await coolie.getSessionToken();
      if (fetched?.token) sessionToken = fetched.token;
    } catch {
      // Best-effort
    }
  }
  if (sessionToken) {
    await saveSessionToken(sessionToken);
  }
  const session = await coolie.getSession();
  if (!session?.user) {
    throw new Error("Signed in, but this instance returned no session for the account.");
  }
  return session.user;
}

/** The signed-in user, or null when there is no usable session. */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    return (await coolie.getSession())?.user ?? null;
  } catch {
    return null;
  }
}

/**
 * Drop both credentials: the stored bearer token, and the session server-side.
 * Signing out of only one leaves the other to sign the user back in on relaunch.
 * The server call is best-effort — a signed-out user should not be stuck on a
 * spinner because the instance is unreachable.
 */
export async function signOutEverywhere(): Promise<void> {
  await clearAuthToken();
  await clearSessionToken();
  try {
    await coolie.signOut();
  } catch {
    // Already signed out, or offline: the local credential is gone either way.
  }
}

/**
 * Who is signed in on this launch, if anyone: a stored bearer token first (it is
 * explicit), else a session the cookie jar still holds. A token the instance no
 * longer accepts is dropped here, turning a revoked key into the sign-in screen
 * rather than a screen full of 401s.
 */
export async function restoreCredential(): Promise<Credential | null> {
  const token = await getAuthToken();
  if (token) {
    try {
      return await classifyToken(token);
    } catch {
      await clearAuthToken();
    }
  }
  const user = await getSessionUser();
  if (user) {
    const currentSessionToken = await getSessionToken();
    if (!currentSessionToken) {
      try {
        const fetched = await coolie.getSessionToken();
        if (fetched?.token) {
          await saveSessionToken(fetched.token);
        }
      } catch {
        // Best-effort
      }
    }
    return { kind: "session", user };
  }
  return null;
}

/**
 * The companies this credential may act in. An agent key is scoped to exactly
 * one and cannot list companies at all, so it takes its single company from
 * `GET /api/agents/me`. A board key or a session sees whatever it is a member of,
 * which may be nothing — the UI has to say so rather than show an empty board.
 */
export async function credentialCompanies(cred: Credential): Promise<Company[]> {
  if (cred.kind === "agent") {
    return [await coolie.getCompany(cred.identity.companyId)];
  }
  return coolie.listCompanies();
}
