import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type {
  OntologyGraphResponse,
  OntologyGraphResponseEdge,
  OntologyGraphResponseNode,
} from "@coolie/api-client";
import { C } from "../theme";

interface OntologyGraphCanvasProps {
  graph: OntologyGraphResponse;
  canvasSize: number;
  selectedKey: string | null;
  onSelectNode: (key: string) => void;
}

/**
 * Wave244 — reusable graph canvas.
 *
 * Old (wave239) layout was a "layered shell" that scattered nodes by
 * entityType around a center on radial shells of growing radius. With
 * 75+ nodes and Chinese long names that fit on 14 chars per line, every
 * shell bled into the next and the picture became a brick wall of
 * overlapping circles — exactly what the boss screenshot showed.
 *
 * New layout:
 *   1. Group nodes by entity type, drop the unused "center" anchor.
 *   2. Each type gets a cluster center laid out on its own inscribed ring
 *      so clusters never overlap (groups of >6 types share the inner
 *      ring, fewer types each get a wider arc).
 *   3. Within a cluster, nodes go on a deterministic ring around the
 *      cluster center, one slot per node, radius bounded by `count`.
 *   4. Node radius is `min(30, 14 + sqrt(count) * 3)` — capped so a 75-node
 *      graph stays readable instead of growing into a donut.
 *   5. The label is moved OUT of the node (inside the circle we now only
 *      show an index "1..N" sized to the radius), and rendered as a
 *      separate Text below the circle, truncated at 12 chars. This is the
 *      key visual fix: the label never collides with the circle boundary.
 *
 * Edges still use atan2 + a single rotated `View` line. The workbench
 * (屏 4) already does pan + zoom — this component stays pure so the
 * caller (workbench / 屏 1 / 屏 2) can wrap it in any viewport.
 */
export function OntologyGraphCanvas({
  graph,
  canvasSize,
  selectedKey,
  onSelectNode,
}: OntologyGraphCanvasProps) {
  const positions = useMemo(
    () => computeClusteredLayout(graph.nodes, canvasSize),
    [graph.nodes, canvasSize],
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

      {graph.truncated ? (
        <View style={styles.truncatedBanner}>
          <Text style={styles.truncatedText}>
            图谱过大, 已截断显示前 {graph.nodes.length} 个节点
          </Text>
        </View>
      ) : null}
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
  return (
    <View
      style={[
        styles.edge,
        {
          left: ax + dx / 2 - length / 2,
          top: ay + dy / 2,
          width: length,
          transform: [{ rotate: `${angle}rad` }],
          backgroundColor: highlight ? C.accent : C.line,
          opacity: highlight ? 0.85 : 0.4,
        },
      ]}
    />
  );
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
    height: 1,
  },
  truncatedBanner: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderColor: C.line,
  },
  truncatedText: { color: C.warn, fontSize: 11, textAlign: "center" },
});
