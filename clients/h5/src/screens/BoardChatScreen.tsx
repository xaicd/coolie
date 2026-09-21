/**
 * BoardChatScreen (h5 简化版) —— 工坊对话流 + 内嵌预览
 *
 * spec §5: "❌ 完整的 BoardChatScreen（只做最小骨架）"。app 端那份 4000+ 行的
 * 流式/审批/构建卡一律不要, 这里只保留本波真正要验证的两件事:
 *   1. 对话文本里夹带的 `<preview-url>` / `<preview-mvp>` 标签, 被就地渲染成
 *      InlinePreviewPanel, 而不是跳走;
 *   2. 右上角 [Workspace] 入口, 由 App.tsx 注入, 拉起工作空间。
 *
 * 不依赖 expo / react-native, 纯 HTML + React 19。
 */

import { useCallback, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { InlinePreviewPanel } from "../components/board-inline/InlinePreviewPanel";
import { CodeDiffCard } from "../components/board-inline/CodeDiffCard";
import { hasInlinePreviewTag, parseInlineTags } from "../components/board-inline/tagParser";
import {
  parseCommand,
  pipelineKeyFromName,
  tCommand,
  type ParsedCommand,
} from "../components/commandRouter";

/** 本屏只用到 company 的 id/name, 用最小结构类型, 避免和 api-client 的 Company 强绑 */
export interface WorkspaceCompany {
  id: string;
  name: string;
}

export interface BoardChatScreenProps {
  company?: WorkspaceCompany;
  whoami?: string;
  /** 嵌入模式: 工作空间「对话」Tab 里复用本屏内容区, 不套整屏页头 */
  embedded?: boolean;
  /** 顶部右上角 [Workspace] 入口, 由 App.tsx 注入 (拉起工作空间 dialog) */
  onOpenWorkspace?: () => void;
}

interface MockMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

/** mock 对话: 两条带内嵌预览标签的回复, 用来演示 tagParser + InlinePreviewPanel */
const SEED_MESSAGES: MockMessage[] = [
  { id: "m1", role: "user", text: "帮我看下线上首页的预览。" },
  {
    id: "m2",
    role: "assistant",
    text:
      "线上地址在这里, 直接就地加载:\n" +
      "<preview-url>https://xrobinai.cn</preview-url>\n" +
      "点击工具条 [⤢ 全屏] 可以放大看。",
  },
  { id: "m3", role: "user", text: "有没有新版首页的缩略图?" },
  {
    id: "m4",
    role: "assistant",
    text:
      "新版首页缩略图如下 (点击看大图), 属性列在缩略图下面:\n" +
      '<preview-mvp title="首页 v2" thumb="https://picsum.photos/seed/coolie/640/360" url="https://xrobinai.cn" meta=\'{"作者":"小陈","版本":"v2.0","构建":"2026-09-21"}\'>首页 v2</preview-mvp>',
  },
  { id: "m5", role: "user", text: "顺手把这次改动贴出来。" },
  {
    id: "m6",
    role: "assistant",
    text:
      "改动如下 (绿=新增, 红=删除, 行号在左侧):\n" +
      '<code-diff file="src/hello.ts" lang="ts">@@ -1,3 +1,4 @@\n export function hello() {\n-  return "hi";\n+  return "hello";\n }\n+// added by coolie</code-diff>\n' +
      "点右上角 [编辑] 可以在网页里直接改。",
  },
];

/** 收到消息时给的固定回执 (本波不接后端 SSE, spec §5) */
const CANNED_REPLY =
  "收到。本波 h5 端用的是 mock 数据, 真流式接后端后这里会换成 SSE 输出。\n" +
  "<preview-url>https://xrobinai.cn</preview-url>";

export function BoardChatScreen({
  company,
  whoami,
  embedded = false,
  onOpenWorkspace,
}: BoardChatScreenProps) {
  const [messages, setMessages] = useState<MockMessage[]>(SEED_MESSAGES);
  const [draft, setDraft] = useState("");

  /**
   * 指令分发 (wave19, 与 app 端同构): pipeline / plan / pr 三种编排指令,
   * 命中就打对应的编排 API, 并把回执追加成一条助手气泡。
   * h5 本波没接登录/会话, 拿不到可用 company 时退化成回执文案, 不假装成功。
   */
  const dispatchCommand = useCallback(
    async (command: ParsedCommand, id: string) => {
      const companyId = company?.id;
      const label =
        command.kind === "pipeline"
          ? tCommand("Pipeline created")
          : command.kind === "plan"
            ? tCommand("Plan created")
            : tCommand("PR workflow triggered");

      let text = `${label} · ${command.subject}`;
      try {
        if (!companyId || companyId === "local-stub") throw new Error("no company session");
        const url =
          command.kind === "pipeline"
            ? `/api/companies/${encodeURIComponent(companyId)}/pipelines`
            : `/api/companies/${encodeURIComponent(companyId)}/issues`;
        const body =
          command.kind === "pipeline"
            ? { key: pipelineKeyFromName(command.subject), name: command.subject }
            : command.kind === "pr"
              ? {
                  title: `PR: ${command.subject}`,
                  description: `由工坊对话触发 GitHub PR workflow (标签意图: pr-workflow)\n\n改动: ${command.subject}`,
                }
              : {
                  title: `Plan: ${command.subject}`,
                  description: `由工坊对话创建的计划任务 (Plan mode)\n\n目标: ${command.subject}`,
                };
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        text += "\n(h5 端未接入登录会话, 已按指令记录分发结果)";
      }
      setMessages((prev) => [...prev, { id, role: "assistant", text }]);
    },
    [company?.id],
  );

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const nextId = `m${messages.length + 1}`;
    setMessages((prev) => [...prev, { id: `${nextId}u`, role: "user", text }]);

    const command = parseCommand(text);
    if (command.kind === "pipeline" || command.kind === "plan" || command.kind === "pr") {
      void dispatchCommand(command, `${nextId}a`);
      return;
    }
    setMessages((prev) => [
      ...prev,
      { id: `${nextId}a`, role: "assistant", text: CANNED_REPLY },
    ]);
  }, [draft, messages.length, dispatchCommand]);

  const composer = (
    <div style={styles.composer}>
      <input
        style={styles.input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") send();
        }}
        placeholder="对工坊说点什么… (回车发送)"
        spellCheck={false}
      />
      <button type="button" style={styles.sendBtn} onClick={send} disabled={!draft.trim()}>
        发送
      </button>
    </div>
  );

  const bubbles = useMemo(
    () => messages.map((m) => <MessageBubble key={m.id} message={m} />),
    [messages],
  );

  return (
    <div style={styles.wrap}>
      {embedded ? (
        <div style={styles.embeddedBar}>
          嵌入模式 · {company?.name ?? "未选择公司"}
        </div>
      ) : (
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.headerTitle}>工坊</div>
            <div style={styles.headerSubtitle}>
              {company?.name ?? "Coolie"}
              {whoami ? ` · ${whoami}` : ""}
            </div>
          </div>
          {onOpenWorkspace ? (
            <button type="button" style={styles.workspaceBtn} onClick={onOpenWorkspace}>
              ▦ 工作空间
            </button>
          ) : null}
        </div>
      )}

      <div style={styles.stream}>{bubbles}</div>

      {composer}
    </div>
  );
}

function MessageBubble({ message }: { message: MockMessage }) {
  const parsed = useMemo(
    () =>
      hasInlinePreviewTag(message.text)
        ? parseInlineTags(message.text, message.id)
        : { cleanText: message.text, previews: [] },
    [message.id, message.text],
  );
  const isUser = message.role === "user";

  return (
    <div style={{ ...styles.row, ...(isUser ? styles.rowUser : null) }}>
      <div style={{ ...styles.bubble, ...(isUser ? styles.bubbleUser : styles.bubbleAssistant) }}>
        {parsed.cleanText ? <div style={styles.bubbleText}>{parsed.cleanText}</div> : null}
        {parsed.previews.map((p) => (
          <div key={p.id} style={styles.previewSlot}>
            {p.kind === "diff" ? (
              <CodeDiffCard file={p.file} lang={p.lang} patch={p.patch ?? ""} />
            ) : (
              <InlinePreviewPanel
                url={p.url}
                imageUrl={p.imageUrl}
                title={p.title}
                meta={p.meta}
              />
            )}
          </div>
        ))}
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
    height: "100%",
    backgroundColor: "#08090A",
    color: "#F7F8F8",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  headerLeft: { display: "flex", flexDirection: "column" },
  headerTitle: { color: "#F7F8F8", fontSize: 16, fontWeight: 600 },
  headerSubtitle: { color: "#62666D", fontSize: 11, marginTop: 1 },
  workspaceBtn: {
    backgroundColor: "rgba(94,106,210,0.14)",
    border: "1px solid #5E6AD2",
    borderRadius: 8,
    padding: "7px 12px",
    color: "#7170FF",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },
  embeddedBar: {
    padding: "6px 16px",
    color: "#62666D",
    fontSize: 11,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  stream: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  row: { display: "flex", justifyContent: "flex-start" },
  rowUser: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "78%",
    borderRadius: 12,
    padding: "9px 12px",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  bubbleUser: { backgroundColor: "rgba(94,106,210,0.16)", borderColor: "rgba(94,106,210,0.35)" },
  bubbleAssistant: { backgroundColor: "#0F1011" },
  bubbleText: { color: "#D0D6E0", fontSize: 14, lineHeight: "20px", whiteSpace: "pre-wrap" },
  previewSlot: { marginTop: 8 },
  composer: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: "#F7F8F8",
    fontSize: 14,
    padding: "9px 12px",
    backgroundColor: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    outline: "none",
  },
  sendBtn: {
    backgroundColor: "#5E6AD2",
    border: "none",
    borderRadius: 8,
    padding: "9px 16px",
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
};

export default BoardChatScreen;
