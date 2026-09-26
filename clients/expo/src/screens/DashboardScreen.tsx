import { useCallback, useEffect, useState } from "react";
import {
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
import type { Company, DashboardSummary } from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { StatusDot } from "../components/StatusDot";
import { CoolieLogo } from "../components/CoolieLogo";
import { AppCard } from "../ui/AppCard";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { ScreenHeader } from "../ui/ScreenHeader";
import { StatTile } from "../ui/StatTile";
import { RADIUS } from "../ui/tokens";

function formatMoney(cents: number): string {
  const yuan = (cents / 100).toFixed(2);
  return `¥${Number(yuan).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

interface DashboardScreenProps {
  company: Company;
  onBack?: () => void;
  onOpenApprovals?: () => void;
  onOpenApproval?: (approvalId: string) => void;
  onOpenProjects?: () => void;
  onOpenWorkshop?: () => void;
  onOpenOntology?: () => void;
  onOpenPipelines?: () => void;
  onOpenWebWorkbench?: (path?: string, title?: string) => void;
}

/**
 * 仪表盘 — 登录后的首页。
 *
 * wave96 精简 (boss 22:14 OOB「更复杂了」): 删业务本体态势大卡、熔断 modal、
 * 设置/检查更新按钮; CMMI 卡收敛到 1 项 + 1 按钮。保留的是 web 版首页的
 * 核心统计:
 * - 第 1 行: 4 张核心 StatTile (员工/任务/花费/审批 — 本月花费与待审批的简版)
 * - 第 2 行: 快速操作入口 (工坊/本体/流水线/项目)
 * - 第 3 行: 任务完成率进度条 + 7 天活动趋势
 * - 第 4 行: 员工状态分布 + 预算使用进度
 * - 第 5 行: 项目中心入口卡片
 */
export function DashboardScreen({
  company,
  onBack,
  onOpenApprovals,
  onOpenProjects,
  onOpenWorkshop,
  onOpenOntology,
  onOpenPipelines,
  onOpenWebWorkbench,
}: DashboardScreenProps) {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const summary = await coolie.getDashboard(company.id);
        setData(summary);
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
    void fetchDashboard();
  }, [fetchDashboard]);

  if (loading && !data) {
    return (
      <SafeAreaView style={{ backgroundColor: C.bg, flex: 1 }}>
        <LoadingState text="正在汇聚工坊效能大盘…" />
      </SafeAreaView>
    );
  }

  if (error && !data) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: C.bg, padding: 16 }]}>
        <ErrorRetry
          variant="fullscreen"
          message={`加载大盘失败: ${error}`}
          onRetry={() => fetchDashboard()}
          style={styles.errorRetryCentered}
        />
        {onBack ? (
          <Pressable style={{ marginTop: 16 }} onPress={onBack}>
            <Text style={styles.linkText}>‹ 返回任务列表</Text>
          </Pressable>
        ) : null}
      </SafeAreaView>
    );
  }

  // ── 核心指标 ──
  const enabledAgents =
    (data?.agents.active ?? 0) +
    (data?.agents.running ?? 0) +
    (data?.agents.paused ?? 0) +
    (data?.agents.error ?? 0);
  const tasksInProgress = data?.tasks.inProgress ?? 0;
  const monthSpendCents = data?.costs.monthSpendCents ?? 0;
  const pendingApprovals =
    (data?.pendingApprovals ?? 0) + (data?.budgets.pendingApprovals ?? 0);
  const pendingAccent = pendingApprovals > 0 ? C.err : C.ink;

  // ── 任务分布 ──
  const totalTasks =
    (data?.tasks.open ?? 0) +
    (data?.tasks.inProgress ?? 0) +
    (data?.tasks.blocked ?? 0) +
    (data?.tasks.done ?? 0);
  const completionRate = data?.progress?.completionRatePercent ?? (totalTasks > 0 ? Math.round(((data?.tasks.done ?? 0) / totalTasks) * 100) : 0);

  // ── 7 天活动趋势 (runActivity 最多取最后 7 天) ──
  const recentActivity = (data?.runActivity ?? []).slice(-7);
  const maxTotal = Math.max(1, ...recentActivity.map((d) => d.total));

  // ── 效率指标 ──
  const velocity = data?.efficiency?.velocityPerDay ?? 0;
  const completed24h = data?.efficiency?.completedTasks24h ?? 0;
  const completed7d = data?.efficiency?.completedTasks7d ?? 0;

  // ── 预算使用 ──
  const budgetCents = data?.costs.monthBudgetCents ?? 0;
  const budgetUtilPct = budgetCents > 0
    ? Math.min(100, Math.round((monthSpendCents / budgetCents) * 100))
    : 0;

  // ── 交付周期 ──
  const avgCycleSec = data?.deliveryCycle?.avgSeconds ?? 0;
  const medianCycleSec = data?.deliveryCycle?.medianSeconds ?? 0;

  // ── 失败率 ──
  const failRatePct = data?.failureRate?.overallFailureRatePercent ?? 0;

  return (
    <SafeAreaView style={{ backgroundColor: C.bg, flex: 1 }}>
      <StatusBar style="light" />
      <ScrollView
        style={{ backgroundColor: C.bg, flex: 1 }}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchDashboard(true)}
            tintColor={C.accent}
          />
        }
      >
        <ScreenHeader
          title="仪表盘"
          onBack={onBack}
          backLabel="任务"
          subtitle={
            <View style={styles.companyCapsule}>
              <CoolieLogo size={14} style={{ marginRight: 2 }} />
              <StatusDot status="ok" size={5} />
              <Text style={styles.companyCapsuleText} numberOfLines={1}>
                {company.name}
              </Text>
              <Text style={styles.companyCapsuleTag}>效能总览</Text>
            </View>
          }
        />

        {/* ── 第 1 行: 4 张核心指标卡 ── */}
        <Pressable
          style={styles.gridContainer}
          onPress={onOpenApprovals}
          disabled={!onOpenApprovals}
        >
          <StatTile
            value={enabledAgents}
            label="已启用员工"
            valueColor={C.accent}
            style={styles.gridTile}
          />
          <StatTile
            value={tasksInProgress}
            label="执行中任务"
            valueColor={C.accent}
            style={styles.gridTile}
          />
          <StatTile
            value={formatMoney(monthSpendCents)}
            label="本月花费"
            valueColor={C.ok}
            style={styles.gridTile}
          />
          <StatTile
            value={pendingApprovals}
            label="待审批"
            valueColor={pendingAccent}
            style={styles.gridTile}
          />
        </Pressable>

        {/* ── CMMI 质量工程 (wave96 精简: 1 项核心 + 1 按钮) ── */}
        <AppCard style={styles.wideCard}>
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="shield-checkmark" size={16} color={C.accent} />
              <Text style={styles.cardTitle}>CMMI 质量工程</Text>
            </View>
          </View>

          <View style={styles.cmmiCapItem}>
            <Text style={styles.cmmiCapLabel}>门禁进度</Text>
            <Text style={styles.cmmiCapVal}>G1 需求 → G5 投产 · 5 角色责任制</Text>
          </View>

          {onOpenWebWorkbench ? (
            <Pressable
              style={[styles.cmmiFootBtn, styles.cmmiFootBtnPrimary]}
              onPress={() => onOpenWebWorkbench("/projects", "CMMI 质量工程")}
            >
              <Ionicons name="open-outline" size={13} color="#FFF" />
              <Text style={[styles.cmmiFootBtnText, { color: "#FFF" }]}>进入 CMMI 门禁</Text>
            </Pressable>
          ) : null}
        </AppCard>

        {/* ── 快速操作入口 ── */}
        <View style={styles.quickActions}>
          <Text style={styles.sectionTitle}>快速操作</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickActionsScroll}
          >
            {onOpenWorkshop ? (
              <QuickAction
                icon="chatbubbles"
                label="工坊"
                color={C.accent}
                onPress={onOpenWorkshop}
              />
            ) : null}
            {onOpenOntology ? (
              <QuickAction
                icon="git-network"
                label="本体"
                color="#8B5CF6"
                onPress={onOpenOntology}
              />
            ) : null}
            {onOpenPipelines ? (
              <QuickAction
                icon="git-merge"
                label="流水线"
                color="#06B6D4"
                onPress={onOpenPipelines}
              />
            ) : null}
            {onOpenProjects ? (
              <QuickAction
                icon="folder"
                label="项目"
                color="#F59E0B"
                onPress={onOpenProjects}
              />
            ) : null}
          </ScrollView>
        </View>

        {/* ── 第 3 行: 任务完成率 + 产能概览 ── */}
        <AppCard style={styles.wideCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>任务进度</Text>
            <Text style={styles.cardBadge}>{totalTasks} 个任务</Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.min(completionRate, 100)}%` },
              ]}
            />
          </View>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>完成率 {completionRate}%</Text>
            <View style={styles.progressLegend}>
              <StatusChip
                color={C.ok}
                label={`已完成 ${data?.tasks.done ?? 0}`}
              />
              <StatusChip
                color={C.accent}
                label={`进行中 ${tasksInProgress}`}
              />
              <StatusChip
                color={C.warn}
                label={`阻塞 ${data?.tasks.blocked ?? 0}`}
              />
              <StatusChip
                color={C.ink3}
                label={`待办 ${data?.tasks.open ?? 0}`}
              />
            </View>
          </View>
        </AppCard>

        {/* ── 第 4 行: 7 天活动趋势 ── */}
        {recentActivity.length > 0 ? (
          <AppCard style={styles.wideCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>近 7 天运行活动</Text>
              <Text style={styles.cardBadge}>
                {velocity > 0 ? `${velocity.toFixed(1)} 任务/天` : ""}
              </Text>
            </View>
            <View style={styles.barChart}>
              {recentActivity.map((day, i) => {
                const h = Math.max(4, (day.total / maxTotal) * 64);
                const failH = day.total > 0 ? (day.failed / day.total) * h : 0;
                const label = day.date.slice(5); // "MM-DD"
                return (
                  <View key={i} style={styles.barCol}>
                    <View style={styles.barStack}>
                      {failH > 0 ? (
                        <View
                          style={[
                            styles.barSegFail,
                            { height: failH },
                          ]}
                        />
                      ) : null}
                      <View
                        style={[
                          styles.barSegOk,
                          { height: h - failH },
                        ]}
                      />
                    </View>
                    <Text style={styles.barLabel}>{label}</Text>
                    <Text style={styles.barValue}>{day.total}</Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.barLegend}>
              <StatusChip color={C.accent} label="成功" />
              <StatusChip color={C.err} label="失败" />
            </View>
          </AppCard>
        ) : null}

        {/* ── 第 5 行: 效能快照 (3 个小指标) ── */}
        <View style={styles.miniRow}>
          <AppCard style={styles.miniCard}>
            <Text style={styles.miniValue}>{completed24h}</Text>
            <Text style={styles.miniLabel}>24h 完成</Text>
          </AppCard>
          <AppCard style={styles.miniCard}>
            <Text style={styles.miniValue}>{completed7d}</Text>
            <Text style={styles.miniLabel}>7 天完成</Text>
          </AppCard>
          <AppCard style={styles.miniCard}>
            <Text style={[styles.miniValue, failRatePct > 20 ? { color: C.err } : null]}>
              {failRatePct.toFixed(1)}%
            </Text>
            <Text style={styles.miniLabel}>失败率</Text>
          </AppCard>
        </View>

        {/* ── 第 6 行: 员工状态 + 预算进度 ── */}
        <View style={styles.dualRow}>
          <AppCard style={styles.halfCard}>
            <Text style={styles.cardTitle}>员工状态</Text>
            <View style={styles.agentStatusList}>
              <AgentStatusRow
                icon="flash"
                label="运行中"
                count={data?.agents.running ?? 0}
                color={C.ok}
              />
              <AgentStatusRow
                icon="checkmark-circle"
                label="就绪"
                count={data?.agents.active ?? 0}
                color={C.accent}
              />
              <AgentStatusRow
                icon="pause-circle"
                label="暂停"
                count={data?.agents.paused ?? 0}
                color={C.warn}
              />
              <AgentStatusRow
                icon="alert-circle"
                label="异常"
                count={data?.agents.error ?? 0}
                color={C.err}
              />
            </View>
          </AppCard>

          <AppCard style={styles.halfCard}>
            <Text style={styles.cardTitle}>预算</Text>
            {budgetCents > 0 ? (
              <>
                <View style={styles.budgetBarTrack}>
                  <View
                    style={[
                      styles.budgetBarFill,
                      {
                        width: `${budgetUtilPct}%`,
                        backgroundColor: budgetUtilPct > 80 ? C.err : C.accent,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.budgetText}>
                  {formatMoney(monthSpendCents)} / {formatMoney(budgetCents)}
                </Text>
                <Text style={styles.budgetPct}>{budgetUtilPct}% 已使用</Text>
              </>
            ) : (
              <Text style={styles.budgetText}>未设预算上限</Text>
            )}
            {avgCycleSec > 0 ? (
              <View style={styles.cycleRow}>
                <Text style={styles.cycleLabel}>平均交付</Text>
                <Text style={styles.cycleValue}>{formatDuration(avgCycleSec)}</Text>
              </View>
            ) : null}
          </AppCard>
        </View>

        {/* ── 第 7 行: 项目中心入口卡 ── */}
        {onOpenProjects ? (
          <AppCard onPress={onOpenProjects} style={styles.projectCard}>
            <View style={styles.projectCardLeft}>
              <View style={styles.projectIconWrap}>
                <Ionicons name="folder" size={18} color={C.accent} />
              </View>
              <View style={styles.projectTextWrap}>
                <Text style={styles.projectTitle}>项目中心</Text>
                <Text style={styles.projectSubtitle}>
                  查看当前企业工作区代码库、目标及任务全貌
                </Text>
              </View>
            </View>
            <View style={styles.projectCardRight}>
              <Text style={styles.projectActionText}>进入</Text>
              <Ionicons name="chevron-forward" size={15} color={C.accent} />
            </View>
          </AppCard>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── 子组件 ──────────────────────────────────────────────────────────

function QuickAction({
  icon,
  label,
  color,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.quickActionBtn} onPress={onPress} hitSlop={4}>
      <View style={[styles.quickActionIcon, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.quickActionLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function StatusChip({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.statusChip}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={styles.statusChipText}>{label}</Text>
    </View>
  );
}

function AgentStatusRow({
  icon,
  label,
  count,
  color,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  count: number;
  color: string;
}) {
  return (
    <View style={styles.agentRow}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={styles.agentRowLabel}>{label}</Text>
      <Text style={[styles.agentRowCount, { color }]}>{count}</Text>
    </View>
  );
}

// ── 样式 ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 14,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  companyCapsule: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 8,
    gap: 6,
  },
  companyCapsuleText: {
    fontSize: 11,
    color: C.ink2,
    fontWeight: "500",
    maxWidth: 160,
  },
  companyCapsuleTag: {
    fontSize: 11,
    color: C.ink4,
    fontWeight: "400",
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  gridTile: {
    flexBasis: "48%",
    flexGrow: 1,
  },
  linkText: {
    color: C.accent,
    fontWeight: "500",
    fontSize: 13,
  },
  errorRetryCentered: {
    flex: 0,
    padding: 0,
  },

  // ── 快速操作入口 ──
  quickActions: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink2,
    paddingLeft: 2,
  },
  quickActionsScroll: {
    gap: 14,
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  quickActionBtn: {
    alignItems: "center",
    gap: 6,
    width: 60,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: {
    fontSize: 11,
    color: C.ink2,
    fontWeight: "500",
    textAlign: "center",
  },

  // ── 宽卡 (任务进度 / 活动趋势) ──
  wideCard: {
    padding: 14,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink,
  },
  cardBadge: {
    fontSize: 11,
    color: C.ink3,
    fontWeight: "400",
  },

  // ── 任务进度条 ──
  progressBarTrack: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: C.ok,
    borderRadius: 3,
  },
  progressRow: {
    gap: 6,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: C.ink2,
  },
  progressLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChipText: {
    fontSize: 11,
    color: C.ink3,
  },

  // ── 7 天条形图 ──
  barChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 90,
    gap: 6,
    paddingTop: 4,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  barStack: {
    width: "100%",
    maxWidth: 28,
    borderRadius: RADIUS.sm,
    overflow: "hidden",
  },
  barSegOk: {
    backgroundColor: C.accent,
    borderTopLeftRadius: RADIUS.sm,
    borderTopRightRadius: RADIUS.sm,
  },
  barSegFail: {
    backgroundColor: C.err,
  },
  barLabel: {
    fontSize: 9,
    color: C.ink4,
  },
  barValue: {
    fontSize: 9,
    color: C.ink3,
    fontVariant: ["tabular-nums"],
  },
  barLegend: {
    flexDirection: "row",
    gap: 16,
    justifyContent: "center",
    paddingTop: 2,
  },

  // ── 效能快照小卡 ──
  miniRow: {
    flexDirection: "row",
    gap: 10,
  },
  miniCard: {
    flex: 1,
    alignItems: "center",
    padding: 12,
    gap: 4,
  },
  miniValue: {
    fontSize: 18,
    fontWeight: "600",
    color: C.accent,
    fontVariant: ["tabular-nums"],
  },
  miniLabel: {
    fontSize: 11,
    color: C.ink3,
    fontWeight: "400",
  },

  // ── 双列卡 (员工状态 + 预算) ──
  dualRow: {
    flexDirection: "row",
    gap: 10,
  },
  halfCard: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  agentStatusList: {
    gap: 8,
  },
  agentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  agentRowLabel: {
    flex: 1,
    fontSize: 12,
    color: C.ink2,
  },
  agentRowCount: {
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },

  // ── 预算 ──
  budgetBarTrack: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 3,
    overflow: "hidden",
  },
  budgetBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  budgetText: {
    fontSize: 12,
    color: C.ink2,
    fontWeight: "400",
  },
  budgetPct: {
    fontSize: 11,
    color: C.ink3,
  },
  cycleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 8,
    marginTop: 2,
  },
  cycleLabel: {
    fontSize: 11,
    color: C.ink3,
  },
  cycleValue: {
    fontSize: 13,
    fontWeight: "600",
    color: C.accent,
  },

  // ── 项目中心入口卡 ──
  projectCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  projectCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  projectIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  projectTextWrap: {
    flex: 1,
    gap: 2,
  },
  projectTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
  },
  projectSubtitle: {
    fontSize: 12,
    color: C.ink3,
    lineHeight: 16,
  },
  projectCardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 8,
  },
  projectActionText: {
    fontSize: 13,
    fontWeight: "500",
    color: C.accent,
  },

  // ── CMMI 质量工程 (精简: 1 项 + 1 按钮) ──
  cmmiCapItem: {
    gap: 2,
  },
  cmmiCapLabel: {
    fontSize: 10,
    color: C.ink4,
  },
  cmmiCapVal: {
    fontSize: 11,
    fontWeight: "500",
    color: C.ink2,
  },
  cmmiFootBtn: {
    flex: 1,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "rgba(255,255,255,0.03)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  cmmiFootBtnPrimary: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  cmmiFootBtnText: {
    fontSize: 11,
    fontWeight: "500",
    color: C.accent,
  },
});