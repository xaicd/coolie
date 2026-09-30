import type { ApiClient } from "./api.js";
import { note } from "./notes.js";

/**
 * Every row this suite creates is prefixed with `E2E_MARKER_PREFIX` so a later
 * run (or the global teardown) can find and remove leftovers from a crashed
 * run. Projects and tasks are fully deletable; attachments too. Approvals are
 * append-only audit records with no delete API — see `cleanup()`.
 */
export const E2E_MARKER_PREFIX = "wave137-e2e-";

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  status?: string;
}

export interface Issue {
  id: string;
  identifier?: string;
  title: string;
  status: string;
  projectId?: string | null;
  assigneeAgentId?: string | null;
}

export interface IssueAttachment {
  id: string;
  issueId: string;
  contentType?: string | null;
  byteSize?: number | null;
  originalFilename?: string | null;
  contentPath?: string | null;
  openPath?: string | null;
}

export interface Approval {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown> | null;
}

export interface ApprovalSummary {
  id: string;
  status: string;
  payload: Record<string, unknown> | null;
}

/**
 * Per-test data factory: create with a unique marker, track every id, then
 * remove it all on the way out so repeated runs never accumulate junk.
 */
export class DataFactory {
  private seq = 0;
  private readonly projects: string[] = [];
  private readonly issues: string[] = [];
  private readonly attachments: string[] = [];
  private readonly approvals: string[] = [];

  constructor(
    private readonly api: ApiClient,
    readonly companyId: string,
    private readonly shortRunId: string,
  ) {}

  /** A unique, greppable marker; the returned value is safe in names/titles. */
  marker(kind: string): string {
    this.seq += 1;
    return `${E2E_MARKER_PREFIX}${this.shortRunId}-${kind}-${String(this.seq).padStart(2, "0")}`;
  }

  // --- Projects ---------------------------------------------------------------

  async createProject(name: string): Promise<Project> {
    const project = await this.api.post<Project>(`/api/companies/${this.companyId}/projects`, {
      name,
      status: "planned",
    });
    this.trackProject(project.id);
    return project;
  }

  trackProject(id: string): void {
    this.projects.push(id);
  }

  async getProject(id: string): Promise<Project> {
    return this.api.get<Project>(`/api/projects/${id}?companyId=${this.companyId}`);
  }

  async listProjects(): Promise<Project[]> {
    return this.api.get<Project[]>(`/api/companies/${this.companyId}/projects`);
  }

  async listProjectDocuments(projectId: string): Promise<{ documents: Array<{ filename: string }> }> {
    return this.api.get(`/api/companies/${this.companyId}/projects/${projectId}/documents`);
  }

  // --- Tasks / defects --------------------------------------------------------

  async createTask(input: { title: string; projectId?: string; assigneeAgentId?: string; status?: string }): Promise<Issue> {
    const issue = await this.api.post<Issue>(`/api/companies/${this.companyId}/issues`, {
      title: input.title,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.assigneeAgentId ? { assigneeAgentId: input.assigneeAgentId } : {}),
      // Default to backlog so creating an assigned task never wakes the agent.
      status: input.status ?? "backlog",
    });
    this.trackIssue(issue.id);
    return issue;
  }

  async createDefect(input: { title: string; projectId?: string; severity?: string }): Promise<Issue> {
    const issue = await this.api.post<Issue>(`/api/companies/${this.companyId}/issues`, {
      title: input.title,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      status: "backlog",
      defect: {
        severity: input.severity ?? "medium",
        reproSteps: "Reproduce via the e2e suite.",
      },
    });
    this.trackIssue(issue.id);
    return issue;
  }

  trackIssue(id: string): void {
    this.issues.push(id);
  }

  async getIssue(id: string): Promise<Issue> {
    return this.api.get<Issue>(`/api/issues/${id}`);
  }

  async listIssues(params: { projectId?: string; limit?: number } = {}): Promise<Issue[]> {
    const search = new URLSearchParams();
    if (params.projectId) search.set("projectId", params.projectId);
    search.set("limit", String(params.limit ?? 100));
    return this.api.get<Issue[]>(`/api/companies/${this.companyId}/issues?${search.toString()}`);
  }

  // --- Attachments ------------------------------------------------------------

  async uploadAttachment(issueId: string, filePath: string, filename?: string): Promise<IssueAttachment> {
    const attachment = await this.api.uploadFile<IssueAttachment>(
      `/api/companies/${this.companyId}/issues/${issueId}/attachments`,
      filePath,
      filename ? { filename } : {},
    );
    this.attachments.push(attachment.id);
    return attachment;
  }

  async listAttachments(issueId: string): Promise<IssueAttachment[]> {
    return this.api.get<IssueAttachment[]>(`/api/issues/${issueId}/attachments`);
  }

  trackAttachment(id: string): void {
    this.attachments.push(id);
  }

  // --- Approvals --------------------------------------------------------------

  async createApproval(payload: Record<string, unknown>): Promise<Approval> {
    const approval = await this.api.post<Approval>(`/api/companies/${this.companyId}/approvals`, {
      type: "request_board_approval",
      payload,
    });
    this.approvals.push(approval.id);
    return approval;
  }

  async getApproval(id: string): Promise<Approval> {
    return this.api.get<Approval>(`/api/approvals/${id}`);
  }

  async listApprovals(status?: string): Promise<ApprovalSummary[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return this.api.get<ApprovalSummary[]>(`/api/companies/${this.companyId}/approvals${qs}`);
  }

  // --- Teardown ---------------------------------------------------------------

  /**
   * Remove everything this factory created, deepest-first. Approvals are the
   * one exception: the board exposes no delete/cancel route, so a created
   * approval is an immutable audit record. We note them instead of pretending
   * they were cleaned.
   */
  async cleanup(): Promise<void> {
    for (const id of this.attachments.splice(0)) {
      await this.api.tryDelete(`/api/attachments/${id}`);
    }
    for (const id of this.issues.splice(0)) {
      await this.api.tryDelete(`/api/issues/${id}`);
    }
    for (const id of this.projects.splice(0)) {
      await this.api.tryDelete(`/api/projects/${id}?companyId=${this.companyId}`);
    }
    if (this.approvals.length > 0) {
      note("approvals are append-only (no delete API); left in place", {
        count: this.approvals.length,
        ids: [...this.approvals],
      });
      this.approvals.splice(0);
    }
  }
}

/**
 * Sweep marker-prefixed leftovers across every accessible company. Runs from
 * the global teardown so a run killed mid-flight cannot poison the next one.
 * Returns a small report for the evidence log.
 */
export async function sweepLeftovers(
  api: ApiClient,
  companies: Array<{ id: string; name: string }>,
): Promise<{ projects: number; issues: number; attachments: number }> {
  let projects = 0;
  let issues = 0;
  let attachments = 0;
  for (const company of companies) {
    let companyProjects: Project[] = [];
    try {
      companyProjects = await api.get<Project[]>(`/api/companies/${company.id}/projects`);
    } catch {
      continue;
    }
    for (const project of companyProjects.filter((p) => p.name.startsWith(E2E_MARKER_PREFIX))) {
      const res = await api.tryDelete(`/api/projects/${project.id}?companyId=${company.id}`);
      if (res.ok) projects += 1;
    }

    let companyIssues: Issue[] = [];
    try {
      companyIssues = await api.get<Issue[]>(`/api/companies/${company.id}/issues?limit=500`);
    } catch {
      continue;
    }
    for (const issue of companyIssues.filter((i) => i.title.startsWith(E2E_MARKER_PREFIX))) {
      const atts = await api.try("GET", `/api/issues/${issue.id}/attachments`);
      const list = Array.isArray(atts.body) ? (atts.body as IssueAttachment[]) : [];
      for (const att of list) {
        const res = await api.tryDelete(`/api/attachments/${att.id}`);
        if (res.ok) attachments += 1;
      }
      const res = await api.tryDelete(`/api/issues/${issue.id}`);
      if (res.ok) issues += 1;
    }
  }
  return { projects, issues, attachments };
}
