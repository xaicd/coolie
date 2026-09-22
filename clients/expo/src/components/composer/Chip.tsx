import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { C } from "../../coolie";
import { ELEVATION, RADIUS } from "../../ui/tokens";

/**
 * The composer's pill control.
 *
 * The Coolie Web composer renders every one of its picker rows with the same
 * `InlineEntitySelector` trigger, so the App's three rows (For / in / Mode)
 * share one primitive here rather than each re-declaring the same border,
 * radius and active-state block.
 */
export function ComposerChip({
  label,
  active,
  onPress,
  icon,
  dotColor,
  accessibilityLabel,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  /** Leading glyph; `dotColor` and `icon` are mutually exclusive. */
  icon?: ReactNode;
  dotColor?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && styles.chipPressed,
      ]}
    >
      {icon}
      {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
      <Text style={[styles.text, active && styles.textActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
    maxWidth: 170,
  },
  chipActive: {
    borderColor: C.brand,
    backgroundColor: "rgba(94, 106, 210, 0.18)",
  },
  chipPressed: {
    backgroundColor: ELEVATION.active,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  textActive: {
    color: C.ink,
  },
});
