import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { C } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "./tokens";

/**
 * 表单分组卡 —— 新建任务屏的两张卡 (主要内容 / 指派) 用这一个外壳。
 *
 * 卡片化是 boss「手机安排工作要简单点」的落地单位: 一屏只留两张卡, 每张卡里
 * 都是同一件事的字段, 而不是一个 20 行的滚动表单 (wave30 的 4 卡 + 1 折叠)。
 */
export function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
    padding: SPACING.lg,
  },
  title: {
    color: C.ink4,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  body: {
    gap: SPACING.md,
  },
});
