import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
  MarkerType,
} from "@xyflow/react";
import xyflowCss from "@xyflow/react/dist/style.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from "react";
import { usePluginAction } from "@paperclipai/plugin-sdk/ui";

export type NodeLifecycle = "active" | "stale" | "deprecated" | "archived";

export interface GraphNode {
  id: string;
  key: string;
  label: string;
  nodeTypeId: string | null;
  lifecycleState?: NodeLifecycle;
}

/** Tailwind bg class for a node lifecycle health dot (matches DS's dot colors). */
export function lifecycleDot(state: NodeLifecycle | undefined): string {
  switch (state) {
    case "active": return "bg-emerald-400";
    case "stale": return "bg-amber-400";
    case "deprecated": return "bg-orange-400";
    case "archived": return "bg-muted-foreground";
    default: return "bg-emerald-400";
  }
}

/** Localized label for a node lifecycle state. */
export function lifecycleLabel(state: NodeLifecycle | undefined): string {
  const zh = { active: "活跃", stale: "陈旧", deprecated: "弃用", archived: "归档" };
  const en = { active: "Active", stale: "Stale", deprecated: "Deprecated", archived: "Archived" };
  const key = state ?? "active";
  const isZhLocale = (() => {
    try {
      const v = typeof localStorage !== "undefined" ? localStorage.getItem("coolie.locale") : null;
      return (v || (typeof navigator !== "undefined" ? navigator.language : "") || "en").toLowerCase().startsWith("zh");
    } catch { return false; }
  })();
  return isZhLocale ? zh[key] : en[key];
}
export interface GraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationKey: string | null;
  weight: number;
}
export interface GraphNodeType {
  id: string;
  key: string;
  display_name?: string | null;
}

/**
 * Derive a stable, well-spread hue for a node type id. Node-type coloring is a
 * semantic classification (DS colors nodes by type too), so tones are computed
 * at runtime rather than drawn from the host's fixed design tokens.
 */
export function toneFor(id: string | null | undefined): string {
  if (!id) return "var(--muted-foreground)";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 65% 55%)`;
}

/** Inject the ReactFlow stylesheet once (plugin loader serves only index.js). */
let cssInjected = false;
function useReactFlowCss(): void {
  useEffect(() => {
    if (cssInjected || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.setAttribute("data-plugin-ontology-xyflow", "");
    style.textContent = String(xyflowCss);
    document.head.appendChild(style);
    cssInjected = true;
  }, []);
}

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

type OntologyNodeData = { label: string; nodeKey: string; tone: string; typeName: string | null; dimmed?: boolean };

/**
 * Custom node: rounded card with a type-colored left accent bar and a type dot,
 * source/target handles for linking, and a native title tooltip showing the key
 * and type on hover.
 */
function OntologyNode({ data, selected }: NodeProps): ReactElement {
  const d = data as OntologyNodeData;
  const tip = d.typeName ? `${d.label} · ${d.nodeKey} · ${d.typeName}` : `${d.label} · ${d.nodeKey}`;
  return (
    <div
      title={tip}
      className={[
        "relative rounded-lg border px-3 py-2 pl-3.5 min-w-[128px] max-w-[220px] shadow-sm transition-all",
        "bg-card text-foreground",
        selected ? "border-primary ring-1 ring-primary" : "border-border",
        d.dimmed ? "opacity-30" : "",
      ].join(" ")}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-1 rounded-l-lg"
        style={{ background: d.tone }}
      />
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border !border-border !bg-muted-foreground" />
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.tone }} />
        <span className="truncate text-(length:--text-compact) font-medium">{d.label}</span>
      </div>
      <div className="truncate text-(length:--text-nano) text-muted-foreground">{d.nodeKey}</div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border !border-border !bg-muted-foreground" />
    </div>
  );
}

const nodeTypes = { ontology: OntologyNode };

interface ContextMenuState {
  x: number;
  y: number;
  kind: "canvas" | "node" | "edge";
  id?: string;
  label?: string;
  flowX?: number;
  flowY?: number;
}

function GraphCanvas({
  companyId,
  domainId,
  nodes: rawNodes,
  edges: rawEdges,
  nodeTypes: rawNodeTypes,
  onChanged,
  selectedNodeId,
  onSelectNode,
  focusNodeTypeId,
  fill,
  nodeTypeDragMime,
}: {
  companyId: string;
  domainId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeTypes: GraphNodeType[];
  onChanged: () => void;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  focusNodeTypeId?: string | null;
  fill?: boolean;
  nodeTypeDragMime?: string;
}): ReactElement {
  useReactFlowCss();
  const createNode = usePluginAction("create-node");
  const createEdge = usePluginAction("create-edge");
  const updateNode = usePluginAction("update-node");
  const deleteNode = usePluginAction("delete-node");
  const updateEdge = usePluginAction("update-edge");
  const deleteEdge = usePluginAction("delete-edge");
  const { screenToFlowPosition } = useReactFlow();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const typeById = useMemo(() => {
    const m = new Map<string, GraphNodeType>();
    for (const nt of rawNodeTypes) m.set(nt.id, nt);
    return m;
  }, [rawNodeTypes]);

  // Deterministic circular seed layout (positions are view-only; not persisted).
  const flowNodes: Node[] = useMemo(() => {
    const n = rawNodes.length || 1;
    return rawNodes.map((nd, i) => {
      const a = (2 * Math.PI * i) / n;
      const nt = nd.nodeTypeId ? typeById.get(nd.nodeTypeId) : undefined;
      const dimmed = focusNodeTypeId != null && nd.nodeTypeId !== focusNodeTypeId;
      return {
        id: nd.id,
        type: "ontology",
        position: { x: 320 + Math.cos(a) * 220, y: 220 + Math.sin(a) * 170 },
        selected: selectedNodeId != null && nd.id === selectedNodeId,
        data: {
          label: nd.label || nd.key,
          nodeKey: nd.key,
          tone: toneFor(nd.nodeTypeId),
          typeName: nt ? (nt.display_name || nt.key) : null,
          dimmed,
        },
      } satisfies Node;
    });
  }, [rawNodes, typeById, selectedNodeId, focusNodeTypeId]);

  const flowEdges: Edge[] = useMemo(
    () =>
      rawEdges.map((e) => ({
        id: e.id,
        source: e.sourceNodeId,
        target: e.targetNodeId,
        label: e.relationKey ?? undefined,
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
    [rawEdges],
  );

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setErr(null);
      try {
        await fn();
        onChanged();
      } catch (e) {
        setErr(String((e as Error)?.message ?? e));
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  // Drag a handle from one node to another -> create an edge.
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      const relationKey = typeof window !== "undefined" ? window.prompt(t("关系名(可选)", "Relation key (optional)")) ?? "" : "";
      void run(() => createEdge({ companyId, domainId, sourceNodeId: c.source, targetNodeId: c.target, relationKey: relationKey.trim() || undefined }));
    },
    [companyId, domainId, createEdge, run],
  );

  const openMenu = useCallback((e: ReactMouseEvent, state: Omit<ContextMenuState, "x" | "y">) => {
    e.preventDefault();
    const rect = wrapRef.current?.getBoundingClientRect();
    setMenu({ ...state, x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const addNode = useCallback(
    (flowX: number, flowY: number) => {
      const label = typeof window !== "undefined" ? window.prompt(t("节点标签", "Node label")) : null;
      if (!label || !label.trim()) return;
      void run(() => createNode({ companyId, domainId, key: `n-${Date.now()}`, label: label.trim() }));
    },
    [companyId, domainId, createNode, run],
  );

  // Drop a node type dragged from the host tree -> create a node of that type.
  const onDrop = useCallback(
    (e: ReactDragEvent) => {
      if (!nodeTypeDragMime) return;
      const nodeTypeId = e.dataTransfer.getData(nodeTypeDragMime);
      if (!nodeTypeId) return;
      e.preventDefault();
      const typeName = typeById.get(nodeTypeId)?.display_name || typeById.get(nodeTypeId)?.key || t("节点", "Node");
      const label = typeof window !== "undefined" ? window.prompt(t("节点标签", "Node label"), typeName) : null;
      if (!label || !label.trim()) return;
      void run(() => createNode({ companyId, domainId, key: `n-${Date.now()}`, label: label.trim(), nodeTypeId }));
    },
    [companyId, domainId, createNode, run, nodeTypeDragMime, typeById],
  );

  return (
    <div
      ref={wrapRef}
      onDragOver={nodeTypeDragMime ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } : undefined}
      onDrop={nodeTypeDragMime ? onDrop : undefined}
      className={[
        "relative w-full overflow-hidden border border-border bg-background",
        fill ? "h-full rounded-none border-0" : "h-[420px] rounded-lg",
      ].join(" ")}
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        fitView
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_e, node) => onSelectNode?.(node.id)}
        onPaneClick={() => { closeMenu(); onSelectNode?.(null); }}
        onPaneContextMenu={(e) => {
          const p = screenToFlowPosition({ x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY });
          openMenu(e as unknown as ReactMouseEvent, { kind: "canvas", flowX: p.x, flowY: p.y });
        }}
        onNodeContextMenu={(e, node) => openMenu(e, { kind: "node", id: node.id, label: (node.data as OntologyNodeData).label })}
        onEdgeContextMenu={(e, edge) => openMenu(e, { kind: "edge", id: edge.id, label: String(edge.label ?? "") })}
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-card" />
      </ReactFlow>

      <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-md bg-card/80 px-2 py-1 text-(length:--text-nano) text-muted-foreground">
        {nodeTypeDragMime
          ? t("拖类型到此=按类型建节点 · 右键=菜单 · 拖手柄=连线", "Drop a type here=typed node · right-click=menu · drag handle=connect")
          : t("右键:画布=加节点 · 节点/边=菜单 · 拖手柄=连线", "Right-click: canvas=add · node/edge=menu · drag handle=connect")}
        {busy ? ` · ${t("保存中…", "saving…")}` : ""}
      </div>

      {rawNodeTypes.length > 0 && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex max-w-[60%] flex-wrap gap-x-3 gap-y-1 rounded-md bg-card/80 px-2 py-1 text-(length:--text-nano) text-muted-foreground">
          {rawNodeTypes.map((nt) => (
            <span key={nt.id} className="flex items-center gap-1">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: toneFor(nt.id) }} />
              {nt.display_name || nt.key}
            </span>
          ))}
        </div>
      )}
      {err && <div className="absolute left-2 top-2 z-10 rounded-md bg-card/80 px-2 py-1 text-(length:--text-nano) text-muted-foreground">{err}</div>}

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }} />
          <div
            className="absolute z-50 min-w-[9rem] rounded-lg border border-border bg-card p-1 shadow-lg"
            style={{ left: menu.x, top: menu.y }}
          >
            {menu.kind === "canvas" && (
              <MenuItem label={t("新建节点", "Add node")} onClick={() => { const m = menu; closeMenu(); addNode(m.flowX ?? 0, m.flowY ?? 0); }} />
            )}
            {menu.kind === "node" && (
              <>
                <MenuItem
                  label={t("重命名", "Rename")}
                  onClick={() => {
                    const m = menu; closeMenu();
                    const label = window.prompt(t("节点标签", "Node label"), m.label);
                    if (label && label.trim()) void run(() => updateNode({ companyId, nodeId: m.id, label: label.trim() }));
                  }}
                />
                <MenuItem
                  label={t("删除", "Delete")}
                  danger
                  onClick={() => { const m = menu; closeMenu(); if (window.confirm(t("删除该节点及其边?", "Delete this node and its edges?"))) void run(() => deleteNode({ companyId, nodeId: m.id })); }}
                />
              </>
            )}
            {menu.kind === "edge" && (
              <>
                <MenuItem
                  label={t("重命名关系", "Rename relation")}
                  onClick={() => {
                    const m = menu; closeMenu();
                    const rk = window.prompt(t("关系名", "Relation key"), m.label) ?? "";
                    void run(() => updateEdge({ companyId, edgeId: m.id, relationKey: rk.trim() || null }));
                  }}
                />
                <MenuItem
                  label={t("删除", "Delete")}
                  danger
                  onClick={() => { const m = menu; closeMenu(); if (window.confirm(t("删除该边?", "Delete this edge?"))) void run(() => deleteEdge({ companyId, edgeId: m.id })); }}
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }): ReactElement {
  return (
    <button
      onClick={onClick}
      className={[
        "block w-full rounded-md px-2.5 py-1.5 text-left text-(length:--text-compact) transition-colors hover:bg-accent",
        danger ? "text-destructive" : "text-foreground",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

type GraphViewMode = "graph" | "table" | "schema";

interface GraphViewProps {
  companyId: string;
  domainId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeTypes?: GraphNodeType[];
  relationTypes?: GraphNodeType[];
  onChanged: () => void;
  /** Lift node selection to a host workbench inspector (optional). */
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  /** Optional: filter/highlight to a single node type (from a type tree). */
  focusNodeTypeId?: string | null;
  /** Control which view is shown; if omitted GraphView owns its own tab state. */
  mode?: GraphViewMode;
  /** Hide the internal graph/table/schema tab bar (when host renders tabs). */
  hideTabs?: boolean;
  /** MIME key used to drag a node type from a host tree onto the canvas. */
  nodeTypeDragMime?: string;
}

/**
 * Ontology workbench with three views (DS parity):
 *  - Graph:  ReactFlow canvas with type-colored nodes
 *  - Table:  flat node/edge listings
 *  - Schema: node-type and relation-type definitions
 */
export function GraphView(props: GraphViewProps): ReactElement {
  useReactFlowCss();
  const [ownMode, setOwnMode] = useState<GraphViewMode>("graph");
  const mode = props.mode ?? ownMode;
  const setMode = props.mode != null ? () => {} : setOwnMode;
  const nodeTypeDefs = props.nodeTypes ?? [];
  const relationTypeDefs = props.relationTypes ?? [];

  const tabs: { id: GraphViewMode; label: string }[] = [
    { id: "graph", label: t("图谱", "Graph") },
    { id: "table", label: t("表格", "Table") },
    { id: "schema", label: "Schema" },
  ];

  // When embedded in the workbench (hideTabs) OR when `mode` is host-controlled,
  // render flush with no card chrome and no internal tab bar (the host owns the
  // tabs), so the no-op setMode can never be reached from a visible control.
  const embedded = props.hideTabs || props.mode != null;

  const body = (
    <>
      {mode === "graph" &&
        (props.nodes.length === 0 ? (
          <EmptyGraph {...props} />
        ) : (
          <ReactFlowProvider>
            <GraphCanvas {...props} nodeTypes={nodeTypeDefs} fill={embedded} />
          </ReactFlowProvider>
        ))}

      {mode === "table" && <TableView nodes={props.nodes} edges={props.edges} nodeTypes={nodeTypeDefs} />}

      {mode === "schema" && <SchemaView nodeTypes={nodeTypeDefs} relationTypes={relationTypeDefs} />}
    </>
  );

  if (embedded) return <div className="h-full min-h-0">{body}</div>;

  return (
    <div className="mb-3 rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-1 border-b border-border">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setMode(tb.id)}
            className={[
              "-mb-px border-b-2 px-3 py-1.5 text-(length:--text-compact) font-medium transition-colors",
              mode === tb.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {tb.label}
          </button>
        ))}
      </div>
      {body}
    </div>
  );
}

/** Flat node/edge listing. Read-only; editing stays in the graph + type sections. */
function TableView({
  nodes,
  edges,
  nodeTypes,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeTypes: GraphNodeType[];
}): ReactElement {
  const typeById = useMemo(() => {
    const m = new Map<string, GraphNodeType>();
    for (const nt of nodeTypes) m.set(nt.id, nt);
    return m;
  }, [nodeTypes]);
  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) m.set(n.id, n.label || n.key);
    return m;
  }, [nodes]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 text-(length:--text-nano) font-semibold text-muted-foreground">
          {t("节点", "Nodes")} · {nodes.length}
        </div>
        {nodes.length === 0 ? (
          <div className="text-(length:--text-compact) text-muted-foreground">{t("暂无节点。", "No nodes.")}</div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-(length:--text-compact)">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">{t("标签", "Label")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t("键", "Key")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t("类型", "Type")}</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => {
                  const nt = n.nodeTypeId ? typeById.get(n.nodeTypeId) : undefined;
                  return (
                    <tr key={n.id} className="border-t border-border">
                      <td className="px-2 py-1.5">
                        <span className="flex items-center gap-1.5">
                          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: toneFor(n.nodeTypeId) }} />
                          {n.label || n.key}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">{n.key}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{nt ? (nt.display_name || nt.key) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 text-(length:--text-nano) font-semibold text-muted-foreground">
          {t("边", "Edges")} · {edges.length}
        </div>
        {edges.length === 0 ? (
          <div className="text-(length:--text-compact) text-muted-foreground">{t("暂无边。", "No edges.")}</div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-(length:--text-compact)">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">{t("源", "Source")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t("关系", "Relation")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t("目标", "Target")}</th>
                </tr>
              </thead>
              <tbody>
                {edges.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-2 py-1.5">{labelById.get(e.sourceNodeId) ?? e.sourceNodeId}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{e.relationKey ?? "—"}</td>
                    <td className="px-2 py-1.5">{labelById.get(e.targetNodeId) ?? e.targetNodeId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Schema definitions: node types + relation types. */
function SchemaView({
  nodeTypes,
  relationTypes,
}: {
  nodeTypes: GraphNodeType[];
  relationTypes: GraphNodeType[];
}): ReactElement {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SchemaColumn title={t("节点类型", "Node types")} items={nodeTypes} />
      <SchemaColumn title={t("关系类型", "Relation types")} items={relationTypes} />
    </div>
  );
}

function SchemaColumn({ title, items }: { title: string; items: GraphNodeType[] }): ReactElement {
  return (
    <div>
      <div className="mb-1 text-(length:--text-nano) font-semibold text-muted-foreground">
        {title} · {items.length}
      </div>
      {items.length === 0 ? (
        <div className="text-(length:--text-compact) text-muted-foreground">—</div>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: toneFor(it.id) }} />
              <span className="text-(length:--text-compact) font-medium">{it.display_name || it.key}</span>
              <span className="text-(length:--text-nano) text-muted-foreground">{it.key}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Empty state: still allows adding the first node (no flow coordinates needed). */
function EmptyGraph({
  companyId,
  domainId,
  onChanged,
}: {
  companyId: string;
  domainId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onChanged: () => void;
}): ReactElement {
  const createNode = usePluginAction("create-node");
  const [busy, setBusy] = useState(false);
  const add = useCallback(async () => {
    const label = typeof window !== "undefined" ? window.prompt(t("节点标签", "Node label")) : null;
    if (!label || !label.trim()) return;
    setBusy(true);
    try {
      await createNode({ companyId, domainId, key: `n-${Date.now()}`, label: label.trim() });
      onChanged();
    } finally {
      setBusy(false);
    }
  }, [companyId, domainId, createNode, onChanged]);

  return (
    <div className="flex h-[220px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-background text-muted-foreground">
      <div className="text-(length:--text-compact)">{t("还没有节点。", "No nodes yet.")}</div>
      <button
        onClick={add}
        disabled={busy}
        className="rounded-lg bg-primary px-3 py-1.5 text-(length:--text-compact) font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "…" : t("新建第一个节点", "Add the first node")}
      </button>
    </div>
  );
}
