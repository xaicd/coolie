import { useCallback, useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import type {
  Company,
  OntologyDomain,
  OntologyDomainLifecycleState,
  OntologyGraphSnapshot,
} from "@coolie/api-client";
import { C, coolie } from "../../coolie";
import { StatusDot } from "../../components/StatusDot";
import {
  OntologyDomainCard,
  domainLabel,
  isLockedDomain,
  type OntologyDomainStats,
} from "../../components/ontology/OntologyDomainCard";
import { useAsync } from "../../hooks/useAsync";
import { EmptyState } from "../../ui/EmptyState";
import { ErrorRetry } from "../../ui/ErrorRetry";
import { LoadingState } from "../../ui/LoadingState";
import { Pill } from "../../ui/Pill";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { SegmentedControl } from "../../ui/SegmentedControl";
import { ELEVATION, RADIUS, SPACING, TONE } from "../../ui/tokens";
import { OntologyDomainDetailScreen } from "./OntologyDomainDetailScreen";
import { OntologyGraphScreen } from "./OntologyGraphScreen";

export type DomainFilter = "all" | "active" | "draft" | "archived";
export type OntologyViewMode = "list" | "detail" | "graph";

export interface OntologyDomainListScreenProps {
  onOpenSettings?: () => void;
  company: Company;
  whoami?: string;
  onBack?: () => void;
}

/** 列表结果: 域清单 + 前几域的节点/关系计数 */
interface DomainListResult {
  domains: OntologyDomain[];
  stats: Record<string, OntologyDomainStats>;
}

/** 结果缓存 TTL: 切走再切回不重新打网络 */
const LIST_CACHE_TTL_MS = 30_000;
/** 计数预取的域数量上限 */
const PREFETCH_LIMIT = 5;
const PREFETCH_NODE_LIMIT = 50;
const DETAIL_NODE_LIMIT = 300;

const listCache = new Map<string, DomainListResult & { at: number }>();

/** TTL 内的缓存直接命中 (同步读, 供首帧渲染) */
function readCache(companyId: string): DomainListResult | null {
  const entry = listCache.get(companyId);
  if (!entry || Date.now() - entry.at >= LIST_CACHE_TTL_MS) return null;
  return { domains: entry.domains, stats: entry.stats };
}

function writeCache(companyId: string, value: DomainListResult): void {
  listCache.set(companyId, { ...value, at: Date.now() });
}

/**
 * 前 N 个域的计数预取 (原来每次刷新串行打 5 次请求):
 * 并发 Promise.all + 已缓存的域直接复用, 单域失败只丢它自己的计数。
 */
async function prefetchStats(
  companyId: string,
  domains: OntologyDomain[],
): Promise<Record<string, OntologyDomainStats>> {
  const stats: Record<string, OntologyDomainStats> = {
    ...(listCache.get(companyId)?.stats ?? {}),
  };
  const targets = domains.slice(0, PREFETCH_LIMIT).filter((d) => !stats[d.id]);

  const rows = await Promise.all(
    targets.map(async (domain) => {
      try {
        const snap = await coolie.getOntologySnapshot(companyId, domain.id, PREFETCH_NODE_LIMIT);
        return [
          domain.id,
          { nodes: snap?.counts?.nodes ?? 0, edges: snap?.counts?.edges ?? 0 },
        ] as const;
      } catch {
        return null;
      }
    }),
  );

  for (const row of rows) {
    if (row) stats[row[0]] = row[1];
  }
  return stats;
}

/**
 * 四档筛选: 全部 / 运行中 / 草稿 / 已归档 (PRD)。
 * 表驱动 → 加档位必须补谓词, 不会再有"有档位没分支"的空档 (审计缺陷 2)。
 * 「已归档」覆盖 archived / deprecated / locked 三个只读锁死状态。
 */
const FILTER_PREDICATES: Record<DomainFilter, (domain: OntologyDomain) => boolean> = {
  all: () => true,
  active: (domain) => domain.lifecycle_state === "active",
  draft: (domain) => domain.lifecycle_state === "draft",
  archived: isLockedDomain,
};

/** 第一层视图: 域列表 + 四档筛选, 并按 viewMode 切到详情 / 图谱 */
export function OntologyDomainListScreen({
  company,
  whoami = "管理员",
  onBack,
  onOpenSettings,
}: OntologyDomainListScreenProps) {
  const companyId = company.id;
  const [filter, setFilter] = useState<DomainFilter>("all");
  const [viewMode, setViewMode] = useState<OntologyViewMode>("list");
  const [selectedDomain, setSelectedDomain] = useState<OntologyDomain | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [seedingSample, setSeedingSample] = useState(false);

  const cached = readCache(companyId);

  const loadDomains = useCallback(async (): Promise<DomainListResult> => {
    const domains = await coolie.listOntologyDomains(companyId);
    const result = { domains, stats: await prefetchStats(companyId, domains) };
    writeCache(companyId, result);
    return result;
  }, [companyId]);

  // 命中新鲜缓存就不再发请求, 首帧直接用缓存渲染
  const { data, error, loading, refetch, setData } = useAsync(loadDomains, [companyId], {
    immediate: !cached,
  });

  const result = data ?? cached;
  const domains = result?.domains ?? [];
  const stats = result?.stats ?? {};

  const resultRef = useRef<DomainListResult | null>(result);
  resultRef.current = result;

  /** 就地改列表结果: 同时写回缓存, 保证切 tab 回来仍是新值 */
  const commitDomains = useCallback(
    (update: (prev: DomainListResult) => DomainListResult) => {
      const base = resultRef.current;
      if (!base) return;
      const next = update(base);
      writeCache(companyId, next);
      setData(next);
    },
    [companyId, setData],
  );

  // 详情快照 (300 条) 只在选中某个域时按需拉取
  const selectedId = selectedDomain?.id ?? null;
  const {
    data: snapshot,
    error: snapshotError,
    loading: snapshotLoading,
    refetch: reloadSnapshot,
    setData: setSnapshot,
  } = useAsync(
    () =>
      selectedId
        ? coolie.getOntologySnapshot(companyId, selectedId, DETAIL_NODE_LIMIT)
        : Promise.resolve<OntologyGraphSnapshot | null>(null),
    [companyId, selectedId],
    { immediate: Boolean(selectedId) },
  );

  // 详情快照回填卡片计数, 省掉之后再预取一次
  useEffect(() => {
    if (!selectedId || !snapshot?.counts) return;
    commitDomains((prev) => ({
      ...prev,
      stats: {
        ...prev.stats,
        [selectedId]: {
          nodes: snapshot.counts.nodes ?? 0,
          edges: snapshot.counts.edges ?? 0,
        },
      },
    }));
  }, [selectedId, snapshot, commitDomains]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  }, [refetch]);

  const openDomainDetail = useCallback(
    (domain: OntologyDomain) => {
      setSnapshot(null);
      setSelectedDomain(domain);
      setViewMode("detail");
    },
    [setSnapshot],
  );

  const closeDetail = useCallback(() => {
    setSelectedDomain(null);
    setViewMode("list");
    setSnapshot(null);
  }, [setSnapshot]);

  // 生命周期就地更新: 列表与当前选中域同步改, 不等下一次全量刷新
  const patchLifecycle = useCallback(
    (domainId: string, state: OntologyDomainLifecycleState) => {
      setSelectedDomain((prev) =>
        prev && prev.id === domainId ? { ...prev, lifecycle_state: state } : prev,
      );
      commitDomains((prev) => ({
        ...prev,
        domains: prev.domains.map((item) =>
          item.id === domainId ? { ...item, lifecycle_state: state } : item,
        ),
      }));
    },
    [commitDomains],
  );

  // 执行熔断 (失败交给 EmergencyKillSwitch 提示)
  const triggerKillSwitch = useCallback(
    async (domain: OntologyDomain) => {
      await coolie.setDomainLifecycle(companyId, domain.id, "locked", {
        actor: whoami,
        reason: "移动端掌上紧急熔断 (EMERGENCY_LOCKED)",
        deviceInfo: "Coolie-Mobile-Expo",
      });
      patchLifecycle(domain.id, "archived");
      Alert.alert(
        "🚨 紧急熔断生效",
        `本体域「${domainLabel(domain)}」已进入锁死状态 (ARCHIVED/LOCKED)。后续读写已即刻拦截，审计事件已写入 ontology_audit_logs。`,
      );
    },
    [companyId, whoami, patchLifecycle],
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
                patchLifecycle(domain.id, "active");
                Alert.alert("已解除锁定", "本体域状态已恢复为 active");
              } catch (e) {
                Alert.alert("解除锁定失败", String((e as Error)?.message ?? e));
              }
            },
          },
        ],
      );
    },
    [companyId, whoami, patchLifecycle],
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
          const seeded = await coolie.seedDomainSamples(companyId, domainId);
          if (seeded.seeded) {
            injectedDomains += 1;
            injectedNodes += seeded.created?.nodes ?? seeded.counts?.nodes ?? 0;
          }
        } catch {
          // 单个域失败跳过,不影响其余域
        }
      }

      await refetch();
      Alert.alert("注入完成", `已注入 ${injectedDomains} 个域 · ${injectedNodes} 个实例节点`);
    } catch (e) {
      Alert.alert("注入失败", String((e as Error)?.message ?? e));
    } finally {
      setSeedingSample(false);
    }
  }, [companyId, refetch]);

  const activeCount = domains.filter(FILTER_PREDICATES.active).length;
  const draftCount = domains.filter(FILTER_PREDICATES.draft).length;
  const archivedCount = domains.filter(FILTER_PREDICATES.archived).length;
  const filteredDomains = domains.filter(FILTER_PREDICATES[filter]);

  // 第三层: 关系图谱交互浏览 (Graph View)
  if (viewMode === "graph" && selectedDomain) {
    return (
      <OntologyGraphScreen
        domain={selectedDomain}
        snapshot={snapshot}
        onBack={() => setViewMode("detail")}
      />
    );
  }

  // 第二层: 域详情与快照摘要 (Snapshot Summary View)
  if (selectedDomain) {
    return (
      <OntologyDomainDetailScreen
        domain={selectedDomain}
        stats={stats[selectedDomain.id]}
        snapshot={snapshot}
        snapshotLoading={snapshotLoading}
        snapshotError={snapshotError}
        whoami={whoami}
        onBack={closeDetail}
        onOpenGraph={() => setViewMode("graph")}
        onReloadSnapshot={reloadSnapshot}
        onTriggerKill={triggerKillSwitch}
        onUnlock={unlockDomain}
      />
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

        {/* 顶部四档过滤切换器 */}
        <SegmentedControl
          value={filter}
          onChange={(key) => setFilter(key as DomainFilter)}
          options={[
            { key: "all", label: `全部 (${domains.length})` },
            { key: "active", label: `运行中 (${activeCount})` },
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

      {loading && !result ? (
        <LoadingState text="正在加载业务本体域拓扑…" />
      ) : error ? (
        <ErrorRetry message={error} onRetry={refetch} />
      ) : filteredDomains.length === 0 ? (
        <EmptyState
          variant="standalone"
          icon="🌐"
          title="暂无匹配的业务本体域"
          subtitle="插件已挂载于 @paperclipai/plugin-ontology，可在后台创建电商、文旅等域。"
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
          renderItem={({ item }) => (
            <OntologyDomainCard
              domain={item}
              stats={stats[item.id]}
              whoami={whoami}
              onPress={() => openDomainDetail(item)}
              onTriggerKill={triggerKillSwitch}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  companyCapsule: { marginTop: 6, gap: 6 },
  companyCapsuleText: { color: C.ink2, fontSize: 11, fontWeight: "500" },
  companyCapsuleSubText: { color: C.ink4, fontSize: 11 },
  refreshBtn: {
    backgroundColor: ELEVATION.base,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  refreshBtnText: { color: C.ink2, fontSize: 12, fontWeight: "500" },
  seedBtn: { backgroundColor: TONE.brand.bg, borderColor: TONE.brand.border },
  seedBtnText: { color: C.accent, fontSize: 12, fontWeight: "500" },
  filterSwitcher: { marginTop: SPACING.md },
  listContent: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
});
