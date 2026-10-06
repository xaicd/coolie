import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Company, OntologyDomain, OntologyGraphResponse } from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { StatusDot } from "../components/StatusDot";
import { EmergencyKillSwitch } from "../components/EmergencyKillSwitch";
import { OntologyGraphView } from "../components/OntologyGraphView";
import type {
  OntologyEntityType,
  OntologyGraphData,
  OntologyGraphEdge,
  OntologyGraphNode,
} from "../components/OntologyGraphView";
import { AppCard } from "../ui/AppCard";
import { RADIUS } from "../ui/tokens";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { Pill } from "../ui/Pill";
import { ScreenHeader } from "../ui/ScreenHeader";
import { SectionHeader } from "../ui/SectionHeader";
import { StatusBadge } from "../ui/StatusBadge";

interface OntologyDomainListScreenProps {
  company: Company;
  whoami?: string;
  onOpenWebOntology?: () => void;
  onOpenSchemaEditor?: (typeId: string, displayName: string) => void;
  onOpenWorkbench?: () => void;
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
    bg: C.lineSubtle,
    border: C.line,
  },
};

// 图谱组件类型表仅覆盖控制面 9 类实体 (wave330)。wave337 起图谱走控制面
// /ontology/graph, 节点自带 type 字符串; 防御性读取: 命中 9 类才采纳,
// 否则 fallback work_product (真实类型语义仍保留在 label 与 metadata)
const CONTROL_PLANE_ENTITY_TYPES: readonly OntologyEntityType[] = [
  "project",
  "issue",
  "agent",
  "spec",
  "conversation",
  "work_product",
  "attachment",
  "comment",
  "company",
];

function toControlPlaneEntityType(type: string): OntologyEntityType {
  return (CONTROL_PLANE_ENTITY_TYPES as readonly string[]).includes(type)
    ? (type as OntologyEntityType)
    : "work_product";
}

/**
 * wave351 真精简 (老板批: 按 Palantir FDE 视角删回极简)。wave350 的
 * 5 组 SegmentedControl + 组内 14 视图 chips + 域锚定横滑 + 12 只读视图
 * (sandBox/schema/datasets/transforms/cognition/capabilities/actions/
 * functions/interfaces/manage/table 等) 与快照统计装饰层全部拆除。
 * 本屏收敛为两件事 ——
 *   第一层: 业务本体域卡片列表 (listOntologyDomains), 唯一写入口 右上 新建;
 *   第二层: 点域卡自动进图谱 (OntologyGraphView, 控制面图谱取数) +
 *           高危安全闸门 (EmergencyKillSwitch / 解锁恢复)。
 */
export function OntologyDomainListScreen({
  company,
  whoami = "管理员",
}: OntologyDomainListScreenProps) {
  const [domains, setDomains] = useState<OntologyDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seedingSample, setSeedingSample] = useState(false);

  // 第二层: 选中域 → 自动展示图谱
  const [selectedDomain, setSelectedDomain] = useState<OntologyDomain | null>(null);
  const [graphSnapshot, setGraphSnapshot] = useState<OntologyGraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [domainStats, setDomainStats] = useState<
    Record<string, { nodes: number; edges: number }>
  >({});

  // 新建本体域弹层状态 (wave344: 收敛为 web 端 create-domain 同款三字段)
  const [newDomainModalOpen, setNewDomainModalOpen] = useState(false);
  const [newDomainDisplayName, setNewDomainDisplayName] = useState("");
  const [newDomainSlug, setNewDomainSlug] = useState("");
  const [newDomainDescription, setNewDomainDescription] = useState("");
  const [creatingDomain, setCreatingDomain] = useState(false);

  const companyId = company.id;

  const loadDomains = useCallback(async () => {
    setError(null);
    try {
      // wave344: 真实控制面 API + 网络抖动自动重试 1 次, 两次都失败才落错误态
      let list: OntologyDomain[];
      try {
        list = await coolie.listOntologyDomains(companyId);
      } catch {
        list = await coolie.listOntologyDomains(companyId);
      }
      setDomains(list);

      // 异步预拉取前几个域的简要计数 (卡片 节点/关系 Pill 数据)
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

  // 拉取控制面图谱 (wave337: 与 web 端 ontologyGraphApi.graph 同一端点,
  // 返回 root/depth/view/truncated/nodes/edges)。wave339 修 rootId 不匹配:
  // 服务端按 (type=project, 业务行 id) 拼根键 BFS, 域 id (ontology_domains)
  // 与 project id 不在同一 id 空间, 直接拿域 id 当 rootId 只会得到空图。
  // 先经 listOntologyInstances (entityType=project; 该接口按 company 圈定)
  // 换出真实 project 实例 id 再锚定; 公司没有任何 project 实例时直接置空态,
  // 不发 graph 请求。
  const loadGraph = useCallback(async () => {
    setGraphLoading(true);
    setGraphError(null);
    try {
      const { instances } = await coolie.listOntologyInstances(companyId, {
        entityType: "project",
        limit: 1,
      });
      const rootId = instances[0]?.id;
      if (!rootId) {
        setGraphSnapshot(null);
        return;
      }
      const snap = await coolie.getOntologyGraph(companyId, {
        rootType: "project",
        rootId,
        view: "project_tree",
        depth: 2,
      });
      setGraphSnapshot(snap);
    } catch (e) {
      setGraphError(String((e as Error)?.message ?? e));
    } finally {
      setGraphLoading(false);
    }
  }, [companyId]);

  // 进第二层时自动拉图谱, 返回列表后再进另一域则重拉
  useEffect(() => {
    if (selectedDomain) void loadGraph();
  }, [selectedDomain, loadGraph]);

  // 控制面图谱响应 → 图谱组件。wave337: 响应节点自带 type/key, 边直接引用
  // 节点 key; key 仍按 9 类映射后的 `${type}:${id}` 重算, 保证与 rootKey
  // 查找一致 (未知类型 fallback work_product 时服务端 key 会漂移)。
  // 截断/深度透传给组件, root 用服务端根 (project 节点), 不再取首节点。
  const graphData: OntologyGraphData | null = useMemo(() => {
    if (!graphSnapshot) return null;
    const nodes: OntologyGraphNode[] = graphSnapshot.nodes.map((n) => {
      const type = toControlPlaneEntityType(n.type);
      return {
        key: `${type}:${n.id}`,
        id: n.id,
        type,
        label: n.label,
        metadata: { ...(n.metadata ?? {}) },
      };
    });
    const keySet = new Set(nodes.map((n) => n.key));
    const edges: OntologyGraphEdge[] = [];
    for (const e of graphSnapshot.edges) {
      // truncated 截断或类型 fallback 后悬空的半边直接丢弃, 不渲染断线
      if (!keySet.has(e.source) || !keySet.has(e.target) || e.source === e.target) {
        continue;
      }
      edges.push({ key: e.key, source: e.source, target: e.target, weight: e.weight });
    }
    const root = graphSnapshot.root
      ? { type: toControlPlaneEntityType(graphSnapshot.root.type), id: graphSnapshot.root.id }
      : undefined;
    return {
      nodes,
      edges,
      root,
      depth: graphSnapshot.depth,
      truncated: graphSnapshot.truncated,
    };
  }, [graphSnapshot]);

  // 新建本体域: 与 web 端 create-domain 完全一致的三字段契约
  const handleCreateDomain = useCallback(async () => {
    const displayName = newDomainDisplayName.trim();
    const slug = newDomainSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    if (!displayName || !slug) return;
    setCreatingDomain(true);
    try {
      const created = await coolie.createOntologyDomain(companyId, {
        displayName,
        slug,
        description: newDomainDescription.trim() || undefined,
      });
      setNewDomainModalOpen(false);
      setNewDomainDisplayName("");
      setNewDomainSlug("");
      setNewDomainDescription("");
      await loadDomains();
      Alert.alert(
        "创建成功",
        `业务本体域「${created.display_name || created.displayName || created.slug}」已创建`,
      );
    } catch (e) {
      Alert.alert("创建失败", String((e as Error)?.message ?? e));
    } finally {
      setCreatingDomain(false);
    }
  }, [companyId, newDomainDisplayName, newDomainSlug, newDomainDescription, loadDomains]);

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
        await coolie.setDomainLifecycle(companyId, domain.id, "locked", {
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

  // ── 第二层: 域图谱详情 (选域后自动展示图谱 + 高危安全闸门) ──
  if (selectedDomain) {
    const isLocked =
      selectedDomain.lifecycle_state === "archived" ||
      selectedDomain.lifecycle_state === "deprecated" ||
      selectedDomain.lifecycle_state === "locked";
    const cfg =
      LIFECYCLE_CONFIG[selectedDomain.lifecycle_state] || LIFECYCLE_CONFIG.draft;

    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.detailScrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={graphLoading}
              onRefresh={() => void loadGraph()}
              tintColor={C.accent}
            />
          }
        >
          {/* 顶部返回条: 域名 + 生命周期徽标 */}
          <ScreenHeader
            onBack={() => setSelectedDomain(null)}
            backLabel="返回"
            title={
              selectedDomain.display_name || selectedDomain.displayName || selectedDomain.slug
            }
            subtitle={<Text style={styles.detailSlug}>标识: {selectedDomain.slug}</Text>}
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

          {/* 本体图谱 (选域自动展示, 下拉刷新重拉) */}
          <OntologyGraphView
            graph={graphData}
            loading={graphLoading}
            error={graphError}
          />

          {/* 计数摘要: 与图谱同源 (控制面响应无 counts, 就地派生) */}
          <View style={styles.graphCountsRow}>
            <Text style={styles.graphCountsText}>
              节点 {graphSnapshot?.nodes.length ?? "--"} · 关系{" "}
              {graphSnapshot?.edges.length ?? "--"} · 类型{" "}
              {graphSnapshot
                ? new Set(graphSnapshot.nodes.map((n) => n.type)).size
                : "--"}
              {graphSnapshot?.truncated ? " · 已截断" : ""}
            </Text>
          </View>

          {/* 高危熔断控制闸门区 */}
          <View style={styles.sectionBlock}>
            <SectionHeader
              emphasis
              title="高危安全闸门"
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
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── 第一层: 业务本体域列表 (唯一写入口 右上 新建) ──
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        {/* 紧凑操作行: 外层资产页已有标题, 这里只保留 刷新 + 新建。 */}
        <View style={styles.listActionBar}>
          <View style={{ flex: 1 }} />
          <View style={styles.listActionBarBtns}>
            <Pressable
              onPress={onRefresh}
              hitSlop={8}
              style={styles.iconActionBtn}
              accessibilityLabel="刷新本体域列表"
              testID="OntologyDomainList__ActionBar__Refresh"
            >
              <Ionicons name="refresh-outline" size={16} color={C.ink3} />
            </Pressable>
            <Pressable
              onPress={() => setNewDomainModalOpen(true)}
              hitSlop={8}
              style={styles.newDomainBtn}
              accessibilityLabel="新建本体域"
              testID="OntologyDomainList__ActionBar__Create"
            >
              <Ionicons name="add" size={15} color={C.ink} />
              <Text style={styles.newDomainBtnText} numberOfLines={1}>
                新建
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {loading ? (
        <LoadingState text="正在加载业务本体域拓扑…" />
      ) : error ? (
        <ErrorRetry message={error} onRetry={loadDomains} />
      ) : domains.length === 0 ? (
        <EmptyState
          variant="standalone"
          icon="🌐"
          title="暂无业务本体域"
          subtitle="当前工坊尚未初始化任何业务本体。您可以一键注入官方示例本体域。"
          action={
            <Pressable
              style={[styles.refreshBtn, styles.seedBtn, { marginTop: 12 }]}
              disabled={seedingSample}
              onPress={() => void handleSeedSample()}
            >
              {seedingSample ? (
                <ActivityIndicator size="small" color={C.accent} />
              ) : (
                <Text style={styles.seedBtnText}>注入示例域</Text>
              )}
            </Pressable>
          }
        />
      ) : (
        <FlatList
          data={domains}
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
                onPress={() => setSelectedDomain(item)}
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

                  <Text style={styles.enterChevron}>图谱 ›</Text>
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

      {/* 新建本体域弹层 (wave344: 与 web 端 create-domain 同款三字段) */}
      <Modal
        visible={newDomainModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNewDomainModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setNewDomainModalOpen(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>新建业务本体</Text>
              <Pressable
                onPress={() => setNewDomainModalOpen(false)}
                hitSlop={8}
                testID="OntologyDomainList__CreateModal__Close"
              >
                <Ionicons name="close" size={20} color={C.ink3} />
              </Pressable>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>显示名称 *</Text>
              <TextInput
                style={styles.input}
                placeholder="如：订单核心系统、电商交易域"
                placeholderTextColor={C.ink4}
                value={newDomainDisplayName}
                onChangeText={(val) => {
                  setNewDomainDisplayName(val);
                  if (!newDomainSlug) {
                    setNewDomainSlug(val.toLowerCase().replace(/[^a-z0-9_-]/g, "_"));
                  }
                }}
                testID="OntologyDomainList__CreateModal__DisplayNameInput"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>标识 (Slug) *</Text>
              <TextInput
                style={styles.input}
                placeholder="如：orders, trade_center"
                placeholderTextColor={C.ink4}
                value={newDomainSlug}
                onChangeText={setNewDomainSlug}
                autoCapitalize="none"
                testID="OntologyDomainList__CreateModal__SlugInput"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>业务描述 (可选)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="例：涵盖账户、交易订单、履约配送三类实体模型与关系"
                placeholderTextColor={C.ink4}
                value={newDomainDescription}
                onChangeText={setNewDomainDescription}
                multiline
                numberOfLines={3}
                testID="OntologyDomainList__CreateModal__DescriptionInput"
              />
            </View>

            <View style={styles.modalFooter}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setNewDomainModalOpen(false)}
                testID="OntologyDomainList__CreateModal__Cancel"
              >
                <Text style={styles.cancelBtnText}>取消</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmBtn,
                  (!newDomainDisplayName.trim() || !newDomainSlug.trim() || creatingDomain) &&
                    styles.btnDisabled,
                ]}
                disabled={
                  !newDomainDisplayName.trim() || !newDomainSlug.trim() || creatingDomain
                }
                onPress={() => void handleCreateDomain()}
                testID="OntologyDomainList__CreateModal__Submit"
              >
                {creatingDomain ? (
                  <ActivityIndicator size="small" color={C.ink} />
                ) : (
                  <Text style={styles.confirmBtnText}>创建</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  refreshBtn: {
    backgroundColor: C.lineSubtle,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  listActionBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  listActionBarBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  newDomainBtn: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
    backgroundColor: C.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    flexShrink: 0,
  },
  newDomainBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: C.ink,
  },
  detailScrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  detailNav: {
    marginBottom: 16,
  },
  detailSlug: {
    color: C.ink4,
    fontSize: 11,
    fontFamily: "monospace",
    marginTop: 2,
  },
  graphCountsRow: {
    marginTop: 10,
    alignItems: "center",
  },
  graphCountsText: {
    color: C.ink4,
    fontSize: 11,
  },
  seedBtn: {
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    borderColor: "rgba(94, 106, 210, 0.35)",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  seedBtnText: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "500",
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
  sectionBlock: {
    marginBottom: 20,
  },
  sectionHeaderMargin: {
    marginBottom: 10,
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
    backgroundColor: C.lineSubtle,
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

  // ── 新建本体域弹层 (Modal) ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: C.surface,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
    marginBottom: 14,
  },
  modalTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 6,
  },
  input: {
    backgroundColor: C.panel,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: C.ink,
    fontSize: 13,
  },
  textArea: {
    height: 64,
    textAlignVertical: "top",
    paddingTop: 8,
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },
  cancelBtn: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    color: C.ink3,
    fontSize: 13,
    fontWeight: "500",
  },
  confirmBtn: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 96,
  },
  confirmBtnText: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
