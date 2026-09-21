/**
 * MvpPreviewCard (web) —— `<preview-mvp>` 的卡片本体
 *
 * wave1 验收 F-14: `tagParser.parseMeta()` 已经把 `meta='{"k":"v"}'` 解析出来了,
 * 但渲染层 (expo / h5 都一样) 只把 `url/imageUrl/title` 传给面板, meta 被丢掉,
 * 于是卡片上看不到任何键值行。本文件补上: 把 meta 渲染成键/值两列的表格。
 *
 * 结构 (自下而上):
 * - 缩略图 (可选): `<img>` + 加载失败态 (「图片加载失败 / 重试」), 点击触发全屏
 * - 标题条 (可选)
 * - meta 键值行 (可选): 逐行 `key | value`
 * - 外链条 (可选): `url` 存在时给一个 ↗ 链接
 *
 * 与 expo 端 `InlinePreviewPanel` 的图片分支同构, 只是 web 用 `<img>`。
 * 只在有 meta 时渲染表格; 没有 meta 时行为与 wave1 完全一致。
 */

import { useState } from "react";
import type { CSSProperties } from "react";

export interface MvpPreviewCardProps {
  /** 卡片标题 */
  title?: string;
  /** 缩略图地址 */
  imageUrl?: string;
  /** 可打开的地址 */
  url?: string;
  /** 键值元数据 (`<preview-mvp meta='{...}'>` 解析结果) */
  meta?: Record<string, string>;
  /** 紧凑模式: 缩略图高度 200, 否则 320 */
  compact?: boolean;
  /** 点击缩略图 / [全屏] 时的回调 */
  onOpen?: () => void;
  /** 外部注入的外链回调 (缺省用 window.open) */
  onExternal?: () => void;
  /**
   * 是否在卡内渲染 [⤢ 全屏] / [↗ 外链] 按钮。
   * 缺省 false —— 因为 InlinePreviewPanel 的工具条已经有这两个动作, 卡内再放一份就重复了。
   * 单独用本卡 (不套面板) 时置 true。
   */
  showActions?: boolean;
  style?: CSSProperties;
}

const C = {
  panel: "#0F1011",
  bg: "#08090A",
  ink: "#F7F8F8",
  ink2: "#D0D6E0",
  ink3: "#8A8F98",
  ink4: "#62666D",
  accent: "#7170FF",
  err: "#EF4444",
  line: "rgba(255,255,255,0.08)",
  lineSubtle: "rgba(255,255,255,0.05)",
} as const;

export function MvpPreviewCard({
  title,
  imageUrl,
  url,
  meta,
  compact = true,
  onOpen,
  onExternal,
  showActions = false,
  style,
}: MvpPreviewCardProps) {
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const metaEntries = meta ? Object.entries(meta) : [];

  const handleExternal = () => {
    if (onExternal) {
      onExternal();
      return;
    }
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div style={{ ...styles.card, ...style }} data-testid="mvp-preview-card">
      {imageUrl ? (
        <button
          type="button"
          style={styles.imageWrap}
          onClick={onOpen}
          title={onOpen ? "点击全屏" : title || "缩略图"}
        >
          <img
            key={reloadKey}
            src={imageUrl}
            alt={title || "mvp 缩略图"}
            style={compact ? styles.imageCompact : styles.imageFull}
            onLoad={() => setFailed(false)}
            onError={() => setFailed(true)}
          />
          {failed ? (
            <span style={styles.imageErrorOverlay}>
              <span style={styles.imageErrorText}>图片加载失败</span>
              <span
                role="button"
                tabIndex={0}
                style={styles.retryBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setFailed(false);
                  setReloadKey((k) => k + 1);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    setFailed(false);
                    setReloadKey((k) => k + 1);
                  }
                }}
              >
                重试
              </span>
            </span>
          ) : null}
        </button>
      ) : null}

      {title ? (
        <div style={styles.titleBar}>
          <span style={styles.titleText} title={title}>
            {title}
          </span>
          {showActions && onOpen ? (
            <button type="button" style={styles.miniBtn} onClick={onOpen}>
              ⤢ 全屏
            </button>
          ) : null}
        </div>
      ) : null}

      {metaEntries.length > 0 ? (
        <dl style={styles.metaTable} data-testid="mvp-preview-meta">
          {metaEntries.map(([key, value]) => (
            <div key={key} style={styles.metaRow}>
              <dt style={styles.metaKey}>{key}</dt>
              <dd style={styles.metaValue} title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {url ? (
        <div style={styles.linkBar}>
          <span style={styles.linkText} title={url}>
            {url}
          </span>
          {showActions ? (
            <button type="button" style={styles.miniBtn} onClick={handleExternal}>
              ↗ 外链
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    background: C.bg,
    overflow: "hidden",
  },
  imageWrap: {
    position: "relative",
    display: "block",
    width: "100%",
    padding: 0,
    margin: 0,
    border: "none",
    backgroundColor: C.bg,
    cursor: "zoom-in",
  },
  imageCompact: { display: "block", width: "100%", height: 200, objectFit: "contain" },
  imageFull: { display: "block", width: "100%", height: 320, objectFit: "contain" },
  imageErrorOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(8,9,10,0.9)",
  },
  imageErrorText: { color: C.err, fontSize: 12 },
  retryBtn: {
    backgroundColor: "rgba(94,106,210,0.16)",
    border: `1px solid #5E6AD2`,
    borderRadius: 8,
    padding: "6px 12px",
    color: C.accent,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },
  titleBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "8px 12px",
    borderBottom: `1px solid ${C.lineSubtle}`,
  },
  titleText: {
    flex: 1,
    minWidth: 0,
    color: C.ink,
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  miniBtn: {
    flex: "0 0 auto",
    background: "rgba(255,255,255,0.02)",
    border: `1px solid ${C.line}`,
    borderRadius: 6,
    padding: "4px 8px",
    color: C.ink2,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },
  metaTable: {
    margin: 0,
    padding: "6px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 3,
    background: C.panel,
    borderTop: `1px solid ${C.lineSubtle}`,
  },
  metaRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    minWidth: 0,
  },
  metaKey: {
    flex: "0 0 auto",
    minWidth: 72,
    color: C.ink4,
    fontSize: 11,
    fontWeight: 500,
    margin: 0,
  },
  metaValue: {
    flex: 1,
    minWidth: 0,
    color: C.ink2,
    fontSize: 11,
    margin: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  linkBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "7px 12px",
    borderTop: `1px solid ${C.lineSubtle}`,
    background: C.panel,
  },
  linkText: {
    flex: 1,
    minWidth: 0,
    color: C.ink3,
    fontSize: 11,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
};

export default MvpPreviewCard;
