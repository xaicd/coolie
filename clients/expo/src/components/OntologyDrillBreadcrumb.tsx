import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { RADIUS, SPACING } from "../ui/tokens";

/**
 * Wave261 — five-level ontology drilldown breadcrumb.
 *
 * L0 公司 → L1 域 → L2 类型 → L3 实例 → L4 属性
 *
 * Each segment is a pressable chip; tapping a non-current segment jumps
 * back to that level. The current segment is rendered as a highlighted pill
 * with the `accent` token and is not pressable (the user is already there).
 *
 * The breadcrumb is rendered as a horizontal scroll so a long L3 instance
 * label ("Fix the redis cache eviction race condition") does not push the
 * viewport sideways — the App scrolls it into view when it lands.
 */
export interface OntologyDrillLevel {
  /** Stable key, used as the React key. */
  id: string;
  /** Human-readable chip label, e.g. "业务本体 / 75 实体". */
  label: string;
  /**
   * If undefined, the chip is the leaf level (current) and not pressable.
   * Otherwise tapping calls this to navigate back.
   */
  onPress?: () => void;
  /**
   * Optional small prefix icon for the leaf level — the chip becomes a
   * non-pressable pill with an icon. Defaults to no icon.
   */
  icon?: keyof typeof Ionicons.glyphMap;
}

interface OntologyDrillBreadcrumbProps {
  levels: OntologyDrillLevel[];
  style?: object;
}

export function OntologyDrillBreadcrumb({
  levels,
  style,
}: OntologyDrillBreadcrumbProps) {
  if (levels.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, style]}
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
                accessibilityLabel={`当前层级 ${level.label}`}
              >
                {level.icon ? (
                  <Ionicons
                    name={level.icon}
                    size={12}
                    color={C.accent}
                    style={styles.chipIcon}
                  />
                ) : null}
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
                accessibilityLabel={`${level.label} 返回上一级`}
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
    paddingVertical: SPACING.sm,
    gap: 6,
  },
  itemWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    backgroundColor: C.panel,
    flexDirection: "row",
    alignItems: "center",
    maxWidth: 220,
  },
  chipLeaf: {
    borderColor: C.accent,
    backgroundColor: "rgba(94, 106, 210, 0.18)",
  },
  chipIcon: {
    marginRight: 4,
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