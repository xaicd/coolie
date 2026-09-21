/**
 * 预览工具条 (web)
 *
 * 与 expo 端 `clients/expo/src/components/board-inline/PreviewToolbar.tsx` 同构:
 * 左侧标题 + 状态, 右侧 [重试] / [全屏] / [外链] 三件套。
 *
 * 渲染层换成 HTML: RN `View` → `div`, `Text` → `div`, `Pressable` → `button`,
 * `ActivityIndicator` → 一个 CSS 旋转的小圆环。转圈的 `@keyframes` 由组件自己
 * 注入一份 `<style>`, 从而不引全局样式表 —— 与 spec §2 "各自实现, 不抽包" 一致。
 */

import type { CSSProperties } from "react";

export interface PreviewToolbarProps {
  /** [全屏] —— 父组件决定是全屏 dialog 还是切到别的 Tab */
  onFullscreen?: () => void;
  /** [外部浏览器打开] —— 兜底通道, iframe 跑不动时的逃生口 */
  onExternal?: () => void;
  /** [重试] —— 仅在 error 非空时出现 */
  onRetry?: () => void;
  /** 加载中: 转圈 + 禁用按钮 */
  loading?: boolean;
  /** 错误文案: 非空时展示红字并露出重试 */
  error?: string | null;
  /** 左侧标题/地址栏文案 */
  title?: string;
  style?: CSSProperties;
}

const C = {
  panel: "#0F1011",
  ink: "#F7F8F8",
  ink2: "#D0D6E0",
  ink4: "#62666D",
  accent: "#7170FF",
  err: "#EF4444",
  line: "rgba(255,255,255,0.08)",
  lineSubtle: "rgba(255,255,255,0.05)",
} as const;

export function PreviewToolbar({
  onFullscreen,
  onExternal,
  onRetry,
  loading = false,
  error = null,
  title,
  style,
}: PreviewToolbarProps) {
  return (
    <div style={{ ...styles.bar, ...style }}>
      <style>{SPIN_KEYFRAMES}</style>

      <div style={styles.left}>
        {loading ? <span style={styles.spinner} aria-hidden /> : null}
        <div style={styles.titleStack}>
          <div style={styles.title}>{title || "预览"}</div>
          {error ? (
            <div style={styles.error}>⚠️ {error}</div>
          ) : (
            <div style={styles.subtitle}>{loading ? "加载中…" : "就绪"}</div>
          )}
        </div>
      </div>

      <div style={styles.actions}>
        {error && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={loading}
            style={{ ...styles.btn, ...(loading ? styles.btnDisabled : null) }}
          >
            重试
          </button>
        ) : null}

        {onFullscreen ? (
          <button
            type="button"
            onClick={onFullscreen}
            disabled={loading}
            style={{ ...styles.btn, ...(loading ? styles.btnDisabled : null) }}
          >
            ⤢ 全屏
          </button>
        ) : null}

        {onExternal ? (
          <button type="button" onClick={onExternal} style={styles.btn}>
            ↗ 外链
          </button>
        ) : null}
      </div>
    </div>
  );
}

const SPIN_KEYFRAMES = `@keyframes cc-preview-spin { to { transform: rotate(360deg); } }`;

const styles: Record<string, CSSProperties> = {
  bar: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "8px 12px",
    background: C.panel,
    borderBottom: `1px solid ${C.lineSubtle}`,
  },
  left: {
    flex: 1,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  spinner: {
    width: 13,
    height: 13,
    flex: "0 0 auto",
    borderRadius: "50%",
    border: `2px solid ${C.line}`,
    borderTopColor: C.accent,
    animation: "cc-preview-spin 0.8s linear infinite",
  },
  titleStack: { flex: 1, minWidth: 0 },
  title: {
    color: C.ink,
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  subtitle: { color: C.ink4, fontSize: 10, marginTop: 1 },
  error: { color: C.err, fontSize: 11, lineHeight: "15px", marginTop: 1 },
  actions: { display: "flex", alignItems: "center", gap: 4 },
  btn: {
    background: "rgba(255,255,255,0.02)",
    border: `1px solid ${C.line}`,
    borderRadius: 6,
    padding: "5px 8px",
    color: C.ink2,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },
  btnDisabled: { opacity: 0.4, cursor: "not-allowed" },
};

export default PreviewToolbar;
