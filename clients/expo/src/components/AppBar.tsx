import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { openCoolieWeb } from "../utils/openCoolieWeb";
import { CoolieWebFallback } from "./CoolieWebFallback";

/**
 * 全局顶栏 — 对齐 Coolie Web (clients/expo-paperclip-web) 的原生 appBar:
 * 中间标题 "Coolie工坊", 右侧 [驾驶舱Web] 按钮跳 coolieweb:// 深链。
 *
 * wave73 (boss 26:32 OOB 「左上角工坊 驱动5角色员工 这些描述都不要了」+ 26:35 OOB
 * 「顶部中间标题留着 / 对话框中的去掉」):
 * - AppBar 左侧原本就没有标题, 只剩 icon 组 (通知 + 搜索)
 * - **中间标题 "Coolie工坊" 保留** (boss 26:35)
 * - 删的是 ChatHeader 对话框标题 + 底部"驱动 5 角色员工"描述 (那两个归 ChatHeader /
 *   BoardChatScreen, 不归 AppBar)
 *
 * [驾驶舱Web] 是**智能路由** (wave40 方案 B, boss 09-22 23:59 选 B):
 * 装了 Coolie Web → 深链拉起 (原行为); 没装 → 内置 webview 兜底加载
 * https://www.xrobinai.cn/XROA (CoolieWebFallback), 不再只弹「未安装」。
 *
 * 左侧留空 (驾驶舱没有 web 后退, 不渲染 ←); 通知铃铛 + 全局搜索仍放左侧,
 * 因为它们原先只挂在旧 topBar 上, 去掉会丢掉两个入口 (通知中心 / 全局搜索)。
 *
 * ⚠️ 图标字体: 装机包里 `@expo/vector-icons` 的字形画不出来 (0.5.6 起实测整排
 * Ionicons 都是空白, 见 wave18 记录)。icon 暂维持原样, 待单独修字体。
 */
export function AppBar({
  // wave73 — 中间标题固定显示 "Coolie工坊"; `title` prop 仍保留以兼容旧调用方,
  // 但当前不接传入值, 默认写死品牌名
  title: _title,
  unreadCount = 0,
  onOpenNotifications,
  onOpenSearch,
  onOpenWebWorkbench,
}: {
  title?: string;
  unreadCount?: number;
  onOpenNotifications?: () => void;
  onOpenSearch?: () => void;
  onOpenWebWorkbench?: () => void;
}) {
  /** 本机没装 Coolie Web 时, 打开内置 webview 兜底 (见 CoolieWebFallback)。 */
  const [webFallbackOpen, setWebFallbackOpen] = useState(false);

  return (
    <>
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

        {/* wave73 — 中间标题保留 (boss 26:35 「顶部中间标题留着」) */}
        <Text style={styles.title} numberOfLines={1}>
          Coolie工坊
        </Text>

        <View style={[styles.side, styles.sideRight]}>
          <Pressable
            onPress={() => {
              if (onOpenWebWorkbench) {
                onOpenWebWorkbench();
              } else {
                void openCoolieWeb().then((opened) => {
                  if (!opened) setWebFallbackOpen(true);
                });
              }
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.webBtn, pressed && styles.webBtnPressed]}
          >
            <Text style={styles.webBtnText}>Web全功能</Text>
          </Pressable>
        </View>
      </View>

      {/* 没装 Coolie Web 时的兜底: 整屏 webview 加载远端 Coolie Web */}
      <CoolieWebFallback
        visible={webFallbackOpen}
        onClose={() => setWebFallbackOpen(false)}
      />
    </>
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
  // wave73 — 标题样式 (boss 26:35 「顶部中间标题留着」)
  title: {
    flex: 1,
    color: C.ink,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  webBtn: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
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
