import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../coolie";
import { Sheet } from "../ui/Sheet";
import { RADIUS, SPACING } from "../ui/tokens";

/**
 * 通用单选筛选抽屉 —— wave125 任务页的「指派 / 项目 / 排序」三个 chip 共用。
 *
 * 交互与 AgentPickerSheet 一致 (点一项即选中并收起, 关闭由上层控制可见性),
 * 只是选项泛化成 label + 可选色点, 不绑定智能体语义。
 */
export interface FilterOption {
  value: string;
  label: string;
  /** 选项前的色点 (项目色等), 可选。 */
  dotColor?: string;
}

export function FilterSheet({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: FilterOption[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  if (!visible) return null;

  return (
    <Sheet onClose={onClose} title={title} maxHeight={460}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {options.map((option) => {
          const active = option.value === selected;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                onSelect(option.value);
                onClose();
              }}
              style={({ pressed }) => [
                styles.item,
                active && styles.itemActive,
                pressed && styles.itemPressed,
              ]}
            >
              {option.dotColor ? (
                <View style={[styles.dot, { backgroundColor: option.dotColor }]} />
              ) : null}
              <Text
                style={[styles.itemLabel, active && styles.itemLabelActive]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
              {active ? <Ionicons name="checkmark" size={16} color={C.accent} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 2,
    paddingBottom: SPACING.xs,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  itemActive: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  itemPressed: {
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  itemLabel: {
    flex: 1,
    color: C.ink2,
    fontSize: 14,
  },
  itemLabelActive: {
    color: C.ink,
    fontWeight: "600",
  },
});
