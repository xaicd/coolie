import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import type {
  Company,
  GovernanceGate,
  GovernanceSummary,
  OntologyDomain,
  OntologyResourceLink,
  Project,
} from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { RADIUS } from "../ui/tokens";
import { AppCard } from "../ui/AppCard";
import { StatusBadge } from "../ui/StatusBadge";
import { EmptyState } from "../ui/EmptyState";
import { LoadingState } from "../ui/LoadingState";
import { ErrorRetry } from "../ui/ErrorRetry";

interface ArchitectureGovernanceScreenProps {
  company: Company;
  whoami?: string;
  onOpenProjectTasks?: (project: Project) => void;
  onOpenWebGovernance?: (path?: string, title?: string) => void;
  onOpenWebOntology?: (path?: string, title?: string) => void;
}

type GovernanceSubTab = "gates" | "metrics";
type StatusFilter = "all" | "passed" | "waived" | "attention";

/**
 * 一个架构治理目标 = 本体域 + 关联项目。
 *
 * 精准绑定 (wave299-B): 优先采用 ontology_resource_links 的真实绑定关系;
 * 未手动绑定时, 降级为按 slug/名称匹配推测; 无匹配时回落到公司全域汇总。
 * 页面上用 projectSource (explicit-link / slug-match / none) 诚实明示。
 */
interface GovernanceTarget {
  id: string;
  domain: OntologyDomain;
  project: Project | null;
  projectSource: "explicit-link" | "slug-match" | "none";
}

const GATE_KEYS = ["g1", "g2", "g3", "g4", "g5"] as const;

function domainName(d: OntologyDomain): string {
  return d.display_name || d.displayName || d.slug;
}

function domainIcon(d: OntologyDomain): string {
  return d.icon || (d.category === "enterprise" ? "🏢" : "📦");
}

function matchProject(domain: OntologyDomain, projects: Project[]): Project | null {
  const slug = domain.slug.toLowerCase();
  const name = domainName(domain).toLowerCase();
  return (
    projects.find((p) => {
      const pn = p.name.toLowerCase();
      return pn.includes(slug) || slug.includes(pn) || pn.includes(name) || name.includes(pn);
    }) ?? null
  );
}

function gateTone(status: GovernanceGate["status"] | undefined): "ok" | "warn" | "err" | "muted" {
  if (status === "passed") return "ok";
  if (status === "waived") return "warn";
  if (status === "blocked") return "err";
  return "muted";
}

function gateLabel(status: GovernanceGate["status"] | undefined): string {
  if (status === "passed") return "通过";
  if (status === "waived") return "特批";
  if (status === "blocked") return "阻断";
  if (status === "pending") return "待审";
  return "未知";
}

export function ArchitectureGovernanceScreen({
  company,
  onOpenProjectTasks,
  onOpenWebGovernance,
}: ArchitectureGovernanceScreenProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [domains, setDomains] = useState<OntologyDomain[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [resourceLinks, setResourceLinks] = useState<OntologyResourceLink[]>([]);
  const [linkingDomain, setLinkingDomain] = useState<OntologyDomain | null>(null);
  const [linkingLoading, setLinkingLoading] = useState(false);
  // key: projectId, 或 "" 表示公司全域汇总
  const [summaries, setSummaries] = useState<Record<string, GovernanceSummary | null>>({});

  const [selected, setSelected] = useState<GovernanceTarget | null>(null);
  const [activeTab, setActiveTab] = useState<GovernanceSubTab>("gates");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [collapsedGates, setCollapsedGates] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [domainList, projectList, linkList] = await Promise.all([
        coolie.listOntologyDomains(company.id),
        coolie.listProjects(company.id),
        coolie
          .listOntologyResourceLinks(company.id, { resourceKind: "project" })
          .catch(() => [] as OntologyResourceLink[]),
      ]);
      setDomains(domainList);
      setProjects(projectList);
      setResourceLinks(linkList);

      // 只拉实际被关联到的项目 + 公司全域, 每个只拉一次
      const keys = new Set<string>([""]);
      for (const d of domainList) {
        const link = linkList.find((l) => l.domain_id === d.id && !l.is_deleted);
        if (link) {
          const p = projectList.find((proj) => proj.id === link.resource_id);
          if (p) keys.add(p.id);
        } else {
          const p = matchProject(d, projectList);
          if (p) keys.add(p.id);
        }
      }
      const entries = await Promise.all(
        [...keys].map(async (key) => {
          try {
            return [key, await coolie.getGovernanceSummary(company.id, key || null)] as const;
          } catch {
            return [key, null] as const;
          }
        }),
      );
      setSummaries(Object.fromEntries(entries));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [company.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData();
  }, [loadData]);

  const targets = useMemo<GovernanceTarget[]>(() => {
    return domains.map((domain) => {
      const link = resourceLinks.find((l) => l.domain_id === domain.id && !l.is_deleted);
      if (link) {
        const project = projects.find((p) => p.id === link.resource_id);
        if (project) {
          return {
            id: domain.id,
            domain,
            project,
            projectSource: "explicit-link",
          };
        }
      }
      const project = matchProject(domain, projects);
      return {
        id: domain.id,
        domain,
        project,
        projectSource: project ? "slug-match" : "none",
      };
    });
  }, [domains, projects, resourceLinks]);

  const handleLinkProject = async (domainId: string, projectId: string) => {
    setLinkingLoading(true);
    try {
      const proj = projects.find((p) => p.id === projectId);
      await coolie.linkOntologyResource(company.id, {
        domainId,
        resourceKind: "project",
        resourceId: projectId,
        resourceLabel: proj?.name || projectId,
        role: "owner",
      });
      setLinkingDomain(null);
      await loadData();
    } catch (e) {
      Alert.alert("关联失败", String((e as Error)?.message ?? e));
    } finally {
      setLinkingLoading(false);
    }
  };

  const handleUnlinkProject = async (domainId: string, projectId: string) => {
    setLinkingLoading(true);
    try {
      await coolie.unlinkOntologyResource(company.id, {
        domainId,
        resourceKind: "project",
        resourceId: projectId,
      });
      setLinkingDomain(null);
      await loadData();
    } catch (e) {
      Alert.alert("解除关联失败", String((e as Error)?.message ?? e));
    } finally {
      setLinkingLoading(false);
    }
  };

  const summaryFor = useCallback(
    (t: GovernanceTarget): GovernanceSummary | null => summaries[t.project?.id ?? ""] ?? null,
    [summaries],
  );

  const filteredTargets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return targets.filter((t) => {
      if (
        q &&
        !domainName(t.domain).toLowerCase().includes(q) &&
        !t.domain.slug.toLowerCase().includes(q) &&
        !(t.project?.name.toLowerCase().includes(q) ?? false)
      ) {
        return false;
      }
      const gates = summaryFor(t)?.gates ?? [];
      if (statusFilter === "passed") return gates.length > 0 && gates.every((g) => g.status === "passed");
      if (statusFilter === "waived") return gates.some((g) => g.status === "waived");
      if (statusFilter === "attention") return gates.some((g) => g.status === "blocked" || g.status === "pending");
      return true;
    });
  }, [targets, searchQuery, statusFilter, summaryFor]);

  const companySummary = summaries[""] ?? null;
  const linkedCount = targets.filter((t) => t.project).length;

  const renderProjectPickerModal = () => (
    <Modal
      visible={!!linkingDomain}
      animationType="slide"
      transparent
      accessibilityViewIsModal={true}
      onRequestClose={() => setLinkingDomain(null)}
    >
      <Pressable style={styles.modalOverlay} onPress={() => setLinkingDomain(null)}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>
                关联项目 · {linkingDomain ? domainName(linkingDomain) : ""}
              </Text>
              <Text style={styles.modalSubtitle}>
                选择一个真实项目与该本体域建立唯一绑定
              </Text>
            </View>
            <Pressable
              testID="ArchGovernance__Modal__CloseBtn"
              onPress={() => setLinkingDomain(null)}
              hitSlop={8}
              style={styles.modalCloseBtn}
            >
              <Ionicons name="close" size={20} color={C.ink2} />
            </Pressable>
          </View>

          {linkingLoading ? (
            <View style={styles.modalLoadingBox}>
              <ActivityIndicator size="small" color={C.accent} />
              <Text style={styles.modalLoadingText}>正在更新关联...</Text>
            </View>
          ) : (
            <ScrollView style={styles.modalProjectList} contentContainerStyle={{ paddingBottom: 24 }}>
              {(() => {
                if (!linkingDomain) return null;
                const currentLink = resourceLinks.find(
                  (l) => l.domain_id === linkingDomain.id && !l.is_deleted,
                );
                if (!currentLink) return null;
                return (
                  <Pressable
                    testID="ArchGovernance__Modal__UnlinkOption"
                    style={styles.unlinkOptionRow}
                    onPress={() => handleUnlinkProject(linkingDomain.id, currentLink.resource_id)}
                  >
                    <Ionicons name="trash-outline" size={15} color={C.err} />
                    <Text style={styles.unlinkOptionText}>解除关联 (恢复显示公司全域汇总)</Text>
                  </Pressable>
                );
              })()}

              {projects.length === 0 ? (
                <View style={styles.modalEmptyBox}>
                  <Text style={styles.modalEmptyText}>该公司暂无可关联的项目</Text>
                </View>
              ) : (
                projects.map((proj) => {
                  const currentLink = linkingDomain
                    ? resourceLinks.find(
                        (l) =>
                          l.domain_id === linkingDomain.id &&
                          l.resource_id === proj.id &&
                          !l.is_deleted,
                      )
                    : null;
                  return (
                    <Pressable
                      key={proj.id}
                      testID={`ArchGovernance__Modal__ProjectItem__${proj.id}`}
                      style={[
                        styles.projectOptionRow,
                        currentLink ? styles.projectOptionRowActive : null,
                      ]}
                      onPress={() => {
                        if (linkingDomain) {
                          handleLinkProject(linkingDomain.id, proj.id);
                        }
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.projectOptionNameRow}>
                          <Text
                            style={[
                              styles.projectOptionName,
                              currentLink ? styles.projectOptionNameActive : null,
                            ]}
                            numberOfLines={1}
                          >
                            {proj.name}
                          </Text>
                          {currentLink ? (
                            <View style={styles.currentLinkTag}>
                              <Text style={styles.currentLinkTagText}>当前绑定</Text>
                            </View>
                          ) : null}
                        </View>
                        {proj.description ? (
                          <Text style={styles.projectOptionDesc} numberOfLines={1}>
                            {proj.description}
                          </Text>
                        ) : null}
                      </View>
                      <Ionicons
                        name={currentLink ? "checkmark-circle" : "chevron-forward"}
                        size={18}
                        color={currentLink ? C.ok : C.ink3}
                      />
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );

  // ---------------------------------------------------------------------------
  // 视图 1: 治理目标列表 (本体域 + 关联项目)
  // ---------------------------------------------------------------------------
  if (!selected) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.titleBadgeRow}>
                <Ionicons name="shield-checkmark" size={18} color={C.accent} />
                <Text style={styles.headerTitle}>业务架构治理</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{targets.length} 个本体域</Text>
                </View>
              </View>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {company.name} · 按本体域与关联项目查看 CMMI 门禁
              </Text>
            </View>
            {onOpenWebGovernance ? (
              <Pressable
                testID="ArchGovernance__Header__OpenWebBtn"
                style={styles.webBtn}
                onPress={() => onOpenWebGovernance("/governance", "架构治理工作台")}
                hitSlop={6}
              >
                <Ionicons name="open-outline" size={13} color={C.ink} />
                <Text style={styles.webBtnText}>网页</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>本体域</Text>
              <Text style={styles.statValue}>{domains.length}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>已关联项目</Text>
              <Text style={styles.statValue}>{linkedCount}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>公司健康分</Text>
              <Text style={[styles.statValue, { color: C.ok }]}>
                {companySummary ? companySummary.metrics.healthScore : "—"}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>阻塞工单</Text>
              <Text
                style={[
                  styles.statValue,
                  { color: companySummary?.metrics.blockedIssues ? C.err : C.ink3 },
                ]}
              >
                {companySummary ? companySummary.metrics.blockedIssues : "—"}
              </Text>
            </View>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={14} color={C.ink3} />
            <TextInput
              testID="ArchGovernance__Search__Input"
              style={styles.searchInput}
              placeholder="搜索本体域或关联项目"
              placeholderTextColor={C.ink4}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 ? (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={6}>
                <Ionicons name="close-circle" size={14} color={C.ink3} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsRow}>
            {(
              [
                ["all", "全部"],
                ["passed", "全通过"],
                ["waived", "含特批"],
                ["attention", "需关注"],
              ] as Array<[StatusFilter, string]>
            ).map(([key, label]) => (
              <Pressable
                key={key}
                testID={`ArchGovernance__Filter__${key}`}
                style={[styles.filterPill, statusFilter === key && styles.filterPillActive]}
                onPress={() => setStatusFilter(key)}
              >
                <Text style={[styles.filterPillText, statusFilter === key && styles.filterPillTextActive]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {loading ? (
          <LoadingState text="正在加载架构治理数据…" />
        ) : error ? (
          <ErrorRetry message={error} onRetry={() => void loadData()} />
        ) : targets.length === 0 ? (
          <EmptyState
            icon="🛡️"
            title="还没有本体域"
            subtitle="先在「本体」页新建或导入本体域，这里会按域列出架构治理目标。"
          />
        ) : filteredTargets.length === 0 ? (
          <EmptyState icon="🔍" title="没有符合条件的治理目标" subtitle="换个关键字或筛选条件试试。" />
        ) : (
          <FlatList
            data={filteredTargets}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} />
            }
            renderItem={({ item }) => {
              const summary = summaryFor(item);
              return (
                <AppCard style={styles.targetCard}>
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.cardTitleBox}>
                      <Text style={styles.domainIcon}>{domainIcon(item.domain)}</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.domainName} numberOfLines={1}>
                          {domainName(item.domain)}
                        </Text>
                        <View style={styles.domainMetaRow}>
                          <Text style={styles.domainSlug} numberOfLines={1}>
                            {item.domain.slug}
                          </Text>
                          <Text style={styles.domainVersion}>v{item.domain.version || 1}</Text>
                        </View>
                      </View>
                    </View>
                    <StatusBadge
                      label={item.domain.status === "active" ? "活跃" : String(item.domain.status)}
                      tone={item.domain.status === "active" ? "ok" : "muted"}
                    />
                  </View>

                  {/* 紧跟关联项目 */}
                  <View style={styles.projectLinkBox}>
                    <View style={styles.projectLinkHeader}>
                      <Ionicons name="folder-open-outline" size={13} color={C.accent} />
                      <Text style={styles.projectLinkLabel}>关联项目</Text>
                      <Text style={styles.projectLinkName} numberOfLines={1}>
                        {item.project ? item.project.name : "未关联 · 显示公司全域门禁"}
                      </Text>
                      {item.projectSource === "explicit-link" ? (
                        <View style={styles.explicitTag}>
                          <Text style={styles.explicitTagText}>已绑定</Text>
                        </View>
                      ) : item.projectSource === "slug-match" ? (
                        <View style={styles.inferredTag}>
                          <Text style={styles.inferredTagText}>推测匹配</Text>
                        </View>
                      ) : (
                        <View style={styles.inferredTag}>
                          <Text style={styles.inferredTagText}>未绑定</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.projectLinkActionsRow}>
                      <Pressable
                        testID={`ArchGovernance__Card__LinkBtn__${item.id}`}
                        onPress={() => setLinkingDomain(item.domain)}
                        hitSlop={6}
                        style={styles.linkChangeBtn}
                      >
                        <Ionicons name="link-outline" size={12} color={C.accent} />
                        <Text style={styles.linkChangeBtnText}>
                          {item.projectSource === "explicit-link" ? "更换" : "绑定"}
                        </Text>
                      </Pressable>
                      {item.project && onOpenProjectTasks ? (
                        <Pressable
                          testID={`ArchGovernance__Card__OpenTasks__${item.id}`}
                          onPress={() => onOpenProjectTasks(item.project!)}
                          hitSlop={6}
                        >
                          <Text style={styles.projectTaskLink}>工单 ›</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>

                  {item.domain.description ? (
                    <Text style={styles.domainDesc} numberOfLines={2}>
                      {item.domain.description}
                    </Text>
                  ) : null}

                  <View style={styles.gatesBar}>
                    {summary ? (
                      GATE_KEYS.map((key, idx) => {
                        const gate = summary.gates.find((g) => g.id.toLowerCase() === key);
                        const tone = gateTone(gate?.status);
                        return (
                          <View key={key} style={[styles.gateBadge, gateBadgeStyle(tone)]}>
                            <Text style={[styles.gateBadgeText, { color: toneColor(tone) }]}>
                              G{idx + 1} {gateLabel(gate?.status)}
                            </Text>
                          </View>
                        );
                      })
                    ) : (
                      <Text style={styles.mutedText}>门禁数据暂不可用</Text>
                    )}
                  </View>

                  <View style={styles.cardActionsRow}>
                    <Pressable
                      testID={`ArchGovernance__Card__GatesBtn__${item.id}`}
                      style={[styles.actionBtn, styles.actionBtnPrimary]}
                      onPress={() => {
                        setSelected(item);
                        setActiveTab("gates");
                      }}
                    >
                      <Ionicons name="shield-checkmark-outline" size={12} color="#fff" />
                      <Text style={styles.actionBtnPrimaryText}>门禁</Text>
                    </Pressable>
                    <Pressable
                      testID={`ArchGovernance__Card__MetricsBtn__${item.id}`}
                      style={styles.actionBtn}
                      onPress={() => {
                        setSelected(item);
                        setActiveTab("metrics");
                      }}
                    >
                      <Ionicons name="pulse-outline" size={12} color={C.ink2} />
                      <Text style={styles.actionBtnText}>度量</Text>
                    </Pressable>
                  </View>
                </AppCard>
              );
            }}
          />
        )}
        {renderProjectPickerModal()}
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // 视图 2: 单个本体域的治理工作台
  // ---------------------------------------------------------------------------
  const summary = summaryFor(selected);
  const metrics = summary?.metrics;
  const closeRate =
    metrics && metrics.totalIssues > 0 ? Math.round((metrics.completedIssues / metrics.totalIssues) * 100) : null;
  const blockedRate =
    metrics && metrics.totalIssues > 0 ? Math.round((metrics.blockedIssues / metrics.totalIssues) * 100) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.workbenchHeader}>
        <View style={styles.workbenchTopRow}>
          <Pressable
            testID="ArchGovernance__Workbench__BackBtn"
            style={styles.backBtn}
            onPress={() => setSelected(null)}
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={18} color={C.ink} />
            <Text style={styles.backBtnText}>返回</Text>
          </Pressable>
          <View style={styles.workbenchTargetPill}>
            <Text style={styles.workbenchTargetIcon}>{domainIcon(selected.domain)}</Text>
            <Text style={styles.workbenchTargetName} numberOfLines={1}>
              {domainName(selected.domain)}
            </Text>
          </View>
          {onOpenWebGovernance ? (
            <Pressable
              style={styles.webBtn}
              onPress={() => onOpenWebGovernance("/governance", "架构治理工作台")}
              hitSlop={6}
            >
              <Ionicons name="open-outline" size={13} color={C.ink} />
              <Text style={styles.webBtnText}>网页</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.workbenchSubInfoRow}>
          <Text style={styles.workbenchSubInfoLabel}>关联项目：</Text>
          <Text style={styles.workbenchSubInfoValue} numberOfLines={1}>
            {selected.project
              ? `${selected.project.name}（${selected.projectSource === "explicit-link" ? "已绑定" : "推测匹配"}）`
              : "未关联 · 公司全域汇总"}
          </Text>
          <Pressable
            testID="ArchGovernance__Workbench__ChangeLinkBtn"
            style={styles.workbenchChangeLinkBtn}
            onPress={() => setLinkingDomain(selected.domain)}
            hitSlop={6}
          >
            <Ionicons name="link-outline" size={12} color={C.accent} />
            <Text style={styles.workbenchChangeLinkBtnText}>
              {selected.projectSource === "explicit-link" ? "更换绑定" : "绑定项目"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.workbenchTabsRow}>
          {(
            [
              ["gates", "门禁", "shield-checkmark-outline"],
              ["metrics", "度量", "pulse-outline"],
            ] as Array<[GovernanceSubTab, string, keyof typeof Ionicons.glyphMap]>
          ).map(([key, label, icon]) => {
            const active = activeTab === key;
            return (
              <Pressable
                key={key}
                testID={`ArchGovernance__Workbench__Tab__${key}`}
                style={[styles.workbenchTabBtn, active && styles.workbenchTabBtnActive]}
                onPress={() => setActiveTab(key)}
              >
                <Ionicons name={icon} size={13} color={active ? "#fff" : C.ink3} />
                <Text style={[styles.workbenchTabBtnText, active && styles.workbenchTabBtnTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.workbenchContentInner}>
        {!summary ? (
          <ErrorRetry message="门禁数据加载失败" onRetry={() => void loadData()} variant="card" />
        ) : activeTab === "gates" ? (
          <View style={styles.tabSection}>
            <AppCard style={styles.scoreCard}>
              <View style={styles.scoreRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scoreTitle}>CMMI 门禁健康分</Text>
                  <Text style={styles.scoreSubtitle}>{summary.projectName}</Text>
                </View>
                <Text style={styles.scoreNumber}>{summary.metrics.healthScore}</Text>
              </View>
              <View style={styles.scoreMetricsRow}>
                <Text style={styles.scoreMetricText}>
                  已完成 {summary.metrics.completedIssues} / {summary.metrics.totalIssues}
                </Text>
                <Text style={styles.scoreMetricText}>阻塞 {summary.metrics.blockedIssues}</Text>
              </View>
            </AppCard>

            {summary.gates.map((gate) => {
              const collapsed = collapsedGates[gate.id] ?? true;
              const tone = gateTone(gate.status);
              return (
                <AppCard key={gate.id} style={styles.gateCard}>
                  <Pressable
                    testID={`ArchGovernance__Gate__Toggle__${gate.id}`}
                    style={styles.gateCardHeader}
                    onPress={() => setCollapsedGates((prev) => ({ ...prev, [gate.id]: !collapsed }))}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={styles.gateHeaderLeftRow}>
                        <Text style={styles.gateName}>{gate.name}</Text>
                        <View style={styles.gateCodeBadge}>
                          <Text style={styles.gateCodeBadgeText}>{gate.code}</Text>
                        </View>
                      </View>
                      <Text style={styles.gateRoleText}>主责：{gate.role}</Text>
                    </View>
                    <View style={styles.gateHeaderRightRow}>
                      <StatusBadge label={gateLabel(gate.status)} tone={tone} />
                      <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={16} color={C.ink3} />
                    </View>
                  </Pressable>
                  <Text style={styles.gateDescription}>{gate.description}</Text>

                  {!collapsed ? (
                    <View style={styles.checksContainer}>
                      {gate.checks.map((chk) => (
                        <View key={chk.id} style={styles.checkItemRow}>
                          <Ionicons
                            name={chk.passed ? "checkmark-circle" : "alert-circle"}
                            size={14}
                            color={chk.passed ? C.ok : C.err}
                            style={{ marginTop: 1 }}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.checkItemTitle}>{chk.title}</Text>
                            <Text style={styles.checkStandardText}>
                              {chk.standard}
                              {chk.evidenceRef ? ` · ${chk.evidenceRef}` : ""}
                            </Text>
                          </View>
                        </View>
                      ))}
                      {gate.waiverApproval ? (
                        <View style={styles.waiverBox}>
                          <Ionicons name="document-text" size={14} color={C.warn} />
                          <Text style={styles.waiverText}>
                            已特批放行 · 审批单 {gate.waiverApproval.id.slice(0, 8)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </AppCard>
              );
            })}
          </View>
        ) : (
          <View style={styles.tabSection}>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>工单总数</Text>
                <Text style={styles.statValue}>{summary.metrics.totalIssues}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>已完成</Text>
                <Text style={[styles.statValue, { color: C.ok }]}>{summary.metrics.completedIssues}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>进行中</Text>
                <Text style={styles.statValue}>{summary.metrics.inProgressIssues}</Text>
              </View>
            </View>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>闭环率</Text>
                <Text style={styles.statValue}>{closeRate === null ? "—" : `${closeRate}%`}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>阻塞率</Text>
                <Text style={[styles.statValue, { color: blockedRate ? C.err : C.ink3 }]}>
                  {blockedRate === null ? "—" : `${blockedRate}%`}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>里程碑</Text>
                <Text style={styles.statValue}>{summary.metrics.milestoneCount}</Text>
              </View>
            </View>
            <Text style={styles.mutedText}>
              数据来源：/governance/summary（{selected.project ? "按关联项目" : "公司全域"}）。拓扑、基线、契约、需求跟踪暂未接入真实数据，请到网页版查看。
            </Text>
          </View>
        )}
      </ScrollView>
      {renderProjectPickerModal()}
    </SafeAreaView>
  );
}

function toneColor(tone: "ok" | "warn" | "err" | "muted"): string {
  if (tone === "ok") return C.ok;
  if (tone === "warn") return C.warn;
  if (tone === "err") return C.err;
  return C.ink3;
}

function gateBadgeStyle(tone: "ok" | "warn" | "err" | "muted") {
  if (tone === "ok") return styles.gateBadgePassed;
  if (tone === "warn") return styles.gateBadgeWaived;
  if (tone === "err") return styles.gateBadgeBlocked;
  return styles.gateBadgeMuted;
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
    gap: 8,
  },
  headerTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titleBadgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: C.ink },
  countBadge: {
    backgroundColor: "rgba(167, 139, 250, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.sm,
  },
  countBadgeText: { fontSize: 11, fontWeight: "600", color: C.accent },
  headerSubtitle: { fontSize: 12, color: C.ink3, marginTop: 2 },
  webBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  webBtnText: { fontSize: 11, color: C.ink, fontWeight: "600" },
  statsGrid: { flexDirection: "row", gap: 6 },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    borderColor: C.lineSubtle,
    borderRadius: RADIUS.sm,
    paddingVertical: 6,
    alignItems: "center",
  },
  statLabel: { fontSize: 10, color: C.ink3, marginBottom: 2 },
  statValue: { fontSize: 14, fontWeight: "700", color: C.ink },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    height: 32,
  },
  searchInput: { flex: 1, fontSize: 12, color: C.ink, padding: 0 },
  filterPillsRow: { flexDirection: "row", gap: 6 },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  filterPillActive: { backgroundColor: "rgba(167, 139, 250, 0.2)", borderColor: C.accent },
  filterPillText: { fontSize: 11, color: C.ink3 },
  filterPillTextActive: { color: C.accent, fontWeight: "600" },
  listContainer: { padding: 12, gap: 10 },
  targetCard: {
    padding: 12,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    borderRadius: RADIUS.md,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  cardTitleBox: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  domainIcon: { fontSize: 20 },
  domainName: { fontSize: 14, fontWeight: "700", color: C.ink },
  domainMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  domainSlug: {
    fontSize: 11,
    fontFamily: "monospace",
    color: C.ink3,
    backgroundColor: C.bg,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    maxWidth: 160,
  },
  domainVersion: { fontSize: 11, fontFamily: "monospace", color: C.ink4 },
  projectLinkBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    backgroundColor: "rgba(167, 139, 250, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.15)",
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 8,
  },
  projectLinkHeader: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1, minWidth: 0 },
  projectLinkLabel: { fontSize: 11, color: C.accent, fontWeight: "600" },
  projectLinkName: { fontSize: 11, color: C.ink, fontWeight: "600", flexShrink: 1 },
  inferredTag: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  inferredTagText: { fontSize: 9, color: C.ink3 },
  explicitTag: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  explicitTagText: { fontSize: 9, color: C.ok, fontWeight: "600" },
  projectLinkActionsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  linkChangeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(167, 139, 250, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  linkChangeBtnText: { fontSize: 10, color: C.accent, fontWeight: "600" },
  projectTaskLink: { fontSize: 11, color: C.accent, fontWeight: "500" },
  domainDesc: { fontSize: 12, color: C.ink3, lineHeight: 16, marginBottom: 8 },
  gatesBar: { flexDirection: "row", gap: 5, marginBottom: 8, flexWrap: "wrap" },
  gateBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, borderWidth: 1 },
  gateBadgePassed: { backgroundColor: "rgba(16, 185, 129, 0.1)", borderColor: "rgba(16, 185, 129, 0.3)" },
  gateBadgeWaived: { backgroundColor: "rgba(245, 158, 11, 0.1)", borderColor: "rgba(245, 158, 11, 0.3)" },
  gateBadgeBlocked: { backgroundColor: "rgba(239, 68, 68, 0.1)", borderColor: "rgba(239, 68, 68, 0.3)" },
  gateBadgeMuted: { backgroundColor: "rgba(255, 255, 255, 0.04)", borderColor: C.lineSubtle },
  gateBadgeText: { fontSize: 10, fontWeight: "600" },
  mutedText: { fontSize: 11, color: C.ink3, lineHeight: 16 },
  cardActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
    paddingTop: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  actionBtnPrimary: { backgroundColor: C.accent, borderColor: C.accent },
  actionBtnText: { fontSize: 11, color: C.ink2, fontWeight: "500" },
  actionBtnPrimaryText: { fontSize: 11, color: "#fff", fontWeight: "600" },

  workbenchHeader: {
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 6,
  },
  workbenchTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4, paddingVertical: 3 },
  backBtnText: { fontSize: 12, color: C.ink, fontWeight: "600" },
  workbenchTargetPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(167, 139, 250, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.25)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    flexShrink: 1,
  },
  workbenchTargetIcon: { fontSize: 13 },
  workbenchTargetName: { fontSize: 12, fontWeight: "700", color: C.accent, flexShrink: 1 },
  workbenchSubInfoRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  workbenchSubInfoLabel: { fontSize: 11, color: C.ink4 },
  workbenchSubInfoValue: { fontSize: 11, fontWeight: "600", color: C.ink2, flexShrink: 1 },
  workbenchTabsRow: { flexDirection: "row", gap: 6 },
  workbenchTabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  workbenchTabBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  workbenchTabBtnText: { fontSize: 12, fontWeight: "500", color: C.ink3 },
  workbenchTabBtnTextActive: { color: "#fff", fontWeight: "600" },
  workbenchContentInner: { padding: 12 },
  tabSection: { gap: 10 },
  scoreCard: {
    padding: 12,
    backgroundColor: "rgba(167, 139, 250, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.25)",
    borderRadius: RADIUS.md,
  },
  scoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  scoreTitle: { fontSize: 14, fontWeight: "700", color: C.ink },
  scoreSubtitle: { fontSize: 11, color: C.ink3, marginTop: 2 },
  scoreNumber: { fontSize: 24, fontWeight: "800", color: C.ok },
  scoreMetricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "rgba(167, 139, 250, 0.2)",
    paddingTop: 6,
  },
  scoreMetricText: { fontSize: 11, color: C.ink2 },
  gateCard: {
    padding: 12,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    borderRadius: RADIUS.md,
  },
  gateCardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 },
  gateHeaderLeftRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  gateName: { fontSize: 14, fontWeight: "700", color: C.ink },
  gateCodeBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  gateCodeBadgeText: { fontSize: 10, fontFamily: "monospace", color: C.accent },
  gateRoleText: { fontSize: 11, color: C.ink3, marginTop: 2 },
  gateHeaderRightRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  gateDescription: { fontSize: 12, color: C.ink3, lineHeight: 16 },
  checksContainer: { borderTopWidth: 1, borderTopColor: C.lineSubtle, paddingTop: 8, marginTop: 8, gap: 6 },
  checkItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    padding: 6,
    borderRadius: RADIUS.sm,
  },
  checkItemTitle: { fontSize: 12, color: C.ink, lineHeight: 16 },
  checkStandardText: { fontSize: 10, color: C.ink3, marginTop: 2 },
  waiverBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.25)",
    padding: 6,
    borderRadius: RADIUS.sm,
  },
  waiverText: { fontSize: 11, color: C.warn, fontWeight: "500" },

  workbenchChangeLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(167, 139, 250, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    marginLeft: 6,
  },
  workbenchChangeLinkBtnText: { fontSize: 11, color: C.accent, fontWeight: "600" },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: RADIUS.md,
    borderTopRightRadius: RADIUS.md,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: C.lineSubtle,
    maxHeight: "75%",
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
    paddingBottom: 12,
  },
  modalTitle: { fontSize: 15, fontWeight: "700", color: C.ink },
  modalSubtitle: { fontSize: 11, color: C.ink3, marginTop: 2 },
  modalCloseBtn: { padding: 4 },
  modalLoadingBox: {
    paddingVertical: 36,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  modalLoadingText: { fontSize: 12, color: C.ink3 },
  modalProjectList: { paddingTop: 12 },
  modalEmptyBox: { paddingVertical: 28, alignItems: "center" },
  modalEmptyText: { fontSize: 12, color: C.ink3 },
  unlinkOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    marginBottom: 10,
  },
  unlinkOptionText: { fontSize: 12, color: C.err, fontWeight: "600" },
  projectOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderWidth: 1,
    borderColor: C.lineSubtle,
    marginBottom: 8,
  },
  projectOptionRowActive: {
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  projectOptionNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  projectOptionName: { fontSize: 13, fontWeight: "600", color: C.ink },
  projectOptionNameActive: { color: C.ok },
  projectOptionDesc: { fontSize: 11, color: C.ink3, marginTop: 2 },
  currentLinkTag: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  currentLinkTagText: { fontSize: 9, color: C.ok, fontWeight: "600" },
});
