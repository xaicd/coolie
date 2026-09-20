import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { StatusDot, type StatusDotKind } from "../components/StatusDot";
import { RADIUS, TONE, type ToneName } from "./tokens";

export interface StatusBadgeProps {
  label: string;
  color?: string;
  bg?: string;
  border?: string;
  tone?: ToneName;
  dotStatus?: StatusDotKind;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** 带状态点的徽标: 颜色可显式给出 (生命周期配置), 也可用语义 tone */
export function StatusBadge({
  label,
  color,
  bg,
  border,
  tone = "neutral",
  dotStatus,
  size = 6,
  style,
}: StatusBadgeProps) {
  const palette = TONE[tone];
  const fg = color ?? palette.fg;

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: bg ?? palette.bg, borderColor: border ?? palette.border },
        style,
      ]}
    >
      <StatusDot status={dotStatus} color={fg} size={size} />
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 11,
    fontWeight: "500",
  },
});
