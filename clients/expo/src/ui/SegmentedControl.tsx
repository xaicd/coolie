import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { C } from "../coolie";
import { ELEVATION, RADIUS } from "./tokens";

export interface SegmentedOption {
  key: string;
  label: string;
  color?: string;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (key: string) => void;
  style?: StyleProp<ViewStyle>;
}

/** 筛选分段器: 等宽分档, 选中档提亮 (DESIGN.md 第3节) */
export function SegmentedControl({ options, value, onChange, style }: SegmentedControlProps) {
  return (
    <View style={[styles.bar, style]}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            style={[styles.segment, selected && styles.segmentActive]}
            onPress={() => onChange(option.key)}
          >
            <Text
              style={[
                styles.text,
                selected && styles.textActive,
                option.color ? { color: option.color } : null,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: ELEVATION.base,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 2,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
  },
  segmentActive: {
    backgroundColor: ELEVATION.active,
  },
  text: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  textActive: {
    color: C.ink,
  },
});
