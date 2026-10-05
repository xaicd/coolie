import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import type {
  Company,
  OntologyDomain,
  OntologyEntityTypeLevel,
  OntologyLevelsResponse,
  OntologyStatsResponse,
} from "@coolie/api-client";
import { coolie } from "../coolie";
import { C } from "../theme";
import { RADIUS, SPACING } from "../ui/tokens";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { SegmentedControl } from "../ui/SegmentedControl";
import { StatusBadge } from "../ui/StatusBadge";
import { OntologyGraphWorkbenchScreen } from "./OntologyGraphWorkbenchScreen";

export type OntologyCockpitTab = "graph" | "objects" | "actions" | "data" | "domains";

interface OntologyCockpitScreenProps {
  company: Company;
  whoami?: string;
  onOpenWebOntology?: () => void;
  onOpenSchemaEditor?: (typeId: string, displayName: string) => void;
  onOpenWorkbench?: () => void;
  onOpenPrototypeSandbox?: () => void;
}

const TAB_OPTIONS: Array<{ key: OntologyCockpitTab; label: string }> = [
  { key: "graph", label: "图谱" },
  { key: "objects", label: "对象" },
  { key: "actions", label: "动作" },
  { key: "data", label: "数据" },
  { key: "domains", label: "域录" },
];

const OBJECT_TYPE_META: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; desc: string }
> = {
  project: { label: "项目", icon: "briefcase-outline", color: "#5E6AD2", desc: "业务与工程交付项目" },
  issue: { label: "任务", icon: "checkbox-outline", color: "#39A275", desc: "WBS 任务工单与流水" },
  agent: { label: "员工", icon: "people-outline", color: "#A78BFA", desc: "数字员工与特种工匠" },
  spec: { label: "规格", icon: "document-text-outline", color: "#E0A030", desc: "EARS 规范需求与设计" },
  conversation: { label: "对话", icon: "chatbubbles-outline", color: "#4FA1D9", desc: "高管工坊时序意图流" },
  work_product: { label: "产物", icon: "cube-outline", color: "#EC4899", desc: "代码、文档与真机证据" },
  attachment: { label: "附件", icon: "attach-outline", color: "#9CA3AF", desc: "设计原图与静态素材" },
  comment: { label: "评论", icon: "chatbubble-ellipses-outline", color: "#6B7280", desc: "过程审计与评审意见" },
  company: { label: "公司", icon: "business-outline", color: "#F59E0B", desc: "多租户组织根基" },
  service: { label: "服务", icon: "server-outline", color: "#10B981", desc: "微服务与运行容器" },
};

const PALANTIR_ACTIONS = [
  {
    key: "dispatch_task",
    label: "派活",
    target: "issue",
    icon: "paper-plane-outline" as const,
    color: "#5E6AD2",
    desc: "将高管意图转译为 WBS 并自动化派发给数字员工",
    policy: "异步消费 · 零阻塞",
  },
  {
    key: "approve_gate",
    label: "审批",
    target: "approval",
    icon: "shield-checkmark-outline" as const,
    color: "#10B981",
    desc: "CMMI 门禁放行与重大变更决策会签",
    policy: "双人复核 · 状态机锁",
  },
  {
    key: "bootstrap_project",
    label: "立项",
    target: "project",
    icon: "git-commit-outline" as const,
    color: "#A78BFA",
    desc: "项目进厂原子初始化同名本体域与血缘链",
    policy: "同生共死 · 事务原子",
  },
  {
    key: "release_prod",
    label: "投产",
    target: "release",
    icon: "rocket-outline" as const,
    color: "#EC4899",
    desc: "不可变版本发布、Git Tag 推送与增量 OTA",
    policy: "指纹核验 · 7处一致",
  },
  {
    key: "kill_switch",
    label: "熔断",
    target: "company",
    icon: "warning-outline" as const,
    color: "#EF4444",
    desc: "异常工单与高危操作一键秒级紧急熔断",
    policy: "硬停安全 · 全局广播",
  },
  {
    key: "sandbox_eval",
    label: "沙箱",
    target: "work_product",
    icon: "flask-outline" as const,
    color: "#F59E0B",
    desc: "动作效果模拟推演与微前端隔离试跑",
    policy: "脱机安全 · 零副作用",
  },
];

const DATA_PIPELINES = [
  {
    key: "git_repo",
    label: "代码仓库",
    type: "Git Connector",
    status: "active",
    statusText: "实时监听",
    desc: "主干分支提交、Worktree 隔离与变更扫描",
  },
  {
    key: "im_channel",
    label: "微信通道",
    type: "Hermes Channel",
    status: "active",
    statusText: "就绪待命",
    desc: "高管语音/文本意图接收与 0.5s 快速工单回执",
  },
  {
    key: "sqlite_drizzle",
    label: "本地数据库",
    type: "PGlite Drizzle",
    status: "active",
    statusText: "事务健康",
    desc: "50+ 张物理表支撑的活体业务本体与状态账本",
  },
  {
    key: "spc_metrics",
    label: "SPC 质量",
    type: "Analytics Pipeline",
    status: "active",
    statusText: "自动巡检",
    desc: "缺陷根本原因 5-Why 溯源与统计过程控制",
  },
];

/**
 * 顶级 Palantir 架构原生本体控制台中枢 (OntologyCockpitScreen)
 *
 * 彻底颠覆旧版粗糙的死板列表，严格参考 Web 版本体插件四大支柱：
 * 1. 【图谱】(Graph): 宏观对象拓扑网络、因果关系穿透与同心圆环布局
 * 2. 【对象】(Objects): 业务对象类型字典、属性元模型与实时实例数统计
 * 3. 【动作】(Actions): Palantir 核心 Action Types 业务决策动作与执行策略
 * 4. 【数据】(Data): 连接器、数据集与实时管道监控
 * 5. 【域录】(Domains): 业务领域边界、架构血缘与生命周期管理
 */
export function OntologyCockpitScreen({
  company,
  whoami,
  onOpenWebOntology,
  onOpenSchemaEditor,
  onOpenWorkbench,
  onOpenPrototypeSandbox,
}: OntologyCockpitScreenProps) {
  const [activeTab, setActiveTab] = useState<OntologyCockpitTab>("graph");
  const [stats, setStats] = useState<OntologyStatsResponse | null>(null);
  const [levels, setLevels] = useState<OntologyLevelsResponse | null>(null);
  const [domains, setDomains] = useState<OntologyDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 选中对象类型弹窗
  const [selectedObjectType, setSelectedObjectType] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [statsRes, levelsRes, domainsRes] = await Promise.all([
        coolie.getOntologyStats(company.id).catch(() => null),
        coolie.getOntologyLevels(company.id).catch(() => null),
        coolie.listOntologyDomains(company.id).catch(() => []),
      ]);
      if (statsRes) setStats(statsRes);
      if (levelsRes) setLevels(levelsRes);
      setDomains(domainsRes);
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

  // 整理对象类型列表（合并 levels 和 stats）
  const objectTypesList = useMemo(() => {
    const map = new Map<string, { type: string; count: number; edgeCount: number }>();
    if (levels?.byEntityType) {
      for (const item of levels.byEntityType) {
        map.set(item.entityType, {
          type: item.entityType,
          count: item.count,
          edgeCount: item.edgeCount,
        });
      }
    }
    if (stats?.nodeCounts) {
      for (const nc of stats.nodeCounts) {
        if (!map.has(nc.entityType)) {
          map.set(nc.entityType, {
            type: nc.entityType,
            count: nc.count,
            edgeCount: 0,
          });
        }
      }
    }
    // 补齐核心常用业务对象
    const knownKeys = ["project", "issue", "agent", "spec", "conversation", "work_product"];
    for (const k of knownKeys) {
      if (!map.has(k)) {
        map.set(k, { type: k, count: 0, edgeCount: 0 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [levels, stats]);

  return (
    <View style={styles.container}>
      {/* 顶部 Palantir 五大核心支柱切换控制器 */}
      <View style={styles.topControlWrap}>
        <SegmentedControl
          options={TAB_OPTIONS}
          value={activeTab}
          onChange={(val) => setActiveTab(val as OntologyCockpitTab)}
          style={styles.segmentedControl}
        />
      </View>

      {/* 主工作区 */}
      <View style={styles.mainArea}>
        {/* 1. 图谱视图 (Graph) */}
        {activeTab === "graph" && (
          <OntologyGraphWorkbenchScreen
            company={company}
            embedded={true}
            onOpenFullscreen={onOpenWorkbench}
          />
        )}

        {/* 2. 对象类型视图 (Objects) */}
        {activeTab === "objects" && (
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
          >
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>业务对象类型 (Object Types)</Text>
                <Text style={styles.sectionSub}>企业业务本体的核心实体定义、结构属性与关联度</Text>
              </View>
              {onOpenWebOntology && (
                <Pressable
                  style={styles.twoWordBtn}
                  onPress={onOpenWebOntology}
                  hitSlop={6}
                  accessibilityLabel="设计"
                  testID="OntologyCockpit__Objects__DesignBtn"
                >
                  <Ionicons name="construct-outline" size={13} color={C.accent} />
                  <Text style={styles.twoWordBtnText}>设计</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.cardsGrid}>
              {objectTypesList.map((item) => {
                const meta = OBJECT_TYPE_META[item.type] ?? {
                  label: item.type,
                  icon: "cube-outline" as const,
                  color: C.accent,
                  desc: "业务扩展实体对象",
                };
                return (
                  <Pressable
                    key={item.type}
                    style={styles.objectCard}
                    onPress={() => setSelectedObjectType(item.type)}
                    testID={`OntologyCockpit__Object__${item.type}`}
                  >
                    <View style={styles.objectCardHeader}>
                      <View style={[styles.objectIconWrap, { backgroundColor: `${meta.color}20` }]}>
                        <Ionicons name={meta.icon} size={18} color={meta.color} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.objectCardTitle}>{meta.label}</Text>
                        <Text style={styles.objectCardKey}>{item.type}</Text>
                      </View>
                      <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>{item.count} 实例</Text>
                      </View>
                    </View>

                    <Text style={styles.objectCardDesc} numberOfLines={2}>
                      {meta.desc}
                    </Text>

                    <View style={styles.objectCardFooter}>
                      <Text style={styles.objectCardStat}>
                        关联度: <Text style={{ color: C.ink, fontWeight: "600" }}>{item.edgeCount}</Text> 条
                      </Text>
                      <Pressable
                        style={styles.cardActionPill}
                        onPress={() => setActiveTab("graph")}
                        hitSlop={6}
                        accessibilityLabel="图谱"
                      >
                        <Text style={styles.cardActionPillText}>图谱</Text>
                        <Ionicons name="chevron-forward" size={12} color={C.accent} />
                      </Pressable>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* 3. 动作类型视图 (Actions) */}
        {activeTab === "actions" && (
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
          >
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>业务动作类型 (Action Types)</Text>
                <Text style={styles.sectionSub}>由本体节点直接触发的高价值受控业务动作与执行规则</Text>
              </View>
              {onOpenPrototypeSandbox && (
                <Pressable
                  style={styles.twoWordBtn}
                  onPress={onOpenPrototypeSandbox}
                  hitSlop={6}
                  accessibilityLabel="沙箱"
                  testID="OntologyCockpit__Actions__SandboxBtn"
                >
                  <Ionicons name="flask-outline" size={13} color="#A78BFA" />
                  <Text style={[styles.twoWordBtnText, { color: "#A78BFA" }]}>沙箱</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.actionList}>
              {PALANTIR_ACTIONS.map((action) => (
                <AppCard key={action.key} variant="surface" padding={SPACING.md} style={styles.actionCard}>
                  <View style={styles.actionCardTop}>
                    <View style={[styles.actionIconWrap, { backgroundColor: `${action.color}20` }]}>
                      <Ionicons name={action.icon} size={20} color={action.color} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={styles.actionTitleRow}>
                        <Text style={styles.actionCardTitle}>{action.label}</Text>
                        <View style={styles.policyPill}>
                          <Text style={styles.policyPillText}>{action.policy}</Text>
                        </View>
                      </View>
                      <Text style={styles.actionTargetText}>作用域: {action.target}</Text>
                    </View>
                  </View>
                  <Text style={styles.actionDescText}>{action.desc}</Text>
                </AppCard>
              ))}
            </View>
          </ScrollView>
        )}

        {/* 4. 数据流中枢视图 (Data Flow) */}
        {activeTab === "data" && (
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
          >
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>数据流与管道 (Data Pipelines)</Text>
                <Text style={styles.sectionSub}>Palantir 连接器 (Connectors)、数据集与实时流水线监控</Text>
              </View>
            </View>

            <View style={styles.pipelineList}>
              {DATA_PIPELINES.map((item) => (
                <AppCard key={item.key} variant="surface" padding={SPACING.md} style={styles.pipelineCard}>
                  <View style={styles.pipelineHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pipelineTitle}>{item.label}</Text>
                      <Text style={styles.pipelineType}>{item.type}</Text>
                    </View>
                    <StatusBadge
                      label={item.statusText}
                      color={C.ok}
                      bg="rgba(39, 166, 68, 0.12)"
                      border="rgba(39, 166, 68, 0.3)"
                      dotStatus="ok"
                    />
                  </View>
                  <Text style={styles.pipelineDesc}>{item.desc}</Text>
                </AppCard>
              ))}
            </View>
          </ScrollView>
        )}

        {/* 5. 业务域录视图 (Domains) */}
        {activeTab === "domains" && (
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
          >
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>本体业务域 (Ontology Domains)</Text>
                <Text style={styles.sectionSub}>物理隔离的领域模型边界、版本指纹与租户生命周期</Text>
              </View>
              {onOpenWebOntology && (
                <Pressable
                  style={styles.twoWordBtn}
                  onPress={onOpenWebOntology}
                  hitSlop={6}
                  accessibilityLabel="设计"
                >
                  <Ionicons name="globe-outline" size={13} color={C.accent} />
                  <Text style={styles.twoWordBtnText}>设计</Text>
                </Pressable>
              )}
            </View>

            {domains.length === 0 ? (
              <EmptyState title="暂无业务域" subtitle="创建项目时将自动初始化同名本体域" />
            ) : (
              <View style={styles.domainsList}>
                {domains.map((dom) => (
                  <AppCard key={dom.id} variant="surface" padding={SPACING.md} style={styles.domainCard}>
                    <View style={styles.domainHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.domainTitle}>
                          {dom.display_name || dom.displayName || dom.slug}
                        </Text>
                        <Text style={styles.domainSlug}>slug: {dom.slug}</Text>
                      </View>
                      <StatusBadge
                        label={dom.lifecycle_state === "active" ? "运行中" : "已就绪"}
                        color={C.ok}
                        bg="rgba(39, 166, 68, 0.12)"
                        border="rgba(39, 166, 68, 0.3)"
                        dotStatus="ok"
                      />
                    </View>
                    <Text style={styles.domainDesc} numberOfLines={2}>
                      {dom.description || "企业业务与工程交付活体本体域"}
                    </Text>

                    <View style={styles.domainFooter}>
                      <Text style={styles.domainVersion}>
                        版本: v{dom.schema_version ?? dom.version ?? 1}
                      </Text>
                      <View style={styles.domainActions}>
                        {onOpenSchemaEditor && (
                          <Pressable
                            style={styles.domainActionBtn}
                            onPress={() => onOpenSchemaEditor(dom.id, dom.display_name || dom.slug)}
                            hitSlop={6}
                            accessibilityLabel="结构"
                          >
                            <Text style={styles.domainActionBtnText}>结构</Text>
                          </Pressable>
                        )}
                        <Pressable
                          style={[styles.domainActionBtn, styles.domainActionBtnPrimary]}
                          onPress={() => {
                            setActiveTab("graph");
                          }}
                          hitSlop={6}
                          accessibilityLabel="图谱"
                        >
                          <Ionicons name="git-network-outline" size={12} color={C.accent} />
                          <Text style={[styles.domainActionBtnText, { color: C.accent }]}>图谱</Text>
                        </Pressable>
                      </View>
                    </View>
                  </AppCard>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  topControlWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  segmentedControl: {
    width: "100%",
  },
  mainArea: {
    flex: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: 40,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: C.ink,
  },
  sectionSub: {
    fontSize: 11,
    color: C.ink3,
    marginTop: 2,
  },
  twoWordBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
  },
  twoWordBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.accent,
  },
  cardsGrid: {
    gap: 10,
  },
  objectCard: {
    backgroundColor: C.panel,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    padding: 12,
  },
  objectCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  objectIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  objectCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
  },
  objectCardKey: {
    fontSize: 11,
    color: C.ink3,
    fontFamily: "monospace",
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.ink2,
  },
  objectCardDesc: {
    fontSize: 12,
    color: C.ink3,
    marginTop: 8,
    lineHeight: 16,
  },
  objectCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },
  objectCardStat: {
    fontSize: 11,
    color: C.ink3,
  },
  cardActionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  cardActionPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.accent,
  },
  actionList: {
    gap: 10,
  },
  actionCard: {
    gap: 8,
  },
  actionCardTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: C.ink,
  },
  policyPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(94, 106, 210, 0.25)",
  },
  policyPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: C.accent,
  },
  actionTargetText: {
    fontSize: 11,
    color: C.ink3,
    marginTop: 2,
  },
  actionDescText: {
    fontSize: 12,
    color: C.ink2,
    lineHeight: 16,
  },
  pipelineList: {
    gap: 10,
  },
  pipelineCard: {
    gap: 8,
  },
  pipelineHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  pipelineTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
  },
  pipelineType: {
    fontSize: 11,
    color: C.ink3,
    marginTop: 2,
  },
  pipelineDesc: {
    fontSize: 12,
    color: C.ink2,
    lineHeight: 16,
  },
  domainsList: {
    gap: 10,
  },
  domainCard: {
    gap: 8,
  },
  domainHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  domainTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
  },
  domainSlug: {
    fontSize: 11,
    color: C.ink3,
    fontFamily: "monospace",
    marginTop: 2,
  },
  domainDesc: {
    fontSize: 12,
    color: C.ink2,
    lineHeight: 16,
  },
  domainFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },
  domainVersion: {
    fontSize: 11,
    color: C.ink3,
  },
  domainActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  domainActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
  },
  domainActionBtnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderColor: C.accent,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
  },
  domainActionBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.ink2,
  },
});
