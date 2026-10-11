/**
 * EgoRadarGraph — Palantir Mobile-Style Ego-Centric Radar Topology.
 *
 * Designed for 6-inch mobile screens:
 *   - Replaces illegible "spider-web" meshes with a focused 1-hop focal orbit.
 *   - Center node: Current focal entity (Ego).
 *   - Orbit nodes: Directly linked upstream/downstream neighbors.
 *   - Tap orbit node: Focus Pivot — instantly pivots the center to the tapped node.
 *   - Tap center node: Activates the 360 Action Sheet for business closed loop.
 */

import React, { useMemo } from "react";
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Marker,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { C } from "../coolie";

export interface RadarNode {
  id: string;
  name: string;
  category?: string;
  icon?: string;
  status?: "healthy" | "warn" | "idle" | "locked";
  count?: number;
  isCenter?: boolean;
}

export interface RadarEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface EgoRadarGraphProps {
  nodes: RadarNode[];
  edges: RadarEdge[];
  centerNodeId: string;
  onSelectNode: (nodeId: string) => void;
  onOpenDetails?: (node: RadarNode) => void;
  width?: number;
  height?: number;
}

export function EgoRadarGraph({
  nodes,
  edges,
  centerNodeId,
  onSelectNode,
  onOpenDetails,
  width: customWidth,
  height: customHeight,
}: EgoRadarGraphProps) {
  const screenWidth = Dimensions.get("window").width;
  const width = customWidth || Math.min(screenWidth - 32, 380);
  const height = customHeight || 290;
  const cx = width / 2;
  const cy = height / 2;
  const orbitRadius = Math.min(width, height) * 0.38;

  // Resolve center node
  const centerNode = useMemo(() => {
    return nodes.find((n) => n.id === centerNodeId) || nodes[0] || null;
  }, [nodes, centerNodeId]);

  // Find 1-hop neighbors linked to center node
  const { orbitNodes, orbitLinks } = useMemo(() => {
    if (!centerNode) return { orbitNodes: [], orbitLinks: [] };

    // Edges connected to center
    const connectedEdges = edges.filter(
      (e) => e.source === centerNode.id || e.target === centerNode.id,
    );

    // Neighbor IDs
    const neighborIdSet = new Set<string>();
    connectedEdges.forEach((e) => {
      if (e.source !== centerNode.id) neighborIdSet.add(e.source);
      if (e.target !== centerNode.id) neighborIdSet.add(e.target);
    });

    let neighbors = nodes.filter((n) => neighborIdSet.has(n.id) && n.id !== centerNode.id);

    // If no explicit edges exist, show remaining nodes as peers (up to 6)
    if (neighbors.length === 0) {
      neighbors = nodes.filter((n) => n.id !== centerNode.id).slice(0, 6);
    } else if (neighbors.length > 8) {
      neighbors = neighbors.slice(0, 8); // Cap to 8 on mobile to avoid overcrowding
    }

    // Calculate polar coordinates for each orbit node
    const count = neighbors.length;
    const computedNodes = neighbors.map((node, index) => {
      const angle = (2 * Math.PI * index) / (count || 1) - Math.PI / 2;
      const x = cx + orbitRadius * Math.cos(angle);
      const y = cy + orbitRadius * Math.sin(angle);
      return {
        ...node,
        x,
        y,
        angle,
      };
    });

    // Links between center and orbit nodes
    const computedLinks = computedNodes.map((target) => {
      const edge = connectedEdges.find(
        (e) =>
          (e.source === centerNode.id && e.target === target.id) ||
          (e.target === centerNode.id && e.source === target.id),
      );
      const isOutbound = edge ? edge.source === centerNode.id : true;
      return {
        id: edge?.id || `${centerNode.id}-${target.id}`,
        sourceX: cx,
        sourceY: cy,
        targetX: target.x,
        targetY: target.y,
        label: edge?.label || "关联",
        isOutbound,
      };
    });

    return { orbitNodes: computedNodes, orbitLinks: computedLinks };
  }, [centerNode, nodes, edges, cx, cy, orbitRadius]);

  if (!centerNode) {
    return (
      <View style={[styles.emptyContainer, { width, height }]}>
        <Text style={styles.emptyText}>暂无图谱节点数据</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { width, height }]}>
      {/* SVG Canvas for Orbits, Lines, and Labels */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="radarGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={C.accent} stopOpacity={0.12} />
            <Stop offset="100%" stopColor={C.accent} stopOpacity={0.02} />
          </LinearGradient>
          <Marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <Path d="M 0 1 L 10 5 L 0 9 z" fill={C.accent} opacity={0.6} />
          </Marker>
        </Defs>

        {/* Radar Concentric Orbit Rings (High-Tech Spatial Aesthetic) */}
        <Circle
          cx={cx}
          cy={cy}
          r={orbitRadius}
          stroke={C.accent}
          strokeWidth={1}
          strokeDasharray="4 4"
          fill="url(#radarGlow)"
          opacity={0.4}
        />
        <Circle
          cx={cx}
          cy={cy}
          r={orbitRadius * 0.55}
          stroke={C.line}
          strokeWidth={0.8}
          strokeDasharray="2 3"
          fill="none"
          opacity={0.6}
        />

        {/* Crosshair guidelines */}
        <Line
          x1={cx - orbitRadius - 12}
          y1={cy}
          x2={cx + orbitRadius + 12}
          y2={cy}
          stroke={C.line}
          strokeWidth={0.5}
          strokeDasharray="2 4"
          opacity={0.3}
        />
        <Line
          x1={cx}
          y1={cy - orbitRadius - 12}
          x2={cx}
          y2={cy + orbitRadius + 12}
          stroke={C.line}
          strokeWidth={0.5}
          strokeDasharray="2 4"
          opacity={0.3}
        />

        {/* Connection Links */}
        {orbitLinks.map((link) => {
          const midX = (link.sourceX + link.targetX) / 2;
          const midY = (link.sourceY + link.targetY) / 2;
          return (
            <G key={link.id}>
              <Line
                x1={link.sourceX}
                y1={link.sourceY}
                x2={link.targetX}
                y2={link.targetY}
                stroke={C.accent}
                strokeWidth={1.5}
                strokeOpacity={0.35}
              />
              {/* Relation badge on link */}
              <Circle cx={midX} cy={midY} r={10} fill={C.surface} stroke={C.line} strokeWidth={0.5} />
              <SvgText
                x={midX}
                y={midY + 3}
                fontSize={8}
                fill={C.accent}
                fontWeight="bold"
                textAnchor="middle"
              >
                {link.label.slice(0, 2)}
              </SvgText>
            </G>
          );
        })}
      </Svg>

      {/* Orbit Neighbor Nodes (Touchable HTML/RN Views) */}
      {orbitNodes.map((node) => {
        const nodeSize = 52;
        return (
          <Pressable
            key={node.id}
            onPress={() => onSelectNode(node.id)}
            style={[
              styles.orbitNodeBox,
              {
                left: node.x - nodeSize / 2,
                top: node.y - nodeSize / 2,
                width: nodeSize,
                height: nodeSize,
              },
            ]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`跃迁至实体 ${node.name}`}
          >
            <View style={styles.orbitNodeInner}>
              <Text style={styles.orbitNodeIcon}>{node.icon || "⬡"}</Text>
              <Text style={styles.orbitNodeText} numberOfLines={1}>
                {node.name.slice(0, 4)}
              </Text>
            </View>
            <View style={styles.pivotBadge}>
              <Text style={styles.pivotBadgeText}>跳</Text>
            </View>
          </Pressable>
        );
      })}

      {/* Center Focal Node (Ego Target) */}
      <Pressable
        onPress={() => onOpenDetails?.(centerNode)}
        style={[
          styles.centerNodeBox,
          {
            left: cx - 40,
            top: cy - 40,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`中心实体 ${centerNode.name}，点击打开详情与动作`}
      >
        <View style={styles.centerNodeRing}>
          <Text style={styles.centerNodeIcon}>{centerNode.icon || "⬡"}</Text>
          <Text style={styles.centerNodeText} numberOfLines={1}>
            {centerNode.name.slice(0, 6)}
          </Text>
          <View style={styles.centerNodeTagRow}>
            <View style={styles.statusIndicator} />
            <Text style={styles.centerNodeCategory}>
              {centerNode.category?.slice(0, 4) || "核心"}
            </Text>
          </View>
        </View>
      </Pressable>

      {/* Bottom Hint */}
      <View style={styles.hintWrap}>
        <Text style={styles.hintText}>
          ⚡ 点击外圈节点【焦点跃迁】 · 点击中心实体【业务动作】
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    backgroundColor: C.surface,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.line,
    alignSelf: "center",
    marginVertical: 8,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
  },
  emptyText: {
    fontSize: 12,
    color: C.ink3,
  },
  // Center Ego Node
  centerNodeBox: {
    position: "absolute",
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  centerNodeRing: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: C.surface,
    borderWidth: 2,
    borderColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  centerNodeIcon: {
    fontSize: 18,
    marginBottom: 1,
  },
  centerNodeText: {
    fontSize: 11,
    fontWeight: "bold",
    color: C.ink,
    textAlign: "center",
  },
  centerNodeTagRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    gap: 3,
  },
  statusIndicator: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#10B981",
  },
  centerNodeCategory: {
    fontSize: 9,
    color: C.ink3,
  },
  // Orbit Neighbor Node
  orbitNodeBox: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  orbitNodeInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.surface,
    borderWidth: 1.2,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  orbitNodeIcon: {
    fontSize: 13,
  },
  orbitNodeText: {
    fontSize: 9,
    fontWeight: "600",
    color: C.ink,
    marginTop: 1,
    textAlign: "center",
  },
  pivotBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: C.accent,
    borderRadius: 6,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  pivotBadgeText: {
    fontSize: 8,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  // Hint Bar
  hintWrap: {
    position: "absolute",
    bottom: 6,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  hintText: {
    fontSize: 10,
    color: C.ink3,
    backgroundColor: C.surface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: "hidden",
  },
});
