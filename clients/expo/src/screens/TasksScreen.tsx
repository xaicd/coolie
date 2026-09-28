import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Company, Issue, Project } from "@coolie/api-client";
import { C, coolie, type AgentRow } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "../ui/tokens";
import { SegmentedControl } from "../ui/SegmentedControl";
import { IssuesList } from "../components/IssuesList";
import { FilterSheet, type FilterOption } from "../components/FilterSheet";
import { CreateTaskModal } from "../components/CreateTaskModal";
import { QuickApprovalCard } from "../components/QuickApprovalCard";
import { ISSUE_STATUS_ORDER, issueStatusLabel } from "../components/issue-status";
import {
  countIssuesByStatus,
  type IssueSelection,
  type IssueSortDir,
  type IssueSortField,
  type IssuesScope,
  type IssuesView,
  type StatusFilter,
} from "../lib/issue-list";

/**
 * 任务页 —— 底部栏第 2 个 tab 的落地屏。
 *
 * wave96 精简 (boss 22:14 OOB「更复杂了」) 删过头了; wave125 按 boss 16:0x
 * 「任务列表，得支持 web 那些功能」「看板，列表，项目分组啥的」补回 web 口径:
 *  - 筛选 chips: 状态 / 指派 / 项目 (单选; 服务端本就支持这些过滤, 这里本地选择)
 *  - 视图切换: 列表 / 分组 (按项目分节) / 看板 (按状态分列, 横向滚动)
 *  - 排序: 更新时间 (默认) / 创建时间 / 标题
 *  - 范围: 今日 + 进行中 (默认) / 全部
 *
 * 数据 (issues/agents/projects) 在这里拉, 因为状态 chips 的计数要跟着其余筛选联动;
 * IssuesList 只做选择与渲染。任务 Tab 与收件箱 Tab 的分工不变。
 */

/** 排序项: 值编码为 `${field}:${dir}`, 与 chip/menu 展示一一对应。 */
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

const SCOPE_OPTIONS: Array<{ key: IssuesScope; label: string }> = [
  { key: "focus", label: "今日+进行中" },
  { key: "all", label: "全部" },
];

const VIEW_OPTIONS: Array<{ key: IssuesView; label: string }> = [
  { key: "list", label: "列表" },
  { key: "group", label: "分组" },
  { key: "board", label: "看板" },
];

type SheetKind = "assignee" | "project" | "sort" | null;

export function TasksScreen({
  company,
  whoami,
  refreshToken = 0,
  initialProjectId,
  onOpenIssue,
}: {
  company: Company;
  whoami: string;
  /** 外层 (中央 "+") 建完任务后 +1, 让列表重新拉取 */
  refreshToken?: number;
  /** 项目卡「查看任务」带上来的项目 —— 落地即套用项目筛选 (null = 不筛选)。 */
  initialProjectId?: string | null;
  onOpenIssue: (issue: Issue) => void;
}) {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scope, setScope] = useState<IssuesScope>("focus");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [assignee, setAssignee] = useState("all");
  const [project, setProject] = useState(initialProjectId ?? "all");
  const [view, setView] = useState<IssuesView>("list");
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
      status,
      assignee,
      project,
      sortField: sortOption.field,
      sortDir: sortOption.dir,
    }),
    [search, scope, status, assignee, project, sortOption],
  );

  const statusCounts = useMemo(
    () => countIssuesByStatus(issues, selection),
    [issues, selection],
  );

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

  // 项目卡「查看任务」带过来的项目: 落地即套用项目筛选; 外部清空时回到全部。
  useEffect(() => {
    setProject(initialProjectId ?? "all");
  }, [initialProjectId]);

  const handleCreated = useCallback((issue: Issue) => {
    setCreateOpen(false);
    setRefreshSignal((value) => value + 1);
    Alert.alert("任务已创建", issue.title);
  }, []);

  const assigneeLabel = useMemo(() => {
    if (assignee === "all") return "全部";
    if (assignee === "unassigned") return "未分配";
    return agents.find((agent) => agent.id === assignee)?.name ?? "已指派";
  }, [assignee, agents]);

  const projectLabel = useMemo(() => {
    if (project === "all") return "全部项目";
    return projects.find((item) => item.id === project)?.name ?? "项目";
  }, [project, projects]);

  const assigneeOptions: FilterOption[] = useMemo(
    () => [
      { value: "all", label: "全部" },
      { value: "unassigned", label: "未分配" },
      ...agents.map((agent) => ({ value: agent.id, label: agent.name })),
    ],
    [agents],
  );

  const projectOptions: FilterOption[] = useMemo(
    () => [
      { value: "all", label: "全部项目" },
      ...projects.map((item) => ({
        value: item.id,
        label: item.name,
        dotColor: item.color ?? undefined,
      })),
    ],
    [projects],
  );

  const sortOptions: FilterOption[] = useMemo(
    () => SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    [],
  );

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
        {/* 标题区: 「任务」 + 刷新 */}
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.h1}>任务</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {company.name} · {scope === "focus" ? "今日 + 进行中" : "全部任务"}
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

        {/* 搜索框 */}
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={15} color={C.ink3} />
          <TextInput
            style={styles.searchInput}
            placeholder="搜索任务…"
            placeholderTextColor={C.ink3}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={15} color={C.ink4} />
            </Pressable>
          ) : null}
        </View>

        {/* 范围 chips: 今日+进行中 / 全部 */}
        <View style={styles.scopeRow}>
          {SCOPE_OPTIONS.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              active={scope === option.key}
              onPress={() => setScope(option.key)}
            />
          ))}
        </View>

        {/* 状态 chips: 全部 + 各状态 (带计数) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <Chip
            label={`全部 ${statusCounts.all > 0 ? `(${statusCounts.all})` : ""}`.trim()}
            active={status === "all"}
            onPress={() => setStatus("all")}
          />
          {ISSUE_STATUS_ORDER.map((value) => {
            const count = statusCounts[value] ?? 0;
            return (
              <Chip
                key={value}
                label={`${issueStatusLabel(value)}${count > 0 ? ` (${count})` : ""}`}
                active={status === value}
                onPress={() => setStatus(value)}
              />
            );
          })}
        </ScrollView>

        {/* 指派 / 项目 / 排序 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <Chip
            label={`指派 · ${assigneeLabel}`}
            active={assignee !== "all"}
            chevron
            onPress={() => setSheet("assignee")}
          />
          <Chip
            label={`项目 · ${projectLabel}`}
            active={project !== "all"}
            chevron
            onPress={() => setSheet("project")}
          />
          <Chip
            label={`排序 · ${sortOption.label}`}
            active={false}
            chevron
            onPress={() => setSheet("sort")}
          />
        </ScrollView>

        {/* 视图切换: 列表 / 分组 / 看板 */}
        <SegmentedControl
          options={VIEW_OPTIONS.map((option) => ({ key: option.key, label: option.label }))}
          value={view}
          onChange={(key) => setView(key as IssuesView)}
        />

        <IssuesList
          issues={issues}
          loading={loading}
          error={error}
          onRetry={() => void loadIssues()}
          onIssuePress={onOpenIssue}
          selection={selection}
          view={view}
          agents={agents}
          projects={projects}
        />
      </ScrollView>

      {/* 待审批快捷卡 (沿用旧任务页的浮动审批入口, 不因换 UI 丢能力) */}
      <QuickApprovalCard companyId={company.id} floating={true} />

      {/* 右下角浮起 [+ 新建任务] */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => setCreateOpen(true)}
        accessibilityLabel="新建任务"
      >
        <Ionicons name="add" size={20} color="#FFFFFF" />
        <Text style={styles.fabText}>新建任务</Text>
      </Pressable>

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

      <CreateTaskModal
        visible={createOpen}
        companyId={company.id}
        agents={agents}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </View>
  );
}

function Chip({
  label,
  active,
  chevron = false,
  onPress,
}: {
  label: string;
  active: boolean;
  chevron?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]} numberOfLines={1}>
        {label}
      </Text>
      {chevron ? (
        <Ionicons
          name="chevron-down"
          size={12}
          color={active ? C.accent : C.ink4}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: 96,
    gap: SPACING.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
  },
  titleBlock: {
    flex: 1,
    gap: 4,
  },
  h1: {
    color: C.ink,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  subtitle: {
    color: C.ink4,
    fontSize: 12,
  },
  refreshBtn: {
    padding: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: ELEVATION.base,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
  },
  searchInput: {
    flex: 1,
    color: C.ink,
    fontSize: 14,
    paddingVertical: 2,
  },
  scopeRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  // 横向 chips 轨: 负外边距让首尾贴合内容边距, 滚动时贴屏幕边。
  chipRow: {
    gap: SPACING.sm,
    paddingRight: SPACING.lg,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: ELEVATION.base,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  chipActive: {
    backgroundColor: "rgba(94, 106, 210, 0.15)",
    borderColor: C.accent,
  },
  chipLabel: {
    fontSize: 12,
    color: C.ink3,
    fontWeight: "500",
  },
  chipLabelActive: {
    color: C.accent,
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
