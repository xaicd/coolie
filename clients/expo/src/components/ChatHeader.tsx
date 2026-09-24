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
 *   1. 标题 + 副标题 (董事长助理 · 状态)
 *   2. 中间 timestamp (最近一条助手消息的时间戳)
 *   3. 右侧 [🗑️ 清空] — 弹 onRequestClear, 由 BoardChatScreen 弹确认 Modal
 *
 * 副标题: 「思考中…」 由父屏传入 `thinking` / `subtitle` 控制。wave73
 * (boss 26:32 OOB 「左上角工坊 驱动5角色员工 这些描述都不要了」):
 * idle 状态不再渲染「驱动 5 角色员工」副标题, 仅保留 `thinking` /
 * `subtitle` 传入的动态文案 (思考中 / 正在生成回复…)。
 * 之所以抽出: 把头部代码从 BoardChatScreen 那一坨 2084 行的屏里搬出来, 单元
 * 屏幕只管聊天流; 后续要改图标 / 标题 / 时间戳样式只动这一处。
 */
export interface ChatHeaderProps {
  thinking?: boolean;
  subtitle?: string;
  timestamp?: string | null;
  /** 是否处于嵌入模式 (Workspace Tab) — 嵌入时不显示返回 + 清空入口 */
  embedded?: boolean;
  onBack?: () => void;
  onRequestClear?: () => void;
}

export function ChatHeader({
  thinking = false,
  subtitle,
  timestamp,
  embedded = false,
  onBack,
  onRequestClear,
}: ChatHeaderProps) {
  return (
    <View style={styles.topBar}>
      <View style={styles.topLeft}>
        {Boolean(onBack) && !embedded ? (
          <Pressable
            onPress={onBack}
            hitSlop={8}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={18} color={C.ink2} />
          </Pressable>
        ) : null}
        <View style={styles.titleStack}>
          <Text style={styles.topTitle}>工坊</Text>
          {subtitle || thinking ? (
            <View style={styles.subtitleRow}>
              <StatusDot
                status={thinking ? "running" : "ok"}
                color={thinking ? C.warn : C.accent}
                size={6}
              />
              <Text style={styles.topSubTitle}>
                {subtitle ?? "思考中…"}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.topRight}>
        {timestamp ? (
          <Text style={styles.timestampText}>
            {formatTime(timestamp)}
          </Text>
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
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  backBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  titleStack: {
    minWidth: 0,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  topTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  topSubTitle: {
    color: C.ink3,
    fontSize: 11,
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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