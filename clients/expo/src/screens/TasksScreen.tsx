import { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Company, Issue } from "@coolie/api-client";
import { showSuccessToast } from "../ui/toast";
import { C } from "../coolie";
import { RADIUS, SPACING } from "../ui/tokens";
import { IssuesList } from "../components/IssuesList";
import { FilterSheet } from "../components/FilterSheet";
import { CreateTaskModal } from "../components/CreateTaskModal";
import { QuickApprovalCard } from "../components/QuickApprovalCard";
import { TasksScreenHeader } from "../components/TasksScreenHeader";
import { TasksScreenSearch } from "../components/TasksScreenSearch";
import { TasksScreenFilters } from "../components/TasksScreenFilters";
import { TasksScreenViewSwitch } from "../components/TasksScreenViewSwitch";
import { useTasksFilter } from "../hooks/useTasksFilter";

/**
 * 任务页 —— 底部栏第 2 个 tab 的落地屏 (wave213 后实际由 TaskKanbanScreen 接管;
 * 本屏保留以便 web 团队后续复用同一份筛选 / 视图组件)。
 *
 * wave254 重构 (FDE 32 排查):
 *  1. 19 个 useState 合并到 useTasksFilter 的 reducer
 *  2. IssuesList 列表视图换 FlatList + getItemLayout
 *  3. IssueRow 已 memo, 这里配套父组件稳定回调, 让引用变化不触发布局
 *  4. 子组件 (Header / Search / Filters / ViewSwitch) 全部 memo, 只在 props 真变才重渲
 *
 * wave285 性能优化 (boss「原生的太卡」):
 *  - 最外层 ScrollView 拆掉 —— 以前整屏 (含 36+ 任务全量渲染的列表) 都在
 *    ScrollView 里, 下拉刷新/滚动把主线程整屏重排; 现在标题/搜索/筛选/
 *    视图切换固定在顶部, 滚动 + 下拉刷新交给 IssuesList 的真
 *    FlatList/SectionList 本体 (VirtualizedList 自己窗口化渲染)。
 *
 * 保留功能 (老板原话「今日, 项目分组筛选等功能留」):
 *  - 今日+进行中 / 全部
 *  - 列表 / 分组 / 看板
 *  - 状态 / 指派 / 项目 / 排序 / 只看主线 / 聚焦主线 / 搜索
 *  - QuickApprovalCard 浮动审批 + FAB 新建任务
 *
 * 不动: TaskKanbanScreen (看板拖拽), IssueDetailScreen, issue-specs 路由, server。
 */

export function TasksScreen({
  company,
  refreshToken = 0,
  initialProjectId,
  onOpenIssue,
}: {
  company: Company;
  /** 外层 (中央 "+") 建完任务后 +1, 让列表重新拉取 */
  refreshToken?: number;
  /** 项目卡「查看任务」带上来的项目 —— 落地即套用项目筛选 (null = 不筛选)。 */
  initialProjectId?: string | null;
  onOpenIssue: (issue: Issue) => void;
}) {
  const t = useTasksFilter(company, refreshToken, initialProjectId);

  // 顶部 Pull-to-refresh 用 loadIssues(true) —— wave285 后由 IssuesList 本体挂载
  const onPullRefresh = useCallback(() => {
    void t.loadIssues(true);
  }, [t]);

  // 浮动按钮: 新建任务
  const onOpenCreate = useCallback(() => t.setCreateOpen(true), [t]);
  const onCloseCreate = useCallback(() => t.setCreateOpen(false), [t]);
  const onCreated = useCallback(
    (issue: Issue) => {
      t.handleCreated(issue);
      showSuccessToast("任务已创建", issue.title);
    },
    [t],
  );

  // 长按主线: 聚焦下钻 (稳定引用, IssuesList 内会包成 stableIssueLongPress)
  const onIssueLongPress = useCallback(
    (issue: Issue) => {
      if (issue.isMilestone) t.setFocusMainlineId(issue.id);
    },
    [t],
  );

  // Errors / number of issues
  const onRetryLoad = useCallback(() => {
    void t.loadIssues();
  }, [t]);

  // 清除聚焦主线 (memo)
  const onClearFocusMainline = useCallback(() => {
    t.setFocusMainlineId(null);
  }, [t]);

  // 关闭底部 sheet
  const onCloseSheet = useCallback(() => {
    t.setSheet(null);
  }, [t]);

  return (
    <View style={styles.screen}>
      {/* wave285: 筛选区固定顶栏, 不随列表滚动 (原来整屏一个 ScrollView) */}
      <View style={styles.header}>
        <TasksScreenHeader
          companyName={company.name}
          scopeLabel={t.issueScopeLabel}
          onRefresh={onPullRefresh}
        />

        <TasksScreenSearch value={t.search} onChange={t.setSearch} />

        <TasksScreenFilters
          scope={t.scope}
          onScope={t.setScope}
          status={t.status}
          statusCounts={t.statusCounts}
          onStatus={t.setStatus}
          assigneeLabel={t.assigneeLabel}
          projectLabel={t.projectLabel}
          sortLabel={t.sortOption.label}
          mainline={t.mainline}
          focusMainlineId={t.focusMainlineId}
          onOpenSheet={t.setSheet}
          onToggleMainline={t.toggleMainline}
          onClearFocusMainline={onClearFocusMainline}
        />

        <TasksScreenViewSwitch value={t.view} onChange={t.setView} />
      </View>

      {/* 列表本体 (FlatList/SectionList) 持有滚动 + 下拉刷新 */}
      <IssuesList
        issues={t.issues}
        loading={t.loading}
        error={t.error}
        onRetry={onRetryLoad}
        onIssuePress={onOpenIssue}
        onIssueLongPress={onIssueLongPress}
        selection={t.selection}
        view={t.view}
        agents={t.agents}
        projects={t.projects}
        refreshing={t.refreshing}
        onRefresh={onPullRefresh}
        contentContainerStyle={styles.listContent}
        style={styles.listArea}
      />

      {/* 待审批快捷卡 (沿用旧任务页的浮动审批入口, 不因换 UI 丢能力) */}
      <QuickApprovalCard companyId={company.id} floating={true} />

      {/* 右下角浮起 [+ 新建任务] */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={onOpenCreate}
        accessibilityLabel="新建任务"
      >
        <Ionicons name="add" size={20} color="#FFFFFF" />
        <Text style={styles.fabText}>新建任务</Text>
      </Pressable>

      <FilterSheet
        visible={t.sheet === "assignee"}
        title="指派"
        options={t.assigneeOptions}
        selected={t.assignee}
        onSelect={t.setAssignee}
        onClose={onCloseSheet}
      />
      <FilterSheet
        visible={t.sheet === "project"}
        title="项目"
        options={t.projectOptions}
        selected={t.project}
        onSelect={t.setProject}
        onClose={onCloseSheet}
      />
      <FilterSheet
        visible={t.sheet === "sort"}
        title="排序"
        options={t.sortOptions}
        selected={t.sortValue}
        onSelect={t.setSortValue}
        onClose={onCloseSheet}
      />

      <CreateTaskModal
        visible={t.createOpen}
        companyId={company.id}
        agents={t.agents}
        onClose={onCloseCreate}
        onCreated={onCreated}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
    gap: SPACING.md,
  },
  listArea: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: 96, // 给 FAB 让位 (原 content paddingBottom)
  },
  fab: {
    position: "absolute",
    right: SPACING.lg,
    bottom: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    borderRadius: RADIUS.pill,
    backgroundColor: C.brand,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  fabPressed: {
    backgroundColor: C.accentHover,
  },
  fabText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
});
