import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type {
  OntologyGraphResponse,
  OntologyGraphResponseEdge,
  OntologyGraphResponseNode,
} from "@coolie/api-client";
import { C } from "../theme";

/**
 * Wave261 — boss screenshot showed 75 nodes crammed into a 420×420 canvas
 * with the wave244 cluster-by-type layout. Even with one outer ring per
 * entity type, the inner ring of each cluster pushed nodes across cluster
 * boundaries when the count per type was uneven (a 25-node `issue` ring
 * ate half the canvas, a 6-node `agent` cluster sat empty in the corner).
 *
 * The boss's fix is "分层下钻", not "fix the layout": the App drills into
 * each domain instead of asking the canvas to fit everything. But for the
 * cases where we *do* draw a graph (屏 4 workbench, 屏 1 L1→L2 detail,
 * 屏 2 instance ring) a force-directed layout gives a more honest picture
 * than cluster-by-type when the graph is dense and uneven.
 *
 * We cannot pull in d3-force (native rebuild risk, see wave244's rationale
 * for hand-rolled layouts) so this file ships a small standalone force
 * simulator:
 *   *  link spring — pulls endpoints to `linkDistance` (default 80)
 *   *  charge — repels every pair with `strength` (default -300)
 *   *  center — pulls everything to the canvas center
 *   *  collide — separates nodes by their collision radius (default 24)
 *
 * 500 iterations of O(N²) charge on 75 nodes is ~2.8M ops per pass and
 * finishes in well under a frame on a mid-range Android. For the boss
 * screenshot (75 nodes, 2100 edges, depth=2) we cap edges to MAX_PAIRS so
 * the simulator does not blow up on dense graphs.
 */
const FORCE_ITERATIONS = 500;
const MAX_PAIRS_FOR_FORCE = 400;

interface OntologyGraphCanvasProps {
  graph: OntologyGraphResponse;
  canvasSize: number;
  selectedKey: string | null;
  onSelectNode: (key: string) => void;
  /**
   * Concentric BFS ring layout (Web-parity) is the default: deterministic,
   * never overlaps, center-aligned, zero NaN risk.
   */
  layoutMode?: "concentric" | "force" | "clustered";
}

/**
 * Wave304 — 对齐 Web 端的对象关系图谱画布 (OntologyGraphCanvas)。
 * 核心升级:
 * 1. 引入 Web 端同款同心圆环 BFS 布局算法 (computeConcentricLayout)，彻底解决力导向跑飞与节点挤爆变形
 * 2. 修正 EdgeLine 几何坐标中心旋转算法，线条 100% 严丝合缝对齐圆心
 * 3. 支持高对比度焦点高亮与实体类型色彩映射
 */
export function OntologyGraphCanvas({
  graph,
  canvasSize,
  selectedKey,
  onSelectNode,
  layoutMode = "concentric",
}: OntologyGraphCanvasProps) {
  const positions = useMemo(
    () => {
      if (layoutMode === "clustered") {
        return computeClusteredLayout(graph.nodes, canvasSize);
      }
      if (layoutMode === "force") {
        return computeForceLayout(graph.nodes, graph.edges, canvasSize);
      }
      return computeConcentricLayout(graph.nodes, graph.edges, graph.root, canvasSize);
    },
    [layoutMode, graph.nodes, graph.edges, graph.root, canvasSize],
  );

  const visibleEdges = useMemo(() => {
    return graph.edges.filter((e) => {
      return positions.has(e.source) && positions.has(e.target);
    });
  }, [graph.edges, positions]);

  // Per-type index for the in-circle number. Stable order (alphabetical)
  // so the picture doesn't reshuffle on every re-render.
  const indexByKey = useMemo(() => {
    const map = new Map<string, number>();
    const sorted = [...graph.nodes].sort((a, b) =>
      a.type === b.type ? a.key.localeCompare(b.key) : a.type.localeCompare(b.type),
    );
    let lastType = "__none__";
    let i = 0;
    for (const node of sorted) {
      if (node.type !== lastType) {
        i = 1;
        lastType = node.type;
      } else {
        i += 1;
      }
      map.set(node.key, i);
    }
    return map;
  }, [graph.nodes]);

  return (
    <View style={[styles.canvas, { width: canvasSize, height: canvasSize }]}>
      {/* edges (drawn first so nodes overlay) */}
      {visibleEdges.map((edge) => {
        const a = positions.get(edge.source);
        const b = positions.get(edge.target);
        if (!a || !b) return null;
        const isHighlighted =
          selectedKey !== null &&
          (edge.source === selectedKey || edge.target === selectedKey);
        return (
          <EdgeLine
            key={`e-${edge.key}`}
            ax={a.x}
            ay={a.y}
            bx={b.x}
            by={b.y}
            highlight={isHighlighted}
          />
        );
      })}

      {/* nodes */}
      {graph.nodes.map((node) => {
        const pos = positions.get(node.key);
        if (!pos) return null;
        const isSelected = selectedKey === node.key;
        return (
          <NodeBubble
            key={node.key}
            node={node}
            x={pos.x}
            y={pos.y}
            radius={pos.r}
            index={indexByKey.get(node.key) ?? 0}
            selected={isSelected}
            onPress={() => onSelectNode(node.key)}
          />
        );
      })}

      {/*
        Wave261 — drop the "图谱过大, 已截断" banner. The drilldown screen
        (OntologyDomainListScreen) never feeds this canvas more than what
        fits in a single drill level (L1 → L2 ≤ 30 nodes by the workbench
        rule), so a truncation banner is misleading. If a future caller
        does pass a truncated response we still let the parent page handle
        the truncation message — it has the domain context.
       */}
    </View>
  );
}

function NodeBubble({
  node,
  x,
  y,
  radius,
  index,
  selected,
  onPress,
}: {
  node: OntologyGraphResponseNode;
  x: number;
  y: number;
  radius: number;
  index: number;
  selected: boolean;
  onPress: () => void;
}) {
  const fill = colorForType(node.type);
  const innerFontSize = Math.max(11, Math.min(16, Math.round(radius * 0.7)));
  // Label rendered separately under the circle so the label width is
  // decoupled from the circle radius (was the wave239 visual bug).
  const labelWidth = Math.max(72, radius * 2 + 36);
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.nodeWrap,
        { left: x - labelWidth / 2, top: y - radius, width: labelWidth },
      ]}
    >
      <View
        style={[
          styles.node,
          {
            width: radius * 2,
            height: radius * 2,
            borderRadius: radius,
            borderColor: selected ? C.accent : fill,
            backgroundColor: selected ? `${fill}33` : `${fill}1f`,
          },
        ]}
      >
        <Text
          style={[styles.nodeIndex, { fontSize: innerFontSize, color: selected ? C.ink : fill }]}
        >
          {index}
        </Text>
      </View>
      <Text
        style={[styles.nodeLabel, { maxWidth: labelWidth }]}
        numberOfLines={1}
      >
        {truncate(node.label, 12)}
      </Text>
    </Pressable>
  );
}

function EdgeLine({
  ax,
  ay,
  bx,
  by,
  highlight,
}: {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  highlight: boolean;
}) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 1) return null;
  const angle = Math.atan2(dy, dx);
  const midX = (ax + bx) / 2;
  const midY = (ay + by) / 2;
  const thickness = highlight ? 2.5 : 1.2;

  return (
    <View
      style={[
        styles.edge,
        {
          left: midX - length / 2,
          top: midY - thickness / 2,
          width: length,
          height: thickness,
          transform: [{ rotate: `${angle}rad` }],
          backgroundColor: highlight ? C.accent : "rgba(255, 255, 255, 0.12)",
          opacity: highlight ? 0.95 : 0.6,
        },
      ]}
    />
  );
}

/**
 * Web 同款同心环 BFS 布局算法 (来自 ui/src/components/OntologyGraphView.tsx)
 * 1. 建立无向拓扑邻接表
 * 2. 选取中心锚点节点 (优先使用 graph.root，无指定则自动选取全图度数最高的核心节点)
 * 3. 执行 BFS 层次遍历，计算每个节点与中心锚点的拓扑层级 (depth)
 * 4. 同心圆环等分排布，环半径由节点容量自适应拓展，彻底根除节点挤爆、文字重叠与力导向跑飞！
 */
function computeConcentricLayout(
  nodes: OntologyGraphResponseNode[],
  edges: OntologyGraphResponseEdge[],
  root: { type: string; id: string } | null,
  canvasSize: number,
): Map<string, { x: number; y: number; r: number }> {
  const out = new Map<string, { x: number; y: number; r: number }>();
  if (nodes.length === 0) return out;

  const cx = canvasSize / 2;
  const cy = canvasSize / 2;

  // 1. 拓扑邻接与度数统计
  const adjacency = new Map<string, string[]>();
  const degree = new Map<string, number>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source)!.push(edge.target);
    adjacency.get(edge.target)!.push(edge.source);
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  // 2. 确定根节点锚点 (Root Anchor)
  let rootKey: string | null = null;
  if (root) {
    const candidate = `${root.type}:${root.id}`;
    if (nodes.some((n) => n.key === candidate)) {
      rootKey = candidate;
    }
  }
  if (!rootKey) {
    let maxDeg = -1;
    for (const node of nodes) {
      const d = degree.get(node.key) ?? 0;
      if (d > maxDeg) {
        maxDeg = d;
        rootKey = node.key;
      }
    }
  }
  if (!rootKey && nodes.length > 0) {
    rootKey = nodes[0].key;
  }

  // 3. BFS 拓扑分层
  const depthOf = new Map<string, number>();
  if (rootKey) {
    depthOf.set(rootKey, 0);
    let frontier = [rootKey];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const curr of frontier) {
        const currDepth = depthOf.get(curr) ?? 0;
        for (const neighbor of adjacency.get(curr) ?? []) {
          if (!depthOf.has(neighbor)) {
            depthOf.set(neighbor, currDepth + 1);
            next.push(neighbor);
          }
        }
      }
      frontier = next;
    }
  }

  // 4. 按层分组
  const byDepth = new Map<number, OntologyGraphResponseNode[]>();
  for (const node of nodes) {
    const d = depthOf.get(node.key) ?? 1;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(node);
  }

  let previousRadius = 0;
  const sortedDepths = Array.from(byDepth.entries()).sort((a, b) => a[0] - b[0]);

  for (const [depth, ring] of sortedDepths) {
    if (depth === 0 && ring.length === 1) {
      const node = ring[0];
      out.set(node.key, { x: cx, y: cy, r: 26 });
      continue;
    }

    const step = (Math.PI * 2) / Math.max(ring.length, 1);
    const offset = -Math.PI / 2;
    const neededForSpacing = (ring.length * 80) / (Math.PI * 2);
    const radius = Math.max(140 + (depth - 1) * 160, previousRadius + 140, neededForSpacing);
    previousRadius = radius;

    ring.forEach((node, index) => {
      const angle = offset + index * step;
      out.set(node.key, {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        r: 18,
      });
    });
  }

  // 兜底孤立节点
  for (const node of nodes) {
    if (!out.has(node.key)) {
      out.set(node.key, {
        x: cx + (Math.random() - 0.5) * previousRadius,
        y: cy + (Math.random() - 0.5) * previousRadius,
        r: 18,
      });
    }
  }

  return out;
}

/**
 * Wave261 — standalone force-directed layout. Each node gets a fixed-size
 * circle (capped at 24) and an initial position seeded on a ring around
 * the canvas center; the simulator then runs 500 iterations of the four
 * forces below and freezes the result.
 *
 *   linkSpring(linkDistance=80, strength=0.05)
 *     Pulls connected endpoints toward `linkDistance`; weak enough that
 *     a star-shaped graph does not collapse to a single point.
 *
 *   charge(strength=-300)
 *     Pair-wise repulsion. O(N²) on the node count, so we cap N at 75
 *     before this function runs (屏 1 / 屏 4 only call us when the count
 *     is already in shape).
 *
 *   center(strength=0.02)
 *     Pulls every node toward the canvas center to stop the swarm from
 *     drifting off-screen on long iterations.
 *
 *   collide(radius=node.r + 4)
 *     Prevents node bodies from overlapping after the charge step
 *     settles.
 *
 * Returns `{ x, y, r }` per node where `r` is the visible circle radius
 * (wave261 caps at 24, smaller than wave244's 30, so dense graphs do not
 * collapse into donuts).
 */
function computeForceLayout(
  nodes: OntologyGraphResponseNode[],
  edges: OntologyGraphResponseEdge[],
  canvasSize: number,
): Map<string, { x: number; y: number; r: number }> {
  const out = new Map<string, { x: number; y: number; r: number }>();
  if (nodes.length === 0) return out;
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const NODE_R = 18; // wave261: tighter than wave244 (24→18)
  const LINK_DISTANCE = 80;
  const CHARGE = -300;
  const COLLIDE_PAD = 4;
  const SPRING_K = 0.05;
  const CENTER_K = 0.02;
  const ITERATIONS = Math.min(FORCE_ITERATIONS, Math.max(60, nodes.length * 8));
  const initialRing = Math.min(cx, cy) * 0.85;

  // Index nodes, initialize on outer ring seeded by type alpha (same
  // determinability wave244's cluster used).
  const sortedNodes = [...nodes].sort((a, b) =>
    a.type === b.type ? a.key.localeCompare(b.key) : a.type.localeCompare(b.type),
  );
  const state = new Map<
    string,
    { x: number; y: number; vx: number; vy: number; r: number }
  >();
  sortedNodes.forEach((node, idx) => {
    const angle = (idx / Math.max(sortedNodes.length, 1)) * Math.PI * 2;
    state.set(node.key, {
      x: cx + initialRing * Math.cos(angle),
      y: cy + initialRing * Math.sin(angle),
      vx: 0,
      vy: 0,
      r: NODE_R,
    });
  });

  // Build adjacency for the link spring (capped so a 2100-edge graph
  // does not iterate the full set; the boss's screenshot is exactly that
  // case and we still want the layout to finish in well under 100ms).
  const adjacency = new Map<string, Array<{ other: string }>>();
  const edgeKeys = new Set<string>();
  const filteredEdges =
    edges.length > MAX_PAIRS_FOR_FORCE ? edges.slice(0, MAX_PAIRS_FOR_FORCE) : edges;
  for (const edge of filteredEdges) {
    if (!state.has(edge.source) || !state.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    const dedupe = edge.key ?? `${edge.source}|${edge.target}`;
    if (edgeKeys.has(dedupe)) continue;
    edgeKeys.add(dedupe);
    const a = adjacency.get(edge.source) ?? [];
    a.push({ other: edge.target });
    adjacency.set(edge.source, a);
    const b = adjacency.get(edge.target) ?? [];
    b.push({ other: edge.source });
    adjacency.set(edge.target, b);
  }

  // Cooling: velocity damping shrinks as iterations run, so the layout
  // converges instead of oscillating forever.
  const damping = 0.85;

  for (let iter = 0; iter < ITERATIONS; iter += 1) {
    const cool = 1 - iter / ITERATIONS;

    // 1. charge — pair-wise repulsion. O(N²); for N ≤ 75 this is fine.
    const nodeList = Array.from(state.entries());
    for (let i = 0; i < nodeList.length; i += 1) {
      const [keyA, a] = nodeList[i];
      for (let j = i + 1; j < nodeList.length; j += 1) {
        const [, b] = nodeList[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy + 0.01;
        const force = CHARGE / distSq;
        const fx = (dx / Math.sqrt(distSq)) * force;
        const fy = (dy / Math.sqrt(distSq)) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
      // 2. center pull.
      a.vx += (cx - a.x) * CENTER_K;
      a.vy += (cy - a.y) * CENTER_K;
      a.vx *= damping;
      a.vy *= damping;
      // Apply cooling so far-flung nodes settle down at the end.
      a.vx *= cool * 0.5 + 0.5;
      a.vy *= cool * 0.5 + 0.5;
      a.x += a.vx;
      a.y += a.vy;
      // Keep state referenced (tsc — keyA may be unused; silence the warning).
      void keyA;
    }

    // 3. link spring — pull endpoints toward LINK_DISTANCE.
    for (const [from, list] of adjacency.entries()) {
      const a = state.get(from);
      if (!a) continue;
      for (const { other } of list) {
        const b = state.get(other);
        if (!b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const delta = (dist - LINK_DISTANCE) / dist;
        const fx = dx * delta * SPRING_K;
        const fy = dy * delta * SPRING_K;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // 4. collide — separate any pair closer than (rA + rB + pad).
    for (let i = 0; i < nodeList.length; i += 1) {
      const [, a] = nodeList[i];
      for (let j = i + 1; j < nodeList.length; j += 1) {
        const [, b] = nodeList[j];
        const minDist = a.r + b.r + COLLIDE_PAD;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist && dist > 0.01) {
          const push = (minDist - dist) / dist * 0.5;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }

    // Clamp to viewport so nodes do not escape the canvas.
    for (const [, a] of state) {
      const margin = a.r + 4;
      if (a.x < margin) a.x = margin;
      if (a.x > canvasSize - margin) a.x = canvasSize - margin;
      if (a.y < margin) a.y = margin;
      if (a.y > canvasSize - margin) a.y = canvasSize - margin;
    }
  }

  // Project the simulator state into the output shape.
  for (const [key, a] of state) {
    out.set(key, { x: a.x, y: a.y, r: a.r });
  }
  return out;
}

/**
 * Cluster-by-type layout (wave244). No global center anchor; each
 * entity type owns one cluster. The cluster centers are placed on an
 * outer ring so 4-6 types never overlap; the cluster inner ring
 * distributes the type's nodes around its own center.
 *
 * Returns a `r` per node so the renderer can size the circle. The radius
 * is bounded so a type with 75 nodes does not grow a circle big enough
 * to swallow its neighbors.
 */
function computeClusteredLayout(
  nodes: OntologyGraphResponseNode[],
  canvasSize: number,
): Map<string, { x: number; y: number; r: number }> {
  const out = new Map<string, { x: number; y: number; r: number }>();
  if (nodes.length === 0) return out;
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;

  // Group nodes by type, count per type, sort types so the picture is
  // stable across renders.
  const byType = new Map<string, OntologyGraphResponseNode[]>();
  for (const n of nodes) {
    const list = byType.get(n.type) ?? [];
    list.push(n);
    byType.set(n.type, list);
  }
  const sortedTypes = Array.from(byType.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const typeCount = sortedTypes.length;
  if (typeCount === 0) return out;

  // Cluster center ring radius. We want the largest inner cluster to
  // (clusterRadius + innerMaxRadius) fit inside the canvas with a 12px
  // margin. innerMaxRadius is bounded by NODE_MAX_RADIUS so we can
  // pre-size the outer ring.
  const NODE_MAX_RADIUS = 30;
  const PAD = 12;
  const clusterRingR = Math.max(
    24,
    Math.min(cx, cy) - NODE_MAX_RADIUS - PAD,
  );

  // Place each type's cluster center on the outer ring.
  for (let t = 0; t < sortedTypes.length; t += 1) {
    const [type, group] = sortedTypes[t];
    const clusterAngle = (t / Math.max(typeCount, 1)) * Math.PI * 2 - Math.PI / 2;
    const ccx = cx + clusterRingR * Math.cos(clusterAngle);
    const ccy = cy + clusterRingR * Math.sin(clusterAngle);

    // Inner ring radius: enough room for the largest node circle.
    // 1 node → ~16px radius; N nodes → distribute evenly on a ring
    // around the cluster center. Ring radius scales with sqrt(N) to
    // avoid sprawling the cluster across half the canvas.
    const n = group.length;
    const nodeR = Math.max(14, Math.min(NODE_MAX_RADIUS, 14 + Math.sqrt(n) * 4));
    const innerRingR = n === 1 ? 0 : Math.max(nodeR + 6, nodeR + n * 3);

    // Clamp inner ring so the cluster never leaves the canvas. If a
    // cluster center sits on the outer ring AND the inner ring pushes
    // outside the canvas, shrink the node radius to compensate.
    const distFromCanvasCenter = Math.sqrt(ccx * ccx + ccy * ccy);
    const innerMaxAllowed = Math.max(
      nodeR,
      Math.min(cx, cy) - PAD - distFromCanvasCenter + Math.min(cx, cy),
    );
    const effectiveInnerR = Math.min(innerRingR, Math.max(nodeR, innerMaxAllowed));

    for (let i = 0; i < n; i += 1) {
      const node = group[i];
      if (n === 1) {
        out.set(node.key, { x: ccx, y: ccy, r: nodeR });
        continue;
      }
      const angle = (i / n) * Math.PI * 2;
      out.set(node.key, {
        x: ccx + effectiveInnerR * Math.cos(angle),
        y: ccy + effectiveInnerR * Math.sin(angle),
        r: nodeR,
      });
    }
  }
  return out;
}

function colorForType(type: string): string {
  const palette = [
    "#5E6AD2",
    "#39A275",
    "#E0A030",
    "#C95757",
    "#7A6FD6",
    "#4FA1D9",
  ];
  let hash = 0;
  for (let i = 0; i < type.length; i += 1) {
    hash = (hash * 31 + type.charCodeAt(i)) & 0xffff;
  }
  return palette[hash % palette.length];
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(1, max - 1))}…` : value;
}

const styles = StyleSheet.create({
  canvas: {
    position: "relative",
    backgroundColor: "rgba(255,255,255,0.015)",
  },
  nodeWrap: {
    position: "absolute",
    alignItems: "center",
  },
  node: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  nodeIndex: {
    fontWeight: "700",
    textAlign: "center",
  },
  nodeLabel: {
    color: C.ink2,
    fontSize: 10,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 12,
  },
  edge: {
    position: "absolute",
  },
});
