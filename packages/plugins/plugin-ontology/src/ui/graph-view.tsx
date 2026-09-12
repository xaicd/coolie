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
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from "react";
import { usePluginAction } from "@paperclipai/plugin-sdk/ui";

export interface GraphNode {
  id: string;
  key: string;
  label: string;
  nodeTypeId: string | null;
}
export interface GraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationKey: string | null;
  weight: number;
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

type OntologyNodeData = { label: string; nodeKey: string };

/** Custom node: rounded card, primary accent, source/target handles for linking. */
function OntologyNode({ data, selected }: NodeProps): ReactElement {
  const d = data as OntologyNodeData;
  return (
    <div
      className={[
        "rounded-lg border px-3 py-2 min-w-[128px] max-w-[220px] shadow-sm transition-colors",
        "bg-card text-foreground",
        selected ? "border-primary ring-1 ring-primary" : "border-border",
      ].join(" ")}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border !border-border !bg-muted-foreground" />
      <div className="truncate text-(length:--text-compact) font-medium">{d.label}</div>
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
  onChanged,
}: {
  companyId: string;
  domainId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onChanged: () => void;
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

  // Deterministic circular seed layout (positions are view-only; not persisted).
  const flowNodes: Node[] = useMemo(() => {
    const n = rawNodes.length || 1;
    return rawNodes.map((nd, i) => {
      const a = (2 * Math.PI * i) / n;
      return {
        id: nd.id,
        type: "ontology",
        position: { x: 320 + Math.cos(a) * 220, y: 220 + Math.sin(a) * 170 },
        data: { label: nd.label || nd.key, nodeKey: nd.key },
      } satisfies Node;
    });
  }, [rawNodes]);

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

  return (
    <div ref={wrapRef} className="relative h-[420px] w-full overflow-hidden rounded-lg border border-border bg-background">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        fitView
        proOptions={{ hideAttribution: true }}
        onPaneContextMenu={(e) => {
          const p = screenToFlowPosition({ x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY });
          openMenu(e as unknown as ReactMouseEvent, { kind: "canvas", flowX: p.x, flowY: p.y });
        }}
        onNodeContextMenu={(e, node) => openMenu(e, { kind: "node", id: node.id, label: (node.data as OntologyNodeData).label })}
        onEdgeContextMenu={(e, edge) => openMenu(e, { kind: "edge", id: edge.id, label: String(edge.label ?? "") })}
        onClick={closeMenu}
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-card" />
      </ReactFlow>

      <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-md bg-card/80 px-2 py-1 text-(length:--text-nano) text-muted-foreground">
        {t("右键:画布=加节点 · 节点/边=菜单 · 拖手柄=连线", "Right-click: canvas=add · node/edge=menu · drag handle=connect")}
        {busy ? ` · ${t("保存中…", "saving…")}` : ""}
      </div>
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

/** ReactFlow-based ontology graph. Empty state prompts the first node. */
export function GraphView(props: {
  companyId: string;
  domainId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onChanged: () => void;
}): ReactElement {
  useReactFlowCss();
  return (
    <div className="mb-3 rounded-xl border border-border bg-card p-4">
      <div className="mb-2 text-(length:--text-compact) font-semibold">{t("图谱", "Graph")}</div>
      {props.nodes.length === 0 ? (
        <EmptyGraph {...props} />
      ) : (
        <ReactFlowProvider>
          <GraphCanvas {...props} />
        </ReactFlowProvider>
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
