import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text } from "react-native";
import { C } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "./tokens";

/**
 * wave125 的任务页筛选 chip —— wave141 起提取为共享组件, 让「交付产物」页的
 * 项目筛选与任务页保持同一视觉口径 (pill 圆角 / 1px 边 / 选中 accent)。
 *
 * 带 `chevron` 的 chip 语义是「点开一个筛选抽屉 (FilterSheet)」, 与任务页一致。
 */
export function Chip({
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
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]} numberOfLines={1}>
        {label}
      </Text>
      {chevron ? (
        <Ionicons name="chevron-down" size={12} color={active ? C.accent : C.ink4} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: ELEVATION.base,
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
