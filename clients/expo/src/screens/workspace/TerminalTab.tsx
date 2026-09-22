/**
 * 终端 Tab —— 模拟 shell (stub)
 *
 * spec §5: "❌ 终端 Tab 真接服务端 shell (只做 stub UI)"。
 * 所以这里没有 PTY、没有子进程, 只有一个命令分派表 + 输出缓冲。
 * 支持: help / pwd / ls / cat <file> / clear / whoami
 *
 * 颜色按输出类别走 (输出/错误/提示/回显), 不做 xterm 那套 ANSI 解析。
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { C } from "../../coolie";
import { RADIUS, SPACING } from "../../ui/tokens";
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
  const scrollRef = useRef<ScrollView>(null);
  const setUrl = useWorkspaceStore((s) => s.setUrl);
  const setTab = useWorkspaceStore((s) => s.setTab);

  const filePaths = useMemo(() => allFilePaths(), []);

  const append = useCallback((...next: TerminalLine[]) => {
    setLines((prev) => [...prev, ...next]);
  }, []);

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
            line(
              "output",
              Array.isArray(node.children) ? `${node.name}/` : node.name,
            ),
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
            const near = filePaths.filter((p) => p.endsWith(normalized));
            if (near.length > 0) {
              return [line("error", `cat: ${normalized}: 无此文件; 是否想找 ${near[0]} ?`)];
            }
            return [line("error", `cat: ${normalized}: 无此文件`)];
          }
          if (!found.content) return [line("hint", `(${normalized} 为空文件)`)];
          // 顺手把 cat 到的文件塞进预览 Tab 的地址栏
          const origin = useWorkspaceStore.getState().previewUrl.replace(/\/+$/, "");
          setUrl(`${origin}/workspace/files/${encodeURIComponent(normalized)}`);
          return found.content
            .split("\n")
            .map((l) => line("output", l));
        }
        default:
          return [
            line("error", `${cmd}: 未找到命令`),
            line("hint", `输入 help 查看可用命令`),
          ];
      }
    },
    [cwd, filePaths, setUrl],
  );

  const submit = useCallback(() => {
    const raw = input;
    const trimmed = raw.trim();
    if (!trimmed) return;
    setInput("");
    const result = runCommand(trimmed);
    if (result === "clear") {
      setLines([]);
    } else {
      append(line("echo", `${PROMPT}:${cwd}$ ${trimmed}`), ...result);
    }
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);
  }, [append, cwd, input, runCommand]);

  const openPreview = useCallback(() => {
    setTab("preview");
  }, [setTab]);

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>终端 (stub)</Text>
        <Pressable hitSlop={8} onPress={openPreview} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>看预览 ↗</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.output}
        contentContainerStyle={styles.outputContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {lines.map((l) => (
          <Text key={l.id} style={[styles.line, LINE_STYLE[l.kind]]}>
            {l.text || " "}
          </Text>
        ))}
      </ScrollView>

      <View style={styles.inputRow}>
        <Text style={styles.prompt}>{PROMPT}:{cwd}$</Text>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="输入命令, 回车执行"
          placeholderTextColor={C.ink4}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={submit}
          blurOnSubmit={false}
        />
        <Pressable style={styles.runBtn} onPress={submit}>
          <Text style={styles.runBtnText}>↵</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const LINE_STYLE: Record<LineKind, { color: string }> = {
  echo: { color: C.ink2 },
  output: { color: C.ink },
  error: { color: C.err },
  hint: { color: C.ink4 },
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "#0B0C0D",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  headerTitle: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "600",
  },
  headerBtn: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  headerBtnText: {
    color: C.ink2,
    fontSize: 11,
  },
  output: {
    flex: 1,
  },
  outputContent: {
    padding: SPACING.md,
    gap: 2,
  },
  line: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.panel,
  },
  prompt: {
    color: C.ok,
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  input: {
    flex: 1,
    color: C.ink,
    fontSize: 13,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.lineSubtle,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  runBtn: {
    width: 34,
    height: 30,
    borderRadius: RADIUS.sm,
    backgroundColor: C.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  runBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});

export default TerminalTab;
