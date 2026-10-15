import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../coolie";
import { RADIUS, SPACING } from "../ui/tokens";
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
  /**
   * wave383: 当前工坊锁定的项目名 (老板拍: 生产 coolie 工坊是对外项目建设)。
   * 与 onOpenProjects 一起构成顶栏「项目上下文」行。
   */
  projectName?: string | null;
  /** wave383: 打开项目切换抽屉 (ProjectPickerSheet)。 */
  onOpenProjects?: () => void;
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
  projectName,
  onOpenProjects,
  embedded = false,
  onBack,
  onRequestClear,
  onOpenConversations,
  onNewConversation,
}: ChatHeaderProps) {
  const showConversationControls = !embedded;
  const showProjectRow = Boolean(onOpenProjects) || Boolean(projectName && projectName.trim());
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
            accessibilityLabel="列表"
            style={styles.iconBtn}
          >
            <Ionicons name="list-outline" size={18} color={C.ink2} />
          </Pressable>
        ) : null}
        <View style={styles.titleStack}>
          <Text style={styles.titleText} numberOfLines={1}>
            {title && title.trim() ? title : "工坊协同会话"}
          </Text>
          {showProjectRow ? (
            <Pressable
              onPress={onOpenProjects}
              disabled={!onOpenProjects}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="切换项目"
              style={({ pressed }) => [
                styles.projectChip,
                pressed && onOpenProjects ? styles.projectChipPressed : null,
              ]}
            >
              <Ionicons name="folder-outline" size={12} color={C.accent} />
              <Text style={styles.projectChipText} numberOfLines={1}>
                {projectName && projectName.trim() ? projectName : "选择项目"}
              </Text>
              {onOpenProjects ? (
                <Ionicons name="chevron-down" size={12} color={C.ink3} />
              ) : null}
            </Pressable>
          ) : null}
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
            accessibilityLabel="新建"
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
            accessibilityLabel="清空"
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
  projectChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    maxWidth: "100%",
    marginTop: 3,
    paddingVertical: 1,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  projectChipPressed: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  projectChipText: {
    color: C.ink2,
    fontSize: 11,
    flexShrink: 1,
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
