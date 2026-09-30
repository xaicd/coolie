import type { Issue, IssueStatus, Project } from "@coolie/api-client";

/**
 * 任务列表的纯函数层 —— wave125 把 web 的筛选/分组/排序/看板口径抽到这里,
 * 让 TasksScreen (持有筛选状态, 需要算状态计数) 与 IssuesList (渲染) 共用同一份
 * 选择逻辑, 不各写一套导致两边漂移。
 *
 * 全部在本地对已拉取的列表做选择: 与旧 IssuesList 的本地过滤一致, 不因切筛选
 * 而重新请求、闪一下。
 */

/** 「进行中」组认的状态: 与 issue-status 的「进行中」标签同口径。 */
export const ACTIVE_STATUS: IssueStatus = "in_progress";

/** 没有归属项目的任务在分组视图里的桶键。 */
export const NO_PROJECT = "__none__";

export type IssuesView = "list" | "group" | "board";
export type IssueSortField = "updated" | "created" | "title";
export type IssueSortDir = "asc" | "desc";
/** focus = 今日 + 进行中 (默认, 与旧任务页分工一致); all = 全部。 */
export type IssuesScope = "focus" | "all";
export type StatusFilter = "all" | IssueStatus;
/** all / unassigned / 具体员工 id。 */
export type AssigneeFilter = string;
/** all / 具体项目 id。 */
export type ProjectFilter = string;

export interface IssueSelection {
  search: string;
  scope: IssuesScope;
  status: StatusFilter;
  assignee: AssigneeFilter;
  project: ProjectFilter;
  /** 只看主线 —— 只留 里程碑 (isMilestone) 任务 (wave140). */
  mainline?: boolean;
  /** wave156: 聚焦下钻此主线 —— 只留该主线及其全量后代。 */
  focusMainlineId?: string | null;
  sortField: IssueSortField;
  sortDir: IssueSortDir;
}

export function issueTimestamp(issue: Issue): string | Date | undefined {
  return issue.createdAt ?? issue.updatedAt;
}

function timeMs(input?: string | Date | null): number {
  if (input === undefined || input === null) return 0;
  const value = new Date(input).getTime();
  return Number.isNaN(value) ? 0 : value;
}

export function isToday(input?: string | Date | null): boolean {
  if (!input) return false;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  return date.getTime() >= startOfToday;
}

function matchesSearch(issue: Issue, needle: string): boolean {
  if (!needle) return true;
  return [issue.title, issue.identifier ?? "", issue.id].some((value) =>
    value.toLowerCase().includes(needle),
  );
}

function sortIssues(
  list: Issue[],
  field: IssueSortField,
  dir: IssueSortDir,
): Issue[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    let cmp: number;
    if (field === "title") {
      cmp = a.title.localeCompare(b.title, "zh-Hans-CN");
    } else if (field === "created") {
      cmp = timeMs(a.createdAt) - timeMs(b.createdAt);
    } else {
      cmp =
        timeMs(a.updatedAt ?? a.createdAt) - timeMs(b.updatedAt ?? b.createdAt);
    }
    if (cmp === 0) cmp = a.id.localeCompare(b.id);
    return sign * cmp;
  });
}

/** 搜索 + 范围 + 状态/指派/项目筛选 + 排序, 一步得到要渲染的任务。 */
export function selectIssues(issues: Issue[], sel: IssueSelection): Issue[] {
  const needle = sel.search.trim().toLowerCase();
  let list = issues.filter((issue) => matchesSearch(issue, needle));

  if (sel.scope === "focus") {
    list = list.filter(
      (issue) => issue.status === ACTIVE_STATUS || isToday(issueTimestamp(issue)),
    );
  }
  if (sel.status !== "all") {
    list = list.filter((issue) => issue.status === sel.status);
  }
  if (sel.assignee === "unassigned") {
    list = list.filter((issue) => !issue.assigneeAgentId);
  } else if (sel.assignee !== "all") {
    list = list.filter((issue) => issue.assigneeAgentId === sel.assignee);
  }
  if (sel.project !== "all") {
    list = list.filter(
      (issue) => (issue.projectId ?? NO_PROJECT) === sel.project,
    );
  }
  if (sel.mainline) {
    list = list.filter((issue) => issue.isMilestone === true);
  }
  if (sel.focusMainlineId) {
    const childrenByParent = new Map<string, Issue[]>();
    for (const issue of list) {
      if (!issue.parentId) continue;
      const bucket = childrenByParent.get(issue.parentId);
      if (bucket) bucket.push(issue);
      else childrenByParent.set(issue.parentId, [issue]);
    }
    const keep = new Set<string>([sel.focusMainlineId]);
    const stack: string[] = [sel.focusMainlineId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const child of childrenByParent.get(current) ?? []) {
        if (keep.has(child.id)) continue;
        keep.add(child.id);
        stack.push(child.id);
      }
    }
    list = list.filter((issue) => keep.has(issue.id));
  }

  return sortIssues(list, sel.sortField, sel.sortDir);
}

/** 各状态可选数量 —— 忽略状态筛选本身, 其余条件照常, 用于状态 chips 的计数。 */
export function countIssuesByStatus(
  issues: Issue[],
  sel: IssueSelection,
): Record<string, number> {
  const base = selectIssues(issues, { ...sel, status: "all" });
  const counts: Record<string, number> = { all: base.length };
  for (const issue of base) {
    counts[issue.status] = (counts[issue.status] ?? 0) + 1;
  }
  return counts;
}

export interface IssueGroup {
  key: string;
  label: string;
  items: Issue[];
}

/** 按项目分组 —— 组顺序跟随项目列表, 未归属项目沉底。 */
export function groupIssuesByProject(
  issues: Issue[],
  projects: Project[],
): IssueGroup[] {
  const nameById = new Map(projects.map((p) => [p.id, p.name]));
  const orderById = new Map(projects.map((p, index) => [p.id, index]));
  const buckets = new Map<string, Issue[]>();

  for (const issue of issues) {
    const key = issue.projectId ?? NO_PROJECT;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(issue);
    else buckets.set(key, [issue]);
  }

  return [...buckets.entries()]
    .map(([key, items]) => ({
      key,
      label:
        key === NO_PROJECT
          ? "未归属项目"
          : (nameById.get(key) ?? `项目 ${key.slice(0, 8)}`),
      items,
    }))
    .sort((a, b) => {
      const ai = a.key === NO_PROJECT ? Number.MAX_SAFE_INTEGER : (orderById.get(a.key) ?? Number.MAX_SAFE_INTEGER);
      const bi = b.key === NO_PROJECT ? Number.MAX_SAFE_INTEGER : (orderById.get(b.key) ?? Number.MAX_SAFE_INTEGER);
      return ai - bi;
    });
}
