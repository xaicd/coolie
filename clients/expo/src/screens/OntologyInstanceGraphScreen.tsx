import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import type {
  Company,
  OntologyGraphResponse,
  OntologyInstanceRow,
} from "@coolie/api-client";
import { coolie } from "../coolie";
import { C } from "../theme";
import { RADIUS, SPACING } from "../ui/tokens";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { ScreenHeader } from "../ui/ScreenHeader";
import { showInfoToast } from "../ui/toast";

interface OntologyInstanceGraphScreenProps {
  company: Company;
  /**
   * The ontology type id (the same `OntologyDomain.id` the 屏 1 long-press
   * passes). Currently used to scope the GET /ontology/instances call to
   * `entityType` — the route resolves `entityType` from a query string the
   * App sets when navigating, so this prop doubles as the route param.
   */
  typeId: string;
  displayName: string;
  /** 屏 1 calls into this when the user long-presses "实例图谱". */
  onBack?: () => void;
  /** 屏 4 workbench — instance graph's right-bottom "工作台" button. */
  onOpenWorkbench?: () => void;
  /**
   * Default entityType for /instances — 屏 1's long-press passes the domain
   * slug, but the API expects a typed entity kind (issue / project / agent).
   * `project` matches the most common use case (agy 草图 §2); the App can
   * fall back to whatever the domain's category implies.
   */
  defaultEntityType?: string;
}

/**
 * Wave239 — 屏 2 (instance graph).
 *
 * For a single ontology type, list the rows of the chosen entityType with
 * optional owner filter (agy 草图 §2's 负责人 Chip), then render a simple
 * deterministic ring layout. We deliberately stay with the existing
 * `View` + absolute-position pattern from 屏 1's graph view — no SVG,
 * no force-graph. Pan/zoom is single-touch pan via `PanResponder`-free
 * scroll; pinch-zoom is the responsibility of 屏 4 (workbench).
 *
 * Data path:
 *   GET /api/companies/:id/ontology/instances?entityType=&ownerId=
 *   (wave239 server addition, see `ontology-extras-routes.test.ts`)
 *
 * Long-term: this screen also reads `/ontology/graph` (wave237) to draw
 * the cross-row links. The agy 草图 showed a fully-linked topology, but
 * until the App can show > 30 nodes legibly we just render the instance
 * list + a 1-hop ring of edges per node (see `linkedNodes`).
 */
export function OntologyInstanceGraphScreen({
  company,
  typeId,
  displayName,
  onBack,
  onOpenWorkbench,
  defaultEntityType = "project",
}: OntologyInstanceGraphScreenProps) {
  const [entityType, setEntityType] = useState<string>(defaultEntityType);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [owners, setOwners] = useState<Array<{ id: string; label: string }>>([]);
  const [instances, setInstances] = useState<OntologyInstanceRow[]>([]);
  const [graph, setGraph] = useState<OntologyGraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, allOwners] = await Promise.all([
        coolie.listOntologyInstances(company.id, {
          entityType,
          ownerId: ownerId ?? undefined,
          limit: 80,
        }),
        // For the chip row we want the union of owner ids in the unfiltered
        // list — fetch once with limit=200 (validator max) and bucket.
        coolie
          .listOntologyInstances(company.id, {
            entityType,
            limit: 200,
          })
          .catch(() => ({ instances: [] as OntologyInstanceRow[] })),
      ]);
      setInstances(list.instances);

      // Owner chips: derive from the unfiltered list, sorted by label.
      const ownerMap = new Map<string, string>();
      for (const row of allOwners.instances) {
        if (row.ownerId && row.ownerLabel) {
          ownerMap.set(row.ownerId, row.ownerLabel);
        }
      }
      setOwners(
        Array.from(ownerMap.entries())
          .map(([id, label]) => ({ id, label }))
          .sort((a, b) => a.label.localeCompare(b.label, "zh-CN")),
      );

      // Best-effort: pull the company graph so we can show the 1-hop ring
      // for the focused node. wave237's flat snapshot is fine here.
      try {
        const g = await coolie.getOntologyGraph(company.id, {
          depth: 2,
          view: "project_tree",
        });
        setGraph(g);
      } catch {
        // graph is decorative — swallow failure so the list still renders.
        setGraph(null);
      }
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
      setInstances([]);
    }
  }, [company.id, entityType, ownerId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const onDelete = useCallback(
    (row: OntologyInstanceRow) => {
      showInfoToast(`查看「${row.label}」`, `${displayName} · 实体类型 ${entityType}`);
    },
    [displayName, entityType],
  );

  // 1-hop ring for `selectedId`. Empty when no graph or no selection.
  const linkedNodes = useMemo(() => {
    if (!selectedId || !graph) return new Set<string>();
    const ring = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.source === selectedId) ring.add(edge.target);
      if (edge.target === selectedId) ring.add(edge.source);
    }
    return ring;
  }, [selectedId, graph]);

  const positions = useMemo(() => {
    return computeRingPositions(instances, 320, 320);
  }, [instances]);

  const headerSubtitle = `${instances.length} 个实例 · 类型 ${entityType}`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScreenHeader
        title={`${displayName}·实例图谱`}
        subtitle={headerSubtitle}
        onBack={onBack}
      />

      {/* 负责人过滤 chip 行 (agy 草图 §2) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.ownerRow}
      >
        <OwnerChip
          label="全部"
          active={ownerId === null}
          onPress={() => setOwnerId(null)}
        />
        {owners.map((opt) => (
          <OwnerChip
            key={opt.id}
            label={opt.label}
            active={ownerId === opt.id}
            onPress={() => setOwnerId((prev) => (prev === opt.id ? null : opt.id))}
          />
        ))}
      </ScrollView>

      {/* 实体类型切换 (项目/任务/...); 默认 project, 只在多类型数据存在时显. */}
      <View style={styles.entityTypeRow}>
        {(["project", "issue", "agent"] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => {
              setEntityType(t);
              setOwnerId(null);
            }}
            hitSlop={4}
            style={[
              styles.entityChip,
              entityType === t && styles.entityChipActive,
            ]}
          >
            <Text
              style={[
                styles.entityChipText,
                entityType === t && styles.entityChipTextActive,
              ]}
            >
              {t}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <LoadingState text="加载实例…" />
      ) : error ? (
        <ErrorRetry message={error} onRetry={load} />
      ) : instances.length === 0 ? (
        <EmptyState
          icon={<Ionicons name="git-network-outline" size={36} color={C.ink3} />}
          title="暂无实例"
          subtitle="该实体类型下当前公司还没有数据。换个类型或在 Web 端新建实例后再回来。"
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.accent}
            />
          }
        >
          {/* 实例图谱 (mini graph) */}
          <AppCard variant="surface" padding={SPACING.md} style={styles.canvasCard}>
            <View style={styles.canvasHeader}>
              <Text style={styles.canvasTitle}>实例拓扑</Text>
              <Text style={styles.canvasSub}>
                {instances.length} 个节点 · 选中节点高亮 1 跳邻居
              </Text>
            </View>
            <View style={[styles.canvas, { width: 320, height: 320 }]}>
              {/* 连线 (1 跳邻居) */}
              {selectedId
                ? instances
                    .filter((row) => linkedNodes.has(row.id))
                    .map((row) => {
                      const a = positions.get(selectedId);
                      const b = positions.get(row.id);
                      if (!a || !b) return null;
                      return (
                        <Edge
                          key={`e-${selectedId}-${row.id}`}
                          ax={a.x}
                          ay={a.y}
                          bx={b.x}
                          by={b.y}
                        />
                      );
                    })
                : null}
              {/* 节点气泡 */}
              {instances.map((row) => {
                const pos = positions.get(row.id);
                if (!pos) return null;
                const isSelected = row.id === selectedId;
                const isLinked = linkedNodes.has(row.id);
                return (
                  <Pressable
                    key={`n-${row.id}`}
                    onPress={() => setSelectedId((prev) => (prev === row.id ? null : row.id))}
                    onLongPress={() => onDelete(row)}
                    hitSlop={4}
                    style={[
                      styles.node,
                      {
                        left: pos.x - 24,
                        top: pos.y - 24,
                        borderColor: isSelected ? C.accent : isLinked ? C.accent : C.line,
                        backgroundColor: isSelected
                          ? "rgba(94, 106, 210, 0.25)"
                          : isLinked
                          ? "rgba(94, 106, 210, 0.12)"
                          : C.panel,
                      },
                    ]}
                  >
                    <Text style={styles.nodeLabel} numberOfLines={1}>
                      {truncate(row.label, 8)}
                    </Text>
                  </Pressable>
                );
              })}
              {selectedId ? null : (
                <Text style={styles.canvasHint}>点击节点查看 1 跳邻居 · 长按节点查看详情</Text>
              )}
            </View>
          </AppCard>

          {/* 选中节点的详情卡 */}
          {selectedId ? (
            <InstanceDetailCard
              row={instances.find((r) => r.id === selectedId) ?? null}
              ringCount={linkedNodes.size}
              onClose={() => setSelectedId(null)}
            />
          ) : null}

          {/* 实例列表 (兜底 — 长屏滚动时仍能直接看) */}
          <AppCard variant="surface" padding={SPACING.md} style={styles.listCard}>
            <View style={styles.canvasHeader}>
              <Text style={styles.canvasTitle}>实例列表</Text>
              <Text style={styles.canvasSub}>
                长按可弹出详情 (复用 toast 卡片)
              </Text>
            </View>
            {instances.map((row) => (
              <Pressable
                key={`l-${row.id}`}
                onPress={() => setSelectedId(row.id)}
                onLongPress={() => onDelete(row)}
                hitSlop={4}
                style={styles.listRow}
              >
                <View style={styles.listRowLeft}>
                  <View style={[styles.listDot, row.ownerId ? styles.listDotOwned : null]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listRowLabel} numberOfLines={1}>
                      {row.label}
                    </Text>
                    {row.ownerLabel ? (
                      <Text style={styles.listRowOwner} numberOfLines={1}>
                        负责人 · {row.ownerLabel}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={14} color={C.ink4} />
              </Pressable>
            ))}
          </AppCard>

          {onOpenWorkbench ? (
            <Pressable
              onPress={onOpenWorkbench}
              hitSlop={4}
              style={styles.workbenchFab}
              accessibilityLabel="打开图谱工作台"
            >
              <Ionicons name="expand-outline" size={16} color={C.ink} />
              <Text style={styles.workbenchFabText}>工作台</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function OwnerChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={[styles.ownerChip, active && styles.ownerChipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={[styles.ownerChipText, active && styles.ownerChipTextActive]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function InstanceDetailCard({
  row,
  ringCount,
  onClose,
}: {
  row: OntologyInstanceRow | null;
  ringCount: number;
  onClose: () => void;
}) {
  if (!row) return null;
  return (
    <AppCard variant="surface" padding={SPACING.md} style={styles.detailCard}>
      <View style={styles.detailHeader}>
        <Text style={styles.detailTitle} numberOfLines={1}>
          {row.label}
        </Text>
        <Pressable onPress={onClose} hitSlop={8} style={styles.detailClose}>
          <Ionicons name="close" size={16} color={C.ink3} />
        </Pressable>
      </View>
      <Text style={styles.detailUuid} numberOfLines={1}>
        UUID · {row.id}
      </Text>
      <View style={styles.detailRow}>
        <Text style={styles.detailRowKey}>负责人</Text>
        <Text style={styles.detailRowVal}>{row.ownerLabel ?? "未指派"}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailRowKey}>1 跳邻居</Text>
        <Text style={styles.detailRowVal}>{ringCount} 个</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailRowKey}>详情</Text>
        <Text style={styles.detailRowVal} numberOfLines={1}>
          {Object.keys(row.metadata).length > 0
            ? `${Object.keys(row.metadata).length} 个元数据字段`
            : "无附加元数据"}
        </Text>
      </View>
    </AppCard>
  );
}

function Edge({
  ax,
  ay,
  bx,
  by,
}: {
  ax: number;
  ay: number;
  bx: number;
  by: number;
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
          left: ax + (dx / 2) - length / 2,
          top: ay + (dy / 2),
          width: length,
          transform: [{ rotate: `${angle}rad` }],
        },
      ]}
    />
  );
}

function computeRingPositions(
  rows: OntologyInstanceRow[],
  width: number,
  height: number,
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (rows.length === 0) return out;
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(cx, cy) - 32;
  rows.forEach((row, idx) => {
    const angle = (idx / rows.length) * Math.PI * 2;
    out.set(row.id, {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  });
  return out;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(1, max - 1))}…` : value;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  ownerChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    backgroundColor: C.panel,
  },
  ownerChipActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(94, 106, 210, 0.18)",
  },
  ownerChipText: { color: C.ink3, fontSize: 12, fontWeight: "500" },
  ownerChipTextActive: { color: C.accent, fontWeight: "600" },
  entityTypeRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  entityChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    backgroundColor: C.panel,
  },
  entityChipActive: { borderColor: C.accent },
  entityChipText: { color: C.ink3, fontSize: 11, fontFamily: "monospace" },
  entityChipTextActive: { color: C.accent, fontWeight: "600" },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  canvasCard: { marginBottom: SPACING.md, alignItems: "center" },
  canvasHeader: { width: "100%", marginBottom: 8 },
  canvasTitle: { color: C.ink, fontSize: 14, fontWeight: "600" },
  canvasSub: { color: C.ink3, fontSize: 11, marginTop: 2 },
  canvas: {
    position: "relative",
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 12,
    overflow: "hidden",
  },
  canvasHint: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 8,
    color: C.ink4,
    fontSize: 10,
    textAlign: "center",
  },
  node: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  nodeLabel: { color: C.ink, fontSize: 9, fontWeight: "500" },
  edge: {
    position: "absolute",
    height: 1,
    backgroundColor: C.accent,
    opacity: 0.7,
  },
  detailCard: { marginBottom: SPACING.md },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailTitle: { color: C.ink, fontSize: 15, fontWeight: "600", flex: 1, marginRight: 8 },
  detailClose: { padding: 4 },
  detailUuid: { color: C.ink4, fontSize: 10, fontFamily: "monospace", marginTop: 2 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
    marginTop: 8,
  },
  detailRowKey: { color: C.ink3, fontSize: 12 },
  detailRowVal: { color: C.ink, fontSize: 12, fontWeight: "500", maxWidth: "70%" },
  listCard: { marginBottom: SPACING.md },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },
  listRowLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 8 },
  listDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.line,
  },
  listDotOwned: { backgroundColor: C.accent },
  listRowLabel: { color: C.ink, fontSize: 13, fontWeight: "500" },
  listRowOwner: { color: C.ink3, fontSize: 11, marginTop: 1 },
  workbenchFab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
  },
  workbenchFabText: { color: C.ink, fontSize: 13, fontWeight: "600" },
});
