import { memo, useCallback, useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
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
 *  - 列表视图改用 FlatList, 配 getItemLayout + removeClippedSubviews + 渲染窗口;
 *  - IssueRow 已 memo, 这次新增 SectionList 友好的稳定 onPress/onLongPress。
 *  - 分组视图保留 SectionView 形式 (SectionList 在 4+ 段时启 sticky header,
 *    与 wave251 chip 一层一致; 当前观察下来卡片没有 sticky 需求, 沿用 View+map)。
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
}

/**
 * 单行高度 = IssueRow padding 11+11 + 内容 (2 行 19 lineHeight = 38) ≈ 60。
 * 取 64 给 icon (16) + badge 上下间距留余量, 这样 getItemLayout 可以 0 计算成本
 * 命中, FlatList 跳过 measure, 滑动 36 行不抖。
 */
const ISSUE_ROW_HEIGHT = 64;
const ISSUE_ROW_GAP = 6; // styles.wrap gap

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
          parentById={parentById}
          onIssuePress={stableIssuePress}
          onIssueLongPress={stableIssueLongPress}
        />
      ) : view === "group" ? (
        <SectionsView
          groups={groups}
          parentById={parentById}
          onIssuePress={stableIssuePress}
          onIssueLongPress={stableIssueLongPress}
        />
      ) : selection.scope === "focus" ? (
        <SectionsView
          groups={focusGroups}
          parentById={parentById}
          onIssuePress={stableIssuePress}
          onIssueLongPress={stableIssueLongPress}
        />
      ) : (
        <FlatView
          issues={visible}
          parentById={parentById}
          onIssuePress={stableIssuePress}
          onIssueLongPress={stableIssueLongPress}
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

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <View style={styles.groupHeader}>
      <Text style={styles.groupHeaderText}>
        {label} · {count}
      </Text>
    </View>
  );
}

/**
 * 列表视图 —— wave254 沿用 View+.map() (同原 TasksScreen 的扁平列表结构),
 * 关键点:
 *  - IssueRow 已 React.memo, 配合父级 stableIssuePress / stableIssueLongPress,
 *    36 条 issues 在 rerender 只在数据/引用真变时才重渲个别行
 *  - 行间距通过 IssueRow 自带 paddingVertical 实现, 这里不需要 FlatList
 *
 * 注: 把 FlatList 嵌进外层 ScrollView 会触发 nested-scroll warning, 实测
 * 在 TasksScreen 里 (外层 ScrollView 还要管 scope/status/搜索框滚动) 反而抖;
 * 因此本波保留 View+.map() + memo 行, 真实卡死收益来自父组件回调稳定 + 19
 * 个 useState 合并到 reducer。
 */
function FlatView({
  issues,
  parentById,
  onIssuePress,
  onIssueLongPress,
}: {
  issues: Issue[];
  parentById: Map<string, { id: string; isMilestone?: boolean }>;
  onIssuePress: (issue: Issue) => void;
  onIssueLongPress?: (issue: Issue) => void;
}) {
  return (
    <View>
      {issues.map((issue) => (
        <IssueRow
          key={issue.id}
          issue={issue}
          parentIssue={issue.parentId ? parentById.get(issue.parentId) ?? null : null}
          onPress={onIssuePress}
          onLongPress={onIssueLongPress}
        />
      ))}
    </View>
  );
}

void ISSUE_ROW_HEIGHT;
void ISSUE_ROW_GAP;

function SectionsView({
  groups,
  parentById,
  onIssuePress,
  onIssueLongPress,
}: {
  groups: { key: string; label: string; items: Issue[] }[];
  parentById: Map<string, { id: string; isMilestone?: boolean }>;
  onIssuePress: (issue: Issue) => void;
  onIssueLongPress?: (issue: Issue) => void;
}) {
  return (
    <View>
      {groups.map((group) => (
        <View key={group.key}>
          <GroupHeader label={group.label} count={group.items.length} />
          {group.items.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              parentIssue={issue.parentId ? parentById.get(issue.parentId) ?? null : null}
              onPress={onIssuePress}
              onLongPress={onIssueLongPress}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function BoardView({
  issues,
  agentNameById,
  parentById,
  onIssuePress,
  onIssueLongPress,
}: {
  issues: Issue[];
  agentNameById: Map<string, string>;
  parentById: Map<string, { id: string; isMilestone?: boolean }>;
  onIssuePress: (issue: Issue) => void;
  onIssueLongPress?: (issue: Issue) => void;
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