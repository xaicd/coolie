import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { C } from "../coolie";
import { SPACING } from "./tokens";

export interface ScreenHeaderProps {
  title?: string;
  subtitle?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** 页面头部: 返回条 + 标题 + 右侧插槽 + 可选分隔线 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backLabel,
  right,
  divider = false,
  style,
}: ScreenHeaderProps) {
  const back = onBack ? (
    <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
      <Text style={styles.backText}>{backLabel ? `‹ ${backLabel}` : "‹"}</Text>
    </Pressable>
  ) : null;

  if (!title && !subtitle && !right) {
    return <View style={[styles.backOnly, divider && styles.divider, style]}>{back}</View>;
  }

  return (
    <View style={[styles.wrap, divider && styles.divider, style]}>
      <View style={styles.main}>
        <View style={styles.titleRow}>
          {back}
          {title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
        </View>
        {subtitle}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backOnly: {
    alignSelf: "flex-start",
    paddingVertical: SPACING.xs,
  },
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.md,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
    paddingBottom: SPACING.sm,
  },
  main: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  title: {
    color: C.ink,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  back: {
    paddingVertical: SPACING.xs,
    paddingRight: 6,
  },
  backText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: "500",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
});
