import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native";
import { StatusBar } from "expo-status-bar";
import type {
  Company,
  OntologyGraphResponse,
  OntologyStatsResponse,
} from "@coolie/api-client";
import { coolie } from "../coolie";
import { C } from "../theme";
import { RADIUS, SPACING } from "../ui/tokens";
import { AppCard } from "../ui/AppCard";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { ScreenHeader } from "../ui/ScreenHeader";
import { OntologyGraphCanvas } from "../components/OntologyGraphCanvas";

interface OntologyGraphWorkbenchScreenProps {
  company: Company;
  onBack?: () => void;
  embedded?: boolean;
  onOpenFullscreen?: () => void;
}

const TYPE_LABEL_MAP: Record<string, string> = {
  company: "公司",
  project: "项目",
  issue: "任务",
  spec: "规格",
  conversation: "对话",
  work_product: "交付物",
  attachment: "附件",
  comment: "评论",
  agent: "员工",
};

/**
 * Wave304 — 对齐 Web 端的对象关系图谱工作台 (OntologyGraphWorkbenchScreen)。
 * 1. 顶部提供宏观统计看板 (Stats Banner: 对象总数、关系总数、平均度、各类对象分布)
 * 2. 经典 4 视图预设 (全景 / 协作 / 脉络 / 全量) 与 深度选择 (1层 / 2层 / 3层)
 * 3. 沉浸式手势平移 (Pan) 与 缩放 (Pinch-to-zoom) 画布
 * 4. 彻底贯彻两字极简交互 (放大 / 缩小 / 复位 / 适应 / 聚焦 / 还原 / 全屏)
 */
export function OntologyGraphWorkbenchScreen({
  company,
  onBack,
  embedded = false,
  onOpenFullscreen,
}: OntologyGraphWorkbenchScreenProps) {
  const GRAPH_PRESETS = [
    { key: "macro" as const, label: "全景", depth: 2, view: "project_tree" as const },
    { key: "team" as const, label: "协作", depth: 1, view: "agent_dashboard" as const },
    { key: "thread" as const, label: "脉络", depth: 1, view: "conversation_thread" as const },
    { key: "mixed" as const, label: "全量", depth: 2, view: "mixed" as const },
  ];
  const [activePreset, setActivePreset] = useState<(typeof GRAPH_PRESETS)[number]["key"]>("macro");
  const [selectedDepth, setSelectedDepth] = useState<number>(2);
  const [data, setData] = useState<OntologyGraphResponse | null>(null);
  const [stats, setStats] = useState<OntologyStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  // pan + pinch state
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const lastPan = useRef({ x: 0, y: 0 });
  const lastScale = useRef(1);
  const initialDistance = useRef<number | null>(null);

  const load = useCallback(
    async (
      presetKey: (typeof GRAPH_PRESETS)[number]["key"],
      depthOverride?: number,
    ) => {
      setError(null);
      try {
        const preset = GRAPH_PRESETS.find((p) => p.key === presetKey) ?? GRAPH_PRESETS[0];
        const depth = depthOverride ?? preset.depth;
        const [graphRes, statsRes] = await Promise.all([
          preset.view === "mixed"
            ? coolie.getOntologyGraph(company.id, { depth })
            : coolie.getOntologyGraph(company.id, {
                view: preset.view,
                depth,
              }),
          coolie.getOntologyStats(company.id).catch(() => null),
        ]);
        setData(graphRes);
        if (statsRes) setStats(statsRes);
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
        setData(null);
      }
    },
    [company.id],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load(activePreset, selectedDepth).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load, activePreset, selectedDepth]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(activePreset, selectedDepth);
    setRefreshing(false);
  }, [load, activePreset, selectedDepth]);

  const reset = useCallback(() => {
    pan.setValue({ x: 0, y: 0 });
    scale.setValue(1);
    lastPan.current = { x: 0, y: 0 };
    lastScale.current = 1;
    initialDistance.current = null;
    setSelectedKey(null);
  }, [pan, scale]);

  const fit = useCallback(() => {
    // Compute a coarse scale based on node count so a small graph stays
    // readable and a large graph gets zoomed out.
    if (!data) return;
    // Wave261 — wider zoom range (0.5x - 4x) for drilldown.
    const count = data.nodes.length;
    const target = Math.max(0.5, Math.min(1.6, 400 / Math.max(count, 1) + 0.4));
    scale.setValue(target);
    lastScale.current = target;
    pan.setValue({ x: 0, y: 0 });
    lastPan.current = { x: 0, y: 0 };
  }, [data, scale, pan]);

  // PanResponder for single-touch pan + naive two-finger pinch. The latter
  // is best-effort because RN's PanResponder reports touches one at a time
  // before gesture-handler takes over; the dependency is already in the
  // bundle (wave213 Kanban uses it) so swapping in `GestureDetector`
  // later is a one-line change.
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          initialDistance.current = null;
        },
        onPanResponderMove: (evt, gestureState) => {
          // naive two-finger pinch via nativeEvent.touches
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            const t0 = touches[0];
            const t1 = touches[1];
            const dx = t0.pageX - t1.pageX;
            const dy = t0.pageY - t1.pageY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (initialDistance.current === null) {
              initialDistance.current = distance;
            } else {
              const ratio = distance / initialDistance.current;
              // Wave261 — wider zoom range (0.5x - 4x).
              const next = Math.max(0.5, Math.min(4, lastScale.current * ratio));
              scale.setValue(next);
            }
          } else {
            pan.setValue({
              x: lastPan.current.x + gestureState.dx,
              y: lastPan.current.y + gestureState.dy,
            });
          }
        },
        onPanResponderRelease: () => {
          const t = (pan.x as unknown as { _value: number })._value;
          const u = (pan.y as unknown as { _value: number })._value;
          lastPan.current = { x: t ?? 0, y: u ?? 0 };
          const s = (scale as unknown as { _value: number })._value;
          lastScale.current = s ?? 1;
          initialDistance.current = null;
        },
      }),
    [pan, scale],
  );

  const legendTypes = useMemo(() => {
    if (!data) return [] as Array<{ type: string; count: number }>;
    const m = new Map<string, number>();
    for (const n of data.nodes) {
      m.set(n.type, (m.get(n.type) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const displayGraph = useMemo(() => {
    if (!data) return null;
    if (!focusedKey) return data;
    const ring = new Set<string>([focusedKey]);
    for (const edge of data.edges) {
      if (edge.source === focusedKey) ring.add(edge.target);
      if (edge.target === focusedKey) ring.add(edge.source);
    }
    return {
      ...data,
      nodes: data.nodes.filter((n) => ring.has(n.key)),
      edges: data.edges.filter((e) => ring.has(e.source) && ring.has(e.target)),
    };
  }, [data, focusedKey]);

  const selectedNode = useMemo(() => {
    if (!selectedKey || !data) return null;
    return data.nodes.find((n) => n.key === selectedKey) ?? null;
  }, [selectedKey, data]);

  const linkedEdgesCount = useMemo(() => {
    if (!selectedKey || !data) return 0;
    return data.edges.filter((e) => e.source === selectedKey || e.target === selectedKey).length;
  }, [selectedKey, data]);

  const headerSubtitle = data
    ? `${data.nodes.length} 节点 · ${data.edges.length} 边${
        data.truncated ? " · 已截断" : ""
      }`
    : "加载中…";

  const Container = embedded ? View : SafeAreaView;

  return (
    <Container style={embedded ? styles.embeddedWrap : styles.safeArea}>
      {!embedded && <StatusBar style="light" />}
      {!embedded && (
        <ScreenHeader
          title="图谱"
          subtitle={headerSubtitle}
          onBack={onBack}
          right={
            <View style={styles.headerRight}>
              <Pressable
                onPress={onRefresh}
                hitSlop={8}
                style={styles.iconBtn}
                accessibilityLabel="刷新"
                testID="OntologyGraph__Refresh__Btn"
              >
                <Ionicons name="refresh-outline" size={16} color={C.ink2} />
              </Pressable>
            </View>
          }
        />
      )}

      {/* 宏观统计大盘 (对齐 Web 端 stats) */}
      <View style={styles.statsBanner} testID="OntologyGraph__StatsBanner">
        <View style={styles.statsMetricRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>{stats?.totalNodes ?? data?.nodes.length ?? 0}</Text>
            <Text style={styles.metricLabel}>对象</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>{stats?.totalRelations ?? data?.edges.length ?? 0}</Text>
            <Text style={styles.metricLabel}>关系</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>{stats?.averageDegree ?? "—"}</Text>
            <Text style={styles.metricLabel}>平均度</Text>
          </View>

          {/* 右侧动作胶囊 */}
          <View style={styles.statsActionCol}>
            {embedded && onOpenFullscreen ? (
              <Pressable
                style={styles.actionPill}
                onPress={onOpenFullscreen}
                hitSlop={6}
                accessibilityLabel="全屏"
                testID="OntologyGraph__Fullscreen__Btn"
              >
                <Ionicons name="scan-outline" size={13} color={C.accent} />
                <Text style={styles.actionPillText}>全屏</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.actionPill}
              onPress={onRefresh}
              hitSlop={6}
              accessibilityLabel="刷新"
              testID="OntologyGraph__RefreshSmall__Btn"
            >
              <Ionicons name="refresh-outline" size={13} color={C.ink2} />
              <Text style={[styles.actionPillText, { color: C.ink2 }]}>刷新</Text>
            </Pressable>
          </View>
        </View>

        {/* 节点类型分布标签横向滚动 */}
        {stats?.nodeCounts && stats.nodeCounts.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.typeTagRow}
          >
            {stats.nodeCounts
              .filter((c) => c.count > 0)
              .map((c) => (
                <View key={c.entityType} style={styles.typeTag}>
                  <View
                    style={[
                      styles.typeTagDot,
                      { backgroundColor: colorForType(c.entityType) },
                    ]}
                  />
                  <Text style={styles.typeTagLabel}>
                    {TYPE_LABEL_MAP[c.entityType] ?? c.entityType} {c.count}
                  </Text>
                </View>
              ))}
          </ScrollView>
        ) : null}
      </View>

      {/* 控制条: 4 视图预设 + 深度选择 */}
      <View style={styles.controlsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.presetScroll}
        >
          {GRAPH_PRESETS.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => {
                setActivePreset(opt.key);
                setSelectedDepth(opt.depth);
                setFocusedKey(null);
                setSelectedKey(null);
              }}
              hitSlop={4}
              style={[styles.viewChip, activePreset === opt.key && styles.viewChipActive]}
              testID={`OntologyGraph__Preset__${opt.key}`}
            >
              <Text
                style={[
                  styles.viewChipText,
                  activePreset === opt.key && styles.viewChipTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}

          <View style={styles.depthDivider} />

          {/* 深度选项 1/2/3 */}
          {[1, 2, 3].map((d) => (
            <Pressable
              key={`depth-${d}`}
              onPress={() => {
                setSelectedDepth(d);
                setFocusedKey(null);
              }}
              hitSlop={4}
              style={[styles.depthChip, selectedDepth === d && styles.depthChipActive]}
              testID={`OntologyGraph__Depth__${d}`}
            >
              <Text
                style={[
                  styles.depthChipText,
                  selectedDepth === d && styles.depthChipTextActive,
                ]}
              >
                {d}层
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <LoadingState text="加载图谱…" />
      ) : error ? (
        <ErrorRetry message={error} onRetry={() => void load(activePreset, selectedDepth)} />
      ) : (
        <View style={styles.canvasWrap} {...responder.panHandlers}>
          {/* 聚焦下钻提示条 */}
          {focusedKey ? (
            <View style={styles.focusBanner}>
              <Ionicons name="filter-circle" size={16} color={C.accent} />
              <Text style={styles.focusBannerText} numberOfLines={1}>
                聚焦「{data?.nodes.find((n) => n.key === focusedKey)?.label || "节点"}」
              </Text>
              <Pressable
                style={styles.focusBannerBtn}
                onPress={() => {
                  setFocusedKey(null);
                }}
                hitSlop={6}
                testID="OntologyGraph__Unfocus__Btn"
              >
                <Text style={styles.focusBannerBtnText}>还原</Text>
              </Pressable>
            </View>
          ) : null}

          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                transform: [
                  { translateX: pan.x },
                  { translateY: pan.y },
                  { scale },
                ],
              },
            ]}
          >
            <ScrollView
              style={StyleSheet.absoluteFill}
              contentContainerStyle={styles.canvasScrollContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={C.accent}
                />
              }
              scrollEnabled={false}
            >
              <OntologyGraphCanvas
                graph={displayGraph!}
                canvasSize={1600}
                selectedKey={selectedKey}
                onSelectNode={(key) => setSelectedKey((prev) => (prev === key ? null : key))}
              />
            </ScrollView>
          </Animated.View>

          {/* 左下浮动工具盘 */}
          <View style={styles.toolPalette}>
            <ToolButton
              icon="add-outline"
              label="放大"
              testID="OntologyGraph__ZoomIn__Btn"
              onPress={() => {
                const next = Math.min(4, lastScale.current + 0.2);
                scale.setValue(next);
                lastScale.current = next;
              }}
            />
            <ToolButton
              icon="remove-outline"
              label="缩小"
              testID="OntologyGraph__ZoomOut__Btn"
              onPress={() => {
                const next = Math.max(0.5, lastScale.current - 0.2);
                scale.setValue(next);
                lastScale.current = next;
              }}
            />
            <ToolButton
              icon="locate-outline"
              label="复位"
              testID="OntologyGraph__Reset__Btn"
              onPress={reset}
            />
            <ToolButton
              icon="expand-outline"
              label="适应"
              testID="OntologyGraph__Fit__Btn"
              onPress={fit}
            />
          </View>

          {/* 右下图例 */}
          <AppCard variant="surface" padding={SPACING.sm} style={styles.legendCard}>
            <Text style={styles.legendTitle}>图例</Text>
            {legendTypes.map((entry) => (
              <View key={entry.type} style={styles.legendRow}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: colorForType(entry.type) },
                  ]}
                />
                <Text style={styles.legendType}>{TYPE_LABEL_MAP[entry.type] ?? entry.type}</Text>
                <Text style={styles.legendCount}>{entry.count}</Text>
              </View>
            ))}
            {legendTypes.length === 0 ? (
              <Text style={styles.legendEmpty}>无节点</Text>
            ) : null}
          </AppCard>

          {/* 选中节点详情抽屉 */}
          {selectedNode ? (
            <View style={styles.nodeDrawer}>
              <View style={styles.nodeDrawerHeader}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.nodeDrawerTitle} numberOfLines={1}>
                    {selectedNode.label || selectedNode.key}
                  </Text>
                  <Text style={styles.nodeDrawerSub}>
                    类型: {TYPE_LABEL_MAP[selectedNode.type] ?? selectedNode.type} · 关联关系: {linkedEdgesCount} 条
                  </Text>
                </View>
                <Pressable
                  onPress={() => setSelectedKey(null)}
                  hitSlop={8}
                  style={styles.drawerCloseBtn}
                  accessibilityLabel="关闭"
                >
                  <Ionicons name="close" size={18} color={C.ink3} />
                </Pressable>
              </View>
              <View style={styles.nodeDrawerActions}>
                {focusedKey === selectedNode.key ? (
                  <Pressable
                    style={[styles.drawerActionBtn, styles.drawerActionBtnActive]}
                    onPress={() => setFocusedKey(null)}
                    testID="OntologyGraph__DrawerUnfocus__Btn"
                  >
                    <Ionicons name="contract-outline" size={14} color={C.accent} />
                    <Text style={styles.drawerActionBtnTextActive}>还原</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={styles.drawerActionBtn}
                    onPress={() => setFocusedKey(selectedNode.key)}
                    testID="OntologyGraph__DrawerFocus__Btn"
                  >
                    <Ionicons name="scan-outline" size={14} color={C.ink} />
                    <Text style={styles.drawerActionBtnText}>聚焦</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ) : null}
        </View>
      )}
    </Container>
  );
}

function ToolButton({
  icon,
  label,
  testID,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  testID?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={styles.toolBtn}
      accessibilityLabel={label}
      testID={testID}
    >
      <Ionicons name={icon} size={18} color={C.ink} />
    </Pressable>
  );
}

function colorForType(type: string): string {
  // Deterministic but not flashy. Same type → same color across the app.
  // Hash the type into one of 6 accent colors.
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  embeddedWrap: { flex: 1, backgroundColor: C.bg },
  headerRight: { flexDirection: "row", gap: 6 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  statsBanner: {
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    gap: 8,
  },
  statsMetricRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  metricItem: {
    alignItems: "flex-start",
    paddingRight: 14,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "700",
    color: C.ink,
  },
  metricLabel: {
    fontSize: 11,
    color: C.ink3,
    marginTop: 1,
  },
  metricDivider: {
    width: 1,
    height: 20,
    backgroundColor: C.line,
    marginRight: 14,
  },
  statsActionCol: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 6,
  },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
  },
  actionPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.accent,
  },
  typeTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 2,
  },
  typeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  typeTagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  typeTagLabel: {
    fontSize: 10,
    color: C.ink3,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  presetScroll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.md,
  },
  depthDivider: {
    width: 1,
    height: 16,
    backgroundColor: C.line,
    marginHorizontal: 4,
  },
  depthChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  depthChipActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(94, 106, 210, 0.15)",
  },
  depthChipText: {
    fontSize: 11,
    color: C.ink3,
    fontWeight: "500",
  },
  depthChipTextActive: {
    color: C.accent,
    fontWeight: "600",
  },
  viewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  viewChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    backgroundColor: C.panel,
  },
  viewChipActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(94, 106, 210, 0.18)",
  },
  viewChipText: { color: C.ink3, fontSize: 12, fontWeight: "500" },
  viewChipTextActive: { color: C.accent, fontWeight: "600" },
  canvasWrap: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.02)",
    overflow: "hidden",
  },
  canvasScrollContent: { width: 1600, height: 1600 },
  toolPalette: {
    position: "absolute",
    left: 12,
    bottom: 12,
    backgroundColor: "rgba(20,22,30,0.92)",
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 2,
    borderWidth: 1,
    borderColor: C.line,
  },
  toolBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  legendCard: {
    position: "absolute",
    right: 12,
    bottom: 12,
    minWidth: 160,
  },
  legendTitle: { color: C.ink, fontSize: 12, fontWeight: "600", marginBottom: 4 },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendType: { color: C.ink2, fontSize: 11, flex: 1, fontFamily: "monospace" },
  legendCount: { color: C.ink4, fontSize: 11 },
  legendEmpty: { color: C.ink4, fontSize: 11 },
  focusBanner: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(20, 22, 30, 0.94)",
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: C.accent,
    gap: 8,
    zIndex: 10,
  },
  focusBannerText: {
    flex: 1,
    fontSize: 12,
    color: C.ink,
    fontWeight: "500",
  },
  focusBannerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(94, 106, 210, 0.2)",
    borderWidth: 1,
    borderColor: C.accent,
  },
  focusBannerBtnText: {
    fontSize: 11,
    color: C.accent,
    fontWeight: "600",
  },
  nodeDrawer: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 60,
    backgroundColor: "rgba(20, 22, 30, 0.96)",
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: C.line,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 20,
  },
  nodeDrawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  nodeDrawerTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: C.ink,
  },
  nodeDrawerSub: {
    fontSize: 11,
    color: C.ink3,
    marginTop: 2,
  },
  drawerCloseBtn: {
    padding: 4,
  },
  nodeDrawerActions: {
    flexDirection: "row",
    gap: 8,
  },
  drawerActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
  },
  drawerActionBtnActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(94, 106, 210, 0.15)",
  },
  drawerActionBtnText: {
    fontSize: 12,
    color: C.ink,
    fontWeight: "500",
  },
  drawerActionBtnTextActive: {
    fontSize: 12,
    color: C.accent,
    fontWeight: "600",
  },
});
