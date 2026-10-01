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
}

/**
 * Wave239 — 屏 4 (graph workbench, agy 草图 §4).
 *
 * Immersive single-canvas view with:
 *   * PanResponder single-touch pan + pinch-style two-finger scaling
 *     (react-native-gesture-handler is already a dep but not pinned to
 *     `GestureDetector` for native rebuilds; PanResponder is the safer
 *     cross-version path that wave213 Kanban also uses).
 *   * View presets (wave155): project_tree / agent_dashboard /
 *     conversation_thread, plus "混合" (no preset = full graph).
 *   * Left-bottom floating tool palette (zoom / center / fit).
 *   * Right-bottom legend showing the entity-type color codes.
 *
 * Heavy viewport: up to MAX_NODES=400 from the wave237 endpoint, so the
 * canvas clamps `scale ∈ [0.4, 2.5]`. Drawing 400 nodes via absolute
 * `View` is still cheap — each node is a 60×60 box.
 */
export function OntologyGraphWorkbenchScreen({
  company,
  onBack,
}: OntologyGraphWorkbenchScreenProps) {
  const [view, setView] = useState<"project_tree" | "agent_dashboard" | "conversation_thread" | "mixed">("project_tree");
  const [data, setData] = useState<OntologyGraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // pan + pinch state lives in refs so PanResponder callbacks see current
  // values without re-binding the gesture on every render.
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const lastPan = useRef({ x: 0, y: 0 });
  const lastScale = useRef(1);
  const initialDistance = useRef<number | null>(null);

  const load = useCallback(
    async (currentView: typeof view) => {
      setError(null);
      try {
        const res =
          currentView === "mixed"
            ? await coolie.getOntologyGraph(company.id, { depth: 2 })
            : await coolie.getOntologyGraph(company.id, {
                view: currentView,
              });
        setData(res);
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
    void load(view).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load, view]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(view);
    setRefreshing(false);
  }, [load, view]);

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
    const count = data.nodes.length;
    const target = Math.max(0.4, Math.min(1.4, 400 / Math.max(count, 1) + 0.4));
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
              const next = Math.max(0.4, Math.min(2.5, lastScale.current * ratio));
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

  const headerSubtitle = data
    ? `${data.nodes.length} 节点 · ${data.edges.length} 边${
        data.truncated ? " · 已截断" : ""
      }`
    : "加载中…";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScreenHeader
        title="工作台"
        subtitle={headerSubtitle}
        onBack={onBack}
        right={
          <View style={styles.headerRight}>
            <Pressable onPress={onRefresh} hitSlop={8} style={styles.iconBtn}>
              <Ionicons name="download-outline" size={14} color={C.ink2} />
            </Pressable>
          </View>
        }
      />

      {/* 视图切换 chip 行 (agy 草图 §4 顶部) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.viewRow}
      >
        {(
          [
            { key: "project_tree", label: "类型" },
            { key: "agent_dashboard", label: "实例" },
            { key: "conversation_thread", label: "对话" },
            { key: "mixed", label: "混合" },
          ] as const
        ).map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => setView(opt.key)}
            hitSlop={4}
            style={[styles.viewChip, view === opt.key && styles.viewChipActive]}
          >
            <Text
              style={[
                styles.viewChipText,
                view === opt.key && styles.viewChipTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <LoadingState text="加载图谱…" />
      ) : error ? (
        <ErrorRetry message={error} onRetry={() => void load(view)} />
      ) : (
        <View style={styles.canvasWrap} {...responder.panHandlers}>
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
                graph={data!}
                canvasSize={1600}
                selectedKey={selectedKey}
                onSelectNode={(key) => setSelectedKey(key)}
              />
            </ScrollView>
          </Animated.View>

          {/* 左下浮动工具盘 */}
          <View style={styles.toolPalette}>
            <ToolButton icon="add-outline" onPress={() => {
              const next = Math.min(2.5, lastScale.current + 0.2);
              scale.setValue(next);
              lastScale.current = next;
            }} />
            <ToolButton icon="remove-outline" onPress={() => {
              const next = Math.max(0.4, lastScale.current - 0.2);
              scale.setValue(next);
              lastScale.current = next;
            }} />
            <ToolButton icon="locate-outline" onPress={reset} />
            <ToolButton icon="expand-outline" onPress={fit} />
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
                <Text style={styles.legendType}>{entry.type}</Text>
                <Text style={styles.legendCount}>{entry.count}</Text>
              </View>
            ))}
            {legendTypes.length === 0 ? (
              <Text style={styles.legendEmpty}>无节点</Text>
            ) : null}
          </AppCard>
        </View>
      )}
    </SafeAreaView>
  );
}

function ToolButton({ icon, onPress }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={styles.toolBtn}>
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
});
