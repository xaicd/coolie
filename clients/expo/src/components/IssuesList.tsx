import { memo, useCallback, useMemo, useState, type ReactElement } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Issue, Project } from "@coolie/api-client";
import { C, type AgentRow } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "../ui/tokens";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { IssueRow } from "./IssueRow";
import {
  ACTIVE_STATUS,
  groupIssuesByProject,
  isToday,
  issueTimestamp,
  selectIssues,
  type IssueSelection,
  type IssuesView,
} from "../lib/issue-list";
import { ISSUE_STATUS_ORDER, issueStatusColor, issueStatusLabel } from "./issue-status";
import { formatRelativeShort } from "../utils/format";

/**
 * 任务列表本体 —— wave125: boss 16:0x「任务列表，得支持 web 那些功能」
 * 「看板，列表，项目分组啥的」。
 *
 * wave96 精简只剩扁平列表; 本 wave 补回 web 的视图口径, 但只做原生轻量版:
 *  - 列表 (列表视图, 默认范围 = 今日 + 进行中, 沿用旧的分组头)
 *  - 分组 (按项目分节, 节头是项目名 + 计数)
 *  - 看板 (按状态分列的横向滚动列, 卡片显示标题 + 指派 + 时间, 不做拖拽)
 *
 * 数据由 TasksScreen 拉取并传入 (它要按状态计数驱动筛选 chips), 这里只做
 * 选择 (搜索/状态/指派/项目/排序) 与渲染。
 *
 * wave254 性能优化:
 *  - IssueRow 已 React.memo, 配套稳定 onPress/onLongPress, 引用不变不重渲。
 *
 * wave285 性能优化 (boss「原生的太卡」):
 *  - 列表视图真 FlatList: getItemLayout + windowSize + removeClippedSubviews,
 *    200+ 任务只渲染视口窗口, 滚动/下拉刷新不再全量重排;
 *  - 分组视图真 SectionList: stickySectionHeadersEnabled 真启, 节头吸顶;
 *  - 行槽固定高 (rowSlot), getItemLayout 0 测量成本命中;
 *  - 下拉刷新 (refreshing/onRefresh) 由外屏透传进列表本体 —— 外层不再包
 *    ScrollView, VirtualizedList 自己持有滚动, 不再有嵌套滚动抢主线程;
 *  - 看板视图保持横向 ScrollView (拖拽走 TaskKanbanScreen 的 reanimated 路径,
 *    本组件看板分支只读不拖, 不重做)。
 */

export interface IssuesListProps {
  issues: Issue[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onIssuePress: (issue: Issue) => void;
  /** wave156: 长按主线任务时设置焦点, 用于下钻该主线。 */
  onIssueLongPress?: (issue: Issue) => void;
  /** 当前筛选/排序 (状态由外层持有)。 */
  selection: IssueSelection;
  /** 视图模式: 列表 / 分组 / 看板。 */
  view: IssuesView;
  agents?: AgentRow[];
  projects?: Project[];
  style?: StyleProp<ViewStyle>;
  /** wave285: 外屏透传下拉刷新状态 (不传则列表不挂 RefreshControl)。 */
  refreshing?: boolean;
  /** wave285: 下拉刷新回调 —— 列表本体持有滚动后由它挂 RefreshControl。 */
  onRefresh?: () => void;
  /** wave285: 透传给滚动内容容器 (外屏在这里给 FAB / 底栏让位)。 */
  contentContainerStyle?: StyleProp<ViewStyle>;
  // ── wave286 无限滚动 (REQ-NAT-003/004/007/010/011) —— 全部可选, 不传 = 既有行为 ──
  /** 还有下一页; false 时列表尾部显示「已全部加载 · N 条」。 */
  hasMore?: boolean;
  /** 下一页请求在途 (尾部骨架行)。 */
  loadingMore?: boolean;
  /** 翻页失败原因 (尾部重试入口, 与首屏 error 分离; REQ-NAT-007)。 */
  loadError?: string | null;
  /** 滚动近底部 (≈10 行槽) 自动加载下一页 (REQ-NAT-003); 看板视图为「加载更多」入口。 */
  onLoadMore?: () => void;
  /** 翻页失败后的重试入口 (不传退回 onLoadMore)。 */
  onRetryLoadMore?: () => void;
  /** 尾部计数 N (已加载数据集大小); 默认取 issues.length, 外层传筛选后集合时需显式给。 */
  loadedCount?: number;
}

/**
 * 行槽固定高 = 64: IssueRow 最大内容高 60 (2 行标题 38 + 上下 padding 22),
 * 4px 余量; 单行标题时上下居中。固定高是 getItemLayout 免测量命中的前提,
 * 行槽间距 8 (SPACING.sm, 原 styles.wrap gap) 折进 marginBottom, 布局步长 72。
 */
const ISSUE_ROW_HEIGHT = 64;
const ROW_STRIDE = ISSUE_ROW_HEIGHT + SPACING.sm;

const issueKey = (issue: Issue, index?: number) =>
  issue?.id ? String(issue.id) : `issue-fallback-${index ?? 0}`;

export function IssuesList({
  issues,
  loading = false,
  error = null,
  onRetry,
  onIssuePress,
  onIssueLongPress,
  selection,
  view,
  agents = [],
  projects = [],
  style,
  refreshing = false,
  onRefresh,
  contentContainerStyle,
  hasMore = true,
  loadingMore = false,
  loadError = null,
  onLoadMore,
  onRetryLoadMore,
  loadedCount,
}: IssuesListProps) {
  const visible = useMemo(() => selectIssues(issues, selection), [issues, selection]);

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of agents) map.set(agent.id, agent.name);
    return map;
  }, [agents]);

  const groups = useMemo(
    () => groupIssuesByProject(visible, projects),
    [visible, projects],
  );

  const focusGroups = useMemo(() => {
    const today: Issue[] = [];
    const active: Issue[] = [];
    for (const issue of visible) {
      if (issue.status === ACTIVE_STATUS) active.push(issue);
      else if (isToday(issueTimestamp(issue))) today.push(issue);
    }
    return [
      { key: "today", label: `今日 · ${today.length}`, items: today },
      { key: "active", label: `进行中 · ${active.length}`, items: active },
    ];
  }, [visible]);

  const parentById = useMemo(() => {
    const map = new Map<string, { id: string; isMilestone?: boolean }>();
    for (const issue of visible) {
      if (issue.parentId && !map.has(issue.parentId)) {
        map.set(issue.parentId, { id: issue.parentId });
      }
    }
    const resolved = new Map<string, { id: string; isMilestone?: boolean }>();
    for (const issue of visible) {
      if (map.has(issue.id)) {
        resolved.set(issue.id, { id: issue.id, isMilestone: issue.isMilestone });
      }
    }
    for (const [id, entry] of map) {
      if (!resolved.has(id)) resolved.set(id, entry);
    }
    return resolved;
  }, [visible]);

  // 稳定的 onIssuePress / onIssueLongPress (避免传给 memo IssueRow 的引用变化导致重渲)
  const stableIssuePress = useCallback(
    (issue: Issue) => onIssuePress(issue),
    [onIssuePress],
  );
  const stableIssueLongPress = useCallback(
    (issue: Issue) => onIssueLongPress?.(issue),
    [onIssueLongPress],
  );

  // wave285: 下拉刷新控件 —— 三种视图/错误/空态统一复用, 外屏不再自挂
  const refreshControl = onRefresh ? (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
  ) : undefined;

  // ── wave286 无限滚动 (REQ-NAT-003/004/007/010) ──────────────────────────
  // onEndReached 统一入口: 无 onLoadMore / 无更多 / 在途 / 失败 时静默
  // (失败停在尾部重试入口, 不自动重试, 防失败风暴)。
  const handleEndReached = useCallback(() => {
    if (!onLoadMore || !hasMore || loadingMore || loadError) return;
    onLoadMore();
  }, [onLoadMore, hasMore, loadingMore, loadError]);

  // REQ-NAT-010: 搜索激活或非默认排序 (锚定序 updated:desc 之外) 时, 尾部提示
  // 「基于已加载 N 条」; 默认排序到末页显示「已全部加载 · N 条」。
  const anchorSort = selection.sortField === "updated" && selection.sortDir === "desc";
  const loadedHint = selection.search.trim() !== "" || !anchorSort;
  const footerCount = loadedCount ?? issues.length;

  const listFooter = useMemo(
    () =>
      onLoadMore ? (
        <ListFooter
          loadingMore={loadingMore}
          loadError={loadError}
          hasMore={hasMore}
          loadedCount={footerCount}
          hintLoadedOnly={loadedHint}
          onRetry={onRetryLoadMore ?? onLoadMore}
        />
      ) : null,
    [onLoadMore, onRetryLoadMore, loadingMore, loadError, hasMore, footerCount, loadedHint],
  );

  // 空态交给 ListEmptyComponent (列表滚动仍在, 下拉刷新空态可用)
  const emptyComponent = useMemo(() => {
    const filtering =
      selection.status !== "all" ||
      selection.assignee !== "all" ||
      selection.project !== "all";
    return (
      <EmptyState
        icon="📋"
        title={filtering ? "没有匹配的任务" : "今天没有任务"}
        subtitle={
          filtering
            ? "换个筛选条件，或清空搜索。"
            : "点右下角 [+ 新建任务] 创建第一个任务。"
        }
      />
    );
  }, [selection.status, selection.assignee, selection.project]);

  if (error) {
    return (
      <View style={[styles.wrap, style]}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.fillContent}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          <ErrorRetry
            variant="inline"
            message={`任务加载失败: ${error}`}
            onRetry={() => onRetry?.()}
          />
        </ScrollView>
      </View>
    );
  }

  if (loading && issues.length === 0) {
    return (
      <View style={[styles.wrap, style]}>
        <LoadingRows />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      {view === "board" ? (
        <BoardView
          issues={visible}
          agentNameById={agentNameById}
          onIssuePress={stableIssuePress}
          refreshControl={refreshControl}
          emptyComponent={emptyComponent}
          onLoadMore={onLoadMore}
          loadingMore={loadingMore}
          loadError={loadError}
          onRetryLoadMore={onRetryLoadMore}
          hasMore={hasMore}
          loadedCount={footerCount}
          hintLoadedOnly={loadedHint}
        />
      ) : view === "group" ? (
        <SectionsView
          groups={groups}
          parentById={parentById}
          agentNameById={agentNameById}
          onIssuePress={stableIssuePress}
          onIssueLongPress={stableIssueLongPress}
          refreshControl={refreshControl}
          contentContainerStyle={[styles.fillContent, contentContainerStyle]}
          emptyComponent={emptyComponent}
          onEndReached={handleEndReached}
          footer={listFooter}
        />
      ) : selection.scope === "focus" ? (
        <SectionsView
          groups={focusGroups}
          parentById={parentById}
          agentNameById={agentNameById}
          onIssuePress={stableIssuePress}
          onIssueLongPress={stableIssueLongPress}
          refreshControl={refreshControl}
          contentContainerStyle={[styles.fillContent, contentContainerStyle]}
          emptyComponent={emptyComponent}
          onEndReached={handleEndReached}
          footer={listFooter}
        />
      ) : (
        <FlatView
          issues={visible}
          parentById={parentById}
          agentNameById={agentNameById}
          onIssuePress={stableIssuePress}
          onIssueLongPress={stableIssueLongPress}
          refreshControl={refreshControl}
          contentContainerStyle={[styles.fillContent, contentContainerStyle]}
          emptyComponent={emptyComponent}
          onEndReached={handleEndReached}
          footer={listFooter}
        />
      )}
    </View>
  );
}

function LoadingRows() {
  return (
    <View style={styles.loadingRows}>
      {[0, 1, 2, 3].map((key) => (
        <View key={key} style={styles.skeletonRow} />
      ))}
    </View>
  );
}

/**
 * wave286 尾部三态 (REQ-NAT-004/007/010): 加载中骨架行 / 失败重试 / 到底提示;
 * 平时静默 (null)。memo 化避免翻页重渲拖累滚动 (R6)。
 */
const ListFooter = memo(function ListFooter({
  loadingMore,
  loadError,
  hasMore,
  loadedCount,
  hintLoadedOnly,
  onRetry,
}: {
  loadingMore: boolean;
  loadError: string | null;
  hasMore: boolean;
  loadedCount: number;
  hintLoadedOnly: boolean;
  onRetry: () => void;
}) {
  if (loadingMore) {
    return (
      <View style={styles.footerBox}>
        <View style={styles.skeletonRow} />
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={styles.footerBox}>
        <ErrorRetry variant="inline" message={`加载更多失败: ${loadError}`} onRetry={onRetry} />
      </View>
    );
  }
  if (!hasMore) {
    return (
      <View style={styles.footerBox}>
        <Text style={styles.footerText}>
          {hintLoadedOnly ? `基于已加载 ${loadedCount} 条` : `已全部加载 · ${loadedCount} 条`}
        </Text>
      </View>
    );
  }
  return null;
});

/**
 * REQ-NAT-003: 距底不足 10 个行槽 (≈720px) 触发翻页。FlatList 的
 * onEndReachedThreshold 单位是「视口高度倍数」, 用实际列表高度换算
 * (布局前回退 0.9)。
 */
const END_REACHED_PX = ROW_STRIDE * 10;

function useEndReachedThreshold() {
  const [viewportH, setViewportH] = useState(0);
  const onListLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setViewportH((prev) => (Math.abs(prev - h) > 1 ? h : prev));
  }, []);
  const threshold =
    viewportH > 0 ? Math.min(1, Math.max(0.3, END_REACHED_PX / viewportH)) : 0.9;
  return { onListLayout, threshold };
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  const isNone = label === "未归属项目";
  return (
    <View style={styles.groupHeader}>
      <Ionicons
        name={isNone ? "folder-open-outline" : "folder-outline"}
        size={14}
        color={isNone ? C.ink4 : C.accent}
      />
      <Text style={[styles.groupHeaderText, isNone && { color: C.ink3 }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.groupBadge}>
        <Text style={styles.groupBadgeText}>{count}</Text>
      </View>
    </View>
  );
}

/** wave285: 固定高行槽 —— 高度确定 + 垂直居中, getItemLayout 免测量命中。 */
function IssueRowSlot({
  issue,
  parentById,
  agentNameById,
  onIssuePress,
  onIssueLongPress,
}: {
  issue: Issue;
  parentById: Map<string, { id: string; isMilestone?: boolean }>;
  agentNameById?: Map<string, string>;
  onIssuePress: (issue: Issue) => void;
  onIssueLongPress?: (issue: Issue) => void;
}) {
  const assigneeName = issue.assigneeAgentId
    ? (agentNameById?.get(issue.assigneeAgentId) ?? null)
    : null;
  return (
    <View style={styles.rowSlot}>
      <IssueRow
        issue={issue}
        parentIssue={issue.parentId ? parentById.get(issue.parentId) ?? null : null}
        assigneeName={assigneeName}
        onPress={onIssuePress}
        onLongPress={onIssueLongPress}
      />
    </View>
  );
}

/**
 * 列表视图 —— wave285: View+.map() 全量渲染换真 FlatList。200+ 任务只
 * 实例化视口窗口 (windowSize=11), 布局走固定行槽 getItemLayout, 滑动不抖、
 * 下拉刷新不再拖动整屏重排。
 */
function FlatView({
  issues,
  parentById,
  agentNameById,
  onIssuePress,
  onIssueLongPress,
  refreshControl,
  contentContainerStyle,
  emptyComponent,
  onEndReached,
  footer,
}: {
  issues: Issue[];
  parentById: Map<string, { id: string; isMilestone?: boolean }>;
  agentNameById?: Map<string, string>;
  onIssuePress: (issue: Issue) => void;
  onIssueLongPress?: (issue: Issue) => void;
  refreshControl?: ReactElement;
  contentContainerStyle?: StyleProp<ViewStyle>;
  emptyComponent?: ReactElement | null;
  onEndReached?: () => void;
  footer?: ReactElement | null;
}) {
  const renderItem = useCallback(
    ({ item }: { item: Issue }) => (
      <IssueRowSlot
        issue={item}
        parentById={parentById}
        agentNameById={agentNameById}
        onIssuePress={onIssuePress}
        onIssueLongPress={onIssueLongPress}
      />
    ),
    [parentById, agentNameById, onIssuePress, onIssueLongPress],
  );

  // wave286: 距底 ≈10 行槽预取 (REQ-NAT-003); 虚拟化参数冻结 (REQ-NFR-004)。
  const { onListLayout, threshold } = useEndReachedThreshold();

  const safeIssues = useMemo(
    () => issues.filter((item): item is Issue => Boolean(item && item.id)),
    [issues],
  );

  return (
    <FlatList
      style={styles.fill}
      data={safeIssues}
      keyExtractor={issueKey}
      renderItem={renderItem}
      windowSize={7}
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={refreshControl}
      contentContainerStyle={contentContainerStyle}
      ListEmptyComponent={emptyComponent}
      ListFooterComponent={footer}
      onEndReached={onEndReached}
      onEndReachedThreshold={threshold}
      onLayout={onListLayout}
    />
  );
}

/**
 * 分组视图 —— wave285: View+groups.map() 换真 SectionList,
 * stickySectionHeadersEnabled 真启 (节头吸顶, wave254 只留在注释里)。
 */
function SectionsView({
  groups,
  parentById,
  agentNameById,
  onIssuePress,
  onIssueLongPress,
  refreshControl,
  contentContainerStyle,
  emptyComponent,
  onEndReached,
  footer,
}: {
  groups: { key: string; label: string; items: Issue[] }[];
  parentById: Map<string, { id: string; isMilestone?: boolean }>;
  agentNameById?: Map<string, string>;
  onIssuePress: (issue: Issue) => void;
  onIssueLongPress?: (issue: Issue) => void;
  refreshControl?: ReactElement;
  contentContainerStyle?: StyleProp<ViewStyle>;
  emptyComponent?: ReactElement | null;
  onEndReached?: () => void;
  footer?: ReactElement | null;
}) {
  const sections = useMemo(
    () =>
      groups.map((group) => ({
        key: group.key,
        label: group.label,
        data: group.items.filter((item): item is Issue => Boolean(item && item.id)),
      })),
    [groups],
  );

  const renderItem = useCallback(
    ({ item }: { item: Issue }) => (
      <IssueRowSlot
        issue={item}
        parentById={parentById}
        agentNameById={agentNameById}
        onIssuePress={onIssuePress}
        onIssueLongPress={onIssueLongPress}
      />
    ),
    [parentById, agentNameById, onIssuePress, onIssueLongPress],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { label: string; data: Issue[] } }) => (
      <GroupHeader label={section.label} count={section.data.length} />
    ),
    [],
  );

  // wave286: 与 FlatView 同一预取口径 (REQ-NAT-003); 虚拟化参数冻结 (REQ-NFR-004)。
  const { onListLayout, threshold } = useEndReachedThreshold();

  return (
    <SectionList
      style={styles.fill}
      sections={sections}
      keyExtractor={issueKey}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled
      windowSize={7}
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={refreshControl}
      contentContainerStyle={contentContainerStyle}
      ListEmptyComponent={emptyComponent}
      ListFooterComponent={footer}
      onEndReached={onEndReached}
      onEndReachedThreshold={threshold}
      onLayout={onListLayout}
    />
  );
}

/**
 * 看板视图 —— 横向列布局不变 (拖拽版在 TaskKanbanScreen, 不走这里)。
 * wave285: 外层补一个竖向 ScrollView —— 列表本体持有滚动后, 看板也需要
 * 自己的竖向滚动 + 下拉刷新载体 (内外不同轴向, 无嵌套滚动冲突)。
 */
function BoardView({
  issues,
  agentNameById,
  onIssuePress,
  refreshControl,
  emptyComponent,
  onLoadMore,
  loadingMore = false,
  loadError = null,
  onRetryLoadMore,
  hasMore = true,
  loadedCount,
  hintLoadedOnly = false,
}: {
  issues: Issue[];
  agentNameById: Map<string, string>;
  onIssuePress: (issue: Issue) => void;
  refreshControl?: ReactElement;
  emptyComponent?: ReactElement | null;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  loadError?: string | null;
  onRetryLoadMore?: () => void;
  hasMore?: boolean;
  loadedCount?: number;
  hintLoadedOnly?: boolean;
}) {
  const columns = useMemo(
    () =>
      ISSUE_STATUS_ORDER.map((status) => ({
        status,
        items: issues.filter((issue) => issue.status === status),
      })),
    [issues],
  );

  if (issues.length === 0) {
    return (
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.fillContent}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        {emptyComponent}
      </ScrollView>
    );
  }

  // REQ-NAT-011: 看板列区尾部的「加载更多」入口 (横向 ScrollView 无
  // onEndReached, 走手动入口); 不传 onLoadMore 时不渲染, 既有调用方零变化。
  const footerVisible = Boolean(onLoadMore);
  const footerCount = loadedCount ?? issues.length;

  return (
    <ScrollView
      style={styles.fill}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={refreshControl}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.boardContent}
      >
        {columns.map((column) => (
          <View key={column.status} style={styles.boardColumn}>
            <View style={styles.boardColumnHeader}>
              <View style={[styles.boardColumnDot, { backgroundColor: issueStatusColor(column.status) }]} />
              <Text style={[styles.boardColumnTitle, { color: issueStatusColor(column.status) }]}>
                {issueStatusLabel(column.status)}
              </Text>
              <Text style={styles.boardColumnCount}>{column.items.length}</Text>
            </View>
            {column.items.length === 0 ? (
              <Text style={styles.boardColumnEmpty}>—</Text>
            ) : (
              column.items.map((issue) => (
                <BoardCard
                  key={issue.id}
                  issue={issue}
                  assigneeName={
                    issue.assigneeAgentId
                      ? (agentNameById.get(issue.assigneeAgentId) ?? "已指派")
                      : "未分配"
                  }
                  onPress={onIssuePress}
                />
              ))
            )}
          </View>
        ))}
      </ScrollView>
      {footerVisible ? (
        <View style={styles.footerBox}>
          {loadingMore ? (
            <Text style={styles.footerText}>正在加载更多…</Text>
          ) : loadError ? (
            <ErrorRetry
              variant="inline"
              message={`加载更多失败: ${loadError}`}
              onRetry={() => (onRetryLoadMore ?? onLoadMore)?.()}
            />
          ) : hasMore ? (
            <Pressable
              style={({ pressed }) => [styles.boardLoadMoreBtn, pressed && styles.boardLoadMoreBtnPressed]}
              onPress={onLoadMore}
              accessibilityRole="button"
              accessibilityLabel="加载更多任务"
            >
              <Ionicons name="chevron-down" size={13} color={C.ink3} />
              <Text style={styles.boardLoadMoreText}>加载更多 · 已加载 {footerCount} 条</Text>
            </Pressable>
          ) : (
            <Text style={styles.footerText}>
              {hintLoadedOnly ? `基于已加载 ${footerCount} 条` : `已全部加载 · ${footerCount} 条`}
            </Text>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const BoardCard = memo(function BoardCard({
  issue,
  assigneeName,
  onPress,
}: {
  issue: Issue;
  assigneeName: string;
  onPress: (issue: Issue) => void;
}) {
  const color = issueStatusColor(issue.status);
  const time = formatRelativeShort(issue.updatedAt ?? issue.createdAt);
  return (
    <Pressable
      style={({ pressed }) => [styles.boardCard, pressed && styles.boardCardPressed]}
      onPress={() => onPress(issue)}
      accessibilityRole="button"
      accessibilityLabel={issue.title}
    >
      <View style={[styles.boardCardAccent, { backgroundColor: color }]} />
      <Text style={styles.boardCardTitle} numberOfLines={2}>
        {issue.title}
      </Text>
      <View style={styles.boardCardMeta}>
        <Ionicons name="person-outline" size={11} color={C.ink4} />
        <Text style={styles.boardCardAssignee} numberOfLines={1}>
          {assigneeName}
        </Text>
        {time ? <Text style={styles.boardCardTime}>{time}</Text> : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  /** 列表本体持有滚动: 外屏给一块 flex 区域, 这里填满。 */
  wrap: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  fillContent: {
    // COOA-36: 空/短列表时 contentContainer 也要占满视口, 否则空白区手势落不进
    // FlatList/ScrollView, RefreshControl 只在「有列表内容处」可拉 (QA D7 实测症状)。
    flexGrow: 1,
    paddingVertical: SPACING.sm,
  },
  /** 固定行槽: 高 64 + 行距 8 (步长 72), 内容垂直居中。 */
  rowSlot: {
    height: ISSUE_ROW_HEIGHT,
    justifyContent: "center",
    marginBottom: SPACING.sm,
  },
  loadingRows: {
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  skeletonRow: {
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: ELEVATION.raised,
  },
  /** wave286 尾部三态容器 (加载中 / 失败重试 / 到底提示)。 */
  footerBox: {
    alignItems: "center",
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  footerText: {
    color: C.ink4,
    fontSize: 12,
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
    fontSize: 12,
    fontWeight: "600",
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    // sticky 节头吸顶时不透明, 否则行从底下透出来
    backgroundColor: C.bg,
  },
  groupHeaderText: {
    color: C.ink2,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  groupBadge: {
    backgroundColor: ELEVATION.soft,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: RADIUS.pill,
  },
  groupBadgeText: {
    color: C.ink3,
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  boardContent: {
    gap: SPACING.sm,
    paddingRight: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  boardColumn: {
    width: 236,
    gap: SPACING.sm,
  },
  boardColumnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.xs,
  },
  boardColumnDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  boardColumnTitle: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  boardColumnCount: {
    color: C.ink4,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  boardColumnEmpty: {
    color: C.ink4,
    fontSize: 12,
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  boardCard: {
    backgroundColor: ELEVATION.raised,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
    overflow: "hidden",
  },
  boardCardPressed: {
    backgroundColor: ELEVATION.hover,
  },
  boardCardAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  boardCardTitle: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  boardCardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  boardCardAssignee: {
    color: C.ink3,
    fontSize: 11,
    flex: 1,
  },
  boardCardTime: {
    color: C.ink4,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
});
