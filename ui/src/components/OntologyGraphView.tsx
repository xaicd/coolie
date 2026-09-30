import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router";
import type { EntityType, OntologyGraphEdge, OntologyGraphNode, OntologyGraphView } from "@paperclipai/shared";
import { ontologyGraphApi } from "../api/ontologyGraph";
import { queryKeys } from "../lib/queryKeys";

/**
 * Workshop graph view (wave154) — a dependency-free SVG rendering of an
 * `entity_relations` subgraph.
 *
 * Deliberately not react-flow/vis-network: the graph is small (a company-scoped
 * subgraph, capped server-side), and a hand-rolled concentric-ring layout keeps
 * the bundle free of a new graph engine while staying inside the token-only UI
 * rules. Nodes sit on rings by their BFS distance from the root, which makes
 * "how far is this from where I started" readable at a glance — the point of the
 * Palantir-style view.
 *
 * Click a node to open it; hover to see its metadata.
 */

const CANVAS = { width: 1000, height: 720, cx: 500, cy: 360 } as const;

const TYPE_COLOR: Record<EntityType, string> = {
  company: "var(--chart-5)",
  project: "var(--primary)",
  issue: "var(--chart-2)",
  spec: "var(--chart-3)",
  conversation: "var(--chart-4)",
  work_product: "var(--chart-1)",
  attachment: "var(--muted-foreground)",
  comment: "var(--muted-foreground)",
  agent: "var(--muted-foreground)",
};

const TYPE_LABEL: Record<EntityType, string> = {
  company: "公司",
  project: "项目",
  issue: "任务",
  spec: "规格",
  conversation: "对话",
  work_product: "交付物",
  attachment: "附件",
  comment: "评论",
  agent: "智能体",
};

const RELATION_LABEL: Record<string, string> = {
  belongs_to: "属于",
  attached_to: "挂载于",
  derived_from: "派生自",
  references: "引用",
  satisfies: "满足",
  discussed_in: "讨论于",
  spawned: "派生",
};

export { RELATION_LABEL };

interface PlacedNode {
  node: OntologyGraphNode;
  x: number;
  y: number;
  radius: number;
  depth: number;
}

function nodeKey(type: string, id: string) {
  return `${type}:${id}`;
}

/** BFS distance from the root over undirected edges, then a ring layout. */
function layoutGraph(
  nodes: OntologyGraphNode[],
  edges: OntologyGraphEdge[],
  rootKey: string | null,
): PlacedNode[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    (adjacency.get(edge.source) ?? adjacency.set(edge.source, []).get(edge.source)!).push(edge.target);
    (adjacency.get(edge.target) ?? adjacency.set(edge.target, []).get(edge.target)!).push(edge.source);
  }

  const depthOf = new Map<string, number>();
  if (rootKey && nodes.some((node) => node.key === rootKey)) {
    depthOf.set(rootKey, 0);
    let frontier = [rootKey];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const current of frontier) {
        for (const neighbour of adjacency.get(current) ?? []) {
          if (!depthOf.has(neighbour)) {
            depthOf.set(neighbour, (depthOf.get(current) ?? 0) + 1);
            next.push(neighbour);
          }
        }
      }
      frontier = next;
    }
  }

  const byDepth = new Map<number, OntologyGraphNode[]>();
  for (const node of nodes) {
    const depth = depthOf.get(node.key) ?? 0;
    const list = byDepth.get(depth);
    if (list) list.push(node);
    else byDepth.set(depth, [node]);
  }

  const placed: PlacedNode[] = [];
  let previousRadius = 0;
  for (const [depth, ring] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
    if (depth === 0 && ring.length === 1) {
      const node = ring[0]!;
      placed.push({ node, x: CANVAS.cx, y: CANVAS.cy, radius: 28, depth });
      continue;
    }
    const step = (Math.PI * 2) / Math.max(ring.length, 1);
    const offset = -Math.PI / 2;
    // Rings must be far enough apart not to overlap, and wide enough that a
    // crowded ring's nodes do not collide — so take the larger of the two.
    const neededForSpacing = (ring.length * 92) / (Math.PI * 2);
    const radius = Math.max(130 + (depth - 1) * 150, previousRadius + 150, neededForSpacing);
    previousRadius = radius;
    ring.forEach((node, index) => {
      const angle = offset + index * step;
      placed.push({
        node,
        x: CANVAS.cx + Math.cos(angle) * radius,
        y: CANVAS.cy + Math.sin(angle) * radius,
        radius: 18,
        depth,
      });
    });
  }
  return placed;
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function OntologyGraphView({
  companyId,
  rootType,
  rootId,
  depth,
  view,
  onSelectNode,
}: {
  companyId: string;
  rootType: EntityType;
  rootId: string;
  depth?: number;
  view?: OntologyGraphView;
  onSelectNode?: (node: OntologyGraphNode) => void;
}) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<OntologyGraphNode | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.ontology.graph(companyId, rootType, rootId, depth ?? null, view),
    queryFn: () => ontologyGraphApi.graph(companyId, { rootType, rootId, depth, view }),
    enabled: Boolean(companyId && rootType && rootId),
  });

  const placed = useMemo(
    () => (data ? layoutGraph(data.nodes, data.edges, data.root ? nodeKey(data.root.type, data.root.id) : null) : []),
    [data],
  );
  const positionByKey = useMemo(
    () => new Map(placed.map((entry) => [entry.node.key, entry] as const)),
    [placed],
  );
  // Fit the viewBox to whatever the layout produced, so a crowded ring (a
  // project with dozens of tasks) is scaled to fit rather than clipped.
  const viewBox = useMemo(() => {
    if (placed.length === 0) return `0 0 ${CANVAS.width} ${CANVAS.height}`;
    const pad = 90;
    const xs = placed.map((entry) => entry.x);
    const ys = placed.map((entry) => entry.y);
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const maxX = Math.max(...xs) + pad;
    const maxY = Math.max(...ys) + pad;
    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  }, [placed]);
  const presentTypes = useMemo(
    () => [...new Set((data?.nodes ?? []).map((node) => node.type))],
    [data],
  );

  if (isPending) {
    return <p className="text-sm text-muted-foreground">加载图谱中…</p>;
  }
  if (isError) {
    return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">暂无图谱数据。</p>;
  }

  const openNode = (node: OntologyGraphNode) => {
    if (onSelectNode) {
      onSelectNode(node);
      return;
    }
    if (node.href) navigate(node.href);
  };

  return (
    <div className="relative flex flex-col gap-3" data-testid="ontology-graph">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground" data-testid="ontology-graph-summary">
          节点 {data.nodes.length} · 边 {data.edges.length} · 深度 {data.depth}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {presentTypes.map((type) => (
            <span key={type} className="inline-flex items-center gap-1 text-(length:--text-nano) text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TYPE_COLOR[type] }} />
              {TYPE_LABEL[type]}
            </span>
          ))}
        </div>
        {data.truncated ? (
          <span className="text-(length:--text-nano) text-amber-700 dark:text-amber-300">
            图谱已截断（节点超过上限），仅显示部分。
          </span>
        ) : null}
      </div>

      <div
        className="relative w-full overflow-hidden rounded-lg border border-border bg-card"
        style={{ aspectRatio: "16 / 10" }}
      >
        <svg
          className="h-full w-full"
          viewBox={viewBox}
          role="img"
          aria-label="对象关系图谱"
        >
          {data.edges.map((edge) => {
            const from = positionByKey.get(edge.source);
            const to = positionByKey.get(edge.target);
            if (!from || !to) return null;
            return (
              <line
                key={edge.key}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="var(--border)"
                strokeWidth={edge.weight >= 3 ? 2.5 : edge.weight >= 2 ? 1.8 : 1}
              />
            );
          })}

          {placed.map(({ node, x, y, radius }) => {
            const isRoot = node.key === (data.root ? nodeKey(data.root.type, data.root.id) : "");
            const interactive = Boolean(node.href || onSelectNode);
            return (
              <g
                key={node.key}
                transform={`translate(${x} ${y})`}
                style={{ cursor: interactive ? "pointer" : "default" }}
                onMouseEnter={() => setHovered(node)}
                onMouseLeave={() => setHovered((current) => (current?.key === node.key ? null : current))}
                onClick={() => openNode(node)}
              >
                <circle
                  r={radius}
                  fill={TYPE_COLOR[node.type]}
                  stroke={isRoot ? "var(--foreground)" : "var(--card)"}
                  strokeWidth={isRoot ? 3 : 2}
                />
                <text
                  className="text-(length:--text-nano)"
                  textAnchor="middle"
                  y={radius + 14}
                  style={{ fill: "var(--foreground)" }}
                >
                  {truncate(node.label, 16)}
                </text>
                <text
                  className="text-(length:--text-nano)"
                  textAnchor="middle"
                  y={radius + 26}
                  style={{ fill: "var(--muted-foreground)" }}
                >
                  {TYPE_LABEL[node.type]}
                </text>
              </g>
            );
          })}
        </svg>

        {hovered ? (
          <div
            className="pointer-events-none absolute right-3 top-3 max-w-xs rounded-md border border-border bg-popover p-3 text-xs shadow-md"
            data-testid="ontology-node-tooltip"
          >
            <p className="font-medium text-foreground">{hovered.label}</p>
            <p className="mt-1 text-muted-foreground">
              {TYPE_LABEL[hovered.type]} · {hovered.type}
            </p>
            <p className="mt-0.5 break-all font-mono text-(length:--text-nano) text-muted-foreground">
              ID {hovered.id}
            </p>
            {hovered.metadata
              ? Object.entries(hovered.metadata).map(([key, value]) => (
                  <p key={key} className="mt-0.5 text-muted-foreground">
                    {key}: {value === null || value === undefined ? "—" : String(value)}
                  </p>
                ))
              : null}
          </div>
        ) : null}
      </div>

      <p className="text-(length:--text-nano) text-muted-foreground">
        节点按与根对象的距离分层（同心环，越外越远）。点击节点进入详情，悬停查看元数据。
      </p>
    </div>
  );
}
