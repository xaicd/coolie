import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { C } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "./tokens";

export interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  variant?: "standalone" | "inline";
  style?: StyleProp<ViewStyle>;
}

/** 空态三件套: 图标 + 标题 + 说明 (+ 可选动作) */
export function EmptyState({
  icon,
  title,
  subtitle,
  action,
  variant = "inline",
  style,
}: EmptyStateProps) {
  return (
    <View
      style={[
        variant === "inline" ? styles.inline : styles.standalone,
        style,
      ]}
    >
      {typeof icon === "string" ? <Text style={styles.icon}>{icon}</Text> : icon}
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  inline: {
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: ELEVATION.base,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    padding: 28,
  },
  standalone: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    padding: SPACING.xl,
  },
  icon: {
    fontSize: 32,
  },
  title: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  subtitle: {
    color: C.ink3,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    maxWidth: 300,
  },
});
