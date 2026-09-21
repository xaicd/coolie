/**
 * CodeDiffCard (web) —— 对话流里的代码 Diff 卡片
 *
 * 对等物是 expo 端的 `clients/expo/src/components/UnifiedDiffViewer.tsx` +
 * `CodeDiffScreen.tsx` 的"单文件折叠卡"。wave1 验收里 h5 端 `<code-diff>` 标签
 * 是**纯文本原样露出** (F-15 FAIL), 本文件补上 web 版渲染。
 *
 * 渲染层是 HTML 原生 `<pre><code>` + CSS 类 (不引 react-syntax-highlighter):
 * - 行号槽 (old / new 双列) 与 expo 一致, 走 tabular-nums 对齐
 * - 新增行 `.cc-diff-add` 绿, 删除行 `.cc-diff-del` 红, hunk `@@` 蓝, 元数据灰
 * - 顶部工具条给 [编辑] 入口 —— 点开就地换成 CodeMirrorEditor (纯 web CM6)
 *
 * 解析拆成纯函数 `parseUnifiedDiff()` (无 IO), 便于单测与列表每帧复用。
 */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { CodeMirrorEditor } from "./CodeMirrorEditor";

export type DiffLineKind = "add" | "delete" | "context" | "hunk" | "meta";

export interface DiffLine {
  id: string;
  kind: DiffLineKind;
  oldNum: number | null;
  newNum: number | null;
  /** 行首符号: `+` / `-` / ` ` / `@@` */
  sign: string;
  content: string;
}

/**
 * `<code-diff>` 的标签体里, 换行可能有两种来源:
 * - SSE 真换行 (`\n`) —— 正常情况;
 * - 单行写成字面量 `\n` (属性/标签体不便带真换行时) —— 归一化成真换行。
 * 仅当整段**没有**真换行、却含 `\n` 两字符序列时才展开, 避免破坏正常内容。
 */
export function normalizeInlinePatch(raw: string): string {
  if (raw.includes("\n")) return raw;
  return raw.replace(/\\n/g, "\n");
}

/** 把一段 git 统一 diff / 单行 +/- 文本 解析成带行号的行数组 (纯函数) */
export function parseUnifiedDiff(patchText: string, fileId = "diff"): DiffLine[] {
  const normalized = normalizeInlinePatch(patchText);
  if (!normalized.trim()) return [];

  const raw = normalized.split("\n");
  const out: DiffLine[] = [];
  let oldCounter = 0;
  let newCounter = 0;

  for (let i = 0; i < raw.length; i++) {
    const line = raw[i].endsWith("\r") ? raw[i].slice(0, -1) : raw[i];
    const id = `${fileId}-L${i}`;

    if (line.startsWith("@@")) {
      const m = line.match(/@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
      if (m) {
        oldCounter = parseInt(m[1], 10);
        newCounter = parseInt(m[2], 10);
      }
      out.push({ id, kind: "hunk", oldNum: null, newNum: null, sign: "@@", content: line });
      continue;
    }

    if (
      line.startsWith("diff --git") ||
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("\\ No newline")
    ) {
      out.push({ id, kind: "meta", oldNum: null, newNum: null, sign: " ", content: line });
      continue;
    }

    if (line.startsWith("+")) {
      out.push({
        id,
        kind: "add",
        oldNum: null,
        newNum: newCounter++,
        sign: "+",
        content: line.slice(1),
      });
      continue;
    }

    if (line.startsWith("-")) {
      out.push({
        id,
        kind: "delete",
        oldNum: oldCounter++,
        newNum: null,
        sign: "-",
        content: line.slice(1),
      });
      continue;
    }

    // 上下文行 (可能带一个前导空格, 也可能裸文本)
    out.push({
      id,
      kind: "context",
      oldNum: oldCounter++,
      newNum: newCounter++,
      sign: " ",
      content: line.startsWith(" ") ? line.slice(1) : line,
    });
  }

  return out;
}

export interface CodeDiffCardProps {
  /** 文件路径, 显示在卡片头部 */
  file?: string;
  /** 语言提示 (高亮/编辑用) */
  lang?: string;
  /** diff / patch 文本 */
  patch: string;
  /** 初始即处于编辑态 */
  defaultEditing?: boolean;
  /** 编辑保存回调 (Mod-s / [保存]) */
  onSave?: (next: string) => void;
  /** 内容区最大高度, 数字视为 px (默认 280) */
  maxHeight?: number;
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
  brand: "#5E6AD2",
  line: "rgba(255,255,255,0.08)",
  lineSubtle: "rgba(255,255,255,0.05)",
  addInk: "#6EE7A0",
  delInk: "#FCA5A5",
} as const;

const MONO_FONT =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

export function CodeDiffCard({
  file,
  lang,
  patch,
  defaultEditing = false,
  onSave,
  maxHeight = 280,
  style,
}: CodeDiffCardProps) {
  const [editing, setEditing] = useState(defaultEditing);
  const [draft, setDraft] = useState(patch);

  const lines = useMemo(() => parseUnifiedDiff(patch, file ?? "diff"), [patch, file]);

  const stats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const l of lines) {
      if (l.kind === "add") additions++;
      else if (l.kind === "delete") deletions++;
    }
    return { additions, deletions };
  }, [lines]);

  const fileName = useMemo(() => {
    if (!file) return lang ? `diff.${lang}` : "diff";
    const parts = file.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? file;
  }, [file, lang]);

  const empty = lines.length === 0;

  return (
    <div style={{ ...styles.card, ...style }} data-testid="code-diff-card">
      <style>{DIFF_CSS}</style>

      {/* 头部: 文件名 + 统计 + [编辑] */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.glyph} aria-hidden>
            {"</>"}
          </span>
          <div style={styles.titleStack}>
            <span style={styles.fileName} title={file ?? fileName}>
              {fileName}
            </span>
            {file && file !== fileName ? (
              <span style={styles.filePath} title={file}>
                {file}
              </span>
            ) : null}
          </div>
        </div>

        <div style={styles.headerRight}>
          <span style={styles.statAdd}>+{stats.additions}</span>
          <span style={styles.statDel}>-{stats.deletions}</span>
          <button
            type="button"
            style={{ ...styles.btn, ...(editing ? styles.btnActive : null) }}
            onClick={() => setEditing((v) => !v)}
            aria-pressed={editing}
          >
            {editing ? "预览" : "编辑"}
          </button>
        </div>
      </div>

      {/* 内容区: 编辑态走 CM6, 预览态走 pre/code 静态渲染 */}
      {editing ? (
        <div style={styles.editorWrap}>
          <CodeMirrorEditor
            value={draft}
            onChange={setDraft}
            language={lang}
            diff
            height={maxHeight}
            onSave={onSave}
          />
        </div>
      ) : empty ? (
        <div style={styles.empty}>该 diff 没有可展示的文本行</div>
      ) : (
        <div style={{ ...styles.diffScroll, maxHeight }}>
          <pre style={styles.pre}>
            <code style={styles.code}>
              {lines.map((line) => (
                <span key={line.id} className={`cc-diff-row cc-diff-row-${line.kind}`}>
                  <span className="cc-diff-gutter">
                    <span className="cc-diff-num">{line.oldNum ?? ""}</span>
                    <span className="cc-diff-num">{line.newNum ?? ""}</span>
                  </span>
                  <span className="cc-diff-sign">{line.sign}</span>
                  <span className="cc-diff-text">{line.content || " "}</span>
                </span>
              ))}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
}

/** 行装饰类 (与 CodeMirrorEditor 的 .cc-diff-* 同源配色) */
const DIFF_CSS = `
.cc-diff-row { display: flex; align-items: stretch; min-height: 20px; }
.cc-diff-gutter {
  display: flex; flex: 0 0 auto; gap: 6px; padding: 0 8px 0 6px;
  background: ${C.panel}; color: ${C.ink4};
  border-right: 1px solid ${C.line}; user-select: none;
}
.cc-diff-num { min-width: 22px; text-align: right; font-variant-numeric: tabular-nums; }
.cc-diff-sign { flex: 0 0 16px; text-align: center; font-weight: 600; }
.cc-diff-text { flex: 1 1 auto; white-space: pre-wrap; word-break: break-word; padding-right: 8px; }
.cc-diff-row-add { background: rgba(39,166,68,0.08); color: ${C.addInk}; border-left: 2px solid rgba(39,166,68,0.4); }
.cc-diff-row-add .cc-diff-gutter { color: ${C.addInk}; }
.cc-diff-row-delete { background: rgba(239,68,68,0.08); color: ${C.delInk}; border-left: 2px solid rgba(239,68,68,0.4); }
.cc-diff-row-delete .cc-diff-gutter { color: ${C.delInk}; }
.cc-diff-row-hunk { background: rgba(94,106,210,0.08); color: ${C.accent}; border-left: 2px solid rgba(94,106,210,0.4); }
.cc-diff-row-hunk .cc-diff-gutter { color: ${C.accent}; }
.cc-diff-row-meta { color: ${C.ink3}; }
.cc-diff-row-context { color: ${C.ink2}; }
`;

const styles: Record<string, CSSProperties> = {
  card: {
    border: `1px solid ${C.line}`,
    borderRadius: 12,
    background: C.bg,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "8px 12px",
    background: C.panel,
    borderBottom: `1px solid ${C.lineSubtle}`,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  glyph: { color: C.accent, fontFamily: MONO_FONT, fontSize: 11, flex: "0 0 auto" },
  titleStack: { display: "flex", flexDirection: "column", minWidth: 0 },
  fileName: {
    color: C.ink,
    fontSize: 13,
    fontWeight: 500,
    fontFamily: MONO_FONT,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  filePath: {
    color: C.ink4,
    fontSize: 10,
    fontFamily: MONO_FONT,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  headerRight: { display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" },
  statAdd: { color: C.addInk, fontFamily: MONO_FONT, fontSize: 12, fontWeight: 600 },
  statDel: { color: C.delInk, fontFamily: MONO_FONT, fontSize: 12, fontWeight: 600 },
  btn: {
    background: "rgba(255,255,255,0.02)",
    border: `1px solid ${C.line}`,
    borderRadius: 6,
    padding: "4px 10px",
    color: C.ink2,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },
  btnActive: { background: "rgba(94,106,210,0.16)", borderColor: C.brand, color: C.accent },
  diffScroll: { overflow: "auto", background: C.bg },
  pre: { margin: 0, padding: "4px 0" },
  code: { fontFamily: MONO_FONT, fontSize: 11, lineHeight: "20px", display: "block" },
  editorWrap: { padding: 8, background: C.bg },
  empty: { padding: 16, color: C.ink4, fontSize: 12, fontFamily: MONO_FONT, textAlign: "center" },
};

export default CodeDiffCard;
