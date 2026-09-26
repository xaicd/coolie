import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Issue } from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "../ui/tokens";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { IssueRow } from "./IssueRow";

/**
 * 任务列表 —— TasksScreen 的列表本体。
 *
 * wave96 精简 (boss 22:14 OOB「更复杂了」): 删 6 视图切换 (看板/分列/漏斗/
 * 排序/分层), 只剩列表; 列表只显示「今日 + 进行中」两组, 与收件箱 Tab
 * (@提及/审批/阻塞) 分工不重叠。
 *
 * 数据自己从 `GET /api/companies/:id/issues` 拉, 搜索由外层 TasksScreen
 * 持有并透传, 这里只做本地过滤。
 */

export interface IssuesListProps {
  companyId: string;
  onIssuePress: (issue: Issue) => void;
  /** 外层搜索框的值 (标题/编号本地匹配) */
  search?: string;
  /** 递增后重新拉取列表 (新建任务后由外层 +1) */
  refreshSignal?: number;
  style?: StyleProp<ViewStyle>;
}

/** wave96 — 「进行中」组认的状态: 与 issue-status 的「进行中」标签同口径。 */
const ACTIVE_STATUS = "in_progress";

function isToday(input: string | Date | undefined | null): boolean {
  if (!input) return false;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return date.getTime() >= startOfToday;
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
  search = "",
  refreshSignal = 0,
  style,
}: IssuesListProps) {
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

  // wave96 — 只显示「今日 + 进行中」。进行中的任务不再重复进「今日」组。
  const focusGroups = useMemo(() => {
    const today: Issue[] = [];
    const active: Issue[] = [];
    for (const issue of filtered) {
      if (issue.status === ACTIVE_STATUS) active.push(issue);
      else if (isToday(issueTimestamp(issue))) today.push(issue);
    }
    return [
      { key: "today", label: `今日 · ${today.length}`, items: today },
      { key: "active", label: `进行中 · ${active.length}`, items: active },
    ];
  }, [filtered]);

  const visibleCount = focusGroups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <View style={[styles.wrap, style]}>
      {/* 刷新 */}
      <View style={styles.switcherRow}>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => void load()} hitSlop={8} style={styles.refresh} accessibilityLabel="刷新任务">
          {loading ? <ActivityIndicator size="small" color={C.accent} /> : <Ionicons name="refresh" size={15} color={C.ink3} />}
        </Pressable>
      </View>

      {error ? (
        <ErrorRetry variant="inline" message={`任务加载失败: ${error}`} onRetry={() => void load()} />
      ) : loading && issues.length === 0 ? (
        <LoadingRows />
      ) : visibleCount === 0 ? (
        <EmptyState
          icon="📋"
          title={needle ? "没有匹配的任务" : "今天没有任务"}
          subtitle={needle ? "换个关键词，或清空搜索。" : "点右下角 [+ 新建任务] 创建第一个任务。"}
        />
      ) : (
        <GroupedView groups={focusGroups} onIssuePress={onIssuePress} />
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

function GroupedView({
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
          <View style={styles.groupHeader}>
            <Text style={styles.groupHeaderText}>{group.label}</Text>
          </View>
          {group.items.map((issue) => (
            <IssueRow key={issue.id} issue={issue} onPress={onIssuePress} />
          ))}
        </View>
      ))}
    </View>
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
});
