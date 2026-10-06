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
import type {
  Company,
  OntologyDomain,
  OntologyGraphResponse,
  OntologyGraphSnapshot,
} from "@coolie/api-client";
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
import { SegmentedControl } from "../ui/SegmentedControl";
import { StatTile } from "../ui/StatTile";
import { StatusBadge } from "../ui/StatusBadge";
import { ActionsView } from "../components/ontology/ActionsView";
import { CapabilitiesView } from "../components/ontology/CapabilitiesView";
import { CognitionView } from "../components/ontology/CognitionView";
import { ConnectorsView } from "../components/ontology/ConnectorsView";
import { DatasetsView } from "../components/ontology/DatasetsView";
import { FunctionsView } from "../components/ontology/FunctionsView";
import { InterfacesView } from "../components/ontology/InterfacesView";
import { ManageView } from "../components/ontology/ManageView";
import { SandboxView } from "../components/ontology/SandboxView";
import { SchemaView } from "../components/ontology/SchemaView";
import { TableView } from "../components/ontology/TableView";
import { TransformsView } from "../components/ontology/TransformsView";

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
 * wave350 本体工作台 14 视图 —— 对齐 web 端 plugin-ontology 的
 * WorkbenchView 枚举 (app.tsx)。web 枚举中的 dialogue (对话) 不搬:
 * App 工坊 tab 已承载会话流, 重复入口违反极简使用主义。
 */
export type OntologyWorkbenchView =
  | "graph"
  | "sandbox"
  | "domains"
  | "table"
  | "schema"
  | "datasets"
  | "connectors"
  | "transforms"
  | "cognition"
  | "capabilities"
  | "actions"
  | "functions"
  | "interfaces"
  | "manage";

type WorkbenchGroupId = "overview" | "structure" | "data" | "assets" | "ops";

/**
 * wave350 老板拍 A 分组: 5 组 × 14 视图 (总览 3 + 结构 2 + 数据 3 +
 * 资产 2 + 运维 4), 视图 label 与 web 端一致, 组名两字铁律。
 */
const WORKBENCH_GROUPS: {
  id: WorkbenchGroupId;
  label: string;
  views: { id: OntologyWorkbenchView; label: string }[];
}[] = [
  {
    id: "overview",
    label: "总览",
    views: [
      { id: "graph", label: "图谱" },
      { id: "sandbox", label: "驾驶" },
      { id: "domains", label: "本体域" },
    ],
  },
  {
    id: "structure",
    label: "结构",
    views: [
      { id: "table", label: "表格" },
      { id: "schema", label: "结构" },
    ],
  },
  {
    id: "data",
    label: "数据",
    views: [
      { id: "datasets", label: "数据集" },
      { id: "connectors", label: "连接器" },
      { id: "transforms", label: "转换" },
    ],
  },
  {
    id: "assets",
    label: "资产",
    views: [
      { id: "cognition", label: "认知" },
      { id: "capabilities", label: "能力" },
    ],
  },
  {
    id: "ops",
    label: "运维",
    views: [
      { id: "actions", label: "动作" },
      { id: "functions", label: "函数" },
      { id: "interfaces", label: "接口" },
      { id: "manage", label: "治理" },
    ],
  },
];

/** 需要锚定本体域的视图 (其余走公司级数据) */
const DOMAIN_SCOPED_VIEWS = new Set<OntologyWorkbenchView>([
  "graph",
  "sandbox",
  "schema",
  "datasets",
  "connectors",
  "transforms",
  "actions",
  "functions",
  "interfaces",
]);

/**
 * wave350 本体域工作台: wave342 的 14 视图被 v0.6.43 发版提交误回退后,
 * 老板拍 A 重新接线 —— 列表层升级为 5 组 × 14 视图 (分组按 wave350 调整:
 * 总览/结构/数据/资产/运维), 复用 wave342 已沉淀的 components/ontology/
 * 12 只读视图 + useOntologyRows 取数壳; 域锚定 chips 联动所有域级视图
 * 自动重拉。唯二保留本屏内渲染的视图: graph (OntologyGraphView + 控制面
 * 图谱取数) 与 domains (本体域卡片列表, 点击进快照详情层)。唯一写入口
 * 仍是右上 '新建' (与 web 端 create-domain 同款三字段)。
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

  // 14 视图工作台 (wave350 重接线, 默认图谱, 与 web 端 WorkbenchView 对齐)
  const [view, setView] = useState<OntologyWorkbenchView>("graph");
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [graphSnapshot, setGraphSnapshot] = useState<OntologyGraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);

  // 新建本体域弹层状态 (wave344: 收敛为 web 端 create-domain 同款三字段)
  const [newDomainModalOpen, setNewDomainModalOpen] = useState(false);
  const [newDomainDisplayName, setNewDomainDisplayName] = useState("");
  const [newDomainSlug, setNewDomainSlug] = useState("");
  const [newDomainDescription, setNewDomainDescription] = useState("");
  const [creatingDomain, setCreatingDomain] = useState(false);

  // 域快照详情
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

  // 域级视图锚定: 默认取第一个本体域, 选中域被删后自动回落
  useEffect(() => {
    if (domains.length === 0) return;
    if (selectedDomainId && domains.some((d) => d.id === selectedDomainId)) return;
    setSelectedDomainId(domains[0]!.id);
  }, [domains, selectedDomainId]);

  // 拉取控制面图谱 (wave337: 与 web 端 ontologyGraphApi.graph 同一端点,
  // 返回 root/depth/view/truncated/nodes/edges)。wave339 修 rootId 不匹配:
  // 服务端按 (type=project, 业务行 id) 拼根键 BFS, 域 id (ontology_domains)
  // 与 project id 不在同一 id 空间, 直接拿 selectedDomainId 当 rootId 只会
  // 得到空图。先经 listOntologyInstances (entityType=project; 该接口按
  // company 圈定, 无域过滤参数) 换出真实 project 实例 id 再锚定; 公司没有
  // 任何 project 实例时直接置空态, 不发 graph 请求。
  const loadGraph = useCallback(async () => {
    if (!selectedDomainId) return;
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
  }, [companyId, selectedDomainId]);

  // 仅图谱视图且已锚定域时拉取, 其余视图不发冗余请求
  useEffect(() => {
    if (view === "graph" && selectedDomainId) void loadGraph();
  }, [view, selectedDomainId, loadGraph]);

  // 当前视图所属的组 (驱动第二行视图 chips)
  const activeGroup = useMemo(
    () =>
      WORKBENCH_GROUPS.find((g) => g.views.some((v) => v.id === view))?.id ?? "overview",
    [view],
  );

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

  // 打开域快照详情
  const openDomainDetail = useCallback(
    async (domain: OntologyDomain) => {
      setSelectedDomain(domain);
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
            onBack={() => setSelectedDomain(null)}
            backLabel="返回"
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

  // wave350 只读视图路由: 公司级视图直通; 域级视图需已锚定域 (未锚定回落
  // 到下方 加载/空态/列表 链)。graph / domains 两视图保留本屏专属渲染。
  const renderReadonlyView = () => {
    if (view === "table") return <TableView companyId={companyId} />;
    if (view === "cognition") return <CognitionView companyId={companyId} />;
    if (view === "capabilities") return <CapabilitiesView companyId={companyId} />;
    if (view === "manage") return <ManageView companyId={companyId} />;
    if (!selectedDomainId) return null;
    switch (view) {
      case "sandbox":
        return <SandboxView companyId={companyId} domainId={selectedDomainId} />;
      case "schema":
        return <SchemaView companyId={companyId} domainId={selectedDomainId} />;
      case "datasets":
        return <DatasetsView companyId={companyId} domainId={selectedDomainId} />;
      case "connectors":
        return <ConnectorsView companyId={companyId} domainId={selectedDomainId} />;
      case "transforms":
        return <TransformsView companyId={companyId} domainId={selectedDomainId} />;
      case "actions":
        return <ActionsView companyId={companyId} domainId={selectedDomainId} />;
      case "functions":
        return <FunctionsView companyId={companyId} domainId={selectedDomainId} />;
      case "interfaces":
        return <InterfacesView companyId={companyId} domainId={selectedDomainId} />;
      default:
        return null;
    }
  };
  const readonlyView = renderReadonlyView();

  // 第一层: 5 组 × 14 视图本体工作台 (wave350, 列表被替换为工作台;
  // domains 视图即本体域卡片列表, 点击卡片进第二层快照详情)
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

        {/* 5 视图组切换 (wave350 分组, 组名两字铁律) */}
        <SegmentedControl
          value={activeGroup}
          onChange={(key) => {
            const group = WORKBENCH_GROUPS.find((g) => g.id === key);
            const first = group?.views[0];
            if (first) setView(first.id);
          }}
          options={WORKBENCH_GROUPS.map((g) => ({ key: g.id, label: g.label }))}
          style={styles.viewSwitcher}
        />

        {/* 组内视图 chips: 14 视图逐个直达 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.viewChipRow}
        >
          {(WORKBENCH_GROUPS.find((g) => g.id === activeGroup)?.views ?? []).map((v) => {
            const active = v.id === view;
            return (
              <Pressable
                key={v.id}
                style={[styles.viewChip, active && styles.viewChipActive]}
                onPress={() => setView(v.id)}
                hitSlop={4}
                testID={`OntologyWorkbench__ViewChip__${v.id}`}
                accessibilityLabel={`切换到${v.label}视图`}
              >
                <Text style={[styles.viewChipText, active && styles.viewChipTextActive]}>
                  {v.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* 域锚定 chips: 仅域级视图显示, 切换域后所有域级视图自动重拉数据 */}
        {DOMAIN_SCOPED_VIEWS.has(view) && domains.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.domainChipRowHeader}
          >
            {domains.map((d) => {
              const active = d.id === selectedDomainId;
              return (
                <Pressable
                  key={d.id}
                  style={[styles.domainChip, active && styles.domainChipActive]}
                  onPress={() => setSelectedDomainId(d.id)}
                  hitSlop={4}
                  testID={`OntologyWorkbench__DomainChip__${d.slug}`}
                  accessibilityLabel={`切换本体域 ${d.display_name || d.slug}`}
                >
                  <Text
                    style={[styles.domainChipText, active && styles.domainChipTextActive]}
                    numberOfLines={1}
                  >
                    {d.display_name || d.displayName || d.slug}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {view === "graph" && domains.length > 0 && selectedDomainId ? (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.graphScrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                onRefresh();
                void loadGraph();
              }}
              tintColor={C.accent}
            />
          }
        >
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
        </ScrollView>
      ) : readonlyView ? (
        readonlyView
      ) : loading ? (
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
  refreshBtn: {
    backgroundColor: C.lineSubtle,
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
  listActionBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
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
  viewSwitcher: {
    marginTop: 12,
  },
  viewChipRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  viewChip: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.sm,
    backgroundColor: C.panel,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  viewChipActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
  },
  viewChipText: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  viewChipTextActive: {
    color: C.accent,
    fontWeight: "600",
  },
  domainChipRowHeader: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  domainChip: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.sm,
    backgroundColor: C.panel,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  domainChipActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
  },
  domainChipText: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  domainChipTextActive: {
    color: C.accent,
    fontWeight: "600",
  },
  graphScrollContent: {
    padding: 16,
    paddingBottom: 40,
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
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    width: "48%",
  },
  cardList: {
    backgroundColor: C.lineSubtle,
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
