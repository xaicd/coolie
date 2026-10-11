import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { CoolieLogo } from "./CoolieLogo";
import { useNotificationsStore } from "../stores/notifications";

/**
 * 全局顶栏 — Linear 暗黑设计系统风格：
 * - 左侧/居中品牌 Logo 与标题 "Coolie工坊"
 * - 右侧聚焦高频原生操作：[🔍 全局搜索]、[🔔 收件箱通知] 与 [⚙️ 设置]
 * - 彻底移除冗余生硬的独立 Web 按钮，还给用户纯净高质感界面
 */
export function AppBar({
  title = "Coolie工坊",
  unreadCount: unreadCountProp,
  onOpenNotifications,
  onOpenSearch,
  onOpenSettings,
}: {
  title?: string;
  /** @deprecated read live from `useNotificationsStore` so the badge updates
   *  the moment `markRead`/`markAllRead` mutates the store. Kept for callers
   *  that still pass a number; falls back to the live store value. */
  unreadCount?: number;
  onOpenNotifications?: () => void;
  onOpenSearch?: () => void;
  onOpenSettings?: () => void;
}) {
  const storeUnread = useNotificationsStore((s) => s.unreadCount);
  const unread = unreadCountProp ?? storeUnread;
  return (
    <View style={styles.bar}>
      <View style={styles.titleContainer}>
        <CoolieLogo size={20} style={styles.titleLogo} />
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>

      <View style={[styles.side, styles.sideRight]}>
        {onOpenSearch ? (
          <Pressable style={styles.iconBtn} hitSlop={10} onPress={onOpenSearch}>
            <Ionicons name="search-outline" size={20} color={C.ink2} />
          </Pressable>
        ) : null}
        {onOpenNotifications ? (
          <Pressable
            testID="AppBar__Bell__ClearBtn"
            style={styles.iconBtn}
            hitSlop={10}
            onPress={onOpenNotifications}
            onLongPress={() => {
              if (unread <= 0) return;
              Alert.alert(
                "清空所有未读",
                `当前 ${unread} 条未读消息, 全部标记为已读?`,
                [
                  { text: "取消", style: "cancel" },
                  {
                    text: "清空",
                    style: "destructive",
                    onPress: () => {
                      void useNotificationsStore.getState().markAllRead();
                    },
                  },
                ],
              );
            }}
          >
            <Ionicons name="notifications-outline" size={20} color={C.ink2} />
            {unread > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unread > 99 ? "99+" : unread}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
        {onOpenSettings ? (
          <Pressable
            testID="AppBar__Settings__OpenBtn"
            style={styles.iconBtn}
            hitSlop={10}
            onPress={onOpenSettings}
          >
            <Ionicons name="settings-outline" size={20} color={C.ink2} />
          </Pressable>
        ) : null}
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
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  titleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  titleLogo: {
    borderRadius: 4,
  },
  title: {
    color: C.ink,
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
