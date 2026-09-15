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
  selectedTypeKey,
  selectedTarget,
  onSelectType,
  onClearSelection,
}: {
  describe: DescribeDomainResult | null;
  hoveredEditResult: CockpitEditResult | null;
  /** Currently-inspected type key (any of the three target kinds). When
   *  set, the pane switches to its detail tab and renders the full
   *  schema for that type. null = stay on the schema tab. */
  selectedTypeKey: string | null;
  selectedTarget: "nodeType" | "relationType" | "actionType" | null;
  onSelectType: (kind: "nodeType" | "relationType" | "actionType", key: string) => void;
  onClearSelection: () => void;
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

  // Tab state — defaults to "schema" (the live tree). Switching to
  // "detail" happens when the user clicks a row. The tab is force-
  // returned to "schema" whenever the selection clears.
  const [tab, setTab] = useState<"schema" | "detail">("schema");
  const detailActive = tab === "detail" && selectedTypeKey !== null && selectedTarget !== null;

  return (
    <aside
      aria-label={t("Schema 预览", "Schema preview")}
      className="flex w-[360px] shrink-0 flex-col rounded-xl border border-border bg-card/30"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-(length:--text-compact) font-semibold">
            {t("Schema 预览", "Schema preview")}
          </span>
          <PaneTabs tab={detailActive ? "detail" : "schema"} onChange={setTab} />
        </div>
        {isPreviewing && !detailActive ? (
          <span
            className="rounded bg-amber-500/15 px-1.5 py-0.5 text-(length:--text-nano) font-medium text-amber-700 dark:text-amber-300"
            title={t("显示当前编辑 Card 的影响", "Showing impact of the hovered edit card")}
          >
            {t("预览中", "Previewing")}
          </span>
        ) : null}
      </div>

      {detailActive && selectedTypeKey && selectedTarget ? (
        <DetailView
          describe={describe}
          target={selectedTarget}
          typeKey={selectedTypeKey}
          affectedRows={affectedRows}
          onBack={() => {
            setTab("schema");
            onClearSelection();
          }}
        />
      ) : (
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
              selected={selectedTarget === "nodeType" && selectedTypeKey === nt.key}
              onClick={() => {
                setTab("detail");
                onSelectType("nodeType", nt.key);
              }}
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
              selected={selectedTarget === "relationType" && selectedTypeKey === rt.key}
              onClick={() => {
                setTab("detail");
                onSelectType("relationType", rt.key);
              }}
            />
          ))}
          {describe && describe.relationTypes.length === 0 && (
            <EmptyRow label={t("尚无关系类型", "No relation types yet")} />
          )}
        </SchemaGroup>

        <SchemaGroup
          title={t("Action / 事件", "Actions / events")}
          icon="⚡"
          count={describe?.actionTypes.length ?? 0}
          defaultOpen={false}
        >
          {(describe?.actionTypes ?? []).map((at) => (
            <ActionTypeRow
              key={at.id}
              actionType={at}
              selected={selectedTarget === "actionType" && selectedTypeKey === at.key}
              onClick={() => {
                setTab("detail");
                onSelectType("actionType", at.key);
              }}
            />
          ))}
          {describe && describe.actionTypes.length === 0 && (
            <EmptyRow label={t("尚无 Action 类型", "No action types yet")} />
          )}
        </SchemaGroup>
      </div>
      )}
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
  selected,
  onClick,
}: {
  nodeType: DescribeDomainResult["nodeTypes"][number];
  kind: AffectedKey["kind"] | null;
  propertyKinds: Map<string, AffectedKey["kind"]>;
  selected: boolean;
  onClick: () => void;
}): ReactElement {
  const diffClass = kind ? rowClass(kind) : "";
  const diffText = kind ? rowTextClass(kind) : "text-foreground/80";
  const glyph = kind ? glyphFor(kind) : " ";
  const props = nodeType.propertiesSchema && typeof nodeType.propertiesSchema === "object"
    ? Object.entries(nodeType.propertiesSchema)
    : [];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/40 ${
        selected ? "ring-1 ring-primary" : ""
      } ${diffClass || ""}`}
    >
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
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  RelationTypeRow — single relation type, no children                */
/* ------------------------------------------------------------------ */

function RelationTypeRow({
  relationType,
  kind,
  selected,
  onClick,
}: {
  relationType: DescribeDomainResult["relationTypes"][number];
  kind: AffectedKey["kind"] | null;
  selected: boolean;
  onClick: () => void;
}): ReactElement {
  const diffClass = kind ? rowClass(kind) : "";
  const diffText = kind ? rowTextClass(kind) : "text-foreground/80";
  const glyph = kind ? glyphFor(kind) : " ";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/40 ${
        selected ? "ring-1 ring-primary" : ""
      } ${diffClass || ""}`}
    >
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
    </button>
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

/* ------------------------------------------------------------------ */
/*  ActionTypeRow — single action / event type, no children             */
/* ------------------------------------------------------------------ */

function ActionTypeRow({
  actionType,
  selected,
  onClick,
}: {
  actionType: DescribeDomainResult["actionTypes"][number];
  selected: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/40 ${
        selected ? "ring-1 ring-primary" : ""
      }`}
    >
      <div className="flex items-baseline gap-1 text-foreground/80">
        <span className="w-3 shrink-0 text-(length:--text-nano)"> </span>
        <span className="font-mono font-semibold">{actionType.key}</span>
        {actionType.displayName && actionType.displayName !== actionType.key && (
          <span className="text-(length:--text-nano) text-muted-foreground">
            · {actionType.displayName}
          </span>
        )}
        <span className="ml-auto text-(length:--text-nano) text-muted-foreground">
          {actionType.kind}
        </span>
      </div>
      <div className="ml-4 mt-0.5 flex items-center gap-1.5 text-(length:--text-nano) text-muted-foreground">
        <span className="rounded bg-muted px-1 py-0.5">{actionType.status}</span>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  PaneTabs — schema / detail switcher (mirrors ModeToggle shape)      */
/* ------------------------------------------------------------------ */

function PaneTabs({
  tab,
  onChange,
}: {
  tab: "schema" | "detail";
  onChange: (next: "schema" | "detail") => void;
}): ReactElement {
  const baseClass =
    "rounded-md px-2 py-0.5 text-(length:--text-nano) font-medium transition-colors";
  const active = "bg-primary text-primary-foreground";
  const inactive = "text-muted-foreground hover:bg-muted/40 hover:text-foreground";
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-background/60 p-0.5">
      <button
        type="button"
        onClick={() => onChange("schema")}
        className={`${baseClass} ${tab === "schema" ? active : inactive}`}
      >
        {t("Schema", "Schema")}
      </button>
      <button
        type="button"
        onClick={() => onChange("detail")}
        disabled
        title={t("点击左侧某行以查看详情", "Click a row on the schema tab to view details")}
        className={`${baseClass} ${tab === "detail" ? active : inactive} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {t("详情", "Detail")}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DetailView — full schema for a single selected type                */
/* ------------------------------------------------------------------ */

function DetailView({
  describe,
  target,
  typeKey,
  affectedRows,
  onBack,
}: {
  describe: DescribeDomainResult | null;
  target: "nodeType" | "relationType" | "actionType";
  typeKey: string;
  affectedRows: {
    nodeType: Map<string, AffectedKey["kind"]>;
    relationType: Map<string, AffectedKey["kind"]>;
    property: Map<string, AffectedKey["kind"]>;
  };
  onBack: () => void;
}): ReactElement {
  // Resolve the entity. We deliberately use `key` (not `id`) as the
  // public identifier — it matches what the LLM sees in its context.
  const nodeType = describe?.nodeTypes.find((nt) => nt.key === typeKey) ?? null;
  const relationType = describe?.relationTypes.find((rt) => rt.key === typeKey) ?? null;
  const actionType = describe?.actionTypes.find((at) => at.key === typeKey) ?? null;

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-(length:--text-nano)">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-border bg-background px-2 py-0.5 text-(length:--text-nano) font-medium text-foreground transition-colors hover:bg-muted"
        >
          ← {t("返回", "Back")}
        </button>
        <span className="text-(length:--text-nano) uppercase tracking-wide text-muted-foreground">
          {target === "nodeType"
            ? t("对象类型", "Object type")
            : target === "relationType"
              ? t("关系类型", "Relation type")
              : t("Action / 事件", "Action")}
        </span>
      </div>

      {target === "nodeType" && nodeType && (
        <NodeTypeDetail nodeType={nodeType} propertyKinds={affectedRows.property} />
      )}
      {target === "relationType" && relationType && (
        <RelationTypeDetail relationType={relationType} describe={describe} />
      )}
      {target === "actionType" && actionType && <ActionTypeDetail actionType={actionType} />}

      {/* The selected type might be missing from the snapshot (e.g. it
          is being added by the in-flight edit). Show a placeholder so
          the user understands why the body is empty. */}
      {((target === "nodeType" && !nodeType) ||
        (target === "relationType" && !relationType) ||
        (target === "actionType" && !actionType)) && (
        <div className="rounded-md border border-dashed border-border px-3 py-2 text-(length:--text-nano) italic text-muted-foreground">
          {t(
            `此类型 ${typeKey} 不在当前 snapshot 中 — 可能是由待应用的 edit 新增的。`,
            `Type ${typeKey} is not in the current snapshot — it may be added by a pending edit.`,
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail bodies — one per target kind                                */
/* ------------------------------------------------------------------ */

function NodeTypeDetail({
  nodeType,
  propertyKinds,
}: {
  nodeType: DescribeDomainResult["nodeTypes"][number];
  propertyKinds: Map<string, AffectedKey["kind"]>;
}): ReactElement {
  const props = nodeType.propertiesSchema && typeof nodeType.propertiesSchema === "object"
    ? Object.entries(nodeType.propertiesSchema)
    : [];
  return (
    <div className="space-y-3">
      <Header
        title={nodeType.key}
        subtitle={nodeType.displayName && nodeType.displayName !== nodeType.key ? nodeType.displayName : undefined}
        badges={
          <>
            <Badge>{t("实例", "instances")} {nodeType.instanceCount}</Badge>
            {nodeType.layer && <Badge>{t("层", "layer")} {nodeType.layer}</Badge>}
          </>
        }
      />
      {nodeType.description && (
        <p className="rounded-md border border-border bg-background/60 px-2 py-1.5 text-(length:--text-nano) text-foreground/80">
          {nodeType.description}
        </p>
      )}

      <Section title={t("属性", "Properties")} count={props.length}>
        {props.length === 0 ? (
          <EmptyRow label={t("尚未配置属性", "No properties defined")} />
        ) : (
          <table className="w-full text-(length:--text-nano)">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="w-4"></th>
                <th className="px-1 py-0.5 font-medium">{t("名称", "Name")}</th>
                <th className="px-1 py-0.5 font-medium">{t("类型", "Type")}</th>
                <th className="px-1 py-0.5 font-medium">{t("说明", "Description")}</th>
              </tr>
            </thead>
            <tbody>
              {props.map(([propName, propSchema]) => {
                const kind = propertyKinds.get(`${nodeType.key}.${propName}`) ?? null;
                const glyph = kind ? glyphFor(kind) : " ";
                const cls = kind ? rowTextClass(kind) : "text-foreground/80";
                const obj = (propSchema && typeof propSchema === "object"
                  ? (propSchema as Record<string, unknown>)
                  : {}) as { type?: string; format?: string; description?: string };
                return (
                  <tr key={propName} className={cls}>
                    <td className="w-4 text-center">{glyph}</td>
                    <td className="px-1 py-0.5 font-mono">{propName}</td>
                    <td className="px-1 py-0.5 text-muted-foreground">
                      {summarizeType(propSchema)}
                    </td>
                    <td className="px-1 py-0.5 text-muted-foreground">{obj.description ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

function RelationTypeDetail({
  relationType,
  describe,
}: {
  relationType: DescribeDomainResult["relationTypes"][number];
  describe: DescribeDomainResult | null;
}): ReactElement {
  // In Palantir-style ontologies a relation type declares its source and
  // target *object types* via separate metadata. Our DescribeDomain shape
  // doesn't surface them — we show what we have and list candidate
  // nodeTypes as a hint.
  return (
    <div className="space-y-3">
      <Header
        title={relationType.key}
        subtitle={relationType.displayName && relationType.displayName !== relationType.key ? relationType.displayName : undefined}
        badges={
          <>
            <Badge>{t("实例", "instances")} {relationType.instanceCount}</Badge>
            <Badge>{relationType.directed ? t("有向", "directed") : t("无向", "undirected")}</Badge>
            <Badge>{relationType.cardinality || "1..N"}</Badge>
          </>
        }
      />
      {relationType.description && (
        <p className="rounded-md border border-border bg-background/60 px-2 py-1.5 text-(length:--text-nano) text-foreground/80">
          {relationType.description}
        </p>
      )}

      <Section title={t("端点", "Endpoints")} count={describe?.nodeTypes.length ?? 0}>
        <p className="rounded-md border border-dashed border-border px-2 py-1.5 text-(length:--text-nano) italic text-muted-foreground">
          {t(
            "源 / 目标对象类型 在 domain.describe-domain 中未单独展开 — 已定义的对象类型均可作为端点候选。",
            "Source / target object types are not separately surfaced by domain.describe-domain — any defined object type is an endpoint candidate.",
          )}
        </p>
        {describe && describe.nodeTypes.length > 0 && (
          <ul className="flex flex-wrap gap-1 px-1">
            {describe.nodeTypes.map((nt) => (
              <li
                key={nt.id}
                className="rounded bg-muted px-1.5 py-0.5 text-(length:--text-nano) font-mono text-muted-foreground"
              >
                {nt.key}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function ActionTypeDetail({
  actionType,
}: {
  actionType: DescribeDomainResult["actionTypes"][number];
}): ReactElement {
  return (
    <div className="space-y-3">
      <Header
        title={actionType.key}
        subtitle={actionType.displayName && actionType.displayName !== actionType.key ? actionType.displayName : undefined}
        badges={
          <>
            <Badge>{actionType.kind}</Badge>
            <Badge>{actionType.status}</Badge>
          </>
        }
      />
      <p className="rounded-md border border-dashed border-border px-2 py-1.5 text-(length:--text-nano) italic text-muted-foreground">
        {t(
          "Action 详情 (事件载荷 / 调度策略 / 触发器) 在 domain.describe-domain 中未展开 — 仅 key / kind / status 可用。",
          "Action details (event payload / scheduling / triggers) are not surfaced by domain.describe-domain — only key / kind / status are available.",
        )}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared detail layout primitives                                    */
/* ------------------------------------------------------------------ */

function Header({
  title,
  subtitle,
  badges,
}: {
  title: string;
  subtitle?: string;
  badges?: ReactNode;
}): ReactElement {
  return (
    <div className="rounded-md border border-border bg-background/60 px-2 py-1.5">
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-(length:--text-compact) font-semibold">{title}</span>
        {subtitle && (
          <span className="text-(length:--text-nano) text-muted-foreground">· {subtitle}</span>
        )}
      </div>
      {badges && <div className="mt-1 flex flex-wrap gap-1">{badges}</div>}
    </div>
  );
}

function Badge({ children }: { children: ReactNode }): ReactElement {
  return (
    <span className="rounded bg-muted px-1 py-0.5 text-(length:--text-nano) text-muted-foreground tabular-nums">
      {children}
    </span>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}): ReactElement {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-1 text-(length:--text-nano) font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{title}</span>
        <span className="tabular-nums">({count})</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}