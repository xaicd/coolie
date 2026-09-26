import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { C } from "../theme";
import { COOLIE_WEB_URL } from "../utils/openCoolieWeb";
import { RADIUS, SPACING } from "../ui/tokens";
import { CoolieLogo } from "../components/CoolieLogo";
import {
  coolie,
  getSessionUser,
  saveAuthToken,
  saveSessionToken,
  type Credential,
} from "../coolie";
import {
  I18N_PATCH_INJECTION,
  ZH_CN_ENSURE,
  ZH_CN_INJECTION,
} from "../utils/i18nPatch";

type WebViewLike = React.ComponentType<any>;
const SafeWebView = WebView as unknown as WebViewLike;

interface WebLoginScreenProps {
  onSignedIn: (credential: Credential) => void;
  onFallbackNative?: () => void;
}

const INJECTED_SESSION_PROBER = `
(function() {
  var sent = false;
  function probeSession() {
    if (sent) return;
    fetch('/api/auth/session-token')
      .then(function(res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function(data) {
        if (data && data.token && !sent) {
          sent = true;
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'WEB_LOGIN_SUCCESS',
              token: data.token
            }));
          }
        }
      })
      .catch(function() {});
  }
  setInterval(probeSession, 1200);
  probeSession();
})();
true;
`;

/**
 * 原生 APP Web 全功能统一登录屏 (WebLoginScreen)。
 *
 * 直接复用 Web 控制台统一登录流程 (/auth)：
 * - 登录 Cookie 直接进入移动端内置 WebView cookie jar，彻底解决二次输入密码问题；
 * - 登录成功后，脚本自动回传 session-token 给原生客户端，实现原生与 Web 登录态 100% 共享；
 * - 提供随时切换原生表单 / API Key 登录的兜底入口。
 */
export function WebLoginScreen({ onSignedIn, onFallbackNative }: WebLoginScreenProps) {
  const webViewRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loginUrl = `${COOLIE_WEB_URL.replace(/\/+$/, "")}/auth?shell=native`;

  const handleMessage = useCallback(
    async (event: { nativeEvent: { data: string } }) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data);
        if (payload?.type === "WEB_LOGIN_SUCCESS" && payload.token) {
          const token = String(payload.token).trim();
          await saveSessionToken(token);
          await saveAuthToken(token);

          // 尝试通过 session 加载用户信息
          let user = await getSessionUser();
          if (!user) {
            try {
              const res = await coolie.getSession();
              if (res?.user) user = res.user;
            } catch {
              // Best-effort
            }
          }

          if (user) {
            onSignedIn({ kind: "session", user });
          } else {
            // 兜底进入已登录态
            onSignedIn({
              kind: "session",
              user: {
                id: "current-user",
                email: "user@coolie.internal",
                name: "已登录用户",
              },
            });
          }
        }
      } catch (err) {
        console.warn("[web-login] parse message error:", err);
      }
    },
    [onSignedIn],
  );

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    const url = navState.url || "";
    // 如果 URL 已经不在 auth / login 页面，说明已完成登录跳转
    if (
      !url.includes("/auth") &&
      !url.includes("/login") &&
      (url.includes("/dashboard") ||
        url.includes("/companies") ||
        url.includes("/projects") ||
        url.includes("/issues") ||
        url.endsWith("/XROA") ||
        url.endsWith("/XROA/"))
    ) {
      webViewRef.current?.injectJavaScript(INJECTED_SESSION_PROBER);
    }
  }, []);

  return (
    <SafeAreaView
      style={[
        styles.container,
        { paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0 },
      ]}
    >
      <StatusBar style="light" />

      {/* 顶部标题栏 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <CoolieLogo size={22} style={{ marginRight: 6 }} />
          <View>
            <Text style={styles.headerTitle}>Coolie 统一登录</Text>
            <Text style={styles.headerSubtitle}>Web 全功能认证 · 登录态免密共享</Text>
          </View>
        </View>

        {onFallbackNative ? (
          <Pressable
            style={({ pressed }) => [styles.switchBtn, pressed && styles.switchBtnPressed]}
            onPress={onFallbackNative}
            hitSlop={8}
            accessibilityLabel="切换到原生表单或 Key 登录"
          >
            <Ionicons name="key-outline" size={13} color={C.accent} style={{ marginRight: 3 }} />
            <Text style={styles.switchBtnText}>Key/表单登录</Text>
          </Pressable>
        ) : null}
      </View>

      {/* 顶部线性加载进度条 */}
      {loading && progress < 1 ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${Math.max(progress * 100, 15)}%` }]} />
        </View>
      ) : null}

      {/* 网页容器 */}
      <View style={styles.body}>
        <SafeWebView
          ref={webViewRef}
          key={reloadKey}
          source={{ uri: loginUrl }}
          style={styles.webview}
          originWhitelist={["*"]}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          mixedContentMode="compatibility"
          allowsBackForwardNavigationGestures={true}
          injectedJavaScriptBeforeContentLoaded={ZH_CN_INJECTION + I18N_PATCH_INJECTION}
          injectedJavaScript={ZH_CN_ENSURE + I18N_PATCH_INJECTION + INJECTED_SESSION_PROBER}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadStart={() => {
            setLoading(true);
            setError(null);
          }}
          onLoadProgress={(e: { nativeEvent: { progress: number } }) => {
            setProgress(e.nativeEvent.progress);
          }}
          onLoadEnd={() => {
            setLoading(false);
          }}
          onError={(e: { nativeEvent?: { description?: string } }) => {
            setLoading(false);
            setError(e?.nativeEvent?.description || "登录页加载失败，请检查网络连接");
          }}
          onHttpError={(e: { nativeEvent?: { statusCode?: number } }) => {
            setLoading(false);
            setError(`HTTP ${e?.nativeEvent?.statusCode ?? "错误"}`);
          }}
        />

        {loading && !error && progress < 0.3 ? (
          <View style={styles.centerOverlay} pointerEvents="none">
            <ActivityIndicator size="small" color={C.accent} />
            <Text style={styles.overlayText}>正在载入 Web 统一登录…</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorOverlay}>
            <Ionicons name="cloud-offline-outline" size={32} color={C.err} />
            <Text style={styles.errorTitle}>加载遇到问题</Text>
            <Text style={styles.errorSubtitle}>{error}</Text>
            <View style={styles.errorActions}>
              <Pressable
                style={styles.retryBtn}
                onPress={() => {
                  setError(null);
                  setReloadKey((k) => k + 1);
                }}
              >
                <Ionicons name="refresh" size={14} color="#FFF" style={{ marginRight: 4 }} />
                <Text style={styles.retryBtnText}>重新加载</Text>
              </Pressable>
              {onFallbackNative ? (
                <Pressable style={styles.fallbackBtn} onPress={onFallbackNative}>
                  <Text style={styles.fallbackBtnText}>使用原生表单登录</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
  },
  headerSubtitle: {
    fontSize: 10,
    color: C.ink3,
    marginTop: 1,
  },
  switchBtn: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(94, 106, 210, 0.3)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  switchBtnPressed: {
    backgroundColor: "rgba(94, 106, 210, 0.2)",
  },
  switchBtnText: {
    fontSize: 11,
    fontWeight: "500",
    color: C.accent,
  },
  progressTrack: {
    height: 2,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    width: "100%",
  },
  progressBar: {
    height: "100%",
    backgroundColor: C.accent,
  },
  body: {
    flex: 1,
    position: "relative",
    backgroundColor: C.bg,
  },
  webview: {
    flex: 1,
    backgroundColor: C.bg,
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  overlayText: {
    fontSize: 12,
    color: C.ink3,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
    gap: 8,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: C.ink,
    marginTop: 4,
  },
  errorSubtitle: {
    fontSize: 12,
    color: C.ink3,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 8,
  },
  errorActions: {
    flexDirection: "row",
    gap: 12,
  },
  retryBtn: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: RADIUS.sm,
    backgroundColor: C.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  fallbackBtn: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackBtnText: {
    fontSize: 13,
    fontWeight: "500",
    color: C.ink2,
  },
});
