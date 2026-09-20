import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { C } from "../coolie";
import { ELEVATION, RADIUS } from "./tokens";

export interface AppCardProps {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  variant?: "outline" | "surface" | "plain";
  padding?: number;
  radius?: number;
  row?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** 通用卡片外壳: 半透明底 + line 边 + radius 12, 按压升亮 (DESIGN.md 第3节) */
export function AppCard({
  children,
  onPress,
  onLongPress,
  variant = "outline",
  padding = 14,
  radius = RADIUS.lg,
  row = false,
  style,
}: AppCardProps) {
  const variantStyle =
    variant === "surface"
      ? styles.surface
      : variant === "plain"
        ? styles.plain
        : styles.outline;
  const box: StyleProp<ViewStyle> = [
    styles.base,
    variantStyle,
    { padding, borderRadius: radius },
    row && styles.row,
    style,
  ];

  if (!onPress && !onLongPress) {
    return <View style={box}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [box, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
  },
  outline: {
    backgroundColor: ELEVATION.base,
    borderColor: C.line,
  },
  surface: {
    backgroundColor: C.surface,
    borderColor: "transparent",
  },
  plain: {
    borderColor: "transparent",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  pressed: {
    backgroundColor: ELEVATION.hover,
  },
});
