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
  type ReactNode,
} from "react";
import { usePluginAction } from "@paperclipai/plugin-sdk/ui";
import { BootstrapDraftPreview, type DraftPreview } from "./BootstrapDraftPreview.js";
import { NodePropertyEditor } from "./NodePropertyEditor.js";

export type NodeLifecycle = "active" | "stale" | "deprecated" | "archived";

export interface GraphNode {
  id: string;
  key: string;
  label: string;
  nodeTypeId: string | null;
  lifecycleState?: NodeLifecycle;
  properties?: Record<string, unknown> | null;
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
  sourceDomainId?: string | null;
  targetDomainId?: string | null;
  isCrossDomain?: boolean;
}
export interface GraphNodeType {
  id: string;
  key: string;
  display_name?: string | null;
  /** JSON Schema describing the per-instance properties this type allows. */
  propertiesSchema?: Record<string, unknown> | null;
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

import { t } from "./isZh.js";

type OntologyNodeData = { label: string; nodeKey: string; tone: string; typeName: string | null; dimmed?: boolean; fill?: string | null };

/**
 * Custom node: rounded card with a type-colored left accent bar and a type dot,
 * source/target handles for linking, and a native title tooltip showing the key
 * and type on hover.
 */
function OntologyNode({ data, selected }: NodeProps): ReactElement {
  const d = data as OntologyNodeData;
  const tip = d.typeName ? `${d.label} · ${d.nodeKey} · ${d.typeName}` : `${d.label} · ${d.nodeKey}`;
  // Cluster mode paints a tinted background behind the card so nodes of the
  // same type visually cluster even when their positions are layout-driven.
  const fillStyle = d.fill
    ? { background: `linear-gradient(180deg, ${d.fill}26, ${d.fill}10)` }
    : undefined;
  return (
    <div
      title={tip}
      className={[
        "relative rounded-lg border px-3 py-2 pl-3.5 min-w-[128px] max-w-[220px] shadow-sm transition-all",
        "bg-card text-foreground",
        selected ? "border-primary ring-1 ring-primary" : "border-border",
        d.dimmed ? "opacity-30" : "",
      ].join(" ")}
      style={fillStyle}
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
  nodeKey?: string;
  nodeTypeId?: string | null;
  lifecycle?: NodeLifecycle;
  relationKey?: string | null;
  weight?: number;
  sourceNodeId?: string;
  targetNodeId?: string;
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
  onViewNodeDetail,
  onSimulateImpact,
  isDomainEmpty,
  onAskAideAboutNode,
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
  /** DS "view detail" — open the node inspector for this node. */
  onViewNodeDetail?: (nodeId: string) => void;
  /** DS "impact simulation" — run blast-radius for this node. */
  onSimulateImpact?: (node: GraphNode) => void;
  /** When true, the canvas right-click menu shows "AI 初始化此域". */
  isDomainEmpty?: boolean;
  /** Ask-aide about a specific node — opens the SandboxTab with a pre-filled
   *  prompt. The parent (DomainWorkspace) owns the SandboxTab, so it must
   *  implement this bridge. */
  onAskAideAboutNode?: (node: { id: string; key: string; label: string }) => void;
}): ReactElement {
  useReactFlowCss();
  const createNode = usePluginAction("create-node");
  const createEdge = usePluginAction("create-edge");
  const updateNode = usePluginAction("update-node");
  const deleteNode = usePluginAction("delete-node");
  const updateEdge = usePluginAction("update-edge");
  const deleteEdge = usePluginAction("delete-edge");
  const extendFromNode = usePluginAction("ai-extend-from-node");
  const { screenToFlowPosition, fitView } = useReactFlow();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Result of `ai-extend-from-node` — kept here so we can render a preview
  // modal and let the user deselect rows before applying. The worker already
  // wrote the rows; the modal is review-only.
  const [extendPreview, setExtendPreview] = useState<{
    focalKey: string;
    focalLabel: string;
    preview: DraftPreview;
  } | null>(null);
  // DS "关系过滤" — show only edges of one relation key (null = all).
  const [relationFilter, setRelationFilter] = useState<string | null>(null);
  // DS layout modes: radial / layered (by graph depth) / grid.
  const [layout, setLayout] = useState<"radial" | "layered" | "grid">("radial");
  // Connect mode toggle — surfaces node handles for drag-to-link.
  const [connectMode, setConnectMode] = useState(false);
  // Soft cluster by nodeType — off / group nodes of the same type together in
  // a deterministic grid / paint them with a per-type tint. Client-side only;
  // no algorithm, no dep. Works on top of whatever `layout` is active.
  const [clusterMode, setClusterMode] = useState<"off" | "byType" | "colorByType">("off");

  // Node-level properties editor — opened from the node right-click menu.
  // We model it as inline popup state rather than reusing the right-inspector
  // because the right-click menu is the primary place a user editing the graph
  // is going to look, and going off to the side panel breaks their flow.
  const [propEditorNodeId, setPropEditorNodeId] = useState<string | null>(null);
  const propEditorNode = useMemo(
    () => (propEditorNodeId ? rawNodes.find((n) => n.id === propEditorNodeId) ?? null : null),
    [propEditorNodeId, rawNodes],
  );

  const typeById = useMemo(() => {
    const m = new Map<string, GraphNodeType>();
    for (const nt of rawNodeTypes) m.set(nt.id, nt);
    return m;
  }, [rawNodeTypes]);

  // View-only layout positions (not persisted). Three strategies:
  //  - radial:  even circle (good for small dense graphs)
  //  - layered: topological depth by incoming edges (DAG-ish flows)
  //  - grid:    fixed grid (predictable scanning)
  const positions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    const n = rawNodes.length || 1;

    if (layout === "radial") {
      rawNodes.forEach((nd, i) => {
        const a = (2 * Math.PI * i) / n;
        pos.set(nd.id, { x: 360 + Math.cos(a) * 260, y: 260 + Math.sin(a) * 200 });
      });
    } else if (layout === "grid") {
      const cols = Math.ceil(Math.sqrt(n));
      rawNodes.forEach((nd, i) => {
        pos.set(nd.id, { x: 80 + (i % cols) * 240, y: 60 + Math.floor(i / cols) * 130 });
      });
    } else {
      // layered: compute depth = longest incoming path (BFS from roots)
      const incoming = new Map<string, string[]>();
      const outgoing = new Map<string, string[]>();
      for (const nd of rawNodes) { incoming.set(nd.id, []); outgoing.set(nd.id, []); }
      for (const e of rawEdges) {
        if (incoming.has(e.targetNodeId)) incoming.get(e.targetNodeId)!.push(e.sourceNodeId);
        if (outgoing.has(e.sourceNodeId)) outgoing.get(e.sourceNodeId)!.push(e.targetNodeId);
      }
      const depth = new Map<string, number>();
      const visiting = new Set<string>();
      const computeDepth = (id: string): number => {
        if (depth.has(id)) return depth.get(id)!;
        if (visiting.has(id)) return 0; // cycle guard
        visiting.add(id);
        const parents = incoming.get(id) ?? [];
        const d = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(computeDepth));
        visiting.delete(id);
        depth.set(id, d);
        return d;
      };
      for (const nd of rawNodes) computeDepth(nd.id);
      const byLevel = new Map<number, string[]>();
      for (const nd of rawNodes) {
        const d = depth.get(nd.id) ?? 0;
        if (!byLevel.has(d)) byLevel.set(d, []);
        byLevel.get(d)!.push(nd.id);
      }
      for (const [level, ids] of byLevel) {
        ids.forEach((id, i) => {
          pos.set(id, { x: 100 + i * 220, y: 60 + level * 140 });
        });
      }
    }

    // Soft cluster: when active, snap each node's x/y into a deterministic
    // 4×6 cell indexed by a stable hash of its nodeTypeId so nodes of the
    // same type end up visually grouped. Nodes with null type keep their
    // layout-computed position. The per-cell offset is small so the existing
    // layout's overall shape stays recognizable.
    if (clusterMode === "byType") {
      const cols = 6;
      const cellW = 220;
      const cellH = 130;
      const xOff = 80;
      const yOff = 60;
      for (const nd of rawNodes) {
        if (!nd.nodeTypeId) continue;
        let h = 0;
        for (let i = 0; i < nd.nodeTypeId.length; i++) h = (h * 31 + nd.nodeTypeId.charCodeAt(i)) >>> 0;
        const cell = h % (cols * 4);
        const col = cell % cols;
        const row = Math.floor(cell / cols);
        // Small jitter inside the cell so neighbouring nodes don't perfectly overlap.
        const jx = ((h >> 7) % 60) - 30;
        const jy = ((h >> 13) % 50) - 25;
        pos.set(nd.id, { x: xOff + col * cellW + jx, y: yOff + row * cellH + jy });
      }
    }

    return pos;
  }, [rawNodes, rawEdges, layout, clusterMode]);

  const flowNodes: Node[] = useMemo(() => {
    return rawNodes.map((nd) => {
      const nt = nd.nodeTypeId ? typeById.get(nd.nodeTypeId) : undefined;
      const dimmed = focusNodeTypeId != null && nd.nodeTypeId !== focusNodeTypeId;
      // Cluster coloring: when clusterMode is "colorByType" (and even "byType"
      // for extra clarity), replace the node's border tone with a slightly
      // desaturated fill so different types stand out without losing shape.
      const clusterTint = clusterMode !== "off" && nd.nodeTypeId
        ? toneFor(`fill:${nd.nodeTypeId}`)
        : null;
      return {
        id: nd.id,
        type: "ontology",
        position: positions.get(nd.id) ?? { x: 0, y: 0 },
        selected: selectedNodeId != null && nd.id === selectedNodeId,
        data: {
          label: nd.label || nd.key,
          nodeKey: nd.key,
          tone: toneFor(nd.nodeTypeId),
          typeName: nt ? (nt.display_name || nt.key) : null,
          dimmed,
          fill: clusterTint,
        },
      } satisfies Node;
    });
  }, [rawNodes, typeById, selectedNodeId, focusNodeTypeId, positions, clusterMode]);

  // Distinct relation keys present on edges (for the filter dropdown).
  const relationKeys = useMemo(() => {
    const set = new Set<string>();
    for (const e of rawEdges) if (e.relationKey) set.add(e.relationKey);
    return Array.from(set).sort();
  }, [rawEdges]);

  const flowEdges: Edge[] = useMemo(
    () =>
      rawEdges
        .filter((e) => relationFilter == null || e.relationKey === relationFilter)
        .map((e) => ({
          id: e.id,
          source: e.sourceNodeId,
          target: e.targetNodeId,
          label: e.relationKey ?? undefined,
          markerEnd: { type: MarkerType.ArrowClosed },
        })),
    [rawEdges, relationFilter],
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

  // Ask-aide about a specific node — pre-fills a prompt that the parent
  // SandboxTab will surface. We do not call ask-aide directly here because
  // the chat lives in a sibling tab; the parent bridges by switching views.
  const askAideAboutNode = useCallback(
    (nodeId: string, key: string, label: string) => {
      onAskAideAboutNode?.({ id: nodeId, key, label });
    },
    [onAskAideAboutNode],
  );

  // Run `ai-extend-from-node` (synchronous LLM + write). The action returns
  // the rows it wrote; we surface them in a preview modal so the user can
  // see what was created before the canvas redraws.
  const aiExtend = useCallback(
    async (nodeId: string, kind: "related" | "extend") => {
      setBusy(true);
      setErr(null);
      try {
        const focal = rawNodes.find((n) => n.id === nodeId);
        const res = (await extendFromNode({ companyId, domainId, nodeId, kind })) as {
          ok: boolean;
          kind: string;
          focalKey: string;
          created: { nodes: Array<{ key: string; label: string; nodeTypeKey: string }>; edges: Array<{ sourceKey: string; targetKey: string; relationKey: string }> };
        };
        setExtendPreview({
          focalKey: res.focalKey,
          focalLabel: focal?.label ?? res.focalKey,
          preview: { nodes: res.created.nodes, edges: res.created.edges },
        });
        onChanged();
      } catch (e) {
        setErr(String((e as Error)?.message ?? e));
      } finally {
        setBusy(false);
      }
    },
    [rawNodes, extendFromNode, companyId, domainId, onChanged],
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
    const MENU_W = 200;
    const MENU_H = 340;
    let x = e.clientX - (rect?.left ?? 0);
    let y = e.clientY - (rect?.top ?? 0);
    // Flip the menu left/up when it would overflow the canvas bounds so it
    // never renders under the right stats panel or below the viewport.
    if (rect) {
      if (x + MENU_W > rect.width) x = Math.max(4, x - MENU_W);
      if (y + MENU_H > rect.height) y = Math.max(4, rect.height - MENU_H - 4);
    }
    setMenu({ ...state, x, y });
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
        nodesConnectable={connectMode}
        fitView
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_e, node) => onSelectNode?.(node.id)}
        onPaneClick={() => { closeMenu(); onSelectNode?.(null); }}
        onPaneContextMenu={(e) => {
          const p = screenToFlowPosition({ x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY });
          openMenu(e as unknown as ReactMouseEvent, { kind: "canvas", flowX: p.x, flowY: p.y });
        }}
        onNodeContextMenu={(e, node) => {
          const raw = rawNodes.find((n) => n.id === node.id);
          openMenu(e, {
            kind: "node",
            id: node.id,
            label: (node.data as OntologyNodeData).label,
            nodeKey: raw?.key,
            nodeTypeId: raw?.nodeTypeId,
            lifecycle: raw?.lifecycleState,
          });
        }}
        onEdgeContextMenu={(e, edge) => {
          const raw = rawEdges.find((ed) => ed.id === edge.id);
          openMenu(e, {
            kind: "edge",
            id: edge.id,
            label: String(edge.label ?? ""),
            relationKey: raw?.relationKey,
            weight: raw?.weight,
            sourceNodeId: raw?.sourceNodeId,
            targetNodeId: raw?.targetNodeId,
          });
        }}
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-card" />
      </ReactFlow>

      {/* ── Bottom floating toolbar (DS parity: layout / cluster-filter / edit / simulate) ── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
        <div className="pointer-events-auto flex items-stretch gap-2 rounded-xl border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur">
          {/* Layout group */}
          <div className="flex items-center gap-0.5 rounded-lg bg-muted/40 p-0.5">
            <ToolbarBtn
              active={layout === "layered"}
              onClick={() => { setLayout("layered"); setTimeout(() => fitView({ duration: 300 }), 60); }}
              title={t("层级布局", "Layered layout")}
            >⤨ {t("层级", "Layered")}</ToolbarBtn>
            <ToolbarBtn
              active={layout === "radial"}
              onClick={() => { setLayout("radial"); setTimeout(() => fitView({ duration: 300 }), 60); }}
              title={t("环形布局", "Radial layout")}
            >◎ {t("环形", "Radial")}</ToolbarBtn>
            <ToolbarBtn
              active={layout === "grid"}
              onClick={() => { setLayout("grid"); setTimeout(() => fitView({ duration: 300 }), 60); }}
              title={t("网格布局", "Grid layout")}
            >▦ {t("网格", "Grid")}</ToolbarBtn>
            <ToolbarBtn
              active={clusterMode !== "off"}
              onClick={() => {
                setClusterMode((c) => (c === "off" ? "byType" : c === "byType" ? "colorByType" : "off"));
                setTimeout(() => fitView({ duration: 300 }), 80);
              }}
              title={t(
                "聚类: 按类型分组 / 着色 / 关",
                "Cluster: group by type / colour / off",
              )}
            >
              ⊛ {clusterMode === "off"
                ? t("聚类", "Cluster")
                : clusterMode === "byType"
                  ? t("聚类:分组", "Cluster: grouped")
                  : t("聚类:着色", "Cluster: coloured")}
            </ToolbarBtn>
          </div>

          {/* Relation filter */}
          {relationKeys.length > 0 && (
            <div className="flex items-center rounded-lg bg-muted/40 px-1">
              <select
                value={relationFilter ?? ""}
                onChange={(e) => setRelationFilter(e.target.value || null)}
                title={t("按关系过滤", "Filter by relation")}
                className="h-7 bg-transparent px-1 text-(length:--text-nano) text-foreground outline-none"
              >
                <option value="">{t("全部关系", "All relations")}</option>
                {relationKeys.map((rk) => <option key={rk} value={rk}>{rk}</option>)}
              </select>
            </div>
          )}

          <div className="w-px bg-border" />

          {/* Edit group */}
          <ToolbarBtn
            onClick={() => addNode(360, 260)}
            title={t("新增节点", "Add node")}
          >＋ {t("新增节点", "Add node")}</ToolbarBtn>
          <ToolbarBtn
            active={connectMode}
            onClick={() => setConnectMode((c) => !c)}
            title={t("连线模式:拖拽节点手柄连线", "Connect mode: drag node handles to link")}
          >⟿ {t("连线", "Connect")}</ToolbarBtn>

          <div className="w-px bg-border" />

          {/* Simulate — reachability highlight from selected node */}
          <ToolbarBtn
            onClick={() => {
              if (!selectedNodeId) { window.alert(t("请先选中一个节点", "Select a node first")); return; }
              const reachable = new Set<string>([selectedNodeId]);
              let changed = true;
              while (changed) {
                changed = false;
                for (const e of rawEdges) {
                  if (reachable.has(e.sourceNodeId) && !reachable.has(e.targetNodeId)) { reachable.add(e.targetNodeId); changed = true; }
                }
              }
              window.alert(t(`从此节点可达 ${reachable.size} 个节点（含自身）`, `${reachable.size} nodes reachable downstream (incl. self)`));
            }}
            title={t("模拟演练:计算下游可达范围", "Simulate: compute downstream reachability")}
          >⚡ {t("模拟演练", "Simulate")}</ToolbarBtn>
        </div>
      </div>

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

      {extendPreview && (
        <BootstrapDraftPreview
          focalKey={extendPreview.focalKey}
          focalLabel={extendPreview.focalLabel}
          preview={extendPreview.preview}
          onApply={async () => {
            // Worker already wrote the rows; closing the modal just refreshes
            // the local view. We could delete unselected rows here, but that
            // adds complexity for marginal value — users can right-click
            // delete them.
            setExtendPreview(null);
            onChanged();
          }}
          onCancel={() => setExtendPreview(null)}
        />
      )}

      {propEditorNode && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setPropEditorNodeId(null)}
          onContextMenu={(e) => { e.preventDefault(); setPropEditorNodeId(null); }}
        >
          <div
            className="absolute left-1/2 top-1/2 z-50 w-[26rem] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="min-w-0">
                <div className="truncate text-(length:--text-compact) font-semibold">
                  {t("节点属性", "Node properties")}
                </div>
                <div className="truncate text-(length:--text-nano) text-muted-foreground">
                  {propEditorNode.label || propEditorNode.key}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPropEditorNodeId(null)}
                className="rounded px-2 py-0.5 text-(length:--text-nano) text-muted-foreground hover:bg-accent hover:text-foreground"
                title={t("关闭", "Close")}
              >
                ×
              </button>
            </div>
            <NodePropertyEditor
              initial={(propEditorNode.properties ?? {}) as Record<string, unknown>}
              busy={busy}
              onSave={async (next) => {
                setBusy(true);
                try {
                  await updateNode({ companyId, nodeId: propEditorNode.id, properties: next });
                  setPropEditorNodeId(null);
                  onChanged();
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </div>
        </div>
      )}

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }} />
          <div
            className="absolute z-50 min-w-[9rem] rounded-lg border border-border bg-card p-1 shadow-lg"
            style={{ left: menu.x, top: menu.y }}
          >
            {menu.kind === "canvas" && (
              <>
                <MenuItem label={t("新建", "New")} onClick={() => { const m = menu; closeMenu(); addNode(m.flowX ?? 0, m.flowY ?? 0); }} />
                {rawNodeTypes.length > 0 && (
                  <>
                    <MenuLabel>{t("按型", "By type")}</MenuLabel>
                    {rawNodeTypes.map((nt) => (
                      <MenuItem
                        key={nt.id}
                        label={nt.display_name || nt.key}
                        dot={toneFor(nt.id)}
                        onClick={() => {
                          closeMenu();
                          const label = window.prompt(t("节点标签", "Node label"), nt.display_name || nt.key);
                          if (label && label.trim()) void run(() => createNode({ companyId, domainId, key: `n-${Date.now()}`, label: label.trim(), nodeTypeId: nt.id }));
                        }}
                      />
                    ))}
                  </>
                )}
                <MenuDivider />
                {/* AI 初始化 — only on empty domains. Triggers the right-panel
                    BootstrapPanel via the parent's onRequestBootstrap hook. */}
                {isDomainEmpty && (
                  <MenuItem
                    label={t("AI 初始", "AI bootstrap")}
                    icon="✨"
                    onClick={() => {
                      closeMenu();
                      // The bootstrap lives in the right panel; ask the
                      // parent to focus / scroll to it. We don't start the
                      // bootstrap here so the user sees the description
                      // textarea + start button one more time.
                      if (typeof window !== "undefined") {
                        window.dispatchEvent(new CustomEvent("paperclip-ontology:focus-bootstrap-panel"));
                      }
                    }}
                  />
                )}
                <MenuItem label={t("适应", "Fit")} onClick={() => { closeMenu(); fitView({ duration: 300 }); }} />
              </>
            )}
            {menu.kind === "node" && (
              <>
                {/* DS-style header: node label + type */}
                <div className="border-b border-border px-2.5 pb-1.5 pt-1">
                  <div className="truncate text-(length:--text-compact) font-semibold">{menu.label}</div>
                  <div className="truncate text-(length:--text-nano) text-muted-foreground">
                    {menu.nodeKey ?? ""}
                    {menu.nodeTypeId ? ` · ${(typeById.get(menu.nodeTypeId)?.display_name || typeById.get(menu.nodeTypeId)?.key) ?? ""}` : ""}
                  </div>
                </div>
                <MenuItem
                  label={t("详情", "Detail")}
                  icon="◉"
                  onClick={() => { const m = menu; closeMenu(); onSelectNode?.(m.id ?? null); onViewNodeDetail?.(m.id!); }}
                />
                <MenuItem
                  label={t("推演", "Simulate")}
                  icon="⚡"
                  onClick={() => {
                    const m = menu; closeMenu();
                    const raw = rawNodes.find((n) => n.id === m.id);
                    if (raw) onSimulateImpact?.(raw);
                    else {
                      const reachable = new Set<string>([m.id!]);
                      let changed = true;
                      while (changed) {
                        changed = false;
                        for (const e of rawEdges) {
                          if (reachable.has(e.sourceNodeId) && !reachable.has(e.targetNodeId)) { reachable.add(e.targetNodeId); changed = true; }
                        }
                      }
                      window.alert(t(`下游可达 ${reachable.size - 1} 个节点`, `${reachable.size - 1} downstream nodes reachable`));
                    }
                  }}
                />
                <MenuDivider />
                <MenuItem
                  label={t("属性", "Props")}
                  icon="◐"
                  onClick={() => {
                    const m = menu; closeMenu();
                    if (m.id) setPropEditorNodeId(m.id);
                  }}
                />
                <MenuItem
                  label={t("改名", "Rename")}
                  onClick={() => {
                    const m = menu; closeMenu();
                    const label = window.prompt(t("节点标签", "Node label"), m.label);
                    if (label && label.trim()) void run(() => updateNode({ companyId, nodeId: m.id, label: label.trim() }));
                  }}
                />
                <MenuItem
                  label={t("连线", "Connect")}
                  onClick={() => {
                    const m = menu; closeMenu();
                    // Pick a target node by label via prompt (numbered list).
                    const others = rawNodes.filter((n) => n.id !== m.id);
                    if (others.length === 0) { window.alert(t("没有其他节点可连", "No other nodes to connect")); return; }
                    const list = others.map((n, i) => `${i + 1}. ${n.label || n.key}`).join("\n");
                    const pick = window.prompt(t(`连接到哪个节点? 输入编号:\n${list}`, `Connect to which node? Enter number:\n${list}`));
                    const idx = pick ? parseInt(pick, 10) - 1 : -1;
                    const target = others[idx];
                    if (!target) return;
                    const relationKey = window.prompt(t("关系名(可选)", "Relation key (optional)")) ?? "";
                    void run(() => createEdge({ companyId, domainId, sourceNodeId: m.id, targetNodeId: target.id, relationKey: relationKey.trim() || undefined }));
                  }}
                />
                <MenuItem
                  label={t("影响", "Impact")}
                  onClick={() => {
                    const m = menu; closeMenu();
                    const reachable = new Set<string>([m.id!]);
                    let changed = true;
                    while (changed) {
                      changed = false;
                      for (const e of rawEdges) {
                        if (reachable.has(e.sourceNodeId) && !reachable.has(e.targetNodeId)) { reachable.add(e.targetNodeId); changed = true; }
                      }
                    }
                    window.alert(t(`下游可达 ${reachable.size - 1} 个节点`, `${reachable.size - 1} downstream nodes reachable`));
                  }}
                />
                <MenuItem
                  label={t("复制", "Copy")}
                  onClick={() => {
                    const m = menu; closeMenu();
                    if (m.nodeKey && typeof navigator !== "undefined" && navigator.clipboard) {
                      void navigator.clipboard.writeText(m.nodeKey);
                    }
                  }}
                />
                <MenuItem label={t("聚焦", "Focus")} onClick={() => { const m = menu; closeMenu(); onSelectNode?.(m.id ?? null); }} />
                <MenuDivider />
                {/* AI actions on a node. We keep these just above "Delete" so
                    they're discoverable but not in the way of editing. */}
                <MenuLabel>{t("AI", "AI")}</MenuLabel>
                <MenuItem
                  label={t("解释", "Explain")}
                  icon="💬"
                  onClick={() => {
                    const m = menu; closeMenu();
                    if (m.id && m.nodeKey && m.label) askAideAboutNode(m.id, m.nodeKey, m.label);
                  }}
                />
                <MenuItem
                  label={t("推荐", "Suggest")}
                  icon="✨"
                  onClick={() => {
                    const m = menu; closeMenu();
                    if (m.id) void aiExtend(m.id, "related");
                  }}
                />
                <MenuItem
                  label={t("扩展", "Extend")}
                  icon="→"
                  onClick={() => {
                    const m = menu; closeMenu();
                    if (m.id) void aiExtend(m.id, "extend");
                  }}
                />
                <MenuDivider />
                {/* "动作" — Palantir Action Type on the node's ObjectType. We
                    jump to the actions tab with appliesToNodeTypeId prefilled
                    so the user can immediately create an Action tied to this
                    type. The dispatch is window-scoped CustomEvent because the
                    actions tab is rendered by a different React tree (the
                    workbench parent) than this graph view, and we want this
                    component to stay agnostic of the parent's layout. */}
                <MenuItem
                  label={t("动作", "Action")}
                  icon="⚙"
                  onClick={() => {
                    const m = menu; closeMenu();
                    if (!m.nodeTypeId) return;
                    window.dispatchEvent(new CustomEvent("paperclip-ontology:open-action-form", {
                      detail: { domainId, nodeTypeId: m.nodeTypeId },
                    }));
                  }}
                />
                <MenuDivider />
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
                  label={t("改键", "Rename key")}
                  onClick={() => {
                    const m = menu; closeMenu();
                    const rk = window.prompt(t("关系名", "Relation key"), m.relationKey ?? m.label) ?? "";
                    void run(() => updateEdge({ companyId, edgeId: m.id, relationKey: rk.trim() || null }));
                  }}
                />
                <MenuItem
                  label={t("反转", "Reverse")}
                  onClick={() => {
                    const m = menu; closeMenu();
                    if (!m.sourceNodeId || !m.targetNodeId) return;
                    // Delete + recreate reversed (store has no direction-swap op).
                    void run(async () => {
                      await deleteEdge({ companyId, edgeId: m.id });
                      await createEdge({ companyId, domainId, sourceNodeId: m.targetNodeId, targetNodeId: m.sourceNodeId, relationKey: m.relationKey ?? undefined });
                    });
                  }}
                />
                <MenuDivider />
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

function ToolbarBtn({
  children,
  onClick,
  active,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
}): ReactElement {
  return (
    <button
      onClick={onClick}
      title={title}
      className={[
        "flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-(length:--text-nano) font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function MenuItem({ label, onClick, danger, dot, icon }: { label: string; onClick: () => void; danger?: boolean; dot?: string; icon?: string }): ReactElement {
  return (
    <button
      onClick={onClick}
      className={[
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-(length:--text-compact) transition-colors hover:bg-accent",
        danger ? "text-destructive" : "text-foreground",
      ].join(" ")}
    >
      {dot && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />}
      {icon && <span aria-hidden className="w-4 shrink-0 text-center text-muted-foreground">{icon}</span>}
      <span className="truncate">{label}</span>
    </button>
  );
}

function MenuLabel({ children }: { children: ReactNode }): ReactElement {
  return <div className="px-2.5 pb-0.5 pt-1.5 text-(length:--text-nano) font-semibold uppercase tracking-wide text-muted-foreground">{children}</div>;
}

function MenuDivider(): ReactElement {
  return <div className="my-1 h-px bg-border" />;
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
  /** DS "view detail" — open the node inspector for this node. */
  onViewNodeDetail?: (nodeId: string) => void;
  /** DS "impact simulation" — run blast-radius for this node. */
  onSimulateImpact?: (node: GraphNode) => void;
  /** True when the domain has no nodes yet — enables the canvas "AI 初始化此域"
   *  right-click item and gates the right-panel BootstrapPanel. */
  isDomainEmpty?: boolean;
  /** Bridge to switch the host workbench to the SandboxTab with a pre-filled
   *  ask-aide prompt for the given node. */
  onAskAideAboutNode?: (node: { id: string; key: string; label: string }) => void;
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
      {mode === "graph" && (
        <ReactFlowProvider>
          <div className={embedded ? "relative h-full" : "relative"}>
            <GraphCanvas
              {...props}
              nodeTypes={nodeTypeDefs}
              fill={embedded}
              isDomainEmpty={props.isDomainEmpty}
              onAskAideAboutNode={props.onAskAideAboutNode}
            />
            {/* Empty-state overlay — sits ABOVE the ReactFlow canvas so the
                underlying pane still receives contextmenu events and the
                canvas menu (including "AI 初始化此域") stays reachable. */}
            {props.nodes.length === 0 && (
              <EmptyGraphOverlay {...props} />
            )}
          </div>
        </ReactFlowProvider>
      )}

      {mode === "table" && (
        <TableView
          nodes={props.nodes}
          edges={props.edges}
          nodeTypes={nodeTypeDefs}
          focusNodeTypeId={props.focusNodeTypeId}
        />
      )}

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

export const MAX_TABLE_PROPERTY_COLUMNS = 4;

/** Compact `name: type` rendering for a schema descriptor (DS shows `status: enum`). */
export function summarizePropertyType(descriptor: unknown): string {
  if (!descriptor || typeof descriptor !== "object") return String(descriptor ?? "");
  const obj = descriptor as { type?: string; format?: string; enum?: unknown[] };
  const base = obj.type ?? "any";
  if (Array.isArray(obj.enum) && obj.enum.length > 0) {
    return `${base} (${obj.enum.map((v) => String(v)).join(" | ")})`;
  }
  if (obj.format) return `${base} (${obj.format})`;
  return base;
}

/** Render one instance property for a table cell; mirrors DS's `cellValue`. */
function propertyCellValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Instance listing. Mirrors the DS table view: columns are derived from the
 * selected object type's `propertiesSchema`, rows are filtered to that type,
 * and the header reports the row count. With no type selected it falls back to
 * the identity columns — the same default DS shows (NAME | NODETYPE | STATE).
 */
function TableView({
  nodes,
  edges,
  nodeTypes,
  focusNodeTypeId,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeTypes: GraphNodeType[];
  focusNodeTypeId?: string | null;
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

  const focusedType = focusNodeTypeId ? typeById.get(focusNodeTypeId) : undefined;

  // Cap the property columns so a wide object type cannot push the identity
  // columns off screen; the full list stays available in the schema view.
  const propertyColumns = useMemo(() => {
    const schema = focusedType?.propertiesSchema;
    if (!schema || typeof schema !== "object") return [] as string[];
    return Object.keys(schema).slice(0, MAX_TABLE_PROPERTY_COLUMNS);
  }, [focusedType]);

  const visibleNodes = useMemo(
    () => (focusNodeTypeId ? nodes.filter((n) => n.nodeTypeId === focusNodeTypeId) : nodes),
    [nodes, focusNodeTypeId],
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 flex items-baseline gap-1.5 text-(length:--text-nano) font-semibold text-muted-foreground">
          <span>
            {t("共", "Total")} {visibleNodes.length} {t("条记录", "records")}
          </span>
          {focusedType && (
            <span className="font-normal">· {focusedType.display_name || focusedType.key}</span>
          )}
          {!focusedType && propertyColumns.length === 0 && (
            <span className="font-normal">
              · {t("选中左侧对象类型以显示其属性列", "Select an object type to show its property columns")}
            </span>
          )}
        </div>
        {visibleNodes.length === 0 ? (
          <div className="text-(length:--text-compact) text-muted-foreground">
            {focusedType
              ? t("该类型暂无实例。", "No instances of this type.")
              : t("暂无节点。", "No nodes.")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-(length:--text-compact)">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">{t("标签", "Label")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t("键", "Key")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t("类型", "Type")}</th>
                  {propertyColumns.map((col) => (
                    <th key={col} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleNodes.map((n) => {
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
                      {propertyColumns.map((col) => (
                        <td key={col} className="px-2 py-1.5 text-muted-foreground">
                          {propertyCellValue(n.properties?.[col])}
                        </td>
                      ))}
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

/**
 * Schema definitions. Object types list their properties inline (`name: type`)
 * with a count badge, mirroring the DS model view; relation types have no
 * property schema, so they render as a plain identity row.
 */
function SchemaView({
  nodeTypes,
  relationTypes,
}: {
  nodeTypes: GraphNodeType[];
  relationTypes: GraphNodeType[];
}): ReactElement {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SchemaColumn title={t("对象类型", "Object types")} items={nodeTypes} showProperties />
      <SchemaColumn title={t("关系类型", "Relation types")} items={relationTypes} />
    </div>
  );
}

function SchemaColumn({
  title,
  items,
  showProperties = false,
}: {
  title: string;
  items: GraphNodeType[];
  showProperties?: boolean;
}): ReactElement {
  return (
    <div>
      <div className="mb-1 text-(length:--text-nano) font-semibold text-muted-foreground">
        {title} · {items.length}
      </div>
      {items.length === 0 ? (
        <div className="text-(length:--text-compact) text-muted-foreground">—</div>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((it) => {
            const schema = it.propertiesSchema && typeof it.propertiesSchema === "object"
              ? Object.entries(it.propertiesSchema)
              : [];
            return (
              <div key={it.id} className="rounded-lg border border-border bg-background px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: toneFor(it.id) }} />
                  <span className="text-(length:--text-compact) font-medium">{it.display_name || it.key}</span>
                  <span className="text-(length:--text-nano) text-muted-foreground">{it.key}</span>
                  {showProperties && schema.length > 0 && (
                    <span className="ml-auto shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-(length:--text-nano) tabular-nums text-muted-foreground">
                      {schema.length} {t("属性", "props")}
                    </span>
                  )}
                </div>
                {showProperties && (
                  schema.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 pl-4">
                      {schema.map(([name, descriptor]) => (
                        <li key={name} className="flex items-baseline gap-1 text-(length:--text-nano)">
                          <span className="font-mono text-foreground/80">{name}</span>
                          <span className="text-muted-foreground">:</span>
                          <span className="text-muted-foreground">{summarizePropertyType(descriptor)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-0.5 pl-4 text-(length:--text-nano) italic text-muted-foreground">
                      {t("尚未配置属性", "No properties defined")}
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Empty state overlay: shown above the canvas when the domain has no nodes.
 *  Pointer events are limited to the inner card so right-clicks on the empty
 *  area still fall through to the ReactFlow pane and open the canvas menu
 *  (which is the only place the "AI 初始化此域" entry lives). */
function EmptyGraphOverlay({
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
    // Outer wrapper is transparent to pointer events so the ReactFlow pane
    // underneath still receives contextmenu / click events.
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div
        // Only the card itself intercepts pointer events — the button needs
        // to be clickable.
        className="pointer-events-auto flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-background/95 px-6 py-4 text-muted-foreground backdrop-blur-sm"
      >
        <div className="text-(length:--text-compact)">{t("还没有节点。", "No nodes yet.")}</div>
        <button
          onClick={add}
          disabled={busy}
          className="rounded-lg bg-primary px-3 py-1.5 text-(length:--text-compact) font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "…" : t("新建第一个节点", "Add the first node")}
        </button>
      </div>
    </div>
  );
}
