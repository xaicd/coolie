import type {
  Project,
  ProjectRepositoryOptions,
  ProjectWbsDraft,
  ProjectWorkspace,
  WbsGateState,
  WbsMainline,
  WorkspaceOperation,
  WorkspaceRuntimeControlTarget,
} from "@paperclipai/shared";
import { api } from "./client";
import { sanitizeWorkspaceRuntimeControlTarget } from "./workspace-runtime-control";

function withCompanyScope(path: string, companyId?: string) {
  if (!companyId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}companyId=${encodeURIComponent(companyId)}`;
}

function projectPath(id: string, companyId?: string, suffix = "") {
  return withCompanyScope(`/projects/${encodeURIComponent(id)}${suffix}`, companyId);
}

/** Result of landing one requirement document under projects/<companyId>/<projectId>/coolie-docs/. */
export interface ProjectDocumentUpload {
  projectId: string;
  filename: string;
  relativePath: string;
  byteSize: number;
  sha256: string;
  originalFilename: string | null;
}

/**
 * The CMMI WBS view for a project (wave140): the pending draft, the milestone
 * mainline, and the per-issue stage-gate state. All derived server-side from the
 * project's own issues through the shared pure module.
 */
export interface ProjectWbsView {
  projectId: string;
  draft: ProjectWbsDraft | null;
  mainline: WbsMainline;
  gateStates: Record<string, WbsGateState>;
}

/** Result of adopting a WBS draft into real issues. */
export interface ProjectWbsAdoption {
  projectId: string;
  createdIssueIds: string[];
  milestoneIssueIds: string[];
  itemCount: number;
}
/** One landed requirement document, as returned by the project documents list. */
export interface ProjectDocument {
  filename: string;
  byteSize: number;
  modifiedAt: string;
}

/**
 * Heuristic auto-recognition of an uploaded requirement doc: a name/slug to
 * prefill the create-project form with, plus a one-line summary.
 */
export interface ProjectDocumentAnalysis {
  suggestedName: string;
  suggestedSlug: string;
  summary: string;
  source: "content" | "filename";
  extractedChars: number;
  /** False when the format has no text extractor yet (PDF). */
  textSupported: boolean;
}

export const projectsApi = {
  repositoryOptions: (companyId: string) => api.get<ProjectRepositoryOptions>(`/companies/${companyId}/project-repositories`),
  setRepositories: (id: string, repositoryIds: string[]) => api.put<Project>(projectPath(id, undefined, "/repositories"), { repositoryIds }),
  list: (companyId: string, opts: { includeArchived?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (opts.includeArchived) params.set("includeArchived", "true");
    const query = params.toString();
    return api.get<Project[]>("/companies/" + encodeURIComponent(companyId) + "/projects" + (query ? "?" + query : ""));
  },
  get: (id: string, companyId?: string) => api.get<Project>(projectPath(id, companyId)),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Project>(`/companies/${companyId}/projects`, data),
  /** Upload a requirement doc/screenshot for a project; lands in projects/<companyId>/<projectId>/coolie-docs/. */
  uploadDocument: (companyId: string, projectId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.postForm<ProjectDocumentUpload>(
      `/companies/${encodeURIComponent(companyId)}/projects/${encodeURIComponent(projectId)}/documents`,
      form,
    );
  },
  /** Auto-recognize a picked doc and suggest a project name/slug to prefill. */
  analyzeDocument: (companyId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.postForm<ProjectDocumentAnalysis>(
      `/companies/${encodeURIComponent(companyId)}/projects/analyze-document`,
      form,
    );
  },
  /** List the requirement documents landed for a project. */
  listDocuments: (companyId: string, projectId: string) =>
    api.get<{ projectId: string; documents: ProjectDocument[] }>(
      `/companies/${encodeURIComponent(companyId)}/projects/${encodeURIComponent(projectId)}/documents`,
    ),
  /** wave140: the CMMI WBS view — pending draft, milestone mainline, gate state. */
  getWbs: (companyId: string, projectId: string) =>
    api.get<ProjectWbsView>(
      `/companies/${encodeURIComponent(companyId)}/projects/${encodeURIComponent(projectId)}/wbs`,
    ),
  /** Materialise the pending WBS draft into issues (idempotent). */
  adoptWbsDraft: (companyId: string, projectId: string) =>
    api.post<ProjectWbsAdoption>(
      `/companies/${encodeURIComponent(companyId)}/projects/${encodeURIComponent(projectId)}/wbs/adopt`,
      {},
    ),
  /** Dismiss the pending WBS draft without materialising it. */
  dismissWbsDraft: (companyId: string, projectId: string) =>
    api.delete<void>(
      `/companies/${encodeURIComponent(companyId)}/projects/${encodeURIComponent(projectId)}/wbs/draft`,
    ),
  update: (id: string, data: Record<string, unknown>, companyId?: string) =>
    api.patch<Project>(projectPath(id, companyId), data),
  listWorkspaces: (projectId: string, companyId?: string) =>
    api.get<ProjectWorkspace[]>(projectPath(projectId, companyId, "/workspaces")),
  createWorkspace: (projectId: string, data: Record<string, unknown>, companyId?: string) =>
    api.post<ProjectWorkspace>(projectPath(projectId, companyId, "/workspaces"), data),
  updateWorkspace: (projectId: string, workspaceId: string, data: Record<string, unknown>, companyId?: string) =>
    api.patch<ProjectWorkspace>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}`),
      data,
    ),
  controlWorkspaceRuntimeServices: (
    projectId: string,
    workspaceId: string,
    action: "start" | "stop" | "restart",
    companyId?: string,
    target: WorkspaceRuntimeControlTarget = {},
  ) =>
    api.post<{ workspace: ProjectWorkspace; operation: WorkspaceOperation }>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}/runtime-services/${action}`),
      sanitizeWorkspaceRuntimeControlTarget(target),
    ),
  controlWorkspaceCommands: (
    projectId: string,
    workspaceId: string,
    action: "start" | "stop" | "restart" | "run",
    companyId?: string,
    target: WorkspaceRuntimeControlTarget = {},
  ) =>
    api.post<{ workspace: ProjectWorkspace; operation: WorkspaceOperation }>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}/runtime-commands/${action}`),
      sanitizeWorkspaceRuntimeControlTarget(target),
    ),
  removeWorkspace: (projectId: string, workspaceId: string, companyId?: string) =>
    api.delete<ProjectWorkspace>(projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}`)),
  remove: (id: string, companyId?: string) => api.delete<Project>(projectPath(id, companyId)),
};
