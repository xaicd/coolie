import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  LayoutChangeEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import type { Company, Issue, IssueStatus, Project } from "@coolie/api-client";
import { C, coolie, type AgentRow } from "../coolie";
import { ELEVATION, FONT_SIZE, RADIUS, SPACING } from "../ui/tokens";
import { SegmentedControl } from "../ui/SegmentedControl";
import { FilterSheet, type FilterOption } from "../components/FilterSheet";
import { QuickApprovalCard } from "../components/QuickApprovalCard";
import { IssuesList } from "../components/IssuesList";
import { fetchIssuesPage, mergeIssuesByIdStable } from "../hooks/useTasksFilter";
import {
  countIssuesByStatus,
  type IssueSelection,
  type IssuesScope,
  type IssuesView,
  type IssueSortDir,
  type IssueSortField,
  type StatusFilter,
} from "../lib/issue-list";
import {
  ISSUE_STATUS_ORDER,
  issueStatusColor,
  issueStatusLabel,
} from "../components/issue-status";
import { formatRelativeShort } from "../utils/format";
import { showErrorToast, showSuccessToast } from "../ui/toast";

/**
 * TaskKanbanScreen — 任务看板、项目分组与列表中枢 (全能高性能)
 *
 * 核心功能与性能设计:
 *  1. 默认秒开列表视图，同时支持「项目分组」与「状态看板」三大视图随时自由切换;
 *  2. 项目分组基于原生高性能 SectionList + 吸顶标题，直观呈现不同项目下所有任务分布;
 *  3. 看板采用 Web 版同款「分列渐进式渲染」(每列默认 10 张 + 展开更多)，消除卡顿;
 *  4. 拖拽手势添加 activateAfterLongPress(200)，彻底解决普通滚动与拖拽判定冲突引起的卡顿。
 */

type SheetKind = "assignee" | "project" | "sort" | null;

const VIEW_OPTIONS: Array<{ key: IssuesView; label: string }> = [
  { key: "list", label: "列表" },
  { key: "group", label: "项目分组" },
  { key: "board", label: "看板" },
];

const SCOPE_OPTIONS: Array<{ key: IssuesScope; label: string }> = [
  { key: "focus", label: "今日+进行中" },
  { key: "all", label: "全部" },
];

const SORT_OPTIONS: Array<{
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

export const KANBAN_COLUMN_INITIAL_VISIBLE_LIMIT = 10;
export const KANBAN_COLUMN_REVEAL_INCREMENT = 10;

const KANBAN_COLUMNS: IssueStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
];

const COLUMN_TONES: Record<
  string,
  { bg: string; border: string; headerText: string; countBg: string }
> = {
  backlog: {
    bg: "rgba(148, 163, 184, 0.05)",
    border: "rgba(148, 163, 184, 0.16)",
    headerText: C.ink3,
    countBg: "rgba(148, 163, 184, 0.12)",
  },
  todo: {
    bg: "rgba(245, 158, 11, 0.05)",
    border: "rgba(245, 158, 11, 0.20)",
    headerText: "#d97706",
    countBg: "rgba(245, 158, 11, 0.15)",
  },
  in_progress: {
    bg: "rgba(59, 130, 246, 0.05)",
    border: "rgba(59, 130, 246, 0.20)",
    headerText: "#2563eb",
    countBg: "rgba(59, 130, 246, 0.15)",
  },
  in_review: {
    bg: "rgba(139, 92, 246, 0.05)",
    border: "rgba(139, 92, 246, 0.20)",
    headerText: "#7c3aed",
    countBg: "rgba(139, 92, 246, 0.15)",
  },
  blocked: {
    bg: "rgba(239, 68, 68, 0.05)",
    border: "rgba(239, 68, 68, 0.20)",
    headerText: "#dc2626",
    countBg: "rgba(239, 68, 68, 0.15)",
  },
  done: {
    bg: "rgba(16, 185, 129, 0.05)",
    border: "rgba(16, 185, 129, 0.20)",
    headerText: "#059669",
    countBg: "rgba(16, 185, 129, 0.15)",
  },
  cancelled: {
    bg: "rgba(100, 116, 139, 0.04)",
    border: "rgba(100, 116, 139, 0.12)",
    headerText: C.ink4,
    countBg: "rgba(100, 116, 139, 0.10)",
  },
};

type ColumnLayout = { x: number; width: number; status: IssueStatus };

export function TaskKanbanScreen({
  company,
  refreshToken = 0,
  initialProjectId,
  onOpenIssue,
}: {
  company: Company;
  refreshToken?: number;
  initialProjectId?: string | null;
  onOpenIssue: (issue: Issue) => void;
}) {
  const [search, setSearch] = useState("");
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // wave286 分页流式 (REQ-NAT-001..009): 游标/锁存 ref (防回调身份抖动), state 只做渲染镜像。
  // offset 仅在成功返回后推进 (REQ-NAT-007 失败页不推进); epoch 让刷新后在途的翻页响应作废。
  const pagingOffsetRef = useRef(0);
  const pagingHasMoreRef = useRef(true);
  const pagingBusyRef = useRef(false);
  const pagingEpochRef = useRef(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [scope, setScope] = useState<IssuesScope>("focus");
  const [assignee, setAssignee] = useState("all");
  const [project, setProject] = useState(initialProjectId ?? "all");
  const [mainline, setMainline] = useState(false);
  // 默认使用极速秒开的列表视图，彻底解决开屏卡顿
  const [view, setView] = useState<IssuesView>("list");
  const [sortValue, setSortValue] = useState(SORT_OPTIONS[0]!.value);
  const [sheet, setSheet] = useState<SheetKind>(null);

  // 对标 Web 端: 分列渐进式渲染限额状态，初始每列只渲染前 10 张卡片
  const [visibleLimitByStatus, setVisibleLimitByStatus] = useState<Record<string, number>>({});

  const handleShowMore = useCallback((status: IssueStatus) => {
    void Haptics.selectionAsync();
    setVisibleLimitByStatus((prev) => ({
      ...prev,
      [status]:
        (prev[status] ?? KANBAN_COLUMN_INITIAL_VISIBLE_LIMIT) +
        KANBAN_COLUMN_REVEAL_INCREMENT,
    }));
  }, []);

  const sortOption = useMemo(
    () => SORT_OPTIONS.find((option) => option.value === sortValue) ?? SORT_OPTIONS[0]!,
    [sortValue],
  );

  const selection: IssueSelection = useMemo(
    () => ({
      search,
      scope,
      status: "all" as StatusFilter,
      assignee,
      project,
      mainline,
      sortField: sortOption.field,
      sortDir: sortOption.dir,
    }),
    [search, scope, assignee, project, mainline, sortOption],
  );

  const visible = useMemo(() => {
    const filtered = issues.filter((issue) => {
      if (selection.search) {
        const q = selection.search.toLowerCase();
        if (!issue.title.toLowerCase().includes(q)) return false;
      }
      if (selection.assignee !== "all" && issue.assigneeAgentId !== selection.assignee)
        return false;
      if (selection.project !== "all") {
        const projectIds = projects
          .filter((p) => p.id === selection.project)
          .map((p) => p.id);
        if (!projectIds.includes(issue.projectId ?? "")) return false;
      }
      if (selection.mainline && issue.wbsType !== "task") return false;
      if (selection.scope === "focus") {
        const isOpen = !["done", "cancelled"].includes(issue.status);
        const isToday =
          issue.updatedAt &&
          new Date(issue.updatedAt).toDateString() === new Date().toDateString();
        if (!isOpen && !isToday) return false;
      }
      return true;
    });
    filtered.sort((a, b) => {
      const f = selection.sortField;
      if (f === "title") {
        return selection.sortDir === "asc"
          ? a.title.localeCompare(b.title)
          : b.title.localeCompare(a.title);
      }
      const ta = new Date(f === "created" ? a.createdAt ?? 0 : a.updatedAt ?? 0).getTime();
      const tb = new Date(f === "created" ? b.createdAt ?? 0 : b.updatedAt ?? 0).getTime();
      return selection.sortDir === "asc" ? ta - tb : tb - ta;
    });
    return filtered;
  }, [issues, selection, projects]);

  const byStatus = useMemo(() => {
    const map: Record<string, Issue[]> = {};
    for (const status of KANBAN_COLUMNS) map[status] = [];
    for (const issue of visible) {
      if (map[issue.status]) map[issue.status]!.push(issue);
    }
    return map;
  }, [visible]);

  const loadIssues = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      setLoadError(null);
      // wave286 REQ-NAT-008/009: 游标重置 + 首页重拉 + 整体替换 (刷新/新建任务同路)。
      pagingEpochRef.current += 1;
      const epoch = pagingEpochRef.current;
      try {
        const [first, fetchedAgents, fetchedProjects] = await Promise.all([
          fetchIssuesPage(company.id, 0),
          coolie.listAgents(company.id).catch(() => []),
          coolie.listProjects(company.id).catch(() => []),
        ]);
        if (epoch !== pagingEpochRef.current) return; // 期间又被重置: 丢弃过期页
        pagingOffsetRef.current = first.issues.length;
        pagingHasMoreRef.current = first.hasMore;
        setHasMore(first.hasMore);
        setIssues(first.issues);
        setAgents(fetchedAgents);
        setProjects(fetchedProjects);
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

  const loadMore = useCallback(async () => {
    // 在途锁 (R2): 首屏/刷新/翻页任一在途即忽略新触发。
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
  }, [loadIssues, refreshSignal + refreshToken]);

  useEffect(() => {
    setProject(initialProjectId ?? "all");
  }, [initialProjectId]);

  // 拖拽核心 ── 列布局 + 拖动中的 issue ──
  const columnLayouts = useRef<Record<string, ColumnLayout>>({}).current;
  const [dragIssue, setDragIssue] = useState<Issue | null>(null);
  const dragOffsetX = useSharedValue(0);
  const dragOffsetY = useSharedValue(0);

  const onColumnLayout = useCallback(
    (status: IssueStatus) => (e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout;
      columnLayouts[status] = { x, width, status };
    },
    [columnLayouts],
  );

  /**
   * 列落点判定 + PATCH。
   * shared value (JS 线程) 上找落点列, 调 API, 乐观更新本地 issues,
   * 失败回滚 + Toast。
   */
  const tryDropOnColumn = useCallback(
    async (targetStatus: IssueStatus, issue: Issue) => {
      if (issue.status === targetStatus) return;
      const prevStatus = issue.status;

      // 乐观更新: UI 立刻换列, 用户看到的是即时反馈
      setIssues((current) =>
        current.map((it) => (it.id === issue.id ? { ...it, status: targetStatus } : it)),
      );
      setDragIssue(null);

      try {
        await coolie.updateIssueStatus(company.id, issue.id, targetStatus);
        showSuccessToast("状态已更新", `${issue.title} → ${issueStatusLabel(targetStatus)}`);
      } catch (e) {
        // 回滚
        setIssues((current) =>
          current.map((it) =>
            it.id === issue.id ? { ...it, status: prevStatus } : it,
          ),
        );
        // 服务端 422 带机器码时映射成固定中文 (与 web Issues.tsx 8437af145 的
        // 列位无关文案一致); 其余错误维持原文。
        const code = (e as { code?: string })?.code;
        const msg =
          code === "status_transition_requires_assignee"
            ? "请先指派负责人, 再移动该工单 (Todo 与 In Progress 都需要指派)。"
            : ((e as Error)?.message ?? "未知错误");
        showErrorToast("无法换列", msg);
      }
    },
    [company.id],
  );

  /**
   * 工作线程上的落点查找 (由 Pan gesture 在 worklet 里调用)。
   * 拿到落点列后用 runOnJS 切回 JS 线程执行 PATCH。
   */
  const resolveDropTarget = useCallback(
    (absX: number) => {
      for (const status of KANBAN_COLUMNS) {
        const col = columnLayouts[status];
        if (!col) continue;
        if (absX >= col.x && absX <= col.x + col.width) return status;
      }
      return null;
    },
    [columnLayouts],
  );

  const assigneeLabel = useMemo(() => {
    if (assignee === "all") return "全部";
    const a = agents.find((x) => x.id === assignee);
    return a?.name ?? "已选";
  }, [assignee, agents]);
  const projectLabel = useMemo(() => {
    if (project === "all") return "全部项目";
    return projects.find((p) => p.id === project)?.name ?? "已选";
  }, [project, projects]);
  const assigneeOptions = useMemo<FilterOption[]>(
    () => [
      { value: "all", label: "全部" },
      ...agents.map((a) => ({ value: a.id, label: a.name })),
    ],
    [agents],
  );
  const projectOptions = useMemo<FilterOption[]>(
    () => [
      { value: "all", label: "全部项目" },
      ...projects.map((p) => ({ value: p.id, label: p.name })),
    ],
    [projects],
  );
  const sortOptions = useMemo<FilterOption[]>(
    () => SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    [],
  );

  const totalCount = visible.length;

  // wave285 (原生任务页下拉刷新性能优化): 筛选区两种视图共用。
  // board 走整屏竖向滚动 (列高可超屏, 原结构不动, 拖拽零改动);
  // list 走固定顶栏 + IssuesList 真列表本体 (FlatList/SectionList) 自己
  // 持有滚动与下拉刷新 —— VirtualizedList 不再嵌在外层 ScrollView 里
  // (嵌套会让窗口化失效 + 下拉刷新整屏重排, 是「原生太卡」的根因)。
  const headerCluster = (
    <>
      <View style={styles.titleRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.h1}>任务看板</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {company.name} · {totalCount} 个任务 · 拖卡片换列
          </Text>
        </View>
        <Pressable
          style={styles.refreshBtn}
          onPress={() => void loadIssues(true)}
          hitSlop={8}
          accessibilityLabel="刷新任务"
        >
          <Ionicons name="refresh-outline" size={16} color={C.ink3} />
        </Pressable>
      </View>

      <View style={styles.scopeRow}>
        {SCOPE_OPTIONS.map((option) => (
          <Pressable
            key={option.key}
            style={({ pressed }) => [
              styles.chip,
              scope === option.key && styles.chipActive,
              pressed && styles.chipPressed,
            ]}
            onPress={() => setScope(option.key)}
          >
            <Text
              style={[
                styles.chipText,
                scope === option.key && styles.chipTextActive,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroller}
        contentContainerStyle={styles.chipRow}
      >
        <Pressable
          style={[styles.chip, assignee !== "all" && styles.chipActive]}
          onPress={() => setSheet("assignee")}
        >
          <Text style={[styles.chipText, assignee !== "all" && styles.chipTextActive]}>
            指派 · {assigneeLabel}
          </Text>
          <Ionicons name="chevron-down" size={12} color={C.ink3} />
        </Pressable>
        <Pressable
          style={[styles.chip, project !== "all" && styles.chipActive]}
          onPress={() => setSheet("project")}
        >
          <Text style={[styles.chipText, project !== "all" && styles.chipTextActive]}>
            项目 · {projectLabel}
          </Text>
          <Ionicons name="chevron-down" size={12} color={C.ink3} />
        </Pressable>
        <Pressable style={styles.chip} onPress={() => setSheet("sort")}>
          <Text style={styles.chipText}>排序 · {sortOption.label}</Text>
          <Ionicons name="chevron-down" size={12} color={C.ink3} />
        </Pressable>
        <Pressable
          style={[styles.chip, mainline && styles.chipActive]}
          onPress={() => setMainline((v) => !v)}
        >
          <Text style={[styles.chipText, mainline && styles.chipTextActive]}>
            只看主线
          </Text>
        </Pressable>
      </ScrollView>

      <SegmentedControl
        options={VIEW_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
        value={view}
        onChange={(key) => setView(key as IssuesView)}
      />

      {error ? (
        <Text style={styles.error}>任务加载失败: {error}</Text>
      ) : null}
    </>
  );

  return (
    <View style={styles.screen}>
      {/* wave275 (P0-03) 语义保留: view==="board" 走看板拖拽区, 否则走 IssuesList。
           wave285: 列表分支不再把 IssuesList 垫在外层 ScrollView 里。 */}
      {view === "board" ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadIssues(true)}
              tintColor={C.accent}
            />
          }
        >
          {headerCluster}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.boardScroll}
          >
            {KANBAN_COLUMNS.map((status) => (
              <KanbanColumnView
                key={status}
                status={status}
                issues={byStatus[status] ?? []}
                agents={agents}
                projects={projects}
                visibleLimit={visibleLimitByStatus[status] ?? KANBAN_COLUMN_INITIAL_VISIBLE_LIMIT}
                onShowMore={() => handleShowMore(status)}
                onLayout={onColumnLayout(status)}
                onOpenIssue={onOpenIssue}
                dragOffsetX={dragOffsetX}
                dragOffsetY={dragOffsetY}
                dragIssue={dragIssue}
                setDragIssue={setDragIssue}
                tryDropOnColumn={tryDropOnColumn}
                resolveDropTarget={resolveDropTarget}
              />
            ))}
          </ScrollView>
          {/* wave286 REQ-NAT-011: 看板列区尾部的加载更多入口 (不进列渲染/拖拽路径)。 */}
          {hasMore || loadingMore || loadError ? (
            <View style={styles.boardLoadMoreBox}>
              {loadingMore ? (
                <Text style={styles.boardLoadEndText}>正在加载更多…</Text>
              ) : loadError ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.boardLoadMoreBtn,
                    pressed && styles.boardLoadMoreBtnPressed,
                  ]}
                  onPress={() => void loadMore()}
                  accessibilityRole="button"
                  accessibilityLabel="重试加载更多任务"
                >
                  <Ionicons name="refresh-outline" size={13} color={C.err} />
                  <Text style={[styles.boardLoadMoreText, { color: C.err }]}>
                    加载更多失败, 点按重试 (已加载 {issues.length} 条)
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  style={({ pressed }) => [
                    styles.boardLoadMoreBtn,
                    pressed && styles.boardLoadMoreBtnPressed,
                  ]}
                  onPress={() => void loadMore()}
                  accessibilityRole="button"
                  accessibilityLabel="加载更多任务"
                >
                  <Ionicons name="chevron-down" size={13} color={C.ink3} />
                  <Text style={styles.boardLoadMoreText}>
                    加载更多 · 已加载 {issues.length} 条
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <View style={styles.listLayout}>
          {headerCluster}
          <IssuesList
            issues={visible}
            loading={loading}
            error={error}
            onIssuePress={onOpenIssue}
            selection={selection}
            view={view}
            agents={agents}
            projects={projects}
            refreshing={refreshing}
            onRefresh={() => void loadIssues(true)}
            contentContainerStyle={styles.listContent}
            hasMore={hasMore}
            loadingMore={loadingMore}
            loadError={loadError}
            onLoadMore={loadMore}
            onRetryLoadMore={loadMore}
            loadedCount={issues.length}
          />
        </View>
      )}

      <QuickApprovalCard companyId={company.id} floating />

      <FilterSheet
        visible={sheet === "assignee"}
        title="指派"
        options={assigneeOptions}
        selected={assignee}
        onSelect={setAssignee}
        onClose={() => setSheet(null)}
      />
      <FilterSheet
        visible={sheet === "project"}
        title="项目"
        options={projectOptions}
        selected={project}
        onSelect={setProject}
        onClose={() => setSheet(null)}
      />
      <FilterSheet
        visible={sheet === "sort"}
        title="排序"
        options={sortOptions}
        selected={sortValue}
        onSelect={setSortValue}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

const KanbanColumnView = memo(function KanbanColumnView({
  status,
  issues,
  agents,
  projects,
  visibleLimit,
  onShowMore,
  onLayout,
  onOpenIssue,
  dragOffsetX,
  dragOffsetY,
  dragIssue,
  setDragIssue,
  tryDropOnColumn,
  resolveDropTarget,
}: {
  status: IssueStatus;
  issues: Issue[];
  agents: AgentRow[];
  projects: Project[];
  visibleLimit: number;
  onShowMore: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
  onOpenIssue: (issue: Issue) => void;
  dragOffsetX: ReturnType<typeof useSharedValue<number>>;
  dragOffsetY: ReturnType<typeof useSharedValue<number>>;
  dragIssue: Issue | null;
  setDragIssue: (issue: Issue | null) => void;
  tryDropOnColumn: (status: IssueStatus, issue: Issue) => Promise<void>;
  resolveDropTarget: (absX: number) => IssueStatus | null;
}) {
  const color = issueStatusColor(status);
  const tone = COLUMN_TONES[status] ?? COLUMN_TONES.backlog!;
  const visibleIssues = issues.slice(0, visibleLimit);
  const hiddenCount = Math.max(issues.length - visibleIssues.length, 0);
  const nextRevealCount = Math.min(KANBAN_COLUMN_REVEAL_INCREMENT, hiddenCount);

  return (
    <View
      style={[
        styles.column,
        { backgroundColor: tone.bg, borderColor: tone.border },
      ]}
      onLayout={onLayout}
    >
      <View style={styles.columnHeader}>
        <View style={[styles.columnDot, { backgroundColor: color }]} />
        <Text style={[styles.columnTitle, { color: tone.headerText }]}>
          {issueStatusLabel(status)}
        </Text>
        <View style={[styles.columnCountBadge, { backgroundColor: tone.countBg }]}>
          <Text style={[styles.columnCountText, { color: tone.headerText }]}>
            {issues.length}
          </Text>
        </View>
      </View>

      {issues.length === 0 ? (
        <View style={styles.columnEmptyBox}>
          <Text style={styles.columnEmpty}>暂无任务</Text>
        </View>
      ) : (
        <>
          {visibleIssues.map((issue) => (
            <DraggableKanbanCard
              key={issue.id}
              issue={issue}
              assigneeName={
                issue.assigneeAgentId
                  ? agents.find((a) => a.id === issue.assigneeAgentId)?.name ?? "已指派"
                  : "未分配"
              }
              projectName={
                issue.projectId
                  ? projects.find((p) => p.id === issue.projectId)?.name ?? null
                  : null
              }
              onPress={() => onOpenIssue(issue)}
              dragOffsetX={dragOffsetX}
              dragOffsetY={dragOffsetY}
              dragIssue={dragIssue}
              setDragIssue={setDragIssue}
              tryDropOnColumn={tryDropOnColumn}
              resolveDropTarget={resolveDropTarget}
            />
          ))}

          {hiddenCount > 0 ? (
            <Pressable
              style={({ pressed }) => [
                styles.showMoreBtn,
                { borderColor: tone.border },
                pressed && styles.showMoreBtnPressed,
              ]}
              onPress={onShowMore}
              accessibilityRole="button"
              accessibilityLabel={`展开更多 ${nextRevealCount} 项任务`}
            >
              <Ionicons name="chevron-down" size={13} color={tone.headerText} />
              <Text style={[styles.showMoreText, { color: tone.headerText }]}>
                展开更多 +{nextRevealCount}
              </Text>
              <Text style={styles.showMoreSubText}>
                ({visibleIssues.length}/{issues.length})
              </Text>
            </Pressable>
          ) : issues.length > KANBAN_COLUMN_INITIAL_VISIBLE_LIMIT ? (
            <View style={styles.allShownBox}>
              <Text style={styles.allShownText}>已显示全部 {issues.length} 项</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
});

const DraggableKanbanCard = memo(function DraggableKanbanCard({
  issue,
  assigneeName,
  projectName,
  onPress,
  dragOffsetX,
  dragOffsetY,
  dragIssue,
  setDragIssue,
  tryDropOnColumn,
  resolveDropTarget,
}: {
  issue: Issue;
  assigneeName: string;
  projectName?: string | null;
  onPress: () => void;
  dragOffsetX: ReturnType<typeof useSharedValue<number>>;
  dragOffsetY: ReturnType<typeof useSharedValue<number>>;
  dragIssue: Issue | null;
  setDragIssue: (issue: Issue | null) => void;
  tryDropOnColumn: (status: IssueStatus, issue: Issue) => Promise<void>;
  resolveDropTarget: (absX: number) => IssueStatus | null;
}) {
  const cardX = useSharedValue(0);
  const cardY = useSharedValue(0);
  const cardScale = useSharedValue(1);
  const cardOpacity = useSharedValue(1);
  const isThisDragging = dragIssue?.id === issue.id;

  const triggerHapticStart = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const handleDrop = useCallback(
    (absX: number, droppedIssue: Issue) => {
      const target = resolveDropTarget(absX);
      if (!target) {
        // 落回原列
        return;
      }
      void tryDropOnColumn(target, droppedIssue);
    },
    [resolveDropTarget, tryDropOnColumn],
  );

  const handleDragStart = useCallback(
    (it: Issue) => {
      setDragIssue(it);
    },
    [setDragIssue],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(200) // 长按 200ms 后才激活拖拽，正常滑动丝滑不抢主线程事件
        .onStart(() => {
          cardScale.value = withSpring(1.04);
          cardOpacity.value = withTiming(0.85);
          runOnJS(triggerHapticStart)();
          runOnJS(handleDragStart)(issue);
        })
        .onUpdate((e) => {
          cardX.value = e.translationX;
          cardY.value = e.translationY;
          dragOffsetX.value = e.translationX;
          dragOffsetY.value = e.translationY;
        })
        .onEnd((e) => {
          const targetX = e.absoluteX;
          runOnJS(handleDrop)(targetX, issue);
          cardX.value = withSpring(0);
          cardY.value = withSpring(0);
          cardScale.value = withSpring(1);
          cardOpacity.value = withTiming(1);
        }),
    [
      cardX,
      cardY,
      cardScale,
      cardOpacity,
      dragOffsetX,
      dragOffsetY,
      issue,
      triggerHapticStart,
      handleDragStart,
      handleDrop,
    ],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cardX.value },
      { translateY: cardY.value },
      { scale: cardScale.value },
    ],
    opacity: cardOpacity.value,
    zIndex: isThisDragging ? 100 : 1,
    elevation: isThisDragging ? 8 : 1,
  }));

  const color = issueStatusColor(issue.status);
  const time = formatRelativeShort(issue.updatedAt ?? issue.createdAt);
  const identifier = issue.identifier ?? `#${issue.id.slice(0, 5).toUpperCase()}`;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.cardWrap, animatedStyle]}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={issue.title}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={[styles.cardAccent, { backgroundColor: color }]} />

          {/* 卡片头部徽标区: 任务 Identifier + 主线/Spec + 项目标记 */}
          <View style={styles.cardHeaderRow}>
            <View style={styles.identifierBadge}>
              <Text style={styles.identifierText}>{identifier}</Text>
            </View>
            {projectName ? (
              <View style={styles.projectBadge}>
                <Ionicons name="folder-outline" size={10} color={C.ink3} />
                <Text style={styles.projectBadgeText} numberOfLines={1}>
                  {projectName}
                </Text>
              </View>
            ) : null}
            {issue.isMilestone ? (
              <View style={styles.mainlineBadge}>
                <Text style={styles.mainlineBadgeText}>主线</Text>
              </View>
            ) : null}
            {issue.specKind ? (
              <View style={styles.specBadge}>
                <Text style={styles.specBadgeText}>Spec</Text>
              </View>
            ) : null}
          </View>

          {/* 标题 */}
          <Text style={styles.cardTitle} numberOfLines={2}>
            {issue.title}
          </Text>

          {/* 底部 Meta: 指派人头像首字 + 姓名 + 相对更新时间 */}
          <View style={styles.cardMeta}>
            <View style={styles.cardAssigneeBox}>
              <View style={styles.assigneeAvatar}>
                <Text style={styles.assigneeAvatarText}>
                  {assigneeName ? assigneeName.slice(0, 1) : "?"}
                </Text>
              </View>
              <Text style={styles.cardAssignee} numberOfLines={1}>
                {assigneeName}
              </Text>
            </View>
            {time ? <Text style={styles.cardTime}>{time}</Text> : null}
          </View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: SPACING.md,
  },
  // wave285: 列表视图布局 —— 固定顶栏 (标题/chip/切换) + 列表本体占满剩余
  // 高度; 内边距对齐原 content, 列表底部留白由 listContent 给 FAB 让位。
  listLayout: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
  },
  listContent: {
    paddingBottom: SPACING.xxl,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.md,
  },
  titleBlock: { flex: 1 },
  h1: {
    color: C.ink,
    fontSize: FONT_SIZE.title,
    fontWeight: "600",
  },
  subtitle: {
    color: C.ink3,
    fontSize: FONT_SIZE.meta,
    marginTop: 2,
  },
  refreshBtn: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ELEVATION.soft,
  },
  scopeRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  // COOA-28 (wave285-回归): RN ScrollView 基础样式自带 flexGrow:1, 列表分支里
  // headerCluster 直接铺在 listLayout (flex:1 固定高度容器) 内, 横滚 chips 条
  // 会沿主轴吃掉列表区剩余高度 (实测 ~700px 竖长拉伸)。显式关掉 grow, 按内容
  // 高布局; board 分支垫在外层 ScrollView 内容容器里, 父高即内容高, 不受影响。
  chipScroller: {
    flexGrow: 0,
  },
  chipRow: {
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: ELEVATION.soft,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipActive: {
    backgroundColor: "rgba(94, 106, 210, 0.16)",
    borderColor: "rgba(94, 106, 210, 0.45)",
  },
  chipPressed: {
    backgroundColor: ELEVATION.active,
  },
  chipText: {
    color: C.ink3,
    fontSize: FONT_SIZE.meta,
    fontWeight: "500",
  },
  chipTextActive: {
    color: C.accent,
    fontWeight: "600",
  },
  error: {
    color: C.err,
    fontSize: FONT_SIZE.meta,
  },
  boardScroll: {
    gap: SPACING.md,
    paddingRight: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  /** wave286 REQ-NAT-011: 看板列区尾部加载更多入口。 */
  boardLoadMoreBox: {
    alignItems: "center",
    paddingVertical: SPACING.sm,
  },
  boardLoadMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.lineSubtle,
    backgroundColor: ELEVATION.soft,
  },
  boardLoadMoreBtnPressed: {
    backgroundColor: ELEVATION.hover,
  },
  boardLoadMoreText: {
    color: C.ink3,
    fontSize: FONT_SIZE.meta,
    fontWeight: "600",
  },
  boardLoadEndText: {
    color: C.ink4,
    fontSize: FONT_SIZE.meta,
  },
  column: {
    width: 260,
    gap: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.sm,
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
  columnDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  columnTitle: {
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
    letterSpacing: 0.5,
  },
  columnCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.pill,
  },
  columnCountText: {
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  columnEmptyBox: {
    minHeight: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  columnEmpty: {
    color: C.ink4,
    fontSize: 12,
  },
  showMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderStyle: "dashed",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    marginTop: 2,
  },
  showMoreBtnPressed: {
    opacity: 0.7,
  },
  showMoreText: {
    fontSize: 12,
    fontWeight: "600",
  },
  showMoreSubText: {
    fontSize: 11,
    color: C.ink4,
    fontVariant: ["tabular-nums"],
  },
  allShownBox: {
    alignItems: "center",
    paddingVertical: 6,
  },
  allShownText: {
    color: C.ink4,
    fontSize: 11,
  },
  cardWrap: {
    borderRadius: RADIUS.md,
  },
  card: {
    backgroundColor: ELEVATION.raised,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.xs,
    overflow: "hidden",
  },
  cardPressed: {
    backgroundColor: ELEVATION.hover,
  },
  cardAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3.5,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  identifierBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  identifierText: {
    color: C.ink3,
    fontSize: 11,
    fontFamily: "monospace",
    fontWeight: "500",
  },
  projectBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    maxWidth: 110,
  },
  projectBadgeText: {
    color: C.ink3,
    fontSize: 10,
    fontWeight: "500",
  },
  mainlineBadge: {
    backgroundColor: "rgba(94, 106, 210, 0.15)",
    borderWidth: 1,
    borderColor: C.accent,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  mainlineBadgeText: {
    color: C.accent,
    fontSize: 10,
    fontWeight: "600",
  },
  specBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  specBadgeText: {
    color: C.ok,
    fontSize: 10,
    fontWeight: "600",
  },
  cardTitle: {
    color: C.ink,
    fontSize: FONT_SIZE.sub,
    fontWeight: "500",
    lineHeight: 18,
    marginVertical: 2,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  cardAssigneeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
  },
  assigneeAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  assigneeAvatarText: {
    color: C.ink2,
    fontSize: 9,
    fontWeight: "600",
  },
  cardAssignee: {
    color: C.ink3,
    fontSize: FONT_SIZE.meta,
    flex: 1,
  },
  cardTime: {
    color: C.ink4,
    fontSize: FONT_SIZE.meta,
    fontVariant: ["tabular-nums"],
  },
});

// 静态展示帮手: TasksScreen 那边复用, 这里只 export 屏本体
export const TASK_KANBAN_VIEW_DOC = "wave213: 任务看板 (拖拽换状态)";