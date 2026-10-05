import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { C } from "../theme";
import { RADIUS, SPACING } from "../ui/tokens";

/**
 * wave302 — 全局面包屑导航条 (App.tsx 壳内顶部, 全局页面栈 screenStack 的可视化)。
 *
 * App 是手写状态机导航 (无 React Navigation), 「现在在哪 / 从哪来」以前只能靠
 * 各子屏自己的 [← 返回] 各说各话。这条面包屑把全局页面栈渲染成水平 chip 路径
 * (汇览 › 收件箱 › COOA-28), 点任一级 = 精准跳回该层; 叶子 (当前页) 高亮不可点。
 *
 * 样式对齐 OntologyDrillBreadcrumb (wave261 五层下钻面包屑), 但更紧凑 ——
 * 它常驻壳顶部, 不能占太多纵向空间。
 */
export interface BreadcrumbLevel {
  /** 稳定 key (React key + testID)。 */
  id: string;
  /** chip 文案, 如 "汇览" / "收件箱" / "COOA-28"。 */
  label: string;
  /** undefined = 叶子 (当前页), 渲染为高亮不可点; 否则点击跳回该层。 */
  onPress?: () => void;
}

export function BreadcrumbBar({
  levels,
  style,
}: {
  levels: BreadcrumbLevel[];
  style?: object;
}) {
  if (levels.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, style]}
      testID="breadcrumb-bar"
    >
      {levels.map((level, idx) => {
        const isLeaf = !level.onPress;
        const isFirst = idx === 0;
        return (
          <View key={level.id} style={styles.itemWrap}>
            {!isFirst ? (
              <Text style={styles.separator} accessibilityElementsHidden>
                ›
              </Text>
            ) : null}
            {isLeaf ? (
              <View
                style={[styles.chip, styles.chipLeaf]}
                accessibilityLabel={`当前页面 ${level.label}`}
              >
                <Text style={[styles.chipText, styles.chipTextLeaf]} numberOfLines={1}>
                  {level.label}
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={level.onPress}
                hitSlop={4}
                style={styles.chip}
                accessibilityRole="button"
                accessibilityLabel={`返回${level.label}`}
                testID={`breadcrumb-level-${level.id}`}
              >
                <Text style={styles.chipText} numberOfLines={1}>
                  {level.label}
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    gap: 4,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  itemWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    backgroundColor: C.bg,
    flexDirection: "row",
    alignItems: "center",
    maxWidth: 200,
  },
  chipLeaf: {
    borderColor: C.accent,
    backgroundColor: "rgba(94, 106, 210, 0.18)",
  },
  chipText: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
    flexShrink: 1,
  },
  chipTextLeaf: {
    color: C.accent,
    fontWeight: "600",
  },
  separator: {
    color: C.ink4,
    fontSize: 14,
    marginHorizontal: 4,
  },
});
