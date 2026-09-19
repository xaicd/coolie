import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { C } from "../coolie";
import { CODEMIRROR_HTML } from "./codemirrorHtml";

const SafeWebView = WebView as unknown as React.ComponentType<any>;

export interface CodeViewerWebViewProps {
  /** 代码文本或补丁文本 */
  code?: string;
  /** 代码语言，例如 "javascript", "typescript", "python", "diff" 等 */
  language?: string;
  /** 是否显示行号，默认为 true */
  lineNumbers?: boolean;
  /** 是否只读，默认为 true */
  readOnly?: boolean;
  /** 是否为 Diff 差异对比模式 (高亮新增/删除/Hunk行) */
  isDiff?: boolean;
  /** 备用统一 Diff 补丁字段 (与 code 等价) */
  diff?: string;
  /** 外层容器样式 */
  style?: StyleProp<ViewStyle>;
  /** 代码加载渲染完成回调 */
  onLoaded?: (info: { lineCount: number; isDiff: boolean }) => void;
  /** 异常错误回调 */
  onError?: (error: Error) => void;
  /** 加载中占位文案 */
  loadingMessage?: string;
}

/**
 * 嵌入式 CodeMirror 6 代码/Diff 查看器
 *
 * 遵循 Linear 设计规范与 PRD 规范:
 * - 纯本地离线 HTML 资源渲染 (免外部 CDN 依赖)
 * - 背景色对齐 Linear Panel: #0F1011
 * - 支持 postMessage 协议双向通信: {code, language, lineNumbers, readOnly, isDiff}
 * - 专有 Diff 增删行彩色装饰高亮 (+ / - / @@)
 * - 预注入 initialData，实现零白屏与毫秒级加载
 */
export function CodeViewerWebView({
  code,
  language = "typescript",
  lineNumbers = true,
  readOnly = true,
  isDiff = false,
  diff,
  style,
  onLoaded,
  onError,
  loadingMessage = "正在加载代码编辑器…",
}: CodeViewerWebViewProps) {
  const webViewRef = useRef<WebView>(null);
  const [isReady, setIsReady] = useState(false);
  const [loading, setLoading] = useState(true);

  const effectiveCode = useMemo(() => {
    return code ?? diff ?? "";
  }, [code, diff]);

  const effectiveIsDiff = useMemo(() => {
    return Boolean(
      isDiff ||
      language === "diff" ||
      diff != null ||
      (effectiveCode && (effectiveCode.startsWith("@@") || effectiveCode.startsWith("diff --git")))
    );
  }, [isDiff, language, diff, effectiveCode]);

  // 生成初始注入脚本，保证 HTML 解析时第一帧立即可用，避免 postMessage 往返延迟
  const injectedScript = useMemo(() => {
    const payload = {
      code: effectiveCode,
      language,
      lineNumbers,
      readOnly,
      isDiff: effectiveIsDiff,
      mode: effectiveIsDiff ? "diff" : "code",
    };
    return `window.__INITIAL_DATA__ = ${JSON.stringify(payload)}; true;`;
  }, [effectiveCode, language, lineNumbers, readOnly, effectiveIsDiff]);

  // 发送最新状态至 WebView
  const postPayload = useCallback(() => {
    const payload = JSON.stringify({
      code: effectiveCode,
      language,
      lineNumbers,
      readOnly,
      isDiff: effectiveIsDiff,
      mode: effectiveIsDiff ? "diff" : "code",
    });
    webViewRef.current?.postMessage(payload);
  }, [effectiveCode, language, lineNumbers, readOnly, effectiveIsDiff]);

  // 当外部 code / language / diff 发生变化时，通过 postMessage 增量通知 HTML 端
  useEffect(() => {
    if (isReady) {
      postPayload();
    }
  }, [isReady, postPayload]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const raw = event.nativeEvent.data;
        if (!raw) return;
        const msg = JSON.parse(raw);
        if (msg.type === "READY") {
          setIsReady(true);
          postPayload();
        } else if (msg.type === "LOADED") {
          setLoading(false);
          onLoaded?.({
            lineCount: typeof msg.lineCount === "number" ? msg.lineCount : 0,
            isDiff: Boolean(msg.isDiff),
          });
        } else if (msg.type === "ERROR") {
          setLoading(false);
          onError?.(new Error(msg.message || "CodeMirror runtime error"));
        }
      } catch (err) {
        console.warn("Failed to parse message from CodeMirror WebView:", err);
      }
    },
    [postPayload, onLoaded, onError],
  );

  return (
    <View style={[styles.container, style]}>
      <SafeWebView
        ref={webViewRef}
        source={{ html: CODEMIRROR_HTML }}
        style={styles.webview}
        originWhitelist={["*"]}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        injectedJavaScriptBeforeContentLoaded={injectedScript}
        onMessage={handleMessage}
        onLoadEnd={() => {
          // 兜底：若 150ms 内未收到 READY 信号则主动推送
          setTimeout(() => {
            postPayload();
          }, 150);
        }}
        scrollEnabled={true}
        showsVerticalScrollIndicator={true}
        showsHorizontalScrollIndicator={true}
        bounces={false}
        overScrollMode="never"
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={C.accent} />
          <Text style={styles.loadingText}>{loadingMessage}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1011",
    position: "relative",
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "#0F1011",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0F1011",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    zIndex: 10,
  },
  loadingText: {
    color: C.ink3,
    fontSize: 12,
  },
});
