import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Issue } from "@coolie/api-client";
import { C } from "../../coolie";
import { PRIORITY_DOT_COLOR } from "./taskMeta";

/** 看板视图：按状态分列横滑，点卡片循环推进状态，长按卡片打开详情 */
const BOARD_COLUMNS: {
  status: string;
  label: string;
  color: string;
  next: string;
}[] = [
  { status: "open", label: "待处理", color: C.ink3, next: "in_progress" },
  { status: "in_progress", label: "进行中", color: C.accent, next: "done" },
  { status: "blocked", label: "受阻", color: C.err, next: "in_progress" },
  { status: "done", label: "已完成", color: C.ok, next: "open" },
];

export interface IssueBoardViewProps {
  issues: Issue[];
  onMove: (id: string, status: string) => Promise<void>;
  onOpen: (issue: Issue) => void;
  onChangePriority: (id: string, priority: string) => Promise<void>;
}

export function IssueBoardView({
  issues,
  onMove,
  onOpen,
  onChangePriority,
}: IssueBoardViewProps) {
  const handleCardLongPress = (it: Issue) => {
    Alert.alert("修改优先级", `任务：${it.title}`, [
      { text: "低 (low)", onPress: () => void onChangePriority(it.id, "low") },
      { text: "中 (medium)", onPress: () => void onChangePriority(it.id, "medium") },
      { text: "高 (high)", onPress: () => void onChangePriority(it.id, "high") },
      { text: "查看详情", onPress: () => onOpen(it) },
      { text: "取消", style: "cancel" },
    ]);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.boardRow}
    >
      {BOARD_COLUMNS.map((col) => {
        const items = issues.filter((i) => i.status === col.status);
        const nextLabel = BOARD_COLUMNS.find((c) => c.status === col.next)?.label;
        return (
          <View key={col.status} style={styles.boardCol}>
            <View style={styles.boardColHeader}>
              <View style={[styles.boardColDot, { backgroundColor: col.color }]} />
              <Text style={styles.boardColTitle}>{col.label}</Text>
              <Text style={styles.boardColCount}>{items.length}</Text>
            </View>
            <ScrollView contentContainerStyle={styles.boardColBody}>
              {items.length === 0 ? (
                <Text style={styles.boardEmpty}>暂无</Text>
              ) : (
                items.map((it) => (
                  <Pressable
                    key={it.id}
                    style={styles.boardCard}
                    onPress={() => void onMove(it.id, col.next)}
                    onLongPress={() => handleCardLongPress(it)}
                  >
                    <Text style={styles.boardCardTitle} numberOfLines={3}>
                      {it.title}
                    </Text>
                    <View style={styles.boardCardMeta}>
                      <View
                        style={[
                          styles.boardPrioDot,
                          {
                            backgroundColor:
                              PRIORITY_DOT_COLOR[it.priority] ?? C.ink3,
                          },
                        ]}
                      />
                      <Text style={styles.boardCardHint}>
                        点按→{nextLabel} · 长按改优先级
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  boardRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  boardCol: {
    width: 168,
    backgroundColor: C.panel,
    borderRadius: 12,
    padding: 8,
    alignSelf: "flex-start",
  },
  boardColHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  boardColDot: { width: 8, height: 8, borderRadius: 4 },
  boardColTitle: { color: C.ink2, fontSize: 13, fontWeight: "600", flex: 1 },
  boardColCount: { color: C.ink4, fontSize: 12 },
  boardColBody: { gap: 8, paddingBottom: 16 },
  boardEmpty: {
    color: C.ink4,
    fontSize: 12,
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  boardCard: {
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  boardCardTitle: { color: C.ink, fontSize: 13, lineHeight: 18 },
  boardCardMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  boardPrioDot: { width: 6, height: 6, borderRadius: 3 },
  boardCardHint: { color: C.ink4, fontSize: 10 },
});
