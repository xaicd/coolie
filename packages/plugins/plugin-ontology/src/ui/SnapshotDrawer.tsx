/**
 * SnapshotDrawer — schema history list with Diff / Restore affordances.
 *
 * Lives below the SchemaPreviewPane tree, inside the same right-side
 * column. Each row is one saved snapshot (created automatically by
 * EditCard's "Apply" success path through `aide-create-snapshot`).
 *
 * Two affordances per row:
 *   - **Diff** — expand inline to show what changed between this
 *     snapshot and the current live schema, using the same +/~/−
 *     coloring as the EditCard hover overlay. Reads the snap list from
 *     `usePluginData("aide-snapshots")`.
 *   - **Restore** — fires `aide-restore-snapshot` which returns the
 *     snapshot; the UI then computes the inverse op set against the
 *     live describe-domain result and dispatches the same create-* /
 *     update-* / delete-* actions used by the EditCard apply path.
 *     The work is done client-side because the worker has no
 *     `inverseOpSet` helper yet (and keeping it client-side means we
 *     can reuse `applyOperations` from `editOps.ts` directly).
 *
 * Visual contract mirrors DS's snapshot drawer: each row is one
 * snapshot, condensed metadata on the left, action buttons on the
 * right, expanded diff uses the SchemaPreviewPane color palette.
 */
import { useMemo, useState, type ReactElement } from "react";
import { usePluginAction, usePluginData } from "@paperclipai/plugin-sdk/ui";
import {
  countDiff,
  diffDomain,
  type SchemaDiffEntry,
  type SnapshotMetadata,
} from "../aide/snapshots.js";
import type { DescribeDomainResult } from "./CitationPreview.js";
import { t } from "./isZh.js";

export interface SnapshotRow extends SnapshotMetadata {
  schema: DescribeDomainResult["nodeTypes"] extends Array<infer _NT>
    ? {
        nodeTypes: DescribeDomainResult["nodeTypes"];
        relationTypes: DescribeDomainResult["relationTypes"];
        actionTypes: DescribeDomainResult["actionTypes"];
      }
    : never;
}

export function SnapshotDrawer({
  describe,
  onAfterRestore,
  companyId,
  domainId,
}: {
  describe: DescribeDomainResult | null;
  /** Called after a successful restore so the parent can refresh its
   *  own describe-domain data hook (which lives at the SandboxTab
   *  level, not here). */
  onAfterRestore: () => void | Promise<void>;
  companyId: string;
  domainId: string;
}): ReactElement {
  const snapshots = usePluginData<{ snapshots: SnapshotRow[] }>(
    "aide-snapshots",
    { companyId, domainId },
  );
  const restoreSnapshot = usePluginAction("aide-restore-snapshot");
  const createNodeType = usePluginAction("create-node-type");
  const updateNodeType = usePluginAction("update-node-type");
  const deleteNodeType = usePluginAction("delete-node-type");

  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const list = snapshots.data?.snapshots ?? [];

  // Compute the diff for the currently-expanded snapshot vs the live
  // describe-domain result. Recomputed only when one of the two inputs
  // changes — cheap because describe-domain returns at most a few
  // dozen entities.
  const liveSchema = useMemo(() => {
    if (!describe) return null;
    return {
      nodeTypes: describe.nodeTypes,
      relationTypes: describe.relationTypes,
      actionTypes: describe.actionTypes,
    };
  }, [describe]);

  const expandedDiff = useMemo<{
    entries: SchemaDiffEntry[];
    counts: ReturnType<typeof countDiff>;
  } | null>(() => {
    if (expandedVersion === null || !liveSchema) return null;
    const target = list.find((s) => s.version === expandedVersion);
    if (!target) return null;
    const entries = diffDomain(target.schema, liveSchema);
    return { entries, counts: countDiff(entries) };
  }, [expandedVersion, liveSchema, list]);

  async function handleRestore(version: number): Promise<void> {
    if (!describe) return;
    setRestoring(version);
    setRestoreError(null);
    try {
      const result = await restoreSnapshot({ companyId, domainId, version });
      const target = (result as { snapshot?: SnapshotRow } | null)?.snapshot;
      if (!target) throw new Error("snapshot payload missing");
      // Compute inverse ops: live → snapshot. We walk the diff and
      // dispatch the matching action. For property changes we recompute
      // the whole propertiesSchema and fire a single update-node-type
      // (matching the EditCard apply path).
      const liveByKey = new Map(describe.nodeTypes.map((nt) => [nt.key, nt]));
      const targetByKey = new Map(target.schema.nodeTypes.map((nt) => [nt.key, nt]));
      // Removed: anything in live but not target → delete.
      for (const nt of describe.nodeTypes) {
        if (!targetByKey.has(nt.key)) {
          await deleteNodeType({ companyId, nodeTypeId: nt.id });
        }
      }
      // Added or changed: walk target's nodeTypes.
      for (const nt of target.schema.nodeTypes) {
        const live = liveByKey.get(nt.key);
        if (!live) {
          // Add — schema needs full params. We only have key +
          // displayName + description + layer + propertiesSchema from
          // the snapshot; build-node-type requires those.
          await createNodeType({
            companyId,
            domainId,
            key: nt.key,
            displayName: nt.displayName,
            description: nt.description,
            layer: nt.layer,
            propertiesSchema: nt.propertiesSchema ?? {},
          });
          continue;
        }
        const liveProps = live.propertiesSchema ?? {};
        const targetProps = nt.propertiesSchema ?? {};
        const sameShape =
          JSON.stringify(liveProps) !== JSON.stringify(targetProps);
        const sameMeta =
          live.displayName === nt.displayName &&
          live.description === nt.description &&
          live.layer === nt.layer;
        if (sameShape || !sameMeta) {
          await updateNodeType({
            companyId,
            nodeTypeId: live.id,
            displayName: nt.displayName,
            description: nt.description,
            layer: nt.layer,
            propertiesSchema: nt.propertiesSchema ?? {},
          });
        }
      }
      void snapshots.refresh();
      await onAfterRestore();
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : String(err));
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="border-t border-border bg-card/30">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card/70 px-3 py-1.5">
        <span className="text-(length:--text-compact) font-semibold">
          {t("版本历史", "Version history")}
        </span>
        <span className="rounded bg-muted px-1 py-0.5 text-(length:--text-nano) tabular-nums text-muted-foreground">
          {list.length}
        </span>
      </div>
      <div className="max-h-[40vh] overflow-y-auto">
        {list.length === 0 && (
          <div className="px-3 py-2 text-(length:--text-nano) italic text-muted-foreground">
            {t(
              "尚无快照 — 在 Edit 模式下成功 Apply 会自动创建。",
              "No snapshots yet — successful Applies in Edit mode create them automatically.",
            )}
          </div>
        )}
        {restoreError && (
          <div className="mx-3 mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-(length:--text-nano) text-destructive">
            {restoreError}
          </div>
        )}
        <ul className="divide-y divide-border">
          {list.map((s) => {
            const isExpanded = expandedVersion === s.version;
            const isRestoring = restoring === s.version;
            return (
              <li key={s.id} className="px-3 py-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-(length:--text-nano) tabular-nums text-muted-foreground">
                    v{s.version}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-(length:--text-nano) text-foreground/80">
                    {s.label}
                  </span>
                  <span className="shrink-0 text-(length:--text-nano) text-muted-foreground tabular-nums">
                    {s.opCount} {t("op", "op")}{s.opCount === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpandedVersion(isExpanded ? null : s.version)}
                    className="rounded-md border border-border bg-background px-1.5 py-0.5 text-(length:--text-nano) font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    {isExpanded ? t("收起", "Hide") : t("Diff", "Diff")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleRestore(s.version); }}
                    disabled={isRestoring || !describe}
                    className="rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-(length:--text-nano) font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isRestoring ? t("恢复中…", "Restoring…") : t("恢复", "Restore")}
                  </button>
                </div>
                {isExpanded && expandedDiff && (
                  <div className="mt-1 space-y-1 pl-1">
                    <DiffSummaryBar counts={expandedDiff.counts} />
                    <DiffList entries={expandedDiff.entries} />
                  </div>
                )}
                {isExpanded && expandedDiff && expandedDiff.entries.length === 0 && (
                  <div className="mt-1 px-1 text-(length:--text-nano) italic text-muted-foreground">
                    {t("与当前 schema 一致。", "Matches the current schema.")}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function DiffSummaryBar({
  counts,
}: {
  counts: ReturnType<typeof countDiff>;
}): ReactElement {
  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-(length:--text-nano)">
      <span className="font-medium text-amber-700 dark:text-amber-300">
        {t("与当前差异", "vs current")}
      </span>
      <span className="font-bold text-emerald-600 dark:text-emerald-400">+{counts.add}</span>
      <span className="font-bold text-blue-600 dark:text-blue-400">~{counts.update}</span>
      <span className="font-bold text-red-600 dark:text-red-400">−{counts.remove}</span>
    </div>
  );
}

function DiffList({ entries }: { entries: SchemaDiffEntry[] }): ReactElement {
  return (
    <ul className="space-y-0.5 rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-(length:--text-nano)">
      {entries.map((e, i) => (
        <li key={i} className="flex items-baseline gap-1">
          <DiffEntryText entry={e} />
        </li>
      ))}
    </ul>
  );
}

function DiffEntryText({ entry }: { entry: SchemaDiffEntry }): ReactElement {
  switch (entry.kind) {
    case "addNodeType":
      return (
        <>
          <span className="font-bold text-emerald-600 dark:text-emerald-400">+ nt:</span>
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">{entry.typeKey}</span>
        </>
      );
    case "removeNodeType":
      return (
        <>
          <span className="font-bold text-red-600 dark:text-red-400">− nt:</span>
          <span className="font-semibold text-red-700 dark:text-red-300">{entry.typeKey}</span>
        </>
      );
    case "updateNodeType":
      return (
        <>
          <span className="font-bold text-blue-600 dark:text-blue-400">~ nt:</span>
          <span className="font-semibold text-blue-700 dark:text-blue-300">{entry.typeKey}</span>
          <span className="text-muted-foreground">({entry.fields.join(", ")})</span>
        </>
      );
    case "addRelationType":
      return (
        <>
          <span className="font-bold text-emerald-600 dark:text-emerald-400">+ rt:</span>
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">{entry.typeKey}</span>
        </>
      );
    case "removeRelationType":
      return (
        <>
          <span className="font-bold text-red-600 dark:text-red-400">− rt:</span>
          <span className="font-semibold text-red-700 dark:text-red-300">{entry.typeKey}</span>
        </>
      );
    case "updateRelationType":
      return (
        <>
          <span className="font-bold text-blue-600 dark:text-blue-400">~ rt:</span>
          <span className="font-semibold text-blue-700 dark:text-blue-300">{entry.typeKey}</span>
          <span className="text-muted-foreground">({entry.fields.join(", ")})</span>
        </>
      );
    case "addProperty":
      return (
        <>
          <span className="font-bold text-emerald-600 dark:text-emerald-400">+ prop:</span>
          <span className="text-emerald-700 dark:text-emerald-300">
            {entry.typeKey}.{entry.propertyName}
          </span>
        </>
      );
    case "removeProperty":
      return (
        <>
          <span className="font-bold text-red-600 dark:text-red-400">− prop:</span>
          <span className="text-red-700 dark:text-red-300">
            {entry.typeKey}.{entry.propertyName}
          </span>
        </>
      );
    case "updateProperty":
      return (
        <>
          <span className="font-bold text-blue-600 dark:text-blue-400">~ prop:</span>
          <span className="text-blue-700 dark:text-blue-300">
            {entry.typeKey}.{entry.propertyName}
          </span>
        </>
      );
  }
}
