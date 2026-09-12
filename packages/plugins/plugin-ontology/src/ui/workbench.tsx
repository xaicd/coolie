/**
 * Ontology workbench — a three-column workbench modeled on DS's Foundry-style
 * ontology workbench, rebuilt with host design tokens (no DS "mythic" theme):
 *
 *   ┌ top bar: view tabs (Graph/Table/Schema) + add-node + right-panel toggle ┐
 *   ├ left: search + object-type tree (expandable, node instances, health dot) │
 *   ├ center: GraphView canvas / table / schema (flush, fills column)          │
 *   └ right: inspector for the selected node (props + its edges + edit/delete)  ┘
 *
 * Data + mutations are owned by the parent (DomainDetailView) and threaded in,
 * so the workbench stays presentational and reuses the existing domain-detail
 * data hook + plugin actions.
 *
 * @module ui/workbench
 */

import { useCallback, useMemo, useState, type ReactElement } from "react";
import { usePluginAction } from "@paperclipai/plugin-sdk/ui";
import {
  GraphView,
  toneFor,
  type GraphNode,
  type GraphEdge,
  type GraphNodeType,
} from "./graph-view.js";

function isZh(): boolean {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem("coolie.locale") : null;
    const lang = (v || (typeof navigator !== "undefined" ? navigator.language : "") || "en").toLowerCase();
    return lang.startsWith("zh");
  } catch {
    return false;
  }
}
function t(zh: string, en: string): string {
  return isZh() ? zh : en;
}

/** Sentinel type id for nodes without a declared nodeTypeId. */
const UNTYPED = "__untyped__";
/** Map the sidebar's synthetic type id back to the real graph value (null for untyped). */
function realTypeId(id: string | null): string | null {
  return id === UNTYPED ? null : id;
}

type ViewMode = "graph" | "table" | "schema";

export interface WorkbenchProps {
  companyId: string;
  domainId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeTypes: GraphNodeType[];
  relationTypes: GraphNodeType[];
  onChanged: () => void;
}

export function Workbench(props: WorkbenchProps): ReactElement {
  const { companyId, domainId, nodes, edges, nodeTypes, relationTypes, onChanged } = props;
  const [view, setView] = useState<ViewMode>("graph");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusTypeId, setFocusTypeId] = useState<string | null>(null);
  const [rightOpen, setRightOpen] = useState(true);

  const createNode = usePluginAction("create-node");

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const addNode = useCallback(async () => {
    const label = typeof window !== "undefined" ? window.prompt(t("节点标签", "Node label")) : null;
    if (!label || !label.trim()) return;
    await createNode({ companyId, domainId, key: `n-${Date.now()}`, label: label.trim() });
    onChanged();
  }, [companyId, domainId, createNode, onChanged]);

  const tabs: { id: ViewMode; label: string }[] = [
    { id: "graph", label: t("图谱", "Graph") },
    { id: "table", label: t("表格", "Table") },
    { id: "schema", label: "Schema" },
  ];

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* ── top bar: view tabs + actions ── */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-0.5">
          {tabs.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setView(tb.id)}
              className={[
                "rounded-md px-3 py-1 text-(length:--text-compact) font-medium transition-colors",
                view === tb.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {tb.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addNode}
            className="rounded-md bg-primary px-2.5 py-1 text-(length:--text-compact) font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            + {t("节点", "Node")}
          </button>
          <button
            onClick={() => setRightOpen((v) => !v)}
            className="rounded-md border border-border px-2 py-1 text-(length:--text-compact) text-muted-foreground transition-colors hover:text-foreground"
            title={rightOpen ? t("收起详情", "Collapse details") : t("展开详情", "Expand details")}
          >
            {rightOpen ? "⇥" : "⇤"}
          </button>
        </div>
      </div>

      {/* ── three columns ── */}
      <div className="flex min-h-[460px]">
        {/* left: type tree */}
        <WorkbenchSidebar
          nodes={nodes}
          nodeTypes={nodeTypes}
          relationTypes={relationTypes}
          selectedNodeId={selectedNodeId}
          focusTypeId={focusTypeId}
          onSelectNode={(id) => { setSelectedNodeId(id); setRightOpen(true); }}
          onFocusType={(id) => setFocusTypeId((cur) => (cur === id ? null : id))}
        />

        {/* center: canvas / table / schema */}
        <div className="min-w-0 flex-1 border-x border-border">
          <GraphView
            companyId={companyId}
            domainId={domainId}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            relationTypes={relationTypes}
            onChanged={onChanged}
            mode={view}
            hideTabs
            selectedNodeId={selectedNodeId}
            onSelectNode={(id) => { setSelectedNodeId(id); if (id) setRightOpen(true); }}
            focusNodeTypeId={realTypeId(focusTypeId)}
          />
        </div>

        {/* right: inspector */}
        {rightOpen && (
          <WorkbenchInspector
            node={selectedNode}
            edges={edges}
            nodes={nodes}
            nodeTypes={nodeTypes}
            companyId={companyId}
            onChanged={onChanged}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Left column: object-type tree ─────────────────────────────────────────

function WorkbenchSidebar({
  nodes,
  nodeTypes,
  relationTypes,
  selectedNodeId,
  focusTypeId,
  onSelectNode,
  onFocusType,
}: {
  nodes: GraphNode[];
  nodeTypes: GraphNodeType[];
  relationTypes: GraphNodeType[];
  selectedNodeId: string | null;
  focusTypeId: string | null;
  onSelectNode: (id: string) => void;
  onFocusType: (id: string) => void;
}): ReactElement {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const q = search.trim().toLowerCase();
  const matches = useCallback(
    (n: GraphNode) => !q || (n.label || n.key).toLowerCase().includes(q) || n.key.toLowerCase().includes(q),
    [q],
  );

  const nodesByType = useMemo(() => {
    const m = new Map<string, GraphNode[]>();
    for (const n of nodes) {
      if (!matches(n)) continue;
      const key = n.nodeTypeId ?? UNTYPED;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(n);
    }
    return m;
  }, [nodes, matches]);

  // Every declared type + any ad-hoc types present on nodes but not declared.
  const typeRows = useMemo(() => {
    const rows: { id: string; name: string; count: number }[] = nodeTypes.map((nt) => ({
      id: nt.id,
      name: nt.display_name || nt.key,
      count: nodesByType.get(nt.id)?.length ?? 0,
    }));
    const untyped = nodesByType.get(UNTYPED);
    if (untyped && untyped.length) rows.push({ id: UNTYPED, name: t("未分类", "Untyped"), count: untyped.length });
    return rows;
  }, [nodeTypes, nodesByType]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="flex w-[220px] shrink-0 flex-col overflow-hidden bg-muted/20">
      <div className="shrink-0 p-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("搜索类型与节点…", "Search types & nodes…")}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-(length:--text-compact) text-foreground outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        <div className="px-2 py-1 text-(length:--text-nano) font-semibold uppercase tracking-wider text-muted-foreground">
          {t("对象类型", "Object types")} ({typeRows.length})
        </div>

        {typeRows.length === 0 && (
          <div className="px-2 py-1 text-(length:--text-nano) text-muted-foreground">
            {t("暂无类型", "No types")}
          </div>
        )}

        {typeRows.map((tr) => {
          const isOpen = expanded.has(tr.id);
          const isFocused = focusTypeId === tr.id;
          const typeNodes = nodesByType.get(tr.id) ?? [];
          return (
            <div key={tr.id}>
              <button
                onClick={() => { toggle(tr.id); onFocusType(tr.id); }}
                className={[
                  "group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors",
                  isFocused ? "bg-primary/10 text-foreground" : "text-foreground/80 hover:bg-accent/50",
                ].join(" ")}
              >
                <span className="w-3 shrink-0 text-(length:--text-nano) text-muted-foreground">
                  {isOpen ? "▾" : "▸"}
                </span>
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: toneFor(realTypeId(tr.id)) }} />
                <span className="flex-1 truncate text-(length:--text-compact) font-medium">{tr.name}</span>
                <span className="shrink-0 rounded-full bg-muted px-1.5 text-(length:--text-nano) text-muted-foreground">{tr.count}</span>
              </button>

              {isOpen && (
                <div className="ml-3 border-l border-border pl-2">
                  {typeNodes.length === 0 ? (
                    <div className="px-2 py-1 text-(length:--text-nano) text-muted-foreground">{t("暂无实例", "No instances")}</div>
                  ) : (
                    typeNodes.slice(0, 100).map((n) => (
                      <button
                        key={n.id}
                        onClick={() => onSelectNode(n.id)}
                        className={[
                          "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left transition-colors",
                          selectedNodeId === n.id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                        ].join(" ")}
                      >
                        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                        <span className="truncate text-(length:--text-compact)">{n.label || n.key}</span>
                      </button>
                    ))
                  )}
                  {typeNodes.length > 100 && (
                    <div className="px-2 py-1 text-(length:--text-nano) text-muted-foreground">
                      {t(`还有 ${typeNodes.length - 100} 个…`, `+${typeNodes.length - 100} more…`)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {relationTypes.length > 0 && (
          <>
            <div className="px-2 pb-1 pt-3 text-(length:--text-nano) font-semibold uppercase tracking-wider text-muted-foreground">
              {t("关系类型", "Relation types")} ({relationTypes.length})
            </div>
            {relationTypes.map((rt) => (
              <div key={rt.id} className="flex items-center gap-1.5 px-2 py-1 text-(length:--text-compact) text-muted-foreground">
                <span aria-hidden className="text-(length:--text-nano)">↔</span>
                <span className="truncate">{rt.display_name || rt.key}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Right column: selected-node inspector ──────────────────────────────────

function WorkbenchInspector({
  node,
  edges,
  nodes,
  nodeTypes,
  companyId,
  onChanged,
  onClose,
}: {
  node: GraphNode | null;
  edges: GraphEdge[];
  nodes: GraphNode[];
  nodeTypes: GraphNodeType[];
  companyId: string;
  onChanged: () => void;
  onClose: () => void;
}): ReactElement {
  const updateNode = usePluginAction("update-node");
  const deleteNode = usePluginAction("delete-node");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) m.set(n.id, n.label || n.key);
    return m;
  }, [nodes]);

  const typeName = useMemo(() => {
    if (!node?.nodeTypeId) return null;
    const nt = nodeTypes.find((x) => x.id === node.nodeTypeId);
    return nt ? nt.display_name || nt.key : null;
  }, [node, nodeTypes]);

  const related = useMemo(() => {
    if (!node) return [];
    return edges
      .filter((e) => e.sourceNodeId === node.id || e.targetNodeId === node.id)
      .map((e) => {
        const outgoing = e.sourceNodeId === node.id;
        const otherId = outgoing ? e.targetNodeId : e.sourceNodeId;
        return { id: e.id, outgoing, relation: e.relationKey, other: labelById.get(otherId) ?? otherId };
      });
  }, [node, edges, labelById]);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); onChanged(); }
    catch (e) { setErr(String((e as Error)?.message ?? e)); }
    finally { setBusy(false); }
  }, [onChanged]);

  return (
    <div className="flex w-[300px] shrink-0 flex-col overflow-hidden bg-muted/20">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="text-(length:--text-compact) font-semibold">{t("详情", "Details")}</span>
        <button onClick={onClose} className="text-(length:--text-compact) text-muted-foreground hover:text-foreground" title={t("关闭", "Close")}>✕</button>
      </div>

      {!node ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-(length:--text-compact) text-muted-foreground">
          {t("从图谱或左侧选择一个节点查看详情。", "Select a node in the graph or tree to inspect it.")}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <Field label={t("标签", "Label")} value={node.label || node.key} />
          <Field label={t("键", "Key")} value={node.key} mono />
          <Field label={t("类型", "Type")} value={typeName ?? t("未分类", "Untyped")} />

          <div className="mb-1 mt-4 text-(length:--text-nano) font-semibold uppercase tracking-wider text-muted-foreground">
            {t("关系", "Relations")} ({related.length})
          </div>
          {related.length === 0 ? (
            <div className="text-(length:--text-compact) text-muted-foreground">{t("暂无关系", "No relations")}</div>
          ) : (
            <div className="flex flex-col gap-1">
              {related.map((r) => (
                <div key={r.id} className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-(length:--text-compact)">
                  <span className="text-muted-foreground">{r.outgoing ? "→" : "←"}</span>
                  {r.relation && <span className="rounded bg-muted px-1.5 text-(length:--text-nano) text-muted-foreground">{r.relation}</span>}
                  <span className="truncate">{r.other}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              disabled={busy}
              onClick={() => {
                const label = window.prompt(t("节点标签", "Node label"), node.label || node.key);
                if (label && label.trim()) void run(() => updateNode({ companyId, nodeId: node.id, label: label.trim() }));
              }}
              className="rounded-md border border-border px-2.5 py-1 text-(length:--text-compact) font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {t("重命名", "Rename")}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                if (window.confirm(t("删除该节点及其边?", "Delete this node and its edges?"))) {
                  void run(async () => { await deleteNode({ companyId, nodeId: node.id }); onClose(); });
                }
              }}
              className="rounded-md border border-border px-2.5 py-1 text-(length:--text-compact) font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              {t("删除", "Delete")}
            </button>
          </div>
          {err && <div className="mt-2 text-(length:--text-nano) text-destructive">{err}</div>}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }): ReactElement {
  return (
    <div className="mb-2">
      <div className="text-(length:--text-nano) uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={["text-(length:--text-compact) text-foreground", mono ? "font-mono" : ""].join(" ")}>{value}</div>
    </div>
  );
}
