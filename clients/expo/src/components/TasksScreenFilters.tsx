import { memo, useCallback } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../coolie";
import { RADIUS, SPACING } from "../ui/tokens";
import {
  ISSUE_STATUS_ORDER,
  issueStatusLabel,
} from "./issue-status";
import {
  SCOPE_OPTIONS,
  type SheetKind,
  type IssuesScope,
  type StatusFilter,
} from "../hooks/useTasksFilter";

/**
 * 任务页筛选 chips 三层堆叠 (wave254 抽出):
 *   1) 范围: 今日+进行中 / 全部
 *   2) 状态: 全部 + 各状态 (带计数)
 *   3) 指派 / 项目 / 排序 / 只看主线 / 聚焦主线
 *
 * 三层都用横向 ScrollView 装 (chips 多了会横向溢出, 单层一个 ScrollView 已够)。
 * 用 memo 包好, 让 TasksScreen 上层 state (例如 issues 数据) 变化时不引发这里的
 * 重渲, 只有 props 真的变才重渲。
 */

interface TasksScreenFiltersProps {
  scope: IssuesScope;
  onScope: (key: IssuesScope) => void;

  status: StatusFilter;
  statusCounts: Record<string, number>;
  onStatus: (value: StatusFilter) => void;

  assigneeLabel: string;
  projectLabel: string;
  sortLabel: string;
  mainline: boolean;
  focusMainlineId: string | null;
  onOpenSheet: (kind: Exclude<SheetKind, null>) => void;
  onToggleMainline: () => void;
  onClearFocusMainline: () => void;
}

export const TasksScreenFilters = memo(function TasksScreenFilters(
  props: TasksScreenFiltersProps,
) {
  const {
    scope,
    onScope,
    status,
    statusCounts,
    onStatus,
    assigneeLabel,
    projectLabel,
    sortLabel,
    mainline,
    focusMainlineId,
    onOpenSheet,
    onToggleMainline,
    onClearFocusMainline,
  } = props;

  return (
    <View style={styles.wrap}>
      {/* 范围 chips */}
      <View style={styles.scopeRow}>
        {SCOPE_OPTIONS.map((option) => (
          <Chip
            key={option.key}
            label={option.label}
            active={scope === option.key}
            onPress={() => onScope(option.key)}
          />
        ))}
      </View>

      {/* 状态 chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <Chip
          label={`全部 ${statusCounts.all > 0 ? `(${statusCounts.all})` : ""}`.trim()}
          active={status === "all"}
          onPress={() => onStatus("all")}
        />
        {ISSUE_STATUS_ORDER.map((value) => {
          const count = statusCounts[value] ?? 0;
          return (
            <Chip
              key={value}
              label={`${issueStatusLabel(value)}${count > 0 ? ` (${count})` : ""}`}
              active={status === value}
              onPress={() => onStatus(value)}
            />
          );
        })}
      </ScrollView>

      {/* 指派 / 项目 / 排序 / 只看主线 / 聚焦主线 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <Chip
          label={`指派 · ${assigneeLabel}`}
          active={false}
          chevron
          onPress={() => onOpenSheet("assignee")}
        />
        <Chip
          label={`项目 · ${projectLabel}`}
          active={false}
          chevron
          onPress={() => onOpenSheet("project")}
        />
        <Chip
          label={`排序 · ${sortLabel}`}
          active={false}
          chevron
          onPress={() => onOpenSheet("sort")}
        />
        <Chip
          label="只看主线"
          active={mainline}
          onPress={onToggleMainline}
        />
        {focusMainlineId ? (
          <Chip label="✓ 聚焦主线" active onPress={onClearFocusMainline} />
        ) : null}
      </ScrollView>
    </View>
  );
});

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
  const handlePress = useCallback(() => onPress(), [onPress]);
  return (
    <Pressable
      onPress={handlePress}
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
  wrap: {
    gap: SPACING.sm,
  },
  scopeRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
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
    backgroundColor: "rgba(255,255,255,0.02)",
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
});