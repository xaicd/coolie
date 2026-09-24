/**
 * SystemPRManager — 跨仓库 PR 汇总管理器 (TS-async)
 *
 * Migrated from DigitalStaff `backend/modules/git-ops/services/SystemPRManager.js`
 * under the wave 68 sync. Differences from the JS source:
 *
 *  - require() → import
 *  - module.exports → named export
 *  - callback → async/await
 *  - axios → Node 24 native `fetch`
 *  - lazy `require('mongoose')` model injection → injected `ChangeSet` store
 *    (so the coolie route layer can swap in Drizzle without circular deps)
 *  - hardcoded GitLab lookup URL → env (`GITLAB_URL`, `GITLAB_ADMIN_TOKEN`).
 *
 * The coolie fork initially scopes this to GitLab (most existing PR flows),
 * but the manager is provider-agnostic at the persistence layer: `prUrl`,
 * `prId`, and `prStatus` are the only externally visible fields.
 */

const PR_LOOKUP_WINDOW_MS = 5 * 60 * 1000;

export type ChangeSetStatus = "open" | "completed" | "cancelled";
export type PullRequestStatus = "pending" | "open" | "merged" | "closed";

export interface ChangeSetPullEntry {
  repoUrl: string;
  repoName: string;
  repoType: string;
  taskId: string;
  prUrl?: string;
  prId?: number;
  prTitle?: string;
  prStatus: PullRequestStatus;
  updatedAt?: Date;
}

export interface ChangeSetRecord {
  changeSetId: string;
  systemId: string;
  requirement: string;
  userId: string;
  prs: ChangeSetPullEntry[];
  status: ChangeSetStatus;
  completedAt: Date | null;
  metadata: { traceId?: string; taskCount?: number };
  createdAt: Date;
}

export interface ChangeSetTaskResult {
  results?: Array<{
    targetRepo?: string;
    repoName?: string;
    repoType?: string;
    taskDispatchId?: string;
    taskId?: string;
  }>;
  traceId?: string;
  taskCount?: number;
}

export interface ChangeSetStore {
  create(record: Omit<ChangeSetRecord, "createdAt" | "status" | "completedAt">): Promise<ChangeSetRecord>;
  find(changeSetId: string): Promise<ChangeSetRecord | null>;
  list(systemId: string, userId?: string): Promise<ChangeSetRecord[]>;
  updatePrs(changeSetId: string, prs: ChangeSetPullEntry[]): Promise<void>;
}

export interface SystemPRManagerOptions {
  env?: NodeJS.ProcessEnv;
  /** Override the GitLab HTTP client (tests inject a stub). */
  gitlab?: GitLabClient;
}

export interface GitLabMergeRequest {
  iid: number;
  web_url: string;
  title: string;
  state: "opened" | "closed" | "merged";
}

export interface GitLabClient {
  listRecentMergeRequests(projectPath: string, sinceIso: string): Promise<GitLabMergeRequest[]>;
  getMergeRequest(projectPath: string, mrIid: number): Promise<GitLabMergeRequest>;
}

function createDefaultGitLab(env: NodeJS.ProcessEnv): GitLabClient | null {
  const gitlabUrl = (env.GITLAB_URL ?? "").replace(/\/$/, "");
  const adminToken = env.GITLAB_ADMIN_TOKEN;
  if (!gitlabUrl || !adminToken) return null;
  return {
    async listRecentMergeRequests(projectPath, sinceIso) {
      const qs = new URLSearchParams({
        state: "opened",
        created_after: sinceIso,
        per_page: "5",
      });
      const url = `${gitlabUrl}/api/v4/projects/${projectPath}/merge_requests?${qs.toString()}`;
      const res = await fetch(url, {
        headers: { "Private-Token": adminToken },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`gitlab list_mrs http_${res.status}`);
      }
      return (await res.json()) as GitLabMergeRequest[];
    },
    async getMergeRequest(projectPath, mrIid) {
      const url = `${gitlabUrl}/api/v4/projects/${projectPath}/merge_requests/${mrIid}`;
      const res = await fetch(url, {
        headers: { "Private-Token": adminToken },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`gitlab get_mr http_${res.status}`);
      }
      return (await res.json()) as GitLabMergeRequest;
    },
  };
}

function extractProjectPath(repoUrl: string): string | null {
  const match = repoUrl.match(/gitlab[^/]*\/(.+?)(?:\.git)?$/i);
  return match ? match[1] : null;
}

function mapGitLabState(state: GitLabMergeRequest["state"]): PullRequestStatus {
  if (state === "merged") return "merged";
  if (state === "closed") return "closed";
  return "open";
}

export class SystemPRManager {
  private readonly env: NodeJS.ProcessEnv;
  private readonly gitlab: GitLabClient | null;

  constructor(private readonly store: ChangeSetStore, opts: SystemPRManagerOptions = {}) {
    this.env = opts.env ?? process.env;
    this.gitlab = opts.gitlab ?? createDefaultGitLab(this.env);
  }

  async createChangeSet(params: {
    systemId: string;
    requirement: string;
    userId: string;
    taskResults: ChangeSetTaskResult;
  }): Promise<{ changeSetId: string; prUrls: string[]; prCount: number; status: ChangeSetStatus }> {
    const prs = await this.extractPullEntries(params.taskResults);
    const record = await this.store.create({
      changeSetId: cryptoRandomId(),
      systemId: params.systemId,
      requirement: params.requirement.substring(0, 1000),
      userId: params.userId,
      prs,
      metadata: {
        traceId: params.taskResults?.traceId,
        taskCount: params.taskResults?.taskCount,
      },
    });

    if (this.gitlab) {
      void this.enrichPullUrlsAsync(record.changeSetId, prs).catch(() => undefined);
    }

    return {
      changeSetId: record.changeSetId,
      prUrls: prs.map((p) => p.prUrl).filter((url): url is string => Boolean(url)),
      prCount: prs.length,
      status: record.status,
    };
  }

  async getChangeSet(changeSetId: string): Promise<ChangeSetRecord> {
    const existing = await this.store.find(changeSetId);
    if (!existing) throw new Error(`变更集不存在: ${changeSetId}`);
    await this.refreshPullStatuses(existing);
    return existing;
  }

  async listChangeSets(systemId: string, userId?: string): Promise<ChangeSetRecord[]> {
    return this.store.list(systemId, userId);
  }

  async refreshChangeSet(changeSetId: string): Promise<ChangeSetRecord> {
    const existing = await this.store.find(changeSetId);
    if (!existing) throw new Error(`变更集不存在: ${changeSetId}`);

    await this.refreshPullStatuses(existing);

    const allMerged = existing.prs.length > 0 && existing.prs.every((p) => p.prStatus === "merged");
    if (allMerged && existing.status !== "completed") {
      existing.status = "completed";
      existing.completedAt = new Date();
    }
    await this.store.updatePrs(changeSetId, existing.prs);
    return existing;
  }

  private async extractPullEntries(taskResults: ChangeSetTaskResult): Promise<ChangeSetPullEntry[]> {
    if (!taskResults?.results) return [];
    return taskResults.results.map((r) => ({
      repoUrl: r.targetRepo ?? "",
      repoName: r.repoName ?? "",
      repoType: r.repoType ?? "backend",
      taskId: r.taskDispatchId ?? r.taskId ?? "",
      prStatus: "pending" satisfies PullRequestStatus,
    }));
  }

  private async enrichPullUrlsAsync(changeSetId: string, prs: ChangeSetPullEntry[]): Promise<void> {
    if (!this.gitlab) return;
    const since = new Date(Date.now() - PR_LOOKUP_WINDOW_MS).toISOString();
    const updated: ChangeSetPullEntry[] = [];
    for (const pr of prs) {
      if (!pr.repoUrl) {
        updated.push(pr);
        continue;
      }
      const projectPath = extractProjectPath(pr.repoUrl);
      if (!projectPath) {
        updated.push(pr);
        continue;
      }
      try {
        const mrs = await this.gitlab.listRecentMergeRequests(encodeURIComponent(projectPath), since);
        if (mrs.length > 0) {
          const mr = mrs[0];
          updated.push({
            ...pr,
            prUrl: mr.web_url,
            prId: mr.iid,
            prTitle: mr.title,
            prStatus: "open" satisfies PullRequestStatus,
          });
          continue;
        }
        updated.push(pr);
      } catch {
        updated.push(pr);
      }
    }
    await this.store.updatePrs(changeSetId, updated);
  }

  private async refreshPullStatuses(cs: ChangeSetRecord): Promise<void> {
    if (!this.gitlab) return;
    for (const pr of cs.prs) {
      if (!pr.repoUrl || !pr.prId) continue;
      const projectPath = extractProjectPath(pr.repoUrl);
      if (!projectPath) continue;
      try {
        const mr = await this.gitlab.getMergeRequest(encodeURIComponent(projectPath), pr.prId);
        pr.prStatus = mapGitLabState(mr.state);
        pr.updatedAt = new Date();
      } catch {
        // Per-PR failures are ignored; matches the JS contract.
      }
    }
  }
}

function cryptoRandomId(): string {
  // Compact, sortable ID — `Date.now()` prefix + 8 hex chars from `Math.random`.
  const stamp = Date.now().toString(36);
  const tail = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  return `${stamp}-${tail}`;
}