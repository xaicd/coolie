import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ProjectWbsView, MilestoneStatus } from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { RADIUS, SPACING } from "../ui/tokens";

/**
 * 里程碑主线 (wave140) —— 项目 CMMI WBS 的阶段时间线。
 *
 * 读服务端派生的主线 (`GET …/wbs`), 展示待采纳的 WBS 草案 (一键采纳/忽略),
 * 每个阶段的收口里程碑状态, 以及门禁联动: 上游里程碑未达成时, 后续阶段任务
 * 被标为受阻。
 */

const STATUS_LABEL: Record<MilestoneStatus, string> = {
  not_started: "未开始",
  in_progress: "进行中",
  achieved: "已达成",
  blocked: "阻塞",
};

function statusColor(status: MilestoneStatus): string {
  switch (status) {
    case "achieved":
      return C.ok;
    case "in_progress":
      return C.accent;
    case "blocked":
      return C.err;
    default:
      return C.ink3;
  }
}

export function ProjectMilestones({
  companyId,
  projectId,
  onChanged,
}: {
  companyId: string;
  projectId: string;
  onChanged?: () => void;
}) {
  const [wbs, setWbs] = useState<ProjectWbsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWbs(await coolie.getProjectWbs(companyId, projectId));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [companyId, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const adopt = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await coolie.adoptProjectWbsDraft(companyId, projectId);
      await load();
      onChanged?.();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, projectId, load, onChanged]);

  const dismiss = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await coolie.dismissProjectWbsDraft(companyId, projectId);
      await load();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, projectId, load]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={C.accent} />
        <Text style={styles.muted}>加载里程碑主线…</Text>
      </View>
    );
  }

  if (error && !wbs) {
    return <Text style={styles.error}>{error}</Text>;
  }
  if (!wbs) return null;

  const blocked = Object.entries(wbs.gateStates).filter(([, state]) => state.blocked);

  return (
    <View style={styles.block}>
      <View style={styles.headerRow}>
        <Ionicons name="flag" size={13} color={C.accent} />
        <Text style={styles.title}>里程碑主线</Text>
        <Text style={styles.progress}>
          门禁 {wbs.mainline.achievedGates}/{wbs.mainline.totalGates}
        </Text>
      </View>

      {wbs.draft ? (
        <View style={styles.draftCard}>
          <Text style={styles.draftTitle}>CMMI WBS 草案（待确认）</Text>
          <Text style={styles.muted}>
            来源 {wbs.draft.source ?? "文档解析"} · 共 {wbs.draft.items.length} 项
          </Text>
          <View style={styles.draftActions}>
            <Pressable
              style={[styles.actionPrimary, busy && styles.actionDisabled]}
              onPress={() => void adopt()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="采纳 WBS 草案"
            >
              <Text style={styles.actionPrimaryText}>一键采纳</Text>
            </Pressable>
            <Pressable
              style={[styles.actionSecondary, busy && styles.actionDisabled]}
              onPress={() => void dismiss()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="忽略 WBS 草案"
            >
              <Text style={styles.actionSecondaryText}>忽略</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.phaseList}>
        {wbs.mainline.phases.map((phase) => {
          const status = phase.milestone?.status ?? "not_started";
          return (
            <View key={phase.key} style={styles.phaseRow}>
              <View style={styles.phaseMain}>
                <Text style={styles.phaseName}>{phase.name}</Text>
                {phase.gate ? <Text style={styles.phaseGate}>{phase.gate}</Text> : null}
              </View>
              <View style={[styles.statusPill, { borderColor: statusColor(status) }]}>
                <Text style={[styles.statusText, { color: statusColor(status) }]}>
                  {phase.milestone ? STATUS_LABEL[status] : "未采纳"}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {blocked.length > 0 ? (
        <Text style={styles.blockedWarning}>
          {blocked.length} 个后续阶段任务因上游里程碑未达成而受阻
        </Text>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  title: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  progress: {
    color: C.ink3,
    fontSize: 11,
  },
  muted: {
    color: C.ink3,
    fontSize: 11,
  },
  error: {
    color: C.err,
    fontSize: 11,
  },
  draftCard: {
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  draftTitle: {
    color: C.ink,
    fontSize: 12,
    fontWeight: "600",
  },
  draftActions: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  actionPrimary: {
    backgroundColor: C.brand,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  actionPrimaryText: {
    color: C.ink,
    fontSize: 12,
    fontWeight: "600",
  },
  actionSecondary: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  actionSecondaryText: {
    color: C.ink2,
    fontSize: 12,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  phaseList: {
    gap: SPACING.xs,
  },
  phaseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  phaseMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    flex: 1,
  },
  phaseName: {
    color: C.ink2,
    fontSize: 12,
  },
  phaseGate: {
    color: C.ink4,
    fontSize: 10,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
  },
  blockedWarning: {
    color: C.err,
    fontSize: 11,
  },
});
