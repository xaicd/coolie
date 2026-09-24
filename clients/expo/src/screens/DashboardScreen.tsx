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
import { Ionicons } from "@expo/vector-icons";
import type { Company, DashboardSummary } from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { StatusDot } from "../components/StatusDot";
import { useOTA } from "../OTA";
import { AppCard } from "../ui/AppCard";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { ScreenHeader } from "../ui/ScreenHeader";
import { StatTile } from "../ui/StatTile";

function formatMoney(cents: number): string {
  const yuan = (cents / 100).toFixed(2);
  return `¥${Number(yuan).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface DashboardScreenProps {
  onOpenSettings?: () => void;
  company: Company;
  onBack?: () => void;
  onOpenApprovals?: () => void;
  onOpenApproval?: (approvalId: string) => void;
  onOpenProjects?: () => void;
}

/**
 * 仪表盘 (wave63 精简: 与 web Dashboard.tsx 同款 4 张 MetricCard)
 * - 已启用员工 = agents.active+running+paused+error
 * - 执行中任务 = tasks.inProgress
 * - 本月花费   = costs.monthSpendCents
 * - 待审批     = pendingApprovals + budgets.pendingApprovals
 */
export function DashboardScreen({
  company,
  onBack,
  onOpenSettings,
  onOpenApprovals,
  onOpenProjects,
}: DashboardScreenProps) {
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

  // 4 张核心 StatTile (与 web Dashboard.tsx MetricCard 同源同算)
  const enabledAgents =
    (data?.agents.active ?? 0) +
    (data?.agents.running ?? 0) +
    (data?.agents.paused ?? 0) +
    (data?.agents.error ?? 0);
  const tasksInProgress = data?.tasks.inProgress ?? 0;
  const monthSpendCents = data?.costs.monthSpendCents ?? 0;
  const pendingApprovals =
    (data?.pendingApprovals ?? 0) + (data?.budgets.pendingApprovals ?? 0);

  const pendingAccent =
    pendingApprovals > 0 ? C.err : C.ink;

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
              <StatusDot status="ok" size={6} />
              <Text style={styles.companyCapsuleText} numberOfLines={1}>
                {company.name}
              </Text>
              <Text style={styles.companyCapsuleTag}>核心统计</Text>
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

        {/* 4 张核心 StatTile (与 web Dashboard.tsx 同款) */}
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

        {/* 项目中心快捷入口卡片 */}
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
  projectCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    marginTop: 4,
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
});