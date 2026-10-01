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
import * as DocumentPicker from "expo-document-picker";
import type {
  Company,
  OntologyDomain,
  OntologyEntityTypeLevel,
  OntologyDomainLevel,
  OntologyLevelsResponse,
  OntologyInstanceRow,
  OntologyPropertiesResponse,
} from "@coolie/api-client";
import { C, coolie as _coolie } from "../coolie";
import { coolie } from "../coolie";
import { StatusDot } from "../components/StatusDot";
import { EmergencyKillSwitch } from "../components/EmergencyKillSwitch";
import { OntologyDrillBreadcrumb } from "../components/OntologyDrillBreadcrumb";
import { AppCard } from "../ui/AppCard";
import { RADIUS } from "../ui/tokens";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { Pill } from "../ui/Pill";
import { ScreenHeader } from "../ui/ScreenHeader";
import { SectionHeader } from "../ui/SectionHeader";
import { StatTile } from "../ui/StatTile";
import { StatusBadge } from "../ui/StatusBadge";

/**
 * Wave261 — five-level drilldown for the 业务本体 tab.
 *
 *   L0 公司 — top of the breadcrumb (company name, always present)
 *   L1 域   — 5 chip-style domain buckets (业务 / 项目 / 员工 / 资产 / 模板)
 *              fetched via `GET /api/companies/:id/ontology/levels`
 *   L2 类型 — every entityType the company owns (project / issue / spec /
 *              conversation / work_product / attachment / comment / agent),
 *              rendered as a FlatList with NO truncation (boss screenshot
 *              was 75 entities squeezed into a 420×420 ring).
 *   L3 实例 — drilldown into the rows of one entityType via
 *              `GET /api/companies/:id/ontology/instances?entityType=...`,
 *              grouped by owner chip (agy 草图 §2).
 *   L4 属性 — single instance's property bag, fetched via the type's
 *              `/types/:typeId/properties` (the schema editor list) plus
 *              the row's own props.
 *
 * The screen's previous 2021-line monolith embedded a `viewMode === "graph"`
 * inner ring (wave244) which is exactly what boss said was wrong — we
 * delete that path and let 屏 4 workbench own the immersive view.
 *
 * Navigation: a single `view` state machine + a drilldown breadcrumb keeps
 * the back-stack flat. There is one "new domain" modal (preserved from
 * wave239) accessible from the L1 header; kill switch (wave244) and
 * long-press "实例图谱 / 编辑字段" actions are preserved for the L1 row.
 */
type DrillLevel = "L1-domains" | "L2-types" | "L3-instances" | "L4-properties";

interface DrillContext {
  domain: OntologyDomainLevel | null;
  entityType: OntologyEntityTypeLevel | null;
  instance: OntologyInstanceRow | null;
}

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

// 老板要的"5 域" — server 端按 category 聚合, 这里只是显示标签
const DOMAIN_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  业务: "briefcase-outline",
  项目: "folder-outline",
  员工: "people-outline",
  资产: "cube-outline",
  模板: "layers-outline",
  uncategorized: "help-outline",
};

export function OntologyDomainListScreen({
  company,
  whoami = "管理员",
  onOpenWebOntology,
  onOpenSchemaEditor,
  onOpenInstanceGraph,
}: OntologyDomainListScreenProps) {
  // ── 顶部状态 ──
  const [view_2, setView2] = useState<DrillLevel>("L1-domains");
  const [ctx, setCtx] = useState<DrillContext>({
    domain: null,
    entityType: null,
    instance: null,
  });
  const [levels, setLevels] = useState<OntologyLevelsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 域 CRUD (wave239 modal) ──
  const [newDomainModalOpen, setNewDomainModalOpen] = useState(false);
  const [newDomainMode, setNewDomainMode] = useState<"directory" | "manual">("directory");
  const [newDomainDisplayName, setNewDomainDisplayName] = useState("");
  const [newDomainSlug, setNewDomainSlug] = useState("");
  const [newDomainDescription, setNewDomainDescription] = useState("");
  const [newDomainDirectoryPath, setNewDomainDirectoryPath] = useState("");
  const [creatingDomain, setCreatingDomain] = useState(false);
  const [seedingSample, setSeedingSample] = useState(false);

  // ── L3 实例列表 ──
  const [instances, setInstances] = useState<OntologyInstanceRow[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(false);

  // ── L4 属性 ──
  const [typeProperties, setTypeProperties] = useState<OntologyPropertiesResponse | null>(null);
  const [typePropertiesLoading, setTypePropertiesLoading] = useState(false);

  // ── kill switch 持久化旧域 (用于详情 fallback) ──
  const [legacyDomains, setLegacyDomains] = useState<OntologyDomain[]>([]);

  const companyId = company.id;

  // ── 加载 L0/L1 摘要 ──
  const loadLevels = useCallback(async () => {
    setError(null);
    try {
      const res = await coolie.getOntologyLevels(companyId);
      setLevels(res);
      // 旧域列表 (用于 modal 新建 + kill switch)
      try {
        const list = await coolie.listOntologyDomains(companyId);
        setLegacyDomains(list);
      } catch {
        // ignore — L1 chip 不强需要 legacy list
      }
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadLevels();
  }, [loadLevels]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadLevels();
  }, [loadLevels]);

  // ── 加载 L3 ──
  useEffect(() => {
    if (view_2 !== "L3-instances" || !ctx.entityType) return;
    let cancelled = false;
    setInstancesLoading(true);
    void coolie
      .listOntologyInstances(companyId, {
        entityType: ctx.entityType.entityType,
        limit: 200, // validator max — 全显示, 不截断
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
  }, [view_2, ctx.entityType, companyId]);

  // ── 加载 L4 ──
  useEffect(() => {
    if (view_2 !== "L4-properties" || !ctx.entityType) return;
    let cancelled = false;
    setTypePropertiesLoading(true);
    // 找 typeId — server 的 /levels 端点没有 typeId, 我们用 entityType 字符串作为 typeId proxy
    // (schema editor 接受任意字符串, 它读 entityType 内部用)
    void coolie
      .getOntologyTypeProperties(companyId, ctx.entityType.entityType)
      .then((res) => {
        if (!cancelled) setTypeProperties(res);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(String(e.message ?? e));
      })
      .finally(() => {
        if (!cancelled) setTypePropertiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view_2, ctx.entityType, companyId]);

  // ── 跳层 ──
  const drillToType = useCallback(
    (et: OntologyEntityTypeLevel, domain: OntologyDomainLevel) => {
      setCtx({ domain, entityType: et, instance: null });
      setView2("L3-instances");
    },
    [],
  );
  const drillToInstance = useCallback(
    (instance: OntologyInstanceRow) => {
      setCtx((prev) => ({ ...prev, instance }));
      setView2("L4-properties");
    },
    [],
  );
  const goBack = useCallback((to: DrillLevel) => {
    setView2(to);
  }, []);

  // ── wave244 kill switch (L1 long press) ──
  const triggerKillSwitch = useCallback(
    async (domain: OntologyDomain) => {
      try {
        await coolie.setDomainLifecycle(companyId, domain.id, "locked", {
          actor: whoami,
          reason: "移动端掌上紧急熔断 (EMERGENCY_LOCKED)",
          deviceInfo: "Coolie-Mobile-Expo",
        });
        Alert.alert(
          "🚨 紧急熔断生效",
          `本体域「${domain.display_name || domain.displayName || domain.slug}」已进入锁死状态 (ARCHIVED/LOCKED)。后续读写已即刻拦截。`,
        );
        await loadLevels();
      } catch (e) {
        Alert.alert("熔断失败", String((e as Error)?.message ?? e));
      }
    },
    [companyId, whoami, loadLevels],
  );

  // ── 新建域 (wave239 modal — 保留) ──
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
          ? { sourceDirectory: newDomainDirectoryPath.trim(), pipelineMode: "virtualization" }
          : undefined,
      });
      setNewDomainModalOpen(false);
      setNewDomainDisplayName("");
      setNewDomainSlug("");
      setNewDomainDescription("");
      setNewDomainDirectoryPath("");
      await loadLevels();
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
    loadLevels,
  ]);

  const handleSeedSample = useCallback(async () => {
    setSeedingSample(true);
    try {
      const report = await coolie.seedSampleDomains(companyId);
      Alert.alert(
        "注入完成",
        `已创建 ${report.created} 个示例域 (跳过 ${report.skipped}, 失败 ${report.failed})`,
      );
      await loadLevels();
    } catch (e) {
      Alert.alert("注入失败", String((e as Error)?.message ?? e));
    } finally {
      setSeedingSample(false);
    }
  }, [companyId, loadLevels]);

  // ── breadcrumb segments ──
  const breadcrumbLevels = useMemo(() => {
    const companyLabel = company.name || "公司";
    const segs = [
      { id: "L0", label: companyLabel },
    ];
    const typed: import("../components/OntologyDrillBreadcrumb").OntologyDrillLevel[] = segs;
    if (ctx.domain) {
      typed.push({
        id: `L1-${ctx.domain.domainId}`,
        label: `${ctx.domain.displayName} · ${ctx.domain.instanceCount} 实例`,
        onPress: view_2 !== "L1-domains" ? () => goBack("L1-domains") : undefined,
      });
    }
    if (ctx.entityType) {
      typed.push({
        id: `L2-${ctx.entityType.entityType}`,
        label: `${ctx.entityType.entityType} · ${ctx.entityType.count} 实体`,
        onPress:
          view_2 === "L3-instances" || view_2 === "L4-properties"
            ? () => goBack("L2-types")
            : undefined,
      });
    }
    if (view_2 === "L3-instances" && ctx.entityType) {
      typed.push({
        id: `L3-${ctx.entityType.entityType}`,
        label: `${instances.length} 个实例`,
      });
    }
    if (view_2 === "L4-properties" && ctx.instance) {
      typed.push({
        id: `L4-${ctx.instance.id}`,
        label: ctx.instance.label || "属性",
        icon: "cube-outline" as const,
      });
    }
    return typed;
  }, [company.name, ctx, view_2, instances.length, goBack]);

  // ── L1 域 ──
  if (view_2 === "L1-domains") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
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
        </View>

        {loading ? (
          <LoadingState text="正在加载业务本体域拓扑…" />
        ) : error ? (
          <ErrorRetry message={error} onRetry={loadLevels} />
        ) : !levels || levels.byDomain.length === 0 ? (
          <EmptyState
            variant="standalone"
            icon="🌐"
            title="暂无业务本体域"
            subtitle="当前工坊尚未初始化任何业务本体。您可以一键注入官方示例本体域。"
            action={
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <Pressable
                  style={[styles.primaryBtn, { paddingHorizontal: 16, paddingVertical: 10 }]}
                  onPress={() => setNewDomainModalOpen(true)}
                >
                  <Text style={styles.primaryBtnText}>+ 新建本体</Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryBtn, { paddingHorizontal: 16, paddingVertical: 10 }]}
                  disabled={seedingSample}
                  onPress={() => void handleSeedSample()}
                >
                  {seedingSample ? (
                    <ActivityIndicator size="small" color={C.accent} />
                  ) : (
                    <Text style={styles.secondaryBtnText}>✨ 注入示例域</Text>
                  )}
                </Pressable>
              </View>
            }
          />
        ) : (
          <FlatList
            data={levels.byDomain}
            keyExtractor={(item) => item.domainId}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
            }
            ListHeaderComponent={
              <SectionHeader
                emphasis
                title="5 大业务本体域"
                hint="5 个域各自下钻 L2 类型 → L3 实例 → L4 属性"
              />
            }
            renderItem={({ item }) => (
              <DomainChipCard
                domain={item}
                entityTypes={
                  levels.byEntityType.filter((et) => {
                    // match by domain's category as bucket
                    if (item.domainId === "业务") {
                      return ["issue", "spec", "conversation", "comment"].includes(
                        et.entityType,
                      );
                    }
                    if (item.domainId === "项目") {
                      return et.entityType === "project";
                    }
                    if (item.domainId === "员工") {
                      return et.entityType === "agent";
                    }
                    if (item.domainId === "资产") {
                      return ["work_product", "attachment"].includes(et.entityType);
                    }
                    return ![
                      "issue",
                      "spec",
                      "conversation",
                      "comment",
                      "project",
                      "agent",
                      "work_product",
                      "attachment",
                    ].includes(et.entityType);
                  })
                }
                onPress={() => {
                  setCtx({ domain: item, entityType: null, instance: null });
                  setView2("L2-types");
                }}
                onLongPress={
                  onOpenInstanceGraph
                    ? () => {
                        Alert.alert(
                          item.displayName,
                          "选择下一步操作",
                          [
                            {
                              text: "实例图谱",
                              onPress: () =>
                                onOpenInstanceGraph(item.domainId, item.displayName),
                            },
                            onOpenSchemaEditor
                              ? {
                                  text: "编辑字段",
                                  onPress: () =>
                                    onOpenSchemaEditor(item.domainId, item.displayName),
                                }
                              : { text: "编辑字段", style: "cancel" as const },
                            { text: "取消", style: "cancel" as const },
                          ],
                          { cancelable: true },
                        );
                      }
                    : undefined
                }
              />
            )}
          />
        )}

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

  // ── L2 类型 ──
  if (view_2 === "L2-types" && ctx.domain) {
    const entityTypes = levels
      ? filterEntityTypesForDomain(levels.byEntityType, ctx.domain)
      : [];
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <OntologyDrillBreadcrumb levels={breadcrumbLevels} />
        </View>
        <FlatList
          data={entityTypes}
          keyExtractor={(item) => item.entityType}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
          }
          ListHeaderComponent={
            <AppCard variant="surface" padding={14} style={styles.heroCard}>
              <Text style={styles.heroTitle}>{ctx.domain.displayName}</Text>
              <Text style={styles.heroSub}>
                {ctx.domain.instanceCount} 个实例 · {ctx.domain.typeCount} 个类型 · {ctx.domain.edgeCount} 条关系
              </Text>
              <View style={styles.metaRow}>
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipLabel}>分类</Text>
                  <Text style={styles.metaChipValue}>{ctx.domain.category}</Text>
                </View>
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipLabel}>L2 类型</Text>
                  <Text style={styles.metaChipValue}>{entityTypes.length} 个</Text>
                </View>
              </View>
            </AppCard>
          }
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="📦"
                title="该域暂无类型"
                subtitle="该域没有关联任何实体类型。"
              />
            ) : null
          }
          renderItem={({ item }) => (
            <EntityTypeCard entityType={item} onPress={() => drillToType(item, ctx.domain!)} />
          )}
        />
      </SafeAreaView>
    );
  }

  // ── L3 实例 ──
  if (view_2 === "L3-instances" && ctx.entityType) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <OntologyDrillBreadcrumb levels={breadcrumbLevels} />
        </View>
        {instancesLoading ? (
          <LoadingState text="加载实例…" />
        ) : instances.length === 0 ? (
          <EmptyState
            icon="📋"
            title="暂无实例"
            subtitle={`${ctx.entityType.entityType} 暂无实例数据，换个类型试试。`}
          />
        ) : (
          <FlatList
            data={instances}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={C.accent}
              />
            }
            ListHeaderComponent={
              <AppCard variant="surface" padding={14} style={styles.heroCard}>
                <Text style={styles.heroTitle}>{ctx.entityType.entityType}</Text>
                <Text style={styles.heroSub}>
                  {instances.length} 个实例 · 按实例列表展示 · 不截断
                </Text>
              </AppCard>
            }
            renderItem={({ item }) => (
              <InstanceCard instance={item} onPress={() => drillToInstance(item)} />
            )}
          />
        )}
      </SafeAreaView>
    );
  }

  // ── L4 属性 ──
  if (view_2 === "L4-properties" && ctx.instance) {
    const inst = ctx.instance;
    const meta = inst.metadata ?? {};
    const metaEntries = Object.entries(meta);
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <OntologyDrillBreadcrumb levels={breadcrumbLevels} />
        </View>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={typePropertiesLoading}
              onRefresh={onRefresh}
              tintColor={C.accent}
            />
          }
        >
          <AppCard variant="surface" padding={16} style={styles.heroCard}>
            <Text style={styles.heroTitle}>{inst.label}</Text>
            <Text style={styles.heroUuid} numberOfLines={1}>
              UUID · {inst.id}
            </Text>
            {inst.ownerLabel ? (
              <View style={styles.metaRow}>
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipLabel}>负责人</Text>
                  <Text style={styles.metaChipValue}>{inst.ownerLabel}</Text>
                </View>
              </View>
            ) : null}
          </AppCard>

          <View style={styles.sectionBlock}>
            <SectionHeader
              emphasis
              title="实例属性"
              hint={`${metaEntries.length} 个字段`}
            />
            {metaEntries.length === 0 ? (
              <Text style={styles.emptyHint}>该实例没有附带属性字段。</Text>
            ) : (
              <AppCard variant="surface" padding={10}>
                {metaEntries.map(([key, val], idx) => (
                  <View
                    key={key}
                    style={[
                      styles.propRow,
                      idx < metaEntries.length - 1 ? styles.propRowBorder : null,
                    ]}
                  >
                    <Text style={styles.propRowKey}>{key}</Text>
                    <Text style={styles.propRowVal} numberOfLines={2}>
                      {formatValue(val)}
                    </Text>
                  </View>
                ))}
              </AppCard>
            )}
          </View>

          {typeProperties && typeProperties.properties.length > 0 ? (
            <View style={styles.sectionBlock}>
              <SectionHeader
                emphasis
                title="类型 Schema"
                hint={`${typeProperties.properties.length} 个字段定义`}
              />
              <AppCard variant="surface" padding={10}>
                {typeProperties.properties.map((prop, idx) => (
                  <View
                    key={prop.key}
                    style={[
                      styles.propRow,
                      idx < typeProperties.properties.length - 1
                        ? styles.propRowBorder
                        : null,
                    ]}
                  >
                    <Text style={styles.propRowKey}>{prop.key}</Text>
                    <View style={styles.schemaBadgeRow}>
                      <Pill label={prop.type} size="sm" tone="accent" />
                      {prop.sample ? (
                        <Text style={styles.propRowSample}>{prop.sample}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </AppCard>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Fallback (state machine bug) — render L1 anyway.
  return null;
}

/**
 * Map a domain bucket to the entityType list that belongs to it. Mirrors
 * the server-side `TYPE_TO_DOMAIN` map in `ontology-graph.ts`; both stay
 * in sync because the entityTypes are filtered by category.
 */
function filterEntityTypesForDomain(
  allTypes: OntologyEntityTypeLevel[],
  domain: OntologyDomainLevel,
): OntologyEntityTypeLevel[] {
  const MAP: Record<string, string[]> = {
    业务: ["issue", "spec", "conversation", "comment"],
    项目: ["project"],
    员工: ["agent"],
    资产: ["work_product", "attachment"],
    模板: [],
  };
  const allowed = MAP[domain.domainId] ?? [];
  if (allowed.length === 0) return allTypes;
  return allTypes.filter((et) => allowed.includes(et.entityType));
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

// ── 子组件 ──

function DomainChipCard({
  domain,
  entityTypes,
  onPress,
  onLongPress,
}: {
  domain: OntologyDomainLevel;
  entityTypes: OntologyEntityTypeLevel[];
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const iconName = DOMAIN_ICON[domain.domainId] ?? "layers-outline";
  return (
    <AppCard
      style={styles.domainChipCard}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={styles.domainChipRow}>
        <View style={[styles.domainIcon, { borderColor: "rgba(94, 106, 210, 0.35)" }]}>
          <Ionicons name={iconName} size={20} color={C.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.domainTitle}>{domain.displayName}</Text>
          <Text style={styles.domainDesc} numberOfLines={1}>
            {domain.instanceCount} 个实例 · {domain.typeCount} 个类型 · {domain.edgeCount} 条关系
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={C.ink4} />
      </View>
      {entityTypes.length > 0 ? (
        <View style={styles.domainChipFooter}>
          {entityTypes.slice(0, 6).map((et) => (
            <Pill
              key={et.entityType}
              label={`${et.entityType} · ${et.count}`}
              size="sm"
            />
          ))}
          {entityTypes.length > 6 ? (
            <Pill label={`+${entityTypes.length - 6}`} size="sm" />
          ) : null}
        </View>
      ) : null}
    </AppCard>
  );
}

function EntityTypeCard({
  entityType,
  onPress,
}: {
  entityType: OntologyEntityTypeLevel;
  onPress: () => void;
}) {
  return (
    <AppCard style={styles.entityTypeCard} onPress={onPress}>
      <View style={styles.entityTypeRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.entityTypeKey}>{entityType.entityType}</Text>
          <Text style={styles.entityTypeSub}>
            {entityType.count} 个实例 · {entityType.edgeCount} 条关系
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={C.ink4} />
      </View>
    </AppCard>
  );
}

function InstanceCard({
  instance,
  onPress,
}: {
  instance: OntologyInstanceRow;
  onPress: () => void;
}) {
  return (
    <AppCard style={styles.instanceCard} onPress={onPress}>
      <View style={styles.instanceRow}>
        <View style={styles.instanceDot} />
        <View style={{ flex: 1 }}>
          <Text style={styles.instanceLabel} numberOfLines={1}>
            {instance.label}
          </Text>
          {instance.ownerLabel ? (
            <Text style={styles.instanceOwner} numberOfLines={1}>
              负责人 · {instance.ownerLabel}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={C.ink4} />
      </View>
    </AppCard>
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
                    onChangeText={setDisplayName /* placeholder state, see below */}
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
                placeholder="如：orders, trade_center"
                placeholderTextColor={C.ink4}
                value={slug}
                onChangeText={setSlug}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>业务描述 (可选)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="例：涵盖账户、交易订单、履约配送三类实体模型与关系"
                placeholderTextColor={C.ink4}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>取消</Text>
            </Pressable>
            <Pressable
              style={[
                styles.confirmBtn,
                (!displayName.trim() || !slug.trim() || creating) && styles.btnDisabled,
              ]}
              disabled={!displayName.trim() || !slug.trim() || creating}
              onPress={onSubmit}
            >
              {creating ? (
                <ActivityIndicator size="small" color={C.ink} />
              ) : (
                <Text style={styles.confirmBtnText}>
                  {mode === "directory" ? "创建并接入" : "创建本体"}
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── 样式 ──

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  container: { flex: 1, backgroundColor: C.bg },
  scrollContent: { padding: 16, paddingBottom: 40 },

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
  },
  headerTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  headerSub: {
    color: C.ink4,
    fontSize: 11,
    marginTop: 2,
  },
  headerActions: {
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
  newDomainBtnText: { fontSize: 12, fontWeight: "600", color: C.ink },

  listContent: { padding: 16, paddingBottom: 32 },

  heroCard: { marginBottom: 16 },
  heroTitle: { color: C.ink, fontSize: 18, fontWeight: "600", letterSpacing: -0.4 },
  heroSub: { color: C.ink3, fontSize: 12, marginTop: 4 },
  heroUuid: { color: C.ink4, fontSize: 10, fontFamily: "monospace", marginTop: 6 },
  metaRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  metaChip: { flex: 1 },
  metaChipLabel: { color: C.ink4, fontSize: 10 },
  metaChipValue: { color: C.ink2, fontSize: 12, fontWeight: "500", marginTop: 2 },

  sectionBlock: { marginBottom: 20 },
  emptyHint: { color: C.ink4, fontSize: 12, paddingHorizontal: 8, paddingVertical: 12 },

  // L1 domain chip
  domainChipCard: { marginBottom: 12 },
  domainChipRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  domainIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(94, 106, 210, 0.08)",
  },
  domainTitle: { color: C.ink, fontSize: 15, fontWeight: "600" },
  domainDesc: { color: C.ink4, fontSize: 11, marginTop: 2 },
  domainChipFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },

  // L2 entity type card
  entityTypeCard: { marginBottom: 8 },
  entityTypeRow: { flexDirection: "row", alignItems: "center" },
  entityTypeKey: {
    color: C.ink,
    fontSize: 13,
    fontFamily: "monospace",
    fontWeight: "600",
  },
  entityTypeSub: { color: C.ink4, fontSize: 11, marginTop: 2 },

  // L3 instance card
  instanceCard: { marginBottom: 6 },
  instanceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  instanceDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  instanceLabel: { color: C.ink, fontSize: 13, fontWeight: "500" },
  instanceOwner: { color: C.ink4, fontSize: 11, marginTop: 2 },

  // L4 property row
  propRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    justifyContent: "space-between",
  },
  propRowBorder: { borderBottomWidth: 1, borderBottomColor: C.lineSubtle },
  propRowKey: { color: C.ink2, fontSize: 12, fontWeight: "600", flex: 1 },
  propRowVal: {
    color: C.ink,
    fontSize: 12,
    maxWidth: "60%",
    textAlign: "right",
    fontFamily: "monospace",
  },
  propRowSample: { color: C.ink4, fontSize: 10, marginLeft: 6 },
  schemaBadgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },

  // Buttons
  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: C.ink, fontSize: 14, fontWeight: "600" },
  secondaryBtn: {
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    borderColor: "rgba(94, 106, 210, 0.35)",
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: C.accent, fontSize: 14, fontWeight: "500" },

  // Modal
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
  modalTitle: { color: C.ink, fontSize: 16, fontWeight: "600" },
  modalTabRow: {
    flexDirection: "row",
    backgroundColor: C.panel,
    borderRadius: 8,
    padding: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  modalTabBtn: { flex: 1, paddingVertical: 7, alignItems: "center", justifyContent: "center", borderRadius: 6 },
  modalTabBtnActive: { backgroundColor: C.surfaceHover },
  modalTabBtnText: { color: C.ink3, fontSize: 12, fontWeight: "500" },
  modalTabBtnTextActive: { color: C.ink, fontWeight: "600" },
  dirSelectBox: {
    backgroundColor: C.panel,
    borderColor: C.lineSubtle,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  dirInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
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
  dirBrowseText: { color: C.ink, fontSize: 12, fontWeight: "500" },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { color: C.ink2, fontSize: 12, fontWeight: "500", marginBottom: 6 },
  fieldTip: { color: C.ink4, fontSize: 11, lineHeight: 16, marginTop: 6 },
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
  textArea: { height: 64, textAlignVertical: "top", paddingTop: 8 },
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
  cancelBtnText: { color: C.ink3, fontSize: 13, fontWeight: "500" },
  confirmBtn: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 96,
  },
  confirmBtnText: { color: C.ink, fontSize: 13, fontWeight: "600" },
  btnDisabled: { opacity: 0.5 },
});