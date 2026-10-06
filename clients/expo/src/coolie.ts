import * as SecureStore from "expo-secure-store";
import {
  CoolieApiError,
  CoolieClient as BaseCoolieClient,
  type Agent,
  type AgentIdentity,
  type Company,
  type Issue,
  type IssueStatus,
  type OntologyDomain,
  type OntologyGraphResponse,
  type OntologyGraphResponseEdge,
  type OntologyLevelsResponse,
  type OntologyStatsResponse,
  type Project,
  type SessionUser,
  // wave342: 本体工作台 14 视图只读行类型
  type OntologyActionType,
  type OntologyConnector,
  type OntologyDataset,
  type OntologyFunction,
  type OntologyInterface,
  type OntologyNodeType,
  type OntologyRelationType,
  type OntologyTransform,
} from "@coolie/api-client";

export type { OntologyGraphResponse, Project, OntologyStatsResponse };

// ── Linear 设计系统色彩令牌 ─────────────────────────────────────────
// 单一来源在 src/theme.ts (与 Coolie Web 对齐); 这里再导出, 让 30+ 个
// `import { C } from "../coolie"` 的既有调用点无需改动。
export { C } from "./theme";

// ── Instance target ─────────────────────────────────────────────────
// The base-URL decision lives in its own dependency-free module; re-exported
// here so the 6+ `import { COOLIE_BASE_URL } from "../coolie"` call sites (and
// the App) keep working unchanged.
export {
  COOLIE_BASE_URL,
  COOLIE_ORIGIN,
  DEV_INSTANCE_BASE_URL,
  PROD_INSTANCE_BASE_URL,
  detectApiBaseUrl,
} from "./instanceTarget";
import { COOLIE_BASE_URL, COOLIE_ORIGIN, detectApiBaseUrl, originOf } from "./instanceTarget";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const AUTH_KEY = "coolie.authToken";
const SESSION_TOKEN_KEY = "coolie.sessionToken";
const SESSION_COOKIE_NAME_KEY = "coolie.sessionCookieName";
const LAST_EMAIL_KEY = "coolie.lastEmail";

/**
 * The cookie name Better Auth writes on an HTTPS deployment when sign-in's
 * `Set-Cookie` could not be read back (React Native's `Headers` polyfill does
 * not always expose `set-cookie`). Parsing the response is still the primary
 * path — `extractSessionCookieName` is tried first — but every replay needs a
 * name, and a replay under a guessed alias is silently ignored by Better Auth
 * (wave96). This default removes that last failure mode on prod HTTPS.
 */
const DEFAULT_SESSION_COOKIE_NAME = "__Secure-paperclip-default.session_token";

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
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, normalizeSessionTokenValue(token));
}
export async function clearSessionToken(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  await SecureStore.deleteItemAsync(SESSION_COOKIE_NAME_KEY);
}
export async function getSessionToken(): Promise<string | null> {
  const stored = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  return stored ? normalizeSessionTokenValue(stored) : stored;
}

/**
 * Better Auth's session cookie wire value is `encodeURIComponent(<signed>)`;
 * versions before 0.5.70 stored that wire form (percent-encoded `%2F`/`%2B`
 * inside the HMAC suffix) straight out of the sign-in `Set-Cookie` header.
 * Every consumer here wants the logical value: replaying it as a `Cookie`
 * header or in the `/api/auth/exchange` URL encodes it exactly once, matching
 * the one layer Better Auth decodes on read. With the wire form stored, both
 * paths double-encoded — the exchange validated but minted a cookie the
 * WebView's next `get-session` rejected with 401, landing the user on the
 * sign-in page inside the App (wave100). Raw hex/base64 tokens never contain
 * `%`, so a `%` reliably marks a legacy wire-form value.
 */
function normalizeSessionTokenValue(value: string): string {
  if (!value.includes("%")) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * The exact cookie name the instance wrote at sign-in (`__Secure-paperclip-default.session_token`
 * on prod HTTPS). Better Auth reads the session back only under the name it wrote,
 * so the replay in `getAuthHeader` must use this name — a guessed alias
 * (`paperclip.session_token`) is silently ignored, which is how the App↔Web
 * session bridge came up empty (wave96 real-device trace).
 */
export async function saveSessionCookieName(name: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_COOKIE_NAME_KEY, name);
}
export async function getSessionCookieName(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_COOKIE_NAME_KEY);
}

/**
 * Remember the last email that signed in, to prefill the sign-in form. The
 * password is deliberately NOT stored: a device-local copy of a user password
 * is a credential the app never needs — the signed session cookie is the
 * credential (see `getSessionCookieHeaderValue`), and a session that expires is
 * re-authenticated by the user, not by the app replaying their password.
 */
export async function saveLastEmail(email: string): Promise<void> {
  const trimmed = email.trim();
  if (trimmed) await SecureStore.setItemAsync(LAST_EMAIL_KEY, trimmed);
}
export async function getLastEmail(): Promise<string | null> {
  return SecureStore.getItemAsync(LAST_EMAIL_KEY);
}

/**
 * The `Cookie` request header value that replays the stored Better Auth
 * session, or null when there is no stored session.
 *
 * This is the fix for wave129 P1-B. Better Auth resolves a session only from
 * the signed cookie it wrote (`resolveSession` → `getSession`). The App's
 * native `fetch` runs on the platform networking stack, not the app's WebView,
 * and its cookie jar does not reliably carry the `Set-Cookie` from
 * `POST /api/auth/sign-in/email` across the subsequent `GET /api/auth/get-session`
 * (measured: sign-in 200, then get-session → 401 "Board authentication
 * required"; the same signed value sent explicitly → 200). Sending the signed
 * value ourselves removes the dependence on that jar.
 *
 * The value is re-encoded once (`encodeURIComponent`): Better Auth writes the
 * cookie as `encodeURIComponent(<signed>)` and decodes exactly one layer on
 * read, while `saveSessionToken` stores the logical form.
 */
export async function getSessionCookieHeaderValue(): Promise<string | null> {
  const token = await getSessionToken();
  if (!token) return null;
  const name = (await getSessionCookieName()) ?? DEFAULT_SESSION_COOKIE_NAME;
  return `${name}=${encodeURIComponent(token)}`;
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
 * 同一个端点/同一份字段, IssuesList 等组件层仍照旧名字引用。
 * (2026-10-04 走查注: 原注提到的 ForRow 已零挂载 — composer 精简后遗留, 见 COOA-4。)
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

// ── 本体图谱控制面契约 (wave332) ────────────────────────────────────────
// 镜像 `@paperclipai/shared` 的本体图谱契约 (web 端 ui/src/api/ontologyGraph.ts
// 消费的同一份)。api-client 刻意不依赖 shared (见其 types.ts 的 mirror 先例),
// App 层沿用同一做法; 源头变更时先改 packages/shared 再同步这里。

/** 关系可指向的对象种类 — 镜像 shared 的 ENTITY_TYPES / EntityType。 */
export type EntityType =
  | "company"
  | "project"
  | "issue"
  | "spec"
  | "conversation"
  | "work_product"
  | "attachment"
  | "comment"
  | "agent";

/** 图谱预设视图 — 镜像 shared 的 ONTOLOGY_GRAPH_VIEWS / OntologyGraphView。 */
export type OntologyGraphView =
  | "project_tree"
  | "agent_dashboard"
  | "conversation_thread";

/** src→target 的一条关系路径 — 镜像 shared 的 OntologyPath (边即图谱响应的边)。 */
export interface OntologyPath {
  /** 节点键 (`type:id`) 依次排列, src 开头 / target 结尾。 */
  nodeKeys: string[];
  edges: OntologyGraphResponseEdge[];
  length: number;
}

/** GET /ontology/paths 响应 — 镜像 shared 的 OntologyPathsResponse。 */
export interface OntologyPathsResponse {
  src: { type: EntityType; id: string } | null;
  target: { type: EntityType; id: string } | null;
  maxDepth: number;
  paths: OntologyPath[];
}

/** wave342: 认知扫描任务行 (镜像 ontology-core 的 OntologyCognitionJobRow 投影) */
export interface OntologyCognitionJobRow {
  id: string;
  job_key: string;
  app_name: string;
  root_path: string;
  status: string;
  stage_label: string;
  progress_pct: number;
}

/** wave342: 能力缺口行 (镜像 ontology-core 的 CapabilityGapRow 投影) */
export interface OntologyCapabilityGapRow {
  id: string;
  gap_key: string;
  title: string;
  status: string;
  priority: string;
  detected_from: string;
}

export class CoolieClient extends BaseCoolieClient {
  /**
   * Point this client at another instance, at runtime.
   *
   * The base client caches `baseUrl` / `originHeader` in its constructor and
   * every request reads them back from the instance. At runtime those are plain
   * own properties (TS `private readonly` is compile-time only), so re-pointing
   * them here is what makes an in-session switch — an emulator build talking to
   * the local dev instance — actually take effect, instead of only on the next
   * launch. The origin is re-derived from the new base URL so the two cannot
   * drift apart.
   */
  setApiBaseUrl(baseUrl: string): void {
    const trimmed = baseUrl.replace(/\/+$/, "");
    const target = this as unknown as { baseUrl: string; originHeader?: string };
    target.baseUrl = trimmed;
    target.originHeader = originOf(trimmed);
  }

  /**
   * 公司级紧急熔断 (wave105) — 董事会一键停掉本公司所有派单。
   * Heartbeat 守门 companies.status="active" — pause 后立即停派。
   */
  async emergencyStop(
    companyId: string,
    reason: string,
    reasonKind: "manual" | "budget" | "compliance" | "anomaly" = "manual",
  ): Promise<{ ok: boolean; company?: Company; alreadyPaused?: boolean }> {
    return this.request(
      "POST",
      `/api/companies/${encodeURIComponent(companyId)}/emergency-stop`,
      { reason, reasonKind },
    );
  }

  /** 解除公司熔断。 */
  async emergencyResume(
    companyId: string,
  ): Promise<{ ok: boolean; company?: Company; notPaused?: boolean }> {
    return this.request(
      "POST",
      `/api/companies/${encodeURIComponent(companyId)}/emergency-resume`,
    );
  }

  /** POST /api/companies/:id/projects — 原生极速立项 */
  async createProject(
    companyId: string,
    input: {
      name: string;
      description?: string;
      status?: "planned" | "in_progress";
      targetDate?: string;
      /** 代码源 = Git 仓库地址 (可多个) */
      repositoryUrls?: string[];
      workspace?: {
        name?: string;
        sourceType?: string;
        cwd?: string;
        repoUrl?: string;
        branch?: string;
      };
      /** 组织托管 = 独立属性, 自动识别远端组织并上传 (false 明确不托管) */
      hostedRemote?: boolean;
    },
  ): Promise<Project> {
    return this.request<Project>(
      "POST",
      `/api/companies/${encodeURIComponent(companyId)}/projects`,
      input,
    );
  }

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

  /**
   * 看板拖拽换状态 — `PATCH /api/companies/:companyId/issues/:id/status`。
   * wave213: 走专门 status 端点, 服务端校验转换合法性
   * (backlog→todo 需指派 / in_progress→done 需产物),
   * 失败返回 422 + code, 客户端可识别并做 Toast + 回弹。
   */
  async updateIssueStatus(
    companyId: string,
    issueId: string,
    status: IssueStatus,
  ): Promise<Issue> {
    const body = await this.request<{ issue?: Issue } | Issue>(
      "PATCH",
      `/api/companies/${encodeURIComponent(companyId)}/issues/${encodeURIComponent(issueId)}/status`,
      { status },
    );
    return isRecord(body) && "issue" in body ? (body.issue as Issue) : (body as Issue);
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

  /** GET /api/issues/:id — 获取单个任务真实实体 */
  async getIssue(issueId: string): Promise<Issue> {
    return this.request<Issue>(
      "GET",
      `/api/issues/${encodeURIComponent(issueId)}`,
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

  // ── wave342: 本体工作台 14 视图只读数据面 ──────────────────────────
  // 8 个域级 list GET (node-types / relation-types / action-types /
  // functions / interfaces / datasets / connectors / transforms) + 2 个
  // 公司级 list GET (cognition-jobs / capability-gaps), 全部走插件 HTTP
  // 面 /api/plugins/paperclipai.plugin-ontology/api/<path> —— 与 web 端
  // usePluginData 同一批 worker handler, 响应一律 { <key>: rows } 包裹,
  // 展开方式与基类 listOntologyDomains 同款 (防插件包装漂移)。

  /** GET 插件 api 面: query 统一带 companyId (+domainId), 取响应中的数组字段 */
  private async pluginApiList<T>(
    path: string,
    key: string,
    companyId: string,
    domainId?: string,
    extra?: Record<string, string>,
  ): Promise<T[]> {
    const q = new URLSearchParams({ companyId });
    if (domainId) q.set("domainId", domainId);
    for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v);
    const res = await this.request<Record<string, unknown>>(
      "GET",
      `/api/plugins/paperclipai.plugin-ontology/api/${path}?${q.toString()}`,
    );
    const rows = res?.[key];
    return Array.isArray(rows) ? (rows as T[]) : [];
  }

  /** GET …/api/node-types — 对象类型 (结构视图) */
  listOntologyNodeTypes(companyId: string, domainId: string) {
    return this.pluginApiList<OntologyNodeType>(
      "node-types", "nodeTypes", companyId, domainId,
    );
  }

  /** GET …/api/relation-types — 关系类型 (结构视图) */
  listOntologyRelationTypes(companyId: string, domainId: string) {
    return this.pluginApiList<OntologyRelationType>(
      "relation-types", "relationTypes", companyId, domainId,
    );
  }

  /** GET …/api/action-types — 动作类型 (动作视图) */
  listOntologyActionTypes(companyId: string, domainId: string) {
    return this.pluginApiList<OntologyActionType>(
      "action-types", "actionTypes", companyId, domainId,
    );
  }

  /** GET …/api/functions — 函数 (函数视图) */
  listOntologyFunctions(companyId: string, domainId: string) {
    return this.pluginApiList<OntologyFunction>(
      "functions", "functions", companyId, domainId,
    );
  }

  /** GET …/api/interfaces — 接口 (接口视图) */
  listOntologyInterfaces(companyId: string, domainId: string) {
    return this.pluginApiList<OntologyInterface>(
      "interfaces", "interfaces", companyId, domainId,
    );
  }

  /** GET …/api/datasets — 数据集 (数据集视图) */
  listOntologyDatasets(companyId: string, domainId: string) {
    return this.pluginApiList<OntologyDataset>(
      "datasets", "datasets", companyId, domainId,
    );
  }

  /** GET …/api/connectors — 连接器 (连接器视图) */
  listOntologyConnectors(companyId: string, domainId: string) {
    return this.pluginApiList<OntologyConnector>(
      "connectors", "connectors", companyId, domainId,
    );
  }

  /** GET …/api/transforms — 转换 (转换视图) */
  listOntologyTransforms(companyId: string, domainId: string) {
    return this.pluginApiList<OntologyTransform>(
      "transforms", "transforms", companyId, domainId,
    );
  }

  /** GET …/api/cognition-jobs — 认知扫描任务 (公司级, 认知视图) */
  listOntologyCognitionJobs(companyId: string, limit = 50) {
    return this.pluginApiList<OntologyCognitionJobRow>(
      "cognition-jobs", "jobs", companyId, undefined, { limit: String(limit) },
    );
  }

  /** GET …/api/capability-gaps — 能力缺口 (公司级, 能力视图) */
  listOntologyCapabilityGaps(companyId: string, limit = 100) {
    return this.pluginApiList<OntologyCapabilityGapRow>(
      "capability-gaps", "gaps", companyId, undefined, { limit: String(limit) },
    );
  }

  /**
   * GET /api/companies/:id/ontology/graph — 控制面本体图谱 (wave332, 与 web
   * 端 `ontologyGraphApi.graph` 同一端点)。参数收窄成共享契约的联合类型;
   * 查询串拼接仍走基类 wave239 实现 —— 那里沉淀着 wave284 教训 (companyId
   * 已在路径里, 回显进 query 会被严格 schema 400)。
   */
  async getOntologyGraph(
    companyId: string,
    params: {
      rootType: EntityType;
      rootId: string;
      depth?: number;
      view?: OntologyGraphView;
    },
  ): Promise<OntologyGraphResponse> {
    return super.getOntologyGraph(companyId, params);
  }

  /**
   * GET /api/companies/:id/ontology/paths — 两对象间的本体关系路径 (wave332,
   * 与 web 端 `ontologyGraphApi.paths` 同一端点)。maxDepth 缺省 5 与 web 一致。
   */
  async getOntologyPaths(
    companyId: string,
    params: {
      srcType: EntityType;
      srcId: string;
      targetType: EntityType;
      targetId: string;
      maxDepth?: number;
    },
  ): Promise<OntologyPathsResponse> {
    const q = new URLSearchParams({
      src_type: params.srcType,
      src_id: params.srcId,
      target_type: params.targetType,
      target_id: params.targetId,
      max_depth: String(params.maxDepth ?? 5),
    });
    return this.request<OntologyPathsResponse>(
      "GET",
      `/api/companies/${encodeURIComponent(companyId)}/ontology/paths?${q.toString()}`,
    );
  }

  /**
   * GET /api/companies/:id/ontology/stats — 图谱宏观统计 (wave332, 与 web 端
   * `ontologyGraphApi.stats` 同一端点)。基类 wave239 已有 `getOntologyStats`
   * 打同一端点, 这里按派单命名委托, 不重复拼 URL。
   */
  async getOntologyGraphStats(companyId: string): Promise<OntologyStatsResponse> {
    return this.getOntologyStats(companyId);
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
 * Shared Coolie client. Auth is either a bearer token from SecureStore (agent /
 * board API keys) or the signed Better Auth session cookie.
 *
 * The session is replayed as an explicit `Cookie` header. Better Auth resolves
 * a session only from the signed cookie it minted, and the App's native `fetch`
 * (platform networking stack, NOT the WebView) did not carry sign-in's
 * `Set-Cookie` into the following `get-session` — measured on wave129 as
 * sign-in 200 → `GET /api/auth/get-session` 401 "Board authentication
 * required", while the same signed value sent explicitly answered 200. Sending
 * the stored signed value ourselves is what makes email/password login work.
 *
 * `credentials: "include"` stays on (see the client's `request`): on iOS
 * `NSURLSession` prefers its own cookie jar and ignores a manually set `Cookie`
 * header, so the jar remains the iOS path; on Android the header is honoured.
 * Both send the same value, and a duplicated cookie with an identical
 * name/value is read identically by Better Auth.
 *
 * The stored session token is also kept (`getSessionToken`) for the
 * WebContainerScreen `/api/auth/exchange` bridge, which lives in the WebView's
 * separate cookie store.
 */
export const coolie = new CoolieClient({
  baseUrl: COOLIE_BASE_URL,
  originHeader: COOLIE_ORIGIN,
  // Explicit return type: without it the unauth branch infers as
  // `{ Authorization?: undefined }`, which is not a `Record<string, string>`.
  getAuthHeader: async (): Promise<Record<string, string>> => {
    const token = await getAuthToken();
    if (token) return { Authorization: `Bearer ${token}` };
    const cookie = await getSessionCookieHeaderValue();
    if (cookie) return { Cookie: cookie };
    return {};
  },
});

/**
 * Re-resolve the instance base URL and apply it to the shared client.
 *
 * `detectApiBaseUrl` is env/config driven and its result is already what the
 * client was constructed with, so this is normally a no-op. It exists so a
 * build can (re-)point the one shared client at runtime — e.g. an emulator
 * session that should talk to the dev instance — without rebuilding, and so the
 * target can be inspected from the app. Returns the URL now in effect.
 */
export function detectAndSetApiBaseUrl(): string {
  const baseUrl = detectApiBaseUrl();
  coolie.setApiBaseUrl(baseUrl);
  return baseUrl;
}

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
    // D03: 瞬态故障 (网络不可达 / status 0 / 5xx) 原样上抛, 让调用方能区分
    // 「服务器暂时联系不上」与「实例明确拒绝这把钥匙」。旧版把一切错误包成
    // "did not accept that key", 于是部署重启的 10 秒窗口就能把用户永久登出。
    if (!(e instanceof CoolieApiError) || e.status === 0 || e.status >= 500) throw e;
    throw new Error(
      `This instance did not accept that key (${e.status} ${e.message}).`,
    );
  }
}

/**
 * Sign in with email and password, returning the session user.
 *
 * Any stored bearer token is cleared first: the shared client sends both, and a
 * stale token would shadow the session cookie for every later call. The signed
 * session cookie Better Auth mints is captured into `expo-secure-store` (and
 * replayed as a `Cookie` header by `getAuthHeader`) so both the native API calls
 * and the `WebContainerScreen` `/api/auth/exchange` bridge inherit the session.
 *
 * `getSession()` is retried once after refreshing the stored token: the first
 * call exercises the new `Cookie` replay path, and a transient race between the
 * cookie write and the read is absorbed without bouncing the user back to the
 * sign-in screen.
 */
export async function signInWithEmail(input: {
  email: string;
  password: string;
}): Promise<SessionUser> {
  await clearAuthToken();
  await clearSessionToken();
  const result = await coolie.signInEmail(input);
  await saveLastEmail(input.email);
  await saveSessionCookieName(result.cookieName ?? defaultSessionCookieName());

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

  let session = await getSessionUser();
  if (!session) {
    await refreshSessionToken();
    session = await getSessionUser();
  }
  if (!session) {
    throw new Error("Signed in, but this instance returned no session for the account.");
  }
  return session;
}

/** The Better Auth cookie name for this instance's scheme (secure vs plain HTTP). */
function defaultSessionCookieName(): string {
  return /^https:/i.test(COOLIE_BASE_URL)
    ? DEFAULT_SESSION_COOKIE_NAME
    : "paperclip-default.session_token";
}

/**
 * Re-mint the stored signed session token from an already-authenticated
 * request. `GET /api/auth/session-token` answers with a freshly signed
 * `<token>.<HMAC>` value for the current board actor, so calling it through the
 * existing `Cookie` replay keeps the stored value valid and signed after a
 * rotated instance secret — the same reason `restoreCredential` refreshes it.
 *
 * Returns true when a token was refreshed. Best-effort: a failure leaves the
 * current stored token untouched.
 */
export async function refreshSessionToken(): Promise<boolean> {
  try {
    const fetched = await coolie.getSessionToken();
    if (fetched?.token) {
      await saveSessionToken(fetched.token);
      return true;
    }
  } catch {
    // Offline / rejected: keep whatever is stored.
  }
  return false;
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
    } catch (e) {
      // D03: 只有实例「明确拒绝」才清凭证。网络抖动 / 服务器部署重启窗口 /
      // 5xx 一律保留 token —— 本次进登录页 (无网也用不了 App), 服务恢复后
      // 下一次冷启动自动回到已登录态。旧版任何异常都 clearAuthToken(),
      // 一次 systemctl restart coolie 就把全设备永久登出。
      const definitive =
        e instanceof Error && /did not accept that key/i.test(e.message);
      if (!definitive) return null;
      await clearAuthToken();
    }
  }
  const user = await getSessionUser();
  if (user) {
    // Keep the stored signed token current on every cold start. Better Auth
    // signs the cookie with the instance secret; if that secret is rotated the
    // stored value stops validating, so re-mint it from the live session while
    // we still can. Best-effort — a failure keeps the existing token and the
    // session itself still works.
    await refreshSessionToken();
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

// ── Onboarding (wave153) ────────────────────────────────────────────────
//
// The web app already ships an onboarding wizard at `/<companyPrefix>/onboarding`
// (`ui/src/components/OnboardingWizard.tsx`); the App had no way to reach it, so
// a new customer's first session on the phone dropped straight onto an empty
// board. These helpers gate the App onto that wizard and remember completion
// locally.
//
// Honest scope note: this fork has no `company.metadata` column (verified —
// `packages/shared/src/types/company.ts` has no `metadata`, and the companies
// table has none), so the brief's `company.metadata.onboarded_step = 3` cannot
// be persisted server-side. Completion is therefore recorded per company on the
// device, and "needs onboarding" is inferred from the company having no agents
// yet — the same signal `register`/`onboarding-seed` leave behind (a fresh
// account has a company but no agents; onboarding hires the first one).

const ONBOARDED_KEY_PREFIX = "coolie.onboarded.";

/** Whether this device has already completed onboarding for the company. */
export async function isOnboardingDone(companyId: string): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(`${ONBOARDED_KEY_PREFIX}${companyId}`)) === "1";
  } catch {
    return false;
  }
}

/** Record that this device has completed (or dismissed) onboarding. */
export async function markOnboardingDone(companyId: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(`${ONBOARDED_KEY_PREFIX}${companyId}`, "1");
  } catch {
    // Best-effort: a failed write only means the gate may show again.
  }
}

/**
 * Whether the App should open the onboarding wizard for this company: no agents
 * yet (brand-new company) and not already completed on this device. Never
 * throws — a lookup failure means "don't nag".
 */
export async function shouldShowOnboarding(companyId: string): Promise<boolean> {
  if (await isOnboardingDone(companyId)) return false;
  try {
    const agents = await coolie.listAgents(companyId);
    return agents.length === 0;
  } catch {
    return false;
  }
}
