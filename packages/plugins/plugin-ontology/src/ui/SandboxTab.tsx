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
import type {
  DescribeDomainActionType as CoreDescribeDomainActionType,
  DescribeDomainBusinessSystem as CoreDescribeDomainBusinessSystem,
  DescribeDomainNodeType as CoreDescribeDomainNodeType,
  DescribeDomainRecentNode as CoreDescribeDomainRecentNode,
  DescribeDomainRelationType as CoreDescribeDomainRelationType,
  DescribeDomainSubProject as CoreDescribeDomainSubProject,
  DescribeDomainResult as CoreDescribeDomainResult,
} from "@paperclipai/ontology-core/graph/GraphStore.js";
import { MarkdownContent } from "./MarkdownContent.js";
import { CitationPreview, kindLabel } from "./CitationPreview.js";
import { EditCard } from "./EditCard.js";
import { SchemaPreviewPane } from "./SchemaPreviewPane.js";
import { SnapshotDrawer } from "./SnapshotDrawer.js";
import { type CockpitEditResult, type MutationCall } from "../aide/editOps.js";

// ---------------------------------------------------------------------------
// Types — mirror what the worker returns so we don't have to share a module.
// ---------------------------------------------------------------------------

/**
 * Storage key for the schema-preview pane toggle. Deliberately a new key: the
 * previous build wrote `"true"` on first mount, so reusing it would keep the
 * pane open for everyone who ever loaded the cockpit.
 */
const PREVIEW_PANE_STORAGE_KEY = "ontology.cockpit.previewPaneOpen";

/**
 * Taken from the core rather than re-declared. There were three copies of this
 * contract (here, in CitationPreview, and in the store) and they had drifted:
 * this one described `domain` with four fields while the worker sends the whole
 * row, so the type actively misled about the payload.
 */
type DescribeDomainNodeType = CoreDescribeDomainNodeType;
type DescribeDomainRelationType = CoreDescribeDomainRelationType;
type DescribeDomainRecentNode = CoreDescribeDomainRecentNode;
type DescribeDomainBusinessSystem = CoreDescribeDomainBusinessSystem;
type DescribeDomainSubProject = CoreDescribeDomainSubProject;
type DescribeDomainActionType = CoreDescribeDomainActionType;
type DescribeDomainResult = CoreDescribeDomainResult & {
  configured: boolean;
  configReason?: string;
};

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
  | { type: "aborted" }
  | { type: "edit_result"; result: CockpitEditResult }
  | { type: "edit_error"; error: string }
  /** The QA agent is calling a read-only lookup tool. Purely informational —
   *  it never contributes to the answer text. */
  | { type: "tool"; name: string; phase: "start" | "done" };

interface LocalMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming: boolean;
  citations: AideCitation[];
  createdAt: string;
  error?: string;
  aborted?: boolean;
  /** Set when the assistant turn came back in Edit mode — the UI
   *  surfaces this as an EditCard instead of (or alongside) the JSON
   *  blob in `content`. */
  editResult?: CockpitEditResult;
  /** Set when Edit-mode JSON parse failed; the UI shows a localised
   *  hint instead of an EditCard so the user can retry or report. */
  editError?: string;
  /** Name of the lookup tool the agent is currently running, if any. */
  toolStatus?: string | null;
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
  const createNodeType = usePluginAction("create-node-type");
  const updateNodeType = usePluginAction("update-node-type");
  const deleteNodeType = usePluginAction("delete-node-type");
  const createRelationType = usePluginAction("create-relation-type");
  const updateRelationType = usePluginAction("update-relation-type");
  const deleteRelationType = usePluginAction("delete-relation-type");
  const createSnapshot = usePluginAction("aide-create-snapshot");
  const snapshots = usePluginData<{ snapshots: unknown }>("aide-snapshots", {
    companyId,
    domainId,
  });

  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [clearing, setClearing] = useState(false);
  /** Edit-mode switch — when "edit", every assistant turn comes back as
   *  a structured CockpitEditResult instead of free-text prose. The
   *  selected mode is sticky per session, not persisted across reloads. */
  const [mode, setMode] = useState<"qa" | "edit">("qa");
  /** Schema preview pane visibility. Read once at mount from localStorage
   *  (SWR-style — we don't want to re-read on every keystroke).
   *
   *  Hidden by default: the cockpit is a chat surface, and mounting a 360px
   *  schema pane (plus the snapshot drawer under it) beside the conversation
   *  pushed the chat into a narrow column. The pane is an opt-in inspection
   *  tool, so only an explicit toggle turns it on. */
  const [previewVisible, setPreviewVisible] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(PREVIEW_PANE_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  /** Result of the EditCard currently under the mouse — drives the right
   *  pane's diff coloring. null when no card is hovered (or the user
   *  isn't in edit mode). Sticky on leave so the user can mouse over
   *  the pane without losing the diff overlay. */
  const [hoveredEditResult, setHoveredEditResult] = useState<CockpitEditResult | null>(null);
  /** Currently inspected type on the right pane's Detail tab. Driven by
   *  clicks on the schema tree; cleared when the user goes Back or
   *  closes the pane. null = no selection = stay on Schema tab. */
  const [selectedTypeKey, setSelectedTypeKey] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<
    "nodeType" | "relationType" | "actionType" | null
  >(null);

  // Persist the preview-pane toggle so it survives reloads. Wrapped in
  // try/catch because localStorage can throw in private windows / when
  // site data is blocked — we just silently fall back to in-memory.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        PREVIEW_PANE_STORAGE_KEY,
        String(previewVisible),
      );
    } catch {
      // best-effort
    }
  }, [previewVisible]);

  // Clear the hover overlay when the user explicitly applies or discards
  // a card — the EditCard itself disappears (or shows "已丢弃"), so the
  // pane would otherwise dangle on a stale result.
  const onEditApplied = useCallback(() => {
    setHoveredEditResult(null);
    void describe.refresh();
    void snapshots.refresh();
  }, [describe, snapshots]);

  // Captures a pre-edit snapshot row. Wired to EditCard.onWillApply so
  // the snapshot drawer has a permanent record of every successful
  // Apply. Best-effort — the EditCard swallows failures so the user
  // still gets their mutations through.
  const onWillApply = useCallback(
    async (params: { intent: string; summary: string; opCount: number }) => {
      await createSnapshot({
        companyId,
        domainId,
        intent: params.intent,
        summary: params.summary,
        opCount: params.opCount,
        createdBy: "user",
      });
    },
    [createSnapshot, companyId, domainId],
  );

  // Selection handlers for the right pane. Clicking a row sets both
  // target + key; the pane owns its own tab state so we only need to
  // supply the data here.
  const onSelectType = useCallback(
    (kind: "nodeType" | "relationType" | "actionType", key: string) => {
      setSelectedTarget(kind);
      setSelectedTypeKey(key);
    },
    [],
  );
  const onClearSelection = useCallback(() => {
    setSelectedTarget(null);
    setSelectedTypeKey(null);
  }, []);
  const seenTokenKeysRef = useRef<Set<string>>(new Set());
  // Which citation chip is currently expanded across the message list.
  // Key format: `${messageId}:${chipIdx}` so each chip is independent and
  // opening a chip in one message doesn't disturb another message's open
  // chip. null = none open.
  const [openCitationKey, setOpenCitationKey] = useState<string | null>(null);

  const toggleCitation = useCallback((key: string) => {
    setOpenCitationKey((cur) => (cur === key ? null : key));
  }, []);

  // Submit a specific text without relying on the `draft` state — used by
  // the pre-prompt auto-submit path where the controlled input's draft
  // hasn't been re-rendered yet when the queued submit runs. Defined before
  // any effect that references it so the deps array can resolve cleanly.
  const submitText = useCallback(
    async (text: string, overrideMode?: "qa" | "edit") => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || sending) return;
      const useMode = overrideMode ?? mode;
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
        await askAide({ companyId, domainId, message: trimmed, mode: useMode });
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
    [askAide, companyId, domainId, sending, mode],
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

  // Dispatch a single mutation from an EditCard. EditOps.applyOperations()
  // already resolved keys → ids, so the worker just needs the right
  // action name, body, and (where applicable) params.
  const dispatchMutation = useCallback(
    async (call: MutationCall): Promise<unknown> => {
      switch (call.action) {
        case "create-node-type":
          return createNodeType({ body: call.body });
        case "update-node-type":
          return updateNodeType({ params: call.params, body: call.body });
        case "delete-node-type":
          return deleteNodeType({ params: call.params });
        case "create-relation-type":
          return createRelationType({ body: call.body });
        case "update-relation-type":
          return updateRelationType({ params: call.params, body: call.body });
        case "delete-relation-type":
          return deleteRelationType({ params: call.params });
      }
    },
    [
      createNodeType,
      createRelationType,
      deleteNodeType,
      deleteRelationType,
      updateNodeType,
      updateRelationType,
    ],
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
            <ModeToggle mode={mode} onChange={setMode} disabled={sending} />
            <PaneToggle visible={previewVisible} onChange={setPreviewVisible} />
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
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <MessageList
              messages={messages}
              describe={describe.data ?? null}
              domainId={domainId}
              loading={loading && messages.length === 0}
              openCitationKey={openCitationKey}
              onToggleCitation={toggleCitation}
              onPickPrompt={(prompt) => {
                setDraft(prompt);
                // Fire submitText directly with the prompt text — the
                // controlled-input draft hasn't been re-rendered yet so
                // reading draft in a queued closure would give a stale "".
                void submitText(prompt);
              }}
              dispatchMutation={dispatchMutation}
              onEditApplied={onEditApplied}
              onWillApply={onWillApply}
              onHoverEditResult={setHoveredEditResult}
            />
            <Composer
              value={draft}
              disabled={sending}
              sending={sending}
              aborting={aborting}
              mode={mode}
              onChange={setDraft}
              onKeyDown={onKeyDown}
              onSubmit={() => { void onSubmit(); }}
              onStop={() => { void onStop(); }}
            />
          </div>
          {previewVisible && (
            <SchemaPreviewPane
              describe={describe.data ?? null}
              hoveredEditResult={hoveredEditResult}
              selectedTypeKey={selectedTypeKey}
              selectedTarget={selectedTarget}
              onSelectType={onSelectType}
              onClearSelection={onClearSelection}
            />
          )}
          {previewVisible && (
            <SnapshotDrawer
              describe={describe.data ?? null}
              onAfterRestore={() => describe.refresh()}
              companyId={companyId}
              domainId={domainId}
            />
          )}
        </div>
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
  domainId,
  loading,
  openCitationKey,
  onToggleCitation,
  onPickPrompt,
  dispatchMutation,
  onEditApplied,
  onWillApply,
  onHoverEditResult,
}: {
  messages: LocalMessage[];
  describe: DescribeDomainResult | null;
  domainId: string;
  loading: boolean;
  /** Key of the currently-open citation chip, or null. */
  openCitationKey: string | null;
  /** Toggle which chip is open; passing the same key closes it. */
  onToggleCitation: (key: string) => void;
  onPickPrompt: (prompt: string) => void;
  dispatchMutation: (call: MutationCall) => Promise<unknown>;
  onEditApplied: () => void;
  /** Captures a pre-edit snapshot row via `aide-create-snapshot` before
   *  the first mutation fires. Fire-and-forget at the EditCard level —
   *  the worker swallows errors so Apply proceeds even if the snapshot
   *  write fails. */
  onWillApply: (params: { intent: string; summary: string; opCount: number }) => void | Promise<void>;
  /**Bubble → EditCard mouse-enter/leave signal. Drives the right-side
   *  schema pane's diff coloring. */
  onHoverEditResult: (result: CockpitEditResult | null) => void;
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
      // `min-h-0` keeps the transcript scrollable instead of letting a long
      // conversation push the composer out of the column.
      className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-card/30 p-3"
    >
      <ul className="flex flex-col gap-3">
        {messages.map((m) => (
          <li key={m.id}>
            <Bubble
              message={m}
              describe={describe}
              domainId={domainId}
              openCitationKey={openCitationKey}
              onToggleCitation={onToggleCitation}
              dispatchMutation={dispatchMutation}
              onEditApplied={onEditApplied}
              onWillApply={onWillApply}
              onHoverEditResult={onHoverEditResult}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bubble({
  message,
  describe,
  domainId,
  openCitationKey,
  onToggleCitation,
  dispatchMutation,
  onEditApplied,
  onWillApply,
  onHoverEditResult,
}: {
  message: LocalMessage;
  describe: DescribeDomainResult | null;
  domainId: string;
  openCitationKey: string | null;
  onToggleCitation: (key: string) => void;
  dispatchMutation: (call: MutationCall) => Promise<unknown>;
  onEditApplied: () => void;
  onWillApply: (params: { intent: string; summary: string; opCount: number }) => void | Promise<void>;
  onHoverEditResult: (result: CockpitEditResult | null) => void;
}): ReactElement {
  const isUser = message.role === "user";
  // Edit-mode assistant turns are pure JSON. The EditCard is the user-
  // facing surface; we still render the raw JSON underneath inside a
  // collapsed <details> so a curious user can copy-paste it.
  const showEditCard = !isUser && !!message.editResult;
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-(length:--text-compact) shadow-sm ${
          isUser
            ? "whitespace-pre-wrap bg-primary text-primary-foreground"
            : "bg-card text-foreground border border-border"
        }`}
      >
        {showEditCard ? (
          message.editResult ? (
            <EditCard
              result={message.editResult}
              snapshot={describe}
              domainId={domainId}
              dispatch={dispatchMutation}
              onWillApply={onWillApply}
              onApplied={onEditApplied}
              onHover={onHoverEditResult}
            />
          ) : null
        ) : message.content.length === 0 && message.streaming ? (
          <div className="flex items-center gap-2">
            <BouncingDots />
            {message.toolStatus && (
              <span className="text-(length:--text-nano) text-muted-foreground">
                🔍 {t("正在查询", "Looking up")} {toolLabel(message.toolStatus)}…
              </span>
            )}
          </div>
        ) : isUser ? (
          <div>{message.content}</div>
        ) : (
          <MarkdownContent source={message.content} />
        )}
        {/* The agent may narrate, look something up, then keep writing — show
            the lookup inline so a pause reads as work, not a stall. */}
        {!isUser && message.streaming && message.toolStatus && message.content.length > 0 && (
          <div className="mt-1 text-(length:--text-nano) text-muted-foreground">
            🔍 {t("正在查询", "Looking up")} {toolLabel(message.toolStatus)}…
          </div>
        )}
        {showEditCard && message.content.length > 0 && (
          <details className="mt-2 text-(length:--text-nano) text-muted-foreground">
            <summary className="cursor-pointer">
              {t("查看原始 JSON", "Show raw JSON")}
            </summary>
            <pre className="mt-1 overflow-x-auto rounded-md bg-muted/40 p-2 text-(length:--text-nano)">
              {message.content}
            </pre>
          </details>
        )}
        {!isUser && !message.streaming && !showEditCard && message.citations.length > 0 && (
          <CitationChips
            citations={message.citations}
            describe={describe}
            messageId={message.id}
            openCitationKey={openCitationKey}
            onToggleCitation={onToggleCitation}
          />
        )}
        {message.editError ? (
          <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-(length:--text-nano) text-amber-700 dark:text-amber-300">
            {t("无法解析编辑结果: ", "Failed to parse edit result: ")}
            {message.editError}
          </div>
        ) : message.error ? (
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

/** Human label for a lookup tool, shown while the agent is running it. */
function toolLabel(name: string): string {
  switch (name) {
    case "domain_overview": return t("域总览", "domain overview");
    case "list_object_types": return t("对象类型清单", "object types");
    case "get_object_type": return t("对象类型字段", "object type fields");
    case "list_instances": return t("实例数据", "instances");
    case "get_instance": return t("实例详情", "instance detail");
    case "list_relation_types": return t("关系类型清单", "relation types");
    case "find_path": return t("路径", "path");
    case "find_impact": return t("影响范围", "impact");
    default: return name;
  }
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
  messageId,
  openCitationKey,
  onToggleCitation,
}: {
  citations: AideCitation[];
  describe: DescribeDomainResult | null;
  messageId: string;
  openCitationKey: string | null;
  onToggleCitation: (key: string) => void;
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
        const chipKey = `${messageId}:${idx}`;
        const isOpen = openCitationKey === chipKey;
        return (
          <button
            key={`${c.kind}-${c.id}-${idx}`}
            type="button"
            onClick={() => onToggleCitation(chipKey)}
            aria-expanded={isOpen}
            title={`${c.kind}: ${c.id}`}
            className={`rounded-full px-2 py-0.5 text-(length:--text-nano) transition-colors ${
              isOpen
                ? "bg-primary/15 text-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            <span className="mr-1 font-medium text-foreground/70">{kindLabel(c.kind)}</span>
            {label}
          </button>
        );
      })}
      {openCitationKey &&
        (() => {
          const match = /^(.+):(\d+)$/.exec(openCitationKey);
          if (!match) return null;
          const [, msgId, idxStr] = match;
          if (msgId !== messageId) return null;
          const idx = Number(idxStr);
          const cite = citations[idx];
          if (!cite) return null;
          return (
            <CitationPreview
              citation={cite}
              describe={describe}
              onClose={() => onToggleCitation(openCitationKey)}
            />
          );
        })()}
    </div>
  );
}

function Composer({
  value,
  disabled,
  sending,
  aborting,
  mode,
  onChange,
  onKeyDown,
  onSubmit,
  onStop,
}: {
  value: string;
  disabled: boolean;
  sending: boolean;
  aborting: boolean;
  mode: "qa" | "edit";
  onChange: (next: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onStop: () => void;
}): ReactElement {
  const placeholder = mode === "edit"
    ? t(
        "想改 schema?说出修改意图,LLM 会返回结构化编辑提案…",
        "Describe the schema change you want. LLM returns structured ops…",
      )
    : t(
        "问点什么…Enter 发送,Shift+Enter 换行",
        "Ask anything… Enter to send, Shift+Enter for newline",
      );
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
        placeholder={placeholder}
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
          {mode === "edit" ? t("提议编辑", "Propose edit") : t("发送", "Send")}
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
    } else if (ev.type === "tool") {
      // Informational only — the answer text is unaffected. Cleared by any
      // terminal event so a finished turn never keeps a stale "looking up…".
      next[lastIdx] = {
        ...last,
        toolStatus: ev.phase === "start" ? ev.name : null,
      };
    } else if (ev.type === "done") {
      next[lastIdx] = {
        ...last,
        streaming: false,
        citations: ev.citations,
        toolStatus: null,
      };
    } else if (ev.type === "edit_result") {
      // Edit mode: the LLM's whole reply was the JSON. Replace the
      // streaming content with a tiny placeholder so the bubble doesn't
      // render the raw JSON twice — the EditCard is the source of truth.
      next[lastIdx] = {
        ...last,
        streaming: false,
        content: "",
        editResult: ev.result,
        toolStatus: null,
      };
    } else if (ev.type === "edit_error") {
      next[lastIdx] = {
        ...last,
        streaming: false,
        editError: ev.error,
        toolStatus: null,
      };
    } else if (ev.type === "aborted") {
      next[lastIdx] = {
        ...last,
        streaming: false,
        aborted: true,
        toolStatus: null,
      };
    } else if (ev.type === "error") {
      next[lastIdx] = {
        ...last,
        streaming: false,
        error: ev.message,
        toolStatus: null,
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
          {typeof bs.domainVersion === "number" && (
            <span className="rounded bg-muted px-1 font-mono text-(length:--text-tiny) text-muted-foreground">
              v{bs.domainVersion}
            </span>
          )}
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

/**
 * Two-state mode switch in the cockpit header. Drives the `ask-aide`
 * payload's `mode` parameter and which sub-component (Bubble prose vs
 * EditCard) the assistant turn renders as. Disabled mid-stream so the
 * user can't silently switch mid-flight and confuse the worker's
 * expectations.
 */
function ModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: "qa" | "edit";
  onChange: (next: "qa" | "edit") => void;
  disabled: boolean;
}): ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label={t("对话模式", "Conversation mode")}
      className="inline-flex items-center rounded-full border border-border bg-background p-0.5 text-(length:--text-nano)"
    >
      <ModeToggleOption
        active={mode === "qa"}
        disabled={disabled}
        onClick={() => onChange("qa")}
        ariaLabel={t("问 Q&A", "Q&A")}
      />
      <ModeToggleOption
        active={mode === "edit"}
        disabled={disabled}
        onClick={() => onChange("edit")}
        ariaLabel={t("编辑 schema", "Edit schema")}
      />
    </div>
  );
}

function ModeToggleOption({
  active,
  disabled,
  onClick,
  ariaLabel,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  ariaLabel: string;
}): ReactElement {
  const baseCls =
    "rounded-full px-2.5 py-0.5 transition-colors font-medium";
  const stateCls = active
    ? "bg-primary text-primary-foreground"
    : "text-muted-foreground hover:text-foreground";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={`${baseCls} ${stateCls} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {ariaLabel}
    </button>
  );
}

/**
 * Right-side schema preview pane toggle. Uses emoji (👁 / 🚫) instead of
 * lucide icons to stay consistent with the rest of the plugin which
 * doesn't pull lucide-react. State persists via localStorage in the
 * parent so reloads remember the user's choice.
 */
function PaneToggle({
  visible,
  onChange,
}: {
  visible: boolean;
  onChange: (next: boolean) => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={visible}
      aria-label={visible ? t("隐藏 Schema 预览", "Hide schema preview") : t("显示 Schema 预览", "Show schema preview")}
      title={visible ? t("隐藏 Schema 预览", "Hide schema preview") : t("显示 Schema 预览", "Show schema preview")}
      onClick={() => onChange(!visible)}
      className="rounded-full border border-border bg-background px-2 py-1 text-(length:--text-base) leading-none transition-colors hover:bg-muted"
    >
      {visible ? "👁" : "🚫"}
    </button>
  );
}