import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../coolie";
import { RADIUS, SPACING } from "../ui/tokens";

/**
 * 任务页顶部标题区: 「任务」+ 公司名 + 范围副标题 + 右侧刷新按钮。
 *
 * wave254 抽出: 标题区几乎不变, 用 memo 包好让其他子组件触发重渲时不牵连。
 */
export const TasksScreenHeader = memo(function TasksScreenHeader({
  companyName,
  scopeLabel,
  onRefresh,
}: {
  companyName: string;
  scopeLabel: string;
  onRefresh: () => void;
}) {
  return (
    <View style={styles.titleRow}>
      <View style={styles.titleBlock}>
        <Text style={styles.h1}>任务</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {companyName} · {scopeLabel}
        </Text>
      </View>
      <Pressable
        style={styles.refreshBtn}
        onPress={onRefresh}
        hitSlop={8}
        accessibilityLabel="刷新任务"
      >
        <Ionicons name="refresh-outline" size={16} color={C.ink3} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
  },
  titleBlock: {
    flex: 1,
    gap: 4,
  },
  h1: {
    color: C.ink,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  subtitle: {
    color: C.ink4,
    fontSize: 12,
  },
  refreshBtn: {
    padding: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
});