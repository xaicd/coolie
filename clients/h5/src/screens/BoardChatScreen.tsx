/**
 * BoardChatScreen (h5 简化版) —— 工坊对话流 + 内嵌预览
 *
 * spec §5: "❌ 完整的 BoardChatScreen（只做最小骨架）"。app 端那份 4000+ 行的
 * 流式/审批/构建卡一律不要, 这里只保留本波真正要验证的三件事:
 *   1. 真接口: 拉取常驻 Board Operations Issue 的历史评论, 渲染 SSE 流式回复;
 *      失败 / 公司未选 时如实显示错误, 不假装成功 (wave66 老板 25:15 '派' P2)。
 *   2. 对话文本里夹带的 `<preview-url>` / `<preview-mvp>` 标签, 被就地渲染成
 *      InlinePreviewPanel, 而不是跳走;
 *   3. 右上角 [Workspace] 入口, 由 App.tsx 注入, 拉起工作空间。
 *
 * 不依赖 expo / react-native, 纯 HTML + React 19。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { coolie } from "../coolie";

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

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

/**
 * wave71: h5 附件上传 — 用 hidden <input type="file"> 拿附件, 走同样的
 * uploadAttachment → attachmentIds 路径。h5 没有 ActionSheet, 直接弹原生
 * 文件选择器。
 */
interface StagedFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  file: File;
}

/** wave71: 三态机 — 'idle' / 'thinking' / 'streaming' */
type LoadingState = "idle" | "thinking" | "streaming";

/**
 * wave66 (老板 25:15 '派' P2): 真接口拉取常驻会话 + SSE 推送。无公司 / 拉取失败时
 * 显示空状态, 不预填任何 SEED 假数据, 不假装 SSE 推送可用。
 */
export function BoardChatScreen({
  company,
  whoami,
  embedded = false,
  onOpenWorkspace,
}: BoardChatScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  /** wave71: 三态机 + 首 token 标志 → 驱动 typing/streaming 提示 */
  const [hasFirstToken, setHasFirstToken] = useState(false);
  /** wave71: 工坊会话 issueId, 上传附件时需要 */
  const [boardIssueId, setBoardIssueId] = useState<string | null>(null);
  /** wave71: 附件上传队列 */
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  /** wave71: 清空确认 modal */
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // wave66: 真接口拉取历史 (常驻 Board Operations Issue)。公司未选时跳过。
  useEffect(() => {
    const companyId = company?.id;
    if (!companyId || companyId === "local-stub") {
      setMessages([]);
      setHistoryError(null);
      setLoadingHistory(false);
      return;
    }
    let cancelled = false;
    setLoadingHistory(true);
    setHistoryError(null);
    coolie
      .getBoardChatHistory(companyId)
      .then((hist) => {
        if (cancelled) return;
        // Filter out system messages — they belong to /api/board/chat/stream
        // tool events, not the user-visible conversation. This screen renders
        // only the 2-role dialogue (`user` / `assistant`).
        const visible = hist.messages
          .filter((m): m is typeof m & { role: "user" | "assistant" } =>
            m.role === "user" || m.role === "assistant",
          )
          .map((m) => ({ id: m.id, role: m.role, text: m.text }));
        setMessages(visible);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setHistoryError(err instanceof Error ? err.message : "加载历史失败");
        setMessages([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [company?.id]);

  /**
   * 长按 mic: 浏览器原生语音识别 (Web Speech API), 结果直接追加进输入框,
   * 由用户确认后再发送。h5 不调服务端 ASR (brief §3.4: 用浏览器原生)。
   */
  const startVoice = useCallback(() => {
    if (recognitionRef.current) return;
    const w = window as any;
    const SpeechRecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setVoiceNote("当前浏览器不支持语音识别, 请改用键盘输入");
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as ArrayLike<any>)
        .map((result: any) => result[0]?.transcript ?? "")
        .join("")
        .trim();
      if (transcript) {
        setDraft((prev) => (prev ? `${prev} ${transcript}` : transcript));
        setVoiceNote(`🎤 已转写: ${transcript}`);
      } else {
        setVoiceNote("🎤 没听清, 请再说一次");
      }
    };
    recognition.onerror = () => {
      setVoiceNote("🎤 语音识别失败, 请重试");
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setVoiceNote("🎤 录音中… 松开转文字");
    setListening(true);
    recognition.start();
  }, []);

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

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
      } catch (err) {
        // wave66: 失败如实上报, 不假装成功。
        const reason = err instanceof Error ? err.message : "未知错误";
        text = `⚠️ 指令下发失败: ${reason}\n${label} · ${command.subject}`;
      }
      setMessages((prev) => [...prev, { id, role: "assistant", text }]);
    },
    [company?.id],
  );

  /**
   * wave66: 真 SSE 推送 (POST /api/board/chat/stream)。未选公司 / SSE 失败
   * 时如实显示错误, 不返回固定 CANNED_REPLY (老板 25:15 '派' P2)。
   *
   * wave71: 附件上传 — 先用 fetch /uploadAttachment 拿到 attachment.id,
   * 一起随 message 提交; clearBoardConversation 走 DELETE 同款路由。
   */
  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || streaming) return;
    const companyId = company?.id;
    if (!companyId || companyId === "local-stub") {
      setMessages((prev) => [
        ...prev,
        {
          id: `m${prev.length + 1}a`,
          role: "assistant",
          text: "⚠️ 当前未选择公司 (h5 还在 local-stub), 请先登录真实会话再发对话。",
        },
      ]);
      return;
    }
    setDraft("");
    const nextId = `m${messages.length + 1}`;
    setMessages((prev) => [...prev, { id: `${nextId}u`, role: "user", text }]);

    const command = parseCommand(text);
    if (command.kind === "pipeline" || command.kind === "plan" || command.kind === "pr") {
      void dispatchCommand(command, `${nextId}a`);
      return;
    }

    // wave71: 附件上传 — 先把 staged files 走 multipart 上传到 board issue,
    // 拿到 attachment.id 后随 message 一起 POST。
    let attachmentIds: string[] = [];
    if (stagedFiles.length > 0) {
      setUploadingFile(true);
      try {
        const ids = await Promise.all(
          stagedFiles.map(async (entry) => {
            const uploaded = await coolie.uploadAttachment(
              companyId,
              boardIssueId ?? "",
              entry.file,
            );
            return uploaded.id;
          }),
        );
        attachmentIds = ids.filter((id): id is string => Boolean(id));
      } catch (err) {
        const reason = err instanceof Error ? err.message : "附件上传失败";
        setMessages((prev) => [
          ...prev,
          {
            id: `m${prev.length + 1}err`,
            role: "assistant",
            text: `⚠️ 附件上传失败: ${reason}`,
          },
        ]);
        setUploadingFile(false);
        return;
      } finally {
        setUploadingFile(false);
        setStagedFiles([]);
      }
    }

    // 普通对话 → 真 SSE 流式推送
    setStreaming(true);
    setHasFirstToken(false);
    const assistantId = `${nextId}a`;
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", text: "" }]);
    try {
      await coolie.streamBoardChat(
        {
          companyId,
          message: text,
          taskId: boardIssueId ?? undefined,
          attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        },
        {
          onStart: (issueId) => {
            setBoardIssueId(issueId);
          },
          onChunk: (chunk) => {
            setHasFirstToken(true);
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + chunk } : m)),
            );
          },
          onError: (msg) => {
            const errText = typeof msg === "string" ? msg : (msg?.message ?? "流式推送失败");
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, text: m.text ? `${m.text}\n\n⚠️ ${errText}` : `⚠️ ${errText}` }
                  : m,
              ),
            );
          },
        },
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : "流式推送失败";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, text: m.text ? `${m.text}\n\n⚠️ ${reason}` : `⚠️ ${reason}` }
            : m,
        ),
      );
    } finally {
      setStreaming(false);
      setHasFirstToken(false);
    }
  }, [draft, messages.length, dispatchCommand, company?.id, streaming, stagedFiles, boardIssueId]);

  /**
   * wave71: 工坊对话框清空 — DELETE /api/board/chat/conversation/:issueId。
   * 本地 messages 同步置空 (回到「暂无对话」空态)。
   */
  const clearConversation = useCallback(async () => {
    setConfirmClear(false);
    const companyId = company?.id;
    if (!companyId || companyId === "local-stub") {
      setMessages([]);
      return;
    }
    setClearing(true);
    try {
      if (boardIssueId) {
        await coolie.clearBoardConversation(companyId, boardIssueId);
      }
      setMessages([]);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "清空失败";
      setMessages((prev) => [
        ...prev,
        {
          id: `m${prev.length + 1}err`,
          role: "assistant",
          text: `⚠️ 清空失败: ${reason}`,
        },
      ]);
    } finally {
      setClearing(false);
    }
  }, [boardIssueId, company?.id]);

  /**
   * wave71: 附件上传 — 弹原生文件选择器, 选中后 stage 到 stagedFiles。
   * 真正上传在 send 时再批量执行 (跟 server 端 addComment 后再 link
   * issueCommentId 的语义对齐)。
   */
  const handleFilePicked = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;
      const next: StagedFile[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;
        next.push({
          id: `${file.name}:${file.size}:${i}`,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          file,
        });
      }
      setStagedFiles((prev) => [...prev, ...next]);
      // reset 让下一次选同一文件也能触发 change
      event.target.value = "";
    },
    [],
  );

  const composer = (
    <div>
      {voiceNote ? <div style={styles.voiceNote}>{voiceNote}</div> : null}
      {/* wave71: 附件 stage 区 */}
      {stagedFiles.length > 0 ? (
        <div style={styles.stagedRow}>
          <span style={styles.stagedHint}>
            📎 已选 {stagedFiles.length} 个附件
            {uploadingFile ? " · 上传中…" : ""}
          </span>
          <button
            type="button"
            style={styles.stagedClear}
            onClick={() => setStagedFiles([])}
          >
            清空
          </button>
        </div>
      ) : null}
      <div style={styles.composer}>
        {/* wave71: hidden file input — 弹原生文件选择器 (图片/文件通用) */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={handleFilePicked}
        />
        <button
          type="button"
          aria-label="添加附件"
          title="添加附件"
          style={styles.attachBtn}
          onClick={() => fileInputRef.current?.click()}
        >
          ＋
        </button>
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
        {/* 长按录音, 松开自动转文字填入输入框 (不自动发送) */}
        <button
          type="button"
          aria-label="长按说话"
          title="长按说话"
          style={{ ...styles.micBtn, ...(listening ? styles.micBtnListening : null) }}
          onPointerDown={startVoice}
          onPointerUp={stopVoice}
          onPointerLeave={stopVoice}
        >
          {listening ? "🔴" : "🎤"}
        </button>
        <button type="button" style={styles.sendBtn} onClick={send} disabled={!draft.trim()}>
          发送
        </button>
      </div>
    </div>
  );

  const bubbles = useMemo(
    () => messages.map((m) => <MessageBubble key={m.id} message={m} />),
    [messages],
  );

  // wave71: 三态机 — 'idle' / 'thinking' / 'streaming'
  const loadingState: LoadingState = streaming
    ? hasFirstToken
      ? "streaming"
      : "thinking"
    : "idle";

  // wave66: 真接口空态 / 加载 / 错误三态, 替代原 SEED_MESSAGES 默认填充。
  const streamBody = (
    <>
      {loadingHistory ? (
        <div style={styles.statusLine}>加载常驻会话历史…</div>
      ) : null}
      {historyError ? (
        <div style={styles.errorLine}>⚠️ 加载历史失败: {historyError}</div>
      ) : null}
      {!loadingHistory && !historyError && messages.length === 0 ? (
        <div style={styles.statusLine}>
          {company?.id && company.id !== "local-stub"
            ? "常驻会话暂无对话, 在下面输入框跟工坊说点什么。"
            : "h5 端默认 local-stub 公司。要测真接口, 请先在 App 端登录后用 h5 拉取真实会话。"}
        </div>
      ) : null}
      {bubbles}
      {/* wave71: thinking 三点动画 — SSE 已连上但首 token 没回来时 */}
      {loadingState === "thinking" ? (
        <div style={styles.typingRow}>
          <span style={styles.typingDot} />
          <span style={{ ...styles.typingDot, animationDelay: "0.15s" }} />
          <span style={{ ...styles.typingDot, animationDelay: "0.3s" }} />
          <span style={styles.typingText}>总办正在处理并调取工坊数据…</span>
        </div>
      ) : null}
    </>
  );

  return (
    <div style={styles.wrap}>
      <style>{TYPING_KEYFRAMES}</style>
      {embedded ? (
        <div style={styles.embeddedBar}>
          嵌入模式 · {company?.name ?? "未选择公司"}
        </div>
      ) : (
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.headerTitle}>工坊</div>
            <div style={styles.headerSubtitle}>
              {loadingState === "thinking"
                ? "思考中…"
                : loadingState === "streaming"
                  ? "正在生成回复…"
                  : (company?.name ?? "Coolie") + (whoami ? ` · ${whoami}` : "")}
            </div>
          </div>
          <div style={styles.headerRight}>
            {/* wave71: 清空对话 */}
            {messages.length > 0 ? (
              <button
                type="button"
                aria-label="清空对话"
                title="清空对话"
                style={styles.clearBtn}
                onClick={() => setConfirmClear(true)}
              >
                🗑
              </button>
            ) : null}
            {onOpenWorkspace ? (
              <button type="button" style={styles.workspaceBtn} onClick={onOpenWorkspace}>
                ▦ 工作空间
              </button>
            ) : null}
          </div>
        </div>
      )}

      <div style={styles.stream}>{streamBody}</div>

      {composer}

      {/* wave71: 清空对话确认 Modal */}
      {confirmClear ? (
        <div style={styles.confirmBackdrop}>
          <button
            type="button"
            aria-label="关闭"
            style={StyleSheet_absoluteFill}
            onClick={() => !clearing && setConfirmClear(false)}
          />
          <div style={styles.confirmSheet}>
            <div style={styles.confirmTitle}>清空对话?</div>
            <div style={styles.confirmBody}>
              当前工坊会话的全部对话将被清空, 工坊会回到欢迎状态。此操作不可撤销。
            </div>
            <div style={styles.confirmRow}>
              <button
                type="button"
                style={styles.confirmBtnCancel}
                disabled={clearing}
                onClick={() => setConfirmClear(false)}
              >
                取消
              </button>
              <button
                type="button"
                style={styles.confirmBtnOk}
                disabled={clearing}
                onClick={() => void clearConversation()}
              >
                {clearing ? "清空中…" : "清空"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const StyleSheet_absoluteFill: CSSProperties = {
  position: "absolute",
  inset: 0,
  border: "none",
  background: "transparent",
  cursor: "default",
};

/** wave71: typing 三点跳动 keyframes — 跟 expo 端 TypingDots 的位移同步 */
const TYPING_KEYFRAMES = `@keyframes coolie-typing-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}`;

function MessageBubble({ message }: { message: ChatMessage }) {
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
  /** wave71: 顶部右侧 — [清空] + [Workspace] 并排 */
  headerRight: { display: "flex", alignItems: "center", gap: 6 },
  /** wave71: 清空对话按钮 */
  clearBtn: {
    backgroundColor: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    padding: "7px 10px",
    color: "#D0D6E0",
    fontSize: 14,
    lineHeight: "14px",
    cursor: "pointer",
  },
  /** wave71: 附件 + 按钮 */
  attachBtn: {
    backgroundColor: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    padding: "9px 10px",
    color: "#D0D6E0",
    fontSize: 16,
    lineHeight: "14px",
    cursor: "pointer",
  },
  /** wave71: stage 区 — 在 composer 上方一行 */
  stagedRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 16px",
    color: "#D0D6E0",
    fontSize: 12,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  stagedHint: { color: "#D0D6E0", fontSize: 12 },
  stagedClear: {
    background: "transparent",
    border: "none",
    color: "#7170FF",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },
  /** wave71: typing 三点动画 */
  typingRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "12px 4px",
    color: "#62666D",
    fontSize: 12,
  },
  typingDot: {
    display: "inline-block",
    width: 6,
    height: 6,
    borderRadius: "50%",
    backgroundColor: "#7170FF",
    animation: "coolie-typing-bounce 1.2s infinite ease-in-out",
  },
  typingText: { marginLeft: 4 },
  /** wave71: 清空对话确认 Modal */
  confirmBackdrop: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 24px",
    zIndex: 100,
  },
  confirmSheet: {
    backgroundColor: "#191A1B",
    borderRadius: 14,
    padding: "16px 18px",
    width: "100%",
    maxWidth: 360,
    border: "1px solid rgba(255,255,255,0.12)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    position: "relative",
  },
  confirmTitle: { color: "#F7F8F8", fontSize: 16, fontWeight: 600 },
  confirmBody: { color: "#D0D6E0", fontSize: 13, lineHeight: "20px" },
  confirmRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  confirmBtnCancel: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: 8,
    padding: "8px 14px",
    color: "#D0D6E0",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  confirmBtnOk: {
    backgroundColor: "#5E6AD2",
    border: "none",
    borderRadius: 8,
    padding: "8px 14px",
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
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
  micBtn: {
    backgroundColor: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
    lineHeight: "14px",
    cursor: "pointer",
    userSelect: "none",
    touchAction: "none",
  },
  micBtnListening: {
    backgroundColor: "rgba(239,68,68,0.16)",
    borderColor: "rgba(239,68,68,0.4)",
  },
  voiceNote: {
    padding: "6px 16px",
    color: "#8A8F98",
    fontSize: 12,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  // wave66: 真接口空态 / 加载 / 错误三态样式。
  statusLine: {
    color: "#62666D",
    fontSize: 12,
    padding: "16px 0",
    textAlign: "center",
  },
  errorLine: {
    color: "#F87171",
    fontSize: 12,
    padding: "10px 12px",
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: "rgba(239,68,68,0.10)",
    border: "1px solid rgba(239,68,68,0.25)",
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
