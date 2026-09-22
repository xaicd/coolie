import { Pressable, StyleSheet, Text, View } from "react-native";
import { C } from "../../coolie";
import { ELEVATION, RADIUS, SPACING } from "../../ui/tokens";

/**
 * 空状态里的快捷功能行 (豆包主对话页的 4 个 chip)。
 *
 * 每个 chip 都挂一条已存在的链路 (对话 / 录音转写 / AI 创建 / 拍照上传), 不放
 * 占位入口 —— DESIGN.md 的「不做死控件」同样适用于 App。
 */
export interface QuickAction {
  key: string;
  /** emoji, 与豆包一致用字符而不是图标字体。 */
  icon: string;
  label: string;
  onPress: () => void;
}

export function QuickActionsRow({ actions }: { actions: QuickAction[] }) {
  return (
    <View style={styles.row}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
        >
          <Text style={styles.icon}>{action.icon}</Text>
          <Text style={styles.label}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: SPACING.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
  },
  chipPressed: {
    backgroundColor: ELEVATION.active,
  },
  icon: {
    fontSize: 13,
  },
  label: {
    color: C.ink2,
    fontSize: 13,
    fontWeight: "500",
  },
});
