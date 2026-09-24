// Minimal shared types for the Coolie mobile/web happy path. For the full,
// always-current contract, generate from GET /api/openapi.json.

import type { IssueWorkMode } from "./work-modes";
import type { ProjectExecutionWorkspacePolicy } from "./issue-composer-options";

export type IssuePriority = "critical" | "high" | "medium" | "low";
export type IssueStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done" | "blocked" | "cancelled";

export interface Company {
  id: string;
  name: string;
}

/**
 * The slice of an agent's permission document the composer reads.
 *
 * Upstream, `trustPreset` decides whether an agent is a low-trust reviewer
 * (`packages/shared/src/trust-policy.ts`), and the New task dialog shows that as
 * a shield badge on the assignee option plus a warning note. Only the key the UI
 * renders is typed; the endpoint returns more.
 */
export interface AgentPermissions {
  trustPreset?: string | null;
  [key: string]: unknown;
}

/**
 * A company agent, as `GET /companies/:id/agents` returns it (the Coolie Web
 * `agentsApi.list`). The App's `AgentRow` is this type — one shape for both
 * clients, so the composer's assignee rail cannot drift from the endpoint.
 */
export interface Agent {
  id: string;
  name: string;
  title?: string | null;
  role?: string | null;
  status: string;
  adapterType?: string | null;
  permissions?: AgentPermissions | null;
  /**
   * The agent's adapter config, as the composer reads it: `adapterConfig.model`
   * seeds the model-override placeholder and the effective thinking effort, the
   * same way upstream `selectedAssigneeAgent.adapterConfig` does.
   */
  adapterConfig?: Record<string, unknown> | null;
  /** Emoji/icon shown next to the agent name in the assignee rail. */
  icon?: string | null;
  /** Org-chain health, used by `isAgentTaskTarget` to hide broken agents. */
  orgChainHealth?: { status?: string } | null;
}

/**
 * A company label the composer can attach to a task (`GET /companies/:id/labels`).
 *
 * Mirrors the Coolie Web label picker's option shape; `labelIds` is the create
 * field, joined through `issue_labels` on the server.
 */
export interface IssueLabel {
  id: string;
  name: string;
  color?: string | null;
  description?: string | null;
}

/**
 * A project the composer can file a task into (`GET /companies/:id/projects`,
 * which mirrors the Coolie Web `projectsApi.list`). Only the fields the picker
 * renders are typed; the endpoint returns more.
 */
export interface Project {
  id: string;
  name: string;
  description?: string | null;
  /** Square dot next to the name, same as the web picker. */
  color?: string | null;
  icon?: string | null;
  status?: string;
  targetDate?: string | null;
  leadAgentId?: string | null;
  goals?: Array<{ id: string; title: string }>;
  workspaces?: Array<{
    id: string;
    name: string;
    sourceType?: string;
    cwd?: string | null;
    repoUrl?: string | null;
    repoRef?: string | null;
    isPrimary?: boolean;
  }>;
  primaryWorkspace?: {
    id: string;
    name: string;
    sourceType?: string;
    cwd?: string | null;
    repoUrl?: string | null;
    repoRef?: string | null;
  } | null;
  taskCount?: number;
  codebase?: {
    origin?: string;
    localFolder?: string | null;
    repoUrl?: string | null;
    repoName?: string | null;
  } | null;
  /**
   * When `enabled`, the dialog shows its execution-workspace row for this
   * project (upstream gates on `experimentalSettings.enableIsolatedWorkspaces`
   * *and* this policy).
   */
  executionWorkspacePolicy?: ProjectExecutionWorkspacePolicy | null;
  /** Project-level env bindings, read for the missing-user-secrets banner. */
  env?: Record<string, unknown> | null;
}

/**
 * A file handed to a multipart upload.
 *
 * Browsers pass a `Blob`/`File`; React Native passes `{ uri, name, type }`
 * because its FormData has no Blob. Both are accepted so one client method
 * serves the expo and h5 composers.
 */
export type UploadFilePart = Blob | { uri: string; name: string; type: string };

/**
 * One model an adapter can run (`GET /companies/:id/adapters/:type/models`,
 * which mirrors the Coolie Web `agentsApi.adapterModels`). Feeds the composer's
 * model-override picker when the assignee's lane is "custom".
 */
export interface AdapterModel {
  id: string;
  label: string;
}

/**
 * What an agent API key can see about itself (`GET /api/agents/me`). A key is
 * scoped to exactly one company, and `companyId` here is how a client learns
 * which — an agent key cannot list companies (that route is board-only).
 */
export interface AgentIdentity {
  id: string;
  companyId: string;
  name: string;
  role?: string;
  title?: string | null;
  status?: string;
}

export interface Issue {
  id: string;
  title: string;
  description?: string;
  status: IssueStatus;
  priority: IssuePriority;
  companyId: string;
  /**
   * Presentation fields the list endpoints already return. Optional because the
   * create/voice responses only guarantee the core fields above; the task list
   * (identifier, timestamps, assignee) reads them defensively.
   */
  identifier?: string | null;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  projectId?: string | null;
  parentId?: string | null;
  workMode?: IssueWorkMode;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface SessionUser {
  id: string;
  email?: string;
  name?: string;
}

/**
 * New-task payload — the fields the composer can set, matching the Coolie Web
 * `NewIssueDialog` submit.
 *
 * `status` is optional because the server owns the default: an omitted status
 * resolves to `todo` when an assignee is present and `backlog` otherwise
 * (`resolveCreateIssueStatusDefault` in `packages/shared/src/validators/issue.ts`).
 * The composer sends it explicitly whenever the user picked a status chip, so the
 * choice on screen is the state that lands.
 */
export interface CreateIssueInput {
  companyId: string;
  title: string;
  description?: string;
  priority?: IssuePriority;
  status?: IssueStatus;
  projectId?: string;
  assigneeAgentId?: string;
  assigneeUserId?: string;
  workMode?: IssueWorkMode;
  labelIds?: string[];
  /**
   * The remaining `NewIssueDialog` create fields, all optional and all omitted
   * when untouched — the composer only sends the ones it actually built (see
   * `buildAssigneeAdapterOverrides` / `buildExecutionPolicy`), matching the
   * upstream submit's conditional spreads.
   */
  parentId?: string;
  goalId?: string;
  projectWorkspaceId?: string;
  /** Model lane / thinking effort / chrome overrides for the assignee. */
  assigneeAdapterOverrides?: Record<string, unknown> | null;
  /** Reviewer / approver stages built from the two participant rows. */
  executionPolicy?: Record<string, unknown> | null;
  executionWorkspacePreference?: string | null;
  executionWorkspaceId?: string | null;
  executionWorkspaceSettings?: Record<string, unknown> | null;
  /** Watchdog agent + instructions. */
  watchdog?: { agentId: string; instructions?: string | null } | null;
}

export type AudioFormat = "mp3" | "wav" | "m4a" | "pcm" | "flac" | "ogg-opus";

/**
 * "dispatch" (default) turns the transcript into a task; "transcribe-only"
 * returns the text for the caller to place in its own input and never creates a
 * task — used by the in-conversation long-press mic, where the user confirms
 * before sending.
 */
export type VoiceDispatchMode = "dispatch" | "transcribe-only";

export interface VoiceDispatchInput {
  companyId: string;
  /** Base64 of the audio (no data: prefix). Tencent one-sentence: <= 3MB, <= 60s. */
  audioBase64: string;
  format?: AudioFormat;
  /** When true (default), the recognized speech is turned into a task. */
  createIssue?: boolean;
  /** Defaults to "dispatch"; "transcribe-only" skips issue creation. */
  mode?: VoiceDispatchMode;
  priority?: IssuePriority;
}

export interface VoiceDispatchResult {
  transcription: { status: "pending" | "done" | "failed"; text: string; error?: string };
  issue: { id: string; title: string } | null;
  /** Present for mode="transcribe-only": the recognized text, top-level. */
  text?: string;
  /** Present for mode="transcribe-only": the persisted transcription id. */
  transcriptionId?: string;
}

/** Standard error code when Tencent ASR is not configured on the instance. */
export const ASR_NOT_CONFIGURED = "ASR_NOT_CONFIGURED";

export const MULTIMODAL_PLUGIN_ID = "paperclipai.plugin-multimodal";

// --- Cockpit Efficiency Metrics (需求②⑥⑦⑧⑨⑩) ---

/** 额度指标: budget_monthly_cents vs spent_monthly_cents (需求②) */
export interface QuotaMetric {
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  costEventsSpendCents: number;
  utilizationPercent: number;
  remainingCents: number;
}

/** 任务进度与状态分布 (需求⑥) */
export interface ProgressMetric {
  total: number;
  open: number;
  inProgress: number;
  blocked: number;
  done: number;
  cancelled: number;
  byStatus: Record<string, number>;
  completionRatePercent: number;
}

/** 智能体心跳与空闲明细 (需求⑦) */
export interface AgentHeartbeatInfo {
  id: string;
  name: string;
  role: string;
  title: string | null;
  status: string;
  lastHeartbeatAt: string | null;
  idleSeconds: number | null;
}

/** 空闲度指标: agent last_heartbeat距今 (需求⑦) */
export interface IdleMetric {
  totalAgents: number;
  activeCount: number;
  idleCount: number;
  pausedCount: number;
  errorCount: number;
  agents: AgentHeartbeatInfo[];
}

/** 交付周期耗时分桶 (需求⑧) */
export interface DeliveryCycleBucket {
  label: string;
  minSec: number;
  maxSec: number | null;
  count: number;
  percent: number;
}

/** 交付周期指标: issue创建到done时长分布 (需求⑧) */
export interface DeliveryCycleMetric {
  count: number;
  avgSeconds: number;
  medianSeconds: number;
  p90Seconds: number;
  minSeconds: number;
  maxSeconds: number;
  buckets: DeliveryCycleBucket[];
}

export interface DailyThroughput {
  date: string;
  completed: number;
  created: number;
}

/** 车间效率指标: 吞吐速率与产出 (需求⑨) */
export interface EfficiencyMetric {
  completedTasks24h: number;
  completedTasks7d: number;
  completedTasks30d: number;
  createdTasks24h: number;
  createdTasks7d: number;
  createdTasks30d: number;
  velocityPerDay: number;
  dailyThroughput: DailyThroughput[];
}

/** 失败率指标: cancelled + error 占比 (需求⑩) */
export interface FailureRateMetric {
  totalTasks: number;
  cancelledTasks: number;
  taskFailureRatePercent: number;
  totalRuns: number;
  failedRuns: number;
  recoveredRuns: number;
  runFailureRatePercent: number;
  overallFailureRatePercent: number;
}

/** 驾驶舱六大效能指标集合 */
export interface CockpitDashboardMetrics {
  quota: QuotaMetric;
  progress: ProgressMetric;
  idle: IdleMetric;
  deliveryCycle: DeliveryCycleMetric;
  efficiency: EfficiencyMetric;
  failureRate: FailureRateMetric;
}

/** 服务端 /api/companies/:companyId/dashboard 聚合响应 */
export interface DashboardSummary {
  companyId: string;
  agents: {
    active: number;
    running: number;
    paused: number;
    error: number;
  };
  tasks: {
    open: number;
    inProgress: number;
    blocked: number;
    done: number;
  };
  costs: {
    monthSpendCents: number;
    monthBudgetCents: number;
    monthUtilizationPercent: number;
  };
  pendingApprovals: number;
  budgets: {
    activeIncidents: number;
    pendingApprovals: number;
    pausedAgents: number;
    pausedProjects: number;
  };
  runActivity: Array<{
    date: string;
    succeeded: number;
    failed: number;
    recovered: number;
    other: number;
    total: number;
    failedByErrorCode: Record<string, number>;
  }>;
  quota: QuotaMetric;
  progress: ProgressMetric;
  idle: IdleMetric;
  deliveryCycle: DeliveryCycleMetric;
  efficiency: EfficiencyMetric;
  failureRate: FailureRateMetric;
  metrics: CockpitDashboardMetrics;
}

// --- Workspace Diff & Execution Workspaces (Top2 代码审查需求④) ---

export type WorkspaceDiffView = "working-tree" | "head";

export type WorkspaceDiffFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "type_changed"
  | "untracked"
  | "unknown";

export type WorkspaceDiffPatchKind = "staged" | "unstaged" | "head" | "untracked";

export type WorkspaceDiffWarningCode =
  | "base_ref_missing"
  | "base_ref_invalid"
  | "binary_file"
  | "file_count_truncated"
  | "file_oversized"
  | "git_command_failed"
  | "missing_cwd"
  | "non_git_workspace"
  | "patch_truncated"
  | "path_filter_invalid"
  | "symlink_target_outside_workspace"
  | "workspace_path_invalid";

export interface WorkspaceDiffWarning {
  code: WorkspaceDiffWarningCode | string;
  message: string;
  path: string | null;
}

export interface WorkspaceDiffCaps {
  maxFiles: number;
  maxFileBytes: number;
  maxPatchBytes: number;
  maxTotalPatchBytes: number;
}

export interface WorkspaceDiffFilePatch {
  kind: WorkspaceDiffPatchKind;
  patch: string | null;
  additions: number;
  deletions: number;
  binary: boolean;
  oversized: boolean;
  truncated: boolean;
  warnings: WorkspaceDiffWarning[];
}

export interface WorkspaceDiffFile {
  path: string;
  oldPath: string | null;
  status: WorkspaceDiffFileStatus;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  binary: boolean;
  oversized: boolean;
  truncated: boolean;
  additions: number;
  deletions: number;
  sizeBytes: number | null;
  patches: WorkspaceDiffFilePatch[];
  warnings: WorkspaceDiffWarning[];
}

export interface WorkspaceDiffStats {
  fileCount: number;
  stagedFileCount: number;
  unstagedFileCount: number;
  untrackedFileCount: number;
  binaryFileCount: number;
  oversizedFileCount: number;
  truncatedFileCount: number;
  additions: number;
  deletions: number;
}

export interface WorkspaceDiffResponse {
  workspaceId: string;
  companyId: string;
  view: WorkspaceDiffView;
  baseRef: string | null;
  defaultBaseRef: string | null;
  headSha: string | null;
  includeUntracked: boolean;
  paths: string[];
  files: WorkspaceDiffFile[];
  stats: WorkspaceDiffStats;
  warnings: WorkspaceDiffWarning[];
  caps: WorkspaceDiffCaps;
  truncated: boolean;
}

export interface GetWorkspaceDiffParams {
  workspaceId: string;
  companyId: string;
  view?: WorkspaceDiffView;
  baseRef?: string | null;
  includeUntracked?: boolean;
  paths?: string[];
  entityType?: "execution_workspace" | "project_workspace";
  projectId?: string;
}

export interface ExecutionWorkspace {
  id: string;
  companyId: string;
  projectId: string;
  projectWorkspaceId?: string | null;
  sourceIssueId?: string | null;
  mode?: string;
  strategyType?: string;
  name: string;
  status: string;
  cwd?: string | null;
  repoUrl?: string | null;
  baseRef?: string | null;
  branchName?: string | null;
  runtimeServices?: WorkspaceRuntimeService[];
  createdAt?: string;
  updatedAt?: string;
}

export interface IssueWorkProduct {
  id: string;
  companyId: string;
  projectId?: string | null;
  issueId: string;
  executionWorkspaceId?: string | null;
  runtimeServiceId?: string | null;
  type: string;
  provider: string;
  title: string;
  url?: string | null;
  status: string;
  reviewState: string;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Coolie fork — wave70 (git-ops App UI 4 屏): Git provider credential row
 * 镜像 server/src/routes/git-credentials.ts 的 GET /api/git-credentials
 * 返回的 metadata 字段 (绝不含加密 token, 只供 UI 列表/删除/重存用)。
 */
export type GitProvider = "github" | "gitlab" | "gitee" | "codeup" | "cnb";

export interface GitCredential {
  id: string;
  userId: string;
  provider: GitProvider;
  repoUrl?: string | null;
  companyId?: string | null;
  tokenExpiresAt?: string | null;
  createdAt: string;
}

export interface SaveGitCredentialInput {
  provider: GitProvider;
  token: string;
  repoUrl?: string | null;
  companyId?: string | null;
}

// --- Business Ontology Plugin (Top3 业务本体域与紧急熔断 需求⑪) ---

export const ONTOLOGY_PLUGIN_ID = "paperclipai.plugin-ontology";

export type OntologyDomainLifecycleState =
  | "draft"
  | "active"
  | "deprecated"
  | "archived"
  | "locked";

export interface OntologyDomain {
  id: string;
  company_id?: string;
  companyId?: string;
  slug: string;
  display_name?: string;
  displayName?: string;
  description?: string | null;
  status: string;
  version: number;
  icon?: string;
  category?: string;
  is_built_in?: boolean;
  isBuiltIn?: boolean;
  forked_from?: string | null;
  forkedFrom?: string | null;
  lifecycle_state: OntologyDomainLifecycleState;
  lifecycleState?: OntologyDomainLifecycleState;
  bootstrap_source?: string;
  seed_schema_version?: number;
  schema_version?: number;
  schemaVersion?: number;
  created_at?: string;
  updated_at?: string;
}

export interface OntologyGraphCounts {
  nodeTypes: number;
  relationTypes: number;
  nodes: number;
  edges: number;
  byNodeType?: Record<string, number>;
  crossDomainEdges?: number;
}

export interface OntologyGraphNode {
  id: string;
  key: string;
  label: string;
  nodeTypeId?: string | null;
  lifecycleState?: string;
  properties?: Record<string, unknown> | null;
}

export interface OntologyGraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationKey?: string | null;
  weight?: number;
  sourceDomainId?: string | null;
  targetDomainId?: string | null;
  isCrossDomain?: boolean;
}

export interface OntologyGraphSnapshot {
  domainId: string;
  counts: OntologyGraphCounts;
  nodes: OntologyGraphNode[];
  edges: OntologyGraphEdge[];
}

export interface SetDomainLifecycleOptions {
  actor?: string;
  reason?: string;
  deviceInfo?: string;
}

// --- Artifacts Hub (需求③看产物) ---

export type CompanyArtifactSource = "document" | "attachment" | "work_product";

export type CompanyArtifactMediaKind =
  | "image"
  | "video"
  | "text"
  | "document"
  | "file"
  | "empty";

export type CompanyArtifactGroupBy = "none" | "task" | "parent_task";

export interface CompanyArtifactIssueSummary {
  id: string;
  identifier: string;
  title: string;
}

export interface CompanyArtifactProjectSummary {
  id: string;
  name: string;
}

export interface CompanyArtifactAgentSummary {
  id: string;
  name: string;
}

export interface CompanyArtifact {
  id: string;
  source: CompanyArtifactSource;
  mediaKind: CompanyArtifactMediaKind;
  title: string;
  previewText: string | null;
  contentType: string | null;
  contentPath: string | null;
  openPath: string | null;
  downloadPath: string | null;
  issue: CompanyArtifactIssueSummary;
  project: CompanyArtifactProjectSummary | null;
  createdByAgent: CompanyArtifactAgentSummary | null;
  updatedAt: string;
  href: string;
}

export interface CompanyArtifactGroup {
  id: string;
  groupBy: Exclude<CompanyArtifactGroupBy, "none">;
  issue: CompanyArtifactIssueSummary;
  title: string;
  count: number;
  mediaKinds: CompanyArtifactMediaKind[];
  previewArtifacts: CompanyArtifact[];
  updatedAt: string;
  href: string;
}

export interface CompanyArtifactsResponse {
  artifacts: CompanyArtifact[];
  groups?: CompanyArtifactGroup[];
  selectedGroup?: CompanyArtifactGroup | null;
  nextCursor: string | null;
}

export interface CompanyArtifactsQuery {
  kind?: CompanyArtifactMediaKind | "all";
  projectId?: string;
  q?: string;
  groupBy?: CompanyArtifactGroupBy;
  groupIssueId?: string;
  starred?: boolean;
  limit?: number;
  cursor?: string;
}

export interface IssueAttachment {
  id: string;
  companyId: string;
  issueId: string;
  issueCommentId?: string | null;
  assetId: string;
  provider: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  originalFilename: string | null;
  createdByAgentId?: string | null;
  createdByUserId?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  contentPath: string;
  openPath?: string;
}

// --- Workspace Runtime Services & Prototype Sandbox (需求⑤看原型) ---

export interface RuntimeExposureStatus {
  type?: string;
  hostname?: string;
  port?: number;
  url?: string;
  state?: string;
  [key: string]: unknown;
}

export interface WorkspaceRuntimeService {
  id: string;
  companyId: string;
  projectId?: string | null;
  projectWorkspaceId?: string | null;
  executionWorkspaceId?: string | null;
  issueId?: string | null;
  scopeType?: "project_workspace" | "execution_workspace" | "run" | "agent" | string;
  scopeId?: string | null;
  serviceName: string;
  status: "provisioning" | "starting" | "running" | "stopped" | "failed" | string;
  lifecycle?: "shared" | "ephemeral" | string;
  reuseKey?: string | null;
  command?: string | null;
  cwd?: string | null;
  port?: number | null;
  url?: string | null;
  provider?: "local_process" | "adapter_managed" | string;
  providerRef?: string | null;
  ownerAgentId?: string | null;
  startedByRunId?: string | null;
  lastUsedAt?: string | Date;
  startedAt?: string | Date;
  stoppedAt?: string | Date | null;
  stopPolicy?: Record<string, unknown> | null;
  healthStatus?: "unknown" | "healthy" | "unhealthy" | string;
  exposure?: RuntimeExposureStatus | null;
  configIndex?: number | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

// --- Board Chat & Concierge Streaming (需求⑫ 驾驶舱问答) ---

export interface BoardChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string | Date;
  status?: string;
  pending?: boolean;
}

export interface BoardChatStreamInput {
  companyId: string;
  message: string;
  taskId?: string;
  /** Coolie fork (wave71): 附件 id 列表 — 上传后随 message 一起 POST */
  attachmentIds?: string[];
  signal?: AbortSignal;
}

export type BoardChatStreamEvent =
  | { type: "start"; issueId: string }
  | { type: "status"; text: string }
  | { type: "chunk"; text: string }
  | { type: "done"; issueId: string; exitCode?: number; timedOut?: boolean }
  | { type: "error"; message: string };

export interface BoardChatStreamCallbacks {
  onStart?: (issueId: string) => void;
  onStatus?: (text: string) => void;
  onChunk?: (text: string) => void;
  onDone?: (event: { issueId: string; exitCode?: number; timedOut?: boolean }) => void;
  onError?: (error: Error | string) => void;
  onEvent?: (event: BoardChatStreamEvent) => void;
}

// --- Approvals & Governance (快捷审批闭环) ---

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revision_requested";

export interface Approval {
  id: string;
  companyId: string;
  type: string;
  status: ApprovalStatus;
  payload: Record<string, unknown>;
  requestedByAgentId?: string | null;
  requestedByUserId?: string | null;
  decisionNote?: string | null;
  decidedByUserId?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  title?: string | null;
  description?: string | null;
}

export interface ApprovalComment {
  id: string;
  approvalId: string;
  authorUserId?: string | null;
  authorAgentId?: string | null;
  body: string;
  createdAt: string;
}

export interface ResolveApprovalOptions {
  decision: "approve" | "reject";
  decisionNote?: string;
}

export interface ListApprovalsOptions {
  status?: string;
}

// ── 收件箱聚合 (GET /api/inbox) ─────────────────────────────────────────────
// 与 Coolie Web 收件箱同一份三段聚合: 待审批 / 受阻任务 / @我。

/** 收件箱一条待审批 */
export interface InboxApprovalItem {
  id: string;
  title: string;
  type: string;
  status: string;
  createdAt: string;
}

/** 收件箱一条受阻任务 */
export interface InboxFailureItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  updatedAt: string;
}

/** 收件箱一条 @提及 */
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

