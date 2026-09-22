import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Company, Issue } from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { RADIUS, SPACING } from "../ui/tokens";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { ScreenHeader } from "../ui/ScreenHeader";
import { issueStatusColor, issueStatusLabel } from "../components/issue-status";

/**
 * Plan 列表 (任务页顶部 [📋 Plan] 的落地屏)。
 *
 * 服务端没有 plans 端点: wave19 起 plan 以 `Plan: xxx` 的任务承载
 * (见 BoardChatScreen.startPlan), 所以这里列的是这类任务, 点进去复用任务详情屏
 * (TaskDetailScreen) 看内容 —— 计划与任务同一套载体, 不另立一个详情模型。
 *
 * 真状态下没有 Approved/Pending/Rejected 的评审字段, 因此如实展示承载任务的状态,
 * 不假装有评审结论。
 */
export function PlansScreen({
  company,
  onBack,
  onOpenPlan,
}: {
  company: Company;
  onBack: () => void;
  onOpenPlan: (issue: Issue) => void;
}) {
  const [plans, setPlans] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlans(await coolie.listPlanIssues(company.id));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [company.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Plan"
        subtitle={
          <Text style={styles.subtitle} numberOfLines={1}>
            {company.name} · 计划任务
          </Text>
        }
        onBack={onBack}
        backLabel="任务"
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <LoadingState size="small" text="正在加载计划…" />
        ) : error ? (
          <ErrorRetry variant="section" message={`⚠️ ${error}`} onRetry={() => void load()} />
        ) : plans.length === 0 ? (
          <EmptyState
            icon="📋"
            title="暂无计划"
            subtitle="在工坊对话里说一句「plan 要做的事」即会建一条计划任务。"
          />
        ) : (
          plans.map((plan) => (
            <AppCard key={plan.id} onPress={() => onOpenPlan(plan)} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.name} numberOfLines={2}>
                  {plan.title}
                </Text>
                <View style={[styles.statusPill, { borderColor: issueStatusColor(plan.status) }]}>
                  <Text style={[styles.statusText, { color: issueStatusColor(plan.status) }]}>
                    {issueStatusLabel(plan.status)}
                  </Text>
                </View>
              </View>
              <Text style={styles.meta} numberOfLines={1}>
                #{plan.id.slice(0, 8)}
                {plan.identifier ? ` · ${plan.identifier}` : ""}
              </Text>
            </AppCard>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  subtitle: {
    color: C.ink4,
    fontSize: 12,
  },
  card: {
    gap: 6,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  name: {
    flex: 1,
    color: C.ink,
    fontSize: 15,
    fontWeight: "500",
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  meta: {
    color: C.ink4,
    fontSize: 11,
  },
});
