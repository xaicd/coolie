import { Pressable, StyleSheet, Text, View } from "react-native";
import { C } from "../../coolie";
import { ELEVATION, RADIUS, SPACING } from "../../ui/tokens";

/**
 * 豆包式的两档切换 (boss 09-22「像豆包一样, 新会话」)。
 *
 * 「对话」离开本页进工坊会话 (BoardChatScreen), 「工作」留在新会话页派活 ——
 * 两个模式对应两条真实存在的链路, 不是装饰。
 */
export type NewTaskMode = "chat" | "work";

const OPTIONS: { value: NewTaskMode; label: string }[] = [
  { value: "chat", label: "对话" },
  { value: "work", label: "工作" },
];

export function ModeSwitch({
  value,
  onChange,
}: {
  value: NewTaskMode;
  onChange: (mode: NewTaskMode) => void;
}) {
  return (
    <View style={styles.track}>
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              active && styles.segmentActive,
              pressed && !active && styles.segmentPressed,
            ]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    alignSelf: "center",
    gap: SPACING.xs,
    padding: 3,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
  },
  segment: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
  },
  segmentActive: {
    backgroundColor: C.brand,
  },
  segmentPressed: {
    backgroundColor: ELEVATION.active,
  },
  label: {
    color: C.ink3,
    fontSize: 13,
    fontWeight: "500",
  },
  labelActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
