import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Issue } from "@coolie/api-client";
import { C, coolie, type AgentRow } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "../ui/tokens";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { IssueRow } from "./IssueRow";
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUS_ORDER,
  ISSUE_STATUS_COLOR,
  ISSUE_STATUS_LABEL,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
} from "./issue-status";

/**
 * 任务列表 —— 对齐 Coolie Web 的 Tasks 页:
 * 顶部 6 视图切换 (列表/看板/列/漏斗/排序/分层), 列表视图按 TODAY / YESTERDAY /
 * EARLIER 分组, 每行是 IssueRow。
 *
 * 数据自己从 `GET /api/companies/:id/issues` 拉 (旧任务页也是这么拉的), 搜索由
 * 外层 TasksScreen 持有并透传, 这里只做本地过滤。
 */

export type IssuesViewMode = "list" | "board" | "columns" | "funnel" | "sort" | "layers";

const VIEW_OPTIONS: { key: IssuesViewMode; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { key: "list", label: "列表", icon: "list-outline" },
  { key: "board", label: "看板", icon: "grid-outline" },
  { key: "columns", label: "分列", icon: "albums-outline" },
  { key: "funnel", label: "漏斗", icon: "funnel-outline" },
  { key: "sort", label: "排序", icon: "swap-vertical-outline" },
  { key: "layers", label: "分层", icon: "layers-outline" },
];

export interface IssuesListProps {
  companyId: string;
  onIssuePress: (issue: Issue) => void;
  defaultView?: IssuesViewMode;
  /** 外层搜索框的值 (标题/编号本地匹配) */
  search?: string;
  agents?: AgentRow[];
  /** 递增后重新拉取列表 (新建任务后由外层 +1) */
  refreshSignal?: number;
  style?: StyleProp<ViewStyle>;
}

type DateBucket = "TODAY" | "YESTERDAY" | "EARLIER";
const DATE_BUCKET_ORDER: DateBucket[] = ["TODAY", "YESTERDAY", "EARLIER"];
const DAY_MS = 24 * 60 * 60 * 1000;

function dateBucket(input: string | Date | undefined | null): DateBucket {
  if (!input) return "EARLIER";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "EARLIER";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = date.getTime();
  if (time >= startOfToday) return "TODAY";
  if (time >= startOfToday - DAY_MS) return "YESTERDAY";
  return "EARLIER";
}

function matchesSearch(issue: Issue, needle: string): boolean {
  if (!needle) return true;
  return [issue.title, issue.identifier ?? "", issue.id]
    .some((value) => value.toLowerCase().includes(needle));
}

function issueTimestamp(issue: Issue): string | Date | undefined {
  return issue.createdAt ?? issue.updatedAt;
}

export function IssuesList({
  companyId,
  onIssuePress,
  defaultView = "list",
  search = "",
  agents,
  refreshSignal = 0,
  style,
}: IssuesListProps) {
  const [view, setView] = useState<IssuesViewMode>(defaultView);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setIssues(await coolie.listIssues(companyId, { limit: 200 }));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const needle = search.trim().toLowerCase();
  const filtered = useMemo(
    () => issues.filter((issue) => matchesSearch(issue, needle)),
    [issues, needle],
  );

  const agentName = useCallback(
    (id: string | null | undefined) => {
      if (!id) return null;
      return agents?.find((agent) => agent.id === id)?.name ?? `员工 ${id.slice(0, 6)}`;
    },
    [agents],
  );

  const dateGroups = useMemo(() => {
    const groups = new Map<DateBucket, Issue[]>();
    for (const issue of filtered) {
      const bucket = dateBucket(issueTimestamp(issue));
      const list = groups.get(bucket);
      if (list) list.push(issue);
      else groups.set(bucket, [issue]);
    }
    return DATE_BUCKET_ORDER
      .filter((bucket) => groups.has(bucket))
      .map((bucket) => ({ key: bucket, label: bucket, items: groups.get(bucket)! }));
  }, [filtered]);

  const statusGroups = useMemo(
    () =>
      ISSUE_STATUS_ORDER.filter((status) => filtered.some((issue) => issue.status === status)).map(
        (status) => ({
          key: status,
          label: ISSUE_STATUS_LABEL[status],
          color: ISSUE_STATUS_COLOR[status],
          items: filtered.filter((issue) => issue.status === status),
        }),
      ),
    [filtered],
  );

  const priorityGroups = useMemo(
    () =>
      ISSUE_PRIORITIES.filter((priority) => filtered.some((issue) => issue.priority === priority)).map(
        (priority) => ({
          key: priority,
          label: PRIORITY_LABEL[priority],
          color: PRIORITY_COLOR[priority],
          items: filtered.filter((issue) => issue.priority === priority),
        }),
      ),
    [filtered],
  );

  const assigneeGroups = useMemo(() => {
    const groups = new Map<string, Issue[]>();
    for (const issue of filtered) {
      const key = issue.assigneeAgentId ?? "__unassigned";
      const list = groups.get(key);
      if (list) list.push(issue);
      else groups.set(key, [issue]);
    }
    const unassigned = groups.get("__unassigned");
    const assigned = [...groups.entries()].filter(([key]) => key !== "__unassigned");
    const rows = assigned.map(([key, items]) => ({
      key,
      label: agentName(key) ?? key.slice(0, 6),
      items,
    }));
    if (unassigned) rows.push({ key: "__unassigned", label: "未指派", items: unassigned });
    return rows;
  }, [filtered, agentName]);

  const sortGroup = useMemo(
    () => ({
      key: "__sorted",
      label: "按更新时间",
      items: [...filtered].sort(
        (a, b) =>
          new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() -
          new Date(a.updatedAt ?? a.createdAt ?? 0).getTime(),
      ),
    }),
    [filtered],
  );

  return (
    <View style={[styles.wrap, style]}>
      {/* 视图切换 (6 档) + 刷新 */}
      <View style={styles.switcherRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.switcher}
          keyboardShouldPersistTaps="handled"
        >
          {VIEW_OPTIONS.map((option) => {
            const active = option.key === view;
            return (
              <Pressable
                key={option.key}
                onPress={() => setView(option.key)}
                style={[styles.viewChip, active && styles.viewChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Ionicons name={option.icon} size={13} color={active ? C.ink : C.ink3} />
                <Text style={[styles.viewChipText, active && styles.viewChipTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable onPress={() => void load()} hitSlop={8} style={styles.refresh} accessibilityLabel="刷新任务">
          {loading ? <ActivityIndicator size="small" color={C.accent} /> : <Ionicons name="refresh" size={15} color={C.ink3} />}
        </Pressable>
      </View>

      {error ? (
        <ErrorRetry variant="inline" message={`任务加载失败: ${error}`} onRetry={() => void load()} />
      ) : loading && issues.length === 0 ? (
        <LoadingRows />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="📋"
          title={needle ? "没有匹配的任务" : "还没有任务"}
          subtitle={needle ? "换个关键词，或清空搜索。" : "点右下角 [+ 新建任务] 创建第一个任务。"}
        />
      ) : view === "board" ? (
        <BoardView issues={filtered} onIssuePress={onIssuePress} />
      ) : view === "list" ? (
        <DateGroupedView groups={dateGroups} onIssuePress={onIssuePress} />
      ) : view === "columns" ? (
        <GroupedView groups={statusGroups} onIssuePress={onIssuePress} showDot />
      ) : view === "funnel" ? (
        <FunnelView groups={priorityGroups} total={filtered.length} onIssuePress={onIssuePress} />
      ) : view === "sort" ? (
        <GroupedView groups={[sortGroup]} onIssuePress={onIssuePress} />
      ) : (
        <GroupedView groups={assigneeGroups} onIssuePress={onIssuePress} />
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

function Separator({ label }: { label: string }) {
  return (
    <View style={styles.separator}>
      <View style={styles.separatorRule} />
      <Text style={styles.separatorLabel}>{label}</Text>
      <View style={styles.separatorRule} />
    </View>
  );
}

function DateGroupedView({
  groups,
  onIssuePress,
}: {
  groups: { key: string; label: string; items: Issue[] }[];
  onIssuePress: (issue: Issue) => void;
}) {
  return (
    <View>
      {groups.map((group) => (
        <View key={group.key}>
          <Separator label={group.label} />
          {group.items.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              onPress={onIssuePress}
              timestamp={issueTimestamp(issue)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function GroupedView({
  groups,
  onIssuePress,
  showDot = false,
}: {
  groups: { key: string; label: string; color?: string; items: Issue[] }[];
  onIssuePress: (issue: Issue) => void;
  showDot?: boolean;
}) {
  return (
    <View>
      {groups.map((group) => (
        <View key={group.key}>
          <View style={styles.groupHeader}>
            {showDot ? (
              <View style={[styles.groupDot, { backgroundColor: group.color ?? C.ink3 }]} />
            ) : null}
            <Text style={styles.groupHeaderText}>{group.label}</Text>
            <Text style={styles.groupCount}>{group.items.length}</Text>
          </View>
          {group.items.map((issue) => (
            <IssueRow key={issue.id} issue={issue} onPress={onIssuePress} />
          ))}
        </View>
      ))}
    </View>
  );
}

function FunnelView({
  groups,
  total,
  onIssuePress,
}: {
  groups: { key: string; label: string; color: string; items: Issue[] }[];
  total: number;
  onIssuePress: (issue: Issue) => void;
}) {
  return (
    <View style={styles.funnel}>
      {groups.map((group) => (
        <View key={group.key} style={styles.funnelCard}>
          <View style={styles.funnelHeader}>
            <View style={[styles.groupDot, { backgroundColor: group.color }]} />
            <Text style={styles.funnelLabel}>{group.label}</Text>
            <Text style={styles.groupCount}>
              {group.items.length} / {total}
            </Text>
          </View>
          <View style={styles.funnelTrack}>
            <View
              style={[
                styles.funnelFill,
                { backgroundColor: group.color, width: `${(group.items.length / total) * 100}%` },
              ]}
            />
          </View>
          {group.items.map((issue) => (
            <IssueRow key={issue.id} issue={issue} onPress={onIssuePress} />
          ))}
        </View>
      ))}
    </View>
  );
}

function BoardView({
  issues,
  onIssuePress,
}: {
  issues: Issue[];
  onIssuePress: (issue: Issue) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.boardContent}
      keyboardShouldPersistTaps="handled"
    >
      {ISSUE_STATUS_ORDER.map((status) => {
        const items = issues.filter((issue) => issue.status === status);
        if (items.length === 0) return null;
        return (
          <View key={status} style={styles.boardColumn}>
            <View style={styles.boardColumnHeader}>
              <View style={[styles.groupDot, { backgroundColor: ISSUE_STATUS_COLOR[status] }]} />
              <Text style={styles.boardColumnTitle}>{ISSUE_STATUS_LABEL[status]}</Text>
              <Text style={styles.groupCount}>{items.length}</Text>
            </View>
            {items.map((issue) => (
              <Pressable
                key={issue.id}
                style={({ pressed }) => [styles.boardCard, pressed && styles.boardCardPressed]}
                onPress={() => onIssuePress(issue)}
              >
                <Text style={styles.boardCardTitle} numberOfLines={3}>
                  {issue.title}
                </Text>
                <View style={styles.boardCardMeta}>
                  <View style={[styles.groupDot, { backgroundColor: PRIORITY_COLOR[issue.priority] }]} />
                  <Text style={styles.boardCardPriority}>{PRIORITY_LABEL[issue.priority]}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: SPACING.sm,
  },
  switcherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  switcher: {
    gap: 6,
    paddingRight: SPACING.sm,
  },
  viewChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
  },
  viewChipActive: {
    borderColor: C.brand,
    backgroundColor: "rgba(94, 106, 210, 0.16)",
  },
  viewChipText: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  viewChipTextActive: {
    color: C.ink,
  },
  refresh: {
    padding: SPACING.xs,
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
  separator: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  separatorRule: {
    flex: 1,
    height: 1,
    backgroundColor: C.line,
  },
  separatorLabel: {
    color: C.ink4,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  groupDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  groupHeaderText: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  groupCount: {
    color: C.ink4,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  funnel: {
    gap: SPACING.md,
  },
  funnelCard: {
    gap: 6,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.lg,
    backgroundColor: ELEVATION.base,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  funnelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.xs,
  },
  funnelLabel: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  funnelTrack: {
    height: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: ELEVATION.soft,
    marginHorizontal: SPACING.xs,
    overflow: "hidden",
  },
  funnelFill: {
    height: 4,
    borderRadius: RADIUS.pill,
  },
  boardContent: {
    gap: SPACING.md,
    paddingBottom: SPACING.md,
  },
  boardColumn: {
    width: 180,
    gap: 8,
    alignSelf: "flex-start",
  },
  boardColumnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  boardColumnTitle: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  boardCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    padding: SPACING.md,
    gap: 8,
  },
  boardCardPressed: {
    backgroundColor: ELEVATION.hover,
  },
  boardCardTitle: {
    color: C.ink,
    fontSize: 13,
    lineHeight: 18,
  },
  boardCardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  boardCardPriority: {
    color: C.ink4,
    fontSize: 11,
  },
});
