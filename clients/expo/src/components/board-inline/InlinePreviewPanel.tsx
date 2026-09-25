/**
 * 对话内嵌预览面板 (RN 原生)
 *
 * 抄 DigitalStaff 的两块意图:
 * - PreviewPanel.tsx (100 行): URL + Image 两种 case 的预览面板
 * - 那份 414 行的 iframe 预览组件: 加载遮罩 / 失败遮罩 / 重试 —— 但**只借它的状态机**,
 *   不搬它的 VSCode 嵌入 (手机跑不动, 老板已否决, 也不在本目录留任何引用)
 *
 * 双路:
 * - url      非空 → react-native-webview 加载, 带加载/失败/重试
 * - imageUrl 非空 → expo-image 渲染缩略图, 点开全屏大图
 * - 两者都给 → 图片优先 (缩略图比一个加载不出来的网页确定性强)
 *
 * 凭据注入: 手机上没有浏览器 cookie jar 可借 (未安装 @react-native-cookies/cookies),
 * 改用本机已有的 SecureStore bearer token (coolie.getAuthToken) 塞进 WebView 请求头,
 * 同时打开 sharedCookiesEnabled 让平台自带的 cookie 容器参与 —— 等价于 web 端
 * 的"带 cookie 的 iframe"。
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { WebView } from "react-native-webview";
import { C, getAuthToken } from "../../coolie";
import { RADIUS, SPACING } from "../../ui/tokens";
import { PreviewToolbar } from "./PreviewToolbar";
import { showExternalAppChooser } from "../../utils/openExternalApp";

/** WebView 事件类型在 RN 端是结构化的; 取其子集即可, 避免依赖内部类型名 */
type WebViewLike = React.ComponentType<any>;
const SafeWebView = WebView as unknown as WebViewLike;

export interface InlinePreviewPanelProps {
  /** 网页预览地址 */
  url?: string;
  /** 图片预览地址 */
  imageUrl?: string;
  /** 工具条标题 */
  title?: string;
  /** 外部注入的全屏行为; 缺省时用本组件内置的全屏 Modal */
  onFullscreen?: () => void;
  /** 外部注入的外链行为; 缺省时用系统浏览器打开 */
  onExternal?: () => void;
  /** 紧凑模式: 给对话气泡内用, 固定高度 */
  compact?: boolean;
}

export function InlinePreviewPanel({
  url,
  imageUrl,
  title,
  onFullscreen,
  onExternal,
  compact = true,
}: InlinePreviewPanelProps) {
  const [authHeader, setAuthHeader] = useState<Record<string, string> | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const hasImage = Boolean(imageUrl);
  const hasUrl = Boolean(url);

  // 拉一次 bearer token; 拿不到也照常渲染 (公开页面 / cookie 会话)
  useEffect(() => {
    let cancelled = false;
    void getAuthToken()
      .then((token) => {
        if (cancelled) return;
        setAuthHeader(token ? { Authorization: `Bearer ${token}` } : undefined);
      })
      .catch(() => {
        if (!cancelled) setAuthHeader(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const source = useMemo(
    () => (url ? { uri: url, headers: authHeader } : undefined),
    [url, authHeader],
  );

  const retry = useCallback(() => {
    setError(null);
    setLoading(hasUrl);
    setReloadKey((k) => k + 1);
  }, [hasUrl]);

  const handleExternal = useCallback(() => {
    if (onExternal) {
      onExternal();
      return;
    }
    const target = url || imageUrl;
    if (!target) return;
    showExternalAppChooser(target, "打开外部应用 / 浏览器");
  }, [onExternal, url, imageUrl]);

  const handleFullscreen = useCallback(() => {
    if (onFullscreen) {
      onFullscreen();
      return;
    }
    setFullscreen(true);
  }, [onFullscreen]);

  if (!hasUrl && !hasImage) {
    return (
      <View style={styles.emptyBox}>
        <Ionicons name="eye-off-outline" size={20} color={C.ink4} />
        <Text style={styles.emptyTitle}>预览未就绪</Text>
        <Text style={styles.emptyHint}>这条消息没有可预览的地址或图片</Text>
      </View>
    );
  }

  const toolbar = (
    <PreviewToolbar
      title={title || (hasImage ? "图片预览" : url)}
      loading={loading}
      error={error}
      onRetry={retry}
      onFullscreen={handleFullscreen}
      onExternal={handleExternal}
    />
  );

  const body = hasImage ? (
    <Pressable style={styles.imageWrap} onPress={handleFullscreen}>
      <Image
        source={{ uri: imageUrl, headers: authHeader }}
        style={compact ? styles.imageCompact : styles.imageFull}
        contentFit="contain"
        transition={200}
        onError={() => setError("图片加载失败")}
      />
      {error ? (
        <View style={styles.errorOverlay}>
          <Ionicons name="alert-circle-outline" size={22} color={C.err} />
          <Text style={styles.errorOverlayText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={retry}>
            <Text style={styles.retryBtnText}>重试</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  ) : (
    <View style={styles.webWrap}>
      {error ? (
        <View style={styles.errorOverlay}>
          <Ionicons name="alert-circle-outline" size={22} color={C.err} />
          <Text style={styles.errorOverlayText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={retry}>
            <Text style={styles.retryBtnText}>重试</Text>
          </Pressable>
        </View>
      ) : (
        <SafeWebView
          key={reloadKey}
          source={source}
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
      )}
      {loading && !error ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={C.accent} />
          <Text style={styles.loadingText}>加载预览…</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.panel}>
      {toolbar}
      {body}

      <Modal
        visible={fullscreen}
        transparent
        animationType="slide"
        onRequestClose={() => setFullscreen(false)}
      >
        <View style={styles.fsBackdrop}>
          <View style={styles.fsHeader}>
            <Text style={styles.fsTitle} numberOfLines={1}>
              {title || (hasImage ? "图片预览" : url)}
            </Text>
            <Pressable hitSlop={10} onPress={() => setFullscreen(false)}>
              <Ionicons name="close" size={20} color={C.ink2} />
            </Pressable>
          </View>
          <View style={styles.fsBody}>
            {hasImage ? (
              <Image
                source={{ uri: imageUrl, headers: authHeader }}
                style={styles.fsImage}
                contentFit="contain"
                transition={200}
              />
            ) : (
              <SafeWebView
                source={source}
                style={styles.webview}
                originWhitelist={["*"]}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                sharedCookiesEnabled={true}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.lg,
    backgroundColor: C.panel,
    overflow: "hidden",
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: SPACING.lg,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    borderRadius: RADIUS.lg,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  emptyTitle: {
    color: C.ink2,
    fontSize: 13,
    fontWeight: "500",
  },
  emptyHint: {
    color: C.ink4,
    fontSize: 11,
  },
  imageWrap: {
    position: "relative",
    backgroundColor: C.bg,
  },
  imageCompact: {
    width: "100%",
    height: 200,
  },
  imageFull: {
    width: "100%",
    height: 320,
  },
  webWrap: {
    position: "relative",
    height: 260,
    backgroundColor: "#0B0C0D",
  },
  webview: {
    flex: 1,
    backgroundColor: "#0B0C0D",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(8,9,10,0.72)",
  },
  loadingText: {
    color: C.ink3,
    fontSize: 12,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: SPACING.lg,
    backgroundColor: "rgba(8,9,10,0.9)",
  },
  errorOverlayText: {
    color: C.err,
    fontSize: 12,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: "rgba(94,106,210,0.16)",
    borderColor: C.brand,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  retryBtnText: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "500",
  },
  fsBackdrop: {
    flex: 1,
    backgroundColor: C.bg,
    paddingTop: 48,
  },
  fsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  fsTitle: {
    flex: 1,
    color: C.ink,
    fontSize: 15,
    fontWeight: "600",
    marginRight: SPACING.md,
  },
  fsBody: {
    flex: 1,
    backgroundColor: "#0B0C0D",
  },
  fsImage: {
    flex: 1,
    width: "100%",
  },
});

export default InlinePreviewPanel;
