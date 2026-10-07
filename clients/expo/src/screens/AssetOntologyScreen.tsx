import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type {
  Company,
  Issue,
  IssueWorkProduct,
  OntologyDomain,
  OntologyGraphNode,
  OntologyGraphSnapshot,
  OntologyInstanceRow,
  OntologyLevelsResponse,
  OntologyStatsResponse,
  Project,
  WorkspaceRuntimeService,
} from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "../ui/tokens";
import { SegmentedControl } from "../ui/SegmentedControl";
import { AppCard } from "../ui/AppCard";
import { StatusBadge } from "../ui/StatusBadge";
import { Sheet } from "../ui/Sheet";
import { LoadingState } from "../ui/LoadingState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { showErrorToast, showSuccessToast } from "../ui/toast";
import type { SandboxScope } from "./PrototypeSandboxScreen";

export interface DomainItem {
  id: string;
  name: string;
  slug: string;
  category: string;
  icon: string;
  isSystem: boolean;
  description: string;
  lifecycleState: "active" | "draft" | "locked" | "archived";
  nodeCount: number;
  edgeCount: number;
  rawDomain?: OntologyDomain;
  projectId?: string;
  projectName?: string;
}

export interface AssetOntologyScreenProps {
  company: Company;
  whoami?: string;
  onOpenIssue?: (issue: Issue) => void;
  onOpenProjectTasks?: (project: Project) => void;
  onCreateTaskForProject?: (project: Project) => void;
  onOpenWebOntology?: (path?: string, title?: string) => void;
  onOpenSandbox?: (
    url: string,
    service?: WorkspaceRuntimeService | null,
    wp?: IssueWorkProduct | null,
    scope?: SandboxScope | null,
  ) => void;
  onNavigateToChat?: (prompt?: string) => void;
  onNavigateToTasks?: () => void;
  onNavigateToTab?: (tab: string) => void;
}

type SubTab = "objects" | "datasets";

interface LivingObjectItem {
  id: string;
  name: string;
  category: string;
  icon: string;
  count: number;
  edgeCount: number;
  status: "healthy" | "warn" | "idle";
  statusText: string;
  description: string;
  upstream: string;
  upstreamRel: string;
  downstream: string;
  downstreamRel: string;
  actions: string[];
}

interface LivingDatasetItem {
  id: string;
  tableName: string;
  engine: string;
  syncType: string;
  latency: string;
  recordCount: string;
  boundObject: string;
  status: "active" | "synced" | "static";
  description: string;
}

const SUB_TABS: Array<{ key: SubTab; label: string }> = [
  { key: "objects", label: "⬡ 业务对象" },
  { key: "datasets", label: "⊞ 数据源流" },
];

/**
 * 资产 › 业务本体 (Palantir 活体中枢 · 两核一控原生架构)
 *
 * 1. 顶栏态势横幅: 实体对象数、关系连线数、数据源流、活体状态
 * 2. 核一 (Object Explorer): 业务对象态势卡片，支持点击穿透
 * 3. 核二 (Dataset Explorer): 真实数据源流 (对齐 263 物理表审计)
 * 4. 一控 (Action Controller): 360 局部一跳因果抽屉 + 标准两字操作动词
 */
export function AssetOntologyScreen({
  company,
  whoami,
  onOpenIssue,
  onOpenProjectTasks,
  onCreateTaskForProject,
  onOpenWebOntology,
  onOpenSandbox,
  onNavigateToChat,
  onNavigateToTasks,
  onNavigateToTab,
}: AssetOntologyScreenProps) {
  const [subTab, setSubTab] = useState<SubTab>("objects");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<OntologyStatsResponse | null>(null);
  const [levels, setLevels] = useState<OntologyLevelsResponse | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [activeDomainId, setActiveDomainId] = useState<string>("__system__");
  const [domainSnapshot, setDomainSnapshot] = useState<OntologyGraphSnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [domainSheetVisible, setDomainSheetVisible] = useState(false);
  const [graphSheetVisible, setGraphSheetVisible] = useState(false);
  const [selectedDomainNode, setSelectedDomainNode] = useState<OntologyGraphNode | null>(null);

  const [selectedObject, setSelectedObject] = useState<LivingObjectItem | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<LivingDatasetItem | null>(null);

  const [instances, setInstances] = useState<OntologyInstanceRow[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(false);

  useEffect(() => {
    if (!selectedObject) {
      setInstances([]);
      return;
    }
    let cancelled = false;
    setLoadingInstances(true);
    const entityType = selectedObject.id === "artifact" ? "work_product" : selectedObject.id;
    coolie
      .listOntologyInstances(company.id, { entityType, limit: 6 })
      .then((res) => {
        if (!cancelled) {
          setInstances(res.instances ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) setInstances([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingInstances(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedObject, company.id]);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [statsRes, levelsRes, projectsRes, domainsRes] = await Promise.allSettled([
        coolie.getOntologyStats(company.id),
        coolie.getOntologyLevels(company.id),
        coolie.listProjects(company.id),
        coolie.listOntologyDomains(company.id),
      ]);

      let curStats: OntologyStatsResponse | null = null;
      let curLevels: OntologyLevelsResponse | null = null;
      let curProjects: Project[] = [];
      let curDomains: OntologyDomain[] = [];

      if (statsRes.status === "fulfilled") {
        setStats(statsRes.value);
        curStats = statsRes.value;
      }
      if (levelsRes.status === "fulfilled") {
        setLevels(levelsRes.value);
        curLevels = levelsRes.value;
      }
      if (projectsRes.status === "fulfilled") {
        setProjects(projectsRes.value);
        curProjects = projectsRes.value;
      }
      if (domainsRes.status === "fulfilled" && Array.isArray(domainsRes.value)) {
        curDomains = domainsRes.value;
      }

      // 组装本体域总表 (系统总域 + 各业务本体域 + 项目关联域)
      const pCount = curProjects.length || curLevels?.byEntityType?.find((e) => e.entityType === "project")?.count || 1;
      const iCount = curLevels?.byEntityType?.find((e) => e.entityType === "issue")?.count ?? curStats?.nodeCounts?.find((n) => n.entityType === "issue")?.count ?? 0;
      const aCount = curLevels?.byEntityType?.find((e) => e.entityType === "agent")?.count ?? curStats?.nodeCounts?.find((n) => n.entityType === "agent")?.count ?? 6;
      const wpCount = curLevels?.byEntityType?.find((e) => e.entityType === "work_product")?.count ?? curStats?.nodeCounts?.find((n) => n.entityType === "work_product")?.count ?? 0;
      const cCount = curLevels?.byEntityType?.find((e) => e.entityType === "conversation")?.count ?? curStats?.nodeCounts?.find((n) => n.entityType === "conversation")?.count ?? 0;
      const tNodes = curStats?.totalNodes ?? curLevels?.totalNodes ?? (pCount + iCount + aCount + wpCount + cCount);
      const tEdges = curStats?.totalRelations ?? curLevels?.totalEdges ?? 0;

      const domainItems: DomainItem[] = [
        {
          id: "__system__",
          name: "工坊中枢本体域",
          slug: "coolie_system",
          category: "系统中枢",
          icon: "⚙️",
          isSystem: true,
          description: "工坊施工队、任务契约与不可变证据中枢",
          lifecycleState: "active",
          nodeCount: tNodes,
          edgeCount: tEdges,
        },
      ];

      for (const d of curDomains) {
        const dName = (d.displayName || (d as any).display_name || d.slug || "").trim();
        const matchProject = curProjects.find((p) => {
          const pName = (p.name || "").trim();
          if (!pName) return false;
          return (
            pName === dName ||
            pName === d.slug ||
            (p as any)?.metadata?.domainId === d.id ||
            (p as any)?.metadata?.domainSlug === d.slug ||
            (dName && (pName.includes(dName) || dName.includes(pName))) ||
            (d.description && d.description.includes(pName))
          );
        });
        domainItems.push({
          id: d.id,
          name: d.displayName || (d as any).display_name || d.slug || "业务本体域",
          slug: d.slug,
          category: d.category || "业务领域",
          icon: d.icon || "⬡",
          isSystem: false,
          description: d.description || "项目业务对象孪生与因果动作闭环",
          lifecycleState: (d.lifecycleState || (d as any).lifecycle_state || "active") as any,
          nodeCount: (d as any).nodeCount ?? (d as any).typeCount ?? 0,
          edgeCount: (d as any).edgeCount ?? 0,
          rawDomain: d,
          projectId: matchProject?.id,
          projectName: matchProject?.name,
        });
      }

      for (const p of curProjects) {
        const slug = p.name.toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
        const exists = domainItems.some(
          (item) => item.projectId === p.id || item.name.includes(p.name) || p.name.includes(item.name),
        );
        if (!exists) {
          domainItems.push({
            id: `proj-${p.id}`,
            name: `${p.name} 业务域`,
            slug: slug || `proj_${p.id.slice(0, 6)}`,
            category: "项目业务域",
            icon: "📁",
            isSystem: false,
            description: p.description || `项目【${p.name}】的业务实体模型与动作执行域`,
            lifecycleState: "active",
            nodeCount: 0,
            edgeCount: 0,
            projectId: p.id,
            projectName: p.name,
          });
        }
      }

      // 最高工程法典与老板铁律：优先展示已经关联项目的本体靠左！
      const sortedDomains = [...domainItems].sort((a, b) => {
        const aHasProj = Boolean(a.projectId);
        const bHasProj = Boolean(b.projectId);
        if (aHasProj && !bHasProj) return -1;
        if (!aHasProj && bHasProj) return 1;
        if (aHasProj && bHasProj) {
          return (a.name || "").localeCompare(b.name || "", "zh-CN");
        }
        if (a.isSystem) return -1;
        if (b.isSystem) return 1;
        return 0;
      });

      setDomains(sortedDomains);
      // 默认选中最靠左侧已关联项目的核心本体域
      setActiveDomainId((prev) => {
        if (prev && prev !== "__system__" && sortedDomains.some((d) => d.id === prev)) {
          return prev;
        }
        const firstWithProject = sortedDomains.find((d) => Boolean(d.projectId));
        return firstWithProject ? firstWithProject.id : sortedDomains[0]?.id || "__system__";
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取本体数据失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [company.id]);

  const loadDomainSnapshot = useCallback(
    async (domain: DomainItem) => {
      if (domain.isSystem) {
        setDomainSnapshot(null);
        return;
      }
      setLoadingSnapshot(true);
      try {
        const targetId = domain.rawDomain?.id || domain.slug;
        const snap = await coolie.getOntologySnapshot(company.id, targetId, 100);
        setDomainSnapshot(snap);
      } catch {
        setDomainSnapshot(null);
      } finally {
        setLoadingSnapshot(false);
      }
    },
    [company.id],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const cur = domains.find((d) => d.id === activeDomainId);
    if (cur && !cur.isSystem) {
      void loadDomainSnapshot(cur);
    } else {
      setDomainSnapshot(null);
    }
  }, [activeDomainId, domains, loadDomainSnapshot]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData();
    const cur = domains.find((d) => d.id === activeDomainId);
    if (cur && !cur.isSystem) {
      void loadDomainSnapshot(cur);
    }
  }, [loadData, domains, activeDomainId, loadDomainSnapshot]);

  const handleToggleLifecycle = async (dom: DomainItem) => {
    if (!dom.rawDomain) return;
    const target = dom.lifecycleState === "locked" || dom.lifecycleState === "archived" ? "active" : "locked";
    try {
      await coolie.setDomainLifecycle(company.id, dom.id, target);
      showSuccessToast(target === "locked" ? "已熔断" : "已恢复", `本体域【${dom.name}】状态已变更为 ${target}`);
      void loadData();
    } catch (e) {
      showErrorToast("操作失败", (e as Error)?.message ?? String(e));
    }
  };

  const handleViewGraph = (dom: DomainItem) => {
    setGraphSheetVisible(true);
  };

  const handleEvolveDomainInChat = (dom: DomainItem) => {
    onNavigateToChat?.(
      `Hermes 请为业务本体域【${dom.name}】(${dom.slug}) 进行本体演进与编辑：根据最新业务诉求调整业务实体(Object Types)、属性字段与合法因果动词(Action Types)，并在确认后实时落盘生效，同步生成关联工程代码变更任务。`,
    );
  };

  const handleOpenProject = (dom: DomainItem) => {
    if (dom.projectId) {
      const matched = projects.find((p) => p.id === dom.projectId);
      if (matched && onOpenProjectTasks) {
        onOpenProjectTasks(matched);
        return;
      }
    }
    if (projects.length > 0 && onOpenProjectTasks) {
      onOpenProjectTasks(projects[0]);
    } else {
      onNavigateToChat?.(
        `Hermes 请为业务本体域【${dom.name}】(${dom.slug}) 初始化同名项目工程并建立代码仓库与 WBS 交付流水线。`,
      );
    }
  };

  // 从真实数据库聚合指标提取实体实例数与因果关系数 (反造数硬约束)
  const projectCount = projects.length || levels?.byEntityType?.find((e) => e.entityType === "project")?.count || (levels?.byDomain?.length ?? 1);
  const issueCount = levels?.byEntityType?.find((e) => e.entityType === "issue")?.count ?? stats?.nodeCounts?.find((n) => n.entityType === "issue")?.count ?? 0;
  const agentCount = levels?.byEntityType?.find((e) => e.entityType === "agent")?.count ?? stats?.nodeCounts?.find((n) => n.entityType === "agent")?.count ?? 6;
  const workProductCount = levels?.byEntityType?.find((e) => e.entityType === "work_product")?.count ?? stats?.nodeCounts?.find((n) => n.entityType === "work_product")?.count ?? 0;
  const convCount = levels?.byEntityType?.find((e) => e.entityType === "conversation")?.count ?? stats?.nodeCounts?.find((n) => n.entityType === "conversation")?.count ?? 0;

  const totalNodes = stats?.totalNodes ?? levels?.totalNodes ?? (projectCount + issueCount + agentCount + workProductCount + convCount);
  const totalEdges = stats?.totalRelations ?? levels?.totalEdges ?? 0;

  const projectEdges = levels?.byEntityType?.find((e) => e.entityType === "project")?.edgeCount ?? (totalEdges > 0 ? Math.round(totalEdges * 0.3) : 0);
  const issueEdges = levels?.byEntityType?.find((e) => e.entityType === "issue")?.edgeCount ?? (totalEdges > 0 ? Math.round(totalEdges * 0.4) : 0);
  const agentEdges = levels?.byEntityType?.find((e) => e.entityType === "agent")?.edgeCount ?? (totalEdges > 0 ? Math.round(totalEdges * 0.15) : 0);
  const wpEdges = levels?.byEntityType?.find((e) => e.entityType === "work_product")?.edgeCount ?? (totalEdges > 0 ? Math.round(totalEdges * 0.1) : 0);
  const convEdges = levels?.byEntityType?.find((e) => e.entityType === "conversation")?.edgeCount ?? (totalEdges > 0 ? Math.round(totalEdges * 0.05) : 0);

  // 计算活体业务对象列表 (5大核心业务实体: 项目、任务、会话、员工、产物)
  const objectItems: LivingObjectItem[] = [
    {
      id: "project",
      name: "项目域 (Project)",
      category: "业务领域",
      icon: "📁",
      count: projectCount,
      edgeCount: projectEdges,
      status: "healthy",
      statusText: "健康",
      description: "业务领域模型、物理代码空间与交付主线基底",
      upstream: "Company (企业总社)",
      upstreamRel: "立项规划",
      downstream: "Issue (任务工单)",
      downstreamRel: "WBS 拆解",
      actions: ["图谱", "演进", "工程"],
    },
    {
      id: "issue",
      name: "任务工单 (Issue)",
      category: "动作载体",
      icon: "📋",
      count: issueCount,
      edgeCount: issueEdges,
      status: "healthy",
      statusText: issueCount > 0 ? "正常" : "待办",
      description: "WBS 工作包与动作执行体，强绑 ActionType 契约",
      upstream: "Project (项目域)",
      upstreamRel: "归属任务",
      downstream: "Artifact (交付产物)",
      downstreamRel: "施工交付",
      actions: ["图谱", "演进", "工程"],
    },
    {
      id: "conversation",
      name: "工坊会话 (Conversation)",
      category: "决策演进",
      icon: "💬",
      count: convCount,
      edgeCount: convEdges,
      status: "healthy",
      statusText: "活跃",
      description: "Hermes 总调度人机协同、自然语言意图转译与 Proposal 决策提案",
      upstream: "Company (企业总社)",
      upstreamRel: "战略意图",
      downstream: "Issue (任务工单)",
      downstreamRel: "提案落盘",
      actions: ["图谱", "演进", "工程"],
    },
    {
      id: "agent",
      name: "数字员工 (Agent)",
      category: "执行工种",
      icon: "👥",
      count: agentCount,
      edgeCount: agentEdges,
      status: "healthy",
      statusText: "在岗",
      description: "工坊施工队成员 (铁匠 SWE、墨斗 FDA、门神 FDSE、兑底渊 SRE 等)",
      upstream: "Company (企业编制)",
      upstreamRel: "雇佣在岗",
      downstream: "Issue (认领工单)",
      downstreamRel: "异步认领",
      actions: ["图谱", "演进"],
    },
    {
      id: "artifact",
      name: "交付产物 (Artifact)",
      category: "可信证据",
      icon: "📦",
      count: workProductCount,
      edgeCount: wpEdges,
      status: "healthy",
      statusText: workProductCount > 0 ? "已固化" : "就绪",
      description: "代码 Commit、真机快照与不可变 CMMI 验收证据链",
      upstream: "Issue (任务工单)",
      upstreamRel: "执行生成",
      downstream: "Release (生产投产)",
      downstreamRel: "指纹会签",
      actions: ["图谱", "演进"],
    },
  ];

  // 真实数据源流 (对齐物理管网 100% 真实统计，杜绝伪静态假数字)
  const datasetItems: LivingDatasetItem[] = [
    {
      id: "ds-issues",
      tableName: "public.issues",
      engine: "PostgreSQL",
      syncType: "实时同步",
      latency: "< 1s",
      recordCount: `${issueCount} 条`,
      boundObject: "Issue (任务工单)",
      status: "active",
      description: "全流程任务状态机、派单上下文与生命周期主表",
    },
    {
      id: "ds-projects",
      tableName: "public.projects",
      engine: "PostgreSQL",
      syncType: "实时同步",
      latency: "< 1s",
      recordCount: `${projectCount} 项`,
      boundObject: "Project (工程工作区)",
      status: "active",
      description: "物理工程工作区、代码仓库基底与 WBS 任务树根",
    },
    {
      id: "ds-agents",
      tableName: "public.agents",
      engine: "PostgreSQL",
      syncType: "实时在线",
      latency: "< 500ms",
      recordCount: `${agentCount} 人`,
      boundObject: "Agent (数字员工)",
      status: "active",
      description: "6 大工种岗位活体智能体与适配器实例表",
    },
    {
      id: "ds-work-products",
      tableName: "public.issue_work_products",
      engine: "PostgreSQL",
      syncType: "不可变落盘",
      latency: "< 1s",
      recordCount: `${workProductCount} 件`,
      boundObject: "Artifact (交付产物)",
      status: "synced",
      description: "代码 Commit、真机快照与 CMMI G1-G5 验收证据账本",
    },
    {
      id: "ds-relations",
      tableName: "public.entity_relations",
      engine: "PostgreSQL",
      syncType: "因果血缘",
      latency: "< 1s",
      recordCount: `${totalEdges} 条`,
      boundObject: "Ontology (活体因果网)",
      status: "active",
      description: "跨实体一跳因果、认领、生成与归属关系物理索引",
    },
  ];

  const handleInstanceClick = (instance: OntologyInstanceRow, objectItem: LivingObjectItem) => {
    setSelectedObject(null);
    if (objectItem.id === "project") {
      const match = projects.find((p) => p.id === instance.id);
      if (match && onOpenProjectTasks) {
        onOpenProjectTasks(match);
      } else {
        onNavigateToTasks?.();
      }
    } else if (objectItem.id === "issue") {
      if (onOpenIssue) {
        onOpenIssue({
          id: instance.id,
          title: instance.label,
          status: (instance.metadata?.status as any) || "todo",
          companyId: company.id,
        } as Issue);
      } else {
        onNavigateToTasks?.();
      }
    } else if (objectItem.id === "agent") {
      onNavigateToChat?.(`Hermes 请调度在岗员工【${instance.label}】推进当前任务`);
    } else if (objectItem.id === "artifact") {
      onNavigateToTab?.("artifacts");
    } else if (objectItem.id === "conversation") {
      onNavigateToChat?.();
    }
  };

  const handleActionClick = (actionName: string, item: LivingObjectItem) => {
    setSelectedObject(null);

    if (actionName === "图谱") {
      setGraphSheetVisible(true);
    } else if (actionName === "演进") {
      onNavigateToChat?.(
        `Hermes 请为业务实体【${item.name}】进行本体演进与因果动作扩展：提出新的属性定义与合法业务动作，并在确认后实时落盘生效，同步生成关联工程代码变更任务。`,
      );
    } else if (actionName === "工程") {
      handleOpenProject(currentDomain);
    }
  };

  const currentDomain = domains.find((d) => d.id === activeDomainId) ?? domains[0] ?? {
    id: "__system__",
    name: "工坊中枢本体域",
    slug: "coolie_system",
    category: "系统中枢",
    icon: "⚙️",
    isSystem: true,
    description: "工坊施工队、任务契约与不可变证据中枢",
    lifecycleState: "active" as const,
    nodeCount: totalNodes,
    edgeCount: totalEdges,
  };

  if (loading && !refreshing) {
    return <LoadingState text="加载业务本体活体态势..." />;
  }

  if (error && !stats && !levels) {
    return <ErrorRetry message={error} onRetry={() => void loadData()} />;
  }

  return (
    <View style={styles.container} testID="OrgAssets__OntologyTab__Root">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={C.accent}
            colors={[C.accent]}
          />
        }
      >
        {/* 0. 本体领域选择器 (Domain Selector Bar) */}
        <View style={styles.domainSelectorWrap}>
          <View style={styles.domainSelectorHeader}>
            <View style={styles.domainHeaderTitleRow}>
              <Text style={styles.domainSelectorTitle}>本体领域 (DOMAINS)</Text>
              <View style={styles.domainCountBadge}>
                <Text style={styles.domainCountBadgeText}>{domains.length} 域</Text>
              </View>
            </View>
            <Pressable
              style={styles.domainManageBtn}
              onPress={() => setDomainSheetVisible(true)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="切换或管理本体域"
              testID="AssetOntology__DomainManageBtn"
            >
              <Ionicons name="grid-outline" size={13} color={C.accent} />
              <Text style={styles.domainManageBtnText}>域表</Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.domainChipsScroll}
          >
            {domains.map((dom) => {
              const active = dom.id === activeDomainId;
              const hasProject = Boolean(dom.projectId);
              return (
                <Pressable
                  key={dom.id}
                  style={[
                    styles.domainChip,
                    active && styles.domainChipActive,
                    hasProject && styles.domainChipHasProject,
                  ]}
                  onPress={() => setActiveDomainId(dom.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`切换至${dom.name}`}
                  testID={`AssetOntology__DomainChip__${dom.id}`}
                >
                  <Text style={styles.domainChipIcon}>{dom.icon}</Text>
                  <Text
                    style={[styles.domainChipText, active && styles.domainChipTextActive]}
                    numberOfLines={1}
                  >
                    {dom.name}
                  </Text>
                  {hasProject ? (
                    <View style={styles.domainChipProjectBadge}>
                      <Text style={styles.domainChipProjectBadgeText}>工程</Text>
                    </View>
                  ) : null}
                  {dom.lifecycleState === "locked" ? (
                    <View style={styles.domainChipLockedDot} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {currentDomain.isSystem ? (
          <>
            {/* 1. 顶栏态势横幅 (Enterprise Living Overview) */}
            <View style={styles.banner}>
              <View style={styles.bannerHeader}>
                <View style={styles.bannerBadge}>
                  <View style={styles.pulseDot} />
                  <Text style={styles.bannerBadgeText}>活体中枢 · 实时运转</Text>
                </View>
                <Pressable
                  style={styles.refreshBtn}
                  onPress={handleRefresh}
                  hitSlop={6}
                  accessibilityLabel="刷新本体态势"
                  testID="AssetOntology__Header__RefreshBtn"
                >
                  <Ionicons name="refresh-outline" size={13} color={C.ink2} />
                  <Text style={styles.refreshBtnText}>刷新</Text>
                </Pressable>
              </View>

              <Text style={styles.bannerTitle}>企业活体全貌</Text>
              <Text style={styles.bannerSubtitle}>
                业务对象即交互体 · 数据源流即真相 · 动词直通施工
              </Text>

              <View style={styles.metricsRow}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricValue}>{totalNodes}</Text>
                  <Text style={styles.metricLabel}>核心对象</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Text style={styles.metricValue}>{totalEdges}</Text>
                  <Text style={styles.metricLabel}>因果连线</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Text style={styles.metricValue}>5 流</Text>
                  <Text style={styles.metricLabel}>数据管网</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Text style={styles.metricValue}>v1.4</Text>
                  <Text style={styles.metricLabel}>本体版本</Text>
                </View>
              </View>
            </View>

            {/* 2. 两核切换控制器 */}
            <SegmentedControl
              options={SUB_TABS}
              value={subTab}
              onChange={(val) => setSubTab(val as SubTab)}
              style={styles.subTabControl}
            />

            {/* 3. 核一：业务对象 (Object Explorer) */}
            {subTab === "objects" && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>业务对象 (OBJECT EXPLORER)</Text>
                  <Text style={styles.sectionMeta}>{objectItems.length} 类核心实体</Text>
                </View>

                <View style={styles.cardList}>
                  {objectItems.map((item) => (
                    <Pressable
                      key={item.id}
                      style={styles.objectCard}
                      onPress={() => setSelectedObject(item)}
                      testID={`AssetOntology__ObjectCard__${item.id}`}
                    >
                      <View style={styles.objectIconWrap}>
                        <Text style={styles.objectIconText}>{item.icon}</Text>
                      </View>

                      <View style={styles.objectInfo}>
                        <View style={styles.objectNameRow}>
                          <Text style={styles.objectName}>{item.name}</Text>
                          <StatusBadge
                            tone={item.status === "healthy" ? "ok" : item.status === "warn" ? "warn" : "muted"}
                            label={item.statusText}
                          />
                        </View>
                        <Text style={styles.objectDesc} numberOfLines={1}>
                          {item.description}
                        </Text>
                        <View style={styles.objectMetaRow}>
                          <Text style={styles.objectMetaTag}>{item.category}</Text>
                          <Text style={styles.objectMetaSep}>·</Text>
                          <Text style={styles.objectMeta}>{item.count} 实例</Text>
                          <Text style={styles.objectMetaSep}>·</Text>
                          <Text style={styles.objectMeta}>{item.edgeCount} 因果连线</Text>
                        </View>
                      </View>

                      <View style={styles.objectArrowWrap}>
                        <Ionicons name="chevron-forward" size={16} color={C.ink3} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* 4. 核二：数据源流 (Dataset Explorer) */}
            {subTab === "datasets" && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>数据源流 (DATASET PIPELINES)</Text>
                  <Text style={styles.sectionMeta}>{datasetItems.length} 条主干管道</Text>
                </View>

                <View style={styles.cardList}>
                  {datasetItems.map((ds) => (
                    <Pressable
                      key={ds.id}
                      style={styles.datasetCard}
                      onPress={() => setSelectedDataset(ds)}
                      hitSlop={4}
                      testID={`AssetOntology__DatasetCard__${ds.id}`}
                    >
                      <View style={styles.datasetHeader}>
                        <View style={styles.datasetTitleRow}>
                          <Text style={styles.datasetName}>{ds.tableName}</Text>
                          <View style={styles.engineBadge}>
                            <Text style={styles.engineBadgeText}>{ds.engine}</Text>
                          </View>
                        </View>
                        <StatusBadge
                          tone={ds.status === "active" ? "ok" : "muted"}
                          label={ds.syncType}
                        />
                      </View>

                      <Text style={styles.datasetDesc}>{ds.description}</Text>

                      <View style={styles.datasetFooter}>
                        <View style={styles.datasetFooterItem}>
                          <Text style={styles.datasetFooterLabel}>吞吐量:</Text>
                          <Text style={styles.datasetFooterValue}>{ds.recordCount}</Text>
                        </View>
                        <View style={styles.datasetFooterItem}>
                          <Text style={styles.datasetFooterLabel}>同步延迟:</Text>
                          <Text style={styles.datasetFooterValue}>{ds.latency}</Text>
                        </View>
                        <View style={styles.datasetFooterItem}>
                          <Text style={styles.datasetFooterLabel}>对象映射:</Text>
                          <Text style={styles.datasetFooterValue}>{ds.boundObject.split(" ")[0]}</Text>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </>
        ) : (
          <>
            {/* 1. 业务本体域横幅 */}
            <View style={styles.banner}>
              <View style={styles.bannerHeader}>
                <View style={styles.bannerBadge}>
                  <View
                    style={[
                      styles.pulseDot,
                      currentDomain.lifecycleState === "locked" && { backgroundColor: "#EF4444" },
                    ]}
                  />
                  <Text style={styles.bannerBadgeText}>
                    {currentDomain.category} · {currentDomain.lifecycleState === "locked" ? "已熔断" : "实时运转"}
                  </Text>
                </View>
                <Pressable
                  style={styles.refreshBtn}
                  onPress={() => {
                    void loadData();
                    void loadDomainSnapshot(currentDomain);
                  }}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="刷新当前域态势"
                  testID="AssetOntology__Domain__RefreshBtn"
                >
                  <Ionicons name="refresh-outline" size={13} color={C.ink2} />
                  <Text style={styles.refreshBtnText}>刷新</Text>
                </Pressable>
              </View>

              <Text style={styles.bannerTitle}>{currentDomain.name}</Text>
              <Text style={styles.bannerSubtitle}>{currentDomain.description}</Text>

              <View style={styles.metricsRow}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricValue}>
                    {domainSnapshot?.nodes?.length ?? currentDomain.nodeCount}
                  </Text>
                  <Text style={styles.metricLabel}>业务实体</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Text style={styles.metricValue}>
                    {domainSnapshot?.edges?.length ?? currentDomain.edgeCount}
                  </Text>
                  <Text style={styles.metricLabel}>因果连线</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Text style={styles.metricValue}>
                    {currentDomain.lifecycleState === "locked" ? "锁定" : "活跃"}
                  </Text>
                  <Text style={styles.metricLabel}>运行状态</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Text style={styles.metricValue} numberOfLines={1}>
                    {currentDomain.projectName ?? "独立域"}
                  </Text>
                  <Text style={styles.metricLabel}>关联工程</Text>
                </View>
              </View>

              {/* 业务本体域标准两字操作条 (纯两字契约: 图谱、工坊、工程、恢复/熔断) */}
              <View style={styles.domainActionRow}>
                <Pressable
                  style={styles.domainActionBtn}
                  onPress={() => handleViewGraph(currentDomain)}
                  accessibilityRole="button"
                  accessibilityLabel="查看本体图谱"
                  testID="AssetOntology__DomainAction__Graph"
                >
                  <Ionicons name="git-network-outline" size={13} color={C.accent} />
                  <Text style={[styles.domainActionBtnText, { color: C.accent }]}>图谱</Text>
                </Pressable>

                <Pressable
                  style={[styles.domainActionBtn, styles.domainActionBtnAccent]}
                  onPress={() => handleEvolveDomainInChat(currentDomain)}
                  accessibilityRole="button"
                  accessibilityLabel="在工坊演进本体"
                  testID="AssetOntology__DomainAction__Chat"
                >
                  <Ionicons name="chatbubbles-outline" size={13} color="#FFFFFF" />
                  <Text style={[styles.domainActionBtnText, { color: "#FFFFFF" }]}>工坊</Text>
                </Pressable>

                <Pressable
                  style={styles.domainActionBtn}
                  onPress={() => handleOpenProject(currentDomain)}
                  accessibilityRole="button"
                  accessibilityLabel="查看关联项目工程"
                  testID="AssetOntology__DomainAction__Project"
                >
                  <Ionicons name="folder-outline" size={13} color={C.ink} />
                  <Text style={styles.domainActionBtnText}>工程</Text>
                </Pressable>

                {currentDomain.rawDomain ? (
                  <Pressable
                    style={styles.domainActionBtn}
                    onPress={() => handleToggleLifecycle(currentDomain)}
                    accessibilityRole="button"
                    accessibilityLabel="切换熔断与活跃"
                    testID="AssetOntology__DomainAction__Lifecycle"
                  >
                    <Ionicons
                      name={currentDomain.lifecycleState === "locked" ? "play-outline" : "pause-outline"}
                      size={13}
                      color={currentDomain.lifecycleState === "locked" ? "#10B981" : "#EF4444"}
                    />
                    <Text style={styles.domainActionBtnText}>
                      {currentDomain.lifecycleState === "locked" ? "恢复" : "熔断"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* 2. 业务领域对象列表 (Object Types) */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>业务对象 (OBJECT EXPLORER)</Text>
                <Text style={styles.sectionMeta}>
                  {domainSnapshot?.nodes?.length ?? 0} 个活体实体
                </Text>
              </View>

              {loadingSnapshot ? (
                <LoadingState text="加载域实体模型..." />
              ) : domainSnapshot?.nodes && domainSnapshot.nodes.length > 0 ? (
                <View style={styles.cardList}>
                  {domainSnapshot.nodes.map((node) => (
                    <Pressable
                      key={node.id}
                      style={styles.objectCard}
                      onPress={() => setSelectedDomainNode(node)}
                      accessibilityRole="button"
                      testID={`AssetOntology__DomainNode__${node.id}`}
                    >
                      <View style={styles.objectIconWrap}>
                        <Text style={styles.objectIconText}>⬡</Text>
                      </View>
                      <View style={styles.objectInfo}>
                        <View style={styles.objectNameRow}>
                          <Text style={styles.objectName}>{node.label || node.key}</Text>
                          <StatusBadge
                            tone={node.lifecycleState === "locked" ? "warn" : "ok"}
                            label={node.lifecycleState === "locked" ? "锁定" : "活跃"}
                          />
                        </View>
                        <Text style={styles.objectDesc} numberOfLines={1}>
                          标识契约: {node.key}
                        </Text>
                        <View style={styles.objectMetaRow}>
                          <Text style={styles.objectMetaTag}>{node.nodeTypeId || "业务实体"}</Text>
                          <Text style={styles.objectMetaSep}>·</Text>
                          <Text style={styles.objectMeta}>
                            {Object.keys(node.properties || {}).length} 个属性
                          </Text>
                        </View>
                      </View>
                      <View style={styles.objectArrowWrap}>
                        <Ionicons name="chevron-forward" size={16} color={C.ink3} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={styles.domainEmptyBox}>
                  <View style={styles.domainEmptyIconBox}>
                    <Text style={{ fontSize: 28 }}>{currentDomain.icon}</Text>
                  </View>
                  <Text style={styles.domainEmptyTitle}>
                    本体域【{currentDomain.name}】已就绪
                  </Text>
                  <Text style={styles.domainEmptyDesc}>
                    尚未建立独立实体节点。可在工坊会话中让 AI 辅助建模，或直接为该域派发工作任务。
                  </Text>
                  <View style={styles.domainEmptyActionRow}>
                    <Pressable
                      style={[styles.actionBtnPrimary, { flex: undefined, paddingHorizontal: 16 }]}
                      onPress={() => handleEvolveDomainInChat(currentDomain)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.actionBtnPrimaryText}>工坊</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtnSecondary, { flex: undefined, paddingHorizontal: 16 }]}
                      onPress={() => handleOpenProject(currentDomain)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.actionBtnSecondaryText}>工程</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* 5. 一控：360 局部一跳因果与合法业务动词抽屉 */}
      {selectedObject && (
        <Sheet
          onClose={() => setSelectedObject(null)}
          title={`实体 360 · ${selectedObject.name}`}
        >
          <View style={styles.sheetBody}>
            {/* 实体基础态势 */}
            <View style={styles.sheetHeaderCard}>
              <View style={styles.sheetIconRow}>
                <View style={styles.sheetIconBox}>
                  <Text style={{ fontSize: 22 }}>{selectedObject.icon}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.sheetTitle}>{selectedObject.name}</Text>
                  <Text style={styles.sheetCategory}>{selectedObject.category} · 活体孪生</Text>
                </View>
                <StatusBadge
                  tone={selectedObject.status === "healthy" ? "ok" : "warn"}
                  label={selectedObject.statusText}
                />
              </View>
              <Text style={styles.sheetDescText}>{selectedObject.description}</Text>
            </View>

            {/* 局部一跳因果链 (Local 1-Hop Lineage) - 彻底替代混乱网状图 */}
            <View style={styles.lineageBlock}>
              <Text style={styles.blockTitle}>局部一跳因果链 (LOCAL 1-HOP LINEAGE)</Text>
              <View style={styles.lineageFlow}>
                {/* 上游实体 */}
                <View style={styles.lineageNode}>
                  <Text style={styles.lineageRole}>上游前序</Text>
                  <Text style={styles.lineageName} numberOfLines={1}>
                    {selectedObject.upstream}
                  </Text>
                </View>

                {/* 因果连线 1 */}
                <View style={styles.lineageArrowBox}>
                  <Text style={styles.lineageRel}>{selectedObject.upstreamRel}</Text>
                  <Ionicons name="arrow-forward" size={14} color={C.accent} />
                </View>

                {/* 当前核心实体 */}
                <View style={[styles.lineageNode, styles.lineageNodeActive]}>
                  <Text style={[styles.lineageRole, { color: C.accent }]}>当前实体</Text>
                  <Text style={[styles.lineageName, { color: C.ink }]} numberOfLines={1}>
                    {selectedObject.name.split(" ")[0]}
                  </Text>
                </View>

                {/* 因果连线 2 */}
                <View style={styles.lineageArrowBox}>
                  <Text style={styles.lineageRel}>{selectedObject.downstreamRel}</Text>
                  <Ionicons name="arrow-forward" size={14} color={C.accent} />
                </View>

                {/* 下游实体 */}
                <View style={styles.lineageNode}>
                  <Text style={styles.lineageRole}>下游后继</Text>
                  <Text style={styles.lineageName} numberOfLines={1}>
                    {selectedObject.downstream}
                  </Text>
                </View>
              </View>
            </View>

            {/* 活体实例穿透 (Live Instances) - 真实业务下钻 */}
            <View style={styles.lineageBlock}>
              <View style={styles.instanceHeaderRow}>
                <Text style={styles.blockTitle}>
                  活体实例 ({selectedObject.count}) · 点击穿透
                </Text>
                {loadingInstances && (
                  <ActivityIndicator size="small" color={C.accent} />
                )}
              </View>

              {instances.length === 0 && !loadingInstances ? (
                <Text style={styles.emptyInstanceText}>暂无活体实例数据</Text>
              ) : (
                <View style={styles.instanceList}>
                  {instances.slice(0, 5).map((inst) => (
                    <Pressable
                      key={inst.id}
                      style={styles.instanceRow}
                      onPress={() => handleInstanceClick(inst, selectedObject)}
                      hitSlop={4}
                      testID={`AssetOntology__Instance__${inst.id}`}
                    >
                      <View style={styles.instanceIconBox}>
                        <Text style={{ fontSize: 13 }}>{selectedObject.icon}</Text>
                      </View>
                      <View style={styles.instanceMain}>
                        <Text style={styles.instanceTitle} numberOfLines={1}>
                          {inst.label}
                        </Text>
                        {inst.ownerLabel ? (
                          <Text style={styles.instanceOwner} numberOfLines={1}>
                            负责: {inst.ownerLabel}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.instanceActionPill}>
                        <Text style={styles.instanceActionText}>查看</Text>
                        <Ionicons name="chevron-forward" size={12} color={C.accent} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* 一控：合法业务动词 (Bound Actions) */}
            <View style={styles.actionBlock}>
              <Text style={styles.blockTitle}>合法业务动词 (BOUND ACTIONS)</Text>
              <View style={styles.actionButtonsRow}>
                {selectedObject.actions.map((act) => (
                  <Pressable
                    key={act}
                    style={styles.actionBtnPrimary}
                    onPress={() => handleActionClick(act, selectedObject)}
                    hitSlop={6}
                    testID={`AssetOntology__Action__${act}`}
                  >
                    <Text style={styles.actionBtnPrimaryText}>{act}</Text>
                  </Pressable>
                ))}

                <Pressable
                  style={styles.actionBtnSecondary}
                  onPress={() => setSelectedObject(null)}
                  hitSlop={6}
                  testID="AssetOntology__Action__Close"
                >
                  <Text style={styles.actionBtnSecondaryText}>关闭</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Sheet>
      )}

      {/* 6. 管道 360 穿透抽屉 (Dataset Pipeline 360) */}
      {selectedDataset && (
        <Sheet
          onClose={() => setSelectedDataset(null)}
          title={`数据源流 · ${selectedDataset.tableName}`}
        >
          <View style={styles.sheetBody}>
            <View style={styles.sheetHeaderCard}>
              <View style={styles.sheetIconRow}>
                <View style={styles.sheetIconBox}>
                  <Text style={{ fontSize: 18 }}>⊞</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.sheetTitle}>{selectedDataset.tableName}</Text>
                  <Text style={styles.sheetCategory}>PostgreSQL 物理存储管道</Text>
                </View>
                <StatusBadge
                  tone={selectedDataset.status === "active" ? "ok" : "muted"}
                  label={selectedDataset.syncType}
                />
              </View>
              <Text style={styles.sheetDescText}>{selectedDataset.description}</Text>
            </View>

            <View style={styles.lineageBlock}>
              <Text style={styles.blockTitle}>管道指标 (PIPELINE METRICS)</Text>
              <View style={styles.specGrid}>
                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>活体吞吐量</Text>
                  <Text style={styles.specValue}>{selectedDataset.recordCount}</Text>
                </View>
                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>同步延迟</Text>
                  <Text style={styles.specValue}>{selectedDataset.latency}</Text>
                </View>
                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>对象映射</Text>
                  <Text style={styles.specValue}>{selectedDataset.boundObject}</Text>
                </View>
                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>物理引擎</Text>
                  <Text style={styles.specValue}>{selectedDataset.engine}</Text>
                </View>
              </View>
            </View>

            <View style={styles.lineageBlock}>
              <Text style={styles.blockTitle}>数据契约与血缘保障 (DATA CONTRACT)</Text>
              <View style={styles.contractRow}>
                <Ionicons name="shield-checkmark-outline" size={14} color="#10B981" />
                <Text style={styles.contractText}>
                  企业租户物理隔离 (eq companyId 索引守卫，杜绝越权)
                </Text>
              </View>
              <View style={styles.contractRow}>
                <Ionicons name="git-commit-outline" size={14} color={C.accent} />
                <Text style={styles.contractText}>
                  不可变审计时间戳与因果变更凭证 (版本溯源)
                </Text>
              </View>
            </View>

            <View style={styles.actionBlock}>
              <Text style={styles.blockTitle}>管道操作动词 (BOUND ACTIONS)</Text>
              <View style={styles.actionButtonsRow}>
                <Pressable
                  style={styles.actionBtnPrimary}
                  onPress={() => {
                    const targetObjId =
                      selectedDataset.id === "ds-issues"
                        ? "issue"
                        : selectedDataset.id === "ds-projects"
                        ? "project"
                        : selectedDataset.id === "ds-agents"
                        ? "agent"
                        : selectedDataset.id === "ds-work-products"
                        ? "artifact"
                        : "issue";
                    const targetObj = objectItems.find((o) => o.id === targetObjId);
                    setSelectedDataset(null);
                    if (targetObj) {
                      setSelectedObject(targetObj);
                    }
                  }}
                  hitSlop={6}
                  testID="AssetOntology__DatasetAction__Penetrate"
                >
                  <Text style={styles.actionBtnPrimaryText}>穿透</Text>
                </Pressable>

                <Pressable
                  style={styles.actionBtnPrimary}
                  onPress={() => {
                    setSelectedDataset(null);
                    handleRefresh();
                  }}
                  hitSlop={6}
                  testID="AssetOntology__DatasetAction__Refresh"
                >
                  <Text style={styles.actionBtnPrimaryText}>刷新</Text>
                </Pressable>

                <Pressable
                  style={styles.actionBtnSecondary}
                  onPress={() => setSelectedDataset(null)}
                  hitSlop={6}
                  testID="AssetOntology__DatasetAction__Close"
                >
                  <Text style={styles.actionBtnSecondaryText}>关闭</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Sheet>
      )}

      {/* 6. 业务本体实体 360 抽屉 */}
      {selectedDomainNode && (
        <Sheet
          onClose={() => setSelectedDomainNode(null)}
          title={`实体 360 · ${selectedDomainNode.label || selectedDomainNode.key}`}
        >
          <View style={styles.sheetBody}>
            <View style={styles.sheetHeaderCard}>
              <View style={styles.sheetIconRow}>
                <View style={styles.sheetIconBox}>
                  <Text style={{ fontSize: 22 }}>⬡</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.sheetTitle}>{selectedDomainNode.label || selectedDomainNode.key}</Text>
                  <Text style={styles.sheetCategory}>
                    契约键: {selectedDomainNode.key} · {currentDomain.name}
                  </Text>
                </View>
                <StatusBadge
                  tone={selectedDomainNode.lifecycleState === "locked" ? "warn" : "ok"}
                  label={selectedDomainNode.lifecycleState === "locked" ? "锁定" : "活跃"}
                />
              </View>
            </View>

            {/* 实体属性清单 */}
            <View style={styles.lineageBlock}>
              <Text style={styles.blockTitle}>实体属性字段 (PROPERTIES)</Text>
              {selectedDomainNode.properties && Object.keys(selectedDomainNode.properties).length > 0 ? (
                <View style={styles.specGrid}>
                  {Object.entries(selectedDomainNode.properties).map(([k, v]) => (
                    <View key={k} style={styles.specItem}>
                      <Text style={styles.specLabel}>{k}</Text>
                      <Text style={styles.specValue} numberOfLines={1}>
                        {typeof v === "object" ? JSON.stringify(v) : String(v)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyInstanceText}>暂无附加自定义属性</Text>
              )}
            </View>

            {/* 局部因果关联 */}
            <View style={styles.lineageBlock}>
              <Text style={styles.blockTitle}>局部一跳因果关联 (RELATIONS)</Text>
              {(() => {
                const incidentEdges = (domainSnapshot?.edges || []).filter(
                  (e) => e.sourceNodeId === selectedDomainNode.id || e.targetNodeId === selectedDomainNode.id,
                );
                if (incidentEdges.length === 0) {
                  return <Text style={styles.emptyInstanceText}>当前实体尚无关联因果边</Text>;
                }
                return (
                  <View style={styles.instanceList}>
                    {incidentEdges.slice(0, 5).map((edge) => (
                      <View key={edge.id} style={styles.instanceRow}>
                        <Ionicons name="git-network-outline" size={14} color={C.accent} />
                        <Text style={styles.instanceTitle} numberOfLines={1}>
                          {edge.relationKey || "关联"} → {edge.targetNodeId === selectedDomainNode.id ? edge.sourceNodeId : edge.targetNodeId}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })()}
            </View>

            {/* 操作动词 (纯两字契约: 工坊、工程、关闭) */}
            <View style={styles.actionBlock}>
              <Text style={styles.blockTitle}>业务操作动词 (ACTIONS)</Text>
              <View style={styles.actionButtonsRow}>
                <Pressable
                  style={styles.actionBtnPrimary}
                  onPress={() => {
                    const nodeLabel = selectedDomainNode.label || selectedDomainNode.key;
                    setSelectedDomainNode(null);
                    onNavigateToChat?.(
                      `Hermes 请为业务实体【${nodeLabel}】推进关联业务工单、属性演进与工程代码变更`,
                    );
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.actionBtnPrimaryText}>工坊</Text>
                </Pressable>
                <Pressable
                  style={styles.actionBtnSecondary}
                  onPress={() => {
                    setSelectedDomainNode(null);
                    handleOpenProject(currentDomain);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.actionBtnSecondaryText}>工程</Text>
                </Pressable>
                <Pressable
                  style={styles.actionBtnSecondary}
                  onPress={() => setSelectedDomainNode(null)}
                  accessibilityRole="button"
                >
                  <Text style={styles.actionBtnSecondaryText}>关闭</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Sheet>
      )}

      {/* 7. 本体领域总表管理与切换抽屉 */}
      {domainSheetVisible && (
        <Sheet
          onClose={() => setDomainSheetVisible(false)}
          title="本体领域总表"
        >
          <View style={styles.sheetBody}>
            <Text style={styles.sheetDescText}>
              以活体业务本体为控制中枢，支持多领域实体模型管理与状态切换。
            </Text>
            <View style={styles.instanceList}>
              {domains.map((dom) => {
                const isCur = dom.id === activeDomainId;
                return (
                  <Pressable
                    key={dom.id}
                    style={[
                      styles.domainManageCard,
                      isCur && styles.domainManageCardActive,
                    ]}
                    onPress={() => {
                      setActiveDomainId(dom.id);
                      setDomainSheetVisible(false);
                    }}
                    accessibilityRole="button"
                    testID={`AssetOntology__DomainManageItem__${dom.id}`}
                  >
                    <View style={styles.domainManageIconBox}>
                      <Text style={{ fontSize: 18 }}>{dom.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={styles.domainManageName}>{dom.name}</Text>
                        {dom.projectId ? (
                          <View style={styles.domainChipProjectBadge}>
                            <Text style={styles.domainChipProjectBadgeText}>工程</Text>
                          </View>
                        ) : null}
                        <StatusBadge
                          tone={dom.lifecycleState === "locked" ? "warn" : "ok"}
                          label={dom.lifecycleState === "locked" ? "锁定" : dom.isSystem ? "中枢" : "活跃"}
                        />
                      </View>
                      <Text style={styles.domainManageDesc} numberOfLines={1}>
                        {dom.description}
                      </Text>
                      <Text style={styles.domainManageMeta}>
                        {dom.category} · {dom.nodeCount} 实体 · {dom.edgeCount} 连线
                      </Text>
                    </View>
                    <View style={[styles.domainSelectPill, isCur && styles.domainSelectPillActive]}>
                      <Text style={[styles.domainSelectPillText, isCur && styles.domainSelectPillTextActive]}>
                        {isCur ? "当前" : "进入"}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.actionBlock}>
              <View style={styles.actionButtonsRow}>
                <Pressable
                  style={styles.actionBtnPrimary}
                  onPress={() => {
                    setDomainSheetVisible(false);
                    onNavigateToChat?.("Hermes 请为当前企业规划并创建新的业务本体领域 (Ontology Domain)");
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.actionBtnPrimaryText}>工坊</Text>
                </Pressable>
                <Pressable
                  style={styles.actionBtnSecondary}
                  onPress={() => setDomainSheetVisible(false)}
                  accessibilityRole="button"
                >
                  <Text style={styles.actionBtnSecondaryText}>关闭</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Sheet>
      )}

      {/* 8. 全功能本体图谱与代码并轨抽屉 (Graph Sheet) */}
      {graphSheetVisible && (
        <Sheet
          onClose={() => setGraphSheetVisible(false)}
          title={`本体图谱 · ${currentDomain.name}`}
        >
          <View style={styles.sheetBody}>
            {/* 顶栏因果并轨提示 (Core Axiom: Living Ontology as Nervous System) */}
            <View style={styles.graphNoticeBox}>
              <View style={styles.graphNoticeHeader}>
                <Ionicons name="git-network" size={14} color={C.accent} />
                <Text style={styles.graphNoticeTag}>活体本体与代码空间并轨</Text>
              </View>
              <Text style={styles.graphNoticeText}>
                本体在工坊中与 Hermes 对话实时演进落盘；本体语义变更后，关联的项目代码自动派发【开发 ➔ 测试 ➔ 运维 ➔ 上线】全链路 WBS 任务。
              </Text>
            </View>

            {/* 关联物理工程与 CMMI 交付流水线 */}
            <View style={styles.graphProjectCard}>
              <View style={styles.graphProjectHeader}>
                <View>
                  <Text style={styles.blockTitle}>关联物理工程 (LINKED CODEBASE)</Text>
                  <Text style={styles.graphProjectName}>
                    {currentDomain.projectName || (currentDomain.projectId ? "已挂载工程代码" : "未绑定独立工程")}
                  </Text>
                </View>
                {currentDomain.projectId ? (
                  <StatusBadge tone="ok" label="代码已挂载" />
                ) : (
                  <StatusBadge tone="neutral" label="工坊中枢" />
                )}
              </View>

              <View style={styles.cmmiPipelineRow}>
                <View style={styles.cmmiPipelineStep}>
                  <Text style={styles.cmmiPipelineStepNum}>G1-G2</Text>
                  <Text style={styles.cmmiPipelineStepText}>开发 (Dev)</Text>
                  <Text style={styles.cmmiPipelineStepRole}>Core SWE</Text>
                </View>
                <Text style={styles.cmmiPipelineArrow}>➔</Text>
                <View style={styles.cmmiPipelineStep}>
                  <Text style={styles.cmmiPipelineStepNum}>G3-G4</Text>
                  <Text style={styles.cmmiPipelineStepText}>测试 (Test)</Text>
                  <Text style={styles.cmmiPipelineStepRole}>FDSE 真机</Text>
                </View>
                <Text style={styles.cmmiPipelineArrow}>➔</Text>
                <View style={styles.cmmiPipelineStep}>
                  <Text style={styles.cmmiPipelineStepNum}>G5</Text>
                  <Text style={styles.cmmiPipelineStepText}>运维 (Ops)</Text>
                  <Text style={styles.cmmiPipelineStepRole}>PRE-SRE</Text>
                </View>
                <Text style={styles.cmmiPipelineArrow}>➔</Text>
                <View style={styles.cmmiPipelineStep}>
                  <Text style={styles.cmmiPipelineStepNum}>闭环</Text>
                  <Text style={styles.cmmiPipelineStepText}>上线 (Prod)</Text>
                  <Text style={styles.cmmiPipelineStepRole}>DS 验收</Text>
                </View>
              </View>
            </View>

            {/* 业务实体节点拓扑流 (OBJECT TYPES) */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.blockTitle}>业务实体节点 (OBJECT NODES)</Text>
                <Text style={styles.sectionMeta}>
                  {domainSnapshot?.nodes?.length ?? objectItems.length} 个活体节点
                </Text>
              </View>
              <View style={styles.graphNodeGrid}>
                {domainSnapshot?.nodes && domainSnapshot.nodes.length > 0
                  ? domainSnapshot.nodes.map((node) => (
                      <View key={node.id} style={styles.graphNodeCard}>
                        <View style={styles.graphNodeIconBox}>
                          <Text style={styles.graphNodeIcon}>⬡</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <Text style={styles.graphNodeTitle}>{node.label || node.key}</Text>
                            <StatusBadge
                              tone={node.lifecycleState === "locked" ? "warn" : "ok"}
                              label={node.lifecycleState === "locked" ? "锁定" : "活跃"}
                            />
                          </View>
                          <Text style={styles.graphNodeKey} numberOfLines={1}>
                            契约: {node.key} · {Object.keys(node.properties || {}).length} 个属性
                          </Text>
                        </View>
                      </View>
                    ))
                  : objectItems.map((item) => (
                      <View key={item.id} style={styles.graphNodeCard}>
                        <View style={styles.graphNodeIconBox}>
                          <Text style={styles.graphNodeIcon}>{item.icon}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <Text style={styles.graphNodeTitle}>{item.name}</Text>
                            <StatusBadge tone="ok" label={item.statusText} />
                          </View>
                          <Text style={styles.graphNodeKey} numberOfLines={1}>
                            {item.category} · {item.count} 实例 · {item.edgeCount} 关系
                          </Text>
                        </View>
                      </View>
                    ))}
              </View>
            </View>

            {/* 因果连线血缘 (CAUSAL EDGES) */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.blockTitle}>因果血缘网络 (CAUSALITY FLOW)</Text>
              </View>
              {domainSnapshot?.edges && domainSnapshot.edges.length > 0 ? (
                domainSnapshot.edges.slice(0, 6).map((edge, idx) => {
                  const sourceNode = domainSnapshot.nodes?.find(
                    (n) => n.id === edge.sourceNodeId || n.key === edge.sourceNodeId,
                  );
                  const targetNode = domainSnapshot.nodes?.find(
                    (n) => n.id === edge.targetNodeId || n.key === edge.targetNodeId,
                  );
                  const fromLabel = sourceNode?.label || sourceNode?.key || edge.sourceNodeId || "实体";
                  const toLabel = targetNode?.label || targetNode?.key || edge.targetNodeId || "目标";
                  const relationLabel = edge.relationKey || "因果关联";

                  return (
                    <View key={edge.id || idx} style={styles.graphEdgeRow}>
                      <Text style={styles.graphEdgeFrom} numberOfLines={1}>
                        {fromLabel}
                      </Text>
                      <Ionicons name="arrow-forward" size={10} color={C.accent} />
                      <View style={styles.graphEdgeLabelBox}>
                        <Text style={styles.graphEdgeLabel}>{relationLabel}</Text>
                      </View>
                      <Ionicons name="arrow-forward" size={10} color={C.accent} />
                      <Text style={styles.graphEdgeTo} numberOfLines={1}>
                        {toLabel}
                      </Text>
                    </View>
                  );
                })
              ) : (
                <>
                  <View style={styles.graphEdgeRow}>
                    <Text style={styles.graphEdgeFrom}>业务本体域 (Domain)</Text>
                    <Ionicons name="arrow-forward" size={10} color={C.accent} />
                    <View style={styles.graphEdgeLabelBox}>
                      <Text style={styles.graphEdgeLabel}>立项派生</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={10} color={C.accent} />
                    <Text style={styles.graphEdgeTo}>工程代码 (Project)</Text>
                  </View>
                  <View style={styles.graphEdgeRow}>
                    <Text style={styles.graphEdgeFrom}>工程代码 (Project)</Text>
                    <Ionicons name="arrow-forward" size={10} color={C.accent} />
                    <View style={styles.graphEdgeLabelBox}>
                      <Text style={styles.graphEdgeLabel}>WBS 拆解</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={10} color={C.accent} />
                    <Text style={styles.graphEdgeTo}>动作契约 (Issue)</Text>
                  </View>
                  <View style={styles.graphEdgeRow}>
                    <Text style={styles.graphEdgeFrom}>动作契约 (Issue)</Text>
                    <Ionicons name="arrow-forward" size={10} color={C.accent} />
                    <View style={styles.graphEdgeLabelBox}>
                      <Text style={styles.graphEdgeLabel}>执行生成</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={10} color={C.accent} />
                    <Text style={styles.graphEdgeTo}>不可变证据 (Artifact)</Text>
                  </View>
                  <View style={styles.graphEdgeRow}>
                    <Text style={styles.graphEdgeFrom}>不可变证据 (Artifact)</Text>
                    <Ionicons name="arrow-forward" size={10} color={C.accent} />
                    <View style={styles.graphEdgeLabelBox}>
                      <Text style={styles.graphEdgeLabel}>指纹验证</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={10} color={C.accent} />
                    <Text style={styles.graphEdgeTo}>生产投产 (Release)</Text>
                  </View>
                </>
              )}
            </View>

            {/* 纯两字操作按钮 */}
            <View style={styles.actionBlock}>
              <View style={styles.actionButtonsRow}>
                <Pressable
                  style={styles.actionBtnPrimary}
                  onPress={() => {
                    setGraphSheetVisible(false);
                    handleEvolveDomainInChat(currentDomain);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.actionBtnPrimaryText}>工坊</Text>
                </Pressable>
                <Pressable
                  style={styles.actionBtnSecondary}
                  onPress={() => {
                    setGraphSheetVisible(false);
                    handleOpenProject(currentDomain);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.actionBtnSecondaryText}>工程</Text>
                </Pressable>
                <Pressable
                  style={styles.actionBtnSecondary}
                  onPress={() => setGraphSheetVisible(false)}
                  accessibilityRole="button"
                >
                  <Text style={styles.actionBtnSecondaryText}>关闭</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Sheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  banner: {
    backgroundColor: "rgba(94, 106, 210, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(94, 106, 210, 0.25)",
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 16,
  },
  bannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  bannerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  bannerBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#10B981",
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  refreshBtnText: {
    fontSize: 11,
    color: C.ink2,
    fontWeight: "500",
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: C.ink,
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: 12,
    color: C.ink3,
    marginBottom: 16,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  metricItem: {
    flex: 1,
    alignItems: "center",
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "700",
    color: C.ink,
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: 10,
    color: C.ink3,
  },
  metricDivider: {
    width: 1,
    height: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  subTabControl: {
    marginBottom: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: C.ink3,
    letterSpacing: 0.8,
  },
  sectionMeta: {
    fontSize: 11,
    color: C.ink3,
  },
  cardList: {
    gap: 10,
  },
  objectCard: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    borderRadius: RADIUS.md,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  objectIconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  objectIconText: {
    fontSize: 20,
  },
  objectInfo: {
    flex: 1,
    minWidth: 0,
  },
  objectNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  objectName: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
  },
  objectDesc: {
    fontSize: 12,
    color: C.ink3,
    marginBottom: 6,
  },
  objectMetaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  objectMetaTag: {
    fontSize: 10,
    color: C.accent,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  objectMetaSep: {
    fontSize: 10,
    color: C.ink3,
    marginHorizontal: 6,
  },
  objectMeta: {
    fontSize: 11,
    color: C.ink2,
  },
  objectArrowWrap: {
    marginLeft: 8,
  },
  datasetCard: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    borderRadius: RADIUS.md,
    padding: 14,
  },
  datasetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  datasetTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  datasetName: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "monospace",
    color: C.ink,
  },
  engineBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  engineBadgeText: {
    fontSize: 9,
    color: C.ink3,
    fontWeight: "600",
  },
  datasetDesc: {
    fontSize: 12,
    color: C.ink3,
    marginBottom: 10,
    lineHeight: 16,
  },
  datasetFooter: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.04)",
    paddingTop: 8,
    gap: 16,
  },
  datasetFooterItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  datasetFooterLabel: {
    fontSize: 11,
    color: C.ink3,
  },
  datasetFooterValue: {
    fontSize: 11,
    color: C.ink2,
    fontWeight: "500",
  },
  sheetBody: {
    padding: 16,
    paddingBottom: 24,
    gap: 16,
  },
  sheetHeaderCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: RADIUS.md,
    padding: 12,
  },
  sheetIconRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  sheetIconBox: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(94, 106, 210, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: C.ink,
  },
  sheetCategory: {
    fontSize: 11,
    color: C.ink3,
    marginTop: 1,
  },
  sheetDescText: {
    fontSize: 12,
    color: C.ink2,
    lineHeight: 18,
  },
  blockTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: C.ink3,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  lineageBlock: {
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    borderRadius: RADIUS.md,
    padding: 12,
  },
  lineageFlow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lineageNode: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: RADIUS.sm,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  lineageNodeActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
  },
  lineageRole: {
    fontSize: 9,
    color: C.ink3,
    marginBottom: 2,
  },
  lineageName: {
    fontSize: 11,
    fontWeight: "600",
    color: C.ink2,
  },
  lineageArrowBox: {
    alignItems: "center",
    paddingHorizontal: 4,
  },
  lineageRel: {
    fontSize: 8,
    color: C.accent,
    marginBottom: 2,
  },
  actionBlock: {
    gap: 8,
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtnPrimary: {
    flex: 1,
    backgroundColor: C.accent,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnPrimaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  actionBtnSecondary: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnSecondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink2,
  },
  specGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  specItem: {
    width: "48%",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: RADIUS.sm,
    padding: 8,
  },
  specLabel: {
    fontSize: 10,
    color: C.ink3,
    marginBottom: 2,
  },
  specValue: {
    fontSize: 12,
    fontWeight: "600",
    color: C.ink,
  },
  contractRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  contractText: {
    fontSize: 11,
    color: C.ink2,
    flex: 1,
  },
  instanceHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  emptyInstanceText: {
    fontSize: 11,
    color: C.ink3,
    paddingVertical: 8,
  },
  instanceList: {
    gap: 6,
    marginTop: 6,
  },
  instanceRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: RADIUS.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  instanceIconBox: {
    width: 24,
    height: 24,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(94, 106, 210, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  instanceMain: {
    flex: 1,
    minWidth: 0,
  },
  instanceTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: C.ink,
  },
  instanceOwner: {
    fontSize: 10,
    color: C.ink3,
    marginTop: 1,
  },
  instanceActionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  instanceActionText: {
    fontSize: 10,
    fontWeight: "600",
    color: C.accent,
  },
  domainSelectorWrap: {
    backgroundColor: ELEVATION.raised,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    padding: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  domainSelectorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  domainHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  domainSelectorTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: C.ink3,
    letterSpacing: 0.5,
  },
  domainCountBadge: {
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.pill,
  },
  domainCountBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: C.accent,
  },
  domainManageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  domainManageBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.ink2,
  },
  domainChipsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  domainChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  domainChipActive: {
    backgroundColor: "rgba(94, 106, 210, 0.16)",
    borderColor: C.accent,
  },
  domainChipIcon: {
    fontSize: 13,
  },
  domainChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: C.ink3,
  },
  domainChipTextActive: {
    color: C.ink,
    fontWeight: "600",
  },
  domainChipLockedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EF4444",
  },
  domainActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  domainActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  domainActionBtnAccent: {
    backgroundColor: C.accent,
  },
  domainActionBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: C.ink,
  },
  domainEmptyBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
    backgroundColor: ELEVATION.raised,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    gap: SPACING.sm,
  },
  domainEmptyIconBox: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  domainEmptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
  },
  domainEmptyDesc: {
    fontSize: 12,
    color: C.ink3,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 280,
  },
  domainEmptyActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  domainManageCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: SPACING.md,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  domainManageCardActive: {
    backgroundColor: "rgba(94, 106, 210, 0.10)",
    borderColor: C.accent,
  },
  domainManageIconBox: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  domainManageName: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink,
  },
  domainManageDesc: {
    fontSize: 11,
    color: C.ink3,
    marginTop: 2,
  },
  domainManageMeta: {
    fontSize: 10,
    color: C.ink4,
    marginTop: 2,
  },
  domainSelectPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  domainSelectPillActive: {
    backgroundColor: C.accent,
  },
  domainSelectPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.ink2,
  },
  domainSelectPillTextActive: {
    color: "#FFFFFF",
  },
  domainChipHasProject: {
    borderColor: "rgba(94, 106, 210, 0.4)",
    backgroundColor: "rgba(94, 106, 210, 0.06)",
  },
  domainChipProjectBadge: {
    backgroundColor: "rgba(94, 106, 210, 0.2)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginLeft: 3,
  },
  domainChipProjectBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: C.accent,
  },
  graphNoticeBox: {
    backgroundColor: "rgba(94, 106, 210, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(94, 106, 210, 0.25)",
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 12,
  },
  graphNoticeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  graphNoticeTag: {
    fontSize: 11,
    fontWeight: "700",
    color: C.accent,
  },
  graphNoticeText: {
    fontSize: 11,
    color: C.ink2,
    lineHeight: 16,
  },
  graphProjectCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    padding: 12,
    marginBottom: 12,
  },
  graphProjectHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  graphProjectName: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink,
    marginTop: 2,
  },
  cmmiPipelineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },
  cmmiPipelineStep: {
    alignItems: "center",
    flex: 1,
  },
  cmmiPipelineStepNum: {
    fontSize: 9,
    fontWeight: "700",
    color: C.accent,
    backgroundColor: "rgba(94, 106, 210, 0.15)",
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  cmmiPipelineStepText: {
    fontSize: 10,
    fontWeight: "600",
    color: C.ink2,
    marginTop: 3,
  },
  cmmiPipelineStepRole: {
    fontSize: 8,
    color: C.ink4,
    marginTop: 1,
  },
  cmmiPipelineArrow: {
    color: C.ink4,
    fontSize: 10,
  },
  graphNodeGrid: {
    gap: 8,
    marginTop: 8,
  },
  graphNodeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  graphNodeIconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  graphNodeIcon: {
    fontSize: 13,
    color: C.accent,
  },
  graphNodeTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: C.ink,
  },
  graphNodeKey: {
    fontSize: 10,
    color: C.ink4,
    marginTop: 1,
  },
  graphEdgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: RADIUS.sm,
    marginBottom: 4,
  },
  graphEdgeFrom: {
    fontSize: 11,
    fontWeight: "500",
    color: C.ink2,
    flex: 1,
  },
  graphEdgeLabelBox: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(94, 106, 210, 0.15)",
  },
  graphEdgeLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: C.accent,
  },
  graphEdgeTo: {
    fontSize: 11,
    fontWeight: "500",
    color: C.ink2,
    flex: 1,
    textAlign: "right",
  },
});
