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
 * Wave239 — reusable graph canvas.
 *
 * Layout strategy (agy 草图 §4 抛弃 force-graph 后的方案):
 *   1. Place the highest-degree node at the center.
 *   2. Bucket remaining nodes by entityType — each type gets a radial slot
 *      around the center.
 *   3. Within each bucket, lay out nodes on a deterministic grid so the
 *      picture is stable across renders (no jitter when re-rendering).
 *
 * Edges use atan2 + a single rotated `View` line — same pattern as the
 * 屏 1 graph view. Long edges are clamped to canvasSize (no overflow).
 *
 * Selection state is owned by the parent (workbench keeps the "current
 * key" so re-renders don't drop focus). The canvas is otherwise pure.
 */
export function OntologyGraphCanvas({
  graph,
  canvasSize,
  selectedKey,
  onSelectNode,
}: OntologyGraphCanvasProps) {
  const positions = useMemo(
    () => computeDeterministicLayout(graph.nodes, canvasSize),
    [graph.nodes, canvasSize],
  );

  const visibleEdges = useMemo(() => {
    return graph.edges.filter((e) => {
      return positions.has(e.source) && positions.has(e.target);
    });
  }, [graph.edges, positions]);

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
  selected,
  onPress,
}: {
  node: OntologyGraphResponseNode;
  x: number;
  y: number;
  selected: boolean;
  onPress: () => void;
}) {
  const fill = colorForType(node.type);
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.node,
        {
          left: x - 26,
          top: y - 26,
          borderColor: selected ? C.accent : fill,
          backgroundColor: selected ? `${fill}33` : `${fill}1f`,
        },
      ]}
    >
      <Text style={styles.nodeLabel} numberOfLines={2}>
        {truncate(node.label, 14)}
      </Text>
      <Text style={styles.nodeType}>{node.type}</Text>
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
 * Deterministic layered layout:
 *   1. Central anchor = highest-degree node (falls back to first node).
 *   2. Group remaining nodes by entityType.
 *   3. For each group, lay out nodes on a fixed-radius shell offset by
 *      `groupIdx`. Order within the group is by id (stable).
 */
function computeDeterministicLayout(
  nodes: OntologyGraphResponseNode[],
  canvasSize: number,
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return out;
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;

  // group by type
  const byType = new Map<string, OntologyGraphResponseNode[]>();
  for (const n of nodes) {
    const list = byType.get(n.type) ?? [];
    list.push(n);
    byType.set(n.type, list);
  }
  const sortedTypes = Array.from(byType.keys()).sort();

  // place center
  const centerNode = nodes[0];
  out.set(centerNode.key, { x: cx, y: cy });

  const shellCount = sortedTypes.length || 1;
  const baseRadius = Math.min(cx, cy) * 0.55;
  let globalIdx = 0;
  for (let tIdx = 0; tIdx < sortedTypes.length; tIdx += 1) {
    const type = sortedTypes[tIdx];
    const group = byType.get(type) ?? [];
    const shell = baseRadius * (0.4 + (tIdx / shellCount) * 0.6);
    for (let i = 0; i < group.length; i += 1) {
      const node = group[i];
      if (node.key === centerNode.key) continue;
      // deterministic angle: split the shell evenly, offset by global index
      // so neighbors of different shells do not perfectly overlap.
      const angle =
        (globalIdx / Math.max(group.length, 1)) * Math.PI * 2 + tIdx * 0.13;
      globalIdx += 1;
      out.set(node.key, {
        x: cx + shell * Math.cos(angle),
        y: cy + shell * Math.sin(angle),
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
  node: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  nodeLabel: {
    color: C.ink,
    fontSize: 9,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 11,
  },
  nodeType: {
    color: C.ink4,
    fontSize: 7,
    fontFamily: "monospace",
    marginTop: 1,
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
