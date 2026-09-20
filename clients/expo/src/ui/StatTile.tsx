import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { C } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "./tokens";

export interface StatTileProps {
  value: ReactNode;
  label: string;
  valueColor?: string;
  flex?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** 数字指标块: 24px weight 600 tabularNum + 11px 标签 (DESIGN.md 第4节) */
export function StatTile({ value, label, valueColor, flex = true, style }: StatTileProps) {
  return (
    <View style={[styles.tile, flex && styles.flex, style]}>
      <Text style={[styles.value, valueColor ? { color: valueColor } : null]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: ELEVATION.base,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.line,
    paddingVertical: 14,
    paddingHorizontal: SPACING.md,
    alignItems: "center",
    gap: SPACING.xs,
  },
  flex: {
    flex: 1,
  },
  value: {
    color: C.ink,
    fontSize: 24,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  label: {
    color: C.ink3,
    fontSize: 11,
    fontWeight: "500",
  },
});
