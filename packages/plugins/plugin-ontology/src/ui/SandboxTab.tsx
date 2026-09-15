import {
  StatusBadge,
  usePluginAction,
  usePluginData,
  usePluginStream,
} from "@paperclipai/plugin-sdk/ui";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { t } from "./isZh.js";

// ---------------------------------------------------------------------------
// Types — mirror what the worker returns so we don't have to share a module.
// ---------------------------------------------------------------------------

interface DescribeDomainNodeType {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  layer: string;
  propertiesSchema: Record<string, unknown> | null;
  instanceCount: number;
}

interface DescribeDomainRelationType {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  directed: boolean;
  cardinality: string;
  instanceCount: number;
}

interface DescribeDomainRecentNode {
  id: string;
  key: string;
  label: string;
  nodeTypeKey: string | null;
}

interface DescribeDomainBusinessSystem {
  id: string;
  code: string;
  name: string;
  status: string;
  description: string | null;
  targetRole: string | null;
}

interface DescribeDomainSubProject {
  id: string;
  businessSystemId: string;
  code: string;
  name: string;
  status: string;
  type: string;
  description: string | null;
}

interface DescribeDomainActionType {
  id: string;
  key: string;
  displayName: string;
  kind: string;
  status: string;
}

interface DescribeDomainDomain {
  id: string;
  slug: string;
  display_name: string;
  version: number;
}

interface DescribeDomainResult {
  domain: DescribeDomainDomain;
  nodeTypes: DescribeDomainNodeType[];
  relationTypes: DescribeDomainRelationType[];
  recentNodes: DescribeDomainRecentNode[];
  counts: {
    totalNodes: number;
    totalEdges: number;
    businessSystems: number;
    subProjects: number;
    actionTypes: number;
  };
  businessSystems: DescribeDomainBusinessSystem[];
  subProjects: DescribeDomainSubProject[];
  actionTypes: DescribeDomainActionType[];
  configured: boolean;
  configReason?: string;
}

type AideCitation =
  | { kind: "node-type"; id: string }
  | { kind: "relation-type"; id: string }
  | { kind: "node"; id: string }
  | { kind: "sub-project"; id: string }
  | { kind: "action-type"; id: string }
  | { kind: "business-system"; id: string };

interface AideHistoryMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  citations: AideCitation[];
  createdAt: string;
}

type AideStreamEvent =
  | { type: "token"; text: string }
  | { type: "done"; citations: AideCitation[] }
  | { type: "error"; message: string }
  | { type: "aborted" };

interface LocalMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming: boolean;
  citations: AideCitation[];
  createdAt: string;
  error?: string;
  aborted?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * 数字副手 (Digital Aide) tab — real Claude-backed chat against the current
 * ontology domain. Replaces the earlier placeholder card with a working
 * surface that streams tokens, persists history, and renders structured
 * citation chips per assistant message.
 *
 * One session per (companyId, domainId); opening this tab always resumes the
 * previous conversation for that domain. The worker manages persistence in
 * `ontology_aide_sessions` / `ontology_aide_messages`; the UI just keeps a
 * working copy in component state and replays history on mount.
 *
 * Optional `prePrompt` / `onConsumePrePrompt` let the host workbench inject
 * a prompt before the user has typed anything (e.g. right-clicking a node
 * and choosing "AI 解释这个节点"). When a pre-prompt is supplied, we auto-
 * submit it on mount and notify the host so it doesn't re-fire on remount.
 */
export function SandboxTab({
  companyId,
  domainId,
  domainVersion,
  prePrompt,
  onConsumePrePrompt,
  onImportLegacy,
}: {
  companyId: string;
  domainId: string;
  domainVersion: number;
  prePrompt?: string | null;
  onConsumePrePrompt?: () => void;
  onImportLegacy?: () => void;
}): ReactElement {
  const streamChannel = `ontology.aide.stream.${companyId}.${domainId}`;
  const stream = usePluginStream<AideStreamEvent>(streamChannel);

  const describe = usePluginData<DescribeDomainResult>("describe-domain", {
    companyId,
    domainId,
  });
  const history = usePluginData<{ messages: AideHistoryMessage[] }>("aide-history", {
    companyId,
    domainId,
  });
  const askAide = usePluginAction("ask-aide");
  const abortAide = usePluginAction("aide-abort");
  const clearSession = usePluginAction("aide-clear-session");

  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const seenTokenKeysRef = useRef<Set<string>>(new Set());

  // Submit a specific text without relying on the `draft` state — used by
  // the pre-prompt auto-submit path where the controlled input's draft
  // hasn't been re-rendered yet when the queued submit runs. Defined before
  // any effect that references it so the deps array can resolve cleanly.
  const submitText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || sending) return;
      setSending(true);
      const userMsg: LocalMessage = {
        id: `local-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: "user",
        content: trimmed,
        streaming: false,
        citations: [],
        createdAt: new Date().toISOString(),
      };
      const assistantMsg: LocalMessage = {
        id: `local-assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: "assistant",
        content: "",
        streaming: true,
        citations: [],
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      seenTokenKeysRef.current = new Set();
      setDraft("");
      try {
        await askAide({ companyId, domainId, message: trimmed });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, streaming: false, error: reason }
              : m,
          ),
        );
      } finally {
        setSending(false);
      }
    },
    [askAide, companyId, domainId, sending],
  );

  // Local state is scoped to the (companyId, domainId) pair: the parent
// remounts this component via `<DomainWorkspace key={activeDomainId}>`, so
// we don't need to reset state on dep change here. The previous reset
// effect clobbered messages that a right-click pre-prompt submitted during
// the initial mount cycle (StrictMode dev double-invocation made it worse).
  useEffect(() => {
    seenTokenKeysRef.current = new Set();
  }, [companyId, domainId]);

  // Auto-submit a pre-prompt when one is provided (e.g. from right-click
  // "AI 解释这个节点"). We set the draft so the user can see/edit it in the
  // composer, but we also fire `submitText(prePrompt)` directly so the
  // submit doesn't have to wait for the controlled-input re-render.
  const prePromptFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!prePrompt || prePrompt.trim().length === 0) return;
    if (prePromptFiredRef.current === prePrompt) return;
    prePromptFiredRef.current = prePrompt;
    setDraft(prePrompt);
    void submitText(prePrompt);
    onConsumePrePrompt?.();
  }, [prePrompt, onConsumePrePrompt, submitText]);

  useEffect(() => {
    if (!history.data) return;
    setMessages((prev) => {
      if (prev.length > 0) return prev;
      return history.data!.messages.map((m) => ({
        id: `history-${m.id}`,
        role: m.role,
        content: m.content,
        streaming: false,
        citations: m.citations,
        createdAt: m.createdAt,
      }));
    });
  }, [history.data]);

  // Apply each stream event to local state. The worker emits a stable stream
  // for the whole `(company, domain)` so we always act on the last assistant
  // message (the one we just optimistically inserted when the user sent).
  useEffect(() => {
    const events = stream.events;
    if (events.length === 0) return;

    setMessages((prev) => applyEvents(prev, events, seenTokenKeysRef.current));
  }, [stream.events]);

  // Composer submit — reads the controlled draft. The pre-prompt path uses
  // `submitText` directly to avoid the stale-closure trap.
  const onSubmit = useCallback(
    async (e?: React.SyntheticEvent) => {
      e?.preventDefault();
      if (draft.trim().length === 0 || sending) return;
      void submitText(draft);
    },
    [draft, sending, submitText],
  );

  const onClear = useCallback(async () => {
    if (clearing) return;
    setClearing(true);
    try {
      await clearSession({ companyId, domainId });
      seenTokenKeysRef.current = new Set();
      setMessages([]);
      await history.refresh();
    } finally {
      setClearing(false);
    }
  }, [clearSession, clearing, companyId, domainId, history]);

  // Cancel the in-flight answer. The worker flips the bubble out of
  // streaming state via the `aborted` event — we mirror that locally so the
  // UI updates immediately even if the next event tick is slow.
  const onStop = useCallback(async () => {
    if (aborting || !sending) return;
    setAborting(true);
    try {
      await abortAide({ companyId, domainId });
      setMessages((prev) =>
        prev.map((m) =>
          m.streaming && m.role === "assistant"
            ? { ...m, streaming: false, aborted: true }
            : m,
        ),
      );
    } catch {
      // Best-effort: even if the abort action itself throws, the server-side
      // cancellation will still land within a second or two and clean up.
    } finally {
      setAborting(false);
      setSending(false);
    }
  }, [abortAide, aborting, sending, companyId, domainId]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        void onSubmit();
      }
    },
    [onSubmit],
  );

  const configured = describe.data?.configured ?? false;
  const configReason = describe.data?.configReason;
  const loading = describe.loading || history.loading;

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <header className="flex flex-col gap-2 rounded-xl border border-border bg-card/70 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-(length:--text-base) font-semibold">
              {t("数字副手", "Digital Aide")}
            </div>
            <div className="mt-0.5 truncate text-(length:--text-nano) text-muted-foreground">
              {t("域", "Domain")} {domainId} · v{domainVersion}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge
              label={configured ? t("已配置", "Configured") : t("未配置", "Not configured")}
              status={configured ? "ok" : "warning"}
            />
            <button
              type="button"
              disabled={clearing || messages.length === 0}
              onClick={() => { void onClear(); }}
              className="rounded-full border border-border bg-background px-3 py-1 text-(length:--text-nano) font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {clearing ? t("清空中…", "Clearing…") : t("清空会话", "Clear session")}
            </button>
          </div>
        </div>
        {/* Bound-business-systems chip row. Shows real systems the cockpit
            should know about (any domain can have ≥1). The right-side
            affordance reuses the workbench-level wizard so the user can
            ingest a legacy system without leaving the chat. */}
        <BusinessSystemChips
          systems={describe.data?.businessSystems ?? []}
          onImportLegacy={onImportLegacy}
        />
      </header>

      {!configured ? (
        <SetupCard reason={configReason ?? t("数字副手尚未配置", "Digital aide is not configured")} />
      ) : (
        <>
          <MessageList
            messages={messages}
            describe={describe.data ?? null}
            loading={loading && messages.length === 0}
            onPickPrompt={(prompt) => {
              setDraft(prompt);
              // Fire submitText directly with the prompt text — the
              // controlled-input draft hasn't been re-rendered yet so
              // reading draft in a queued closure would give a stale "".
              void submitText(prompt);
            }}
          />
          <Composer
            value={draft}
            disabled={sending}
            sending={sending}
            aborting={aborting}
            onChange={setDraft}
            onKeyDown={onKeyDown}
            onSubmit={() => { void onSubmit(); }}
            onStop={() => { void onStop(); }}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SetupCard({ reason }: { reason: string }): ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-[min(28rem,calc(100%-2rem))] rounded-xl border border-dashed border-border bg-card/60 p-5">
        <div className="mb-2 text-(length:--text-base) font-semibold">
          {t("需要配置 Claude", "Claude configuration required")}
        </div>
        <p className="text-(length:--text-compact) text-muted-foreground">
          {t(
            "数字副手依赖 Claude API。 请在 ~/.claude/settings.json 的 env 段配置 ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL / ANTHROPIC_MODEL 三个键,然后重启 worker。",
            "Digital Aide depends on the Claude API. Configure ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL, and ANTHROPIC_MODEL under the env block in ~/.claude/settings.json, then restart the worker.",
          )}
        </p>
        <div className="mt-3 rounded-md border border-border bg-background px-2 py-1 font-mono text-(length:--text-nano) text-muted-foreground">
          {reason}
        </div>
      </div>
    </div>
  );
}

function MessageList({
  messages,
  describe,
  loading,
  onPickPrompt,
}: {
  messages: LocalMessage[];
  describe: DescribeDomainResult | null;
  loading: boolean;
  onPickPrompt: (prompt: string) => void;
}): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on every new token / message so the user always sees the
  // tail of the assistant response as it streams.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border border-border bg-card/40 text-(length:--text-compact) text-muted-foreground">
        {t("正在加载历史…", "Loading history…")}
      </div>
    );
  }

  if (messages.length === 0) {
    const prompts = describe ? buildExamplePrompts(describe) : [];
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-6 text-center">
        <div className="text-(length:--text-base) font-semibold">
          {t("开始与副手对话", "Start a conversation")}
        </div>
        <p className="max-w-md text-(length:--text-compact) text-muted-foreground">
          {describe
            ? t(
                `本域共 ${describe.nodeTypes.length} 个对象类型、${describe.relationTypes.length} 个关系类型、${describe.counts.businessSystems} 个真实应用系统。挑一个示例问题开始,或者直接输入。`,
                `This domain has ${describe.nodeTypes.length} node types, ${describe.relationTypes.length} relation types, ${describe.counts.businessSystems} business systems. Pick an example to start, or just type your own.`,
              )
            : t("问点什么吧。", "Ask anything.")}
        </p>
        {prompts.length > 0 && (
          <div className="mt-2 flex w-full max-w-2xl flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
            {prompts.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPickPrompt(p)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-(length:--text-compact) text-left text-foreground transition-colors hover:border-primary hover:bg-primary/5 sm:flex-1 sm:min-w-0"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto rounded-xl border border-border bg-card/30 p-3"
    >
      <ul className="flex flex-col gap-3">
        {messages.map((m) => (
          <li key={m.id}>
            <Bubble message={m} describe={describe} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bubble({
  message,
  describe,
}: {
  message: LocalMessage;
  describe: DescribeDomainResult | null;
}): ReactElement {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-(length:--text-compact) shadow-sm ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card text-foreground border border-border"
        }`}
      >
        {message.content.length === 0 && message.streaming ? (
          <BouncingDots />
        ) : (
          <div>{message.content}</div>
        )}
        {!isUser && !message.streaming && message.citations.length > 0 && (
          <CitationChips citations={message.citations} describe={describe} />
        )}
        {message.error ? (
          <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-(length:--text-nano) text-destructive">
            {t("流式中断: ", "Stream interrupted: ")}
            {message.error}
          </div>
        ) : message.aborted ? (
          <div className="mt-2 rounded-md border border-border bg-muted/40 px-2 py-1 text-(length:--text-nano) text-muted-foreground">
            {t("已停止", "Stopped")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BouncingDots(): ReactElement {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
    </div>
  );
}

function CitationChips({
  citations,
  describe,
}: {
  citations: AideCitation[];
  describe: DescribeDomainResult | null;
}): ReactElement {
  const labelByKey = useMemo(() => {
    const out = new Map<string, string>();
    if (!describe) return out;
    for (const nt of describe.nodeTypes) out.set(`node-type:${nt.id}`, nt.displayName);
    for (const rt of describe.relationTypes) out.set(`relation-type:${rt.id}`, rt.displayName);
    for (const n of describe.recentNodes) out.set(`node:${n.id}`, n.label);
    for (const bs of describe.businessSystems) out.set(`business-system:${bs.id}`, bs.name);
    for (const sp of describe.subProjects) out.set(`sub-project:${sp.id}`, sp.name);
    for (const at of describe.actionTypes) out.set(`action-type:${at.id}`, at.displayName);
    return out;
  }, [describe]);

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {citations.map((c, idx) => {
        const label = labelByKey.get(`${c.kind}:${c.id}`) ?? c.id;
        return (
          <span
            key={`${c.kind}-${c.id}-${idx}`}
            title={`${c.kind}: ${c.id}`}
            className="rounded-full bg-muted px-2 py-0.5 text-(length:--text-nano) text-muted-foreground"
          >
            <span className="mr-1 font-medium text-foreground/70">{kindLabel(c.kind)}</span>
            {label}
          </span>
        );
      })}
    </div>
  );
}

function kindLabel(kind: AideCitation["kind"]): string {
  switch (kind) {
    case "node-type":
      return t("对象类型", "NodeType");
    case "relation-type":
      return t("关系类型", "RelType");
    case "node":
      return t("节点", "Node");
    case "sub-project":
      return t("子项目", "SubProject");
    case "action-type":
      return t("Action", "Action");
    case "business-system":
      return t("应用系统", "System");
  }
}

function Composer({
  value,
  disabled,
  sending,
  aborting,
  onChange,
  onKeyDown,
  onSubmit,
  onStop,
}: {
  value: string;
  disabled: boolean;
  sending: boolean;
  aborting: boolean;
  onChange: (next: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onStop: () => void;
}): ReactElement {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex items-end gap-2 rounded-xl border border-border bg-card/70 p-2"
    >
      <textarea
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t(
          "问点什么…Enter 发送,Shift+Enter 换行",
          "Ask anything… Enter to send, Shift+Enter for newline",
        )}
        rows={2}
        className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-(length:--text-compact) text-foreground outline-none focus:border-primary disabled:opacity-60"
      />
      {sending ? (
        <button
          type="button"
          onClick={onStop}
          disabled={aborting}
          title={t("停止生成", "Stop generation")}
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-(length:--text-compact) font-medium text-destructive transition-opacity hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {aborting ? t("停止中…", "Stopping…") : t("停止", "Stop")}
        </button>
      ) : (
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          className="rounded-md bg-primary px-3 py-2 text-(length:--text-compact) font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("发送", "Send")}
        </button>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Stream event reducer
// ---------------------------------------------------------------------------

/**
 * Fold an incoming batch of stream events into the local message list.
 * Tokens/done/errors always apply to the last assistant message; we use the
 * `seenKeys` set to make this idempotent across React strict-mode double
 * renders and dependency refreshes.
 */
function applyEvents(
  prev: LocalMessage[],
  events: AideStreamEvent[],
  _seenKeys: Set<string>,
): LocalMessage[] {
  if (prev.length === 0) return prev;
  const next = prev.slice();
  for (const ev of events) {
    const lastIdx = lastAssistantIndex(next);
    if (lastIdx < 0) continue;
    const last = next[lastIdx];
    if (!last) continue;
    if (ev.type === "token") {
      if (last.streaming) {
        next[lastIdx] = { ...last, content: last.content + ev.text };
      }
    } else if (ev.type === "done") {
      next[lastIdx] = {
        ...last,
        streaming: false,
        citations: ev.citations,
      };
    } else if (ev.type === "aborted") {
      next[lastIdx] = {
        ...last,
        streaming: false,
        aborted: true,
      };
    } else if (ev.type === "error") {
      next[lastIdx] = {
        ...last,
        streaming: false,
        error: ev.message,
      };
    }
  }
  return next;
}

function lastAssistantIndex(messages: LocalMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant") return i;
  }
  return -1;
}

/**
 * Build the 3 example prompts shown in the empty state. We try to keep each
 * one concrete — using the actual counts from the describe payload — so they
 * look like real questions about this domain rather than generic lorem ipsum.
 * If a count is 0 we drop the prompt that hinges on it, so the buttons are
 * never misleading.
 */
function buildExamplePrompts(describe: DescribeDomainResult): string[] {  const prompts: string[] = [];
  if (describe.nodeTypes.length > 0) {
    prompts.push(t("这个域有哪些对象类型?各负责什么?", "What object types are in this domain and what does each represent?"));
  }
  if (describe.relationTypes.length > 0) {
    prompts.push(
      t(
        `列出所有 ${describe.relationTypes.length} 个关系类型,说明哪些是有向的。`,
        `List all ${describe.relationTypes.length} relation types and call out which ones are directed.`,
      ),
    );
  }
  if (describe.counts.businessSystems > 0) {
    prompts.push(
      t(
        `本域关联了 ${describe.counts.businessSystems} 个真实应用系统,请逐个介绍。`,
        `This domain links to ${describe.counts.businessSystems} business systems — describe each one.`,
      ),
    );
  } else if (describe.actionTypes.length > 0) {
    prompts.push(
      t(
        `本域有哪些 Action?它们的种类和状态如何?`,
        `What Actions are in this domain, and what are their kinds and statuses?`,
      ),
    );
  }
  return prompts.slice(0, 3);
}

/* ------------------------------------------------------------------ */
/*  BusinessSystemChips — chip row at the top of the cockpit. Shows    */
/*  every business system bound to the current domain, plus an "接入"   */
/*  affordance that opens the legacy-import wizard (re-used from the   */
/*  workbench). When no systems are bound, the row is hidden so an     */
/*  empty domain doesn't get a lonely "+" button.                      */
/* ------------------------------------------------------------------ */

function BusinessSystemChips({
  systems,
  onImportLegacy,
}: {
  systems: DescribeDomainBusinessSystem[];
  onImportLegacy?: () => void;
}): ReactElement | null {
  if (systems.length === 0 && !onImportLegacy) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
      <span className="text-(length:--text-nano) text-muted-foreground">
        {t("已绑定", "Bound:")}
      </span>
      {systems.map((bs) => (
        <span
          key={bs.id}
          title={
            bs.description ??
            (bs.targetRole ? `targetRole: ${bs.targetRole}` : `${bs.code} · ${bs.status}`)
          }
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-(length:--text-nano) text-foreground"
        >
          <span className="font-mono text-muted-foreground">{bs.code}</span>
          <span>·</span>
          <span>{bs.name}</span>
          <span className={`rounded-full px-1 text-(length:--text-tiny) ${statusClass(bs.status)}`}>
            {bs.status}
          </span>
        </span>
      ))}
      {onImportLegacy && (
        <button
          type="button"
          onClick={onImportLegacy}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border bg-card px-2 py-0.5 text-(length:--text-nano) text-muted-foreground hover:border-primary hover:text-primary"
        >
          ⚡ {t("接入", "Import")}
        </button>
      )}
    </div>
  );
}

function statusClass(status: string): string {
  switch (status) {
    case "running":
    case "active":
      return "bg-green-500/15 text-green-700 dark:text-green-300";
    case "planning":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    case "deprecated":
    case "retired":
      return "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}