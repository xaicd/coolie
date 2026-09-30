import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  countIssuesByStatus,
  type IssueSelection,
  type IssuesScope,
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
 * TaskKanbanScreen — 任务看板 (wave213)
 *
 * 与 TasksScreen 的「看板」视图不同, 这里:
 *  1. 是独立屏而非内嵌视图 (boss 19:46 OOB「任务看板能否手机拖动换状态」)
 *  2. 列头 = 状态真名 + 实时计数 (列计数随任务移动同步刷新)
 *  3. 卡片支持跨列拖拽换状态 (react-native-gesture-handler + reanimated)
 *  4. 拖拽时震动反馈 (expo-haptics), 落下后 PATCH /api/.../issues/:id/status
 *  5. 乐观更新 — UI 立刻换列, 失败回弹 + Toast 提示原因
 *
 * 列表视图保留在 TasksScreen (侧栏 [列表/看板] 切换进这里), 详情页状态
 * 修改保留 (双路径)。
 *
 * 为什么不直接用 react-native-draggable-flatlist:
 *   单列拖拽很丝滑, 但跨列拖需要把每列当成独立 list, 配合一个外部共享的
 *   "正在被拖的 card" + drop zone 测量, 写起来比直接用 Gesture.Pan() 重做
 *   还长。Pan + Reanimated shared values 给一个 ≤ 5 列的看板足够用了。
 */

type IssuesView = "list" | "board";
type SheetKind = "assignee" | "project" | "sort" | null;

const VIEW_OPTIONS: Array<{ key: IssuesView; label: string }> = [
  { key: "list", label: "列表" },
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

const KANBAN_COLUMNS: IssueStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
];

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

  const [scope, setScope] = useState<IssuesScope>("focus");
  const [assignee, setAssignee] = useState("all");
  const [project, setProject] = useState(initialProjectId ?? "all");
  const [mainline, setMainline] = useState(false);
  const [view, setView] = useState<IssuesView>("board");
  const [sortValue, setSortValue] = useState(SORT_OPTIONS[0]!.value);
  const [sheet, setSheet] = useState<SheetKind>(null);

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

  useEffect(() => {
    void loadIssues();
  }, [loadIssues, refreshSignal + refreshToken]);

  useEffect(() => {
    void coolie.listAgents(company.id).then(setAgents).catch(() => setAgents([]));
  }, [company.id]);

  useEffect(() => {
    void coolie.listProjects(company.id).then(setProjects).catch(() => setProjects([]));
  }, [company.id]);

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
        const msg = (e as Error)?.message ?? "未知错误";
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

  return (
    <View style={styles.screen}>
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

        {/* 看板横向滚动区 */}
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
      </ScrollView>

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

function KanbanColumnView({
  status,
  issues,
  agents,
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
  return (
    <View style={styles.column} onLayout={onLayout}>
      <View style={styles.columnHeader}>
        <View style={[styles.columnDot, { backgroundColor: color }]} />
        <Text style={[styles.columnTitle, { color }]}>{issueStatusLabel(status)}</Text>
        <Text style={styles.columnCount}>{issues.length}</Text>
      </View>
      {issues.length === 0 ? (
        <Text style={styles.columnEmpty}>—</Text>
      ) : (
        issues.map((issue) => (
          <DraggableKanbanCard
            key={issue.id}
            issue={issue}
            assigneeName={
              issue.assigneeAgentId
                ? agents.find((a) => a.id === issue.assigneeAgentId)?.name ?? "已指派"
                : "未分配"
            }
            onPress={() => onOpenIssue(issue)}
            dragOffsetX={dragOffsetX}
            dragOffsetY={dragOffsetY}
            dragIssue={dragIssue}
            setDragIssue={setDragIssue}
            tryDropOnColumn={tryDropOnColumn}
            resolveDropTarget={resolveDropTarget}
          />
        ))
      )}
    </View>
  );
}

function DraggableKanbanCard({
  issue,
  assigneeName,
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
        .activeOffsetX([-8, 8])
        .activeOffsetY([-8, 8])
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
          // 落点判定: e.absoluteX 加上本卡片 absoluteX (start 时记录到 ref 略复杂,
          // 简化: 横向滚动列已确保 translationX > 列宽足以跨列, 列布局相对 root 算)
          const targetX = e.absoluteX;
          runOnJS(handleDrop)(targetX, issue);
          // 回弹: scale/opacity 由 JS 线程 setDragIssue(null) 触发的非 drag 渲染复位
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
          <Text style={styles.cardTitle} numberOfLines={2}>
            {issue.title}
          </Text>
          <View style={styles.cardMeta}>
            <Ionicons name="person-outline" size={11} color={C.ink4} />
            <Text style={styles.cardAssignee} numberOfLines={1}>
              {assigneeName}
            </Text>
            {time ? <Text style={styles.cardTime}>{time}</Text> : null}
          </View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

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
  column: {
    width: 240,
    gap: SPACING.sm,
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.xs,
  },
  columnDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  columnTitle: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  columnCount: {
    color: C.ink4,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  columnEmpty: {
    color: C.ink4,
    fontSize: 12,
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.sm,
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
    gap: SPACING.sm,
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
    width: 3,
  },
  cardTitle: {
    color: C.ink,
    fontSize: FONT_SIZE.sub,
    fontWeight: "500",
    lineHeight: 18,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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