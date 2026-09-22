import type { CSSProperties } from "react";
import { C } from "../../theme";
import { rowLabelStyle, rowStyle } from "./Chip";

/** 一颗工具栏按钮的动作。 */
export interface MarkdownAction {
  key: string;
  glyph: string;
  label: string;
  /** 行首前缀 (标题 / 列表), 与 `wrap` 互斥。 */
  prefix?: string;
  /** 把选区包在前后缀里 (粗体 / 斜体 / 代码)。 */
  wrap?: [string, string];
  /** 链接: 包住选中的文字, 光标停在 url 位。 */
  link?: boolean;
}

const ACTIONS: MarkdownAction[] = [
  { key: "h2", glyph: "H", label: "标题", prefix: "## " },
  { key: "bold", glyph: "B", label: "粗体", wrap: ["**", "**"] },
  { key: "italic", glyph: "I", label: "斜体", wrap: ["*", "*"] },
  { key: "list", glyph: "•", label: "列表", prefix: "- " },
  { key: "code", glyph: "</>", label: "行内代码", wrap: ["`", "`"] },
  { key: "link", glyph: "🔗", label: "链接", link: true },
];

export interface MarkdownEditResult {
  text: string;
  /** 应用后应当选中的区间 —— 让用户接着打字就是补全占位符。 */
  selection: { start: number; end: number };
}

/**
 * 在 `text` 上应用一个 markdown 动作 —— 与 expo 端 `MarkdownToolbar.tsx` 里那个
 * 纯函数逐行同一份逻辑 (两端描述区存的都是同一份纯文本 markdown)。
 */
export function applyMarkdownAction(
  text: string,
  selection: { start: number; end: number },
  action: MarkdownAction,
): MarkdownEditResult {
  const start = Math.max(0, Math.min(selection.start, text.length));
  const end = Math.max(start, Math.min(selection.end, text.length));
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);

  if (action.prefix) {
    // 行首前缀: 落在光标所在行的开头, 本来就带同样前缀则先剥掉 (再点一次取消)。
    const lineStart = before.lastIndexOf("\n") + 1;
    const line = text.slice(lineStart, end);
    if (line.startsWith(action.prefix)) {
      const stripped = text.slice(0, lineStart) + text.slice(lineStart + action.prefix.length);
      return {
        text: stripped,
        selection: { start: start - action.prefix.length, end: end - action.prefix.length },
      };
    }
    const next = text.slice(0, lineStart) + action.prefix + text.slice(lineStart);
    return {
      text: next,
      selection: { start: start + action.prefix.length, end: end + action.prefix.length },
    };
  }

  if (action.link) {
    const label = selected || "链接文字";
    const inserted = `[${label}](url)`;
    return {
      text: before + inserted + after,
      selection: {
        start: start + inserted.length - 4,
        end: start + inserted.length - 1,
      },
    };
  }

  if (action.wrap) {
    const [open, close] = action.wrap;
    const inserted = open + selected + close;
    return {
      text: before + inserted + after,
      selection: {
        start: start + open.length,
        end: start + open.length + selected.length,
      },
    };
  }

  return { text, selection: { start, end } };
}

/**
 * h5「Markdown 编辑器」工具栏 —— 上游 `NewIssueDialog` 的描述区是 `MarkdownEditor`
 * (带格式工具); h5 的 textarea 没有富文本层, 这一行给出同样的格式动作, 直接改写
 * 描述文本本身。
 */
export function MarkdownToolbar({
  value,
  selection,
  onChange,
  disabled = false,
}: {
  value: string;
  selection: { start: number; end: number };
  onChange: (next: MarkdownEditResult) => void;
  disabled?: boolean;
}) {
  return (
    <div style={rowStyle}>
      <span style={rowLabelStyle}>Markdown</span>
      <div style={actionsStyle}>
        {ACTIONS.map((action) => (
          <button
            key={action.key}
            type="button"
            title={action.label}
            aria-label={action.label}
            disabled={disabled}
            style={{ ...btnStyle, ...(disabled ? { opacity: 0.4 } : null) }}
            onClick={() => onChange(applyMarkdownAction(value, selection, action))}
          >
            {action.glyph}
          </button>
        ))}
      </div>
    </div>
  );
}

const actionsStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6 };

const btnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 26,
  borderRadius: 6,
  border: `1px solid ${C.line}`,
  background: "rgba(255,255,255,0.02)",
  color: C.ink2,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
