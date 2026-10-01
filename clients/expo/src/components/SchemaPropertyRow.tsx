import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { OntologyPropertyEntry } from "@coolie/api-client";
import { C } from "../theme";
import { RADIUS, SPACING } from "../ui/tokens";
import { AppCard } from "../ui/AppCard";

interface SchemaPropertyRowProps {
  entry: OntologyPropertyEntry;
  onEdit: () => void;
  onRemove: () => void;
}

/**
 * Wave239 — 屏 3 单行属性卡 (agy 草图 §3).
 *
 * 字段名 + 类型徽标 + sample 展示. 右侧两枚动作按钮 (改 / 删). 长按拖拽
 * 暂时不做 — react-native-draggable-flatlist 需要 native 依赖, 与本波
 * "不动 native, 沿用 View" 的总方针冲突. 老板要拖拽时单开 wave.
 */
export function SchemaPropertyRow({ entry, onEdit, onRemove }: SchemaPropertyRowProps) {
  return (
    <AppCard variant="surface" padding={SPACING.md} style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.key} numberOfLines={1}>
          {entry.key}
        </Text>
        <View style={styles.typePill}>
          <Text style={styles.typePillText}>{entry.type}</Text>
        </View>
      </View>
      {entry.sample ? (
        <Text style={styles.sample} numberOfLines={2}>
          {entry.sample}
        </Text>
      ) : (
        <Text style={styles.sampleMuted} numberOfLines={1}>
          (无 sample)
        </Text>
      )}
      <View style={styles.actions}>
        <Pressable onPress={onEdit} hitSlop={4} style={styles.actionBtn}>
          <Ionicons name="create-outline" size={14} color={C.accent} />
          <Text style={styles.actionEditText}>改</Text>
        </Pressable>
        <Pressable onPress={onRemove} hitSlop={4} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={14} color={C.err} />
          <Text style={styles.actionRemoveText}>删</Text>
        </Pressable>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: SPACING.sm },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  key: { color: C.ink, fontSize: 14, fontWeight: "600", fontFamily: "monospace", flex: 1 },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(94, 106, 210, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(94, 106, 210, 0.35)",
  },
  typePillText: { color: C.accent, fontSize: 11, fontFamily: "monospace" },
  sample: { color: C.ink2, fontSize: 12, lineHeight: 17 },
  sampleMuted: { color: C.ink4, fontSize: 11 },
  actions: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
    justifyContent: "flex-end",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  actionEditText: { color: C.accent, fontSize: 11, fontWeight: "500" },
  actionRemoveText: { color: C.err, fontSize: 11, fontWeight: "500" },
});
