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

  // subtitle 既接受 ReactNode (自定义富文本), 也接受纯字符串 —— 传字符串时
  // 必须包进 <Text>, 否则 RN 会抛 "Text strings must be rendered within a
  // <Text> component." 并把红屏警告浮层盖到界面 (COOA-136 FDSE 真机走查)。
  const subtitleNode =
    typeof subtitle === "string" || typeof subtitle === "number" ? (
      <Text style={styles.subtitle}>{subtitle}</Text>
    ) : (
      subtitle ?? null
    );

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
        {subtitleNode}
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
    // fontScale 放大时允许主区收缩 (title 已 numberOfLines=1),
    // 挤压方向只能是标题, 不能是右侧动作钮 — 否则按钮文字被压成竖排。
    flexShrink: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  subtitle: {
    color: C.ink3,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
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
    flexShrink: 0,
  },
});
