import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
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
import { getAuthToken } from "../coolie";

type WebViewLike = React.ComponentType<any>;
const SafeWebView = WebView as unknown as WebViewLike;

interface WebContainerScreenProps {
  initialPath?: string;
  initialUrl?: string;
  title?: string;
  onBack: () => void;
}

import {
  I18N_PATCH_INJECTION,
  ZH_CN_ENSURE,
  ZH_CN_INJECTION,
} from "../utils/i18nPatch";

/**
 * 全功能 Web 容器 (WebContainerScreen)。
 *
 * 将 Web 控制台 (https://www.xrobinai.cn/XROA/...) 直接无缝接入 Expo 移动端：
 * - 共享 Cookie 与登录态，免二次登录；
 * - 完整的导航控制器 (历史前进后退、刷新、外部浏览器兜底)；
 * - 物理返回键与滑动手势自动拦截处理；
 * - 顶部线性进度条与暗色 Linear 风格融合。
 */
export function WebContainerScreen({
  initialPath,
  initialUrl,
  title = "Coolie Web",
  onBack,
}: WebContainerScreenProps) {
  const webViewRef = useRef<any>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [pageTitle, setPageTitle] = useState<string>(title);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Wave 80 — pull the App's session token from SecureStore once per mount.
  // `tokenReady` gates the WebView render: without it, the first navigation
  // would race against the SecureStore read and load the plain landing URL
  // before the bridge URL had a chance to attach. Resolving first means the
  // WebView only ever makes one navigation, with the bridge redirect chain
  // (`/api/auth/exchange` → 302 → landing page) baked in.
  const [tokenReady, setTokenReady] = useState(false);
  const [exchangeToken, setExchangeToken] = useState<string | null>(null);

  // 拼接 ?shell=native 让 Web 端也能通过 URL 参数检测原生壳
  const baseUrl = initialUrl
    ? initialUrl
    : initialPath
      ? `${COOLIE_WEB_URL}${initialPath.startsWith("/") ? "" : "/"}${initialPath}`
      : COOLIE_WEB_URL;
  const withShell = (url: string) =>
    url.includes("?") ? `${url}&shell=native` : `${url}?shell=native`;

  // Wave 80 — pull the App's session token from SecureStore once per mount.
  // The token is replayed into the WebView's cookie jar on the very first
  // navigation by loading `/api/auth/exchange?token=<...>&next=<baseUrl>`;
  // the bridge 302s to the landing page with `Set-Cookie` attached, and the
  // WebView follows the redirect with the cookie already in its jar.
  useEffect(() => {
    let cancelled = false;
    void getAuthToken().then((token) => {
      if (cancelled) return;
      setExchangeToken(token ?? null);
      setTokenReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const bridgeUrl = exchangeToken
    ? `${COOLIE_WEB_URL.replace(/\/+$/, "")}/api/auth/exchange?token=${encodeURIComponent(exchangeToken)}&next=${encodeURIComponent(baseUrl)}`
    : null;
  const targetUrl = tokenReady
    ? bridgeUrl
      ? withShell(bridgeUrl)
      : withShell(baseUrl)
    : null;

  // 物理返回键拦截：若 WebView 可后退则在页面内后退，否则退出容器
  useEffect(() => {
    const onHardwareBack = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      onBack();
      return true;
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
    return () => sub.remove();
  }, [canGoBack, onBack]);

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
    setCanGoForward(navState.canGoForward);
    setCurrentUrl(navState.url);
    if (navState.title && !navState.title.includes("http")) {
      setPageTitle(navState.title);
    }
  }, []);

  const handleReload = () => {
    setError(null);
    setLoading(true);
    if (webViewRef.current) {
      webViewRef.current.reload();
    } else {
      setReloadKey((k) => k + 1);
    }
  };

  const handleOpenExternal = () => {
    const urlToOpen = currentUrl || targetUrl || baseUrl;
    Linking.openURL(urlToOpen).catch(() => {
      Alert.alert("无法打开外部浏览器", urlToOpen);
    });
  };

  const handleBackPress = () => {
    if (canGoBack && webViewRef.current) {
      webViewRef.current.goBack();
    } else {
      onBack();
    }
  };

  return (
    <SafeAreaView
      style={[
        styles.screen,
        { paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0 },
      ]}
    >
      <StatusBar style="light" />

      {/* 原生控制栏 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable
            style={styles.headerBtn}
            onPress={handleBackPress}
            hitSlop={8}
            accessibilityLabel="返回"
          >
            <Ionicons name="chevron-back" size={20} color={C.ink} />
            <Text style={styles.headerBtnText}>返回</Text>
          </Pressable>

          <Pressable
            style={styles.closeBtn}
            onPress={onBack}
            hitSlop={8}
            accessibilityLabel="直接退出容器"
          >
            <Ionicons name="close" size={18} color={C.ink3} />
          </Pressable>
        </View>

        <View style={styles.titleWrap}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }}>
            <CoolieLogo size={15} />
            <Text style={styles.headerTitle} numberOfLines={1}>
              {pageTitle}
            </Text>
          </View>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {currentUrl ? currentUrl.replace(/^https?:\/\//, "") : "xrobinai.cn/XROA"}
          </Text>
        </View>

        <View style={styles.headerRight}>
          <Pressable
            style={[styles.actionBtn, !canGoForward && styles.btnDisabled]}
            disabled={!canGoForward}
            onPress={() => webViewRef.current?.goForward()}
            hitSlop={8}
            accessibilityLabel="前进"
          >
            <Ionicons
              name="chevron-forward"
              size={18}
              color={canGoForward ? C.ink2 : C.ink4}
            />
          </Pressable>

          <Pressable
            style={styles.actionBtn}
            onPress={handleReload}
            hitSlop={8}
            accessibilityLabel="刷新"
          >
            <Ionicons name="refresh-outline" size={18} color={C.ink2} />
          </Pressable>

          <Pressable
            style={styles.actionBtn}
            onPress={handleOpenExternal}
            hitSlop={8}
            accessibilityLabel="用浏览器打开"
          >
            <Ionicons name="open-outline" size={18} color={C.accent} />
          </Pressable>
        </View>

        {/* 顶部加载进度条 */}
        {loading && progress < 1 ? (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressBar,
                { width: `${Math.max(progress * 100, 15)}%` },
              ]}
            />
          </View>
        ) : null}
      </View>

      {/* WebView 内容主体 */}
      <View style={styles.body}>
        {targetUrl ? (
          <SafeWebView
            ref={webViewRef}
            key={reloadKey}
            source={{ uri: targetUrl }}
            style={styles.webview}
            originWhitelist={["*"]}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
            mixedContentMode="compatibility"
            allowsBackForwardNavigationGestures={true}
            injectedJavaScriptBeforeContentLoaded={ZH_CN_INJECTION + I18N_PATCH_INJECTION}
            injectedJavaScript={ZH_CN_ENSURE + I18N_PATCH_INJECTION}
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
              setError(e?.nativeEvent?.description || "页面加载失败");
            }}
            onHttpError={(e: { nativeEvent?: { statusCode?: number } }) => {
              setLoading(false);
              setError(`HTTP ${e?.nativeEvent?.statusCode ?? "错误"}`);
            }}
          />
        ) : (
          <View style={styles.centerOverlay}>
            <ActivityIndicator size="small" color={C.accent} />
            <Text style={styles.overlayText}>正在准备 Web 容器…</Text>
          </View>
        )}

        {loading && !error && progress < 0.3 ? (
          <View style={styles.centerOverlay} pointerEvents="none">
            <ActivityIndicator size="small" color={C.accent} />
            <Text style={styles.overlayText}>正在同步 Web 实时工作台…</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.centerOverlay}>
            <Ionicons name="alert-circle-outline" size={32} color={C.err} />
            <Text style={styles.errorTitle}>无法加载 Web 页面</Text>
            <Text style={styles.errorSubtitle}>{error}</Text>
            <View style={styles.errorActions}>
              <Pressable style={styles.retryBtn} onPress={handleReload}>
                <Text style={styles.retryBtnText}>重新加载</Text>
              </Pressable>
              <Pressable style={styles.externalBtn} onPress={handleOpenExternal}>
                <Text style={styles.externalBtnText}>外部浏览器打开</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingHorizontal: 10,
    position: "relative",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  headerBtnText: {
    fontSize: 14,
    color: C.ink,
    fontWeight: "500",
  },
  closeBtn: {
    padding: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  titleWrap: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink,
  },
  headerSubtitle: {
    fontSize: 10,
    color: C.ink4,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  actionBtn: {
    padding: 7,
    borderRadius: RADIUS.sm,
  },
  btnDisabled: {
    opacity: 0.3,
  },
  progressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "transparent",
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
    padding: 24,
    gap: 10,
  },
  overlayText: {
    fontSize: 13,
    color: C.ink3,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: C.ink,
    marginTop: 4,
  },
  errorSubtitle: {
    fontSize: 12,
    color: C.ink3,
    textAlign: "center",
    maxWidth: 260,
  },
  errorActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  retryBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
  },
  externalBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
  },
  externalBtnText: {
    color: C.ink2,
    fontSize: 13,
  },
});
