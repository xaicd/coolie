/**
 * [停用预留 · d5e3fac7 问②B 裁决] 零挂载死件, 保留不删 (2026-10-04 复核仍零消费)。
 * 宿主 ComposeScreen 随方案1 (b56f6ac94「+号直通两卡」) 精简退役后, composer
 * 展示层家族整体失宅 (import 级复核见 COOA-4 评论 1a5edf60)。勿当现役链路引用,
 * 勿在无关波次顺手改造 (wave132 误养先例); 复活需先重建宿主入口。
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../../coolie";
import { ELEVATION, RADIUS, SPACING } from "../../ui/tokens";

/**
 * The three optional participant rows the upstream `NewIssueDialog` hides behind
 * the "⋯" that sits at the end of the `For … in …` line.
 *
 * Upstream keeps them out of the form until asked for (`showReviewerRow` /
 * `showApproverRow` / `showWatchdogRow`), then the ⋯ becomes a menu that toggles
 * each one — and un-toggling clears the value it held. Same contract here: the
 * row names come from one list, and `onToggle` is what the screen flips.
 */
export type ComposerParticipant = "reviewer" | "approver" | "watchdog";

const ROWS: { key: ComposerParticipant; icon: string; label: string }[] = [
  { key: "reviewer", icon: "eye-outline", label: "Reviewer" },
  { key: "approver", icon: "shield-checkmark-outline", label: "Approver" },
  { key: "watchdog", icon: "scan-outline", label: "Watchdog" },
];

/**
 * The ⋯ trigger for the `For … in …` line.
 *
 * Split from the menu for the same measured reason as `StatusChip`: a wrapper
 * that grows to hold the menu drags its neighbours with it, so the chips beside
 * it move out from under the finger that is about to press them.
 */
export function ParticipantsTrigger({
  onPress,
  expanded = false,
  disabled = false,
}: {
  onPress: () => void;
  expanded?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="添加复核人 / 审批人 / 看守"
      accessibilityState={{ expanded }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.trigger,
        expanded && styles.triggerOpen,
        pressed && styles.triggerPressed,
        disabled && styles.disabled,
      ]}
    >
      <Ionicons name="ellipsis-horizontal" size={15} color={expanded ? C.ink : C.ink3} />
    </Pressable>
  );
}

/** The menu the trigger opens — one toggle per optional row. */
export function ParticipantsMenuList({
  visible,
  onToggle,
}: {
  /** Which rows are currently shown. */
  visible: ReadonlySet<ComposerParticipant>;
  onToggle: (participant: ComposerParticipant) => void;
}) {
  return (
    <View style={styles.menu}>
      {ROWS.map((row) => {
        const active = visible.has(row.key);
        return (
          <Pressable
            key={row.key}
            accessibilityRole="button"
            accessibilityLabel={row.label}
            accessibilityState={{ selected: active }}
            onPress={() => onToggle(row.key)}
            style={({ pressed }) => [
              styles.menuItem,
              active && styles.menuItemActive,
              pressed && styles.menuItemPressed,
            ]}
          >
            <Ionicons
              name={row.icon as React.ComponentProps<typeof Ionicons>["name"]}
              size={14}
              color={active ? C.ink : C.ink3}
            />
            <Text style={[styles.menuLabel, active && styles.menuLabelActive]}>{row.label}</Text>
            {active ? <Ionicons name="checkmark" size={14} color={C.accent} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
  },
  triggerOpen: {
    borderColor: C.brand,
  },
  triggerPressed: {
    backgroundColor: ELEVATION.active,
  },
  disabled: {
    opacity: 0.4,
  },
  menu: {
    alignSelf: "flex-start",
    minWidth: 200,
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
  menuLabel: {
    flex: 1,
    color: C.ink2,
    fontSize: 13,
  },
  menuLabelActive: {
    color: C.ink,
    fontWeight: "500",
  },
});
