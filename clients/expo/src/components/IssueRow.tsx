import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Issue } from "@coolie/api-client";
import { C } from "../theme";
import { RADIUS, SPACING } from "../ui/tokens";
import { formatRelativeShort } from "../utils/format";
import { issueStatusColor } from "./issue-status";

/**
 * 任务行 —— 对齐 Coolie Web 任务列表的每一行:
 * 左侧状态圆圈 (已完成是实心勾选, 其余是空心描边圈, 颜色即状态色) → 标题 → 右侧相对时间。
 *
 * 传 `timestamp` 可指定时间用哪个字段 (列表按创建时间分组, 就传 createdAt)。
 */
export const IssueRow = memo(function IssueRow({
  issue,
  onPress,
  timestamp,
  showStatusLabel = false,
}: {
  issue: Issue;
  onPress: (issue: Issue) => void;
  timestamp?: string | Date | null;
  showStatusLabel?: boolean;
}) {
  const color = issueStatusColor(issue.status);
  const done = issue.status === "done";
  const cancelled = issue.status === "cancelled";
  const time = formatRelativeShort(timestamp ?? issue.updatedAt ?? issue.createdAt);

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onPress(issue)}
      accessibilityRole="button"
      accessibilityLabel={issue.title}
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

      <Text
        style={[styles.title, cancelled && styles.titleCancelled]}
        numberOfLines={2}
      >
        {issue.title}
      </Text>

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
