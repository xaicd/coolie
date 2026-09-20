import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../coolie";
import { SPACING } from "./tokens";

export interface SectionHeaderProps {
  title: string;
  count?: number;
  hint?: string;
  emphasis?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** 分区标题行: 标题 (+ 计数) / 提示 / 右侧插槽 / 刷新按钮 */
export function SectionHeader({
  title,
  count,
  hint,
  emphasis = false,
  onRefresh,
  refreshing = false,
  right,
  style,
}: SectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <Text style={[styles.title, emphasis && styles.titleEmphasis]}>
        {title}
        {typeof count === "number" ? ` (${count})` : ""}
      </Text>
      {right ??
        (onRefresh ? (
          <Pressable hitSlop={8} onPress={onRefresh} disabled={refreshing} style={styles.refresh}>
            {refreshing ? (
              <ActivityIndicator size="small" color={C.accent} />
            ) : (
              <Ionicons name="refresh" size={14} color={C.ink3} />
            )}
          </Pressable>
        ) : hint ? (
          <Text style={styles.hint}>{hint}</Text>
        ) : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  title: {
    color: C.ink3,
    fontSize: 13,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
  },
  titleEmphasis: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  hint: {
    color: C.ink4,
    fontSize: 11,
  },
  refresh: {
    padding: SPACING.xs,
  },
});
