/**
 * SchemaPreviewPane — right-side panel of the cockpit. Shows the live
 * ontology (object types + relation types) and, when the user hovers an
 * EditCard, paints the rows the proposed ops would touch with green /
 * red / blue tinting.
 *
 * Visual contract (mirrors DigitalStaff's `OntologyChatEditPanel.tsx`):
 *
 *   - add    → emerald bg + emerald bold text + `+` glyph
 *   - remove → red bg + red bold text + `−` glyph
 *   - update → blue bg + blue bold text + `~` glyph
 *   - unchanged → no bg, neutral text, no glyph
 *
 * Each group (对象类型 / 关系类型) has a chevron toggle, an icon, a
 * label, and a count badge. Properties nested under nodeTypes are
 * always visible while the parent group is open (no per-property
 * collapse — schemas are tiny).
 *
 * The pane is pure render. The hover state lives in SandboxTab; we
 * just consume `hoveredEditResult` and recompute affected rows via
 * `affectedKeys()` on every render.
 */
import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import {
  affectedCounts,
  affectedKeys,
  type AffectedKey,
  type CockpitEditResult,
} from "../aide/editOps.js";
import type { DescribeDomainResult } from "./CitationPreview.js";
import { t } from "./isZh.js";

export function SchemaPreviewPane({
  describe,
  hoveredEditResult,
}: {
  describe: DescribeDomainResult | null;
  hoveredEditResult: CockpitEditResult | null;
}): ReactElement {
  // Lookup tables: typeKey → kind. Recomputed whenever the hovered
  // EditCard changes (cheap — affectedKeys is O(operations) and ops
  // are bounded to a few dozen at most).
  const affectedRows = useMemo<{
    nodeType: Map<string, AffectedKey["kind"]>;
    relationType: Map<string, AffectedKey["kind"]>;
    property: Map<string, AffectedKey["kind"]>; // key: `${typeKey}.${propName}`
  }>(() => {
    const empty = {
      nodeType: new Map<string, AffectedKey["kind"]>(),
      relationType: new Map<string, AffectedKey["kind"]>(),
      property: new Map<string, AffectedKey["kind"]>(),
    };
    if (!hoveredEditResult) return empty;
    const out = empty;
    for (const k of affectedKeys(hoveredEditResult.operations)) {
      if (k.target === "nodeType") out.nodeType.set(k.typeKey, k.kind);
      else if (k.target === "relationType") out.relationType.set(k.typeKey, k.kind);
      else out.property.set(`${k.typeKey}.${k.propertyName}`, k.kind);
    }
    return out;
  }, [hoveredEditResult]);

  const counts = hoveredEditResult ? affectedCounts(hoveredEditResult.operations) : null;
  const isPreviewing = !!hoveredEditResult;

  return (
    <aside
      aria-label={t("Schema 预览", "Schema preview")}
      className="flex w-[360px] shrink-0 flex-col rounded-xl border border-border bg-card/30"
    >
      <div className="flex items-center justify-between border-b border-border bg-card/70 px-3 py-2">
        <span className="text-(length:--text-compact) font-semibold">
          {t("Schema 预览", "Schema preview")}
        </span>
        {isPreviewing ? (
          <span
            className="rounded bg-amber-500/15 px-1.5 py-0.5 text-(length:--text-nano) font-medium text-amber-700 dark:text-amber-300"
            title={t("显示当前编辑 Card 的影响", "Showing impact of the hovered edit card")}
          >
            {t("预览中", "Previewing")}
          </span>
        ) : (
          <span className="text-(length:--text-nano) text-muted-foreground">
            {t("悬停编辑卡查看影响", "Hover an edit card to preview")}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-(length:--text-nano)">
        {counts && (
          <DiffSummary
            add={counts.add}
            update={counts.update}
            remove={counts.remove}
          />
        )}

        <SchemaGroup
          title={t("对象类型", "Object types")}
          icon="📦"
          count={describe?.nodeTypes.length ?? 0}
          defaultOpen
        >
          {(describe?.nodeTypes ?? []).map((nt) => (
            <NodeTypeRow
              key={nt.id}
              nodeType={nt}
              kind={affectedRows.nodeType.get(nt.key) ?? null}
              propertyKinds={affectedRows.property}
            />
          ))}
          {describe && describe.nodeTypes.length === 0 && (
            <EmptyRow label={t("尚无对象类型", "No object types yet")} />
          )}
        </SchemaGroup>

        <SchemaGroup
          title={t("关系类型", "Relation types")}
          icon="🔗"
          count={describe?.relationTypes.length ?? 0}
          defaultOpen
        >
          {(describe?.relationTypes ?? []).map((rt) => (
            <RelationTypeRow
              key={rt.id}
              relationType={rt}
              kind={affectedRows.relationType.get(rt.key) ?? null}
            />
          ))}
          {describe && describe.relationTypes.length === 0 && (
            <EmptyRow label={t("尚无关系类型", "No relation types yet")} />
          )}
        </SchemaGroup>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  DiffSummary — amber strip with +N / ~N / −N counts                 */
/* ------------------------------------------------------------------ */

function DiffSummary({
  add,
  update,
  remove,
}: {
  add: number;
  update: number;
  remove: number;
}): ReactElement {
  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-(length:--text-nano)">
      <span className="font-medium text-amber-700 dark:text-amber-300">
        {t("影响", "Impact")}
      </span>
      <span className="font-bold text-emerald-600 dark:text-emerald-400">+{add}</span>
      <span className="font-bold text-blue-600 dark:text-blue-400">~{update}</span>
      <span className="font-bold text-red-600 dark:text-red-400">−{remove}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SchemaGroup — collapsible section                                  */
/* ------------------------------------------------------------------ */

function SchemaGroup({
  title,
  icon,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  icon: string;
  count: number;
  defaultOpen: boolean;
  children: ReactNode;
}): ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-(length:--text-compact) text-foreground/80 hover:bg-muted/40"
      >
        <span className="text-(length:--text-nano) text-muted-foreground">
          {open ? "▾" : "▸"}
        </span>
        <span>{icon}</span>
        <span className="font-semibold">{title}</span>
        <span className="rounded bg-muted px-1 py-0.5 text-(length:--text-nano) text-muted-foreground tabular-nums">
          {count}
        </span>
      </button>
      {open && <div className="mt-1 space-y-1 pl-1">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  NodeTypeRow — single object type with nested properties            */
/* ------------------------------------------------------------------ */

function NodeTypeRow({
  nodeType,
  kind,
  propertyKinds,
}: {
  nodeType: DescribeDomainResult["nodeTypes"][number];
  kind: AffectedKey["kind"] | null;
  propertyKinds: Map<string, AffectedKey["kind"]>;
}): ReactElement {
  const diffClass = kind ? rowClass(kind) : "";
  const diffText = kind ? rowTextClass(kind) : "text-foreground/80";
  const glyph = kind ? glyphFor(kind) : " ";
  const props = nodeType.propertiesSchema && typeof nodeType.propertiesSchema === "object"
    ? Object.entries(nodeType.propertiesSchema)
    : [];

  return (
    <div className={`rounded-md px-2 py-1 ${diffClass || ""}`}>
      <div className={`flex items-baseline gap-1 ${diffText}`}>
        <span className="w-3 shrink-0 text-(length:--text-nano)">{glyph}</span>
        <span className="font-mono font-semibold">{nodeType.key}</span>
        {nodeType.displayName && nodeType.displayName !== nodeType.key && (
          <span className="text-(length:--text-nano) text-muted-foreground">
            · {nodeType.displayName}
          </span>
        )}
        <span className="ml-auto rounded bg-muted px-1 py-0.5 text-(length:--text-nano) tabular-nums text-muted-foreground">
          {nodeType.instanceCount}
        </span>
      </div>
      {nodeType.layer && (
        <div className="ml-4 mt-0.5 text-(length:--text-nano) text-muted-foreground">
          {t("层", "layer")} {nodeType.layer}
        </div>
      )}
      {props.length > 0 && (
        <ul className="ml-4 mt-1 space-y-0.5">
          {props.map(([propName, propSchema]) => {
            const propKind = propertyKinds.get(`${nodeType.key}.${propName}`) ?? null;
            const cls = propKind ? rowTextClass(propKind) : "text-foreground/70";
            const propGlyph = propKind ? glyphFor(propKind) : " ";
            return (
              <li key={propName} className={`flex items-baseline gap-1 ${cls}`}>
                <span className="w-3 shrink-0 text-(length:--text-nano)">{propGlyph}</span>
                <span className="font-mono">{propName}</span>
                <span className="text-(length:--text-nano) text-muted-foreground">:</span>
                <span className="text-(length:--text-nano) text-muted-foreground">
                  {summarizeType(propSchema)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {props.length === 0 && (
        <div className="ml-4 mt-0.5 text-(length:--text-nano) italic text-muted-foreground">
          {t("尚未配置属性", "No properties defined")}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  RelationTypeRow — single relation type, no children                */
/* ------------------------------------------------------------------ */

function RelationTypeRow({
  relationType,
  kind,
}: {
  relationType: DescribeDomainResult["relationTypes"][number];
  kind: AffectedKey["kind"] | null;
}): ReactElement {
  const diffClass = kind ? rowClass(kind) : "";
  const diffText = kind ? rowTextClass(kind) : "text-foreground/80";
  const glyph = kind ? glyphFor(kind) : " ";
  return (
    <div className={`rounded-md px-2 py-1 ${diffClass || ""}`}>
      <div className={`flex items-baseline gap-1 ${diffText}`}>
        <span className="w-3 shrink-0 text-(length:--text-nano)">{glyph}</span>
        <span className="font-mono font-semibold">{relationType.key}</span>
        {relationType.displayName && relationType.displayName !== relationType.key && (
          <span className="text-(length:--text-nano) text-muted-foreground">
            · {relationType.displayName}
          </span>
        )}
        <span className="ml-auto text-(length:--text-nano) text-muted-foreground">
          {relationType.directed ? t("有向", "directed") : t("无向", "undirected")} · {relationType.cardinality || "1..N"}
        </span>
      </div>
      <div className="ml-4 mt-0.5 text-(length:--text-nano) text-muted-foreground tabular-nums">
        {relationType.instanceCount} {t("实例", "instances")}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers — Tailwind class lookups for diff coloring                 */
/* ------------------------------------------------------------------ */

function rowClass(kind: AffectedKey["kind"]): string {
  switch (kind) {
    case "add": return "bg-emerald-500/10 border border-emerald-500/20";
    case "remove": return "bg-red-500/10 border border-red-500/20";
    case "update": return "bg-blue-500/10 border border-blue-500/20";
  }
}

function rowTextClass(kind: AffectedKey["kind"]): string {
  switch (kind) {
    case "add": return "text-emerald-700 dark:text-emerald-300 font-bold";
    case "remove": return "text-red-700 dark:text-red-300 font-bold";
    case "update": return "text-blue-700 dark:text-blue-300 font-bold";
  }
}

function glyphFor(kind: AffectedKey["kind"]): string {
  switch (kind) {
    case "add": return "+";
    case "remove": return "−";
    case "update": return "~";
  }
}

function summarizeType(v: unknown): string {
  if (!v || typeof v !== "object") return String(v ?? "");
  const obj = v as { type?: string; format?: string };
  if (obj.type && obj.format) return `${obj.type} (${obj.format})`;
  if (obj.type) return obj.type;
  return JSON.stringify(v);
}

function EmptyRow({ label }: { label: string }): ReactElement {
  return (
    <div className="rounded-md border border-dashed border-border px-2 py-2 text-center text-(length:--text-nano) italic text-muted-foreground">
      {label}
    </div>
  );
}