import { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
  OntologyDomain,
  OntologyGraphSnapshot,
} from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { StatusDot } from "../components/StatusDot";
import { EmergencyKillSwitch } from "../components/EmergencyKillSwitch";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { Pill } from "../ui/Pill";
import { ScreenHeader } from "../ui/ScreenHeader";
import { SectionHeader } from "../ui/SectionHeader";
import { SegmentedControl } from "../ui/SegmentedControl";
import { StatTile } from "../ui/StatTile";
import { StatusBadge } from "../ui/StatusBadge";

interface OntologyDomainListScreenProps {
  onOpenSettings?: () => void;
  company: Company;
  whoami?: string;
  onBack?: () => void;
}

const LIFECYCLE_CONFIG: Record<
  string,
  { label: string; status: "ok" | "err" | "idle"; color: string; bg: string; border: string }
> = {
  active: {
    label: "运行中",
    status: "ok",
    color: C.ok,
    bg: "rgba(39, 166, 68, 0.1)",
    border: "rgba(39, 166, 68, 0.25)",
  },
  archived: {
    label: "已锁定",
    status: "err",
    color: C.err,
    bg: "rgba(239, 68, 68, 0.1)",
    border: "rgba(239, 68, 68, 0.28)",
  },
  locked: {
    label: "已锁定",
    status: "err",
    color: C.err,
    bg: "rgba(239, 68, 68, 0.1)",
    border: "rgba(239, 68, 68, 0.28)",
  },
  deprecated: {
    label: "弃用锁死",
    status: "idle",
    color: C.warn,
    bg: "rgba(245, 158, 11, 0.1)",
    border: "rgba(245, 158, 11, 0.25)",
  },
  draft: {
    label: "草稿中",
    status: "idle",
    color: C.ink3,
    bg: "rgba(255, 255, 255, 0.04)",
    border: C.line,
  },
};

export type DomainFilter = "all" | "active" | "draft" | "archived" | "locked";
export type OntologyViewMode = "list" | "detail" | "graph";

export function OntologyDomainListScreen({
  company,
  whoami = "管理员",
  onBack,
  onOpenSettings,
}: OntologyDomainListScreenProps) {
  const [domains, setDomains] = useState<OntologyDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DomainFilter>("all");
  const [viewMode, setViewMode] = useState<OntologyViewMode>("list");
  const [seedingSample, setSeedingSample] = useState(false);
  const [selectedNodeTypeKey, setSelectedNodeTypeKey] = useState<string | null>(null);

  // 快照详情视图
  const [selectedDomain, setSelectedDomain] = useState<OntologyDomain | null>(null);
  const [snapshot, setSnapshot] = useState<OntologyGraphSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [domainStats, setDomainStats] = useState<
    Record<string, { nodes: number; edges: number }>
  >({});

  const companyId = company.id;

  const loadDomains = useCallback(async () => {
    setError(null);
    try {
      const list = await coolie.listOntologyDomains(companyId);
      setDomains(list);

      // 异步预拉取前几个域的简要计数
      for (const d of list.slice(0, 5)) {
        coolie
          .getOntologySnapshot(companyId, d.id, 50)
          .then((snap) => {
            if (snap?.counts) {
              setDomainStats((prev) => ({
                ...prev,
                [d.id]: {
                  nodes: snap.counts.nodes ?? 0,
                  edges: snap.counts.edges ?? 0,
                },
              }));
            }
          })
          .catch(() => {
            // ignore prefetch errors
          });
      }
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadDomains();
  }, [loadDomains]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadDomains();
  }, [loadDomains]);

  // 打开域快照详情
  const openDomainDetail = useCallback(
    async (domain: OntologyDomain) => {
      setSelectedDomain(domain);
      setViewMode("detail");
      setSnapshot(null);
      setSnapshotLoading(true);
      try {
        const snap = await coolie.getOntologySnapshot(companyId, domain.id, 300);
        setSnapshot(snap);
        if (snap?.counts) {
          setDomainStats((prev) => ({
            ...prev,
            [domain.id]: {
              nodes: snap.counts.nodes ?? 0,
              edges: snap.counts.edges ?? 0,
            },
          }));
        }
      } catch (e) {
        Alert.alert("获取快照失败", String((e as Error)?.message ?? e));
      } finally {
        setSnapshotLoading(false);
      }
    },
    [companyId],
  );

  // 一键注入官方示例本体域:骨架接口只建域,实例节点/边要逐个域补种
  const handleSeedSample = useCallback(async () => {
    setSeedingSample(true);
    try {
      const report = await coolie.seedSampleDomains(companyId);
      const createdDomains = report.domains.filter((d) => d.status === "created");

      // 骨架报告里只有 slug,没有 domainId:刷新一次列表把 slug 映射回 id
      const idBySlug = new Map(
        createdDomains.length > 0
          ? (await coolie.listOntologyDomains(companyId)).map((d) => [d.slug, d.id])
          : [],
      );

      let injectedDomains = 0;
      let injectedNodes = 0;
      for (const created of createdDomains) {
        const domainId = idBySlug.get(created.slug);
        if (!domainId) continue;
        try {
          const result = await coolie.seedDomainSamples(companyId, domainId);
          if (result.seeded) {
            injectedDomains += 1;
            injectedNodes += result.created?.nodes ?? result.counts?.nodes ?? 0;
          }
        } catch {
          // 单个域失败跳过,不影响其余域
        }
      }

      await loadDomains();
      Alert.alert(
        "注入完成",
        `已注入 ${injectedDomains} 个域 · ${injectedNodes} 个实例节点`,
      );
    } catch (e) {
      Alert.alert("注入失败", String((e as Error)?.message ?? e));
    } finally {
      setSeedingSample(false);
    }
  }, [companyId, loadDomains]);

  // 执行熔断
  const triggerKillSwitch = useCallback(
    async (domain: OntologyDomain) => {
      try {
        const updated = await coolie.setDomainLifecycle(companyId, domain.id, "locked", {
          actor: whoami,
          reason: "移动端掌上紧急熔断 (EMERGENCY_LOCKED)",
          deviceInfo: "Coolie-Mobile-Expo",
        });

        // 立即就地更新状态
        setDomains((prev) =>
          prev.map((item) =>
            item.id === domain.id
              ? { ...item, lifecycle_state: "archived" }
              : item,
          ),
        );

        if (selectedDomain?.id === domain.id) {
          setSelectedDomain({
            ...selectedDomain,
            lifecycle_state: "archived",
          });
        }

        Alert.alert(
          "🚨 紧急熔断生效",
          `本体域「${domain.display_name || domain.displayName || domain.slug}」已进入锁死状态 (ARCHIVED/LOCKED)。后续读写已即刻拦截，审计事件已写入 ontology_audit_logs。`,
        );
      } catch (e) {
        throw e;
      }
    },
    [companyId, whoami, selectedDomain],
  );

  // 解锁/恢复运行 (操作员二次确认)
  const unlockDomain = useCallback(
    (domain: OntologyDomain) => {
      Alert.alert(
        "解除安全锁定",
        `确认将本体域「${domain.display_name || domain.slug}」恢复为运行中 (active) 状态吗？恢复后将允许 Agent 继续访问。`,
        [
          { text: "取消", style: "cancel" },
          {
            text: "确认恢复",
            style: "default",
            onPress: async () => {
              try {
                await coolie.setDomainLifecycle(companyId, domain.id, "active", {
                  actor: whoami,
                  reason: "移动控制台操作员手动解除熔断锁定",
                });
                setDomains((prev) =>
                  prev.map((item) =>
                    item.id === domain.id
                      ? { ...item, lifecycle_state: "active" }
                      : item,
                  ),
                );
                if (selectedDomain?.id === domain.id) {
                  setSelectedDomain({
                    ...selectedDomain,
                    lifecycle_state: "active",
                  });
                }
                Alert.alert("已解除锁定", "本体域状态已恢复为 active");
              } catch (e) {
                Alert.alert("解除锁定失败", String((e as Error)?.message ?? e));
              }
            },
          },
        ],
      );
    },
    [companyId, whoami, selectedDomain],
  );

  // 过滤显示
  const activeCount = domains.filter((d) => d.lifecycle_state === "active").length;
  const draftCount = domains.filter((d) => d.lifecycle_state === "draft").length;
  const archivedCount = domains.filter(
    (d) =>
      d.lifecycle_state === "archived" ||
      d.lifecycle_state === "deprecated" ||
      d.lifecycle_state === "locked",
  ).length;

  const filteredDomains = domains.filter((d) => {
    if (filter === "active") return d.lifecycle_state === "active";
    if (filter === "draft") return d.lifecycle_state === "draft";
    if (filter === "archived")
      return (
        d.lifecycle_state === "archived" ||
        d.lifecycle_state === "deprecated" ||
        d.lifecycle_state === "locked"
      );
    if (filter === "locked")
      return (
        d.lifecycle_state === "archived" ||
        d.lifecycle_state === "deprecated" ||
        d.lifecycle_state === "locked"
      );
    return true;
  });

  // 第三层: 关系图谱交互浏览 (Graph View)
  if (viewMode === "graph" && selectedDomain) {
    const nodeTypesList = (() => {
      const map = new Map<
        string,
        {
          key: string;
          label: string;
          count: number;
          sampleProperties: Record<string, unknown>;
        }
      >();
      if (snapshot?.counts?.byNodeType) {
        for (const [k, count] of Object.entries(snapshot.counts.byNodeType)) {
          if (k) map.set(k, { key: k, label: k, count, sampleProperties: {} });
        }
      }
      for (const n of snapshot?.nodes || []) {
        const typeKey = n.nodeTypeId || n.label || n.key;
        if (!map.has(typeKey)) {
          map.set(typeKey, {
            key: typeKey,
            label: n.label || typeKey,
            count: 1,
            sampleProperties: (n.properties as Record<string, unknown>) || {},
          });
        } else {
          const item = map.get(typeKey)!;
          if (n.properties && Object.keys(item.sampleProperties).length === 0) {
            item.sampleProperties = n.properties as Record<string, unknown>;
          }
        }
      }
      if (map.size === 0) {
        map.set(selectedDomain.slug, {
          key: selectedDomain.slug,
          label: selectedDomain.display_name || selectedDomain.displayName || selectedDomain.slug,
          count: snapshot?.counts?.nodes ?? 0,
          sampleProperties: {
            domainId: selectedDomain.id,
            slug: selectedDomain.slug,
            category: selectedDomain.category || "业务本体",
            version: selectedDomain.schema_version ?? 1,
          },
        });
      }
      return Array.from(map.values());
    })();

    const activeSelectedKey = selectedNodeTypeKey || nodeTypesList[0]?.key;
    const selectedNt =
      nodeTypesList.find((nt) => nt.key === activeSelectedKey) || nodeTypesList[0];

    const N = nodeTypesList.length;
    const canvasSize = 320;
    const cx = canvasSize / 2;
    const cy = canvasSize / 2;
    const R = Math.min(105, 55 + N * 10);

    const positions = nodeTypesList.map((nt, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(N, 1) - Math.PI / 2;
      return {
        key: nt.key,
        x: cx + R * Math.cos(angle),
        y: cy + R * Math.sin(angle),
      };
    });

    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* 顶部返回条 */}
          <ScreenHeader
            onBack={() => setViewMode("detail")}
            backLabel="返回域详情"
            style={styles.detailNav}
            right={
              <Text style={styles.graphNavTitle}>
                {selectedDomain.display_name || selectedDomain.displayName || selectedDomain.slug} · 关系图谱
              </Text>
            }
          />

          {/* 拓扑画布容器 */}
          <AppCard variant="surface" style={styles.graphCanvasCard}>
            <View style={styles.graphCanvasHeader}>
              <View>
                <Text style={styles.graphCanvasTitle}>实体关系环形拓扑</Text>
                <Text style={styles.graphCanvasSub}>
                  {nodeTypesList.length} 个实体类型 · 点击节点查看 Properties Schema
                </Text>
              </View>
              <View style={styles.graphLegend}>
                <View style={[styles.graphLegendDot, { backgroundColor: C.accent }]} />
                <Text style={styles.graphLegendText}>实体类型</Text>
              </View>
            </View>

            <View style={[styles.graphCanvas, { width: canvasSize, height: canvasSize, alignSelf: "center" }]}>
              {/* 连线 */}
              {positions.map((posA, i) => {
                if (positions.length <= 1) return null;
                const posB = positions[(i + 1) % positions.length];
                const dx = posB.x - posA.x;
                const dy = posB.y - posA.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx);
                const midX = (posA.x + posB.x) / 2;
                const midY = (posA.y + posB.y) / 2;
                const isEdgeActive =
                  posA.key === activeSelectedKey || posB.key === activeSelectedKey;

                return (
                  <View
                    key={`edge-${posA.key}-${posB.key}`}
                    style={[
                      styles.graphEdgeLine,
                      {
                        left: midX - length / 2,
                        top: midY,
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
                const nt = nodeTypesList.find((n) => n.key === pos.key)!;
                const isSelected = nt.key === activeSelectedKey;
                const nodeRadius = 26;

                return (
                  <Pressable
                    key={`node-${pos.key}`}
                    style={[
                      styles.graphNodeCircle,
                      {
                        left: pos.x - nodeRadius,
                        top: pos.y - nodeRadius,
                        width: nodeRadius * 2,
                        height: nodeRadius * 2,
                        borderRadius: nodeRadius,
                        borderColor: isSelected ? C.accent : C.line,
                        backgroundColor: isSelected ? C.surfaceHover : C.panel,
                      },
                    ]}
                    onPress={() => setSelectedNodeTypeKey(nt.key)}
                  >
                    <Text
                      style={[
                        styles.graphNodeCircleText,
                        isSelected && { color: C.ink, fontWeight: "700" },
                      ]}
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
          {Boolean(selectedNt) && (
            <AppCard variant="surface" style={styles.schemaCard}>
              <View style={styles.schemaCardHeader}>
                <View style={styles.schemaTitleRow}>
                  <Ionicons name="cube-outline" size={16} color={C.accent} style={{ marginRight: 6 }} />
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
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // 第二层: 域详情与快照摘要 (Snapshot Summary View)
  if (selectedDomain) {
    const isLocked =
      selectedDomain.lifecycle_state === "archived" ||
      selectedDomain.lifecycle_state === "deprecated" ||
      selectedDomain.lifecycle_state === "locked";
    const cfg =
      LIFECYCLE_CONFIG[selectedDomain.lifecycle_state] || LIFECYCLE_CONFIG.draft;
    const stats = domainStats[selectedDomain.id];

    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={snapshotLoading}
              onRefresh={() => openDomainDetail(selectedDomain)}
              tintColor={C.accent}
            />
          }
        >
          {/* 顶部返回条 */}
          <ScreenHeader
            onBack={() => {
              setViewMode("list");
              setSelectedDomain(null);
            }}
            backLabel="返回本体域列表"
            style={styles.detailNav}
            right={
              <StatusBadge
                label={cfg.label}
                color={cfg.color}
                bg={cfg.bg}
                border={cfg.border}
                dotStatus={cfg.status}
              />
            }
          />

          {/* 域基础信息卡片 */}
          <AppCard padding={16} style={styles.heroCard}>
            <Text style={styles.heroTitle}>
              {selectedDomain.display_name || selectedDomain.displayName || selectedDomain.slug}
            </Text>
            <Text style={styles.heroSub}>标识: {selectedDomain.slug}</Text>
            {selectedDomain.description ? (
              <Text style={styles.heroDesc}>{selectedDomain.description}</Text>
            ) : null}

            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Text style={styles.metaChipLabel}>分类</Text>
                <Text style={styles.metaChipValue}>
                  {selectedDomain.category || "业务本体"}
                </Text>
              </View>
              <View style={styles.metaChip}>
                <Text style={styles.metaChipLabel}>架构版本</Text>
                <Text style={styles.metaChipValue}>
                  v{selectedDomain.schema_version ?? selectedDomain.version ?? 1}
                </Text>
              </View>
              <View style={styles.metaChip}>
                <Text style={styles.metaChipLabel}>引导源</Text>
                <Text style={styles.metaChipValue}>
                  {selectedDomain.bootstrap_source || "系统内置"}
                </Text>
              </View>
            </View>
          </AppCard>

          {/* 关系图谱交互入口 */}
          <AppCard
            variant="surface"
            row
            onPress={() => setViewMode("graph")}
            style={styles.graphEntryBtn}
          >
            <View style={styles.graphEntryLeft}>
              <Ionicons
                name="git-network-outline"
                size={20}
                color={C.accent}
                style={{ marginRight: 10 }}
              />
              <View>
                <Text style={styles.graphEntryTitle}>关系图谱拓扑</Text>
                <Text style={styles.graphEntrySub}>
                  实体对象类型与关系连线交互浏览
                </Text>
              </View>
            </View>
            <Text style={styles.graphEntryArrow}>›</Text>
          </AppCard>

          {/* 高危熔断控制闸门区 */}
          <View style={styles.sectionBlock}>
            <SectionHeader
              emphasis
              title="高危安全闸门"
              hint="PRD 需求⑪ 熔断通道"
              style={styles.sectionHeaderMargin}
            />

            {isLocked ? (
              <View style={styles.lockedNoticeCard}>
                <View style={styles.lockedNoticeRow}>
                  <StatusDot status="err" size={8} />
                  <Text style={styles.lockedNoticeTitle}>
                    当前本体域已处于安全锁死状态 (LOCKED)
                  </Text>
                </View>
                <Text style={styles.lockedNoticeDesc}>
                  所有相关智能体对该域的写入权限已强制熔断，已拦截潜在数据污染风险。
                </Text>
                <Pressable
                  style={styles.unlockBtn}
                  onPress={() => unlockDomain(selectedDomain)}
                >
                  <Text style={styles.unlockBtnText}>解除锁死并恢复运行</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.killSwitchContainer}>
                <View style={styles.killNotice}>
                  <Text style={styles.killNoticeTitle}>
                    突发异常应急保护 · 一键熔断
                  </Text>
                  <Text style={styles.killNoticeDesc}>
                    如发现模型产生幻觉批量改写资产或发生业务冲突，向右滑脱即可在 50ms 内置为锁死归档，并写死审计日志。
                  </Text>
                </View>
                <EmergencyKillSwitch
                  domainId={selectedDomain.id}
                  domainName={
                    selectedDomain.display_name || selectedDomain.slug
                  }
                  isLocked={isLocked}
                  actor={whoami}
                  onTrigger={() => triggerKillSwitch(selectedDomain)}
                />
              </View>
            )}
          </View>

          {/* 快照摘要统计 (Snapshot Counts) */}
          <View style={styles.sectionBlock}>
            <SectionHeader
              emphasis
              title="图谱快照摘要"
              style={styles.sectionHeaderMargin}
              right={
                snapshotLoading ? (
                  <ActivityIndicator size="small" color={C.accent} />
                ) : (
                  <Text style={styles.sectionHint}>实时拓扑数据</Text>
                )
              }
            />

            <View style={styles.statsGrid}>
              <StatTile
                flex={false}
                style={styles.metricCard}
                value={snapshot?.counts?.nodes ?? stats?.nodes ?? "0"}
                label="实体节点数"
              />
              <StatTile
                flex={false}
                style={styles.metricCard}
                value={snapshot?.counts?.edges ?? stats?.edges ?? "0"}
                valueColor={C.accent}
                label="关系连线数"
              />
              <StatTile
                flex={false}
                style={styles.metricCard}
                value={snapshot?.counts?.nodeTypes ?? "0"}
                label="节点类型数"
              />
              <StatTile
                flex={false}
                style={styles.metricCard}
                value={snapshot?.counts?.crossDomainEdges ?? "0"}
                valueColor={C.warn}
                label="跨域依赖数"
              />
            </View>
          </View>

          {/* 节点类型分布 breakdown */}
          {snapshot?.counts?.byNodeType &&
          Object.keys(snapshot.counts.byNodeType).length > 0 ? (
            <View style={styles.sectionBlock}>
              <SectionHeader emphasis title="实体类型分布" />
              <View style={styles.cardList}>
                {Object.entries(snapshot.counts.byNodeType).map(
                  ([typeKey, count]) => (
                    <View key={typeKey || "none"} style={styles.subItemRow}>
                      <Text style={styles.subItemKey}>
                        {typeKey ? typeKey : "(未归类对象)"}
                      </Text>
                      <Pill label={`${count} 实体`} tone="brand" size="sm" />
                    </View>
                  ),
                )}
              </View>
            </View>
          ) : null}

          {/* 实体样本预览 */}
          {snapshot?.nodes && snapshot.nodes.length > 0 ? (
            <View style={styles.sectionBlock}>
              <SectionHeader
                emphasis
                title={`实体节点抽样 (${Math.min(snapshot.nodes.length, 10)} / ${snapshot.counts.nodes})`}
              />
              <View style={styles.cardList}>
                {snapshot.nodes.slice(0, 8).map((node) => (
                  <View key={node.id} style={styles.nodeItem}>
                    <View style={styles.nodeHeader}>
                      <Text style={styles.nodeLabel}>{node.label}</Text>
                      <Pill label={node.lifecycleState || "active"} size="sm" />
                    </View>
                    <Text style={styles.nodeKey}>{node.key}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* 关系样本预览 */}
          {snapshot?.edges && snapshot.edges.length > 0 ? (
            <View style={styles.sectionBlock}>
              <SectionHeader
                emphasis
                title={`关系连线抽样 (${Math.min(snapshot.edges.length, 6)} / ${snapshot.counts.edges})`}
              />
              <View style={styles.cardList}>
                {snapshot.edges.slice(0, 6).map((edge) => (
                  <View key={edge.id} style={styles.edgeItem}>
                    <Text style={styles.edgeKey}>
                      {edge.relationKey || "关联"}
                    </Text>
                    <Text style={styles.edgeEndpoints} numberOfLines={1}>
                      {edge.sourceNodeId.slice(0, 8)}... ➔{" "}
                      {edge.targetNodeId.slice(0, 8)}...
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // 列表视图 (Domain Card List)
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <ScreenHeader
          onBack={onBack}
          title="业务本体域"
          subtitle={
            <Pill style={styles.companyCapsule}>
              <StatusDot status="ok" size={6} />
              <Text style={styles.companyCapsuleText} numberOfLines={1}>
                {company.name}
              </Text>
              <Text style={styles.companyCapsuleSubText}>· 资产底座</Text>
            </Pill>
          }
          right={
            <>
              {onOpenSettings ? (
                <Pressable onPress={onOpenSettings} hitSlop={12} style={styles.refreshBtn}>
                  <Ionicons name="settings-outline" size={17} color={C.ink3} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={handleSeedSample}
                disabled={seedingSample}
                hitSlop={12}
                style={[styles.refreshBtn, styles.seedBtn]}
              >
                {seedingSample ? (
                  <ActivityIndicator size="small" color={C.accent} />
                ) : (
                  <Text style={styles.seedBtnText}>注入示例域</Text>
                )}
              </Pressable>
              <Pressable onPress={onRefresh} hitSlop={12} style={styles.refreshBtn}>
                <Text style={styles.refreshBtnText}>刷新</Text>
              </Pressable>
            </>
          }
        />

        {/* 顶部过滤切换器 */}
        <SegmentedControl
          value={filter}
          onChange={(key) => setFilter(key as DomainFilter)}
          options={[
            { key: "all", label: `全部 (${domains.length})` },
            { key: "active", label: `生产 (${activeCount})` },
            { key: "draft", label: `草稿 (${draftCount})` },
            {
              key: "archived",
              label: `已归档 (${archivedCount})`,
              color: archivedCount > 0 ? C.err : undefined,
            },
          ]}
          style={styles.filterSwitcher}
        />
      </View>

      {loading ? (
        <LoadingState text="正在加载业务本体域拓扑…" />
      ) : error ? (
        <ErrorRetry message={error} onRetry={loadDomains} />
      ) : filteredDomains.length === 0 ? (
        <EmptyState
          variant="standalone"
          icon="🌐"
          title={domains.length === 0 ? "暂无业务本体域" : "暂无匹配的业务本体域"}
          subtitle={
            domains.length === 0
              ? "当前工坊尚未初始化任何业务本体。您可以一键注入官方示例本体域。"
              : "可尝试切换上方分类筛选标签查看其他本体域。"
          }
          action={
            domains.length === 0 ? (
              <Pressable
                style={[
                  styles.refreshBtn,
                  styles.seedBtn,
                  { marginTop: 12, paddingHorizontal: 16, paddingVertical: 10 },
                ]}
                disabled={seedingSample}
                onPress={() => void handleSeedSample()}
              >
                {seedingSample ? (
                  <ActivityIndicator size="small" color={C.accent} />
                ) : (
                  <Text style={[styles.seedBtnText, { fontSize: 14 }]}>✨ 注入示例域</Text>
                )}
              </Pressable>
            ) : (
              <Pressable
                style={[styles.refreshBtn, { marginTop: 12 }]}
                onPress={() => setFilter("all")}
              >
                <Text style={styles.refreshBtnText}>查看全部域</Text>
              </Pressable>
            )
          }
        />
      ) : (
        <FlatList
          data={filteredDomains}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.accent}
            />
          }
          renderItem={({ item }) => {
            const isLocked =
              item.lifecycle_state === "archived" ||
              item.lifecycle_state === "deprecated" ||
              item.lifecycle_state === "locked";
            const cfg =
              LIFECYCLE_CONFIG[item.lifecycle_state] || LIFECYCLE_CONFIG.draft;
            const stats = domainStats[item.id];

            return (
              <AppCard
                style={[styles.domainCard, isLocked && styles.domainCardLocked]}
                onPress={() => openDomainDetail(item)}
              >
                {/* 头部标题与状态徽标 */}
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.domainTitle} numberOfLines={1}>
                      {item.display_name || item.displayName || item.slug}
                    </Text>
                    <Text style={styles.domainSlug}>标识: {item.slug}</Text>
                  </View>
                  <StatusBadge
                    label={cfg.label}
                    color={cfg.color}
                    bg={cfg.bg}
                    border={cfg.border}
                    dotStatus={cfg.status}
                  />
                </View>

                {/* 描述文案 */}
                {item.description ? (
                  <Text style={styles.domainDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}

                {/* 指标与标签卡脚 */}
                <View style={styles.cardFooter}>
                  <View style={styles.footerPills}>
                    <Pill
                      label="节点"
                      value={stats ? String(stats.nodes) : "--"}
                      size="sm"
                      mono
                    />
                    <Pill
                      label="关系"
                      value={stats ? String(stats.edges) : "--"}
                      size="sm"
                      mono
                    />
                    <Pill
                      label={`v${item.schema_version ?? item.version ?? 1}`}
                      size="sm"
                    />
                  </View>

                  <Text style={styles.enterChevron}>快照摘要 ›</Text>
                </View>

                {/* 如果处于活跃状态，卡片底部展示快速熔断器 */}
                {item.lifecycle_state === "active" ? (
                  <View style={styles.cardKillSwitchWrap}>
                    <EmergencyKillSwitch
                      domainId={item.id}
                      domainName={item.display_name || item.slug}
                      compact
                      actor={whoami}
                      onTrigger={() => triggerKillSwitch(item)}
                    />
                  </View>
                ) : null}
              </AppCard>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
        flex: 1,
    backgroundColor: C.bg,
  },
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  companyCapsule: {
    marginTop: 6,
    gap: 6,
  },
  companyCapsuleText: {
    color: C.ink2,
    fontSize: 11,
    fontWeight: "500",
  },
  companyCapsuleSubText: {
    color: C.ink4,
    fontSize: 11,
  },
  refreshBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  refreshBtnText: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "500",
  },
  seedBtn: {
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    borderColor: "rgba(94, 106, 210, 0.35)",
  },
  seedBtnText: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "500",
  },
  filterSwitcher: {
    marginTop: 12,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  domainCard: {
    marginBottom: 12,
  },
  domainCardLocked: {
    borderColor: "rgba(239, 68, 68, 0.22)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  domainTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  domainSlug: {
    color: C.ink4,
    fontSize: 11,
    fontFamily: "monospace",
    marginTop: 2,
  },
  domainDesc: {
    color: C.ink3,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },
  footerPills: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  enterChevron: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "500",
  },
  cardKillSwitchWrap: {
    marginTop: 10,
  },
  detailNav: {
    marginBottom: 16,
  },
  heroCard: {
    marginBottom: 16,
  },
  heroTitle: {
    color: C.ink,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  heroSub: {
    color: C.ink4,
    fontSize: 12,
    fontFamily: "monospace",
    marginTop: 2,
  },
  heroDesc: {
    color: C.ink2,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  metaRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },
  metaChip: {
    flex: 1,
  },
  metaChipLabel: {
    color: C.ink4,
    fontSize: 10,
  },
  metaChipValue: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  sectionBlock: {
    marginBottom: 20,
  },
  sectionHeaderMargin: {
    marginBottom: 10,
  },
  sectionHint: {
    color: C.ink4,
    fontSize: 11,
  },
  killSwitchContainer: {
    backgroundColor: "rgba(239, 68, 68, 0.04)",
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  killNotice: {
    marginBottom: 8,
  },
  killNoticeTitle: {
    color: C.err,
    fontSize: 13,
    fontWeight: "600",
  },
  killNoticeDesc: {
    color: C.ink3,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  lockedNoticeCard: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderColor: "rgba(239, 68, 68, 0.28)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  lockedNoticeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  lockedNoticeTitle: {
    color: C.err,
    fontSize: 13,
    fontWeight: "600",
  },
  lockedNoticeDesc: {
    color: C.ink3,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    marginBottom: 12,
  },
  unlockBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  unlockBtnText: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "500",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    width: "48%",
  },
  cardList: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
  },
  subItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  subItemKey: {
    color: C.ink2,
    fontSize: 12,
  },
  nodeItem: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  nodeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  nodeLabel: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "500",
  },
  nodeKey: {
    color: C.ink4,
    fontSize: 11,
    fontFamily: "monospace",
    marginTop: 2,
  },
  edgeItem: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  edgeKey: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "500",
  },
  edgeEndpoints: {
    color: C.ink4,
    fontSize: 11,
    fontFamily: "monospace",
    marginTop: 2,
  },

  // ── 关系图谱 (graph view) ──
  graphNavTitle: {
    color: C.ink3,
    fontSize: 13,
    textAlign: "right",
    flexShrink: 1,
  },
  graphEntryBtn: {
    gap: 10,
    borderColor: C.line,
  },
  graphEntryLeft: { flex: 1 },
  graphEntryTitle: { color: C.ink, fontSize: 15, fontWeight: "600" },
  graphEntrySub: { color: C.ink3, fontSize: 12, marginTop: 3 },
  graphEntryArrow: { color: C.ink4, fontSize: 22 },
  graphCanvasCard: {
    marginTop: 12,
  },
  graphCanvasHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  graphCanvasTitle: { color: C.ink, fontSize: 15, fontWeight: "600" },
  graphCanvasSub: { color: C.ink3, fontSize: 11, marginTop: 2 },
  graphLegend: { flexDirection: "row", alignItems: "center", gap: 4 },
  graphLegendDot: { width: 8, height: 8, borderRadius: 4 },
  graphLegendText: { color: C.ink3, fontSize: 11 },
  graphCanvas: { position: "relative" },
  graphEdgeLine: {
    position: "absolute",
    height: 1,
  },
  graphNodeCircle: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  graphNodeCircleText: { color: C.ink2, fontSize: 10 },
  graphNodeCountText: { color: C.ink4, fontSize: 9 },
  schemaCard: {
    marginTop: 12,
  },
  schemaCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  schemaTitleRow: { flexDirection: "row", alignItems: "center" },
  schemaCardTitle: { color: C.ink, fontSize: 14, fontWeight: "600" },
  schemaSectionTitle: { color: C.ink3, fontSize: 12, marginTop: 12, marginBottom: 8 },
  schemaEmptyText: { color: C.ink4, fontSize: 12 },
  schemaPropsList: { gap: 6 },
  schemaPropRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.panel,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  schemaPropKey: { color: C.ink2, fontSize: 12, fontWeight: "600", flex: 1 },
  schemaPropType: { color: C.ink4, fontSize: 11 },
});
