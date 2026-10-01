import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { Company, Issue, Project } from "@coolie/api-client";
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
  issues: Issue[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;

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

  const loadIssues = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        setIssues(await coolie.listIssues(company.id, { limit: 200 }));
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [company.id],
  );

  const refresh = useCallback(() => loadIssues(true), [loadIssues]);

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
    handleCreated,
  };
}