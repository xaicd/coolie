import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
  StatusBar as RNStatusBar,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import type { Approval, Company, DashboardSummary } from "@coolie/api-client";
import {
  C,
  coolie,
  type LiveRunRow,
  type WorkTimelineResult,
} from "../coolie";
import { StatusDot } from "../components/StatusDot";
import { useOTA } from "../OTA";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { KeyValueRow } from "../ui/KeyValueRow";
import { LoadingState } from "../ui/LoadingState";
import { Pill } from "../ui/Pill";
import { ScreenHeader } from "../ui/ScreenHeader";
import { StatTile } from "../ui/StatTile";

function formatMoney(cents: number): string {
  const yuan = (cents / 100).toFixed(2);
  return `¥${Number(yuan).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0秒";
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}小时${mins}分` : `${hours}小时`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return hours > 0 ? `${days}天${hours}小时` : `${days}天`;
}

function formatIdleTime(seconds: number | null): string {
  if (seconds === null) return "从未心跳";
  if (seconds < 60) return "刚刚在线";
  if (seconds < 3600) return `空闲 ${Math.floor(seconds / 60)} 分钟`;
  if (seconds < 86400) return `空闲 ${(seconds / 3600).toFixed(1)} 小时`;
  return `离线 ${Math.floor(seconds / 86400)} 天`;
}

function formatRelativeTime(isoString: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 60) return "刚刚";
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    return `${Math.floor(diff / 86400)}天前`;
  } catch {
    return isoString;
  }
}

const EVENT_KIND_LABEL: Record<string, string> = {
  created: "创建了工单",
  assigned: "被指派任务",
  delegated: "委派了任务",
  commented: "发表了评论",
  approved: "完成审批/裁决",
};

interface DashboardScreenProps {
  onOpenSettings?: () => void;
  company: Company;
  onBack?: () => void;
  onOpenApprovals?: () => void;
  onOpenApproval?: (approvalId: string) => void;
}

/**
 * 效能驾驶舱 (DESIGN.md Linear 设计系统规范)
 * - 指标卡 2 列网格 (数字 24px weight "600" tabularNum + 标题 11px ink3)
 * - 顶部公司选择器胶囊 (radius 999, bg 0.05, border line, text ink2)
 * - 智能体状态点 8px 呼吸灯扩散
 * - 半透明卡片 bg 0.02 + 半透明白边 line
 */
export function DashboardScreen({
  company,
  onBack,
  onOpenSettings,
  onOpenApprovals,
  onOpenApproval,
}: DashboardScreenProps) {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isChecking: otaChecking, checkUpdate: checkOTA } = useOTA();

  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalsError, setApprovalsError] = useState<string | null>(null);

  const [liveRuns, setLiveRuns] = useState<LiveRunRow[]>([]);
  const [liveRunsLoading, setLiveRunsLoading] = useState(false);
  const [liveRunsError, setLiveRunsError] = useState<string | null>(null);

  const [timeline, setTimeline] = useState<WorkTimelineResult | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    setApprovalsLoading(true);
    setApprovalsError(null);
    try {
      const list = await coolie.listApprovals(company.id, { status: "pending" });
      setApprovals(list.filter((a) => a.status === "pending"));
    } catch (e) {
      setApprovalsError(String((e as Error)?.message ?? e));
    } finally {
      setApprovalsLoading(false);
    }
  }, [company.id]);

  const fetchLiveRuns = useCallback(async () => {
    setLiveRunsLoading(true);
    setLiveRunsError(null);
    try {
      const runs = await coolie.getLiveRuns(company.id);
      setLiveRuns(runs);
    } catch (e) {
      setLiveRunsError(String((e as Error)?.message ?? e));
    } finally {
      setLiveRunsLoading(false);
    }
  }, [company.id]);

  const fetchTimeline = useCallback(async () => {
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const res = await coolie.getTimeline(company.id, 8);
      setTimeline(res);
    } catch (e) {
      setTimelineError(String((e as Error)?.message ?? e));
    } finally {
      setTimelineLoading(false);
    }
  }, [company.id]);

  const fetchDashboard = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      void fetchApprovals();
      void fetchLiveRuns();
      void fetchTimeline();
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
    [company.id, fetchApprovals, fetchLiveRuns, fetchTimeline],
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

  const q = data?.quota;
  const p = data?.progress;
  const idle = data?.idle;
  const dc = data?.deliveryCycle;
  const eff = data?.efficiency;
  const fr = data?.failureRate;

  // 额度进度条比例 (最大100%)
  const quotaPct = Math.min(100, Math.max(0, q?.utilizationPercent ?? 0));
  const quotaBarColor =
    quotaPct > 90 ? C.err : quotaPct > 70 ? C.warn : C.accent;

  // 综合健康度评估
  const failurePct = fr?.overallFailureRatePercent ?? 0;
  const healthLabel = failurePct <= 5 ? "卓越" : failurePct <= 15 ? "平稳" : "预警";
  const healthColor = failurePct <= 5 ? C.ok : failurePct <= 15 ? C.warn : C.err;

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
        {/* 顶部操作与公司选择器胶囊 */}
        <ScreenHeader
          title="驾驶舱效能"
          onBack={onBack}
          backLabel="任务"
          subtitle={
            /* 顶部公司选择器胶囊 (DESIGN.md 第4节) */
            <View style={styles.companyCapsule}>
              <StatusDot status="ok" size={6} />
              <Text style={styles.companyCapsuleText} numberOfLines={1}>
                {company.name}
              </Text>
              <Text style={styles.companyCapsuleTag}>六大核心运转指标</Text>
            </View>
          }
          right={
            <>
              {onOpenSettings ? (
                <Pressable onPress={onOpenSettings} hitSlop={12} style={styles.otaBtn}>
                  <Ionicons name="settings-outline" size={18} color="#8A8F98" />
                </Pressable>
              ) : null}
              <Pressable
                style={styles.otaBtn}
                onPress={() => void checkOTA(true)}
                hitSlop={12}
                disabled={otaChecking}
              >
                {otaChecking ? (
                  <ActivityIndicator
                    size="small"
                    color={C.accent}
                    style={{ transform: [{ scale: 0.7 }] }}
                  />
                ) : (
                  <Text style={styles.otaBtnText}>检查更新</Text>
                )}
              </Pressable>
              <Pressable
                style={styles.refreshBtn}
                onPress={() => fetchDashboard(true)}
                hitSlop={12}
              >
                <Text style={styles.refreshBtnText}>刷新</Text>
              </Pressable>
            </>
          }
        />

        {/* ── 待办审批卡 (有 pending 时展示，红点角标，单条点进审批裁决) ── */}
        {approvalsError ? (
          <ErrorRetry
            variant="inline"
            message={`待办审批加载失败: ${approvalsError}`}
            onRetry={() => void fetchApprovals()}
            style={styles.errorInlineBar}
          />
        ) : approvals.length > 0 ? (
          <AppCard
            style={styles.approvalsCard}
            onPress={() => onOpenApprovals?.()}
          >
            <View style={styles.cardHeader}>
              <View style={styles.rowAlignCenter}>
                <StatusDot status="err" size={7} pulse />
                <Text style={[styles.cardTitle, { marginLeft: 6 }]}>待办审批</Text>
                <Pill
                  label={String(approvals.length)}
                  mono
                  style={styles.redBadge}
                  textStyle={styles.redBadgeText}
                />
              </View>
              <Text style={styles.linkText}>前往处理 ›</Text>
            </View>
            <View style={styles.approvalItemsList}>
              {approvals.slice(0, 3).map((item, idx) => (
                <Pressable
                  key={item.id ?? idx}
                  style={styles.approvalItemRow}
                  hitSlop={6}
                  onPress={() => onOpenApproval?.(item.id)}
                >
                  <Text style={styles.approvalBullet}>•</Text>
                  <Text style={styles.approvalItemTitle} numberOfLines={1}>
                    {item.title || (typeof item.payload?.title === "string" ? item.payload.title : null) || (typeof item.payload?.name === "string" ? item.payload.name : null) || item.type || "待审事项"}
                  </Text>
                  <Text style={styles.approvalItemChevron}>›</Text>
                </Pressable>
              ))}
            </View>
          </AppCard>
        ) : null}

        {/* ── 实时运行卡 ── */}
        <AppCard style={styles.liveRunCard}>
          <View style={styles.cardHeader}>
            <View style={styles.rowAlignCenter}>
              <StatusDot
                status={liveRuns.filter((r) => r.status === "running" || r.status === "queued").length > 0 ? "ok" : "idle"}
                size={7}
                pulse={liveRuns.filter((r) => r.status === "running" || r.status === "queued").length > 0}
              />
              <Text style={[styles.cardTitle, { marginLeft: 6 }]}>车间实时运行</Text>
            </View>
            <Pill
              label={
                liveRuns.filter((r) => r.status === "running" || r.status === "queued").length > 0
                  ? `${liveRuns.filter((r) => r.status === "running" || r.status === "queued").length} 轮进行中`
                  : "空闲"
              }
              size="sm"
              style={styles.capsuleBadgeSmall}
              textStyle={styles.capsuleBadgeSmallText}
            />
          </View>
          {liveRunsLoading && liveRuns.length === 0 ? (
            <ActivityIndicator size="small" color={C.accent} style={{ marginVertical: 6 }} />
          ) : liveRunsError ? (
            <ErrorRetry
              variant="inline"
              message={`实时运行加载失败: ${liveRunsError}`}
              onRetry={() => void fetchLiveRuns()}
              style={styles.errorInlineBar}
            />
          ) : liveRuns.filter((r) => r.status === "running" || r.status === "queued").length === 0 ? (
            <Text style={styles.emptyLiveRunText}>车间空闲</Text>
          ) : (
            <View style={styles.runningAgentsWrap}>
              <Text style={styles.runningAgentsSummary}>
                运行中:{" "}
                <Text style={{ color: C.ink }}>
                  {liveRuns
                    .filter((r) => r.status === "running" || r.status === "queued")
                    .map((r) => r.agentName || "智能体")
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .join("、")}
                </Text>
              </Text>
            </View>
          )}
        </AppCard>

        {/* ── 六指标卡 2 列网格 (DESIGN.md 第4节规范) ── */}
        <View style={styles.gridSection}>
          <View style={styles.gridContainer}>
            {/* 卡片 1: 预算消耗 */}
            <AppCard style={styles.gridCard}>
              <Text style={styles.gridCardTitle}>月度预算水位</Text>
              <Text style={[styles.gridCardValue, { color: quotaBarColor }]}>
                {q?.utilizationPercent ?? 0}%
              </Text>
              <View style={styles.gridCardSubRow}>
                <Text style={styles.gridCardSubtext}>
                  已用 {formatMoney(q?.spentMonthlyCents ?? 0)}
                </Text>
              </View>
            </AppCard>

            {/* 卡片 2: 工单完成率 */}
            <AppCard style={styles.gridCard}>
              <Text style={styles.gridCardTitle}>工单交付完成率</Text>
              <Text style={[styles.gridCardValue, { color: C.ok }]}>
                {p?.completionRatePercent ?? 0}%
              </Text>
              <View style={styles.gridCardSubRow}>
                <Text style={styles.gridCardSubtext}>
                  已交付 {p?.done ?? 0} / {p?.total ?? 0}
                </Text>
              </View>
            </AppCard>

            {/* 卡片 3: 活跃员工 */}
            <AppCard style={styles.gridCard}>
              <Text style={styles.gridCardTitle}>智能体活跃度</Text>
              <Text style={[styles.gridCardValue, { color: C.accent }]}>
                {idle?.activeCount ?? 0}/{idle?.totalAgents ?? 0}
              </Text>
              <View style={styles.gridCardSubRow}>
                <StatusDot status={idle?.activeCount ? "ok" : "idle"} size={6} />
                <Text style={styles.gridCardSubtext}>
                  {idle?.activeCount ?? 0} 活跃 · {idle?.idleCount ?? 0} 就绪
                </Text>
              </View>
            </AppCard>

            {/* 卡片 4: 交付周期 */}
            <AppCard style={styles.gridCard}>
              <Text style={styles.gridCardTitle}>平均交付耗时</Text>
              <Text style={styles.gridCardValue}>
                {formatDuration(dc?.avgSeconds ?? 0)}
              </Text>
              <View style={styles.gridCardSubRow}>
                <Text style={styles.gridCardSubtext}>
                  P50 {formatDuration(dc?.medianSeconds ?? 0)} · 样本 {dc?.count ?? 0}
                </Text>
              </View>
            </AppCard>

            {/* 卡片 5: 车间效率 */}
            <AppCard style={styles.gridCard}>
              <Text style={styles.gridCardTitle}>车间交付速度</Text>
              <View style={styles.valueWithUnit}>
                <Text style={[styles.gridCardValue, { color: C.ok }]}>
                  {eff?.velocityPerDay ?? 0}
                </Text>
                <Text style={styles.gridCardUnit}>单/日</Text>
              </View>
              <View style={styles.gridCardSubRow}>
                <Text style={styles.gridCardSubtext}>
                  24h完成 {eff?.completedTasks24h ?? 0} · 7d {eff?.completedTasks7d ?? 0}
                </Text>
              </View>
            </AppCard>

            {/* 卡片 6: 综合异常率 */}
            <AppCard style={styles.gridCard}>
              <Text style={styles.gridCardTitle}>综合异常率</Text>
              <Text style={[styles.gridCardValue, { color: healthColor }]}>
                {fr?.overallFailureRatePercent ?? 0}%
              </Text>
              <View style={styles.gridCardSubRow}>
                <Text style={[styles.gridCardSubtext, { color: healthColor }]}>
                  工坊状态: {healthLabel}
                </Text>
              </View>
            </AppCard>
          </View>
        </View>

        {/* ── 深度细分区块 1: 额度与预算水位 ── */}
        <AppCard padding={16} style={styles.detailCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>额度与预算水位</Text>
            <Pill
              label={`${q?.utilizationPercent ?? 0}% 水位`}
              mono
              style={styles.capsuleBadge}
              textStyle={{ color: quotaBarColor }}
            />
          </View>

          <View style={styles.metricRow}>
            <View style={styles.metricCol}>
              <Text style={styles.metricMuted}>本月已用</Text>
              <Text style={[styles.metricBig, { color: quotaBarColor }]}>
                {formatMoney(q?.spentMonthlyCents ?? 0)}
              </Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={styles.metricMuted}>月度限额</Text>
              <Text style={styles.metricBig}>
                {formatMoney(q?.budgetMonthlyCents ?? 0)}
              </Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={styles.metricMuted}>剩余可用</Text>
              <Text style={[styles.metricBig, { color: C.ok }]}>
                {formatMoney(q?.remainingCents ?? 0)}
              </Text>
            </View>
          </View>

          {/* 水位进度条 */}
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${quotaPct}%`, backgroundColor: quotaBarColor },
              ]}
            />
          </View>

          <Text style={styles.cardFootnote}>
            成本事件累计花费: {formatMoney(q?.costEventsSpendCents ?? 0)} · 达 100% 触发工坊自动熔断
          </Text>
        </AppCard>

        {/* ── 深度细分区块 2: 任务进展分布 ── */}
        <AppCard padding={16} style={styles.detailCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>工单流转分布</Text>
            <Pill
              label={`交付完成率 ${p?.completionRatePercent ?? 0}%`}
              mono
              style={styles.capsuleBadge}
              textStyle={{ color: C.ok }}
            />
          </View>

          <View style={styles.statGrid2Col}>
            <StatTile
              value={p?.total ?? 0}
              label="全部工单"
              flex={false}
              style={styles.subStatBox}
            />
            <StatTile
              value={p?.inProgress ?? 0}
              label="执行中"
              valueColor={C.accent}
              flex={false}
              style={styles.subStatBox}
            />
            <StatTile
              value={p?.done ?? 0}
              label="已交付"
              valueColor={C.ok}
              flex={false}
              style={styles.subStatBox}
            />
            <StatTile
              value={p?.blocked ?? 0}
              label="卡点阻塞"
              valueColor={C.err}
              flex={false}
              style={styles.subStatBox}
            />
          </View>

          <View style={styles.capsuleTagWrap}>
            <Pill label={`待办池: ${p?.byStatus?.todo ?? 0}`} mono style={styles.capsuleBadge} />
            <Pill label={`积压: ${p?.byStatus?.backlog ?? 0}`} mono style={styles.capsuleBadge} />
            <Pill label={`评审中: ${p?.byStatus?.in_review ?? 0}`} mono style={styles.capsuleBadge} />
            <Pill label={`已取消: ${p?.cancelled ?? 0}`} mono style={styles.capsuleBadge} />
          </View>
        </AppCard>

        {/* ── 深度细分区块 3: 智能体空闲与活跃度 (规范列表: 行高56, 头像圆32, 呼吸状态点) ── */}
        <AppCard padding={16} style={styles.detailCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>智能体员工团队</Text>
            <View style={styles.rowAlignCenter}>
              <StatusDot status="ok" size={8} />
              <Text style={[styles.cardHeaderMeta, { marginLeft: 4 }]}>
                {idle?.activeCount ?? 0} 活跃 / {idle?.idleCount ?? 0} 就绪
              </Text>
            </View>
          </View>

          {idle?.agents && idle.agents.length > 0 ? (
            <View style={styles.agentList}>
              {idle.agents.map((ag) => {
                const isRunning =
                  ag.status === "running" ||
                  (ag.idleSeconds !== null && ag.idleSeconds < 300);
                const isPaused = ag.status === "paused" || ag.status === "error";
                const dotStatus = isRunning ? "ok" : isPaused ? "err" : "idle";

                return (
                  <View key={ag.id} style={styles.agentRow}>
                    {/* 左侧头像圆 32 (DESIGN.md 第4节) */}
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarText}>
                        {(ag.name || "A").slice(0, 1).toUpperCase()}
                      </Text>
                      <View style={styles.avatarDotAnchor}>
                        <StatusDot status={dotStatus} size={6} />
                      </View>
                    </View>

                    <View style={styles.agentContent}>
                      <Text style={styles.agentName} numberOfLines={1}>
                        {ag.name}
                      </Text>
                      <Text style={styles.agentRole} numberOfLines={1}>
                        {ag.title || ag.role || "通用智能体"}
                      </Text>
                    </View>

                    <View style={styles.agentMetaRight}>
                      <Text
                        style={[
                          styles.idleTag,
                          { color: isRunning ? C.ok : C.ink3 },
                        ]}
                      >
                        {formatIdleTime(ag.idleSeconds)}
                      </Text>
                      <Pill
                        label={ag.status}
                        size="sm"
                        style={styles.capsuleBadgeSmall}
                        textStyle={styles.capsuleBadgeSmallText}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <EmptyState
              icon={<Text style={styles.emptyIcon}>🤖</Text>}
              subtitle="当前公司暂未登记任何智能体员工"
              style={styles.emptyCardBox}
            />
          )}
        </AppCard>

        {/* ── 深度细分区块 4: 交付周期分布 ── */}
        <AppCard padding={16} style={styles.detailCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>交付周期分析 (Lead Time)</Text>
            <Text style={styles.cardHeaderMeta}>
              样本数 {dc?.count ?? 0}
            </Text>
          </View>

          <View style={styles.leadTimeGrid}>
            <KeyValueRow
              label="平均交付耗时"
              value={formatDuration(dc?.avgSeconds ?? 0)}
              valueColor={C.accent}
              style={styles.leadTimeBox}
            />
            <KeyValueRow
              label="P50 中位数耗时"
              value={formatDuration(dc?.medianSeconds ?? 0)}
              style={styles.leadTimeBox}
            />
            <KeyValueRow
              label="P90 交付时长"
              value={formatDuration(dc?.p90Seconds ?? 0)}
              valueColor={C.warn}
              style={styles.leadTimeBox}
            />
          </View>

          <Text style={[styles.subSectionTitle, { marginTop: 16 }]}>
            时长区间分布
          </Text>
          <View style={styles.bucketContainer}>
            {(dc?.buckets ?? []).map((b, idx) => (
              <View key={idx} style={styles.bucketRow}>
                <Text style={styles.bucketLabel}>{b.label}</Text>
                <View style={styles.bucketBarOuter}>
                  <View
                    style={[
                      styles.bucketBarInner,
                      { width: `${Math.min(100, Math.max(2, b.percent))}%` },
                    ]}
                  />
                </View>
                <Text style={styles.bucketCount}>
                  {b.count}单 ({b.percent}%)
                </Text>
              </View>
            ))}
          </View>
        </AppCard>

        {/* ── 深度细分区块 5: 车间效率与交付走势 ── */}
        <AppCard padding={16} style={styles.detailCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>车间交付速度</Text>
            <Pill
              label={`${eff?.velocityPerDay ?? 0} 单/日`}
              mono
              style={styles.capsuleBadge}
              textStyle={{ color: C.ok }}
            />
          </View>

          <View style={styles.metricRow}>
            <View style={styles.metricCol}>
              <Text style={styles.metricMuted}>近24小时完成</Text>
              <Text style={[styles.metricBig, { color: C.accent }]}>
                {eff?.completedTasks24h ?? 0}
              </Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={styles.metricMuted}>近7天完成</Text>
              <Text style={[styles.metricBig, { color: C.ok }]}>
                {eff?.completedTasks7d ?? 0}
              </Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={styles.metricMuted}>近30天完成</Text>
              <Text style={styles.metricBig}>
                {eff?.completedTasks30d ?? 0}
              </Text>
            </View>
          </View>

          <Text style={[styles.subSectionTitle, { marginTop: 16 }]}>
            近期产出动向 (14日走势)
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.timelineScroll}
            keyboardShouldPersistTaps="handled"
          >
            {(eff?.dailyThroughput ?? []).slice(-7).map((d) => (
              <View key={d.date} style={styles.timelineCol}>
                <Text style={styles.timelineCompleted}>{d.completed}完</Text>
                <View style={styles.timelineBar}>
                  <View
                    style={[
                      styles.timelineBarFill,
                      {
                        height: `${Math.min(100, Math.max(8, d.completed * 20))}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.timelineDate}>{d.date.slice(5)}</Text>
              </View>
            ))}
          </ScrollView>
        </AppCard>

        {/* ── 深度细分区块 6: 失败率监控 ── */}
        <AppCard padding={16} style={styles.detailCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>异常与失败率监控</Text>
            <Pill
              label={healthLabel}
              mono
              style={styles.capsuleBadge}
              textStyle={{ color: healthColor }}
            />
          </View>

          <View style={styles.metricRow}>
            <View style={styles.metricCol}>
              <Text style={styles.metricMuted}>工单取消率</Text>
              <Text
                style={[
                  styles.metricBig,
                  {
                    color:
                      (fr?.taskFailureRatePercent ?? 0) > 10 ? C.err : C.ink,
                  },
                ]}
              >
                {fr?.taskFailureRatePercent ?? 0}%
              </Text>
              <Text style={styles.statSubtag}>
                {fr?.cancelledTasks ?? 0} / {fr?.totalTasks ?? 0} 单
              </Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={styles.metricMuted}>心跳执行报错率</Text>
              <Text
                style={[
                  styles.metricBig,
                  {
                    color:
                      (fr?.runFailureRatePercent ?? 0) > 10 ? C.err : C.ink,
                  },
                ]}
              >
                {fr?.runFailureRatePercent ?? 0}%
              </Text>
              <Text style={styles.statSubtag}>
                {fr?.failedRuns ?? 0} / {fr?.totalRuns ?? 0} 轮
              </Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={styles.metricMuted}>综合异常率</Text>
              <Text style={[styles.metricBig, { color: healthColor }]}>
                {fr?.overallFailureRatePercent ?? 0}%
              </Text>
              <Text style={styles.statSubtag}>
                自愈恢复: {fr?.recoveredRuns ?? 0}
              </Text>
            </View>
          </View>

          <Text style={styles.cardFootnote}>
            已接入自动重试自愈机制 · 重试成功的运行不计入失败指标
          </Text>
        </AppCard>

        {/* ── 最近时间线 (最近8条事件流) ── */}
        <AppCard padding={16} style={styles.detailCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>最近时间线</Text>
            <Text style={styles.cardHeaderMeta}>
              {timeline?.events ? `最新 ${Math.min(timeline.events.length, 8)} 条动态` : "事件动态"}
            </Text>
          </View>
          {timelineLoading && !timeline ? (
            <ActivityIndicator size="small" color={C.accent} style={{ marginVertical: 12 }} />
          ) : timelineError ? (
            <ErrorRetry
              variant="inline"
              message={`时间线加载失败: ${timelineError}`}
              onRetry={() => void fetchTimeline()}
              style={styles.errorInlineBar}
            />
          ) : !timeline?.events || timeline.events.length === 0 ? (
            <Text style={styles.cardFootnote}>暂无最近流转事件记录</Text>
          ) : (
            <View style={styles.timelineEventList}>
              {timeline.events.slice(0, 8).map((evt, idx) => {
                const actorObj = timeline.actors?.find((a) => a.id === evt.actorId);
                const actorName = actorObj?.name || (evt.actorId.includes(":") ? evt.actorId.split(":")[1] : "智能体");
                const actionDesc = EVENT_KIND_LABEL[evt.kind] ?? evt.kind;
                const isLast = idx === Math.min(timeline.events.length, 8) - 1;
                return (
                  <View key={`${evt.issueId}-${idx}`} style={styles.timelineEventRow}>
                    <View style={styles.timelineDotCol}>
                      <View style={styles.timelineEventDot} />
                      {!isLast && <View style={styles.timelineEventLine} />}
                    </View>
                    <View style={styles.timelineEventContent}>
                      <View style={styles.timelineEventHeader}>
                        <Text style={styles.timelineActorText} numberOfLines={1}>{actorName}</Text>
                        <Text style={styles.timelineTimeText}>{formatRelativeTime(evt.at)}</Text>
                      </View>
                      <Text style={styles.timelineDescText} numberOfLines={2}>
                        {actionDesc} {evt.issueId ? `· 工单 #${evt.issueId.slice(0, 6)}` : ""}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </AppCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
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
  otaBtn: {
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 70,
    height: 32,
  },
  otaBtnText: {
    color: C.ink2,
    fontSize: 13,
    fontWeight: "500",
  },
  refreshBtn: {
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  refreshBtnText: {
    color: C.ink2,
    fontSize: 13,
    fontWeight: "500",
  },
  gridSection: {
    gap: 12,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  // AppCard supplies the shell (0.02 bg + C.line border + radius 12 + padding 14)
  gridCard: {
    flexBasis: "48%",
    flexGrow: 1,
    gap: 4,
  },
  gridCardTitle: {
    fontSize: 11,
    color: C.ink3,
    fontWeight: "500",
  },
  gridCardValue: {
    fontSize: 24,
    fontWeight: "600",
    color: C.ink,
    fontVariant: ["tabular-nums"],
  },
  valueWithUnit: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  gridCardUnit: {
    fontSize: 13,
    color: C.ink3,
    fontWeight: "500",
  },
  gridCardSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  gridCardSubtext: {
    fontSize: 11,
    color: C.ink4,
    fontVariant: ["tabular-nums"],
  },
  // AppCard (padding={16}) supplies the shell
  detailCard: {
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: C.ink,
  },
  cardHeaderMeta: {
    fontSize: 11,
    color: C.ink3,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  // Pill 提供 radius 999 / 0.05 底 / C.line 边 / 11px 500 文字 (mono=tabular-nums)
  capsuleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "auto",
  },
  // Pill 提供 radius 999 / 0.05 底 / C.line 边
  capsuleBadgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "auto",
  },
  capsuleBadgeSmallText: {
    fontSize: 10,
    fontWeight: "500",
    color: C.ink3,
    textTransform: "uppercase",
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  metricCol: {
    flex: 1,
    gap: 4,
  },
  metricMuted: {
    fontSize: 11,
    color: C.ink3,
    fontWeight: "400",
  },
  metricBig: {
    fontSize: 18,
    fontWeight: "600",
    color: C.ink,
    fontVariant: ["tabular-nums"],
  },
  statSubtag: {
    fontSize: 10,
    color: C.ink4,
    fontVariant: ["tabular-nums"],
  },
  progressBarBg: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  cardFootnote: {
    fontSize: 11,
    color: C.ink4,
    lineHeight: 16,
    fontVariant: ["tabular-nums"],
  },
  statGrid2Col: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  // StatTile 提供 0.02 底 / 1px 边 / 居中 value+label, 这里覆盖为原 subStatBox 的尺寸
  subStatBox: {
    flexBasis: "48%",
    flexGrow: 1,
    borderColor: C.lineSubtle,
    borderRadius: 8,
    paddingVertical: 10,
    gap: 2,
  },
  capsuleTagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  rowAlignCenter: {
    flexDirection: "row",
    alignItems: "center",
  },
  agentList: {
    gap: 8,
  },
  agentRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    gap: 12,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: C.lineSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink2,
  },
  avatarDotAnchor: {
    position: "absolute",
    bottom: -4,
    right: -4,
  },
  agentContent: {
    flex: 1,
    gap: 2,
  },
  agentName: {
    fontSize: 13,
    fontWeight: "500",
    color: C.ink,
  },
  agentRole: {
    fontSize: 11,
    color: C.ink3,
    fontWeight: "400",
  },
  agentMetaRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  idleTag: {
    fontSize: 11,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  // EmptyState 提供居中 icon+subtitle; 这里去掉它内置的卡片壳, 还原原来的纯文本空态
  emptyCardBox: {
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingVertical: 24,
    paddingHorizontal: 0,
    gap: 6,
  },
  emptyIcon: {
    fontSize: 24,
  },
  leadTimeGrid: {
    flexDirection: "row",
    gap: 8,
  },
  // KeyValueRow (layout="stacked") 提供 label+value, 这里保留原来的方框外观
  leadTimeBox: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 8,
    padding: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: "500",
    color: C.ink2,
  },
  bucketContainer: {
    gap: 8,
  },
  bucketRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bucketLabel: {
    width: 64,
    fontSize: 11,
    color: C.ink3,
    fontVariant: ["tabular-nums"],
  },
  bucketBarOuter: {
    flex: 1,
    height: 6,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 4,
    overflow: "hidden",
  },
  bucketBarInner: {
    height: "100%",
    backgroundColor: C.brand,
    borderRadius: 4,
  },
  bucketCount: {
    width: 80,
    fontSize: 11,
    color: C.ink3,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  timelineScroll: {
    paddingVertical: 4,
  },
  timelineCol: {
    alignItems: "center",
    marginRight: 16,
    gap: 6,
  },
  timelineCompleted: {
    fontSize: 11,
    color: C.accent,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  timelineBar: {
    width: 14,
    height: 60,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 4,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  timelineBarFill: {
    width: "100%",
    backgroundColor: C.brand,
    borderRadius: 4,
  },
  timelineDate: {
    fontSize: 10,
    color: C.ink4,
    fontVariant: ["tabular-nums"],
  },
  linkText: {
    color: C.accent,
    fontWeight: "500",
    fontSize: 13,
  },
  // ErrorRetry variant="fullscreen" 自带居中容器; 这里让它按内容收缩, 与下方返回链接同列居中
  errorRetryCentered: {
    flex: 0,
    padding: 0,
  },
  // ErrorRetry variant="inline" 默认内边距比本页原有样式略小, 这里还原原值
  errorInlineBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  // AppCard supplies the shell; 原样保留告警配色与行间距
  approvalsCard: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderColor: "rgba(239, 68, 68, 0.28)",
    gap: 10,
  },
  // Pill 提供 radius 999 / 11px 文字; 这里还原原来的实心红底与内边距
  redBadge: {
    backgroundColor: C.err,
    borderColor: C.err,
    borderWidth: 0,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 6,
    alignSelf: "auto",
  },
  redBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  approvalItemsList: {
    gap: 6,
  },
  approvalItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  approvalBullet: {
    color: C.err,
    fontSize: 14,
  },
  approvalItemTitle: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  approvalItemChevron: {
    color: C.err,
    fontSize: 14,
    fontWeight: "600",
  },
  // AppCard supplies the shell (padding 14 默认值)
  liveRunCard: {
    gap: 10,
  },
  emptyLiveRunText: {
    color: C.ink3,
    fontSize: 13,
  },
  runningAgentsWrap: {
    backgroundColor: "rgba(39, 166, 68, 0.08)",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(39, 166, 68, 0.2)",
  },
  runningAgentsSummary: {
    color: C.ok,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18,
  },
  timelineEventList: {
    gap: 0,
  },
  timelineEventRow: {
    flexDirection: "row",
    gap: 10,
  },
  timelineDotCol: {
    alignItems: "center",
    width: 14,
  },
  timelineEventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.accent,
    marginTop: 4,
  },
  timelineEventLine: {
    width: 1,
    flex: 1,
    backgroundColor: C.line,
    marginVertical: 2,
  },
  timelineEventContent: {
    flex: 1,
    paddingBottom: 14,
    gap: 3,
  },
  timelineEventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timelineActorText: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "600",
  },
  timelineTimeText: {
    color: C.ink4,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  timelineDescText: {
    color: C.ink3,
    fontSize: 12,
    lineHeight: 16,
  },
});
