import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Company, Project } from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { RADIUS, SPACING } from "../ui/tokens";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { ScreenHeader } from "../ui/ScreenHeader";
import { StatusDot } from "../components/StatusDot";
import { ApiContractSheet } from "../components/ApiContractSheet";

type StatusFilter = "all" | "in_progress" | "planned" | "completed" | "paused";

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "in_progress", label: "进行中" },
  { key: "planned", label: "计划中" },
  { key: "paused", label: "已暂停" },
  { key: "completed", label: "已完成" },
];

function projectStatusColor(status?: string): string {
  switch (status) {
    case "in_progress":
      return C.accent;
    case "planned":
      return C.ink3;
    case "completed":
      return C.ok;
    case "paused":
      return C.warn;
    case "backlog":
      return C.ink4;
    default:
      return C.ink3;
  }
}

function projectStatusLabel(status?: string): string {
  switch (status) {
    case "in_progress":
      return "进行中";
    case "planned":
      return "计划中";
    case "completed":
      return "已完成";
    case "paused":
      return "已暂停";
    case "backlog":
      return "待规划";
    case "cancelled":
      return "已取消";
    default:
      return status ?? "未知";
  }
}

interface ProjectsScreenProps {
  company: Company;
  onBack: () => void;
  onOpenProjectTasks?: (project: Project) => void;
  onCreateTaskForProject?: (project: Project) => void;
  onOpenWebProjects?: (path?: string, title?: string) => void;
}

/**
 * 项目中心 (ProjectsScreen) — Linear 设计系统规范。
 *
 * 展示当前企业的全部项目维度信息：
 * - 项目状态与目标 (Goals)
 * - 绑定代码库来源 (本地目录 / Git 仓库 / 纯管理型)
 * - 关联任务数与穿透跳转
 */
export function ProjectsScreen({
  company,
  onBack,
  onOpenProjectTasks,
  onCreateTaskForProject,
  onOpenWebProjects,
}: ProjectsScreenProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [activeApiContractProject, setActiveApiContractProject] = useState<Project | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const list = await coolie.listProjects(company.id);
        setProjects(list);
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [company.id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const filteredProjects = useMemo(() => {
    if (statusFilter === "all") return projects;
    return projects.filter((p) => p.status === statusFilter);
  }, [projects, statusFilter]);

  const countsByStatus = useMemo(() => {
    const counts: Record<string, number> = {
      all: projects.length,
      in_progress: 0,
      planned: 0,
      completed: 0,
      paused: 0,
    };
    for (const p of projects) {
      if (p.status && counts[p.status] !== undefined) {
        counts[p.status] = (counts[p.status] ?? 0) + 1;
      }
    }
    return counts;
  }, [projects]);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="项目中心"
        subtitle={
          <Text style={styles.subtitle} numberOfLines={1}>
            {company.name} · 代码库与工作空间
          </Text>
        }
        onBack={onBack}
        backLabel="任务"
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {onOpenWebProjects ? (
              <Pressable
                style={styles.newProjectHeaderBtn}
                onPress={() => onOpenWebProjects("/projects", "项目中心 · 新建多源项目")}
                hitSlop={8}
                accessibilityLabel="新建多源项目"
              >
                <Ionicons name="add" size={15} color="#FFFFFF" />
                <Text style={styles.newProjectHeaderBtnText}>新建</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.refreshBtn}
              onPress={() => void load(true)}
              hitSlop={8}
              accessibilityLabel="刷新项目列表"
            >
              <Ionicons name="refresh-outline" size={16} color={C.ink3} />
            </Pressable>
          </View>
        }
      />

      {/* 状态过滤 Chips */}
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        >
          {STATUS_FILTERS.map((f) => {
            const count = countsByStatus[f.key] ?? 0;
            const active = statusFilter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setStatusFilter(f.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>
                  {f.label} {count > 0 ? `(${count})` : ""}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={C.accent}
          />
        }
      >
        {/* 多源代码库与 CMMI 新建项目横幅 */}
        <AppCard style={styles.multiSourceBanner}>
          <View style={styles.multiSourceTop}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="git-branch" size={16} color={C.accent} />
              <Text style={styles.multiSourceTitle}>多源代码库与 CMMI 工程标准</Text>
            </View>
            <View style={styles.multiSourceTag}>
              <Text style={styles.multiSourceTagText}>多源 Git · 脚手架</Text>
            </View>
          </View>
          <Text style={styles.multiSourceDesc}>
            支持 GitHub、GitLab、Gitee 及企业私有 Git (SSH/HTTPS) 代码库绑定与本地工作区，预设 Spring Cloud Alibaba、RuoYi-Vue-Pro 与 JeecgBoot 企业微服务脚手架。
          </Text>
          <View style={styles.repoSourcePills}>
            <View style={styles.repoSourcePill}><Text style={styles.repoSourcePillText}>GitHub</Text></View>
            <View style={styles.repoSourcePill}><Text style={styles.repoSourcePillText}>GitLab</Text></View>
            <View style={styles.repoSourcePill}><Text style={styles.repoSourcePillText}>Gitee (码云)</Text></View>
            <View style={styles.repoSourcePill}><Text style={styles.repoSourcePillText}>私有 SSH/HTTPS</Text></View>
          </View>
          {onOpenWebProjects ? (
            <Pressable
              style={({ pressed }) => [styles.newProjectBtn, pressed && styles.newProjectBtnPressed]}
              onPress={() => onOpenWebProjects("/projects", "项目中心 · 新建多源项目")}
              accessibilityLabel="新建多源代码库项目"
            >
              <Ionicons name="add-circle-outline" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.newProjectBtnText}>新建多源项目 / 导入代码库</Text>
            </Pressable>
          ) : null}
        </AppCard>

        {loading && !refreshing ? (
          <LoadingState size="small" text="正在加载项目中心…" />
        ) : error ? (
          <ErrorRetry variant="section" message={`⚠️ ${error}`} onRetry={() => void load()} />
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            icon="📁"
            title={statusFilter === "all" ? "暂无项目" : "没有符合状态的项目"}
            subtitle={
              statusFilter === "all"
                ? "在 Web 平台新建项目绑定本地目录或 Git 仓库后，此处将自动同步呈现。"
                : "当前筛选条件下没有项目，可切换上方状态标签查看。"
            }
          />
        ) : (
          filteredProjects.map((project) => {
            const isExpanded = expandedProjectId === project.id;
            const color = project.color ?? C.accent;
            const statusColor = projectStatusColor(project.status);
            const workspaces = project.workspaces ?? [];
            const primaryWorkspace = project.primaryWorkspace ?? workspaces[0];

            return (
              <AppCard
                key={project.id}
                onPress={() => setExpandedProjectId(isExpanded ? null : project.id)}
                style={styles.card}
              >
                {/* 顶部标题与状态 */}
                <View style={styles.cardTop}>
                  <View style={styles.titleWrap}>
                    <View style={[styles.colorDot, { backgroundColor: color }]} />
                    <Text style={styles.projectName} numberOfLines={1}>
                      {project.name}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { borderColor: statusColor }]}>
                    <StatusDot
                      status={project.status === "in_progress" ? "ok" : "idle"}
                      size={6}
                    />
                    <Text style={[styles.statusText, { color: statusColor }]}>
                      {projectStatusLabel(project.status)}
                    </Text>
                  </View>
                </View>

                {/* 项目描述 */}
                {project.description ? (
                  <Text
                    style={styles.description}
                    numberOfLines={isExpanded ? undefined : 2}
                  >
                    {project.description}
                  </Text>
                ) : null}

                {/* 工作区 / 仓库绑定胶囊 */}
                <View style={styles.workspacesSection}>
                  {primaryWorkspace ? (
                    <View style={styles.workspaceRow}>
                      <Ionicons
                        name={
                          primaryWorkspace.sourceType === "local_path"
                            ? "folder-outline"
                            : "git-branch-outline"
                        }
                        size={14}
                        color={C.ink3}
                      />
                      <Text style={styles.workspacePath} numberOfLines={1}>
                        {primaryWorkspace.sourceType === "local_path"
                          ? `本地: ${primaryWorkspace.cwd ?? primaryWorkspace.name}`
                          : `Git: ${primaryWorkspace.repoUrl ?? primaryWorkspace.name}`}
                      </Text>
                    </View>
                  ) : project.codebase?.localFolder ? (
                    <View style={styles.workspaceRow}>
                      <Ionicons name="folder-outline" size={14} color={C.ink3} />
                      <Text style={styles.workspacePath} numberOfLines={1}>
                        本地: {project.codebase.localFolder}
                      </Text>
                    </View>
                  ) : project.codebase?.repoUrl ? (
                    <View style={styles.workspaceRow}>
                      <Ionicons name="git-branch-outline" size={14} color={C.ink3} />
                      <Text style={styles.workspacePath} numberOfLines={1}>
                        Git: {project.codebase.repoUrl}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.workspaceRow}>
                      <Ionicons name="document-text-outline" size={14} color={C.ink4} />
                      <Text style={styles.workspaceMuted}>无代码库 (管理型项目)</Text>
                    </View>
                  )}

                  {workspaces.length > 1 ? (
                    <Text style={styles.moreWorkspaces}>
                      +{workspaces.length - 1} 更多工作区
                    </Text>
                  ) : null}
                </View>

                {/* 关联目标 (Goals) */}
                {project.goals && project.goals.length > 0 ? (
                  <View style={styles.goalsWrap}>
                    {project.goals.map((g) => (
                      <View key={g.id} style={styles.goalTag}>
                        <Text style={styles.goalIcon}>🎯</Text>
                        <Text style={styles.goalText} numberOfLines={1}>
                          {g.title}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* CMMI 质量门禁状态条 (G1~G5) */}
                <View style={styles.cmmiGateBar}>
                  <View style={[styles.cmmiGateChip, { backgroundColor: "rgba(16, 185, 129, 0.12)", borderColor: C.ok }]}>
                    <Text style={[styles.cmmiGateText, { color: C.ok }]}>G1 需求 ✓</Text>
                  </View>
                  <View style={[styles.cmmiGateChip, { backgroundColor: "rgba(16, 185, 129, 0.12)", borderColor: C.ok }]}>
                    <Text style={[styles.cmmiGateText, { color: C.ok }]}>G2 方案 ✓</Text>
                  </View>
                  <View style={[styles.cmmiGateChip, { backgroundColor: "rgba(94, 106, 210, 0.12)", borderColor: C.accent }]}>
                    <Text style={[styles.cmmiGateText, { color: C.accent }]}>G3 契约/0报错</Text>
                  </View>
                  <View style={[styles.cmmiGateChip, { backgroundColor: "rgba(255, 255, 255, 0.04)", borderColor: C.line }]}>
                    <Text style={[styles.cmmiGateText, { color: C.ink3 }]}>G4 验收</Text>
                  </View>
                  <View style={[styles.cmmiGateChip, { backgroundColor: "rgba(255, 255, 255, 0.04)", borderColor: C.line }]}>
                    <Text style={[styles.cmmiGateText, { color: C.ink4 }]}>G5 投产</Text>
                  </View>
                </View>

                {/* 底部元数据栏 */}
                <View style={styles.cardFooter}>
                  <View style={styles.metaLeft}>
                    {project.taskCount !== undefined ? (
                      <View style={styles.metaItem}>
                        <Ionicons name="checkbox-outline" size={13} color={C.ink3} />
                        <Text style={styles.metaText}>{project.taskCount} 个任务</Text>
                      </View>
                    ) : null}
                    {project.targetDate ? (
                      <View style={styles.metaItem}>
                        <Ionicons name="calendar-outline" size={13} color={C.ink3} />
                        <Text style={styles.metaText}>
                          截止: {project.targetDate.slice(0, 10)}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={C.ink4}
                  />
                </View>

                {/* 展开的详情面板 */}
                {isExpanded ? (
                  <View style={styles.expandedPanel}>
                    <View style={styles.divider} />
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>项目 ID:</Text>
                      <Text style={styles.detailValue} numberOfLines={1}>
                        {project.id}
                      </Text>
                    </View>

                    {workspaces.length > 0 ? (
                      <View style={styles.detailBlock}>
                        <Text style={styles.detailLabel}>工作区清单:</Text>
                        {workspaces.map((ws, i) => (
                          <View key={ws.id ?? i} style={styles.wsDetailItem}>
                            <Text style={styles.wsDetailName}>
                              {ws.name || `工作区 ${i + 1}`}
                              {ws.isPrimary ? " (主)" : ""}
                            </Text>
                            <Text style={styles.wsDetailPath} numberOfLines={2}>
                              {ws.sourceType === "local_path" ? ws.cwd : ws.repoUrl}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {/* 原生 CMMI 质量与门禁审计态势面板 */}
                    <View style={styles.cmmiSummaryBlock}>
                      <View style={styles.cmmiSummaryHeader}>
                        <View style={styles.cmmiSummaryTitleRow}>
                          <Ionicons name="shield-checkmark" size={13} color={C.accent} />
                          <Text style={styles.cmmiSummaryTitle}>CMMI 质量与门禁审计态势</Text>
                        </View>
                        <Text style={styles.cmmiSummaryBadge}>合规分 80/100</Text>
                      </View>

                      <View style={styles.cmmiDetailGrid}>
                        <Pressable
                          style={styles.cmmiGridItem}
                          onPress={() =>
                            onOpenWebProjects?.(
                              `/projects/${project.id}/rtm`,
                              `${project.name} · G1 需求与 RTM`,
                            )
                          }
                          hitSlop={4}
                        >
                          <Text style={styles.cmmiGridLabel}>G1 需求 (DS)</Text>
                          <Text style={[styles.cmmiGridVal, { color: C.ok }]}>100% EARS/RTM</Text>
                        </Pressable>
                        <Pressable
                          style={styles.cmmiGridItem}
                          onPress={() =>
                            onOpenWebProjects?.(
                              `/projects/${project.id}/baseline`,
                              `${project.name} · G2 方案与 5+2 文档`,
                            )
                          }
                          hitSlop={4}
                        >
                          <Text style={styles.cmmiGridLabel}>G2 方案 (FDA)</Text>
                          <Text style={[styles.cmmiGridVal, { color: C.ok }]}>DAR-001 会签</Text>
                        </Pressable>
                        <Pressable
                          style={styles.cmmiGridItem}
                          onPress={() =>
                            onOpenWebProjects?.(
                              `/projects/${project.id}/api-lifecycle`,
                              `${project.name} · G3 API 契约`,
                            )
                          }
                          hitSlop={4}
                        >
                          <Text style={styles.cmmiGridLabel}>G3 契约 (SWE)</Text>
                          <Text style={[styles.cmmiGridVal, { color: C.ok }]}>0 编译报错</Text>
                        </Pressable>
                        <Pressable
                          style={styles.cmmiGridItem}
                          onPress={() =>
                            onOpenWebProjects?.(
                              `/projects/${project.id}/spc`,
                              `${project.name} · G4 验收与 SPC`,
                            )
                          }
                          hitSlop={4}
                        >
                          <Text style={styles.cmmiGridLabel}>G4 验收 (FDSE)</Text>
                          <Text style={[styles.cmmiGridVal, { color: C.warn }]}>用例执行中</Text>
                        </Pressable>
                        <Pressable
                          style={styles.cmmiGridItem}
                          onPress={() =>
                            onOpenWebProjects?.(
                              `/projects/${project.id}/living-topology`,
                              `${project.name} · G5 投产活拓扑`,
                            )
                          }
                          hitSlop={4}
                        >
                          <Text style={styles.cmmiGridLabel}>G5 投产 (SRE)</Text>
                          <Text style={[styles.cmmiGridVal, { color: C.ink3 }]}>待会签</Text>
                        </Pressable>
                        <Pressable
                          style={styles.cmmiGridItem}
                          onPress={() =>
                            onOpenWebProjects?.(
                              `/projects/${project.id}/spc`,
                              `${project.name} · SPC 3σ 控制`,
                            )
                          }
                          hitSlop={4}
                        >
                          <Text style={styles.cmmiGridLabel}>SPC 稳定性</Text>
                          <Text style={[styles.cmmiGridVal, { color: C.ok }]}>3σ 受控 (42s)</Text>
                        </Pressable>
                      </View>
                    </View>

                    {/* CMMI 穿透与黄金文档快捷入口 (第一行: 流程与过程) */}
                    <View style={styles.cmmiActionRow}>
                      <Pressable
                        style={styles.cmmiBtn}
                        onPress={() =>
                          onOpenWebProjects?.(`/projects/${project.id}/rtm`, `${project.name} · RTM 需求穿透`)
                        }
                      >
                        <Ionicons name="git-network-outline" size={13} color={C.accent} />
                        <Text style={styles.cmmiBtnText}>RTM 穿透</Text>
                      </Pressable>
                      <Pressable
                        style={styles.cmmiBtn}
                        onPress={() =>
                          onOpenWebProjects?.(`/projects/${project.id}/baseline`, `${project.name} · 5+2 黄金文档`)
                        }
                      >
                        <Ionicons name="document-text-outline" size={13} color={C.ok} />
                        <Text style={[styles.cmmiBtnText, { color: C.ok }]}>5+2 文档</Text>
                      </Pressable>
                      <Pressable
                        style={styles.cmmiBtn}
                        onPress={() =>
                          onOpenWebProjects?.(`/projects/${project.id}/spc`, `${project.name} · SPC 过程控制`)
                        }
                      >
                        <Ionicons name="analytics-outline" size={13} color={C.warn} />
                        <Text style={[styles.cmmiBtnText, { color: C.warn }]}>SPC 控制</Text>
                      </Pressable>
                    </View>

                    {/* CMMI 架构与契约快捷入口 (第二行: 拓扑与API) */}
                    <View style={styles.cmmiActionRow}>
                      <Pressable
                        style={styles.cmmiBtn}
                        onPress={() =>
                          onOpenWebProjects?.(`/projects/${project.id}/living-topology`, `${project.name} · 三态活拓扑`)
                        }
                      >
                        <Ionicons name="git-merge-outline" size={13} color={C.accent} />
                        <Text style={[styles.cmmiBtnText, { color: C.accent }]}>三态拓扑 (SkyWalking/Chaos)</Text>
                      </Pressable>
                      <Pressable
                        style={styles.cmmiBtn}
                        onPress={() => setActiveApiContractProject(project)}
                      >
                        <Ionicons name="code-slash-outline" size={13} color={C.ok} />
                        <Text style={[styles.cmmiBtnText, { color: C.ok }]}>API 契约 (DSH/MCP)</Text>
                      </Pressable>
                    </View>

                    {/* 操作动作按钮组 */}
                    <View style={styles.actionButtonsRow}>
                      {onOpenWebProjects ? (
                        <Pressable
                          style={styles.actionBtnSecondary}
                          onPress={() =>
                            onOpenWebProjects(
                              `/projects/${project.id}`,
                              `${project.name} · 控制台`,
                            )
                          }
                          accessibilityLabel="打开项目全量控制台"
                        >
                          <Ionicons name="desktop-outline" size={14} color={C.accent} />
                          <Text style={styles.actionBtnTextSecondary}>项目控制台</Text>
                        </Pressable>
                      ) : null}

                      {onOpenProjectTasks ? (
                        <Pressable
                          style={styles.actionBtnPrimary}
                          onPress={() => onOpenProjectTasks(project)}
                        >
                          <Ionicons name="list" size={14} color="#FFF" />
                          <Text style={styles.actionBtnTextPrimary}>查看任务</Text>
                        </Pressable>
                      ) : null}

                      {onCreateTaskForProject ? (
                        <Pressable
                          style={styles.actionBtnSecondary}
                          onPress={() => onCreateTaskForProject(project)}
                        >
                          <Ionicons name="add" size={14} color={C.accent} />
                          <Text style={styles.actionBtnTextSecondary}>创建任务</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </AppCard>
            );
          })
        )}
      </ScrollView>

      {/* 原生 API 契约与 DSH 生命周期速览抽屉 */}
      {activeApiContractProject ? (
        <ApiContractSheet
          projectId={activeApiContractProject.id}
          projectName={activeApiContractProject.name}
          onClose={() => setActiveApiContractProject(null)}
          onOpenFullWeb={() => {
            const p = activeApiContractProject;
            setActiveApiContractProject(null);
            onOpenWebProjects?.(`/projects/${p.id}/api-lifecycle`, `${p.name} · API 契约中心`);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  subtitle: {
    fontSize: 12,
    color: C.ink3,
  },
  refreshBtn: {
    padding: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  filterBar: {
    backgroundColor: C.panel,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  filterContent: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  filterChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "transparent",
  },
  filterChipActive: {
    backgroundColor: "rgba(94, 106, 210, 0.15)",
    borderColor: C.accent,
  },
  filterLabel: {
    fontSize: 12,
    color: C.ink3,
    fontWeight: "500",
  },
  filterLabelActive: {
    color: C.accent,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  card: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    flex: 1,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  projectName: {
    fontSize: 15,
    fontWeight: "600",
    color: C.ink,
    flex: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "500",
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    color: C.ink2,
  },
  workspacesSection: {
    marginTop: 2,
    gap: 4,
  },
  workspaceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
  },
  workspacePath: {
    fontSize: 12,
    color: C.ink2,
    fontFamily: "monospace",
    flex: 1,
  },
  workspaceMuted: {
    fontSize: 12,
    color: C.ink4,
  },
  moreWorkspaces: {
    fontSize: 11,
    color: C.ink4,
    marginLeft: 6,
  },
  goalsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  goalTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: RADIUS.sm,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: C.line,
  },
  goalIcon: {
    fontSize: 10,
  },
  goalText: {
    fontSize: 11,
    color: C.ink2,
    maxWidth: 180,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  metaLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: C.ink3,
  },
  expandedPanel: {
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.line,
    marginVertical: 4,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailLabel: {
    fontSize: 11,
    color: C.ink4,
  },
  detailValue: {
    fontSize: 11,
    color: C.ink3,
    fontFamily: "monospace",
    flex: 1,
  },
  detailBlock: {
    gap: 4,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    padding: 8,
    borderRadius: RADIUS.sm,
  },
  wsDetailItem: {
    gap: 2,
    marginTop: 2,
  },
  wsDetailName: {
    fontSize: 12,
    fontWeight: "500",
    color: C.ink2,
  },
  wsDetailPath: {
    fontSize: 11,
    color: C.ink3,
    fontFamily: "monospace",
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.accent,
    borderRadius: RADIUS.sm,
    paddingVertical: 8,
  },
  actionBtnTextPrimary: {
    fontSize: 13,
    fontWeight: "500",
    color: "#FFFFFF",
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(94, 106, 210, 0.3)",
    borderRadius: RADIUS.sm,
    paddingVertical: 8,
  },
  actionBtnTextSecondary: {
    fontSize: 13,
    fontWeight: "500",
    color: C.accent,
  },
  cmmiGateBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
    marginBottom: 2,
  },
  cmmiGateChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  cmmiGateText: {
    fontSize: 10,
    fontWeight: "600",
  },
  cmmiActionRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: 4,
  },
  cmmiSummaryBlock: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    marginTop: 4,
    marginBottom: 4,
  },
  cmmiSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cmmiSummaryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cmmiSummaryTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: C.ink,
  },
  cmmiSummaryBadge: {
    fontSize: 11,
    fontWeight: "600",
    color: C.accent,
  },
  cmmiDetailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  cmmiGridItem: {
    width: "31%",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: RADIUS.sm,
  },
  cmmiGridLabel: {
    fontSize: 9,
    color: C.ink4,
    fontWeight: "500",
  },
  cmmiGridVal: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  cmmiBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.sm,
    paddingVertical: 7,
  },
  cmmiBtnText: {
    fontSize: 11,
    fontWeight: "500",
    color: C.ink2,
  },

  // ── 多源代码库与新建横幅 ──
  multiSourceBanner: {
    padding: 14,
    gap: 10,
    marginBottom: 12,
    borderColor: "rgba(94, 106, 210, 0.25)",
    backgroundColor: "rgba(94, 106, 210, 0.04)",
  },
  multiSourceTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  multiSourceTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink,
  },
  multiSourceTag: {
    backgroundColor: "rgba(94, 106, 210, 0.15)",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: RADIUS.sm,
  },
  multiSourceTagText: {
    fontSize: 10,
    fontWeight: "500",
    color: C.accent,
  },
  multiSourceDesc: {
    fontSize: 11,
    color: C.ink3,
    lineHeight: 16,
  },
  repoSourcePills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  repoSourcePill: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: C.line,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  repoSourcePillText: {
    fontSize: 10,
    color: C.ink2,
  },
  newProjectBtn: {
    height: 34,
    borderRadius: RADIUS.sm,
    backgroundColor: C.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  newProjectBtnPressed: {
    backgroundColor: C.accentHover,
  },
  newProjectBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  newProjectHeaderBtn: {
    height: 28,
    paddingHorizontal: 8,
    borderRadius: RADIUS.sm,
    backgroundColor: C.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  newProjectHeaderBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
