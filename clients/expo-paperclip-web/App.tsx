import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { WebView, type WebViewNavigation } from "react-native-webview";

/**
 * react-native-webview@14 的根 `index.d.ts` 把组件声明成
 * `class WebView<P = undefined> extends Component<WebViewProps & P>`；P 默认到
 * undefined，于是 `WebViewProps & undefined` 直接塌成 `never`，任何 `<WebView/>`
 * JSX 都会报 20+ 条 overload（`tsc --noEmit` 实测）。clients/expo 也是靠同一次
 * cast 绕开的（见 src/components/board-inline/InlinePreviewPanel.tsx 的 SafeWebView）。
 * 事件类型用宽松的本地结构类型，避免再 import `lib/WebViewTypes` 造出第二条模块身份。
 */
type WebViewLike = React.ComponentType<any>;
const SafeWebView = WebView as unknown as WebViewLike;

type WebViewErrorEvent = { nativeEvent?: { description?: string } };
type WebViewLoadProgressEvent = { nativeEvent: { progress?: number } };

/**
 * Coolie Web — paperclip PC web 的 native 壳。
 *
 * 老板决策 (wave 9)：把 `https://www.xrobinai.cn/XROA` 完整 PC web 直接包成
 * 一个单屏 App，与现有 Coolie 驾驶舱 (cloud.coolie.app) 并存 (本包
 * cloud.coolie.app.web)。App 自身不做登录 —— 登录、cookie、sessionStorage
 * 全部是 web 站自己的事，壳只提供 返回/刷新/前进 + 地址显示。
 */

/** 目标站点：paperclip 上游完整 PC web (会议室 / Agent Feed / 12 项导航)。 */
const PAPERCLIP_WEB_URL = "https://www.xrobinai.cn/XROA";

/**
 * 老板 (2026-09-21 反馈)：Coolie Web 装机后 web UI 默认英文。
 * paperclip 上游 i18n 通过 `localStorage.coolie.locale` 决定语言。
 * 在页面脚本执行前注入 zh-CN localStorage + 全局钩子，让 i18next 立刻取中文 bundle。
 * 同时设置 `document.documentElement.lang` 让无障碍 / 浏览器提示也对。
 */
const ZH_CN_INJECTION = `
try {
  window.__COOLIE_DEFAULT_LOCALE__ = "zh-CN";
  localStorage.setItem("coolie.locale", "zh-CN");
  document.documentElement.lang = "zh-CN";
} catch (e) {}
`;

/** 驾驶舱 App 的深链 scheme (cloud.coolie.app，见 clients/expo/app.json)。 */
const COCKPIT_DEEP_LINK = "coolie://";

/**
 * 与驾驶舱 App 同一套 Linear 风格配色 (近黑三档背景 / 四级文字亮度 /
 * 品牌紫蓝 CTA)。这里是独立包，不依赖 clients/expo 的 token 模块。
 */
const C = {
  bg: "#08090A",
  panel: "#0F1011",
  surface: "#191A1B",
  ink: "#E6E6E6",
  ink2: "#9BA1A6",
  ink3: "#8A8F98",
  line: "rgba(255,255,255,0.08)",
  lineSubtle: "rgba(255,255,255,0.06)",
  accent: "#5E6AD2",
  err: "#EF4444",
};

type ToolbarButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  badge?: boolean;
};

function ToolbarButton({ label, onPress, disabled }: ToolbarButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.toolbarBtn,
        disabled && styles.toolbarBtnDisabled,
        pressed && !disabled && styles.toolbarBtnPressed,
      ]}
    >
      <Text style={[styles.toolbarBtnText, disabled && styles.toolbarBtnTextDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function App() {
  const webRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(PAPERCLIP_WEB_URL);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 递增后作为 WebView 的 key，强制重挂载以重试加载。 */
  const [reloadNonce, setReloadNonce] = useState(0);

  const goBack = useCallback(() => {
    webRef.current?.goBack();
  }, []);

  const goForward = useCallback(() => {
    webRef.current?.goForward();
  }, []);

  const reload = useCallback(() => {
    setLoadError(null);
    setLoading(true);
    webRef.current?.reload();
  }, []);

  /** 弱网/加载失败时清空错误并重挂载，等价于重新进入站点。 */
  const retryFromScratch = useCallback(() => {
    setLoadError(null);
    setLoading(true);
    setReloadNonce((n) => n + 1);
  }, []);

  const openCockpit = useCallback(async () => {
    try {
      const supported = await Linking.canOpenURL(COCKPIT_DEEP_LINK);
      if (!supported) {
        Alert.alert(
          "未安装 Coolie 驾驶舱",
          "本机没有安装 cloud.coolie.app（Coolie 驾驶舱）。",
        );
        return;
      }
      await Linking.openURL(COCKPIT_DEEP_LINK);
    } catch (e) {
      Alert.alert("打开失败", String((e as Error)?.message ?? e));
    }
  }, []);

  // Android 物理返回键：优先在 WebView 历史里后退，退无可退才交给系统退出。
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  const onNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    setCanGoBack(nav.canGoBack);
    setCanGoForward(nav.canGoForward);
    if (nav.url) setCurrentUrl(nav.url);
  }, []);

  const onLoadStart = useCallback(() => {
    setLoading(true);
    setLoadError(null);
  }, []);

  const onLoadEnd = useCallback(() => {
    setLoading(false);
  }, []);

  const onError = useCallback((event: WebViewErrorEvent) => {
    setLoading(false);
    setLoadError(event?.nativeEvent?.description ?? "页面加载失败");
  }, []);

  const displayUrl = useMemo(
    () => currentUrl.replace(/^https?:\/\//, ""),
    [currentUrl],
  );

  return (
    <SafeAreaView
      style={[
        styles.shell,
        { paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0 },
      ]}
    >
      <StatusBar style="light" />

      {/* 老板 (2026-09-21) 反馈：顶部 toolbar 看起来像浏览器不像 App, 改成原生 appBar: ← 标题 → [驾驶舱]。URL box 和 ⟳ 按钮去掉 (隐去浏览器特征)。*/}
      <View style={styles.appBar}>
        <Pressable
          onPress={goBack}
          disabled={!canGoBack}
          hitSlop={8}
          style={({ pressed }) => [
            styles.navBtn,
            !canGoBack && styles.navBtnDisabled,
            pressed && canGoBack && styles.navBtnPressed,
          ]}
        >
          <Text style={[styles.navBtnText, !canGoBack && styles.navBtnTextDisabled]}>←</Text>
        </Pressable>
        <Text style={styles.appBarTitle}>Coolie Web</Text>
        <Pressable
          onPress={() => void openCockpit()}
          hitSlop={8}
          style={({ pressed }) => [styles.cockpitBtn, pressed && styles.toolbarBtnPressed]}
        >
          <Text style={styles.cockpitBtnText}>驾驶舱</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressBar,
              { width: `${Math.max(progress * 100, 4)}%` as unknown as number },
            ]}
          />
        </View>
      ) : null}

      <View style={styles.content}>
        <SafeWebView
          key={reloadNonce}
          ref={webRef}
          source={{ uri: PAPERCLIP_WEB_URL }}
          style={styles.webview}
          // —— wave 9 spec §3.5 配置 ——
          // 老板 (2026-09-21) 要求默认中文：页面脚本执行前注入 zh-CN locale
          injectedJavaScriptBeforeContentLoaded={ZH_CN_INJECTION}
          mixedContentMode="compatibility"
          allowsBackForwardNavigationGestures
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess={false}
          // 第三方登录偶发重定向，开 cookie 共享保证 sessionStorage/cookie 生效。
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          setSupportMultipleWindows={false}
          // —— 状态回调 ——
          onNavigationStateChange={onNavigationStateChange}
          onLoadStart={onLoadStart}
          onLoadEnd={onLoadEnd}
          onHttpError={onError}
          onError={onError}
          onLoadProgress={(e: WebViewLoadProgressEvent) => {
            const p = e?.nativeEvent?.progress;
            if (typeof p === "number" && Number.isFinite(p)) setProgress(p);
          }}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={C.accent} />
              <Text style={styles.loadingText}>正在载入 Paperclip…</Text>
            </View>
          )}
        />

        {loadError ? (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorTitle}>页面加载失败</Text>
            <Text style={styles.errorBody}>{loadError}</Text>
            <Pressable style={styles.retryBtn} onPress={retryFromScratch}>
              <Text style={styles.retryBtnText}>重试</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: C.bg,
  },
  // 老板 (2026-09-21) 要求：去掉浏览器样 toolbar, 换成原生 appBar（标题 + 右侧驾驶舱按钮）
  appBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
    backgroundColor: C.panel,
  },
  appBarTitle: {
    color: C.ink,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  navBtn: {
    minWidth: 36,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: C.line,
  },
  navBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  navBtnDisabled: {
    opacity: 0.35,
  },
  navBtnText: {
    color: C.ink,
    fontSize: 18,
    fontWeight: "500",
  },
  navBtnTextDisabled: {
    color: C.ink3,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
    backgroundColor: C.panel,
  },
  toolbarBtn: {
    minWidth: 34,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: C.line,
  },
  toolbarBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  toolbarBtnDisabled: {
    opacity: 0.35,
  },
  toolbarBtnText: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "500",
  },
  toolbarBtnTextDisabled: {
    color: C.ink3,
  },
  urlBox: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    paddingHorizontal: 10,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: C.line,
  },
  urlText: {
    color: C.ink3,
    fontSize: 12,
  },
  cockpitBtn: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
  },
  cockpitBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  progressTrack: {
    height: 2,
    backgroundColor: "transparent",
  },
  progressBar: {
    height: 2,
    backgroundColor: C.accent,
  },
  content: {
    flex: 1,
    backgroundColor: C.bg,
  },
  webview: {
    flex: 1,
    backgroundColor: C.bg,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: C.bg,
  },
  loadingText: {
    color: C.ink3,
    fontSize: 13,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 32,
    backgroundColor: C.bg,
  },
  errorTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  errorBody: {
    color: C.ink3,
    fontSize: 13,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: C.accent,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
