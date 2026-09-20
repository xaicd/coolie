import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Issue } from "@coolie/api-client";
import { C } from "../../coolie";
import { AppCard } from "../../ui/AppCard";
import { Pill } from "../../ui/Pill";
import { StatusDot } from "../StatusDot";
import {
  PRIORITY_DOT_COLOR,
  PRIORITY_LABEL,
  STATUS_DOT_COLOR,
  STATUS_LABEL,
} from "./taskMeta";

export interface TaskCardProps {
  issue: Issue;
  /** 稳定的回调 (父级 useCallback), 配合 memo 才拦得住重复渲染 */
  onPress: (issue: Issue) => void;
}

/** 任务列表行 (规范行高 56, 状态点呼吸灯) */
export const TaskCard = React.memo(function TaskCard({
  issue,
  onPress,
}: TaskCardProps) {
  const isRunning = issue.status === "in_progress";
  const dotStatus = isRunning
    ? "ok"
    : issue.status === "blocked"
      ? "err"
      : "idle";

  return (
    <AppCard
      onPress={() => onPress(issue)}
      row
      padding={12}
      style={styles.taskCard}
    >
      <View style={styles.taskCardMain}>
        <View style={styles.taskTitleRow}>
          <StatusDot
            status={dotStatus}
            color={STATUS_DOT_COLOR[issue.status]}
            pulse={isRunning}
            size={8}
          />
          <Text style={styles.taskTitle} numberOfLines={2}>
            {issue.title}
          </Text>
        </View>

        <View style={styles.taskMeta}>
          {/* 状态徽标胶囊 */}
          <Pill
            label={STATUS_LABEL[issue.status] ?? issue.status}
            dotColor={STATUS_DOT_COLOR[issue.status] ?? C.ink3}
            mono
            size="sm"
          />

          {/* 优先级徽标胶囊 */}
          <Pill
            label={PRIORITY_LABEL[issue.priority] ?? issue.priority}
            dotColor={PRIORITY_DOT_COLOR[issue.priority] ?? C.ink3}
            mono
            size="sm"
          />
        </View>
      </View>

      <Text style={styles.chevron}>›</Text>
    </AppCard>
  );
});

const styles = StyleSheet.create({
  taskCard: {
    minHeight: 56,
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 10,
  },
  taskCardMain: {
    flex: 1,
    gap: 6,
  },
  taskTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  taskTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
  taskMeta: {
    flexDirection: "row",
    gap: 8,
    marginLeft: 16,
  },
  chevron: {
    color: C.ink4,
    fontSize: 16,
    fontWeight: "400",
  },
});
