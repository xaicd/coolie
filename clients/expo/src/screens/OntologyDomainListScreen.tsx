import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  useWindowDimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as DocumentPicker from "expo-document-picker";
import type {
  Company,
  OntologyDomain,
  OntologyDomainLifecycleState,
  OntologyGraphResponse,
  OntologyGraphResponseNode,
  OntologyGraphSnapshot,
  OntologyInstanceRow,
  OntologyLevelsResponse,
  OntologyPropertiesResponse,
} from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { OntologyGraphCanvas } from "../components/OntologyGraphCanvas";
import { EmergencyKillSwitch } from "../components/EmergencyKillSwitch";
import { StatusDot } from "../components/StatusDot";
import { AppCard } from "../ui/AppCard";
import { RADIUS } from "../ui/tokens";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { Pill } from "../ui/Pill";
import { SectionHeader } from "../ui/SectionHeader";
import { SegmentedControl } from "../ui/SegmentedControl";

// wave353 — 老板拍: 参考 15 天前的完整本体控制台 pattern + 加图谱。
// 顶部 SegmentedControl 列表/图谱 切换: 图谱档直接内嵌 wave347 恢复的
// OntologyGraphCanvas (RN 原生力导向图谱组件), 列表档恢复 15 天前全部
// 功能面: 业务域列表 (生命周期徽标 + 快照计数) + 域卡片快速熔断 +
// 域详情抽屉 (快照摘要/类型分布/高危熔断闸门) + 域解锁恢复 + 创建
// modal + 实体分类/实例列表/实例详情 + 搜索 + 示例域注入。
// (wave352 曾把图谱档嵌整个 OntologyGraphWorkbenchScreen — 全屏工作台
// 保留独立入口不变, 本屏改嵌轻量 Canvas 组件本体。)
interface OntologyDomainListScreenProps {
  company: Company;
  whoami?: string;
  onOpenWebOntology?: () => void;
  onOpenSchemaEditor?: (typeId: string, displayName: string) => void;
}

interface EntityCategoryConfig {
  entityType: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  desc: string;
  color: string;
}

const ENTITY_CATEGORIES: EntityCategoryConfig[] = [
  {
    entityType: "project",
    label: "业务项目",
    icon: "folder-outline",
    desc: "核心业务微服务与研发工程",
    color: "#5E6AD2",
  },
  {
    entityType: "issue",
    label: "任务工单",
    icon: "list-outline",
    desc: "正在流转与协同处理的业务任务",
    color: "#39A275",
  },
  {
    entityType: "work_product",
    label: "交付产物",
    icon: "cube-outline",
    desc: "各阶段产出的交付物与技术工件",
    color: "#E0A030",
  },
  {
    entityType: "agent",
    label: "数字员工",
    icon: "people-outline",
    desc: "参与研发、运维与管理的智能体角色",
    color: "#7A6FD6",
  },
  {
    entityType: "spec",
    label: "系统规范",
    icon: "document-text-outline",
    desc: "业务需求、系统设计与验收规范",
    color: "#4FA1D9",
  },
  {
    entityType: "conversation",
    label: "工坊会话",
    icon: "chatbubbles-outline",
    desc: "工坊会话与多智能体协同记录",
    color: "#C95757",
  },
];

/** 生命周期徽标配色 (15 天前 pattern, StatusDot ok/err/idle 三态) */
const LIFECYCLE_CONFIG: Record<
  string,
  { label: string; status: "ok" | "err" | "idle"; color: string; bg: string; border: string }
> = {
  active: {
    label: "运行中",
    status: "ok",
    color: C.ok,
    bg: "rgba(39, 166, 68, 0.10)",
    border: "rgba(39, 166, 68, 0.25)",
  },
  archived: {
    label: "已锁定",
    status: "err",
    color: C.err,
    bg: "rgba(239, 68, 68, 0.10)",
    border: "rgba(239, 68, 68, 0.28)",
  },
  locked: {
    label: "已锁定",
    status: "err",
    color: C.err,
    bg: "rgba(239, 68, 68, 0.10)",
    border: "rgba(239, 68, 68, 0.28)",
  },
  deprecated: {
    label: "弃用锁死",
    status: "idle",
    color: C.warn,
    bg: "rgba(245, 158, 11, 0.10)",
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

/** 顶部图谱档: 与工作台「项目主线」同一取数 (project_tree, depth 2) */
const GRAPH_VIEW = "project_tree";
const GRAPH_DEPTH = 2;
/** 内嵌图谱渲染节点上限 — 超出截断并提示 (Canvas 契约: 截断提示由父层负责) */
const NODE_DISPLAY_CAP = 120;
/** 列表档域卡片计数预取上限 (15 天前 pattern: 前 5 域) */
const PREFETCH_DOMAIN_LIMIT = 5;
/** 域详情抽屉快照节点上限 (15 天前 pattern) */
const DETAIL_NODE_LIMIT = 300;

function domainLabel(domain: OntologyDomain): string {
  return domain.display_name || domain.displayName || domain.slug;
}

/** archived / deprecated / locked 三个只读锁死状态都算「已锁定」 */
function isLockedDomain(domain: OntologyDomain): boolean {
  return (
    domain.lifecycle_state === "archived" ||
    domain.lifecycle_state === "deprecated" ||
    domain.lifecycle_state === "locked"
  );
}

export function OntologyDomainListScreen({
  company,
  whoami = "管理员",
  onOpenWebOntology,
  onOpenSchemaEditor,
}: OntologyDomainListScreenProps) {
  // ── 顶部主视图切换: 图谱 (默认) vs 列表 ──
  const [viewMode, setViewMode] = useState<"graph" | "list">("graph");

  // ── 图谱档: OntologyGraphCanvas 直连数据 ──
  const [graphData, setGraphData] = useState<OntologyGraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(true);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [selectedGraphKey, setSelectedGraphKey] = useState<string | null>(null);

  // ── 列表档: 域清单 + 快照计数 ──
  const [domains, setDomains] = useState<OntologyDomain[]>([]);
  const [domainStats, setDomainStats] = useState<Record<string, { nodes: number; edges: number }>>({});
  const [selectedDomain, setSelectedDomain] = useState<OntologyDomain | null>(null);
  const [snapshot, setSnapshot] = useState<OntologyGraphSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // ── 业务实体状态: 选中的类型与实例 ──
  const [selectedEntityType, setSelectedEntityType] = useState<EntityCategoryConfig | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<OntologyInstanceRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [levels, setLevels] = useState<OntologyLevelsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 域 CRUD modal ──
  const [newDomainModalOpen, setNewDomainModalOpen] = useState(false);
  const [newDomainMode, setNewDomainMode] = useState<"directory" | "manual">("directory");
  const [newDomainDisplayName, setNewDomainDisplayName] = useState("");
  const [newDomainSlug, setNewDomainSlug] = useState("");
  const [newDomainDescription, setNewDomainDescription] = useState("");
  const [newDomainDirectoryPath, setNewDomainDirectoryPath] = useState("");
  const [creatingDomain, setCreatingDomain] = useState(false);
  const [seedingSample, setSeedingSample] = useState(false);

  // ── 实例与属性 ──
  const [instances, setInstances] = useState<OntologyInstanceRow[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [typeProperties, setTypeProperties] = useState<OntologyPropertiesResponse | null>(null);
  const [typePropertiesLoading, setTypePropertiesLoading] = useState(false);

  const companyId = company.id;
  const { width: windowWidth } = useWindowDimensions();
  /** 方形画布: 屏宽去边距, 大屏封顶 */
  const canvasSize = Math.min(windowWidth - 32, 560);

  // 预取代际号: 旧一轮预取回来时不再写回, 防止覆盖新一轮结果
  const statsGenRef = useRef(0);

  const loadLevelsAndDomains = useCallback(async () => {
    setError(null);
    try {
      const [levelsRes, domainsRes] = await Promise.all([
        coolie.getOntologyLevels(companyId),
        coolie.listOntologyDomains(companyId),
      ]);
      setLevels(levelsRes);
      setDomains(domainsRes);

      // 前 5 域计数并发预取 (15 天前 pattern): 单域失败只丢它自己的计数,
      // 不阻塞首帧; 代际号挡住过期写回。
      const gen = ++statsGenRef.current;
      void Promise.all(
        domainsRes.slice(0, PREFETCH_DOMAIN_LIMIT).map(async (d) => {
          try {
            const snap = await coolie.getOntologySnapshot(companyId, d.id, 50);
            return [
              d.id,
              { nodes: snap?.counts?.nodes ?? 0, edges: snap?.counts?.edges ?? 0 },
            ] as const;
          } catch {
            return null;
          }
        }),
      ).then((rows) => {
        if (statsGenRef.current !== gen) return;
        setDomainStats((prev) => {
          const next = { ...prev };
          for (const row of rows) {
            if (row) next[row[0]] = row[1];
          }
          return next;
        });
      });
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadLevelsAndDomains();
  }, [loadLevelsAndDomains]);

  const loadGraph = useCallback(async () => {
    setGraphError(null);
    try {
      const res = await coolie.getOntologyGraph(companyId, {
        view: GRAPH_VIEW,
        depth: GRAPH_DEPTH,
      });
      setGraphData(res);
      setSelectedGraphKey(null);
    } catch (e) {
      setGraphError(String((e as Error)?.message ?? e));
      setGraphData(null);
    } finally {
      setGraphLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setGraphLoading(true);
    void loadGraph();
  }, [loadGraph]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all([
      loadLevelsAndDomains(),
      viewMode === "graph" ? loadGraph() : Promise.resolve(),
    ]).finally(() => setRefreshing(false));
  }, [loadLevelsAndDomains, loadGraph, viewMode]);

  // ── 域详情抽屉: 选中域时按需拉 300 条快照并回填卡片计数 ──
  const selectedDomainId = selectedDomain?.id ?? null;
  useEffect(() => {
    if (!selectedDomainId) {
      setSnapshot(null);
      return;
    }
    let cancelled = false;
    setSnapshot(null);
    setSnapshotLoading(true);
    void coolie
      .getOntologySnapshot(companyId, selectedDomainId, DETAIL_NODE_LIMIT)
      .then((snap) => {
        if (cancelled) return;
        setSnapshot(snap);
        if (snap?.counts) {
          setDomainStats((prev) => ({
            ...prev,
            [selectedDomainId]: {
              nodes: snap.counts.nodes ?? 0,
              edges: snap.counts.edges ?? 0,
            },
          }));
        }
      })
      .catch(() => {
        if (!cancelled) setSnapshot(null);
      })
      .finally(() => {
        if (!cancelled) setSnapshotLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDomainId, companyId]);

  // 生命周期就地更新: 列表卡片与抽屉同步改, 不等下一次全量刷新
  const patchDomainLifecycle = useCallback(
    (domainId: string, state: OntologyDomainLifecycleState) => {
      setDomains((prev) =>
        prev.map((d) => (d.id === domainId ? { ...d, lifecycle_state: state } : d)),
      );
      setSelectedDomain((prev) =>
        prev && prev.id === domainId ? { ...prev, lifecycle_state: state } : prev,
      );
    },
    [],
  );

  // 执行熔断 (失败抛给 EmergencyKillSwitch 自行提示)
  const triggerKillSwitch = useCallback(
    async (domain: OntologyDomain) => {
      await coolie.setDomainLifecycle(companyId, domain.id, "locked", {
        actor: whoami,
        reason: "移动端掌上紧急熔断 (EMERGENCY_LOCKED)",
        deviceInfo: "Coolie-Mobile-Expo",
      });
      patchDomainLifecycle(domain.id, "archived");
      Alert.alert(
        "🚨 紧急熔断生效",
        `本体域「${domainLabel(domain)}」已进入锁死状态 (ARCHIVED/LOCKED)。后续读写已即刻拦截，审计事件已写入 ontology_audit_logs。`,
      );
    },
    [companyId, whoami, patchDomainLifecycle],
  );

  // 解锁/恢复运行 (操作员二次确认)
  const unlockDomain = useCallback(
    (domain: OntologyDomain) => {
      Alert.alert(
        "解除安全锁定",
        `确认将本体域「${domainLabel(domain)}」恢复为运行中 (active) 状态吗？恢复后将允许 Agent 继续访问。`,
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
                patchDomainLifecycle(domain.id, "active");
                Alert.alert("已解除锁定", "本体域状态已恢复为 active");
              } catch (e) {
                Alert.alert("解除锁定失败", String((e as Error)?.message ?? e));
              }
            },
          },
        ],
      );
    },
    [companyId, whoami, patchDomainLifecycle],
  );

  // 加载选定类型的实例列表
  useEffect(() => {
    if (!selectedEntityType) {
      setInstances([]);
      return;
    }
    let cancelled = false;
    setInstancesLoading(true);
    void coolie
      .listOntologyInstances(companyId, {
        entityType: selectedEntityType.entityType,
        limit: 150,
      })
      .then((res) => {
        if (!cancelled) setInstances(res.instances);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(String(e.message ?? e));
      })
      .finally(() => {
        if (!cancelled) setInstancesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEntityType, companyId]);

  // 加载选中实例的属性
  useEffect(() => {
    if (!selectedInstance || !selectedEntityType) {
      setTypeProperties(null);
      return;
    }
    let cancelled = false;
    setTypePropertiesLoading(true);
    void coolie
      .getOntologyTypeProperties(companyId, selectedEntityType.entityType)
      .then((res) => {
        if (!cancelled) setTypeProperties(res);
      })
      .catch(() => {
        if (!cancelled) setTypeProperties(null);
      })
      .finally(() => {
        if (!cancelled) setTypePropertiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedInstance, selectedEntityType, companyId]);

  // 过滤后的实例列表
  const filteredInstances = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return instances;
    return instances.filter(
      (inst) =>
        inst.label.toLowerCase().includes(q) ||
        (inst.ownerLabel && inst.ownerLabel.toLowerCase().includes(q)),
    );
  }, [instances, searchQuery]);

  // ── 图谱档展示数据: 超过上限截断节点并同步过滤悬空边 ──
  const displayGraph = useMemo(() => {
    if (!graphData) return null;
    if (graphData.nodes.length <= NODE_DISPLAY_CAP) {
      return { graph: graphData, truncated: false };
    }
    const nodes = graphData.nodes.slice(0, NODE_DISPLAY_CAP);
    const keys = new Set(nodes.map((n) => n.key));
    const edges = graphData.edges.filter(
      (e) => keys.has(e.source) && keys.has(e.target),
    );
    return { graph: { ...graphData, nodes, edges }, truncated: true };
  }, [graphData]);

  const selectedGraphNode = useMemo(() => {
    if (!selectedGraphKey || !graphData) return null;
    return graphData.nodes.find((n) => n.key === selectedGraphKey) ?? null;
  }, [selectedGraphKey, graphData]);

  const selectedGraphNodeDegree = useMemo(() => {
    if (!selectedGraphKey || !graphData) return 0;
    return graphData.edges.filter(
      (e) => e.source === selectedGraphKey || e.target === selectedGraphKey,
    ).length;
  }, [selectedGraphKey, graphData]);

  // 新建域
  const handlePickDirectoryFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: false,
      });
      if (res.canceled) return;
      const asset = res.assets[0];
      if (asset) {
        const path = asset.uri.replace(/^file:\/\//, "");
        const dir = path.substring(0, path.lastIndexOf("/")) || asset.name;
        setNewDomainDirectoryPath(dir);
        if (!newDomainDisplayName) {
          const namePart = asset.name.split(".")[0];
          setNewDomainDisplayName(namePart);
          setNewDomainSlug(namePart.toLowerCase().replace(/[^a-z0-9_-]/g, "_"));
        }
      }
    } catch (e) {
      Alert.alert("选择失败", String((e as Error)?.message ?? e));
    }
  }, [newDomainDisplayName]);

  const handleCreateDomain = useCallback(async () => {
    if (!newDomainDisplayName.trim() || !newDomainSlug.trim()) {
      Alert.alert("请填写完整", "本体域名称与标识为必填项");
      return;
    }
    setCreatingDomain(true);
    try {
      const created = await coolie.createOntologyDomain(companyId, {
        displayName: newDomainDisplayName.trim(),
        slug: newDomainSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
        description: newDomainDescription.trim() || undefined,
        category: newDomainDirectoryPath.trim() ? "legacy-system" : "custom",
      });
      setNewDomainModalOpen(false);
      setNewDomainDisplayName("");
      setNewDomainSlug("");
      setNewDomainDescription("");
      setNewDomainDirectoryPath("");
      await loadLevelsAndDomains();
      Alert.alert(
        "创建成功",
        `业务本体域「${created.display_name || created.displayName || created.slug}」已成功创建`,
      );
    } catch (e) {
      Alert.alert("创建失败", String((e as Error)?.message ?? e));
    } finally {
      setCreatingDomain(false);
    }
  }, [
    companyId,
    newDomainDisplayName,
    newDomainSlug,
    newDomainDescription,
    newDomainDirectoryPath,
    loadLevelsAndDomains,
  ]);

  // 一键注入官方示例本体域 (15 天前 pattern): 骨架 + 逐域补种实例
  const handleSeedSample = useCallback(async () => {
    setSeedingSample(true);
    try {
      const report = await coolie.seedSampleDomains(companyId);
      const createdDomains = report.domains.filter((d) => d.status === "created");

      // 骨架报告里只有 slug, 没有 domainId: 刷一次列表把 slug 映射回 id
      const idBySlug = new Map(
        createdDomains.length > 0
          ? (await coolie.listOntologyDomains(companyId)).map((d) => [d.slug, d.id] as const)
          : [],
      );

      let injectedDomains = 0;
      let injectedNodes = 0;
      for (const created of createdDomains) {
        const domainId = idBySlug.get(created.slug);
        if (!domainId) continue;
        try {
          const seeded = await coolie.seedDomainSamples(companyId, domainId);
          if (seeded.seeded) {
            injectedDomains += 1;
            injectedNodes += seeded.created?.nodes ?? seeded.counts?.nodes ?? 0;
          }
        } catch {
          // 单个域失败跳过, 不影响其余域
        }
      }

      await loadLevelsAndDomains();
      Alert.alert("注入完成", `已注入 ${injectedDomains} 个域 · ${injectedNodes} 个实例节点`);
    } catch (e) {
      Alert.alert("注入失败", String((e as Error)?.message ?? e));
    } finally {
      setSeedingSample(false);
    }
  }, [companyId, loadLevelsAndDomains]);

  // 抽屉内的选中域派生态
  const drawerCfg =
    (selectedDomain && LIFECYCLE_CONFIG[selectedDomain.lifecycle_state]) ||
    LIFECYCLE_CONFIG.draft;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* 顶部标题与轻量控制行 */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>业务本体</Text>
            <Text style={styles.headerSub}>
              {levels
                ? `${levels.totalNodes} 个实体 · ${levels.totalEdges} 条关系`
                : "加载中…"}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {onOpenWebOntology ? (
              <Pressable
                onPress={onOpenWebOntology}
                hitSlop={8}
                style={styles.iconActionBtn}
                accessibilityLabel="打开 Web 端可视化图谱"
              >
                <Ionicons name="open-outline" size={16} color={C.accent} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={onRefresh}
              hitSlop={8}
              style={styles.iconActionBtn}
              accessibilityLabel="刷新业务本体"
            >
              <Ionicons name="refresh-outline" size={16} color={C.ink3} />
            </Pressable>
            <Pressable
              onPress={() => setNewDomainModalOpen(true)}
              hitSlop={8}
              style={styles.newDomainBtn}
              accessibilityLabel="新建本体域"
            >
              <Ionicons name="add" size={15} color={C.ink} />
              <Text style={styles.newDomainBtnText} numberOfLines={1}>
                新建
              </Text>
            </Pressable>
          </View>
        </View>

        {/* 顶部列表/图谱双模式切换 (wave353: 两字铁律) */}
        <SegmentedControl
          value={viewMode}
          onChange={(key) => setViewMode(key as "graph" | "list")}
          options={[
            { key: "graph", label: "图谱" },
            { key: "list", label: "列表" },
          ]}
          style={styles.viewModeSwitcher}
        />
      </View>

      {/* 页面主内容区 */}
      {viewMode === "graph" ? (
        /* ── 图谱档: OntologyGraphCanvas 直嵌 (wave353) ── */
        <View style={{ flex: 1 }}>
          {graphLoading ? (
            <LoadingState text="正在生成关系图谱…" />
          ) : graphError ? (
            <ErrorRetry message={graphError} onRetry={loadGraph} />
          ) : !displayGraph || displayGraph.graph.nodes.length === 0 ? (
            <EmptyState
              icon={<Ionicons name="git-network-outline" size={36} color={C.ink4} />}
              title="暂无图谱数据"
              subtitle="本体域还没有实体节点，切到列表档创建或注入示例域。"
            />
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.graphContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
              }
            >
              {displayGraph.truncated ? (
                <Text style={styles.graphTruncated}>
                  节点较多，仅渲染前 {NODE_DISPLAY_CAP} 个
                </Text>
              ) : null}

              <View style={styles.canvasWrap}>
                <OntologyGraphCanvas
                  graph={displayGraph.graph}
                  canvasSize={canvasSize}
                  selectedKey={selectedGraphKey}
                  onSelectNode={setSelectedGraphKey}
                />
              </View>

              {selectedGraphNode ? (
                <AppCard style={styles.graphNodeCard}>
                  <View style={styles.graphNodeRow}>
                    <View style={styles.graphNodeTypeTag}>
                      <Text style={styles.graphNodeTypeText} numberOfLines={1}>
                        {selectedGraphNode.type}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.graphNodeLabel} numberOfLines={1}>
                        {selectedGraphNode.label}
                      </Text>
                      <Text style={styles.graphNodeSub} numberOfLines={1}>
                        {selectedGraphNodeDegree} 条关联 · {selectedGraphNode.key.slice(0, 16)}…
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setSelectedGraphKey(null)}
                      hitSlop={8}
                      style={styles.drawerCloseBtn}
                      accessibilityLabel="取消选中节点"
                    >
                      <Ionicons name="close" size={18} color={C.ink3} />
                    </Pressable>
                  </View>
                </AppCard>
              ) : (
                <Text style={styles.graphHint}>点击节点可高亮它的关联连线</Text>
              )}
            </ScrollView>
          )}
        </View>
      ) : loading ? (
        <LoadingState text="正在加载业务本体…" />
      ) : error ? (
        <ErrorRetry message={error} onRetry={loadLevelsAndDomains} />
      ) : selectedEntityType ? (
        /* 选中实体分类后的实例列表 */
        <View style={{ flex: 1 }}>
          <View style={styles.subListHeader}>
            <Pressable
              style={styles.backBtn}
              onPress={() => {
                setSelectedEntityType(null);
                setSearchQuery("");
              }}
              hitSlop={6}
            >
              <Ionicons name="chevron-back" size={18} color={C.accent} />
              <Text style={styles.backBtnText}>返回实体分类</Text>
            </Pressable>
            <Text style={styles.subListTitle}>
              {selectedEntityType.label} ({filteredInstances.length})
            </Text>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={14} color={C.ink4} />
            <TextInput
              style={styles.searchInput}
              placeholder={`搜索 ${selectedEntityType.label}…`}
              placeholderTextColor={C.ink4}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={6}>
                <Ionicons name="close-circle" size={14} color={C.ink4} />
              </Pressable>
            ) : null}
          </View>

          {instancesLoading ? (
            <LoadingState text={`正在加载 ${selectedEntityType.label} 列表…`} />
          ) : filteredInstances.length === 0 ? (
            <EmptyState
              icon={selectedEntityType.icon}
              title={`暂无 ${selectedEntityType.label}`}
              subtitle={searchQuery ? "未找到匹配的实例" : "当前分类暂无实例数据"}
            />
          ) : (
            <FlatList
              data={filteredInstances}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <AppCard
                  style={styles.instanceCard}
                  onPress={() => setSelectedInstance(item)}
                >
                  <View style={styles.instanceRow}>
                    <View
                      style={[
                        styles.instanceIconBox,
                        { backgroundColor: `${selectedEntityType.color}15`, borderColor: selectedEntityType.color },
                      ]}
                    >
                      <Ionicons
                        name={selectedEntityType.icon}
                        size={16}
                        color={selectedEntityType.color}
                      />
                    </View>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.instanceLabel} numberOfLines={1}>
                        {item.label}
                      </Text>
                      <Text style={styles.instanceSub} numberOfLines={1}>
                        {item.ownerLabel ? `负责人: ${item.ownerLabel} · ` : ""}ID: {item.id.slice(0, 8)}…
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={C.ink4} />
                  </View>
                </AppCard>
              )}
            />
          )}
        </View>
      ) : (
        /* 列表档总览: 业务本体域 + 核心业务实体 两段 */
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
          }
        >
          <SectionHeader
            emphasis
            title="业务本体域"
            hint="点击查看快照与熔断闸门 · 活跃域可右滑熔断"
          />

          {domains.length === 0 ? (
            <EmptyState
              icon="🌐"
              title="暂无业务本体域"
              subtitle="右上「新建」手工创建，或一键注入官方示例域。"
              action={
                <Pressable
                  style={[styles.seedBtn, seedingSample && styles.seedBtnDisabled]}
                  onPress={handleSeedSample}
                  disabled={seedingSample}
                  accessibilityLabel="注入示例本体域"
                >
                  {seedingSample ? (
                    <ActivityIndicator size="small" color={C.accent} />
                  ) : (
                    <>
                      <Ionicons name="sparkles-outline" size={14} color={C.accent} />
                      <Text style={styles.seedBtnText}>注入</Text>
                    </>
                  )}
                </Pressable>
              }
            />
          ) : (
            domains.map((domain) => {
              const cfg = LIFECYCLE_CONFIG[domain.lifecycle_state] || LIFECYCLE_CONFIG.draft;
              const stats = domainStats[domain.id];
              return (
                <AppCard
                  key={domain.id}
                  style={styles.domainCard}
                  onPress={() => setSelectedDomain(domain)}
                >
                  <View style={styles.domainCardRow}>
                    <View
                      style={[
                        styles.domainIconWrap,
                        { backgroundColor: cfg.bg, borderColor: cfg.border },
                      ]}
                    >
                      <Ionicons name="globe-outline" size={20} color={cfg.color} />
                    </View>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <View style={styles.categoryTitleRow}>
                        <Text style={styles.domainName} numberOfLines={1}>
                          {domainLabel(domain)}
                        </Text>
                        <View
                          style={[
                            styles.badgePill,
                            { backgroundColor: cfg.bg, borderColor: cfg.border },
                          ]}
                        >
                          <StatusDot status={cfg.status} color={cfg.color} size={6} />
                          <Text style={[styles.badgeText, { color: cfg.color }]}>
                            {cfg.label}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.domainSlug} numberOfLines={1}>
                        {domain.slug} · v{domain.schema_version ?? domain.version ?? 1}
                      </Text>
                      <View style={styles.domainStatRow}>
                        <Pill
                          label={`节点 ${stats ? stats.nodes : "--"}`}
                          size="sm"
                          tone="muted"
                        />
                        <Pill
                          label={`关系 ${stats ? stats.edges : "--"}`}
                          size="sm"
                          tone="muted"
                        />
                        {domain.category ? (
                          <Pill label={domain.category} size="sm" tone="muted" />
                        ) : null}
                      </View>
                    </View>
                  </View>

                  {/* 活跃域卡片底部快速熔断器 (15 天前 pattern) */}
                  {domain.lifecycle_state === "active" ? (
                    <View style={styles.cardKillWrap}>
                      <EmergencyKillSwitch
                        compact
                        domainId={domain.id}
                        domainName={domainLabel(domain)}
                        actor={whoami}
                        onTrigger={() => triggerKillSwitch(domain)}
                      />
                    </View>
                  ) : null}
                </AppCard>
              );
            })
          )}

          <SectionHeader
            emphasis
            title="核心业务实体"
            hint="点击查看实体实例与属性字段"
          />

          {ENTITY_CATEGORIES.map((cat) => {
            const count =
              levels?.byEntityType.find((e) => e.entityType === cat.entityType)?.count ?? 0;
            return (
              <AppCard
                key={cat.entityType}
                style={styles.categoryCard}
                onPress={() => setSelectedEntityType(cat)}
              >
                <View style={styles.categoryRow}>
                  <View
                    style={[
                      styles.categoryIconWrap,
                      { backgroundColor: `${cat.color}15`, borderColor: `${cat.color}40` },
                    ]}
                  >
                    <Ionicons name={cat.icon} size={22} color={cat.color} />
                  </View>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <View style={styles.categoryTitleRow}>
                      <Text style={styles.categoryTitle}>{cat.label}</Text>
                      <Pill label={`${count} 实体`} size="sm" tone={count > 0 ? "accent" : "muted"} />
                    </View>
                    <Text style={styles.categoryDesc} numberOfLines={1}>
                      {cat.desc}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.ink4} />
                </View>
              </AppCard>
            );
          })}
        </ScrollView>
      )}

      {/* 实例属性详情抽屉/弹层 */}
      {selectedInstance ? (
        <Modal
          visible={true}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedInstance(null)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setSelectedInstance(null)}
          >
            <Pressable style={styles.detailDrawer} onPress={(e) => e.stopPropagation()}>
              <View style={styles.drawerHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.drawerTitle} numberOfLines={1}>
                    {selectedInstance.label}
                  </Text>
                  <Text style={styles.drawerSub}>
                    类型: {selectedEntityType?.label || selectedInstance.id}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setSelectedInstance(null)}
                  hitSlop={8}
                  style={styles.drawerCloseBtn}
                >
                  <Ionicons name="close" size={20} color={C.ink3} />
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 420 }}>
                <View style={styles.metaRow}>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipLabel}>实例 ID</Text>
                    <Text style={styles.metaChipValue} numberOfLines={1}>
                      {selectedInstance.id}
                    </Text>
                  </View>
                  {selectedInstance.ownerLabel ? (
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipLabel}>责任人</Text>
                      <Text style={styles.metaChipValue}>
                        {selectedInstance.ownerLabel}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* 字段属性 */}
                <Text style={styles.sectionTitle}>属性详情</Text>
                {selectedInstance.metadata &&
                Object.keys(selectedInstance.metadata).length > 0 ? (
                  <View style={styles.propsContainer}>
                    {Object.entries(selectedInstance.metadata).map(
                      ([key, val], idx, arr) => (
                        <View
                          key={key}
                          style={[
                            styles.propRow,
                            idx < arr.length - 1 ? styles.propRowBorder : null,
                          ]}
                        >
                          <Text style={styles.propKey}>{key}</Text>
                          <Text style={styles.propVal} numberOfLines={2}>
                            {typeof val === "object" ? JSON.stringify(val) : String(val)}
                          </Text>
                        </View>
                      ),
                    )}
                  </View>
                ) : (
                  <Text style={styles.emptyHint}>该实例暂无附加属性键值。</Text>
                )}

                {/* Schema 字段定义 */}
                {typeProperties && typeProperties.properties.length > 0 ? (
                  <>
                    <Text style={[styles.sectionTitle, { marginTop: 16 }]}>类型契约字段</Text>
                    <View style={styles.propsContainer}>
                      {typeProperties.properties.map((p, idx, arr) => (
                        <View
                          key={p.key}
                          style={[
                            styles.propRow,
                            idx < arr.length - 1 ? styles.propRowBorder : null,
                          ]}
                        >
                          <Text style={styles.propKey}>{p.key}</Text>
                          <Pill label={p.type} size="sm" tone="accent" />
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {/* 域详情抽屉: 快照摘要 + 类型分布 + 高危熔断闸门 (15 天前 pattern) */}
      {selectedDomain ? (
        <DomainDetailDrawer
          domain={selectedDomain}
          cfg={drawerCfg}
          snapshot={snapshot}
          snapshotLoading={snapshotLoading}
          actor={whoami}
          onClose={() => setSelectedDomain(null)}
          onTriggerKill={() => triggerKillSwitch(selectedDomain)}
          onUnlock={() => unlockDomain(selectedDomain)}
        />
      ) : null}

      {/* 新建本体模态框 */}
      <NewDomainModal
        visible={newDomainModalOpen}
        onClose={() => setNewDomainModalOpen(false)}
        mode={newDomainMode}
        setMode={setNewDomainMode}
        displayName={newDomainDisplayName}
        setDisplayName={setNewDomainDisplayName}
        slug={newDomainSlug}
        setSlug={setNewDomainSlug}
        description={newDomainDescription}
        setDescription={setNewDomainDescription}
        directoryPath={newDomainDirectoryPath}
        onPickDirectory={handlePickDirectoryFile}
        onSubmit={handleCreateDomain}
        creating={creatingDomain}
      />
    </SafeAreaView>
  );
}

/** 域详情抽屉 — 域信息 + 快照摘要 + 类型分布 + 熔断/解锁闸门 */
function DomainDetailDrawer({
  domain,
  cfg,
  snapshot,
  snapshotLoading,
  actor,
  onClose,
  onTriggerKill,
  onUnlock,
}: {
  domain: OntologyDomain;
  cfg: (typeof LIFECYCLE_CONFIG)[string];
  snapshot: OntologyGraphSnapshot | null;
  snapshotLoading: boolean;
  actor: string;
  onClose: () => void;
  onTriggerKill: () => Promise<void> | void;
  onUnlock: () => void;
}) {
  const locked = isLockedDomain(domain);
  const byNodeType = snapshot?.counts?.byNodeType ?? null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.detailDrawer} onPress={(e) => e.stopPropagation()}>
          <View style={styles.drawerHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.categoryTitleRow}>
                <Text style={styles.drawerTitle} numberOfLines={1}>
                  {domainLabel(domain)}
                </Text>
                <View
                  style={[styles.badgePill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
                >
                  <StatusDot status={cfg.status} color={cfg.color} size={6} />
                  <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>
              <Text style={styles.drawerSub} numberOfLines={1}>
                标识: {domain.slug}
                {domain.description ? ` · ${domain.description}` : ""}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.drawerCloseBtn}>
              <Ionicons name="close" size={20} color={C.ink3} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
            {/* 域基础信息 */}
            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Text style={styles.metaChipLabel}>分类</Text>
                <Text style={styles.metaChipValue} numberOfLines={1}>
                  {domain.category || "业务本体"}
                </Text>
              </View>
              <View style={styles.metaChip}>
                <Text style={styles.metaChipLabel}>架构版本</Text>
                <Text style={styles.metaChipValue}>
                  v{domain.schema_version ?? domain.version ?? 1}
                </Text>
              </View>
              <View style={styles.metaChip}>
                <Text style={styles.metaChipLabel}>引导源</Text>
                <Text style={styles.metaChipValue} numberOfLines={1}>
                  {domain.bootstrap_source || "系统内置"}
                </Text>
              </View>
            </View>

            {/* 快照摘要统计 */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>图谱快照摘要</Text>
              {snapshotLoading ? (
                <ActivityIndicator size="small" color={C.accent} />
              ) : (
                <Text style={styles.sectionHint}>实时拓扑数据</Text>
              )}
            </View>
            <View style={styles.statsGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricNum}>{snapshot?.counts?.nodes ?? "0"}</Text>
                <Text style={styles.metricLabel}>实体节点</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={[styles.metricNum, { color: C.accent }]}>
                  {snapshot?.counts?.edges ?? "0"}
                </Text>
                <Text style={styles.metricLabel}>关系连线</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricNum}>{snapshot?.counts?.nodeTypes ?? "0"}</Text>
                <Text style={styles.metricLabel}>节点类型</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={[styles.metricNum, { color: C.warn }]}>
                  {snapshot?.counts?.crossDomainEdges ?? "0"}
                </Text>
                <Text style={styles.metricLabel}>跨域依赖</Text>
              </View>
            </View>

            {/* 节点类型分布 */}
            {byNodeType && Object.keys(byNodeType).length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 14 }]}>实体类型分布</Text>
                <View style={styles.propsContainer}>
                  {Object.entries(byNodeType).map(([typeKey, count], idx, arr) => (
                    <View
                      key={typeKey || "none"}
                      style={[
                        styles.propRow,
                        idx < arr.length - 1 ? styles.propRowBorder : null,
                      ]}
                    >
                      <Text style={styles.propKey}>{typeKey || "(未归类对象)"}</Text>
                      <Pill label={`${count} 实体`} size="sm" tone="muted" />
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {/* 高危熔断控制闸门区 (PRD 需求⑪) */}
            <Text style={[styles.sectionTitle, { marginTop: 14 }]}>高危安全闸门</Text>
            {locked ? (
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
                <Pressable style={styles.unlockBtn} onPress={onUnlock}>
                  <Ionicons name="lock-open-outline" size={15} color={C.ink} />
                  <Text style={styles.unlockBtnText}>解锁</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.killSwitchContainer}>
                <View>
                  <Text style={styles.killNoticeTitle}>突发异常应急保护 · 一键熔断</Text>
                  <Text style={styles.killNoticeDesc}>
                    如发现模型产生幻觉批量改写资产或发生业务冲突，向右滑脱即可置为锁死归档，并写死审计日志。
                  </Text>
                </View>
                <EmergencyKillSwitch
                  domainId={domain.id}
                  domainName={domainLabel(domain)}
                  isLocked={locked}
                  actor={actor}
                  onTrigger={onTriggerKill}
                />
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function NewDomainModal({
  visible,
  onClose,
  mode,
  setMode,
  displayName,
  setDisplayName,
  slug,
  setSlug,
  description,
  setDescription,
  directoryPath,
  onPickDirectory,
  onSubmit,
  creating,
}: {
  visible: boolean;
  onClose: () => void;
  mode: "directory" | "manual";
  setMode: (m: "directory" | "manual") => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  slug: string;
  setSlug: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  directoryPath: string;
  onPickDirectory: () => void;
  onSubmit: () => void;
  creating: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>新建业务本体</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={C.ink3} />
            </Pressable>
          </View>

          <View style={styles.modalTabRow}>
            <Pressable
              style={[styles.modalTabBtn, mode === "directory" && styles.modalTabBtnActive]}
              onPress={() => setMode("directory")}
            >
              <Text
                style={[
                  styles.modalTabBtnText,
                  mode === "directory" && styles.modalTabBtnTextActive,
                ]}
              >
                📁 文件夹目录接入
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modalTabBtn, mode === "manual" && styles.modalTabBtnActive]}
              onPress={() => setMode("manual")}
            >
              <Text
                style={[
                  styles.modalTabBtnText,
                  mode === "manual" && styles.modalTabBtnTextActive,
                ]}
              >
                ✏️ 空白手动定义
              </Text>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
            {mode === "directory" ? (
              <View style={styles.dirSelectBox}>
                <Text style={styles.fieldLabel}>代码工程 / 文件夹目录</Text>
                <View style={styles.dirInputRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="如 /workspace/orders 或选取工程文件"
                    placeholderTextColor={C.ink4}
                    value={directoryPath}
                    onChangeText={setDisplayName}
                  />
                  <Pressable style={styles.dirBrowseBtn} onPress={onPickDirectory}>
                    <Ionicons name="folder-open-outline" size={16} color={C.ink} />
                    <Text style={styles.dirBrowseText}>选择</Text>
                  </Pressable>
                </View>
                <Text style={styles.fieldTip}>
                  支持 Java/Spring Boot、.proto、SQL DDL、TS/JS 等工程目录。
                </Text>
              </View>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>显示名称 *</Text>
              <TextInput
                style={styles.input}
                placeholder="如：订单核心系统、电商交易域"
                placeholderTextColor={C.ink4}
                value={displayName}
                onChangeText={(val) => {
                  setDisplayName(val);
                  if (!slug) setSlug(val.toLowerCase().replace(/[^a-z0-9_-]/g, "_"));
                }}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>标识 (Slug) *</Text>
              <TextInput
                style={styles.input}
                placeholder="如 orders、trading_domain"
                placeholderTextColor={C.ink4}
                value={slug}
                onChangeText={setSlug}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>描述说明</Text>
              <TextInput
                style={[styles.input, { height: 60, textAlignVertical: "top" }]}
                placeholder="简述该本体域包含的核心概念与职责"
                placeholderTextColor={C.ink4}
                value={description}
                onChangeText={setDescription}
                multiline
              />
            </View>
          </ScrollView>

          <View style={styles.modalActions}>
            <Pressable style={styles.cancelBtn} onPress={onClose} disabled={creating}>
              <Text style={styles.cancelBtnText}>取消</Text>
            </Pressable>
            <Pressable
              style={[styles.submitBtn, creating && styles.submitBtnDisabled]}
              onPress={onSubmit}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>确认创建</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerTitle: { fontSize: 18, fontWeight: "600", color: C.ink },
  headerSub: { fontSize: 12, color: C.ink3, marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
  },
  newDomainBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    backgroundColor: C.accent,
  },
  newDomainBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  viewModeSwitcher: { marginTop: 2 },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 10,
  },

  /* ── 图谱档 ── */
  graphContent: {
    padding: 16,
    paddingBottom: 40,
    alignItems: "center",
    gap: 12,
  },
  graphTruncated: {
    fontSize: 11,
    color: C.warn,
  },
  canvasWrap: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.line,
    overflow: "hidden",
  },
  graphNodeCard: {
    width: "100%",
    borderRadius: RADIUS.md,
    padding: 12,
  },
  graphNodeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  graphNodeTypeTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(94, 106, 210, 0.35)",
    marginRight: 10,
  },
  graphNodeTypeText: {
    fontSize: 10,
    color: C.accent,
    fontWeight: "600",
  },
  graphNodeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
  },
  graphNodeSub: {
    fontSize: 11,
    color: C.ink4,
    marginTop: 2,
  },
  graphHint: {
    fontSize: 11,
    color: C.ink4,
  },

  /* ── 列表档: 业务域卡片 ── */
  domainCard: {
    borderRadius: RADIUS.md,
    padding: 14,
  },
  domainCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  domainIconWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  domainName: {
    fontSize: 15,
    fontWeight: "600",
    color: C.ink,
  },
  domainSlug: {
    fontSize: 11,
    color: C.ink4,
    marginTop: 2,
    marginBottom: 6,
  },
  domainStatRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  badgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  cardKillWrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },
  seedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(94, 106, 210, 0.35)",
    marginTop: 12,
  },
  seedBtnText: { color: C.accent, fontSize: 12, fontWeight: "600" },
  seedBtnDisabled: { opacity: 0.6 },

  /* ── 列表档: 实体分类卡片 ── */
  categoryCard: {
    borderRadius: RADIUS.md,
    padding: 14,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  categoryIconWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  categoryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: C.ink,
  },
  categoryDesc: {
    fontSize: 12,
    color: C.ink3,
  },
  subListHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
    backgroundColor: C.panel,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  backBtnText: {
    fontSize: 13,
    color: C.accent,
    fontWeight: "600",
  },
  subListTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: C.panel,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: C.ink,
    padding: 0,
  },
  instanceCard: {
    padding: 12,
    borderRadius: RADIUS.md,
  },
  instanceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  instanceIconBox: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  instanceLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: C.ink,
  },
  instanceSub: {
    fontSize: 11,
    color: C.ink4,
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  detailDrawer: {
    backgroundColor: C.panel,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  drawerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: C.ink,
  },
  drawerSub: {
    fontSize: 12,
    color: C.ink3,
    marginTop: 2,
  },
  drawerCloseBtn: {
    padding: 4,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  metaChip: {
    flex: 1,
    padding: 8,
    backgroundColor: C.bg,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: C.line,
  },
  metaChipLabel: {
    fontSize: 10,
    color: C.ink4,
    marginBottom: 2,
  },
  metaChipValue: {
    fontSize: 12,
    color: C.ink2,
    fontWeight: "500",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink2,
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: 11,
    color: C.ink4,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricCard: {
    flexBasis: "48%",
    flexGrow: 1,
    padding: 12,
    backgroundColor: C.bg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
  },
  metricNum: {
    fontSize: 20,
    fontWeight: "700",
    color: C.ink,
    fontVariant: ["tabular-nums"],
  },
  metricLabel: {
    fontSize: 11,
    color: C.ink4,
    marginTop: 4,
  },
  propsContainer: {
    backgroundColor: C.bg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 12,
  },
  propRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  propRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  propKey: {
    fontSize: 12,
    color: C.ink3,
    fontFamily: "monospace",
  },
  propVal: {
    fontSize: 12,
    color: C.ink,
    fontWeight: "500",
    maxWidth: "60%",
    textAlign: "right",
  },
  emptyHint: {
    fontSize: 12,
    color: C.ink4,
    fontStyle: "italic",
    paddingVertical: 8,
  },
  lockedNoticeCard: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.28)",
    borderRadius: RADIUS.md,
    padding: 12,
    gap: 8,
  },
  lockedNoticeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  lockedNoticeTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: C.err,
    flex: 1,
  },
  lockedNoticeDesc: {
    fontSize: 12,
    color: C.ink3,
    lineHeight: 17,
  },
  unlockBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 9,
    borderRadius: RADIUS.md,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
    marginTop: 4,
  },
  unlockBtnText: {
    fontSize: 13,
    color: C.ink,
    fontWeight: "600",
  },
  killSwitchContainer: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.md,
    padding: 12,
    gap: 10,
  },
  killNoticeTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink,
  },
  killNoticeDesc: {
    fontSize: 11,
    color: C.ink4,
    marginTop: 4,
    lineHeight: 16,
  },
  modalCard: {
    backgroundColor: C.panel,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: 16,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalTitle: { fontSize: 16, fontWeight: "600", color: C.ink },
  modalTabRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  modalTabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.bg,
  },
  modalTabBtnActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
  },
  modalTabBtnText: {
    fontSize: 12,
    color: C.ink3,
  },
  modalTabBtnTextActive: {
    color: C.accent,
    fontWeight: "600",
  },
  dirSelectBox: {
    marginBottom: 12,
  },
  dirInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  dirBrowseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    backgroundColor: C.lineSubtle,
  },
  dirBrowseText: {
    fontSize: 12,
    color: C.ink,
  },
  fieldTip: {
    fontSize: 11,
    color: C.ink4,
    marginTop: 4,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    color: C.ink3,
    marginBottom: 4,
  },
  input: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: C.ink,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    alignItems: "center",
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
  },
  cancelBtnText: {
    fontSize: 13,
    color: C.ink2,
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    alignItems: "center",
    backgroundColor: C.accent,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 13,
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
