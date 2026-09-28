import { memo, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
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
 */

export interface IssuesListProps {
  issues: Issue[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onIssuePress: (issue: Issue) => void;
  /** 当前筛选/排序 (状态由外层持有)。 */
  selection: IssueSelection;
  /** 视图模式: 列表 / 分组 / 看板。 */
  view: IssuesView;
  agents?: AgentRow[];
  projects?: Project[];
  style?: StyleProp<ViewStyle>;
}

export function IssuesList({
  issues,
  loading = false,
  error = null,
  onRetry,
  onIssuePress,
  selection,
  view,
  agents = [],
  projects = [],
  style,
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

  if (error) {
    return (
      <View style={[styles.wrap, style]}>
        <ErrorRetry variant="inline" message={`任务加载失败: ${error}`} onRetry={() => onRetry?.()} />
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

  if (visible.length === 0) {
    const filtering =
      selection.status !== "all" ||
      selection.assignee !== "all" ||
      selection.project !== "all";
    return (
      <View style={[styles.wrap, style]}>
        <EmptyState
          icon="📋"
          title={filtering ? "没有匹配的任务" : "今天没有任务"}
          subtitle={
            filtering
              ? "换个筛选条件，或清空搜索。"
              : "点右下角 [+ 新建任务] 创建第一个任务。"
          }
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      {view === "board" ? (
        <BoardView
          issues={visible}
          agentNameById={agentNameById}
          onIssuePress={onIssuePress}
        />
      ) : view === "group" ? (
        <SectionsView groups={groups} onIssuePress={onIssuePress} />
      ) : selection.scope === "focus" ? (
        <SectionsView groups={focusGroups} onIssuePress={onIssuePress} />
      ) : (
        <FlatView issues={visible} onIssuePress={onIssuePress} />
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

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <View style={styles.groupHeader}>
      <Text style={styles.groupHeaderText}>
        {label} · {count}
      </Text>
    </View>
  );
}

function FlatView({
  issues,
  onIssuePress,
}: {
  issues: Issue[];
  onIssuePress: (issue: Issue) => void;
}) {
  return (
    <View>
      {issues.map((issue) => (
        <IssueRow key={issue.id} issue={issue} onPress={onIssuePress} />
      ))}
    </View>
  );
}

function SectionsView({
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
          <GroupHeader label={group.label} count={group.items.length} />
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
  agentNameById,
  onIssuePress,
}: {
  issues: Issue[];
  agentNameById: Map<string, string>;
  onIssuePress: (issue: Issue) => void;
}) {
  const columns = useMemo(
    () =>
      ISSUE_STATUS_ORDER.map((status) => ({
        status,
        items: issues.filter((issue) => issue.status === status),
      })),
    [issues],
  );

  return (
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
  wrap: {
    gap: SPACING.sm,
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
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  groupHeaderText: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  boardContent: {
    gap: SPACING.sm,
    paddingRight: SPACING.lg,
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
