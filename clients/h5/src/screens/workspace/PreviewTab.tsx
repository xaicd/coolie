/**
 * 预览 Tab (web) —— 就地加载 store 里的预览地址
 *
 * 复用 InlinePreviewPanel (iframe + 图片双路), 地址来自 useWorkspaceStore,
 * 初始值 = 生产实例 https://xrobinai.cn。顶部给一个可直接改地址的输入框 +
 * [重置 URL] —— 对齐 ChatHome 预览抽屉里"能换地址重开"的用法, 也方便 FilesTab /
 * 终端 `cat` 把文件地址写进来后在这里确认。
 */

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { InlinePreviewPanel } from "../../components/board-inline/InlinePreviewPanel";
import { DEFAULT_PREVIEW_URL, useWorkspaceStore } from "./useWorkspaceStore";

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

export function PreviewTab() {
  const previewUrl = useWorkspaceStore((s) => s.previewUrl);
  const setUrl = useWorkspaceStore((s) => s.setUrl);
  const reset = useWorkspaceStore((s) => s.reset);
  const [draft, setDraft] = useState(previewUrl);

  // store 里地址被别处改写 (文件树 / 终端 cat) 时, 同步回输入框
  useEffect(() => {
    setDraft(previewUrl);
  }, [previewUrl]);

  const apply = useCallback(() => {
    setUrl(draft);
  }, [draft, setUrl]);

  const handleReset = useCallback(() => {
    reset();
    setUrl(DEFAULT_PREVIEW_URL);
    setDraft(DEFAULT_PREVIEW_URL);
  }, [reset, setUrl]);

  const isImage = IMAGE_RE.test(previewUrl);

  return (
    <div style={styles.wrap}>
      <div style={styles.addressBar}>
        <span style={styles.linkGlyph} aria-hidden>
          🔗
        </span>
        <input
          style={styles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://…"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
        />
        <button type="button" style={styles.applyBtn} onClick={apply}>
          打开
        </button>
        <button type="button" style={styles.resetBtn} onClick={handleReset}>
          重置 URL
        </button>
      </div>

      <div style={styles.panelWrap}>
        {isImage ? (
          <InlinePreviewPanel imageUrl={previewUrl} title="图片预览" compact={false} />
        ) : (
          <InlinePreviewPanel url={previewUrl} title={previewUrl} compact={false} />
        )}
      </div>

      <div style={styles.footnote}>
        预览地址会随工作空间一起持久化 (localStorage → zustand persist)
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    backgroundColor: "#08090A",
  },
  addressBar: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "8px 12px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  linkGlyph: { color: "#8A8F98", fontSize: 12 },
  input: {
    flex: 1,
    minWidth: 0,
    color: "#F7F8F8",
    fontSize: 12,
    padding: "6px 8px",
    backgroundColor: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 6,
    outline: "none",
  },
  applyBtn: {
    backgroundColor: "#5E6AD2",
    border: "none",
    borderRadius: 6,
    padding: "7px 12px",
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },
  resetBtn: {
    backgroundColor: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 6,
    padding: "7px 8px",
    color: "#D0D6E0",
    fontSize: 12,
    cursor: "pointer",
  },
  panelWrap: {
    flex: 1,
    minHeight: 0,
    padding: 12,
    overflow: "auto",
  },
  footnote: {
    color: "#62666D",
    fontSize: 10,
    padding: "0 16px 12px",
  },
};

export default PreviewTab;
