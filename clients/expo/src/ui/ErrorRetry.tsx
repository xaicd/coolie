import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { C } from "../coolie";
import { ELEVATION, RADIUS, SPACING, TONE } from "./tokens";

export type ErrorRetryVariant = "fullscreen" | "card" | "inline" | "section";

export interface ErrorRetryProps {
  message: string;
  onRetry: () => void;
  variant?: ErrorRetryVariant;
  title?: string;
  icon?: string;
  retrying?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * 单一重试实现,覆盖原先四套:
 * - fullscreen 居中大字 + 主按钮
 * - card 卡片式 (图标 + 标题 + 说明 + 按钮)
 * - inline 内联错误条 + 小按钮 (错误色)
 * - section 分区错误条 + 小按钮 (中性色)
 */
export function ErrorRetry({
  message,
  onRetry,
  variant = "fullscreen",
  title,
  icon = "⚠️",
  retrying = false,
  style,
}: ErrorRetryProps) {
  const disabled = retrying;

  const retry = (
    <Pressable
      disabled={disabled}
      onPress={onRetry}
      style={[variant === "fullscreen" || variant === "card" ? styles.btnPrimary : styles.btnSmall, disabled && styles.disabled]}
    >
      {retrying ? (
        <ActivityIndicator size="small" color={variant === "fullscreen" ? C.ink : C.err} />
      ) : (
        <Text style={variant === "fullscreen" || variant === "card" ? styles.btnPrimaryText : styles.btnSmallText}>
          重试
        </Text>
      )}
    </Pressable>
  );

  if (variant === "fullscreen") {
    return (
      <View style={[styles.center, style]}>
        <Text style={styles.fullText}>{message}</Text>
        {retry}
      </View>
    );
  }

  if (variant === "card") {
    return (
      <View style={[styles.card, style]}>
        <Text style={styles.cardIcon}>{icon}</Text>
        {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
        <Text style={styles.cardText}>{message}</Text>
        {retry}
      </View>
    );
  }

  if (variant === "inline") {
    return (
      <View style={[styles.inlineBox, style]}>
        <Text style={styles.inlineText}>{message}</Text>
        {retry}
      </View>
    );
  }

  return (
    <View style={[styles.sectionBox, style]}>
      <Text style={styles.sectionText}>{message}</Text>
      <Pressable disabled={disabled} onPress={onRetry} style={[styles.btnSection, disabled && styles.disabled]}>
        {retrying ? (
          <ActivityIndicator size="small" color={C.ink} />
        ) : (
          <Text style={styles.btnSectionText}>重试</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  fullText: {
    color: C.err,
    fontSize: 13,
    textAlign: "center",
    marginBottom: SPACING.md,
  },
  card: {
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: ELEVATION.base,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    padding: 28,
  },
  cardIcon: {
    fontSize: 32,
  },
  cardTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  cardText: {
    color: C.ink3,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  btnPrimary: {
    marginTop: SPACING.sm,
    backgroundColor: C.brand,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "600",
  },
  inlineBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    backgroundColor: TONE.err.bg,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.25)",
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  inlineText: {
    color: C.err,
    fontSize: 11,
    flex: 1,
  },
  sectionBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.err,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  sectionText: {
    color: C.err,
    fontSize: 12,
    flex: 1,
  },
  btnSmall: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  btnSmallText: {
    color: C.err,
    fontSize: 11,
    fontWeight: "600",
  },
  btnSection: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    backgroundColor: C.surfaceHover,
    borderRadius: RADIUS.sm,
  },
  btnSectionText: {
    color: C.ink,
    fontSize: 12,
  },
  disabled: {
    opacity: 0.4,
  },
});
