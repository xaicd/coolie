import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Text as SvgText } from "react-native-svg";

/**
 * 原生本体关系图谱 · wave325 翻译自 web ui/src/components/OntologyGraphView
 *
 * 老板拍板 (10-05): 把 web 本体列表+相关操作各个功能页抄到原生. 图谱也要.
 *
 * 跟 web 版同 BFS + 同心圆环布局算法 + displayLabel 28 截断, 但:
 *   - 不依赖 useNavigate / TanStack useQuery (RN 没 react-router-dom)
 *   - SVG 元素改用 react-native-svg <Svg><Line><Circle><G><SvgText>
 *   - 节点点击不跳路由, 仅调 onSelectNode 回调 (PM 决定下一步)
 *   - 数据由 props.graph 传入 (父组件调 coolie.getOntologyGraph)
 *   - 颜色从 CSS var 改为 hex (react-native-svg 不接 CSS var)
 *
 * 严格按 AGENTS.md 宪法第 5 条 + §17 现有能力组合优先: 用 expo SDK 52 + 已装
 * react-native-svg, 不引 react-flow / d3 / vis-network 等重引擎.
 */

export type OntologyEntityType =
  | "company"
  | "project"
  | "issue"
  | "spec"
  | "conversation"
  | "work_product"
  | "attachment"
  | "comment"
  | "agent";

export interface OntologyGraphNode {
  key: string;
  id: string;
  type: OntologyEntityType;
  label: string;
  href?: string;
  metadata?: Record<string, unknown>;
}

export interface OntologyGraphEdge {
  key: string;
  source: string;
  target: string;
  weight?: number;
}

export interface OntologyGraphData {
  nodes: OntologyGraphNode[];
  edges: OntologyGraphEdge[];
  root?: { type: OntologyEntityType; id: string };
  depth?: number;
  truncated?: boolean;
}

const CANVAS = { width: 1000, height: 720, cx: 500, cy: 360 } as const;

const TYPE_COLOR: Record<OntologyEntityType, string> = {
  company: "#A78BFA",
  project: "#5E6AD2",
  issue: "#39A275",
  spec: "#E0A030",
  conversation: "#4FA1D9",
  work_product: "#EC4899",
  attachment: "#9CA3AF",
  comment: "#6B7280",
  agent: "#10B981",
};

const TYPE_LABEL: Record<OntologyEntityType, string> = {
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

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function displayLabel(value: string) {
  return truncate(value, 28);
}

/** BFS 距离从根起算, 然后圆环布局 (跟 web 版 layoutGraph 一致) */
function layoutGraph(
  nodes: OntologyGraphNode[],
  edges: OntologyGraphEdge[],
  rootKey: string | null,
): PlacedNode[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const src = adjacency.get(edge.source) ?? adjacency.set(edge.source, []).get(edge.source)!;
    src.push(edge.target);
    const tgt = adjacency.get(edge.target) ?? adjacency.set(edge.target, []).get(edge.target)!;
    tgt.push(edge.source);
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

interface OntologyGraphViewProps {
  graph: OntologyGraphData | null;
  loading?: boolean;
  error?: string | null;
  onSelectNode?: (node: OntologyGraphNode) => void;
}

export function OntologyGraphView({
  graph,
  loading,
  error,
  onSelectNode,
}: OntologyGraphViewProps) {
  const [hovered, setHovered] = useState<OntologyGraphNode | null>(null);

  const placed = useMemo(
    () =>
      graph
        ? layoutGraph(
            graph.nodes,
            graph.edges,
            graph.root ? nodeKey(graph.root.type, graph.root.id) : null,
          )
        : [],
    [graph],
  );
  const positionByKey = useMemo(
    () => new Map(placed.map((entry) => [entry.node.key, entry] as const)),
    [placed],
  );

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

  if (loading) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>图谱载入中…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.placeholder}>
        <Text style={[styles.placeholderText, styles.errorText]}>{error}</Text>
      </View>
    );
  }
  if (!graph || graph.nodes.length === 0) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>暂无图谱数据</Text>
      </View>
    );
  }

  const rootKey = graph.root ? nodeKey(graph.root.type, graph.root.id) : "";
  const presentTypes = Array.from(new Set(graph.nodes.map((node) => node.type)));

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          节点 {graph.nodes.length} · 边 {graph.edges.length} · 深度 {graph.depth ?? 0}
        </Text>
        <View style={styles.legend}>
          {presentTypes.map((type) => (
            <View key={type} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: TYPE_COLOR[type] }]} />
              <Text style={styles.legendText}>{TYPE_LABEL[type]}</Text>
            </View>
          ))}
        </View>
        {graph.truncated ? (
          <Text style={styles.warn}>图谱已截断（节点超过上限），仅显示部分。</Text>
        ) : null}
      </View>

      <View style={styles.canvas}>
        <Svg
          width="100%"
          height="100%"
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
        >
          {graph.edges.map((edge) => {
            const from = positionByKey.get(edge.source);
            const to = positionByKey.get(edge.target);
            if (!from || !to) return null;
            return (
              <Line
                key={edge.key}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#D1D5DB"
                strokeWidth={edge.weight && edge.weight >= 3 ? 2.5 : edge.weight && edge.weight >= 2 ? 1.8 : 1}
              />
            );
          })}

          {placed.map(({ node, x, y, radius }) => {
            const isRoot = node.key === rootKey;
            const interactive = Boolean(node.href || onSelectNode);
            return (
              <G
                key={node.key}
                x={x}
                y={y}
                onPress={() => {
                  if (onSelectNode) onSelectNode(node);
                }}
              >
                <Circle
                  r={radius}
                  fill={TYPE_COLOR[node.type]}
                  stroke={isRoot ? "#111827" : "#FFFFFF"}
                  strokeWidth={isRoot ? 3 : 2}
                  opacity={interactive ? 1 : 0.85}
                />
                <SvgText
                  x={0}
                  y={radius + 14}
                  fontSize="11"
                  fill="#111827"
                  textAnchor="middle"
                >
                  {displayLabel(node.label)}
                </SvgText>
                <SvgText
                  x={0}
                  y={radius + 26}
                  fontSize="10"
                  fill="#6B7280"
                  textAnchor="middle"
                >
                  {TYPE_LABEL[node.type]}
                </SvgText>
              </G>
            );
          })}
        </Svg>

        {hovered ? (
          <View style={styles.tooltip}>
            <Text style={styles.tooltipTitle}>{hovered.label}</Text>
            <Text style={styles.tooltipSub}>
              {TYPE_LABEL[hovered.type]} · {hovered.type}
            </Text>
            <Text style={styles.tooltipMeta}>ID {hovered.id}</Text>
            {hovered.metadata
              ? Object.entries(hovered.metadata).map(([key, value]) => (
                  <Text key={key} style={styles.tooltipMeta}>
                    {key}: {value === null || value === undefined ? "—" : String(value)}
                  </Text>
                ))
              : null}
          </View>
        ) : null}
      </View>

      <Text style={styles.hint}>节点按与根对象的距离分层（同心环，越外越远）。点击节点回调 onSelectNode。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  summary: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  summaryText: {
    fontSize: 12,
    color: "#6B7280",
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: "#6B7280",
  },
  warn: {
    fontSize: 11,
    color: "#B45309",
  },
  canvas: {
    width: "100%",
    aspectRatio: 16 / 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  placeholder: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  errorText: {
    color: "#B91C1C",
  },
  tooltip: {
    position: "absolute",
    right: 12,
    top: 12,
    maxWidth: 200,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tooltipTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
  },
  tooltipSub: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
  },
  tooltipMeta: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 2,
  },
  hint: {
    fontSize: 10,
    color: "#9CA3AF",
  },
});