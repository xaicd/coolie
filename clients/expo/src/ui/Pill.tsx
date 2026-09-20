import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { C } from "../coolie";
import { RADIUS, TONE, type ToneName } from "./tokens";

export interface PillProps {
  label?: string;
  value?: string;
  tone?: ToneName;
  dotColor?: string;
  active?: boolean;
  mono?: boolean;
  size?: "sm" | "md";
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  children?: ReactNode;
}

/** 胶囊/徽标: radius 999, 字重 500, 字号 11 (DESIGN.md 第3节) */
export function Pill({
  label,
  value,
  tone = "neutral",
  dotColor,
  active = false,
  mono = false,
  size = "md",
  onPress,
  style,
  textStyle,
  children,
}: PillProps) {
  const palette = TONE[tone];
  const dense = size === "sm";

  const box: StyleProp<ViewStyle> = [
    styles.base,
    { backgroundColor: palette.bg, borderColor: palette.border },
    dense ? styles.dense : styles.regular,
    active && styles.active,
    style,
  ];

  const content = (
    <>
      {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
      {label ? (
        <Text style={[styles.text, mono && styles.mono, active && styles.activeText, textStyle]}>
          {label}
        </Text>
      ) : null}
      {value ? (
        <Text style={[styles.text, styles.valueText, mono && styles.mono, textStyle]}>{value}</Text>
      ) : null}
      {children}
    </>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={box}>
        {content}
      </Pressable>
    );
  }

  return <View style={box}>{content}</View>;
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    alignSelf: "flex-start",
  },
  regular: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dense: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  active: {
    backgroundColor: "rgba(94, 106, 210, 0.18)",
    borderColor: C.brand,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    color: C.ink2,
    fontSize: 11,
    fontWeight: "500",
  },
  valueText: {
    color: C.ink,
    fontWeight: "600",
  },
  activeText: {
    color: C.ink,
  },
  mono: {
    fontVariant: ["tabular-nums"],
  },
});
