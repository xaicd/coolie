import { memo } from "react";
import { Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../coolie";
import { RADIUS, SPACING } from "../ui/tokens";

/**
 * 任务页搜索框 —— wave254 抽出 + memo, 让 search state 变化不引发其他子组件重渲。
 *
 * 受控: 外层 (TasksScreen) 持有 search, 这里只负责 UI + onChangeText。
 */
export const TasksScreenSearch = memo(function TasksScreenSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <View style={styles.searchBox}>
      <Ionicons name="search-outline" size={15} color={C.ink3} />
      <TextInput
        style={styles.searchInput}
        placeholder="搜索任务…"
        placeholderTextColor={C.ink3}
        value={value}
        onChangeText={onChange}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChange("")} hitSlop={8}>
          <Ionicons name="close-circle" size={15} color={C.ink4} />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
  },
  searchInput: {
    flex: 1,
    color: C.ink,
    fontSize: 14,
    paddingVertical: 2,
  },
});