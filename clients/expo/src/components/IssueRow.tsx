import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Issue, IssueSpecKind } from "@coolie/api-client";
import { C } from "../theme";
import { RADIUS, SPACING } from "../ui/tokens";
import { formatRelativeShort } from "../utils/format";
import { issueStatusColor } from "./issue-status";

/** wave156: short label + tone for each spec-driven chain kind. */
const SPEC_KIND_BADGE: Record<IssueSpecKind, string> = {
  requirement: "Spec · 需求",
  bugfix: "Spec · 缺陷修复",
  design: "Spec · 设计",
  task: "Spec · 任务",
};

/**
 * 任务行 —— 对齐 Coolie Web 任务列表的每一行:
 * 左侧状态圆圈 (已完成是实心勾选, 其余是空心描边圈, 颜色即状态色) → 标题 → 徽标 → 右侧相对时间。
 *
 * 传 `timestamp` 可指定时间用哪个字段 (列表按创建时间分组, 就传 createdAt)。
 *
 * wave156: 每行额外渲染四种任务性质徽标 — [主线] / [支线] / [临时] / [Spec · ...];
 * 它们与 web IssuesList 的标题后缀一一对应, 让 App 用户一眼看到任务分类。
 */
export const IssueRow = memo(function IssueRow({
  issue,
  parentIssue,
  onPress,
  onLongPress,
  timestamp,
  showStatusLabel = false,
}: {
  issue: Issue;
  /** Optional parent issue (for 支线 / 临时 判定). TasksScreen 不传时,
   * 这两个徽标不会渲染, 只会看到 [主线] 和 [Spec · ...]。 */
  parentIssue?: Pick<Issue, "id" | "isMilestone"> | null;
  onPress: (issue: Issue) => void;
  /** wave156: long-press on a mainline row sets the "聚焦下钻此主线" filter. */
  onLongPress?: (issue: Issue) => void;
  timestamp?: string | Date | null;
  showStatusLabel?: boolean;
}) {
  const color = issueStatusColor(issue.status);
  const done = issue.status === "done";
  const cancelled = issue.status === "cancelled";
  const time = formatRelativeShort(timestamp ?? issue.updatedAt ?? issue.createdAt);

  const isBranch = !issue.isMilestone && !!issue.parentId && parentIssue?.isMilestone === true;
  const isAdhoc = !issue.isMilestone && !!issue.parentId && parentIssue != null && parentIssue.isMilestone === false;
  const showSpec = !!issue.specKind && (SPEC_KIND_BADGE as Record<string, string>)[issue.specKind] != null;
  const identifier = issue.identifier ?? (issue.id ? `#${issue.id.slice(0, 5).toUpperCase()}` : null);

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onPress(issue)}
      onLongPress={onLongPress ? () => onLongPress(issue) : undefined}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={issue.title}
      accessibilityHint={onLongPress && issue.isMilestone ? "长按可聚焦下钻此主线" : undefined}
    >
      <View
        style={[
          styles.glyph,
          { borderColor: cancelled ? C.ink4 : color },
          done && { backgroundColor: color, borderColor: color },
        ]}
      >
        {done ? <Ionicons name="checkmark" size={11} color={C.bg} /> : null}
      </View>

      {identifier ? (
        <Text style={styles.identifier} numberOfLines={1}>
          {identifier}
        </Text>
      ) : null}

      <Text
        style={[styles.title, cancelled && styles.titleCancelled]}
        numberOfLines={2}
      >
        {issue.title}
      </Text>

      {issue.isMilestone ? (
        <Text style={styles.mainlineTag} numberOfLines={1}>
          主线
        </Text>
      ) : null}

      {isBranch ? (
        <Text style={styles.branchTag} numberOfLines={1}>
          支线
        </Text>
      ) : null}

      {isAdhoc ? (
        <Text style={styles.adhocTag} numberOfLines={1}>
          临时
        </Text>
      ) : null}

      {showSpec ? (
        <Text style={styles.specTag} numberOfLines={1}>
          {SPEC_KIND_BADGE[issue.specKind as IssueSpecKind]}
        </Text>
      ) : null}

      {showStatusLabel ? (
        <Text style={[styles.statusLabel, { color }]} numberOfLines={1}>
          {issue.status}
        </Text>
      ) : null}

      {time ? <Text style={styles.time}>{time}</Text> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: 11,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
  },
  rowPressed: {
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  glyph: {
    width: 16,
    height: 16,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  identifier: {
    color: C.ink4,
    fontSize: 12,
    fontFamily: "monospace",
    fontWeight: "500",
    marginRight: -4,
  },
  title: {
    flex: 1,
    color: C.ink,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 19,
  },
  titleCancelled: {
    color: C.ink4,
    textDecorationLine: "line-through",
  },
  mainlineTag: {
    color: C.accent,
    fontSize: 10,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: "hidden",
  },
  branchTag: {
    color: "#0284c7",
    fontSize: 10,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: "rgba(2, 132, 199, 0.4)",
    backgroundColor: "rgba(2, 132, 199, 0.1)",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: "hidden",
  },
  adhocTag: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: "rgba(71, 85, 105, 0.4)",
    backgroundColor: "rgba(71, 85, 105, 0.1)",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: "hidden",
  },
  specTag: {
    color: "#7c3aed",
    fontSize: 10,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.4)",
    backgroundColor: "rgba(124, 58, 237, 0.1)",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: "hidden",
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  time: {
    color: C.ink4,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
});
