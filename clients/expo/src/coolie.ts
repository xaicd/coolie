import * as SecureStore from "expo-secure-store";
import {
  CoolieApiError,
  CoolieClient as BaseCoolieClient,
  type AgentIdentity,
  type Company,
  type Issue,
  type SessionUser,
} from "@coolie/api-client";

// ── Linear 设计系统色彩令牌 (DESIGN.md 第1节) ─────────────────────────
export const C = {
  // 背景三层(亮度阶梯 = 海拔)
  bg: "#08090A", // 页面最底(marketing black)
  panel: "#0F1011", // 侧栏/面板
  surface: "#191A1B", // 卡片/浮层
  surfaceHover: "#28282C",
  // 文字四级
  ink: "#F7F8F8", // 主文字(不是纯白!)
  ink2: "#D0D6E0", // 次文字
  ink3: "#8A8F98", // 占位/元数据
  ink4: "#62666D", // 时间戳/禁用
  // 品牌色(全 App 唯一彩色,只用于 CTA/激活/选中)
  brand: "#5E6AD2", // 按钮底/品牌标记
  accent: "#7170FF", // 链接/激活态
  accentHover: "#828FFF",
  // 状态(仅状态指示)
  ok: "#27A644",
  done: "#10B981",
  warn: "#F59E0B",
  err: "#EF4444",
  // 边框(半透明白,不用实色深边)
  line: "rgba(255,255,255,0.08)",
  lineSubtle: "rgba(255,255,255,0.05)",
} as const;

/**
 * Instance base URL. Override per build with `EXPO_PUBLIC_COOLIE_BASE_URL`
 * (Expo inlines `EXPO_PUBLIC_*` at bundle time), so one build can point at a
 * customer's private instance instead of ours.
 *
 * The default is the live HTTPS instance, so an installed build works out of the
 * box for anyone with an account on it. Local development points elsewhere:
 *
 *   EXPO_PUBLIC_COOLIE_BASE_URL=http://192.168.3.85:3100 npx expo run:ios --device
 */
declare const process: { env?: Record<string, string | undefined> } | undefined;

export const COOLIE_BASE_URL =
  process?.env?.EXPO_PUBLIC_COOLIE_BASE_URL ?? "https://xrobinai.cn";

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
 * Shared Coolie client. Auth is either a bearer token from SecureStore or the
 * session cookie the platform's own cookie jar holds after sign-in; both travel
 * in the same `Authorization`/`Cookie` headers RN already manages.
 */
/** 员工(agents)行的最小字段 */
export interface AgentRow {
  id: string;
  name: string;
  title?: string | null;
  role?: string | null;
  status: string;
  adapterType?: string | null;
}

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

/** 收件箱一条待审批 — GET /api/inbox */
export interface InboxApprovalItem {
  id: string;
  title: string;
  type: string;
  status: string;
  createdAt: string;
}

/** 收件箱一条受阻任务 — GET /api/inbox */
export interface InboxFailureItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  updatedAt: string;
}

/** 收件箱一条 @提及 — GET /api/inbox */
export interface InboxMentionItem {
  id: string;
  issueId: string;
  issueTitle: string;
  body: string;
  authorName: string;
  createdAt: string;
}

/** 收件箱三段聚合 — GET /api/inbox */
export interface InboxFeed {
  pendingApprovals: InboxApprovalItem[];
  failures: InboxFailureItem[];
  mentionedBy: InboxMentionItem[];
}

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

  /** GET /api/companies/:id/agents — 员工(智能体)列表 */
  async listAgents(companyId: string): Promise<AgentRow[]> {
    return this.request<AgentRow[]>(
      "GET",
      `/api/companies/${encodeURIComponent(companyId)}/agents`,
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
   * POST /api/auth/register — 自助注册。
   *
   * 服务端经 Better Auth 建账号并顺带建首个公司,响应已带会话 cookie,
   * 所以注册成功即是登录成功(用返回的 user 直接进主页)。
   */
  async register(input: RegisterInput): Promise<RegisterResult> {
    return this.request<RegisterResult>("POST", "/api/auth/register", input, { auth: false });
  }

  /** GET /api/inbox — 收件箱三段聚合 (待审批/受阻/@我) */
  async getInbox(companyId: string, limit = 20): Promise<InboxFeed> {
    return this.request<InboxFeed>(
      "GET",
      `/api/inbox?companyId=${encodeURIComponent(companyId)}&limit=${limit}`,
    );
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

  /** GET /api/search — 全局搜索 (员工/任务/文档) */
  async search(companyId: string, q: string): Promise<SearchResults> {
    return this.request<SearchResults>(
      "GET",
      `/api/search?companyId=${encodeURIComponent(companyId)}&q=${encodeURIComponent(q)}`,
    );
  }
}

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
 * stale token would shadow the session cookie for every later call.
 */
export async function signInWithEmail(input: {
  email: string;
  password: string;
}): Promise<SessionUser> {
  await clearAuthToken();
  await coolie.signInEmail(input);
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
  return user ? { kind: "session", user } : null;
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
