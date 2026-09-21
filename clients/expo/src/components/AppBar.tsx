import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { openCoolieWeb } from "../utils/openCoolieWeb";

/**
 * 全局顶栏 — 对齐 Coolie Web (clients/expo-paperclip-web) 的原生 appBar:
 * 中间标题 "Coolie工坊", 右侧 [驾驶舱Web] 按钮跳 coolieweb:// 深链。
 *
 * 左侧留空 (驾驶舱没有 web 后退, 不渲染 ←); 通知铃铛 + 全局搜索仍放左侧,
 * 因为它们原先只挂在旧 topBar 上, 去掉会丢掉两个入口 (通知中心 / 全局搜索)。
 *
 * ⚠️ 图标字体: 装机包里 `@expo/vector-icons` 的字形画不出来 (0.5.6 起实测整排
 * Ionicons 都是空白, 见 wave18 记录), 所以语音按钮用 emoji/文字字形而不是
 * Ionicons —— 它在任何情况下都画得出来。其余 icon 暂维持原样, 待单独修字体。
 */
export function AppBar({
  title,
  unreadCount = 0,
  onOpenNotifications,
  onOpenSearch,
  onVoice,
  voiceRecording = false,
  voiceBusy = false,
}: {
  title: string;
  unreadCount?: number;
  onOpenNotifications?: () => void;
  onOpenSearch?: () => void;
  /** 语音派发 (任务页提供时显示 mic) */
  onVoice?: () => void;
  voiceRecording?: boolean;
  voiceBusy?: boolean;
}) {
  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        {onOpenNotifications ? (
          <Pressable
            style={styles.iconBtn}
            hitSlop={10}
            onPress={onOpenNotifications}
          >
            <Ionicons name="notifications-outline" size={20} color={C.ink2} />
            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
        {onOpenSearch ? (
          <Pressable style={styles.iconBtn} hitSlop={10} onPress={onOpenSearch}>
            <Ionicons name="search-outline" size={20} color={C.ink2} />
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      <View style={[styles.side, styles.sideRight]}>
        {onVoice ? (
          <Pressable
            onPress={onVoice}
            disabled={voiceBusy}
            hitSlop={8}
            accessibilityLabel={voiceRecording ? "停止录音并派发" : "语音派发任务"}
            style={({ pressed }) => [
              styles.voiceBtn,
              voiceRecording && styles.voiceBtnRecording,
              voiceBusy && styles.voiceBtnDisabled,
              pressed && styles.webBtnPressed,
            ]}
          >
            {/* 文字字形而不是 Ionicons: 图标字体在装机包里画不出字形 (0.5.6 起实测
                整排 Ionicons 都是空白), 语音按钮会变成一个看不出用途的空框。emoji +
                中文标签走系统字体, 一定画得出来。 */}
            <Text style={[styles.voiceGlyph, voiceRecording && styles.voiceGlyphRecording]}>
              {voiceRecording ? "■ 停止" : "🎤 派发"}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => void openCoolieWeb()}
          hitSlop={8}
          style={({ pressed }) => [styles.webBtn, pressed && styles.webBtnPressed]}
        >
          <Text style={styles.webBtnText}>驾驶舱Web</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  side: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  sideRight: {
    justifyContent: "flex-end",
  },
  iconBtn: {
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: C.err,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  title: {
    color: C.ink,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  webBtn: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
  },
  voiceBtn: {
    height: 32,
    paddingHorizontal: 10,
    marginRight: 8,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  voiceBtnRecording: {
    borderColor: "rgba(239, 68, 68, 0.4)",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },
  voiceGlyph: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "500",
  },
  voiceGlyphRecording: {
    color: C.err,
  },
  voiceBtnDisabled: {
    opacity: 0.4,
  },
  webBtnPressed: {
    backgroundColor: C.accentHover,
  },
  webBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
});
