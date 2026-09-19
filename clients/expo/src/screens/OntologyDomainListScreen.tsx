import { useCallback, useEffect, useState } from "react";
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
  OntologyDomainLifecycleState,
  OntologyGraphSnapshot,
} from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { StatusDot } from "../components/StatusDot";
import { EmergencyKillSwitch } from "../components/EmergencyKillSwitch";

interface OntologyDomainListScreenProps {
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

export function OntologyDomainListScreen({
  company,
  whoami = "管理员",
  onBack,
}: OntologyDomainListScreenProps) {
  const [domains, setDomains] = useState<OntologyDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "locked">("all");

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
  const filteredDomains = domains.filter((d) => {
    const isLocked = d.lifecycle_state === "archived" || d.lifecycle_state === "deprecated";
    if (filter === "active") return d.lifecycle_state === "active";
    if (filter === "locked") return isLocked;
    return true;
  });

  const activeCount = domains.filter((d) => d.lifecycle_state === "active").length;
  const lockedCount = domains.filter(
    (d) => d.lifecycle_state === "archived" || d.lifecycle_state === "deprecated",
  ).length;

  // 如果选中了某个域，展示详情与快照摘要 (Snapshot Summary View)
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
          refreshControl={
            <RefreshControl
              refreshing={snapshotLoading}
              onRefresh={() => openDomainDetail(selectedDomain)}
              tintColor={C.accent}
            />
          }
        >
          {/* 顶部返回条 */}
          <View style={styles.detailNav}>
            <Pressable
              onPress={() => setSelectedDomain(null)}
              hitSlop={12}
              style={styles.backBtn}
            >
              <Text style={styles.backBtnText}>‹ 返回本体域列表</Text>
            </Pressable>
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

          {/* 域基础信息卡片 */}
          <View style={styles.heroCard}>
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
          </View>

          {/* 高危熔断控制闸门区 */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>高危安全闸门</Text>
              <Text style={styles.sectionHint}>PRD 需求⑪ 熔断通道</Text>
            </View>

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
                <Text style={styles.metricNum}>
                  {snapshot?.counts?.nodes ?? stats?.nodes ?? "0"}
                </Text>
                <Text style={styles.metricLabel}>实体节点数</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={[styles.metricNum, { color: C.accent }]}>
                  {snapshot?.counts?.edges ?? stats?.edges ?? "0"}
                </Text>
                <Text style={styles.metricLabel}>关系连线数</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricNum}>
                  {snapshot?.counts?.nodeTypes ?? "0"}
                </Text>
                <Text style={styles.metricLabel}>节点类型数</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={[styles.metricNum, { color: C.warn }]}>
                  {snapshot?.counts?.crossDomainEdges ?? "0"}
                </Text>
                <Text style={styles.metricLabel}>跨域依赖数</Text>
              </View>
            </View>
          </View>

          {/* 节点类型分布 breakdown */}
          {snapshot?.counts?.byNodeType &&
          Object.keys(snapshot.counts.byNodeType).length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>实体类型分布</Text>
              <View style={styles.cardList}>
                {Object.entries(snapshot.counts.byNodeType).map(
                  ([typeKey, count]) => (
                    <View key={typeKey || "none"} style={styles.subItemRow}>
                      <Text style={styles.subItemKey}>
                        {typeKey ? typeKey : "(未归类对象)"}
                      </Text>
                      <View style={styles.subItemBadge}>
                        <Text style={styles.subItemCount}>{count} 实体</Text>
                      </View>
                    </View>
                  ),
                )}
              </View>
            </View>
          ) : null}

          {/* 实体样本预览 */}
          {snapshot?.nodes && snapshot.nodes.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>
                实体节点抽样 ({Math.min(snapshot.nodes.length, 10)} /{" "}
                {snapshot.counts.nodes})
              </Text>
              <View style={styles.cardList}>
                {snapshot.nodes.slice(0, 8).map((node) => (
                  <View key={node.id} style={styles.nodeItem}>
                    <View style={styles.nodeHeader}>
                      <Text style={styles.nodeLabel}>{node.label}</Text>
                      <View style={styles.nodeBadge}>
                        <Text style={styles.nodeBadgeText}>
                          {node.lifecycleState || "active"}
                        </Text>
                      </View>
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
              <Text style={styles.sectionTitle}>
                关系连线抽样 ({Math.min(snapshot.edges.length, 6)} /{" "}
                {snapshot.counts.edges})
              </Text>
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
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              {onBack ? (
                <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
                  <Text style={styles.backBtnText}>‹</Text>
                </Pressable>
              ) : null}
              <Text style={styles.h1}>业务本体域</Text>
            </View>
            <View style={styles.companyCapsule}>
              <StatusDot status="ok" size={6} />
              <Text style={styles.companyCapsuleText} numberOfLines={1}>
                {company.name}
              </Text>
              <Text style={styles.companyCapsuleSubText}>· 资产底座</Text>
            </View>
          </View>

          <Pressable
            onPress={onRefresh}
            hitSlop={12}
            style={styles.refreshBtn}
          >
            <Text style={styles.refreshBtnText}>刷新</Text>
          </Pressable>
        </View>

        {/* 顶部过滤切换器 */}
        <View style={styles.filterSwitcher}>
          <Pressable
            style={[styles.filterBtn, filter === "all" && styles.filterBtnActive]}
            onPress={() => setFilter("all")}
          >
            <Text
              style={[
                styles.filterBtnText,
                filter === "all" && styles.filterBtnTextActive,
              ]}
            >
              全部 ({domains.length})
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.filterBtn,
              filter === "active" && styles.filterBtnActive,
            ]}
            onPress={() => setFilter("active")}
          >
            <Text
              style={[
                styles.filterBtnText,
                filter === "active" && styles.filterBtnTextActive,
              ]}
            >
              运行中 ({activeCount})
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.filterBtn,
              filter === "locked" && styles.filterBtnActive,
            ]}
            onPress={() => setFilter("locked")}
          >
            <Text
              style={[
                styles.filterBtnText,
                filter === "locked" && styles.filterBtnTextActive,
                lockedCount > 0 && { color: C.err },
              ]}
            >
              已锁定 ({lockedCount})
            </Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={styles.loadingText}>正在加载业务本体域拓扑…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={loadDomains}>
            <Text style={styles.retryBtnText}>重试</Text>
          </Pressable>
        </View>
      ) : filteredDomains.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🌐</Text>
          <Text style={styles.emptyTitle}>暂无匹配的业务本体域</Text>
          <Text style={styles.emptySub}>
            插件已挂载于 @paperclipai/plugin-ontology，可在后台创建电商、文旅等域。
          </Text>
        </View>
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
              <Pressable
                style={({ pressed }) => [
                  styles.domainCard,
                  pressed && styles.domainCardPressed,
                  isLocked && styles.domainCardLocked,
                ]}
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

                {/* 描述文案 */}
                {item.description ? (
                  <Text style={styles.domainDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}

                {/* 指标与标签卡脚 */}
                <View style={styles.cardFooter}>
                  <View style={styles.footerPills}>
                    <View style={styles.statPill}>
                      <Text style={styles.statPillLabel}>节点</Text>
                      <Text style={styles.statPillValue}>
                        {stats ? stats.nodes : "--"}
                      </Text>
                    </View>
                    <View style={styles.statPill}>
                      <Text style={styles.statPillLabel}>关系</Text>
                      <Text style={styles.statPillValue}>
                        {stats ? stats.edges : "--"}
                      </Text>
                    </View>
                    <View style={styles.tagPill}>
                      <Text style={styles.tagPillText}>
                        v{item.schema_version ?? item.version ?? 1}
                      </Text>
                    </View>
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
              </Pressable>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  h1: {
    color: C.ink,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  backBtn: {
    paddingVertical: 4,
    paddingRight: 6,
  },
  backBtnText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: "500",
  },
  companyCapsule: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
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
  filterSwitcher: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    padding: 2,
    marginTop: 12,
  },
  filterBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: 6,
  },
  filterBtnActive: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  filterBtnText: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  filterBtnTextActive: {
    color: C.ink,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  domainCard: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  domainCardPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
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
  badgePill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "500",
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
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    gap: 4,
  },
  statPillLabel: {
    color: C.ink4,
    fontSize: 10,
  },
  statPillValue: {
    color: C.ink2,
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  tagPill: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  tagPillText: {
    color: C.ink3,
    fontSize: 10,
  },
  enterChevron: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "500",
  },
  cardKillSwitchWrap: {
    marginTop: 10,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    color: C.ink3,
    fontSize: 13,
    marginTop: 12,
  },
  errorText: {
    color: C.err,
    fontSize: 13,
    textAlign: "center",
    marginBottom: 12,
  },
  retryBtn: {
    backgroundColor: C.brand,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryBtnText: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "500",
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 12,
  },
  emptyTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  emptySub: {
    color: C.ink4,
    fontSize: 12,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 280,
  },
  detailNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  heroCard: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
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
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.2,
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
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  metricNum: {
    color: C.ink,
    fontSize: 22,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.4,
  },
  metricLabel: {
    color: C.ink3,
    fontSize: 11,
    marginTop: 4,
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
  subItemBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  subItemCount: {
    color: C.accent,
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
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
  nodeBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  nodeBadgeText: {
    color: C.ink3,
    fontSize: 10,
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
});
