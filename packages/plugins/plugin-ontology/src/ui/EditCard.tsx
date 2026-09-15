/**
 * EditCard — renders a cockpit "Edit mode" reply. Shows intent, op count,
 * confidence, warnings, and an inline list of every op the LLM proposed.
 * The user can then either Apply (dispatches the resolved action calls)
 * or Discard.
 *
 * Driven by the `CockpitEditResult` parsed in `editOps.ts`. The Apply
 * path uses the same `applyOperations()` helper to resolve keys → ids
 * before dispatching — this keeps the contract pure and easy to test.
 */
import { useMemo, useState, type ReactElement } from "react";
import { applyOperations, type CockpitEditResult, type MutationCall } from "../aide/editOps.js";
import type { DescribeDomainResult } from "./CitationPreview.js";
import { t } from "./isZh.js";

export interface ApplyError {
  index: number;
  action: string;
  message: string;
}

export function EditCard({
  result,
  snapshot,
  domainId,
  dispatch,
  onApplied,
  onHover,
}: {
  result: CockpitEditResult;
  snapshot: DescribeDomainResult | null;
  /**Domain id (UI keeps snapshot at company+domain granularity). */
  domainId: string;
  /**Dispatch a single mutation. Returns the resolved result from the
   *  worker so the UI can show inline per-call errors. */
  dispatch: (call: MutationCall) => Promise<unknown>;
  /**Called after a successful apply so the parent can refresh the
   *  snapshot and clear the bubble's "pending" affordance. */
  onApplied: () => void;
  /**Fired with the EditCard's result when the user hovers the card,
   *  null when they leave. The parent (SandboxTab) feeds this into the
   *  SchemaPreviewPane so the right-side tree lights up with the rows
   *  this op set would touch. */
  onHover?: (result: CockpitEditResult | null) => void;
}): ReactElement {
  const [applying, setApplying] = useState(false);
  const [discarded, setDiscarded] = useState(false);
  const [errors, setErrors] = useState<ApplyError[]>([]);

  // Resolve ops against the live snapshot. We only compute this on render
  // so the user sees the exact set of action calls that will fire.
  const outcome = useMemo(
    () => (snapshot ? applyOperations(result.operations, snapshot, domainId) : { calls: [], skipped: [] }),
    [result.operations, snapshot, domainId],
  );

  const opCount = result.operations.length;
  const skipCount = outcome.skipped.length;
  const callCount = outcome.calls.length;

  async function handleApply(): Promise<void> {
    if (!snapshot) return;
    setApplying(true);
    setErrors([]);
    const collected: ApplyError[] = [];
    for (let i = 0; i < outcome.calls.length; i++) {
      const call = outcome.calls[i];
      if (!call) continue;
      try {
        await dispatch(call);
      } catch (err) {
        collected.push({
          index: i,
          action: call.action,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    setErrors(collected);
    setApplying(false);
    if (collected.length === 0) {
      onApplied();
    }
  }

  if (discarded) {
    return (
      <div className="mt-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-(length:--text-nano) text-muted-foreground">
        {t("已丢弃此次编辑。", "Edit discarded.")}
      </div>
    );
  }

  return (
    <div
      className="mt-2 space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3"
      onMouseEnter={onHover ? () => onHover(result) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-(length:--text-compact) font-semibold text-foreground">
            {result.intent}
          </div>
          <div className="mt-0.5 text-(length:--text-nano) text-muted-foreground">
            {result.summary}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-(length:--text-nano) font-medium text-primary tabular-nums">
            {opCount} {t("op", "op")}{opCount === 1 ? "" : "s"}
          </span>
          <ConfidenceChip confidence={result.confidence} />
        </div>
      </div>

      <OpsList ops={result.operations} />

      {result.warnings.length > 0 && (
        <ul className="space-y-0.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-(length:--text-nano) text-amber-700 dark:text-amber-300">
          {result.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {!snapshot && (
        <div className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-(length:--text-nano) text-muted-foreground">
          {t("等待加载本体快照…", "Waiting for ontology snapshot…")}
        </div>
      )}

      {snapshot && skipCount > 0 && (
        <details className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-(length:--text-nano)">
          <summary className="cursor-pointer text-destructive">
            {t("将被跳过的操作", "Operations that will be skipped")} ({skipCount})
          </summary>
          <ul className="mt-1 space-y-0.5 text-foreground/80">
            {outcome.skipped.map((s, i) => (
              <li key={i}>
                <span className="font-mono text-(length:--text-nano) text-muted-foreground">
                  {s.op.op}
                </span>
                {" · "}
                {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {errors.length > 0 && (
        <ul className="space-y-0.5 rounded-md border border-destructive/60 bg-destructive/10 px-2 py-1.5 text-(length:--text-nano) text-destructive">
          {errors.map((e, i) => (
            <li key={i}>
              [{i}] {e.action}: {e.message}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { void handleApply(); }}
          disabled={applying || !snapshot || callCount === 0}
          className="rounded-md bg-primary px-3 py-1 text-(length:--text-nano) font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {applying
            ? t("应用中…", "Applying…")
            : t("确认应用", "Apply")}
        </button>
        <button
          type="button"
          onClick={() => setDiscarded(true)}
          disabled={applying}
          className="rounded-md border border-border bg-background px-3 py-1 text-(length:--text-nano) font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("丢弃", "Discard")}
        </button>
        <span className="ml-auto text-(length:--text-nano) text-muted-foreground tabular-nums">
          {t("可执行", "Will apply")} {callCount}/{opCount}
        </span>
      </div>
    </div>
  );
}

function OpsList({ ops }: { ops: CockpitEditResult["operations"] }): ReactElement {
  return (
    <ul className="space-y-0.5 rounded-md border border-border bg-background/70 px-2 py-1.5 text-(length:--text-nano)">
      {ops.map((op, i) => (
        <li key={i} className="flex items-baseline gap-1.5">
          <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-(length:--text-nano) text-muted-foreground">
            {op.op}
          </span>
          <span className="truncate text-foreground/80">{describeOp(op)}</span>
        </li>
      ))}
    </ul>
  );
}

function describeOp(op: CockpitEditResult["operations"][number]): string {
  switch (op.op) {
    case "addNodeType":
      return `${op.typeKey} — ${op.displayName}`;
    case "updateNodeType":
      return `${op.typeKey}${op.displayName ? ` → ${op.displayName}` : ""}`;
    case "removeNodeType":
      return op.typeKey;
    case "addRelationType":
      return `${op.typeKey} — ${op.displayName}`;
    case "updateRelationType":
      return `${op.typeKey}${op.displayName ? ` → ${op.displayName}` : ""}`;
    case "removeRelationType":
      return op.typeKey;
    case "addProperty":
      return `${op.typeKey}.${op.property.name} (${op.property.type})`;
    case "removeProperty":
      return `${op.typeKey}.${op.propertyName}`;
    case "updateProperty":
      return `${op.typeKey}.${op.propertyName}${op.type ? ` → ${op.type}` : ""}`;
  }
}

function ConfidenceChip({ confidence }: { confidence: number }): ReactElement {
  const pct = Math.round(confidence * 100);
  // Color buckets: ≥0.8 high (green-ish), ≥0.5 medium (amber), <0.5 low (zinc)
  const cls =
    confidence >= 0.8
      ? "bg-green-500/15 text-green-700 dark:text-green-300"
      : confidence >= 0.5
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-(length:--text-nano) font-medium tabular-nums ${cls}`}
      title={t(`置信度 ${pct}%`, `Confidence ${pct}%`)}
    >
      {pct}%
    </span>
  );
}