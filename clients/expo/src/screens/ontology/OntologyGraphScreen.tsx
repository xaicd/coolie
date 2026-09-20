import { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { OntologyDomain, OntologyGraphSnapshot } from "@coolie/api-client";
import { C } from "../../coolie";
import { domainLabel, domainVersion } from "../../components/ontology/OntologyDomainCard";
import { AppCard } from "../../ui/AppCard";
import { Pill } from "../../ui/Pill";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { RADIUS, SPACING } from "../../ui/tokens";

/** 环形拓扑画布: 固定边长, 节点按半径 R 均分圆周 */
const CANVAS_SIZE = 320;
const NODE_RADIUS = 26;

interface NodeTypeEntry {
  key: string;
  label: string;
  count: number;
  sampleProperties: Record<string, unknown>;
}

export interface OntologyGraphScreenProps {
  domain: OntologyDomain;
  snapshot: OntologyGraphSnapshot | null;
  onBack: () => void;
}

/**
 * 第三层视图: 实体关系环形拓扑 + 选中类型的 Properties Schema 检视。
 * 快照由外层按需拉取 (打开详情时), 这里只做展示与本地选中交互。
 */
export function OntologyGraphScreen({ domain, snapshot, onBack }: OntologyGraphScreenProps) {
  const [selectedNodeTypeKey, setSelectedNodeTypeKey] = useState<string | null>(null);

  // 实体类型清单: byNodeType 计数优先, 再用快照节点补齐样本属性
  const nodeTypes = useMemo(() => {
    const map = new Map<string, NodeTypeEntry>();
    if (snapshot?.counts?.byNodeType) {
      for (const [k, count] of Object.entries(snapshot.counts.byNodeType)) {
        if (k) map.set(k, { key: k, label: k, count, sampleProperties: {} });
      }
    }
    for (const n of snapshot?.nodes || []) {
      const typeKey = n.nodeTypeId || n.label || n.key;
      const props = (n.properties as Record<string, unknown>) || {};
      const existing = map.get(typeKey);
      if (!existing) {
        map.set(typeKey, { key: typeKey, label: n.label || typeKey, count: 1, sampleProperties: props });
      } else if (n.properties && Object.keys(existing.sampleProperties).length === 0) {
        existing.sampleProperties = props;
      }
    }
    if (map.size === 0) {
      map.set(domain.slug, {
        key: domain.slug,
        label: domainLabel(domain),
        count: snapshot?.counts?.nodes ?? 0,
        sampleProperties: {
          domainId: domain.id,
          slug: domain.slug,
          category: domain.category || "业务本体",
          version: domainVersion(domain),
        },
      });
    }
    return Array.from(map.values());
  }, [snapshot, domain]);

  const activeKey = selectedNodeTypeKey || nodeTypes[0]?.key;
  const selectedNt = nodeTypes.find((nt) => nt.key === activeKey) || nodeTypes[0];

  const positions = useMemo(() => {
    const total = nodeTypes.length;
    const center = CANVAS_SIZE / 2;
    const radius = Math.min(105, 55 + total * 10);
    return nodeTypes.map((nt, index) => {
      const angle = (2 * Math.PI * index) / Math.max(total, 1) - Math.PI / 2;
      return {
        key: nt.key,
        x: center + radius * Math.cos(angle),
        y: center + radius * Math.sin(angle),
      };
    });
  }, [nodeTypes]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ScreenHeader
          onBack={onBack}
          backLabel="返回域详情"
          style={styles.detailNav}
          right={<Text style={styles.graphNavTitle}>{domainLabel(domain)} · 关系图谱</Text>}
        />

        {/* 拓扑画布容器 */}
        <AppCard variant="surface" style={styles.graphCanvasCard}>
          <View style={styles.graphCanvasHeader}>
            <View>
              <Text style={styles.graphCanvasTitle}>实体关系环形拓扑</Text>
              <Text style={styles.graphCanvasSub}>
                {nodeTypes.length} 个实体类型 · 点击节点查看 Properties Schema
              </Text>
            </View>
            <View style={styles.graphLegend}>
              <View style={[styles.graphLegendDot, { backgroundColor: C.accent }]} />
              <Text style={styles.graphLegendText}>实体类型</Text>
            </View>
          </View>

          <View style={[styles.graphCanvas, { width: CANVAS_SIZE, height: CANVAS_SIZE }]}>
            {/* 连线 */}
            {positions.map((posA, i) => {
              if (positions.length <= 1) return null;
              const posB = positions[(i + 1) % positions.length];
              const dx = posB.x - posA.x;
              const dy = posB.y - posA.y;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx);
              const isEdgeActive = posA.key === activeKey || posB.key === activeKey;

              return (
                <View
                  key={`edge-${posA.key}-${posB.key}`}
                  style={[
                    styles.graphEdgeLine,
                    {
                      left: (posA.x + posB.x) / 2 - length / 2,
                      top: (posA.y + posB.y) / 2,
                      width: length,
                      backgroundColor: isEdgeActive ? C.accent : C.line,
                      opacity: isEdgeActive ? 0.8 : 0.3,
                      transform: [{ rotate: `${angle}rad` }],
                    },
                  ]}
                />
              );
            })}

            {/* 节点气泡 */}
            {positions.map((pos) => {
              const nt = nodeTypes.find((n) => n.key === pos.key)!;
              const isSelected = nt.key === activeKey;

              return (
                <Pressable
                  key={`node-${pos.key}`}
                  style={[
                    styles.graphNodeCircle,
                    {
                      left: pos.x - NODE_RADIUS,
                      top: pos.y - NODE_RADIUS,
                      width: NODE_RADIUS * 2,
                      height: NODE_RADIUS * 2,
                      borderRadius: NODE_RADIUS,
                      borderColor: isSelected ? C.accent : C.line,
                      backgroundColor: isSelected ? C.surfaceHover : C.panel,
                    },
                  ]}
                  onPress={() => setSelectedNodeTypeKey(nt.key)}
                >
                  <Text
                    style={[styles.graphNodeCircleText, isSelected && styles.graphNodeCircleTextOn]}
                    numberOfLines={1}
                  >
                    {nt.label.slice(0, 5)}
                  </Text>
                  <Text style={styles.graphNodeCountText}>{nt.count}</Text>
                </Pressable>
              );
            })}
          </View>
        </AppCard>

        {/* Properties Schema 属性检视卡片 */}
        {selectedNt ? (
          <AppCard variant="surface" style={styles.schemaCard}>
            <View style={styles.schemaCardHeader}>
              <View style={styles.schemaTitleRow}>
                <Ionicons name="cube-outline" size={16} color={C.accent} style={styles.schemaTitleIcon} />
                <Text style={styles.schemaCardTitle}>
                  {selectedNt.label} ({selectedNt.key})
                </Text>
              </View>
              <Pill label={`${selectedNt.count} 实例`} tone="brand" size="sm" />
            </View>

            <Text style={styles.schemaSectionTitle}>属性定义 (Properties Schema)</Text>
            {Object.keys(selectedNt.sampleProperties).length === 0 ? (
              <Text style={styles.schemaEmptyText}>
                暂无自定义属性字段，该类型由系统缺省元数据驱动。
              </Text>
            ) : (
              <View style={styles.schemaPropsList}>
                {Object.entries(selectedNt.sampleProperties).map(([propKey, propVal]) => (
                  <View key={propKey} style={styles.schemaPropRow}>
                    <Text style={styles.schemaPropKey}>{propKey}</Text>
                    <Text style={styles.schemaPropType}>
                      {typeof propVal === "object"
                        ? "object"
                        : typeof propVal === "number"
                          ? "number"
                          : typeof propVal === "boolean"
                            ? "boolean"
                            : "string"}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </AppCard>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  scrollContent: { padding: SPACING.lg, paddingBottom: 40 },
  detailNav: { marginBottom: SPACING.lg },

  // ── 关系图谱 (graph view) ──
  graphNavTitle: { color: C.ink3, fontSize: 13, textAlign: "right", flexShrink: 1 },
  graphCanvasCard: { marginTop: SPACING.md },
  graphCanvasHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
  },
  graphCanvasTitle: { color: C.ink, fontSize: 15, fontWeight: "600" },
  graphCanvasSub: { color: C.ink3, fontSize: 11, marginTop: 2 },
  graphLegend: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  graphLegendDot: { width: 8, height: 8, borderRadius: 4 },
  graphLegendText: { color: C.ink3, fontSize: 11 },
  graphCanvas: { position: "relative", alignSelf: "center" },
  graphEdgeLine: { position: "absolute", height: 1 },
  graphNodeCircle: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  graphNodeCircleText: { color: C.ink2, fontSize: 10 },
  graphNodeCircleTextOn: { color: C.ink, fontWeight: "600" },
  graphNodeCountText: { color: C.ink4, fontSize: 9 },
  schemaCard: { marginTop: SPACING.md },
  schemaCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  schemaTitleRow: { flexDirection: "row", alignItems: "center" },
  schemaTitleIcon: { marginRight: 6 },
  schemaCardTitle: { color: C.ink, fontSize: 14, fontWeight: "600" },
  schemaSectionTitle: {
    color: C.ink3,
    fontSize: 12,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  schemaEmptyText: { color: C.ink4, fontSize: 12 },
  schemaPropsList: { gap: 6 },
  schemaPropRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.panel,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: SPACING.sm,
  },
  schemaPropKey: { color: C.ink2, fontSize: 12, fontWeight: "600", flex: 1 },
  schemaPropType: { color: C.ink4, fontSize: 11 },
});
