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
import { StatusBar } from "expo-status-bar";
import type { Company, DashboardSummary } from "@coolie/api-client";
import { coolie } from "../coolie";

// ── 品牌色板 (深靛蓝 + 亮青) ──────────────────────────────────────
const C = {
  bg: "#0B1023",        // 页面深底
  card: "#151B36",      // 卡片底色
  cardHi: "#1B2347",    // 卡片高亮
  line: "#27305C",      // 分隔线
  ink: "#EEF2FF",       // 主文字
  inkDim: "#8A93B8",    // 次文字
  accent: "#22D3EE",    // 亮青
  accentDeep: "#0E7490",
  danger: "#F87171",    // 红色
  ok: "#34D399",        // 绿色
  warn: "#FBBF24",      // 琥珀黄
  purple: "#A78BFA",
} as const;

function formatMoney(cents: number): string {
  const yuan = (cents / 100).toFixed(2);
  return `¥${Number(yuan).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

export function DashboardScreen({ company, onBack }: DashboardScreenProps) {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async (isRefresh = false) => {
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
  }, [company.id]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  if (loading && !data) {
    return (
      <View style={[styles.center, { backgroundColor: C.bg }]}>
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={[styles.muted, { marginTop: 12 }]}>正在汇聚工坊效能大盘…</Text>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={[styles.center, { backgroundColor: C.bg, padding: 20 }]}>
        <Text style={styles.errorText}>加载大盘失败: {error}</Text>
        <Pressable style={[styles.btn, { marginTop: 16 }]} onPress={() => fetchDashboard()}>
          <Text style={styles.btnText}>重新加载</Text>
        </Pressable>
        {onBack ? (
          <Pressable style={{ marginTop: 16 }} onPress={onBack}>
            <Text style={styles.link}>‹ 返回任务列表</Text>
          </Pressable>
        ) : null}
      </View>
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
    quotaPct > 90 ? C.danger : quotaPct > 70 ? C.warn : C.accent;

  // 综合健康度评估
  const failurePct = fr?.overallFailureRatePercent ?? 0;
  const healthLabel = failurePct <= 5 ? "卓越" : failurePct <= 15 ? "平稳" : "预警";
  const healthColor = failurePct <= 5 ? C.ok : failurePct <= 15 ? C.warn : C.danger;

  return (
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
      <StatusBar style="light" />

      {/* 顶部导航与操作栏 */}
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
          <Text style={styles.subtitle} numberOfLines={1}>
            {company.name} · 六大核心运转指标
          </Text>
        </View>
        <Pressable
          style={styles.refreshBtn}
          onPress={() => fetchDashboard(true)}
          hitSlop={12}
        >
          <Text style={styles.refreshBtnText}>刷新</Text>
        </Pressable>
      </View>

      {/* 顶部速览条 (At a Glance KPI Ribbon) */}
      <View style={styles.kpiRibbon}>
        <View style={styles.kpiItem}>
          <Text style={styles.kpiLabel}>预算消耗</Text>
          <Text style={[styles.kpiValue, { color: quotaBarColor }]}>{q?.utilizationPercent ?? 0}%</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={styles.kpiLabel}>工单完成率</Text>
          <Text style={[styles.kpiValue, { color: C.ok }]}>{p?.completionRatePercent ?? 0}%</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={styles.kpiLabel}>活跃员工</Text>
          <Text style={[styles.kpiValue, { color: C.accent }]}>{idle?.activeCount ?? 0}/{idle?.totalAgents ?? 0}</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={styles.kpiLabel}>工坊健康</Text>
          <Text style={[styles.kpiValue, { color: healthColor }]}>{healthLabel}</Text>
        </View>
      </View>

      {/* ── 指标卡片 1: 额度 (需求②: budget_monthly_cents vs spent_monthly_cents) ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>💳 额度与预算水位</Text>
          <View style={[styles.pill, { borderColor: quotaBarColor, backgroundColor: `${quotaBarColor}22` }]}>
            <Text style={[styles.pillText, { color: quotaBarColor }]}>{q?.utilizationPercent ?? 0}% 水位</Text>
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
            <Text style={styles.metricBig}>{formatMoney(q?.budgetMonthlyCents ?? 0)}</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricMuted}>剩余可用</Text>
            <Text style={[styles.metricBig, { color: C.ok }]}>
              {formatMoney(q?.remainingCents ?? 0)}
            </Text>
          </View>
        </View>

        {/* 预算水位条 */}
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

      {/* ── 指标卡片 2: 进度 (需求⑥: task status distribution) ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>📊 任务进展与状态分布</Text>
          <Text style={[styles.cardHeaderValue, { color: C.ok }]}>
            完成率 {p?.completionRatePercent ?? 0}%
          </Text>
        </View>

        <View style={styles.statGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{p?.total ?? 0}</Text>
            <Text style={styles.statTag}>全部工单</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: C.accent }]}>{p?.inProgress ?? 0}</Text>
            <Text style={styles.statTag}>执行中</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: C.ok }]}>{p?.done ?? 0}</Text>
            <Text style={styles.statTag}>已交付</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: C.danger }]}>{p?.blocked ?? 0}</Text>
            <Text style={styles.statTag}>卡点阻塞</Text>
          </View>
        </View>

        {/* 细分状态标签 */}
        <View style={styles.tagWrap}>
          <View style={styles.tagItem}>
            <Text style={styles.tagDot}>•</Text>
            <Text style={styles.tagText}>待办池: {p?.byStatus?.todo ?? 0}</Text>
          </View>
          <View style={styles.tagItem}>
            <Text style={styles.tagDot}>•</Text>
            <Text style={styles.tagText}>积压: {p?.byStatus?.backlog ?? 0}</Text>
          </View>
          <View style={styles.tagItem}>
            <Text style={styles.tagDot}>•</Text>
            <Text style={styles.tagText}>评审中: {p?.byStatus?.in_review ?? 0}</Text>
          </View>
          <View style={styles.tagItem}>
            <Text style={styles.tagDot}>•</Text>
            <Text style={styles.tagText}>已取消: {p?.cancelled ?? 0}</Text>
          </View>
        </View>
      </View>

      {/* ── 指标卡片 3: 空闲度 (需求⑦: agent last_heartbeat距今) ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>🤖 智能体空闲与活跃度</Text>
          <View style={styles.rowAlign}>
            <Text style={[styles.statusDot, { backgroundColor: C.ok }]} />
            <Text style={[styles.cardHeaderValue, { color: C.ink }]}>
              {idle?.activeCount ?? 0} 活跃 / {idle?.idleCount ?? 0} 就绪
            </Text>
          </View>
        </View>

        {idle?.agents && idle.agents.length > 0 ? (
          <View style={styles.agentList}>
            {idle.agents.map((ag) => {
              const isRunning = ag.status === "running" || (ag.idleSeconds !== null && ag.idleSeconds < 300);
              const isPaused = ag.status === "paused" || ag.status === "error";
              const indicatorColor = isRunning ? C.ok : isPaused ? C.danger : C.warn;

              return (
                <View key={ag.id} style={styles.agentRow}>
                  <View style={styles.agentInfo}>
                    <View style={[styles.statusCircle, { backgroundColor: indicatorColor }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.agentName} numberOfLines={1}>{ag.name}</Text>
                      <Text style={styles.agentRole} numberOfLines={1}>{ag.title || ag.role || "通用智能体"}</Text>
                    </View>
                  </View>
                  <View style={styles.agentRight}>
                    <Text style={[styles.idleTag, { color: isRunning ? C.ok : C.inkDim }]}>
                      {formatIdleTime(ag.idleSeconds)}
                    </Text>
                    <Text style={styles.agentStatusText}>{ag.status}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.emptyText}>当前公司暂未登记任何智能体员工</Text>
        )}
      </View>

      {/* ── 指标卡片 4: 交付周期 (需求⑧: issue创建到done时长分布) ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>⏱️ 交付周期分析 (Lead Time)</Text>
          <Text style={[styles.cardHeaderValue, { color: C.accent }]}>
            样本数 {dc?.count ?? 0}
          </Text>
        </View>

        <View style={styles.leadTimeHighlightRow}>
          <View style={styles.leadTimeHighlightBox}>
            <Text style={styles.leadTimeLabel}>平均交付耗时</Text>
            <Text style={[styles.leadTimeValue, { color: C.accent }]}>
              {formatDuration(dc?.avgSeconds ?? 0)}
            </Text>
          </View>
          <View style={styles.leadTimeHighlightBox}>
            <Text style={styles.leadTimeLabel}>P50 中位数耗时</Text>
            <Text style={styles.leadTimeValue}>{formatDuration(dc?.medianSeconds ?? 0)}</Text>
          </View>
          <View style={styles.leadTimeHighlightBox}>
            <Text style={styles.leadTimeLabel}>P90 交付时长</Text>
            <Text style={[styles.leadTimeValue, { color: C.warn }]}>
              {formatDuration(dc?.p90Seconds ?? 0)}
            </Text>
          </View>
        </View>

        {/* 耗时分布梯队 */}
        <Text style={[styles.subSectionTitle, { marginTop: 14 }]}>时长区间分布</Text>
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

      {/* ── 指标卡片 5: 车间效率 (需求⑨: 吞吐速率与产出) ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>⚡ 车间效率与交付速度</Text>
          <Text style={[styles.cardHeaderValue, { color: C.ok }]}>
            {eff?.velocityPerDay ?? 0} 单/日
          </Text>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricCol}>
            <Text style={styles.metricMuted}>近24小时完成</Text>
            <Text style={[styles.metricBig, { color: C.accent }]}>{eff?.completedTasks24h ?? 0}</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricMuted}>近7天完成</Text>
            <Text style={[styles.metricBig, { color: C.ok }]}>{eff?.completedTasks7d ?? 0}</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricMuted}>近30天完成</Text>
            <Text style={styles.metricBig}>{eff?.completedTasks30d ?? 0}</Text>
          </View>
        </View>

        <Text style={[styles.subSectionTitle, { marginTop: 14 }]}>近期产出动向 (14日走势)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timelineScroll}>
          {(eff?.dailyThroughput ?? []).slice(-7).map((d) => (
            <View key={d.date} style={styles.timelineCol}>
              <Text style={styles.timelineCompleted}>{d.completed}完</Text>
              <View style={styles.timelineBar}>
                <View
                  style={[
                    styles.timelineBarFill,
                    { height: `${Math.min(100, Math.max(8, d.completed * 20))}%` },
                  ]}
                />
              </View>
              <Text style={styles.timelineDate}>{d.date.slice(5)}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* ── 指标卡片 6: 失败率 (需求⑩: cancelled+error 占比) ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>🛡️ 异常与失败率监控</Text>
          <View style={[styles.pill, { borderColor: healthColor, backgroundColor: `${healthColor}22` }]}>
            <Text style={[styles.pillText, { color: healthColor }]}>{healthLabel}</Text>
          </View>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricCol}>
            <Text style={styles.metricMuted}>工单取消率</Text>
            <Text style={[styles.metricBig, { color: (fr?.taskFailureRatePercent ?? 0) > 10 ? C.danger : C.ink }]}>
              {fr?.taskFailureRatePercent ?? 0}%
            </Text>
            <Text style={styles.statSubtag}>{fr?.cancelledTasks ?? 0} / {fr?.totalTasks ?? 0} 单</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricMuted}>心跳执行报错率</Text>
            <Text style={[styles.metricBig, { color: (fr?.runFailureRatePercent ?? 0) > 10 ? C.danger : C.ink }]}>
              {fr?.runFailureRatePercent ?? 0}%
            </Text>
            <Text style={styles.statSubtag}>{fr?.failedRuns ?? 0} / {fr?.totalRuns ?? 0} 轮</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricMuted}>综合异常率</Text>
            <Text style={[styles.metricBig, { color: healthColor }]}>
              {fr?.overallFailureRatePercent ?? 0}%
            </Text>
            <Text style={styles.statSubtag}>自动恢复: {fr?.recoveredRuns ?? 0}</Text>
          </View>
        </View>

        <Text style={styles.cardFootnote}>
          已接入自动重试自愈机制 · 重试成功的运行不计入失败指标
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingTop: 56,
    paddingBottom: 40,
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
    alignItems: "center",
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backBtn: {
    backgroundColor: C.cardHi,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
  },
  backBtnText: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "600",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: C.ink,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 12,
    color: C.inkDim,
    marginTop: 2,
  },
  refreshBtn: {
    backgroundColor: C.cardHi,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
  },
  refreshBtnText: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "700",
  },
  kpiRibbon: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "space-around",
  },
  kpiItem: {
    alignItems: "center",
    flex: 1,
    gap: 2,
  },
  kpiLabel: {
    fontSize: 11,
    color: C.inkDim,
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: "800",
  },
  kpiDivider: {
    width: 1,
    height: 24,
    backgroundColor: C.line,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.line,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: C.ink,
  },
  cardHeaderValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metricCol: {
    flex: 1,
    gap: 2,
  },
  metricMuted: {
    fontSize: 11,
    color: C.inkDim,
  },
  metricBig: {
    fontSize: 18,
    fontWeight: "800",
    color: C.ink,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: C.cardHi,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  cardFootnote: {
    fontSize: 11,
    color: C.inkDim,
    lineHeight: 15,
  },
  statGrid: {
    flexDirection: "row",
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: C.cardHi,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.line,
    gap: 2,
  },
  statNum: {
    fontSize: 18,
    fontWeight: "800",
    color: C.ink,
  },
  statTag: {
    fontSize: 11,
    color: C.inkDim,
  },
  statSubtag: {
    fontSize: 10,
    color: C.inkDim,
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  tagItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tagDot: {
    color: C.accent,
    fontSize: 14,
  },
  tagText: {
    fontSize: 12,
    color: C.inkDim,
  },
  rowAlign: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  agentList: {
    gap: 8,
  },
  agentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.cardHi,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
  },
  agentInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  statusCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  agentName: {
    fontSize: 14,
    fontWeight: "700",
    color: C.ink,
  },
  agentRole: {
    fontSize: 11,
    color: C.inkDim,
  },
  agentRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  idleTag: {
    fontSize: 12,
    fontWeight: "600",
  },
  agentStatusText: {
    fontSize: 10,
    color: C.inkDim,
    textTransform: "uppercase",
  },
  emptyText: {
    fontSize: 13,
    color: C.inkDim,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 12,
  },
  leadTimeHighlightRow: {
    flexDirection: "row",
    gap: 8,
  },
  leadTimeHighlightBox: {
    flex: 1,
    backgroundColor: C.cardHi,
    borderRadius: 12,
    padding: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: C.line,
  },
  leadTimeLabel: {
    fontSize: 11,
    color: C.inkDim,
  },
  leadTimeValue: {
    fontSize: 15,
    fontWeight: "800",
    color: C.ink,
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: C.inkDim,
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
    width: 60,
    fontSize: 12,
    color: C.inkDim,
  },
  bucketBarOuter: {
    flex: 1,
    height: 8,
    backgroundColor: C.cardHi,
    borderRadius: 4,
    overflow: "hidden",
  },
  bucketBarInner: {
    height: "100%",
    backgroundColor: C.accent,
    borderRadius: 4,
  },
  bucketCount: {
    width: 80,
    fontSize: 11,
    color: C.ink,
    textAlign: "right",
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
    fontWeight: "700",
  },
  timelineBar: {
    width: 14,
    height: 60,
    backgroundColor: C.cardHi,
    borderRadius: 6,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  timelineBarFill: {
    width: "100%",
    backgroundColor: C.accent,
    borderRadius: 6,
  },
  timelineDate: {
    fontSize: 10,
    color: C.inkDim,
  },
  link: {
    color: C.accent,
    fontWeight: "600",
    fontSize: 14,
  },
  muted: {
    color: C.inkDim,
    fontSize: 13,
  },
  errorText: {
    color: C.danger,
    fontSize: 14,
    textAlign: "center",
  },
  btn: {
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  btnText: {
    color: "#06202B",
    fontWeight: "800",
    fontSize: 14,
  },
});
