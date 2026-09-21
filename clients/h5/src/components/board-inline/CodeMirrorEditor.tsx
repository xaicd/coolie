/**
 * CodeMirror 6 编辑器 (web)
 *
 * 与 expo 端 `clients/expo/src/components/codemirrorHtml.ts` +
 * `CodeViewerWebView.tsx` 对等, 但**实现方式完全不同**:
 *
 * | expo | web (本文件) |
 * |---|---|
 * | 380KB 预打包 HTML 塞进 `react-native-webview` | 直接 npm 引 `codemirror` 6 的 ESM 包 |
 * | `postMessage` 与 HTML 内脚本双向通信 | React `useRef` + `EditorView.dispatch` |
 * | 手写 `<style>` 覆盖 `.cm-*` | `EditorView.theme()` 生成作用域样式 |
 *
 * 关键点 (见 package.json 的 overrides): `@codemirror/state` / `@codemirror/view`
 * 在 monorepo 里各只能解析出一份 —— CodeMirror 用 `instanceof` 校验扩展,
 * 解析出两份副本会以 "Unrecognized extension value in extension set" 崩掉。
 *
 * 本组件是纯 web 的 (无 iframe / 无 WebView): 直接在 DOM 上挂一个 contenteditable
 * 的 `.cm-editor`, 由 CM6 自己管理。
 */

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { EditorState, Compartment, RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";

export interface CodeMirrorEditorProps {
  /** 受控内容 (外部改动会同步进编辑器) */
  value: string;
  /** 内容变化回调 (用户编辑时触发) */
  onChange?: (next: string) => void;
  /** 语言提示: ts/tsx/js/jsx/json/mjs/cjs 走 JS 高亮, 其余不高亮 */
  language?: string;
  /** 只读模式 (默认 false) */
  readOnly?: boolean;
  /** Diff 模式: 给 `+` / `-` / `@@` 行加 Linear 配色的行装饰 */
  diff?: boolean;
  /** 编辑器高度, 数字视为 px */
  height?: number | string;
  /** 外层容器样式 */
  style?: CSSProperties;
  /** 外层容器类名 */
  className?: string;
  /** Mod-s 存盘回调 (可选) */
  onSave?: (value: string) => void;
}

/** 语言名 → CM6 语言扩展 (只区分 "像 JS 的" 与 "不认识") */
function languageExtension(language: string | undefined): Extension[] {
  const lang = (language ?? "").toLowerCase();
  switch (lang) {
    case "ts":
    case "typescript":
      return [javascript({ typescript: true })];
    case "tsx":
      return [javascript({ typescript: true, jsx: true })];
    case "jsx":
      return [javascript({ jsx: true })];
    case "js":
    case "javascript":
    case "mjs":
    case "cjs":
      return [javascript()];
    default:
      return [];
  }
}

/** 逐行扫描文档, 给 diff 行挂 `Decoration.line` (镜像 expo 的 .cm-diff-* 样式) */
function buildDiffDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;
      let cls: string | null = null;
      if (text.startsWith("@@")) cls = "cc-diff-hunk";
      else if (text.startsWith("+")) cls = "cc-diff-add";
      else if (text.startsWith("-")) cls = "cc-diff-del";
      if (cls) builder.add(line.from, line.from, Decoration.line({ class: cls }));
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const diffHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDiffDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDiffDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** Linear 暗色主题 (DESIGN.md 第6节): 面板 #0F1011, 强调 #5E6AD2 */
const linearTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "#0F1011",
      color: "#D0D6E0",
      fontSize: "12px",
    },
    ".cm-scroller": {
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      lineHeight: "20px",
      overflow: "auto",
    },
    ".cm-content": { padding: "8px 0", caretColor: "#5E6AD2" },
    ".cm-gutters": {
      backgroundColor: "#0F1011",
      color: "#62666D",
      border: "none",
      borderRight: "1px solid rgba(255,255,255,0.08)",
      paddingRight: "8px",
    },
    ".cm-activeLineGutter": { backgroundColor: "rgba(255,255,255,0.04)", color: "#8A8F98" },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.03)" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#5E6AD2" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(94,106,210,0.35)",
    },
    // Diff 行 (与 expo codemirrorHtml.ts 的 .cm-diff-* 一一对应)
    ".cc-diff-add": {
      backgroundColor: "rgba(39,166,68,0.12)",
      borderLeft: "3px solid rgba(39,166,68,0.7)",
    },
    ".cc-diff-del": {
      backgroundColor: "rgba(239,68,68,0.12)",
      borderLeft: "3px solid rgba(239,68,68,0.7)",
    },
    ".cc-diff-hunk": {
      backgroundColor: "rgba(94,106,210,0.12)",
      color: "#7170FF",
      borderLeft: "3px solid rgba(94,106,210,0.7)",
      fontWeight: "600",
    },
  },
  { dark: true },
);

/** 只读 / 语言 / diff 用一个 Compartment 承载, 变更时 reconfigure 而非重建视图 */
const readOnlyCompartment = new Compartment();
const languageCompartment = new Compartment();
const diffCompartment = new Compartment();

export function CodeMirrorEditor({
  value,
  onChange,
  language,
  readOnly = false,
  diff = false,
  height = 260,
  style,
  className,
  onSave,
}: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // 回调放 ref, 免得每次 onChange 变化都重建整棵 View
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        linearTheme,
        EditorView.lineWrapping,
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: (view) => {
              onSaveRef.current?.(view.state.doc.toString());
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current?.(update.state.doc.toString());
        }),
        readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
        languageCompartment.of(languageExtension(language)),
        diffCompartment.of(diff ? diffHighlightPlugin : []),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 初始值/语言在挂载时读取一次; 之后的变更走下方各自的 effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部 value 改动 → 写回编辑器 (只在真的不同时, 免得打断光标)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageCompartment.reconfigure(languageExtension(language)),
    });
  }, [language]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: diffCompartment.reconfigure(diff ? diffHighlightPlugin : []),
    });
  }, [diff]);

  const resolvedHeight = typeof height === "number" ? `${height}px` : height;

  return (
    <div
      ref={hostRef}
      className={className}
      data-testid="cm6-editor"
      style={{
        height: resolvedHeight,
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: "#0F1011",
        ...style,
      }}
    />
  );
}

export default CodeMirrorEditor;
