import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { C } from "../coolie";
import { SPACING } from "./tokens";

export interface KeyValueRowProps {
  label: string;
  value: string;
  valueColor?: string;
  mono?: boolean;
  layout?: "stacked" | "inline";
  style?: StyleProp<ViewStyle>;
}

/** 键值行: stacked (标签在上) 或 inline (标签左 / 值右) */
export function KeyValueRow({
  label,
  value,
  valueColor,
  mono = false,
  layout = "stacked",
  style,
}: KeyValueRowProps) {
  const inline = layout === "inline";
  return (
    <View style={[inline ? styles.inlineRow : styles.stackedRow, style]}>
      <Text style={inline ? styles.inlineLabel : styles.stackedLabel}>{label}</Text>
      <Text
        style={[
          inline ? styles.inlineValue : styles.stackedValue,
          valueColor ? { color: valueColor } : null,
          mono ? styles.mono : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stackedRow: {
    gap: 2,
  },
  stackedLabel: {
    color: C.ink3,
    fontSize: 11,
    fontWeight: "400",
  },
  stackedValue: {
    fontSize: 15,
    color: C.ink,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  inlineLabel: {
    fontSize: 12,
    color: C.ink3,
  },
  inlineValue: {
    fontSize: 12,
    color: C.ink,
    fontWeight: "500",
  },
  mono: {
    fontVariant: ["tabular-nums"],
    color: C.ink3,
    fontSize: 13,
  },
});
