import type { BudgetWindowKind, IssueWbsType, PauseReason, ProjectStatus } from "../constants.js";
import type { IssueMilestone } from "./issue.js";
import type {
  ProjectExecutionWorkspacePolicy,
  ProjectWorkspaceRuntimeConfig,
  WorkspaceRuntimeService,
} from "./workspace-runtime.js";
import type { AgentEnvConfig } from "./secrets.js";

export type ProjectWorkspaceSourceType = "local_path" | "git_repo" | "remote_managed" | "non_git_path";
export type ProjectWorkspaceVisibility = "default" | "advanced";

export interface ProjectGoalRef {
  id: string;
  title: string;
}

/**
 * Lightweight per-project budget summary surfaced on the projects list payload
 * (IA Phase 4 — PAP-60). Reflects the active `billed_cents` budget policy scoped
 * to the project, when one is set.
 */
export interface ProjectBudgetSummary {
  /** Budget limit in cents. */
  amountCents: number;
  windowKind: BudgetWindowKind;
}

/**
 * One node of an auto-generated CMMI WBS draft (wave140). A draft is a proposal
 * only — it lives on `projects.wbs_draft` until the project head adopts it, at
 * which point each node becomes an issue carrying these WBS/milestone fields.
 */
export interface ProjectWbsDraftItem {
  /** Hierarchical WBS number ("1", "1.1", "1.2"). */
  code: string;
  type: IssueWbsType;
  title: string;
  description: string | null;
  isMilestone: boolean;
  milestone: IssueMilestone | null;
  /** Code of the parent node (the phase); null for a top-level phase. */
  parentCode: string | null;
}

/** A generated WBS draft awaiting 采纳/忽略. */
export interface ProjectWbsDraft {
  /** ISO timestamp the draft was generated. */
  generatedAt: string;
  /** Source document filename, when the draft came from an uploaded doc. */
  source: string | null;
  /** Project goal titles this breakdown serves (reuses the project's goals). */
  goalTitles: string[];
  items: ProjectWbsDraftItem[];
}

export interface ProjectWorkspace {
  id: string;
  companyId: string;
  projectId: string;
  name: string;
  sourceType: ProjectWorkspaceSourceType;
  cwd: string | null;
  repoUrl: string | null;
  repoRef: string | null;
  defaultRef: string | null;
  visibility: ProjectWorkspaceVisibility;
  setupCommand: string | null;
  cleanupCommand: string | null;
  remoteProvider: string | null;
  remoteWorkspaceRef: string | null;
  sharedWorkspaceKey: string | null;
  metadata: Record<string, unknown> | null;
  runtimeConfig: ProjectWorkspaceRuntimeConfig | null;
  isPrimary: boolean;
  runtimeServices?: WorkspaceRuntimeService[];
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectCodebaseOrigin = "local_folder" | "managed_checkout";

export interface ProjectCodebase {
  workspaceId: string | null;
  repoUrl: string | null;
  repoRef: string | null;
  defaultRef: string | null;
  repoName: string | null;
  localFolder: string | null;
  managedFolder: string;
  effectiveLocalFolder: string;
  origin: ProjectCodebaseOrigin;
}

export interface ProjectManagedByPlugin {
  id: string;
  pluginId: string;
  pluginKey: string;
  pluginDisplayName: string;
  resourceKind: "project";
  resourceKey: string;
  defaultsJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  companyId: string;
  urlKey: string;
  /** @deprecated Use goalIds / goals instead */
  goalId: string | null;
  goalIds: string[];
  goals: ProjectGoalRef[];
  name: string;
  description: string | null;
  status: ProjectStatus;
  leadAgentId: string | null;
  targetDate: string | null;
  color: string | null;
  icon: string | null;
  env: AgentEnvConfig | null;
  pauseReason: PauseReason | null;
  pausedAt: Date | null;
  executionWorkspacePolicy: ProjectExecutionWorkspacePolicy | null;
  codebase: ProjectCodebase;
  workspaces: ProjectWorkspace[];
  primaryWorkspace: ProjectWorkspace | null;
  managedByPlugin?: ProjectManagedByPlugin | null;
  /**
   * Number of tasks (issues) in the project. Populated by the projects list and
   * single-project endpoints (IA Phase 4 — PAP-60; wave132 adds it to detail).
   */
  taskCount?: number;
  /**
   * Number of defects (tasks carrying defect metadata) in the project.
   * Populated by the projects list and single-project endpoints (wave132).
   */
  defectCount?: number;
  /**
   * Auto-generated CMMI WBS draft awaiting 采纳/忽略 (wave140). Null once adopted
   * or dismissed, and for projects that have not had a requirement doc parsed.
   */
  wbsDraft?: ProjectWbsDraft | null;
  /** Number of 里程碑/主线 tasks in the project (is_milestone = true), wave140. */
  milestoneCount?: number;
  /**
   * Active budget for the project, when set. Populated by the projects list
   * endpoint (IA Phase 4 — PAP-60); omitted on single-project payloads.
   */
  budget?: ProjectBudgetSummary | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** GitHub identity is the provider's stable repository ID, never a credential. */
export interface ProjectRepository {
  id: string;
  fullName: string;
  url: string;
  private?: boolean;
  connections: string[];
}

export interface ProjectRepositoryOptions {
  repositories: ProjectRepository[];
  connectionCount: number;
  failedConnectionCount: number;
}
