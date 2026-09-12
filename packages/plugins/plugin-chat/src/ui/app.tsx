import {
  DataTable,
  MetricCard,
  StatusBadge,
  useHostNavigation,
  usePluginAction,
  usePluginData,
  type PluginPageProps,
  type PluginSidebarProps,
} from "@paperclipai/plugin-sdk/ui";
import { useCallback, useState, type CSSProperties, type ReactElement } from "react";

const tokens = {
  border: "var(--border, oklch(0.269 0 0))",
  card: "var(--card, oklch(0.205 0 0))",
  bg: "var(--background, oklch(0.145 0 0))",
  fg: "var(--foreground, oklch(0.985 0 0))",
  muted: "var(--muted-foreground, oklch(0.708 0 0))",
  primary: "var(--primary, oklch(0.985 0 0))",
  primaryFg: "var(--primary-foreground, oklch(0.205 0 0))",
  accent: "var(--accent, oklch(0.269 0 0))",
};

const CHAT_MODES = ["chat", "mvp", "vibe", "build", "office"] as const;
type ChatMode = (typeof CHAT_MODES)[number];
type MessageRole = "user" | "assistant" | "system" | "tool";
type ConversationStatus = "active" | "idle" | "suspended" | "archived";

interface ChatConversation {
  id: string;
  conversation_key: string;
  name: string;
  mode: ChatMode;
  status: ConversationStatus;
  message_count: number;
  estimated_tokens: number;
  max_turns: number;
  token_budget: number;
}

interface ChatMessage {
  id: string;
  seq: number;
  role: MessageRole;
  content: string;
  tokens: number;
  created_at: string;
}

interface ContextWindow {
  totalTokens: number;
  truncated: boolean;
  messages: Array<{ role: MessageRole; content: string; tokens: number; seq: number }>;
}

interface ConversationDetail {
  conversation: ChatConversation | null;
  messages: ChatMessage[];
  context: ContextWindow | null;
}

const page: CSSProperties = { padding: "1.5rem", background: tokens.bg, color: tokens.fg, minHeight: "100%" };
const cardStyle: CSSProperties = {
  border: `1px solid ${tokens.border}`,
  background: tokens.card,
  borderRadius: "0.75rem",
  padding: "1rem",
  marginBottom: "0.75rem",
};
const inputStyle: CSSProperties = {
  border: `1px solid ${tokens.border}`,
  background: tokens.bg,
  color: tokens.fg,
  borderRadius: "0.5rem",
  padding: "0.4rem 0.6rem",
  marginRight: "0.5rem",
};
const btnStyle: CSSProperties = {
  border: "none",
  background: tokens.primary,
  color: tokens.primaryFg,
  borderRadius: "0.5rem",
  padding: "0.4rem 0.9rem",
  cursor: "pointer",
};
const ghostBtn: CSSProperties = { ...btnStyle, background: "transparent", color: tokens.primary, padding: 0 };

function statusKind(status: ConversationStatus): "ok" | "pending" | "error" {
  if (status === "active") return "ok";
  if (status === "archived" || status === "suspended") return "error";
  return "pending";
}

const SIDEBAR_ROW_CLASS =
  "flex items-center gap-2.5 mx-2 rounded-lg px-2 py-1.5 pointer-coarse:py-1 " +
  "text-(length:--text-compact) font-medium transition-colors no-underline " +
  "text-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export function SidebarLink(_props: PluginSidebarProps): ReactElement {
  const nav = useHostNavigation();
  return (
    <a {...nav.linkProps("/chat")} className={SIDEBAR_ROW_CLASS}>
      <span data-slot="sidebar-nav-icon" className="relative shrink-0" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 truncate">Chat</span>
    </a>
  );
}

/** Full-page intelligent-chat view: conversation list <-> session detail. */
export function ChatPage({ context }: PluginPageProps): ReactElement {
  const companyId = context.companyId ?? undefined;
  const [openId, setOpenId] = useState<string | null>(null);

  if (!companyId) {
    return (
      <div style={page}>
        <p style={{ color: tokens.muted }}>Select a company to start chatting.</p>
      </div>
    );
  }

  return (
    <div style={page}>
      <h1 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Intelligent Chat</h1>
      {openId ? (
        <ConversationView companyId={companyId} conversationId={openId} onBack={() => setOpenId(null)} />
      ) : (
        <ConversationList companyId={companyId} onOpen={setOpenId} />
      )}
    </div>
  );
}

function ConversationList({
  companyId,
  onOpen,
}: {
  companyId: string;
  onOpen: (id: string) => void;
}): ReactElement {
  const [modeFilter, setModeFilter] = useState<"" | ChatMode>("");
  const { data, loading, error, refresh } = usePluginData<{ conversations: ChatConversation[] }>(
    "list-conversations",
    { companyId, mode: modeFilter },
  );
  const createConversation = usePluginAction("create-conversation");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<ChatMode>("chat");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setFormError(null);
    try {
      const res = (await createConversation({ companyId, name: name || undefined, mode })) as {
        conversation?: ChatConversation;
      };
      setName("");
      refresh();
      if (res?.conversation?.id) onOpen(res.conversation.id);
    } catch (err) {
      setFormError(String((err as Error)?.message ?? err));
    } finally {
      setBusy(false);
    }
  }, [companyId, name, mode, createConversation, refresh, onOpen]);

  return (
    <>
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>New conversation</div>
        <input style={inputStyle} placeholder="name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <select style={inputStyle} value={mode} onChange={(e) => setMode(e.target.value as ChatMode)}>
          {CHAT_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button style={btnStyle} disabled={busy} onClick={submit}>
          {busy ? "…" : "Create"}
        </button>
        {formError && <div style={{ color: tokens.muted, marginTop: "0.5rem" }}>{formError}</div>}
      </div>

      <div style={{ marginBottom: "0.5rem" }}>
        <span style={{ color: tokens.muted, marginRight: "0.5rem" }}>Mode</span>
        <select style={inputStyle} value={modeFilter} onChange={(e) => setModeFilter(e.target.value as "" | ChatMode)}>
          <option value="">all</option>
          {CHAT_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : "No conversations yet."}
        rows={(data?.conversations ?? []) as unknown as Record<string, unknown>[]}
        columns={[
          {
            key: "name",
            header: "Conversation",
            render: (_v, row) => (
              <button style={ghostBtn} onClick={() => onOpen((row as unknown as ChatConversation).id)}>
                {(row as unknown as ChatConversation).name}
              </button>
            ),
          },
          { key: "mode", header: "Mode", width: "90px" },
          { key: "message_count", header: "Msgs", width: "70px" },
          { key: "estimated_tokens", header: "Tokens", width: "90px" },
          {
            key: "status",
            header: "Status",
            width: "110px",
            render: (_v, row) => {
              const status = (row as unknown as ChatConversation).status;
              return <StatusBadge label={status} status={statusKind(status)} />;
            },
          },
        ]}
      />
    </>
  );
}

function ConversationView({
  companyId,
  conversationId,
  onBack,
}: {
  companyId: string;
  conversationId: string;
  onBack: () => void;
}): ReactElement {
  const { data, loading, error, refresh } = usePluginData<ConversationDetail>("conversation-detail", {
    companyId,
    conversationId,
  });
  const appendMessage = usePluginAction("append-message");
  const transition = usePluginAction("transition-conversation");
  const [draft, setDraft] = useState("");
  const [role, setRole] = useState<MessageRole>("user");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const convo = data?.conversation;

  const send = useCallback(async () => {
    if (!draft.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await appendMessage({ companyId, conversationId, role, content: draft });
      setDraft("");
      refresh();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, conversationId, role, draft, appendMessage, refresh]);

  const doTransition = useCallback(
    async (to: ConversationStatus) => {
      setErr(null);
      try {
        await transition({ companyId, conversationId, to });
        refresh();
      } catch (e) {
        setErr(String((e as Error)?.message ?? e));
      }
    },
    [companyId, conversationId, transition, refresh],
  );

  return (
    <>
      <button style={{ ...ghostBtn, marginBottom: "0.75rem" }} onClick={onBack}>
        ← Back
      </button>

      {loading && <p style={{ color: tokens.muted }}>Loading…</p>}
      {error && <p style={{ color: tokens.muted }}>Failed: {error.message}</p>}

      {convo && (
        <>
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
              <div>
                <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>{convo.name}</div>
                <div style={{ color: tokens.muted, fontSize: "0.85rem" }}>
                  {convo.mode} · <StatusBadge label={convo.status} status={statusKind(convo.status)} />
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {convo.status !== "idle" && convo.status !== "archived" && (
                  <button style={ghostBtn} onClick={() => doTransition("idle")}>
                    Idle
                  </button>
                )}
                {convo.status === "idle" && (
                  <button style={ghostBtn} onClick={() => doTransition("active")}>
                    Activate
                  </button>
                )}
                {convo.status !== "archived" && (
                  <button style={ghostBtn} onClick={() => doTransition("archived")}>
                    Archive
                  </button>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
            <MetricCard label="Messages" value={convo.message_count} />
            <MetricCard label="Est. tokens" value={convo.estimated_tokens} />
            <MetricCard label="Context tokens" value={data?.context?.totalTokens ?? 0} />
            <MetricCard label="Max turns" value={convo.max_turns} />
          </div>

          {data?.context?.truncated && (
            <div style={{ color: tokens.muted, fontSize: "0.85rem", marginBottom: "0.5rem" }}>
              ⚠ Context window truncated to fit the token budget ({convo.token_budget}).
            </div>
          )}

          <MessageStream messages={data?.messages ?? []} />

          <div style={cardStyle}>
            <div style={{ marginBottom: "0.5rem" }}>
              <select style={inputStyle} value={role} onChange={(e) => setRole(e.target.value as MessageRole)}>
                <option value="user">user</option>
                <option value="assistant">assistant</option>
                <option value="system">system</option>
                <option value="tool">tool</option>
              </select>
            </div>
            <textarea
              style={{ ...inputStyle, width: "100%", minHeight: "4rem", marginRight: 0, boxSizing: "border-box", resize: "vertical" }}
              placeholder="Type a message…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void send();
              }}
            />
            <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button style={btnStyle} disabled={busy || !draft.trim()} onClick={send}>
                {busy ? "…" : "Send"}
              </button>
              <span style={{ color: tokens.muted, fontSize: "0.8rem" }}>⌘/Ctrl+Enter</span>
              {err && <span style={{ color: tokens.muted }}>{err}</span>}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function MessageStream({ messages }: { messages: ChatMessage[] }): ReactElement {
  if (messages.length === 0) {
    return (
      <div style={cardStyle}>
        <span style={{ color: tokens.muted }}>No messages yet. Send the first turn below.</span>
      </div>
    );
  }
  return (
    <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      {messages.map((m) => {
        const mine = m.role === "user";
        return (
          <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
            <div
              style={{
                maxWidth: "85%",
                background: mine ? tokens.primary : tokens.accent,
                color: mine ? tokens.primaryFg : tokens.fg,
                borderRadius: "1rem",
                borderBottomRightRadius: mine ? "0.25rem" : "1rem",
                borderBottomLeftRadius: mine ? "1rem" : "0.25rem",
                padding: "0.5rem 0.8rem",
              }}
            >
              <div style={{ fontSize: "0.72rem", opacity: 0.7, marginBottom: "0.15rem" }}>
                #{m.seq} · {m.role} · {m.tokens} tok
              </div>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.content}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
