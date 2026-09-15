import {
  usePluginAction,
  usePluginStream,
} from "@paperclipai/plugin-sdk/ui";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { t } from "./isZh.js";

// ---------------------------------------------------------------------------
// Stream event shape — mirror of `ai-bootstrap-plan` action's SSE payload.
// We use a separate channel prefix from the chat aide so the UI never mixes
// chat tokens with bootstrap progress.
// ---------------------------------------------------------------------------

type BootstrapStreamEvent =
  | { type: "start"; totalSteps: number }
  | {
      type: "progress";
      step: number;
      kind: "node-type" | "relation-type" | "node" | "edge";
      label: string;
    }
  | {
      type: "done";
      counts: { nodeTypes: number; relationTypes: number; nodes: number; edges: number };
    }
  | { type: "error"; message: string }
  | { type: "aborted" };

interface ProgressLine {
  key: string;
  kind: "node-type" | "relation-type" | "node" | "edge" | "info";
  label: string;
  done: boolean;
}

interface BootstrapPanelProps {
  companyId: string;
  domainId: string;
  /** Optional description override (used when the right panel itself shows
   *  the textarea, in case the user wants to update an existing description
   *  before re-bootstrapping). */
  description?: string | null;
  /** Empty-state CTAs collapse into a single button when false. */
  collapsed?: boolean;
  /** Called when the worker finishes a bootstrap so the parent can refresh
   *  domain-detail + graph snapshots. */
  onCompleted?: (counts: {
    nodeTypes: number;
    relationTypes: number;
    nodes: number;
    edges: number;
  }) => void;
  /** Notifies the parent whenever the panel should stay mounted (i.e. while
   *  a bootstrap is in flight or has just completed and the user hasn't
   *  dismissed the result yet). The parent uses this so it doesn't unmount
   *  the panel the moment counts.nodes flips from 0 to N, which would
   *  discard the progress lines + completion summary. */
  onActiveChange?: (active: boolean) => void;
}

/**
 * Right-panel widget that drives the `ai-bootstrap-plan` action. Streams
 * progress on `ontology.bootstrap.stream.{companyId}.{domainId}` and renders
 * a list of "✓ 新增对象类型: 客户 (3/7)" lines as the worker inserts each
 * row. Has an inline textarea for editing the domain description before
 * re-bootstrapping (the create-domain modal collects it on first create,
 * but users can edit it here for empty domains).
 *
 * The plan streams are direct-write — no preview, no per-row undo. The
 * stop button only cancels the LLM call; once rows start inserting they
 * stay (the user can delete them via the existing right-click menu).
 */
export function BootstrapPanel({
  companyId,
  domainId,
  description,
  collapsed,
  onCompleted,
  onActiveChange,
}: BootstrapPanelProps): ReactElement {
  const streamChannel = `ontology.bootstrap.stream.${companyId}.${domainId}`;
  const stream = usePluginStream<BootstrapStreamEvent>(streamChannel);
  const startPlan = usePluginAction("ai-bootstrap-plan");
  const abortPlan = usePluginAction("ai-bootstrap-abort");

  const [editing, setEditing] = useState(false);
  const [descDraft, setDescDraft] = useState(description ?? "");
  const [lines, setLines] = useState<ProgressLine[]>([]);
  const [running, setRunning] = useState(false);
  const [completedCounts, setCompletedCounts] = useState<{
    nodeTypes: number;
    relationTypes: number;
    nodes: number;
    edges: number;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const seenKeysRef = useRef<Set<string>>(new Set());

  // Reset on domain switch.
  useEffect(() => {
    seenKeysRef.current = new Set();
    setLines([]);
    setCompletedCounts(null);
    setErr(null);
    setRunning(false);
    onActiveChange?.(false);
    // onActiveChange is intentionally omitted from deps — the effect must
    // fire on domain switch regardless of the parent's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, domainId]);

  // While the panel has visible content (running, has a completion summary,
  // or has shown an error worth reading) tell the parent to keep us mounted
  // so the data we just rendered doesn't get blown away when counts changes.
  useEffect(() => {
    onActiveChange?.(running || completedCounts !== null || err !== null);
  }, [running, completedCounts, err, onActiveChange]);

  // Apply stream events. Like SandboxTab, we treat the channel as stable
  // for the (company, domain) pair and accumulate into the local lines
  // list, idempotent across React strict-mode double renders.
  //
  // Note: we deliberately do NOT put `onCompleted` in the deps array. The
  // parent passes a fresh arrow each render (`() => refreshDomain()`) so a
  // naive deps list would re-fire this effect on every parent re-render,
  // calling onCompleted -> refreshDomain -> re-render -> infinite loop.
  // Instead we keep the latest onCompleted in a ref and call it only when
  // a new `done` event actually arrives.
  const onCompletedRef = useRef(onCompleted);
  useEffect(() => { onCompletedRef.current = onCompleted; }, [onCompleted]);
  useEffect(() => {
    const events = stream.events;
    if (events.length === 0) return;

    setLines((prev) => applyBootstrapEvents(prev, events, seenKeysRef.current));
    for (const ev of events) {
      if (ev.type === "done") {
        setRunning(false);
        setCompletedCounts(ev.counts);
        onCompletedRef.current?.(ev.counts);
      } else if (ev.type === "error") {
        setRunning(false);
        setErr(ev.message);
      } else if (ev.type === "aborted") {
        setRunning(false);
      }
    }
  }, [stream.events]);

  const onStart = useCallback(async () => {
    if (running) return;
    setErr(null);
    setLines([]);
    setCompletedCounts(null);
    seenKeysRef.current = new Set();
    setRunning(true);
    try {
      await startPlan({
        companyId,
        domainId,
        description: descDraft.trim() || undefined,
      });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      setErr(reason);
      setRunning(false);
    }
  }, [running, startPlan, companyId, domainId, descDraft]);

  const onStop = useCallback(async () => {
    if (!running) return;
    try {
      await abortPlan({ companyId, domainId });
    } catch {
      // Best-effort, like aide-abort.
    }
  }, [running, abortPlan, companyId, domainId]);

  // Compact view: a single inline button — used when there's nothing else
  // interesting in the right panel. The full card with progress lines lives
  // in the default expanded view.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => void onStart()}
        disabled={running}
        className="w-full rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-(length:--text-compact) text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? `…` : t("AI 初始化此域", "AI bootstrap this domain")}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-(length:--text-compact) font-semibold">
            {t("AI 初始化", "AI bootstrap")}
          </div>
          <div className="text-(length:--text-nano) text-muted-foreground">
            {t("用 Claude 帮本域生成对象类型、关系类型和节点。", "Use Claude to draft node types, relation types, and nodes for this domain.")}
          </div>
        </div>
      </div>

      {!running && !completedCounts && (
        <div className="space-y-2">
          {editing ? (
            <textarea
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              placeholder={t("描述这个域建模什么(例如「银行核心系统」「物流调度」)", "Describe what this domain models (e.g. banking core, logistics)")}
              rows={3}
              className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-(length:--text-compact) outline-none focus:border-primary"
            />
          ) : (
            <button
              type="button"
              onClick={() => { setDescDraft(description ?? ""); setEditing(true); }}
              className="block w-full truncate rounded-md border border-dashed border-border bg-background px-2 py-1.5 text-left text-(length:--text-nano) text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              title={t("点击编辑", "Click to edit")}
            >
              {descDraft.trim()
                ? descDraft
                : t("+ 添加域描述(可选,能显著提升生成质量)", "+ Add a domain description (optional, improves quality)")}
            </button>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void onStart()}
              disabled={running}
              className="flex-1 rounded-md bg-primary px-3 py-1.5 text-(length:--text-compact) font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {t("开始 AI 初始化", "Start AI bootstrap")}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-md border border-border px-2 py-1.5 text-(length:--text-nano) text-muted-foreground hover:bg-accent"
              >
                {t("收起", "Collapse")}
              </button>
            )}
          </div>
        </div>
      )}

      {running && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-(length:--text-nano) text-muted-foreground">
              {t("正在生成…", "Generating…")}
            </div>
            <button
              type="button"
              onClick={() => void onStop()}
              className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-(length:--text-nano) font-medium text-destructive transition-opacity hover:bg-destructive/20"
            >
              {t("停止", "Stop")}
            </button>
          </div>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto text-(length:--text-nano)">
            {lines.length === 0 ? (
              <li className="text-muted-foreground">{t("等待模型响应…", "Waiting for model response…")}</li>
            ) : (
              lines.map((l) => (
                <li key={l.key} className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">{l.done ? "✓" : "…"}</span>
                  <span className="truncate">{l.label}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {!running && completedCounts && (
        <div className="space-y-2">
          <div className="rounded-md border border-emerald-400/40 bg-emerald-50/50 px-2 py-1.5 text-(length:--text-nano) text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
            {t(
              `✓ 已初始化 ${completedCounts.nodeTypes} 对象类型 / ${completedCounts.relationTypes} 关系类型 / ${completedCounts.nodes} 节点 / ${completedCounts.edges} 边`,
              `✓ Initialised ${completedCounts.nodeTypes} node types / ${completedCounts.relationTypes} relation types / ${completedCounts.nodes} nodes / ${completedCounts.edges} edges`,
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setCompletedCounts(null);
              setLines([]);
              setErr(null);
            }}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-(length:--text-nano) text-muted-foreground transition-colors hover:bg-accent"
          >
            {t("收起", "Dismiss")}
          </button>
        </div>
      )}

      {err && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-(length:--text-nano) text-destructive">
          {err}
        </div>
      )}
    </div>
  );
}

function applyBootstrapEvents(
  prev: ProgressLine[],
  events: BootstrapStreamEvent[],
  seenKeys: Set<string>,
): ProgressLine[] {
  const next = prev.slice();
  for (const ev of events) {
    if (ev.type === "start") {
      // Reset the visible list so we don't keep stale rows from a prior run.
      next.length = 0;
      seenKeys.clear();
      next.push({ key: "start", kind: "info", label: `生成 ${ev.totalSteps} 条数据…`, done: false });
    } else if (ev.type === "progress") {
      const k = `${ev.kind}:${ev.step}`;
      if (seenKeys.has(k)) continue;
      seenKeys.add(k);
      const verb =
        ev.kind === "node-type"
          ? "对象类型"
          : ev.kind === "relation-type"
            ? "关系类型"
            : ev.kind === "node"
              ? "节点"
              : "边";
      next.push({ key: k, kind: ev.kind, label: `${verb}: ${ev.label}`, done: true });
    } else if (ev.type === "done") {
      // Done: mark the "start" placeholder done and append a summary line.
      const startIdx = next.findIndex((l) => l.key === "start");
      if (startIdx >= 0 && next[startIdx]) next[startIdx] = { ...next[startIdx], done: true };
      next.push({
        key: "done",
        kind: "info",
        label: `完成: ${ev.counts.nodeTypes} 类型 / ${ev.counts.relationTypes} 关系 / ${ev.counts.nodes} 节点 / ${ev.counts.edges} 边`,
        done: true,
      });
    } else if (ev.type === "error") {
      next.push({ key: `error:${events.indexOf(ev)}`, kind: "info", label: `错误: ${ev.message}`, done: true });
    } else if (ev.type === "aborted") {
      next.push({ key: "aborted", kind: "info", label: "已停止", done: true });
    }
  }
  return next;
}
