import type {
  IssueSpec,
  IssueSpecKind,
  IssueSpecResponse,
  IssueSpecTreeResponse,
} from "@paperclipai/shared";
import { api } from "./client";

export interface CreateSpecFromTemplateBody {
  kind: IssueSpecKind;
  parentIssueId?: string | null;
  title?: string;
  description?: string;
  projectId?: string | null;
}

/** Spec-driven chain (wave147). Paths are relative to `/api`. */
export const specsApi = {
  get: (issueId: string) =>
    api.get<IssueSpecResponse>(`/issues/${encodeURIComponent(issueId)}/spec`),
  save: (issueId: string, spec: IssueSpec, options?: { draft?: boolean }) =>
    api.post<IssueSpecResponse>(
      `/issues/${encodeURIComponent(issueId)}/spec${options?.draft ? "?draft=1" : ""}`,
      spec,
    ),
  tree: (companyId: string, projectId?: string) =>
    api.get<IssueSpecTreeResponse>(
      `/companies/${encodeURIComponent(companyId)}/specs/tree` +
        (projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""),
    ),
  fromTemplate: (companyId: string, body: CreateSpecFromTemplateBody) =>
    api.post<IssueSpecResponse>(
      `/companies/${encodeURIComponent(companyId)}/specs/from-template`,
      body,
    ),
};
