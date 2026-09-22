import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { IssueStatus } from "@coolie/api-client";
import { C } from "../../coolie";
import { ELEVATION, RADIUS, SPACING } from "../../ui/tokens";
import {
  COMPOSER_STATUSES,
  COMPOSER_STATUS_HINT,
  issueStatusColor,
  issueStatusLabel,
} from "../issue-status";

/**
 * 新建任务的「状态」胶囊 —— App 侧的 Coolie Web `NewIssueDialog` 状态选择器。
 *
 * 上游是一个 Popover: 触发器显示当前状态 (●Todo), 展开后列出
 * `buildStatusOptions()` 的 5 个可选状态, 每项带状态色圆点 + 说明。
 * App 没有浮层 Popover, 这里就地展开同一份列表 (同一个胶囊位置), 选项集合、
 * 顺序、色点与说明都取自 `issue-status.ts` 这一份单一来源。
 *
 * 状态会随 create 请求一起提交 (`status` 字段), 所以这里选的就是落库的值 ——
 * 不是只改个显示 (见 `CreateIssueInput.status`)。
 */
export function StatusChip({
  value,
  onChange,
  disabled = false,
}: {
  value: IssueStatus;
  onChange: (status: IssueStatus) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const color = issueStatusColor(value);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`状态: ${issueStatusLabel(value)}`}
        onPress={() => setOpen((v) => !v)}
        disabled={disabled}
        style={({ pressed }) => [
          styles.chip,
          open && styles.chipOpen,
          pressed && styles.chipPressed,
          disabled && styles.disabled,
        ]}
      >
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.chipText}>{issueStatusLabel(value)}</Text>
      </Pressable>

      {open && !disabled ? (
        <View style={styles.menu}>
          {COMPOSER_STATUSES.map((status) => {
            const active = status === value;
            const hint = COMPOSER_STATUS_HINT[status];
            return (
              <Pressable
                key={status}
                accessibilityRole="button"
                accessibilityLabel={issueStatusLabel(status)}
                onPress={() => {
                  onChange(status);
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  styles.menuItem,
                  active && styles.menuItemActive,
                  pressed && styles.menuItemPressed,
                ]}
              >
                <View style={[styles.dot, { backgroundColor: issueStatusColor(status) }]} />
                <View style={styles.menuText}>
                  <Text style={[styles.menuLabel, active && styles.menuLabelActive]}>
                    {issueStatusLabel(status)}
                  </Text>
                  {hint ? <Text style={styles.menuHint}>{hint}</Text> : null}
                </View>
                {active ? <Ionicons name="checkmark" size={14} color={C.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: SPACING.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
  },
  chipOpen: {
    borderColor: C.brand,
  },
  chipPressed: {
    backgroundColor: ELEVATION.active,
  },
  chipText: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "500",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  menu: {
    width: 210,
    gap: 2,
    padding: SPACING.xs,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
  },
  menuItemActive: {
    backgroundColor: ELEVATION.active,
  },
  menuItemPressed: {
    backgroundColor: ELEVATION.hover,
  },
  menuText: {
    flex: 1,
    minWidth: 0,
  },
  menuLabel: {
    color: C.ink2,
    fontSize: 13,
  },
  menuLabelActive: {
    color: C.ink,
    fontWeight: "500",
  },
  menuHint: {
    color: C.ink4,
    fontSize: 11,
  },
  disabled: {
    opacity: 0.4,
  },
});
