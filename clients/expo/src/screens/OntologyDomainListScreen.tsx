import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  PanResponder,
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
import * as DocumentPicker from "expo-document-picker";
import type {
  Company,
  OntologyDomain,
  OntologyGraphResponse,
  OntologyGraphSnapshot,
} from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { StatusDot } from "../components/StatusDot";
import { EmergencyKillSwitch } from "../components/EmergencyKillSwitch";
import { OntologyGraphCanvas } from "../components/OntologyGraphCanvas";
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

interface OntologyDomainListScreenProps {
  company: Company;
  whoami?: string;
  onOpenWebOntology?: () => void;
  /**
   * Wave239 — 屏 3 schema editor. The App passes a callback that opens the
   * per-type property editor. The domain's `id` is forwarded as the typeId
   * for the new PATCH endpoint; the screen falls back to the slug when no id
   * exists (built-in domains).
   */
  onOpenSchemaEditor?: (typeId: string, displayName: string) => void;
  /**
   * Wave239 — 屏 2 instance graph. Long-press on a domain card opens the
   * instance list for that domain. The full ontology graph is forwarded so
   * the instance screen can hydrate nodes.
   */
  onOpenInstanceGraph?: (typeId: string, displayName: string) => void;
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

export type DomainFilter = "all" | "active" | "draft" | "archived" | "locked";
export type OntologyViewMode = "list" | "detail" | "graph";

/**
 * Wave239 — 屏 1 顶部的 4 类横向 chip (agy 草图 §1).
 * 类别值与 `OntologyDomain.category` 字段对齐 (server 在创建/seed 时写入).
 * "all" 是兜底 (无 category 或未知 category 的域归到 "all" 这列).
 */
export type OntologyCategoryFilter =
  | "all"
  | "业务本体"
  | "项目中心"
  | "数字员工"
  | "交付产物";

const CATEGORY_CHIPS: Array<{ key: OntologyCategoryFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "业务本体", label: "业务本体" },
  { key: "项目中心", label: "项目中心" },
  { key: "数字员工", label: "数字员工" },
  { key: "交付产物", label: "交付产物" },
];

// wave216: 真修节点 UUID 显示 — 之前 wave163 只在 server 端把 id 换成 label,
// 但 Expo 端 `OntologyDomainListScreen` 把 `nodeTypeId` (UUID) 当 typeKey,
// 而且把 typeKey 当 label 的 fallback, 结果 5 个节点类型下面全显示 UUID。
// 下面是 UI 层防御: 任何时候 label/key 落到 UUID 上 (裸 UUID 或 `type:uuid`),
// 都用中文占位替换。截图中节点 key 是 "company_entity:0791cb57-4d94-…"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_UUID_TAIL_RE = /:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
/** ontology_nodes 的 key 是 `type:uuid` 形式; 也算 UUID 派生。 */
function isUuidLike(value: string | null | undefined): boolean {
  return typeof value === "string" && (UUID_RE.test(value) || KEY_UUID_TAIL_RE.test(value));
}
/** 从 `type:uuid` 形式里只拿 type 部分, 剥掉 UUID 尾部。 */
function stripUuidTail(value: string | null | undefined): string | null | undefined {
  if (typeof value !== "string") return value;
  const match = value.match(KEY_UUID_TAIL_RE);
  return match && typeof match.index === "number" ? value.slice(0, match.index) : value;
}
function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(1, max - 1))}…` : value;
}
/** 把可能落到 UUID 的字段变成人类可读占位, 绝不输出裸 UUID。 */
function safeDisplay(
  value: string | null | undefined,
  placeholder: string,
  max = 28,
): string {
  if (!value || isUuidLike(value)) return placeholder;
  return truncate(value, max);
}

export function OntologyDomainListScreen({
  company,
  whoami = "管理员",
  onOpenWebOntology,
  onOpenSchemaEditor,
  onOpenInstanceGraph,
}: OntologyDomainListScreenProps) {
  const [domains, setDomains] = useState<OntologyDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DomainFilter>("all");
  const [viewMode, setViewMode] = useState<OntologyViewMode>("list");
  // wave239 — 屏 1 顶部 4 chip 类别过滤
  const [categoryFilter, setCategoryFilter] = useState<OntologyCategoryFilter>("all");
  const [seedingSample, setSeedingSample] = useState(false);
  const [selectedNodeTypeKey, setSelectedNodeTypeKey] = useState<string | null>(null);

  // 新建本体域弹层状态
  const [newDomainModalOpen, setNewDomainModalOpen] = useState(false);
  const [newDomainMode, setNewDomainMode] = useState<"directory" | "manual">("directory");
  const [newDomainDisplayName, setNewDomainDisplayName] = useState("");
  const [newDomainSlug, setNewDomainSlug] = useState("");
  const [newDomainDescription, setNewDomainDescription] = useState("");
  const [newDomainDirectoryPath, setNewDomainDirectoryPath] = useState("");
  const [creatingDomain, setCreatingDomain] = useState(false);

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
      Alert.alert("请填写完整", "本体域名称与标识 (Slug) 为必填项");
      return;
    }
    setCreatingDomain(true);
    try {
      const created = await coolie.createOntologyDomain(companyId, {
        displayName: newDomainDisplayName.trim(),
        slug: newDomainSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
        description: newDomainDescription.trim() || undefined,
        category: newDomainDirectoryPath.trim() ? "legacy-system" : "custom",
        metadata: newDomainDirectoryPath.trim()
          ? {
              sourceDirectory: newDomainDirectoryPath.trim(),
              pipelineMode: "virtualization",
            }
          : undefined,
      });
      setNewDomainModalOpen(false);
      setNewDomainDisplayName("");
      setNewDomainSlug("");
      setNewDomainDescription("");
      setNewDomainDirectoryPath("");
      await loadDomains();
      Alert.alert(
        "创建成功",
        `业务本体域「${created.display_name || created.displayName || created.slug}」已成功创建`,
      );
      void openDomainDetail(created);
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
    loadDomains,
    openDomainDetail,
  ]);

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
  }).filter((d) => {
    // wave239 — 顶部 4 chip 类别过滤. "all" 不限; 其它按 category 字段精确匹配
    // (server 在 seed / create 时写入). 缺失 category 的域被归到 "all" 列里,
    // 不让一个数据缺陷把整行吞掉。
    if (categoryFilter === "all") return true;
    return d.category === categoryFilter;
  });

  // 第三层: 关系图谱交互浏览 (Graph View)
  if (viewMode === "graph" && selectedDomain) {
    return (
      <OntologyDomainGraphView
        domain={selectedDomain}
        snapshot={snapshot}
        onBack={() => setViewMode("detail")}
      />
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
            {/*
              wave239 — 真名 + UUID 双展示. 默认显示真名 (业务本体), 长按才会
              单独把 UUID 复制到剪贴板. 这里在主标题下追加一行小型 UUID 提示,
              让运维 / 排障的人有 1 秒就能定位.
            */}
            {selectedDomain.id ? (
              <Pressable
                onLongPress={() => {
                  // 不引 expo-clipboard (避免再加 native module); 用 Alert 文本即可
                  Alert.alert("UUID", selectedDomain.id);
                }}
                hitSlop={4}
              >
                <Text style={styles.heroUuid} numberOfLines={1}>
                  UUID · {truncate(selectedDomain.id, 36)}
                </Text>
              </Pressable>
            ) : null}
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
                      {/* wave216: 节点标题用真名, 永真不再显示 UUID。
                          之前 `{node.label}` 在 label 为空时是 undefined,
                          现在 safeDisplay 兜底。 */}
                      <Text style={styles.nodeLabel} numberOfLines={1}>
                        {safeDisplay(node.label, "(未命名实体)")}
                      </Text>
                      <Pill label={node.lifecycleState || "active"} size="sm" />
                    </View>
                    {/* wave216: 节点副标题优先显示真名 (label), 剥掉 key 里的 UUID 尾部。
                        `node.key` 在 plugin-ontology 路径下是 type:uuid 形式,
                        剥尾后能拿到 `company_entity` / `department` 这类类型 slug,
                        比显示一长串 UUID 友好。 */}
                    <Text style={styles.nodeKey} numberOfLines={1}>
                      {safeDisplay(stripUuidTail(node.key), "(未命名类型)", 64)}
                    </Text>
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
        {/* 紧凑操作行: 外层资产页已有标题与四段选择器, 这里不再重复页头。
            旧版 4 个文字按钮在 fontScale 放大下逐字竖排, 且与外层 chrome 叠了三层。 */}
        <View style={styles.listActionBar}>
          <View style={{ flex: 1 }} />
          <View style={styles.listActionBarBtns}>
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
            <Pressable onPress={onRefresh} hitSlop={8} style={styles.iconActionBtn} accessibilityLabel="刷新本体域列表">
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

        {/* wave239 — 顶部 4 chip 类别过滤 (agy 草图 §1).
            横滑 ScrollView 让 5 个 chip 都能容纳, 选中态用 accent 底色 + 字色. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryChipRow}
          keyboardShouldPersistTaps="handled"
        >
          {CATEGORY_CHIPS.map((opt) => {
            const active = categoryFilter === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setCategoryFilter(opt.key)}
                hitSlop={4}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    active && styles.categoryChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

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
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <Pressable
                  style={[
                    styles.refreshBtn,
                    {
                      backgroundColor: C.accent,
                      borderColor: C.accent,
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                    },
                  ]}
                  onPress={() => setNewDomainModalOpen(true)}
                >
                  <Text style={{ color: C.ink, fontSize: 14, fontWeight: "600" }}>
                    + 新建本体
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.refreshBtn,
                    styles.seedBtn,
                    { paddingHorizontal: 16, paddingVertical: 10 },
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
              </View>
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
                // wave239 — 长按域卡片弹"实例图谱 / 编辑字段"动作卡.
                // 不开 onLongPress 时仍然可以单击进 detail; long press 只是快捷入口.
                onLongPress={
                  onOpenSchemaEditor || onOpenInstanceGraph
                    ? () => {
                        const displayName =
                          item.display_name || item.displayName || item.slug;
                        Alert.alert(
                          displayName,
                          "选择此域的下一步操作",
                          [
                            onOpenInstanceGraph
                              ? {
                                  text: "实例图谱",
                                  onPress: () =>
                                    onOpenInstanceGraph(item.id, displayName),
                                }
                              : { text: "实例图谱", style: "cancel" },
                            onOpenSchemaEditor
                              ? {
                                  text: "编辑字段",
                                  onPress: () =>
                                    onOpenSchemaEditor(item.id, displayName),
                                }
                              : { text: "编辑字段", style: "cancel" },
                            { text: "取消", style: "cancel" },
                          ],
                          { cancelable: true },
                        );
                      }
                    : undefined
                }
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

      {/* 新建本体域弹层 (支持文件夹目录接入 / 手动创建) */}
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
              <Pressable onPress={() => setNewDomainModalOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={C.ink3} />
              </Pressable>
            </View>

            {/* 模式切换 */}
            <View style={styles.modalTabRow}>
              <Pressable
                style={[
                  styles.modalTabBtn,
                  newDomainMode === "directory" && styles.modalTabBtnActive,
                ]}
                onPress={() => setNewDomainMode("directory")}
              >
                <Text
                  style={[
                    styles.modalTabBtnText,
                    newDomainMode === "directory" && styles.modalTabBtnTextActive,
                  ]}
                >
                  📁 文件夹目录接入
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalTabBtn,
                  newDomainMode === "manual" && styles.modalTabBtnActive,
                ]}
                onPress={() => setNewDomainMode("manual")}
              >
                <Text
                  style={[
                    styles.modalTabBtnText,
                    newDomainMode === "manual" && styles.modalTabBtnTextActive,
                  ]}
                >
                  ✏️ 空白手动定义
                </Text>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {newDomainMode === "directory" ? (
                <View style={styles.dirSelectBox}>
                  <Text style={styles.fieldLabel}>代码工程 / 文件夹目录</Text>
                  <View style={styles.dirInputRow}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="如 /workspace/orders 或选取工程文件"
                      placeholderTextColor={C.ink4}
                      value={newDomainDirectoryPath}
                      onChangeText={setNewDomainDirectoryPath}
                    />
                    <Pressable
                      style={styles.dirBrowseBtn}
                      onPress={() => void handlePickDirectoryFile()}
                    >
                      <Ionicons name="folder-open-outline" size={16} color={C.ink} />
                      <Text style={styles.dirBrowseText}>选择</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.fieldTip}>
                    支持 Java/Spring Boot、.proto、SQL DDL、TS/JS 等工程目录，自动分析实体与架构。
                  </Text>
                </View>
              ) : null}

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
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setNewDomainModalOpen(false)}
              >
                <Text style={styles.cancelBtnText}>取消</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmBtn,
                  (!newDomainDisplayName.trim() || !newDomainSlug.trim() || creatingDomain) &&
                    styles.btnDisabled,
                ]}
                disabled={!newDomainDisplayName.trim() || !newDomainSlug.trim() || creatingDomain}
                onPress={() => void handleCreateDomain()}
              >
                {creatingDomain ? (
                  <ActivityIndicator size="small" color={C.ink} />
                ) : (
                  <Text style={styles.confirmBtnText}>
                    {newDomainMode === "directory" ? "创建并接入" : "创建本体"}
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * wave244 — 屏 1 内嵌图谱子组件.
 * 抽出理由是把 panResponder/ref/useMemo 这些 hooks 集中到一个稳定子组件,
 * 避免 OntologyDomainListScreen 在 `if (viewMode === "graph")` 条件块里调用 hooks
 * — 那是 react-hooks/rules-of-hooks 直接 break.
 */
function OntologyDomainGraphView({
  domain,
  snapshot,
  onBack,
}: {
  domain: OntologyDomain;
  snapshot: OntologyGraphSnapshot | null;
  onBack: () => void;
}) {
  const [selectedNodeTypeKey, setSelectedNodeTypeKey] = useState<string | null>(null);

  // nodeTypesList: 把 snapshot.counts.byNodeType + snapshot.nodes 合并成类型级视图.
  // wave216: byNodeType key 可能是 UUID, 这里用 isUuidLike 兜底; 同时把
  // nodes 里的 instance 按 label/非-UUID key 归类到类型, 让 typeKey 一定不是 UUID.
  const nodeTypesList = useMemo(() => {
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
        if (k) {
          const tk = isUuidLike(k) ? "(未归类对象)" : k;
          if (!map.has(tk)) {
            map.set(tk, {
              key: tk,
              label: isUuidLike(k) ? "(未归类对象)" : k,
              count,
              sampleProperties: {},
            });
          } else {
            const item = map.get(tk)!;
            item.count += count;
          }
        }
      }
    }
    for (const n of snapshot?.nodes || []) {
      const typeKey =
        n.label || (isUuidLike(n.key) ? "(未命名实例)" : n.key) || "(未命名实例)";
      if (!map.has(typeKey)) {
        map.set(typeKey, {
          key: typeKey,
          label: safeDisplay(n.label, "(未命名实体)"),
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
      map.set(domain.slug, {
        key: domain.slug,
        label: domain.display_name || domain.displayName || domain.slug,
        count: snapshot?.counts?.nodes ?? 0,
        sampleProperties: {
          domainId: domain.id,
          slug: domain.slug,
          category: domain.category || "业务本体",
          version: domain.schema_version ?? 1,
        },
      });
    }
    return Array.from(map.values());
  }, [snapshot, domain]);

  const selectedNt = useMemo(() => {
    if (!selectedNodeTypeKey) return nodeTypesList[0];
    return nodeTypesList.find((nt) => nt.key === selectedNodeTypeKey) ?? nodeTypesList[0];
  }, [nodeTypesList, selectedNodeTypeKey]);

  // 把类型级视图喂给统一的 OntologyGraphCanvas 组件. 节点是实体类型
  // (key 形如 entity_type:<typeKey>); 边是把 snapshot.instance-level 边
  // 映射到类型级 — 两端都能解析成 typeKey 才画.
  const canvasSize = 420;
  const graphResponse = useMemo<OntologyGraphResponse>(() => {
    const nodeIdType = new Map<string, string>();
    for (const n of snapshot?.nodes || []) {
      nodeIdType.set(n.id, n.label || n.key || "(未命名实例)");
    }
    const graphNodes = nodeTypesList.map((nt) => ({
      type: "entity_type",
      id: nt.key,
      key: `entity_type:${nt.key}`,
      label: nt.label,
      metadata: { count: nt.count },
    }));
    const seen = new Set<string>();
    const graphEdges: OntologyGraphResponse["edges"] = [];
    for (const e of snapshot?.edges || []) {
      const a = nodeIdType.get(e.sourceNodeId);
      const b = nodeIdType.get(e.targetNodeId);
      if (!a || !b || a === b) continue;
      const dedupe = [a, b].sort().join("→");
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      graphEdges.push({
        key: `e-${a}-${b}`,
        source: `entity_type:${a}`,
        target: `entity_type:${b}`,
        relation: e.relationKey ?? "无",
        weight: e.weight ?? 1,
      });
    }
    return {
      root: null,
      depth: 2,
      view: "project_tree",
      truncated: Boolean(
        snapshot?.counts?.edges && snapshot.counts.edges > graphEdges.length,
      ),
      nodes: graphNodes,
      edges: graphEdges,
    };
  }, [nodeTypesList, snapshot]);

  // pan + zoom (PanResponder, 与 wave239 workbench 同一套实现 — 单手指
  // 平移, 两指缩放). 状态放进 ref 是为了 gesture handler 在每次 render
  // 之间复用同一份 closure.
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const lastPan = useRef({ x: 0, y: 0 });
  const lastScale = useRef(1);
  const initialDistance = useRef<number | null>(null);
  const canvasPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          initialDistance.current = null;
        },
        onPanResponderMove: (evt, gestureState) => {
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
              const clamped = Math.max(0.5, Math.min(2.2, lastScale.current * ratio));
              scale.setValue(clamped);
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          onBack={onBack}
          backLabel="返回域详情"
          style={styles.detailNav}
          right={
            <Text style={styles.graphNavTitle}>
              {domain.display_name || domain.displayName || domain.slug} · 关系图谱
            </Text>
          }
        />

        <AppCard variant="surface" style={styles.graphCanvasCard}>
          <View style={styles.graphCanvasHeader}>
            <View>
              <Text style={styles.graphCanvasTitle}>实体关系拓扑</Text>
              <Text style={styles.graphCanvasSub}>
                {nodeTypesList.length} 个实体类型 · {snapshot?.counts?.edges ?? 0} 条关系 · 双指缩放 / 单指拖动
              </Text>
            </View>
            <View style={styles.graphLegend}>
              <View style={[styles.graphLegendDot, { backgroundColor: C.accent }]} />
              <Text style={styles.graphLegendText}>实体类型</Text>
            </View>
          </View>

          <View style={styles.graphCanvasViewport} {...canvasPanResponder.panHandlers}>
            <Animated.View
              style={{
                width: canvasSize,
                height: canvasSize,
                transform: [
                  { translateX: pan.x },
                  { translateY: pan.y },
                  { scale },
                ],
              }}
            >
              <OntologyGraphCanvas
                graph={graphResponse}
                canvasSize={canvasSize}
                selectedKey={
                  selectedNodeTypeKey ? `entity_type:${selectedNodeTypeKey}` : null
                }
                onSelectNode={(key) => {
                  const stripped = key.startsWith("entity_type:")
                    ? key.slice("entity_type:".length)
                    : key;
                  setSelectedNodeTypeKey(stripped);
                }}
              />
            </Animated.View>
          </View>

          {graphResponse.truncated ? (
            <Text style={styles.graphEdgesHint}>
              关系连线已去重, 显示 {graphResponse.edges.length} 条; 节点大小=该类型下的实例数
            </Text>
          ) : null}
        </AppCard>

        {Boolean(selectedNt) && (
          <AppCard variant="surface" style={styles.schemaCard}>
            <View style={styles.schemaCardHeader}>
              <View style={styles.schemaTitleRow}>
                <Ionicons name="cube-outline" size={16} color={C.accent} style={{ marginRight: 6 }} />
                <Text style={styles.schemaCardTitle}>
                  {safeDisplay(selectedNt.label, "(未命名实体)")}
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
  // wave239 — 顶部 4 chip 类别过滤条
  categoryChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    backgroundColor: C.panel,
  },
  categoryChipActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(94, 106, 210, 0.18)",
  },
  categoryChipText: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  categoryChipTextActive: {
    color: C.accent,
    fontWeight: "600",
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
  heroUuid: {
    color: C.ink4,
    fontSize: 10,
    fontFamily: "monospace",
    marginTop: 4,
    letterSpacing: 0.2,
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
  // wave244: pan + zoom 视口. 实际画布 (420×420) 比 viewport 大, 因此
  // 起始时即允许拖动 — viewport 切掉溢出部分, 但 panResponder 接到的
  // 手势落在 viewport 上.
  graphCanvasViewport: {
    width: "100%",
    height: 420,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  graphEdgesHint: {
    marginTop: 8,
    marginHorizontal: 8,
    color: C.ink4,
    fontSize: 10,
    textAlign: "center",
  },
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
  modalTabRow: {
    flexDirection: "row",
    backgroundColor: C.panel,
    borderRadius: 8,
    padding: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  modalTabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  modalTabBtnActive: {
    backgroundColor: C.surfaceHover,
  },
  modalTabBtnText: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  modalTabBtnTextActive: {
    color: C.ink,
    fontWeight: "600",
  },
  dirSelectBox: {
    backgroundColor: C.panel,
    borderColor: C.lineSubtle,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  dirInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  dirBrowseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.surfaceHover,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dirBrowseText: {
    color: C.ink,
    fontSize: 12,
    fontWeight: "500",
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
  fieldTip: {
    color: C.ink4,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
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

