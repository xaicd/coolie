/**
 * 对话内嵌预览面板 (web)
 *
 * 与 expo 端 `clients/expo/src/components/board-inline/InlinePreviewPanel.tsx`
 * 同构, 渲染层换成 HTML 原生元素:
 *
 * | expo | web (本文件) |
 * |---|---|
 * | `react-native-webview` `<WebView>` | `<iframe>` + `onLoad` / `onError` |
 * | `expo-image` `<Image>` | `<img>` + `onError` |
 * | RN `Modal animationType="slide"` | HTML5 `<dialog showModal()>` |
 * | `Pressable` | `<button>` |
 * | SecureStore bearer → WebView 请求头 | `document.cookie` (主域同源) |
 *
 * 双路:
 * - url      非空 → iframe 加载, 带加载/失败/重试
 * - imageUrl 非空 → img 渲染缩略图, 点开全屏大图
 * - 两者都给 → 图片优先 (缩略图比一个加载不出来的网页确定性强)
 *
 * 凭据注入: RN 端没法把 bearer 塞进 iframe 请求头 (浏览器不允许), 所以在 iframe
 * 加载前把它写进主域的 cookie (h5 与实例同源), 由浏览器随 iframe 请求带上 ——
 * 等价于 expo 版"带 cookie 的 WebView"。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { getAuthToken } from "../../coolie";
import { PreviewToolbar } from "./PreviewToolbar";

/** iframe 加载前写入的 cookie 名 (表值带 Bearer 前缀, 与 Authorization 头同形) */
const PREVIEW_COOKIE = "coolie_preview_token";

/**
 * 把 bearer 凭据写进主域 cookie, 供随后创建的 iframe 携带。
 * 拿不到 token 时什么也不做 —— 公开页面照常渲染。
 */
function injectAuthCookie(token: string | null): void {
  if (!token || typeof document === "undefined") return;
  try {
    document.cookie = `${PREVIEW_COOKIE}=${encodeURIComponent(`Bearer ${token}`)}; path=/; SameSite=Lax`;
  } catch {
    // 隐私模式等禁 cookie 的环境: 忽略, 预览仍按匿名请求加载
  }
}

export interface InlinePreviewPanelProps {
  /** 网页预览地址 */
  url?: string;
  /** 图片预览地址 */
  imageUrl?: string;
  /** 工具条标题 */
  title?: string;
  /** 外部注入的全屏行为; 缺省时用本组件内置的全屏 dialog */
  onFullscreen?: () => void;
  /** 外部注入的外链行为; 缺省时新开标签页 */
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
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const fsDialogRef = useRef<HTMLDialogElement>(null);

  const hasImage = Boolean(imageUrl);
  const hasUrl = Boolean(url);

  // 拉一次 bearer token; 拿不到也照常渲染 (公开页面 / cookie 会话)
  useEffect(() => {
    setAuthToken(getAuthToken());
  }, []);

  // iframe 创建之前先把凭据落到 cookie 上 (主域同源, 浏览器随请求带走)
  useEffect(() => {
    injectAuthCookie(authToken);
  }, [authToken, url]);

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
    const opened = window.open(target, "_blank", "noopener,noreferrer");
    if (!opened) setError("无法唤起外部浏览器 (弹窗被拦截)");
  }, [onExternal, url, imageUrl]);

  const handleFullscreen = useCallback(() => {
    if (onFullscreen) {
      onFullscreen();
      return;
    }
    fsDialogRef.current?.showModal();
  }, [onFullscreen]);

  const panelTitle = useMemo(
    () => title || (hasImage ? "图片预览" : url || "预览"),
    [title, hasImage, url],
  );

  if (!hasUrl && !hasImage) {
    return (
      <div style={styles.emptyBox}>
        <div style={styles.emptyGlyph} aria-hidden>
          👁
        </div>
        <div style={styles.emptyTitle}>预览未就绪</div>
        <div style={styles.emptyHint}>这条消息没有可预览的地址或图片</div>
      </div>
    );
  }

  const toolbar = (
    <PreviewToolbar
      title={panelTitle}
      loading={loading}
      error={error}
      onRetry={retry}
      onFullscreen={handleFullscreen}
      onExternal={handleExternal}
    />
  );

  const errorOverlay = error ? (
    <div style={styles.errorOverlay}>
      <div style={styles.errorGlyph} aria-hidden>
        ⚠
      </div>
      <div style={styles.errorOverlayText}>{error}</div>
      <button type="button" style={styles.retryBtn} onClick={retry}>
        重试
      </button>
    </div>
  ) : null;

  const imageBody = (
    <button
      type="button"
      style={styles.imageWrap}
      onClick={handleFullscreen}
      title="点击全屏"
    >
      <img
        src={imageUrl}
        alt={panelTitle}
        style={compact ? styles.imageCompact : styles.imageFull}
        onError={() => setError("图片加载失败")}
        onLoad={() => setError(null)}
      />
      {errorOverlay}
    </button>
  );

  const webBody = (
    <div style={styles.webWrap}>
      {error ? (
        errorOverlay
      ) : (
        <iframe
          key={reloadKey}
          src={url}
          title={panelTitle}
          style={styles.iframe}
          onLoad={() => {
            setLoading(false);
            setError(null);
          }}
          onError={() => {
            setLoading(false);
            setError("页面加载失败");
          }}
        />
      )}
      {loading && !error ? (
        <div style={styles.loadingOverlay} aria-hidden>
          <span style={styles.loadingSpinner} />
          <div style={styles.loadingText}>加载预览…</div>
        </div>
      ) : null}
    </div>
  );

  const body = hasImage ? imageBody : webBody;

  return (
    <div style={styles.panel}>
      <style>{SPIN_KEYFRAMES}</style>
      {toolbar}
      {body}

      <dialog ref={fsDialogRef} style={styles.fsDialog}>
        <div style={styles.fsHeader}>
          <div style={styles.fsTitle}>{panelTitle}</div>
          <button
            type="button"
            style={styles.fsClose}
            onClick={() => fsDialogRef.current?.close()}
          >
            ✕
          </button>
        </div>
        <div style={styles.fsBody}>
          {hasImage ? (
            <img src={imageUrl} alt={panelTitle} style={styles.fsImage} />
          ) : (
            <iframe src={url} title={panelTitle} style={styles.fsIframe} />
          )}
        </div>
      </dialog>
    </div>
  );
}

const SPIN_KEYFRAMES = `@keyframes cc-inline-spin { to { transform: rotate(360deg); } }`;

const styles: Record<string, CSSProperties> = {
  panel: {
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    background: "#0F1011",
    overflow: "hidden",
  },
  emptyBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: "16px 0",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 12,
    background: "rgba(255,255,255,0.02)",
  },
  emptyGlyph: { color: "#62666D", fontSize: 18, lineHeight: "20px" },
  emptyTitle: { color: "#D0D6E0", fontSize: 13, fontWeight: 500 },
  emptyHint: { color: "#62666D", fontSize: 11 },
  imageWrap: {
    position: "relative",
    display: "block",
    width: "100%",
    padding: 0,
    margin: 0,
    border: "none",
    backgroundColor: "#08090A",
    cursor: "zoom-in",
  },
  imageCompact: { display: "block", width: "100%", height: 200, objectFit: "contain" },
  imageFull: { display: "block", width: "100%", height: 320, objectFit: "contain" },
  webWrap: { position: "relative", height: 260, backgroundColor: "#0B0C0D" },
  iframe: { display: "block", width: "100%", height: "100%", border: "none", backgroundColor: "#0B0C0D" },
  loadingOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(8,9,10,0.72)",
  },
  loadingSpinner: {
    width: 16,
    height: 16,
    borderRadius: "50%",
    border: "2px solid rgba(255,255,255,0.12)",
    borderTopColor: "#7170FF",
    animation: "cc-inline-spin 0.8s linear infinite",
  },
  loadingText: { color: "#8A8F98", fontSize: 12 },
  errorOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    backgroundColor: "rgba(8,9,10,0.9)",
  },
  errorGlyph: { color: "#EF4444", fontSize: 20 },
  errorOverlayText: { color: "#EF4444", fontSize: 12, textAlign: "center" },
  retryBtn: {
    backgroundColor: "rgba(94,106,210,0.16)",
    border: "1px solid #5E6AD2",
    borderRadius: 8,
    padding: "6px 12px",
    color: "#7170FF",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },
  fsDialog: {
    width: "min(92vw, 1100px)",
    height: "min(88vh, 820px)",
    padding: 0,
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    background: "#08090A",
    color: "#F7F8F8",
    overflow: "hidden",
  },
  fsHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  fsTitle: {
    flex: 1,
    color: "#F7F8F8",
    fontSize: 15,
    fontWeight: 600,
    marginRight: 12,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  fsClose: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 6,
    padding: "4px 8px",
    color: "#D0D6E0",
    fontSize: 12,
    cursor: "pointer",
  },
  fsBody: { height: "calc(100% - 49px)", background: "#0B0C0D" },
  fsImage: { display: "block", width: "100%", height: "100%", objectFit: "contain" },
  fsIframe: { display: "block", width: "100%", height: "100%", border: "none" },
};

export default InlinePreviewPanel;
