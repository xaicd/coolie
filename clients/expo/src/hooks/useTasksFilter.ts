import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { CoolieApiError, type Company, type Issue, type Project } from "@coolie/api-client";
import { coolie, type AgentRow } from "../coolie";
import type { FilterOption } from "../components/FilterSheet";
import {
  countIssuesByStatus,
  type IssueSelection,
  type IssueSortField,
  type IssueSortDir,
  type IssuesScope,
  type IssuesView,
  type StatusFilter,
} from "../lib/issue-list";

// Re-export 给 TasksScreen 子组件 (Header/Search/Filters/ViewSwitch) 用,
// 这样子组件只 hook 这一个文件, 不必同时 import lib/issue-list + hook。
export type { IssuesScope, IssuesView, StatusFilter, IssueSelection };

/**
 * 排序项: 值编码为 `${field}:${dir}`, 与 chip/menu 展示一一对应。
 */
export const SORT_OPTIONS: Array<{
  value: string;
  label: string;
  field: IssueSortField;
  dir: IssueSortDir;
}> = [
  { value: "updated:desc", label: "更新时间", field: "updated", dir: "desc" },
  { value: "created:desc", label: "创建时间", field: "created", dir: "desc" },
  { value: "title:asc", label: "标题 A→Z", field: "title", dir: "asc" },
  { value: "title:desc", label: "标题 Z→A", field: "title", dir: "desc" },
];

export const SCOPE_OPTIONS: Array<{ key: IssuesScope; label: string }> = [
  { key: "focus", label: "今日+进行中" },
  { key: "all", label: "全部" },
];

export const VIEW_OPTIONS: Array<{ key: IssuesView; label: string }> = [
  { key: "list", label: "列表" },
  { key: "group", label: "分组" },
  { key: "board", label: "看板" },
];

// ── wave286 分页流式加载 (REQ-NAT-001..009, REQ-NFR-003) ─────────────────
// 常量与纯函数放在这里 (而非 lib/issue-list), 让 TaskKanbanScreen 只 import 这
// 一个文件就能复用同一套翻页口径 —— 与本文件已有的 re-export 惯例一致。

/** 页大小 (REQ-NAT-001, DAR-2 裁定 50)。 */
export const ISSUES_PAGE_SIZE = 50;
/** 服务端排序锚: offset 翻页必须锚定确定序 (REQ-NAT-001)。 */
export const ISSUES_PAGE_SORT_FIELD = "updated" as const;
export const ISSUES_PAGE_SORT_DIR = "desc" as const;
/** 兜底单次大页上限 (REQ-NFR-003; 服务端 ISSUE_LIST_MAX_LIMIT 同值)。 */
export const ISSUES_FALLBACK_LIMIT = 1000;

export interface IssuesPage {
  issues: Issue[];
  /** 满页 (== pageSize) 才可能还有下一页; 兜底全量拉取后恒 false。 */
  hasMore: boolean;
}

/** 服务端拒绝分页参数 (REQ-NFR-003 的触发条件)。 */
export function isPaginationRejected(e: unknown): boolean {
  return e instanceof CoolieApiError && (e.status === 400 || e.status === 422);
}

let warnedPaginationFallback = false;

/**
 * 拉取一页任务: 锚定 `updated:desc` + offset。服务端 400/422 拒绝分页参数时
 * 回退 `limit=1000` 单次全量并 warn 一次 (REQ-NFR-003), 保证功能可用。
 */
export async function fetchIssuesPage(
  companyId: string,
  offset: number,
  pageSize: number = ISSUES_PAGE_SIZE,
): Promise<IssuesPage> {
  try {
    const issues = await coolie.listIssues(companyId, {
      limit: pageSize,
      offset,
      sortField: ISSUES_PAGE_SORT_FIELD,
      sortDir: ISSUES_PAGE_SORT_DIR,
    });
    return { issues, hasMore: issues.length >= pageSize };
  } catch (e) {
    if (!isPaginationRejected(e)) throw e;
    if (!warnedPaginationFallback) {
      warnedPaginationFallback = true;
      console.warn(
        `[TasksPaging] 分页参数被服务端拒绝 (${(e as Error)?.message ?? e}), 回退 limit=${ISSUES_FALLBACK_LIMIT} 全量拉取`,
      );
    }
    const issues = await coolie.listIssues(companyId, { limit: ISSUES_FALLBACK_LIMIT });
    return { issues, hasMore: false };
  }
}

/**
 * 按 id 去重合并新页 (REQ-NAT-006, 与 web `mergeIssuePagesStable` 同语义):
 * 既有条目**保留原引用** (已渲染行不因重拉换引用, 保护 IssueRow 的 React.memo),
 * 只追加新 id —— offset 页间漂移产生的重复行在此收敛。
 */
export function mergeIssuesByIdStable(existing: Issue[], incoming: Issue[]): Issue[] {
  if (incoming.length === 0) return existing;
  const seen = new Set<string>();
  for (const issue of existing) seen.add(issue.id);
  let appended: Issue[] | null = null;
  for (const issue of incoming) {
    if (seen.has(issue.id)) continue;
    seen.add(issue.id);
    (appended ??= []).push(issue);
  }
  return appended ? [...existing, ...appended] : existing;
}

export type SheetKind = "assignee" | "project" | "sort" | null;

interface State {
  search: string;
  refreshSignal: number;
  scope: IssuesScope;
  status: StatusFilter;
  assignee: string;
  project: string;
  mainline: boolean;
  focusMainlineId: string | null;
  view: IssuesView;
  sortValue: string;
  sheet: SheetKind;
  createOpen: boolean;
}

type Action =
  | { kind: "set"; patch: Partial<State> }
  | { kind: "toggleMainline" }
  | { kind: "clearSearch" }
  | { kind: "focusMainline"; id: string | null }
  | { kind: "bumpRefresh" };

const INITIAL: State = {
  search: "",
  refreshSignal: 0,
  scope: "focus",
  status: "all",
  assignee: "all",
  project: "all",
  mainline: false,
  focusMainlineId: null,
  view: "list",
  sortValue: SORT_OPTIONS[0]!.value,
  sheet: null,
  createOpen: false,
};

function reducer(state: State, action: Action): State {
  switch (action.kind) {
    case "set":
      return { ...state, ...action.patch };
    case "toggleMainline":
      return { ...state, mainline: !state.mainline };
    case "clearSearch":
      return { ...state, search: "" };
    case "focusMainline":
      return { ...state, focusMainlineId: action.id };
    case "bumpRefresh":
      return { ...state, refreshSignal: state.refreshSignal + 1 };
    default:
      return state;
  }
}

export interface UseTasksFilterResult {
  // 渲染所需切片
  search: string;
  scope: IssuesScope;
  status: StatusFilter;
  assignee: string;
  project: string;
  mainline: boolean;
  focusMainlineId: string | null;
  view: IssuesView;
  sortValue: string;
  sheet: SheetKind;
  createOpen: boolean;
  refreshSignal: number;

  // 派生
  selection: IssueSelection;
  sortOption: (typeof SORT_OPTIONS)[number];
  statusCounts: Record<string, number>;
  assigneeLabel: string;
  projectLabel: string;
  assigneeOptions: FilterOption[];
  projectOptions: FilterOption[];
  sortOptions: FilterOption[];
  issueScopeLabel: string;

  // 数据
  agents: AgentRow[];
  projects: Project[];
  /** 已加载数据集 (wave286 起为分页去重合并结果; 筛选仍由 selectIssues 客户端执行)。 */
  issues: Issue[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;

  // wave286 分页 (REQ-NAT-001..009)
  hasMore: boolean;
  loadingMore: boolean;
  loadError: string | null;

  // 回调 (稳定)
  setSearch: (value: string) => void;
  clearSearch: () => void;
  setScope: (key: IssuesScope) => void;
  setStatus: (value: StatusFilter) => void;
  setAssignee: (value: string) => void;
  setProject: (value: string) => void;
  toggleMainline: () => void;
  setFocusMainlineId: (id: string | null) => void;
  setView: (key: IssuesView) => void;
  setSortValue: (value: string) => void;
  setSheet: (kind: SheetKind) => void;
  setCreateOpen: (open: boolean) => void;
  refresh: () => Promise<void>;
  loadIssues: (isRefresh?: boolean) => Promise<void>;
  /** 加载下一页; 在途/无更多/失败重试共用入口 (失败页游标不推进, 重拉同页)。 */
  loadMore: () => Promise<void>;
  handleCreated: (issue: Issue) => void;
}

/**
 * 任务页筛选 / 加载 / 派生的中央仓库 —— wave254 把原 TasksScreen 里散落的
 * 19 个 useState / 同步副作用 / 内联派生统一到一个 reducer + 三段 useEffect,
 * 让 TasksScreen 只负责布局, 子组件各自用 React.memo 包好。
 *
 * 不动 server / 业务逻辑, 数据契约与现状一致; 父子组件按 prop 拆开后, IssueRow
 * 只在 issue / parentIssue 引用变更时重渲。
 */
export function useTasksFilter(
  company: Company,
  refreshToken = 0,
  initialProjectId?: string | null,
): UseTasksFilterResult {
  const [state, dispatch] = useReducer(reducer, INITIAL, (init) => ({
    ...init,
    project: initialProjectId ?? "all",
  }));

  // 当外部带项目筛选 (项目卡「查看任务」) 变化时, 同步到 reducer。
  useEffect(() => {
    dispatch({ kind: "set", patch: { project: initialProjectId ?? "all" } });
  }, [initialProjectId]);

  const setSearch = useCallback((value: string) => {
    dispatch({ kind: "set", patch: { search: value } });
  }, []);
  const clearSearch = useCallback(() => dispatch({ kind: "clearSearch" }), []);
  const setScope = useCallback(
    (key: IssuesScope) => dispatch({ kind: "set", patch: { scope: key } }),
    [],
  );
  const setStatus = useCallback(
    (value: StatusFilter) => dispatch({ kind: "set", patch: { status: value } }),
    [],
  );
  const setAssignee = useCallback(
    (value: string) => dispatch({ kind: "set", patch: { assignee: value } }),
    [],
  );
  const setProject = useCallback(
    (value: string) => dispatch({ kind: "set", patch: { project: value } }),
    [],
  );
  const toggleMainline = useCallback(() => dispatch({ kind: "toggleMainline" }), []);
  const setFocusMainlineId = useCallback(
    (id: string | null) => dispatch({ kind: "focusMainline", id }),
    [],
  );
  const setView = useCallback(
    (key: IssuesView) => dispatch({ kind: "set", patch: { view: key } }),
    [],
  );
  const setSortValue = useCallback(
    (value: string) => dispatch({ kind: "set", patch: { sortValue: value } }),
    [],
  );
  const setSheet = useCallback(
    (kind: SheetKind) => dispatch({ kind: "set", patch: { sheet: kind } }),
    [],
  );
  const setCreateOpen = useCallback(
    (open: boolean) => dispatch({ kind: "set", patch: { createOpen: open } }),
    [],
  );

  // ── 数据 ────────────────────────────────────────────────────────────
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // wave286 分页游标与锁: ref 持有真值 (避免回调身份抖动), state 只做渲染镜像。
  // offset 仅在成功返回后推进 (REQ-NAT-007: 失败页不推进, 重试重拉同页);
  // epoch 在每次整页重置时 +1, 让在途的翻页响应过期作废 (防刷新/翻页竞态 R2)。
  const pagingOffsetRef = useRef(0);
  const pagingHasMoreRef = useRef(true);
  const pagingBusyRef = useRef(false);
  const pagingEpochRef = useRef(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadIssues = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      setLoadError(null);
      // REQ-NAT-008/009: 游标重置 + 首页重拉 + 整体替换 (下拉刷新 / 刷新信号同路)。
      pagingEpochRef.current += 1;
      const epoch = pagingEpochRef.current;
      try {
        const first = await fetchIssuesPage(company.id, 0);
        if (epoch !== pagingEpochRef.current) return; // 期间又被重置: 丢弃过期页
        pagingOffsetRef.current = first.issues.length;
        pagingHasMoreRef.current = first.hasMore;
        setHasMore(first.hasMore);
        setIssues(first.issues);
      } catch (e) {
        if (epoch !== pagingEpochRef.current) return;
        setError(String((e as Error)?.message ?? e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [company.id],
  );

  const refresh = useCallback(() => loadIssues(true), [loadIssues]);

  const loadMore = useCallback(async () => {
    // 在途锁 (REQ-NAT-007 / R2): 首屏/刷新/翻页任一在途即忽略新触发。
    if (pagingBusyRef.current || !pagingHasMoreRef.current) return;
    pagingBusyRef.current = true;
    setLoadingMore(true);
    setLoadError(null);
    const epoch = pagingEpochRef.current;
    try {
      const page = await fetchIssuesPage(company.id, pagingOffsetRef.current);
      if (epoch !== pagingEpochRef.current) return; // 期间刷新重置: 过期页不合并
      pagingOffsetRef.current += page.issues.length;
      pagingHasMoreRef.current = page.hasMore;
      setHasMore(page.hasMore);
      setIssues((prev) => mergeIssuesByIdStable(prev, page.issues));
    } catch (e) {
      if (epoch !== pagingEpochRef.current) return;
      setLoadError(String((e as Error)?.message ?? e));
    } finally {
      pagingBusyRef.current = false;
      setLoadingMore(false);
    }
  }, [company.id]);

  useEffect(() => {
    void loadIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id, state.refreshSignal + refreshToken]);

  useEffect(() => {
    void coolie
      .listAgents(company.id)
      .then(setAgents)
      .catch(() => setAgents([]));
  }, [company.id]);

  useEffect(() => {
    void coolie
      .listProjects(company.id)
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [company.id]);

  // ── 派生 ────────────────────────────────────────────────────────────
  const sortOption = useMemo(
    () => SORT_OPTIONS.find((o) => o.value === state.sortValue) ?? SORT_OPTIONS[0]!,
    [state.sortValue],
  );

  const selection: IssueSelection = useMemo(
    () => ({
      search: state.search,
      scope: state.scope,
      status: state.status,
      assignee: state.assignee,
      project: state.project,
      mainline: state.mainline,
      focusMainlineId: state.focusMainlineId,
      sortField: sortOption.field,
      sortDir: sortOption.dir,
    }),
    [
      state.search,
      state.scope,
      state.status,
      state.assignee,
      state.project,
      state.mainline,
      state.focusMainlineId,
      sortOption,
    ],
  );

  const statusCounts = useMemo(
    () => countIssuesByStatus(issues, selection),
    [issues, selection],
  );

  const assigneeLabel = useMemo(() => {
    if (state.assignee === "all") return "全部";
    if (state.assignee === "unassigned") return "未分配";
    return agents.find((a) => a.id === state.assignee)?.name ?? "已指派";
  }, [state.assignee, agents]);

  const projectLabel = useMemo(() => {
    if (state.project === "all") return "全部项目";
    return projects.find((p) => p.id === state.project)?.name ?? "项目";
  }, [state.project, projects]);

  const assigneeOptions: FilterOption[] = useMemo(
    () => [
      { value: "all", label: "全部" },
      { value: "unassigned", label: "未分配" },
      ...agents.map((a) => ({ value: a.id, label: a.name })),
    ],
    [agents],
  );

  const projectOptions: FilterOption[] = useMemo(
    () => [
      { value: "all", label: "全部项目" },
      ...projects.map((p) => ({
        value: p.id,
        label: p.name,
        dotColor: p.color ?? undefined,
      })),
    ],
    [projects],
  );

  const sortOptions: FilterOption[] = useMemo(
    () => SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    [],
  );

  const issueScopeLabel =
    state.scope === "focus" ? "今日 + 进行中" : "全部任务";

  const handleCreated = useCallback((issue: Issue) => {
    dispatch({ kind: "set", patch: { createOpen: false } });
    dispatch({ kind: "bumpRefresh" });
    // wave184 后改走 Toast, 这里保留兜底: 业务反馈回执现在归 ToastHost 处理,
    // 此函数保留, 是为了 API 不变 (CreateTaskModal 的 onCreated prop 还在)。
    // 调用方 (TasksScreen) 拿到 issue 后自己 toast.success, 不在这里弹 Alert。
    void issue;
  }, []);

  return {
    search: state.search,
    scope: state.scope,
    status: state.status,
    assignee: state.assignee,
    project: state.project,
    mainline: state.mainline,
    focusMainlineId: state.focusMainlineId,
    view: state.view,
    sortValue: state.sortValue,
    sheet: state.sheet,
    createOpen: state.createOpen,
    refreshSignal: state.refreshSignal,

    selection,
    sortOption,
    statusCounts,
    assigneeLabel,
    projectLabel,
    assigneeOptions,
    projectOptions,
    sortOptions,
    issueScopeLabel,

    agents,
    projects,
    issues,
    loading,
    refreshing,
    error,

    hasMore,
    loadingMore,
    loadError,

    setSearch,
    clearSearch,
    setScope,
    setStatus,
    setAssignee,
    setProject,
    toggleMainline,
    setFocusMainlineId,
    setView,
    setSortValue,
    setSheet,
    setCreateOpen,
    refresh,
    loadIssues,
    loadMore,
    handleCreated,
  };
}