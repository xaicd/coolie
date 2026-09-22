import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { C } from "../theme";
import {
  COOLIE_WEB_APK_URL,
  COOLIE_WEB_URL,
} from "../utils/openCoolieWeb";

/** WebView 事件类型取自 RN 结构化子集, 避免依赖库内部类型名 (同 CodeViewerWebView)。 */
const SafeWebView = WebView as unknown as React.ComponentType<any>;

/**
 * 「本机没装 Coolie Web」时的内置网页兜底 (wave40 方案 B, boss 09-22 23:59 选 B)。
 *
 * 老板装 Coolie工坊 但没装独立 Coolie Web 时, [驾驶舱Web] 原先只弹一句「未安装」
 * 就断了。这里改成整屏 webview 直接加载远端完整 PC web (`COOLIE_WEB_URL`), 让驾驶舱
 * Web 入口在任何机器上都可用; 顶部给一个 [安装独立] 引导去下 Coolie Web APK ——
 * **只引导, 不静默强装** (wave40 约束)。
 *
 * WebView 那几个开关 (originWhitelist / domStorage / cookie) 与
 * board-inline/InlinePreviewPanel 一致: paperclip web 靠 localStorage + cookie 保登录态。
 */
export function CoolieWebFallback({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 重试 = 换 key 重挂 WebView (与 InlinePreviewPanel 同一手法)
  const [reloadKey, setReloadKey] = useState(0);

  const retry = () => {
    setError(null);
    setLoading(true);
    setReloadKey((value) => value + 1);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>驾驶舱Web</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              本机未装 Coolie Web · 内置网页兜底
            </Text>
          </View>
          <Pressable
            onPress={() =>
              void Linking.openURL(COOLIE_WEB_APK_URL).catch(() =>
                // 本机没有浏览器时至少把直链亮出来, 不让按钮「点了没反应」
                Alert.alert("无法打开下载页", COOLIE_WEB_APK_URL),
              )
            }
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="安装独立 Coolie Web"
            style={({ pressed }) => [styles.installBtn, pressed && styles.installBtnPressed]}
          >
            <Text style={styles.installBtnText}>安装独立</Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="关闭"
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={20} color={C.ink3} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <SafeWebView
            key={reloadKey}
            source={{ uri: COOLIE_WEB_URL }}
            style={styles.webview}
            originWhitelist={["*"]}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
            onLoadStart={() => {
              setLoading(true);
              setError(null);
            }}
            onLoadEnd={() => setLoading(false)}
            onError={(event: { nativeEvent?: { description?: string } }) => {
              setLoading(false);
              setError(event?.nativeEvent?.description || "页面加载失败");
            }}
            onHttpError={(event: { nativeEvent?: { statusCode?: number } }) => {
              setLoading(false);
              setError(`HTTP ${event?.nativeEvent?.statusCode ?? "错误"}`);
            }}
          />
          {loading && !error ? (
            <View style={styles.overlay} pointerEvents="none">
              <ActivityIndicator size="small" color={C.accent} />
              <Text style={styles.overlayText}>加载 Coolie Web…</Text>
            </View>
          ) : null}
          {error ? (
            <View style={styles.overlay}>
              <Ionicons name="alert-circle-outline" size={22} color={C.err} />
              <Text style={styles.overlayText}>{error}</Text>
              <Pressable style={styles.retryBtn} onPress={retry}>
                <Text style={styles.retryBtnText}>重试</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  subtitle: {
    color: C.ink4,
    fontSize: 11,
    marginTop: 2,
  },
  installBtn: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.brand,
  },
  installBtnPressed: {
    backgroundColor: C.accentHover,
  },
  installBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  closeBtn: {
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    backgroundColor: C.bg,
  },
  webview: {
    flex: 1,
    backgroundColor: C.bg,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: C.bg,
  },
  overlayText: {
    color: C.ink3,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  retryBtn: {
    marginTop: 4,
    backgroundColor: C.brand,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
});
