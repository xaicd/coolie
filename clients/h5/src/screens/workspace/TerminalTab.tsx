/**
 * 终端 Tab (web) —— 模拟 shell (stub)
 *
 * spec §5: "❌ 终端 Tab 真接服务端 shell (只做 stub UI)"。
 * 所以这里没有 PTY、没有子进程, 只有一个命令分派表 + 输出缓冲。
 * 支持: help / pwd / ls / cat <file> / clear / whoami
 *
 * 与 expo 版同构, 渲染层换成 HTML: ScrollView → 可滚动的 <div>, TextInput → <input>,
 * 回车 (onKeyDown Enter) 代替 onSubmitEditing。颜色按输出类别走, 不做 ANSI 解析。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { MOCK_FILE_TREE, allFilePaths, findFileByPath } from "./mock-files";
import { useWorkspaceStore } from "./useWorkspaceStore";

type LineKind = "echo" | "output" | "error" | "hint";

interface TerminalLine {
  id: string;
  kind: LineKind;
  text: string;
}

const PROMPT = "coolie@workspace";
const SUPPORTED = ["help", "pwd", "ls", "cat <file>", "clear", "whoami"];

let lineSeq = 0;
function line(kind: LineKind, text: string): TerminalLine {
  lineSeq += 1;
  return { id: `tl-${lineSeq}-${Date.now()}`, kind, text };
}

const WELCOME: TerminalLine[] = [
  line("hint", "Coolie workspace shell (stub) — 不会真的执行, 只演示交互。"),
  line("hint", `可用命令: ${SUPPORTED.join(" · ")}`),
];

export function TerminalTab() {
  const [lines, setLines] = useState<TerminalLine[]>(() => [...WELCOME]);
  const [input, setInput] = useState("");
  const [cwd] = useState("/");
  const scrollRef = useRef<HTMLDivElement>(null);
  const setUrl = useWorkspaceStore((s) => s.setUrl);
  const setTab = useWorkspaceStore((s) => s.setTab);

  // 输出追加后滚到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  /** 命令分派: 纯计算, 返回要追加的行 */
  const runCommand = useCallback(
    (raw: string): TerminalLine[] | "clear" => {
      const trimmed = raw.trim();
      if (!trimmed) return [];
      const [cmd, ...args] = trimmed.split(/\s+/);
      const arg = args.join(" ");

      switch (cmd) {
        case "help":
          return [
            line("output", "可用命令:"),
            line("output", "  help          显示本帮助"),
            line("output", "  pwd           打印当前目录"),
            line("output", "  ls            列出 workspace 顶层"),
            line("output", "  cat <file>    读取文件内容 (mock)"),
            line("output", "  clear         清空输出"),
            line("output", "  whoami        显示当前身份"),
          ];
        case "pwd":
          return [line("output", `/workspace${cwd === "/" ? "" : cwd}`)];
        case "ls":
          return MOCK_FILE_TREE.map((node) =>
            line("output", Array.isArray(node.children) ? `${node.name}/` : node.name),
          );
        case "whoami":
          return [line("output", "掌柜 (workspace owner)")];
        case "clear":
          return "clear";
        case "cat": {
          if (!arg) {
            return [line("error", "cat: 缺少文件名。试试: cat README.md")];
          }
          const normalized = arg.replace(/^\.\//, "");
          const found = findFileByPath(normalized);
          if (!found) {
            const near = allFilePaths().filter((p) => p.endsWith(normalized));
            if (near.length > 0) {
              return [line("error", `cat: ${normalized}: 无此文件; 是否想找 ${near[0]} ?`)];
            }
            return [line("error", `cat: ${normalized}: 无此文件`)];
          }
          if (!found.content) return [line("hint", `(${normalized} 为空文件)`)];
          // 顺手把 cat 到的文件塞进预览 Tab 的地址栏
          const origin = useWorkspaceStore.getState().previewUrl.replace(/\/+$/, "");
          setUrl(`${origin}/workspace/files/${encodeURIComponent(normalized)}`);
          return found.content.split("\n").map((l) => line("output", l));
        }
        default:
          return [
            line("error", `${cmd}: 未找到命令`),
            line("hint", "输入 help 查看可用命令"),
          ];
      }
    },
    [cwd, setUrl],
  );

  const submit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    const result = runCommand(trimmed);
    if (result === "clear") {
      setLines([]);
    } else {
      setLines((prev) => [...prev, line("echo", `${PROMPT}:${cwd}$ ${trimmed}`), ...result]);
    }
  }, [cwd, input, runCommand]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") submit();
    },
    [submit],
  );

  const openPreview = useCallback(() => {
    setTab("preview");
  }, [setTab]);

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>终端 (stub)</div>
        <button type="button" style={styles.headerBtn} onClick={openPreview}>
          看预览 ↗
        </button>
      </div>

      <div ref={scrollRef} style={styles.output}>
        {lines.map((l) => (
          <div key={l.id} style={{ ...styles.line, ...LINE_STYLE[l.kind] }}>
            {l.text || " "}
          </div>
        ))}
      </div>

      <div style={styles.inputRow}>
        <span style={styles.prompt}>
          {PROMPT}:{cwd}$
        </span>
        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="输入命令, 回车执行"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <button type="button" style={styles.runBtn} onClick={submit}>
          ↵
        </button>
      </div>
    </div>
  );
}

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const LINE_STYLE: Record<LineKind, CSSProperties> = {
  echo: { color: "#D0D6E0" },
  output: { color: "#F7F8F8" },
  error: { color: "#EF4444" },
  hint: { color: "#62666D" },
};

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    backgroundColor: "#0B0C0D",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  headerTitle: { color: "#D0D6E0", fontSize: 12, fontWeight: 600 },
  headerBtn: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 6,
    padding: "4px 8px",
    color: "#D0D6E0",
    fontSize: 11,
    cursor: "pointer",
  },
  output: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  line: { fontSize: 12, lineHeight: "17px", fontFamily: MONO, whiteSpace: "pre-wrap" },
  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "8px 12px",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#0F1011",
  },
  prompt: { color: "#27A644", fontSize: 11, fontFamily: MONO },
  input: {
    flex: 1,
    minWidth: 0,
    color: "#F7F8F8",
    fontSize: 13,
    padding: "6px 8px",
    backgroundColor: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 8,
    fontFamily: MONO,
    outline: "none",
  },
  runBtn: {
    width: 34,
    height: 30,
    borderRadius: 6,
    backgroundColor: "#5E6AD2",
    border: "none",
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
};

export default TerminalTab;
