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
} from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Company, DashboardSummary } from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { StatusDot } from "../components/StatusDot";
import { useOTA } from "../OTA";

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

interface DashboardScreenProps {
  company: Company;
  onBack?: () => void;
}

/**
 * 效能驾驶舱 (DESIGN.md Linear 设计系统规范)
 * - 指标卡 2 列网格 (数字 24px weight "600" tabularNum + 标题 11px ink3)
 * - 顶部公司选择器胶囊 (radius 999, bg 0.05, border line, text ink2)
 * - 智能体状态点 8px 呼吸灯扩散
 * - 半透明卡片 bg 0.02 + 半透明白边 line
 */
export function DashboardScreen({ company, onBack }: DashboardScreenProps) {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isChecking: otaChecking, checkUpdate: checkOTA } = useOTA();

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
      <SafeAreaView style={[styles.center, { backgroundColor: C.bg }]}>
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={[styles.muted, { marginTop: 12 }]}>正在汇聚工坊效能大盘…</Text>
      </SafeAreaView>
    );
  }

  if (error && !data) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: C.bg, padding: 16 }]}>
        <Text style={styles.errorText}>加载大盘失败: {error}</Text>
        <Pressable
          style={[styles.btnPrimary, { marginTop: 16 }]}
          onPress={() => fetchDashboard()}
        >
          <Text style={styles.btnPrimaryText}>重新加载</Text>
        </Pressable>
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchDashboard(true)}
            tintColor={C.accent}
          />
        }
      >
        {/* 顶部操作与公司选择器胶囊 */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <View style={styles.headerRow}>
              {onBack ? (
                <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
                  <Text style={styles.backBtnText}>‹ 任务</Text>
                </Pressable>
              ) : null}
              <Text style={styles.title}>驾驶舱效能</Text>
            </View>

            {/* 顶部公司选择器胶囊 (DESIGN.md 第4节) */}
            <View style={styles.companyCapsule}>
              <StatusDot status="ok" size={6} />
              <Text style={styles.companyCapsuleText} numberOfLines={1}>
                {company.name}
              </Text>
              <Text style={styles.companyCapsuleTag}>六大核心运转指标</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
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
          </View>
        </View>

        {/* ── 六指标卡 2 列网格 (DESIGN.md 第4节规范) ── */}
        <View style={styles.gridSection}>
          <View style={styles.gridContainer}>
            {/* 卡片 1: 预算消耗 */}
            <View style={styles.gridCard}>
              <Text style={styles.gridCardTitle}>月度预算水位</Text>
              <Text style={[styles.gridCardValue, { color: quotaBarColor }]}>
                {q?.utilizationPercent ?? 0}%
              </Text>
              <View style={styles.gridCardSubRow}>
                <Text style={styles.gridCardSubtext}>
                  已用 {formatMoney(q?.spentMonthlyCents ?? 0)}
                </Text>
              </View>
            </View>

            {/* 卡片 2: 工单完成率 */}
            <View style={styles.gridCard}>
              <Text style={styles.gridCardTitle}>工单交付完成率</Text>
              <Text style={[styles.gridCardValue, { color: C.ok }]}>
                {p?.completionRatePercent ?? 0}%
              </Text>
              <View style={styles.gridCardSubRow}>
                <Text style={styles.gridCardSubtext}>
                  已交付 {p?.done ?? 0} / {p?.total ?? 0}
                </Text>
              </View>
            </View>

            {/* 卡片 3: 活跃员工 */}
            <View style={styles.gridCard}>
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
            </View>

            {/* 卡片 4: 交付周期 */}
            <View style={styles.gridCard}>
              <Text style={styles.gridCardTitle}>平均交付耗时</Text>
              <Text style={styles.gridCardValue}>
                {formatDuration(dc?.avgSeconds ?? 0)}
              </Text>
              <View style={styles.gridCardSubRow}>
                <Text style={styles.gridCardSubtext}>
                  P50 {formatDuration(dc?.medianSeconds ?? 0)} · 样本 {dc?.count ?? 0}
                </Text>
              </View>
            </View>

            {/* 卡片 5: 车间效率 */}
            <View style={styles.gridCard}>
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
            </View>

            {/* 卡片 6: 综合异常率 */}
            <View style={styles.gridCard}>
              <Text style={styles.gridCardTitle}>综合异常率</Text>
              <Text style={[styles.gridCardValue, { color: healthColor }]}>
                {fr?.overallFailureRatePercent ?? 0}%
              </Text>
              <View style={styles.gridCardSubRow}>
                <Text style={[styles.gridCardSubtext, { color: healthColor }]}>
                  工坊状态: {healthLabel}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 深度细分区块 1: 额度与预算水位 ── */}
        <View style={styles.detailCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>额度与预算水位</Text>
            <View style={styles.capsuleBadge}>
              <Text style={[styles.capsuleBadgeText, { color: quotaBarColor }]}>
                {q?.utilizationPercent ?? 0}% 水位
              </Text>
            </View>
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
        </View>

        {/* ── 深度细分区块 2: 任务进展分布 ── */}
        <View style={styles.detailCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>工单流转分布</Text>
            <View style={styles.capsuleBadge}>
              <Text style={[styles.capsuleBadgeText, { color: C.ok }]}>
                交付完成率 {p?.completionRatePercent ?? 0}%
              </Text>
            </View>
          </View>

          <View style={styles.statGrid2Col}>
            <View style={styles.subStatBox}>
              <Text style={styles.subStatNum}>{p?.total ?? 0}</Text>
              <Text style={styles.subStatLabel}>全部工单</Text>
            </View>
            <View style={styles.subStatBox}>
              <Text style={[styles.subStatNum, { color: C.accent }]}>{p?.inProgress ?? 0}</Text>
              <Text style={styles.subStatLabel}>执行中</Text>
            </View>
            <View style={styles.subStatBox}>
              <Text style={[styles.subStatNum, { color: C.ok }]}>{p?.done ?? 0}</Text>
              <Text style={styles.subStatLabel}>已交付</Text>
            </View>
            <View style={styles.subStatBox}>
              <Text style={[styles.subStatNum, { color: C.err }]}>{p?.blocked ?? 0}</Text>
              <Text style={styles.subStatLabel}>卡点阻塞</Text>
            </View>
          </View>

          <View style={styles.capsuleTagWrap}>
            <View style={styles.capsuleBadge}>
              <Text style={styles.capsuleBadgeText}>待办池: {p?.byStatus?.todo ?? 0}</Text>
            </View>
            <View style={styles.capsuleBadge}>
              <Text style={styles.capsuleBadgeText}>积压: {p?.byStatus?.backlog ?? 0}</Text>
            </View>
            <View style={styles.capsuleBadge}>
              <Text style={styles.capsuleBadgeText}>评审中: {p?.byStatus?.in_review ?? 0}</Text>
            </View>
            <View style={styles.capsuleBadge}>
              <Text style={styles.capsuleBadgeText}>已取消: {p?.cancelled ?? 0}</Text>
            </View>
          </View>
        </View>

        {/* ── 深度细分区块 3: 智能体空闲与活跃度 (规范列表: 行高56, 头像圆32, 呼吸状态点) ── */}
        <View style={styles.detailCard}>
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
                      <View style={styles.capsuleBadgeSmall}>
                        <Text style={styles.capsuleBadgeSmallText}>
                          {ag.status}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyCardBox}>
              <Text style={styles.emptyIcon}>🤖</Text>
              <Text style={styles.emptyText}>当前公司暂未登记任何智能体员工</Text>
            </View>
          )}
        </View>

        {/* ── 深度细分区块 4: 交付周期分布 ── */}
        <View style={styles.detailCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>交付周期分析 (Lead Time)</Text>
            <Text style={styles.cardHeaderMeta}>
              样本数 {dc?.count ?? 0}
            </Text>
          </View>

          <View style={styles.leadTimeGrid}>
            <View style={styles.leadTimeBox}>
              <Text style={styles.metricMuted}>平均交付耗时</Text>
              <Text style={[styles.leadTimeValue, { color: C.accent }]}>
                {formatDuration(dc?.avgSeconds ?? 0)}
              </Text>
            </View>
            <View style={styles.leadTimeBox}>
              <Text style={styles.metricMuted}>P50 中位数耗时</Text>
              <Text style={styles.leadTimeValue}>
                {formatDuration(dc?.medianSeconds ?? 0)}
              </Text>
            </View>
            <View style={styles.leadTimeBox}>
              <Text style={styles.metricMuted}>P90 交付时长</Text>
              <Text style={[styles.leadTimeValue, { color: C.warn }]}>
                {formatDuration(dc?.p90Seconds ?? 0)}
              </Text>
            </View>
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
        </View>

        {/* ── 深度细分区块 5: 车间效率与交付走势 ── */}
        <View style={styles.detailCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>车间交付速度</Text>
            <View style={styles.capsuleBadge}>
              <Text style={[styles.capsuleBadgeText, { color: C.ok }]}>
                {eff?.velocityPerDay ?? 0} 单/日
              </Text>
            </View>
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
        </View>

        {/* ── 深度细分区块 6: 失败率监控 ── */}
        <View style={styles.detailCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>异常与失败率监控</Text>
            <View style={styles.capsuleBadge}>
              <Text style={[styles.capsuleBadgeText, { color: healthColor }]}>
                {healthLabel}
              </Text>
            </View>
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
        </View>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backBtn: {
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
  },
  backBtnText: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "500",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: C.ink,
    letterSpacing: -0.4,
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  gridCard: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 14,
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
  detailCard: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 16,
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
  capsuleBadge: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  capsuleBadgeText: {
    fontSize: 11,
    fontWeight: "500",
    color: C.ink2,
    fontVariant: ["tabular-nums"],
  },
  capsuleBadgeSmall: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 6,
    paddingVertical: 2,
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
  subStatBox: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: C.lineSubtle,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 2,
  },
  subStatNum: {
    fontSize: 20,
    fontWeight: "600",
    color: C.ink,
    fontVariant: ["tabular-nums"],
  },
  subStatLabel: {
    fontSize: 11,
    color: C.ink3,
    fontWeight: "400",
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
  emptyCardBox: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  emptyIcon: {
    fontSize: 24,
  },
  emptyText: {
    fontSize: 13,
    color: C.ink3,
    textAlign: "center",
  },
  leadTimeGrid: {
    flexDirection: "row",
    gap: 8,
  },
  leadTimeBox: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 8,
    padding: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  leadTimeValue: {
    fontSize: 15,
    fontWeight: "600",
    color: C.ink,
    fontVariant: ["tabular-nums"],
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
  muted: {
    color: C.ink3,
    fontSize: 13,
  },
  errorText: {
    color: C.err,
    fontSize: 13,
    textAlign: "center",
  },
  btnPrimary: {
    backgroundColor: C.brand,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  btnPrimaryText: {
    color: C.ink,
    fontWeight: "500",
    fontSize: 15,
  },
});
