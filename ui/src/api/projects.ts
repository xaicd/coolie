import type {
  Project,
  ProjectRepositoryOptions,
  ProjectWorkspace,
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

/** One landed requirement document, as returned by the project documents list. */
export interface ProjectDocument {
  filename: string;
  byteSize: number;
  modifiedAt: string;
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
  /** List the requirement documents landed for a project. */
  listDocuments: (companyId: string, projectId: string) =>
    api.get<{ projectId: string; documents: ProjectDocument[] }>(
      `/companies/${encodeURIComponent(companyId)}/projects/${encodeURIComponent(projectId)}/documents`,
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
