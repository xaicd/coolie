import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../coolie";
import { StatusDot } from "./StatusDot";
import { formatTime } from "../utils/format";

/**
 * ChatHeader — 工坊对话框顶部条 (wave71 抽出)
 *
 * 三段结构:
 *   1. 左侧 [☰ 对话列表] (wave148) + 标题/副标题
 *   2. 中间 timestamp (最近一条助手消息的时间戳)
 *   3. 右侧 [+ 新建对话] + [🗑️ 清空]
 *
 * wave73: 删 "工坊" 标题 Text, idle 状态不再渲染「驱动 5 角色员工」副标题。
 * wave148: 加多对话入口 —— 左侧 ☰ 打开对话列表 (切换 / 重命名 / 归档),
 *          右侧 + 新建对话; 头部标题显示当前对话名 (boss 09-29: 不能老在一个
 *          对话里)。
 */
export interface ChatHeaderProps {
  thinking?: boolean;
  subtitle?: string;
  timestamp?: string | null;
  /** wave148: 当前对话标题, 显示在头部 */
  title?: string | null;
  /** 是否处于嵌入模式 (Workspace Tab) — 嵌入时不显示返回 + 清空 + 对话入口 */
  embedded?: boolean;
  onBack?: () => void;
  onRequestClear?: () => void;
  /** wave148: 打开对话列表 (切换 / 重命名 / 归档) */
  onOpenConversations?: () => void;
  /** wave148: 新建对话 */
  onNewConversation?: () => void;
}

export function ChatHeader({
  thinking = false,
  subtitle,
  timestamp,
  title,
  embedded = false,
  onBack,
  onRequestClear,
  onOpenConversations,
  onNewConversation,
}: ChatHeaderProps) {
  const showConversationControls = !embedded;
  return (
    <View style={styles.topBar}>
      <View style={styles.topLeft}>
        {Boolean(onBack) && !embedded ? (
          <Pressable onPress={onBack} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={18} color={C.ink2} />
          </Pressable>
        ) : null}
        {showConversationControls && onOpenConversations ? (
          <Pressable
            onPress={onOpenConversations}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="对话列表"
            style={styles.iconBtn}
          >
            <Ionicons name="list-outline" size={18} color={C.ink2} />
          </Pressable>
        ) : null}
        <View style={styles.titleStack}>
          <Text style={styles.titleText} numberOfLines={1}>
            {title && title.trim() ? title : "工坊协同会话"}
          </Text>
          {subtitle || thinking ? (
            <View style={styles.subtitleRow}>
              <StatusDot
                status={thinking ? "running" : "ok"}
                color={thinking ? C.warn : C.accent}
                size={6}
              />
              <Text style={styles.topSubTitle}>{subtitle ?? "思考中…"}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.topRight}>
        {timestamp ? (
          <Text style={styles.timestampText}>{formatTime(timestamp)}</Text>
        ) : null}
        {showConversationControls && onNewConversation ? (
          <Pressable
            onPress={onNewConversation}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="新建对话"
            style={styles.iconBtn}
          >
            <Ionicons name="add" size={20} color={C.ink2} />
          </Pressable>
        ) : null}
        {onRequestClear && !embedded ? (
          <Pressable
            onPress={onRequestClear}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="清空对话"
            style={({ pressed }) => [
              styles.clearBtn,
              pressed && styles.clearBtnPressed,
            ]}
          >
            <Ionicons name="trash-outline" size={16} color={C.ink3} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
    backgroundColor: C.bg,
  },
  topLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  titleStack: {
    minWidth: 0,
    flex: 1,
  },
  titleText: {
    color: C.ink,
    fontSize: 14,
    fontWeight: "600",
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  topSubTitle: {
    color: C.ink3,
    fontSize: 11,
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timestampText: {
    color: C.ink4,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  clearBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  clearBtnPressed: {
    backgroundColor: C.surfaceHover,
  },
});
