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
 * App 没有浮层 Popover, 这里把同一份列表就地展开在同一行的**下方**。
 *
 * 触发器与列表分成两个组件 (而不是各自 useState 包一个 wrapper): 属性条上是
 * 两颗并排的胶囊, 若把菜单塞进胶囊自己的 wrapper, 展开时 wrapper 会被菜单撑宽,
 * 把旁边那颗胶囊整体挤走 —— 实测点「⋯」会因此落空 (先开了状态菜单, 再点 ⋯ 就点不到了)。
 * 拆开之后菜单落在整行下方, 两颗胶囊的位置不随展开变化。
 */
export function StatusChip({
  value,
  onPress,
  expanded = false,
  disabled = false,
}: {
  value: IssueStatus;
  onPress: () => void;
  expanded?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`状态: ${issueStatusLabel(value)}`}
      accessibilityState={{ expanded }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        expanded && styles.chipOpen,
        pressed && styles.chipPressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: issueStatusColor(value) }]} />
      <Text style={styles.chipText}>{issueStatusLabel(value)}</Text>
    </Pressable>
  );
}

/** 状态列表 —— 展开后落在属性条下方 (见上面为什么拆开)。 */
export function StatusMenu({
  value,
  onChange,
}: {
  value: IssueStatus;
  onChange: (status: IssueStatus) => void;
}) {
  return (
    <View style={styles.menu}>
      {COMPOSER_STATUSES.map((status) => {
        const active = status === value;
        const hint = COMPOSER_STATUS_HINT[status];
        return (
          <Pressable
            key={status}
            accessibilityRole="button"
            accessibilityLabel={issueStatusLabel(status)}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(status)}
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
  );
}

const styles = StyleSheet.create({
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
    alignSelf: "flex-start",
    minWidth: 210,
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
