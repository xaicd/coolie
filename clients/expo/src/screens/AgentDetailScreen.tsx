import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import type { Company, CompanyArtifact, Issue } from "@coolie/api-client";
import {
  C,
  coolie,
  type AgentConfiguration,
  type AgentRow,
  type AgentSkillsSnapshot,
  type HeartbeatRunRow,
} from "../coolie";
import { StatusDot } from "../components/StatusDot";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { KeyValueRow } from "../ui/KeyValueRow";
import { LoadingState } from "../ui/LoadingState";
import { ScreenHeader } from "../ui/ScreenHeader";
import { SectionHeader } from "../ui/SectionHeader";
import { formatRelativeTime } from "../utils/format";

const STATUS_LABEL: Record<string, string> = {
  active: "在线",
  running: "运行中",
  idle: "空闲",
  paused: "已暂停",
  error: "异常",
  pending_approval: "待审批",
  disabled: "停用",
};

const RUN_STATUS_LABEL: Record<string, string> = {
  succeeded: "成功",
  running: "运行",
  queued: "排队",
  failed: "失败",
  timed_out: "超时",
  cancelled: "取消",
};

function formatRunDuration(startStr?: string | null, endStr?: string | null): string | null {
  if (!startStr) return null;
  const start = new Date(startStr).getTime();
  const end = endStr ? new Date(endStr).getTime() : Date.now();
  if (isNaN(start) || isNaN(end)) return null;
  const sec = Math.max(0, Math.round((end - start) / 1000));
  if (sec < 60) return `${sec}秒`;
  const min = Math.floor(sec / 60);
  return `${min}分${sec % 60}秒`;
}

const STATUS_DOT: Record<string, "ok" | "idle" | "err"> = {
  active: "ok",
  running: "ok",
  idle: "idle",
  paused: "idle",
  disabled: "idle",
  error: "err",
};

function readModel(config: AgentConfiguration | null, agent: AgentRow): string {
  const cfg = config?.adapterConfig ?? {};
  const candidate = cfg["model"] ?? cfg["model_id"] ?? cfg["modelId"] ?? cfg["modelName"];
  if (typeof candidate === "string" && candidate) return candidate;
  return config?.adapterType || agent.adapterType || "未指定";
}

/** wave109 D12: 技能清单带描述 — chip 可点开下钻, 不再是纯文字墙。 */
function collectSkillEntries(
  skills: AgentSkillsSnapshot | null,
): Array<{ name: string; description?: string }> {
  const byName = new Map<string, { name: string; description?: string }>();
  if (Array.isArray(skills?.skills)) {
    for (const s of skills.skills) {
      if (s.name || s.key) byName.set(s.name || s.key, { name: s.name || s.key, description: s.description });
    }
  }
  if (Array.isArray(skills?.desiredSkills)) {
    for (const d of skills.desiredSkills) if (!byName.has(d)) byName.set(d, { name: d });
  }
  if (Array.isArray(skills?.entries)) {
    for (const e of skills.entries) {
      if (e.name || e.key) byName.set(e.name || e.key, { name: e.name || e.key, description: e.description });
    }
  }
  return Array.from(byName.values());
}

/**
 * 员工详情屏：头像 / 名称 / role / 模型 / 当前任务 / 最近产物 / 技能清单。
 *
 * 五个数据源并行加载（技能、配置、指派任务、公司产物、当前运行任务），任一失败
 * 只影响对应分区，不至于整屏报错。
 */
export function AgentDetailScreen({
  company,
  agent,
  onBack,
  onOpenIssue,
}: {
  company: Company;
  agent: AgentRow;
  onBack: () => void;
  onOpenIssue: (issue: Issue) => void;
}) {
  const [skills, setSkills] = useState<AgentSkillsSnapshot | null>(null);
  const [config, setConfig] = useState<AgentConfiguration | null>(null);
  const [assigned, setAssigned] = useState<Issue[]>([]);
  const [artifacts, setArtifacts] = useState<CompanyArtifact[]>([]);
  const [runs, setRuns] = useState<HeartbeatRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const [skillsData, configData, issues, artifactRes, runsData] = await Promise.all([
          coolie.getAgentSkills(agent.id).catch(() => null),
          coolie.getAgentConfiguration(agent.id).catch(() => null),
          coolie.listIssues(company.id, { limit: 50 }).catch(() => [] as Issue[]),
          coolie.listArtifacts(company.id, { limit: 50 }).catch(() => ({ artifacts: [] })),
          coolie.listHeartbeatRuns(company.id, agent.id, 5).catch(() => [] as HeartbeatRunRow[]),
        ]);
        setSkills(skillsData);
        setConfig(configData);
        setAssigned(
          issues.filter(
            (i) =>
              (i as Issue & { assigneeAgentId?: string | null }).assigneeAgentId === agent.id,
          ),
        );
        setArtifacts(artifactRes.artifacts.filter((a) => a.createdByAgent?.id === agent.id));
        setRuns(runsData);
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [agent.id, company.id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const skillEntries = useMemo(() => collectSkillEntries(skills), [skills]);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const currentTask = assigned.find((i) => i.status === "in_progress") ?? null;
  const recentTasks = assigned.slice(0, 5);
  const recentArtifacts = artifacts.slice(0, 5);
  const recentRuns = runs.slice(0, 5);

  if (loading && assigned.length === 0 && !config && !skills) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LoadingState text="正在加载员工详情…" />
      </SafeAreaView>
    );
  }

  if (error && !config && !skills) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorWrap}>
          <ErrorRetry variant="fullscreen" message={`加载失败: ${error}`} onRetry={() => void load()} />
          <Pressable onPress={onBack} style={styles.backLink}>
            <Text style={styles.backLinkText}>‹ 返回</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0 },
      ]}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
            tintColor={C.accent}
          />
        }
      >
        <ScreenHeader onBack={onBack} backLabel="返回" />

        <View style={styles.headRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{agent.name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.name}>{agent.name}</Text>
            <Text style={styles.headMeta}>
              {STATUS_LABEL[agent.status] ?? agent.status}
              {/* wave65 — boss 25:00 '工坊 5 角色员工 描述都去掉' — 不再渲染 title. */}
            </Text>
          </View>
          <StatusDot status={STATUS_DOT[agent.status] ?? "idle"} size={9} pulse={agent.status === "active"} />
        </View>

        <AppCard padding={16} style={styles.card}>
          <KeyValueRow label="角色 (role)" value={agent.role || "general"} />
          {/* wave65 — boss 25:00 '工坊 5 角色员工 描述都去掉' — 删除 '头衔' 行. */}
          <KeyValueRow label="适配器 / 模型" value={readModel(config, agent)} />
          <KeyValueRow label="运行状态" value={STATUS_LABEL[agent.status] ?? agent.status} />
        </AppCard>

        <View style={styles.section}>
          <SectionHeader title="当前任务" count={currentTask ? 1 : 0} />
          {currentTask ? (
            <AppCard variant="surface" row style={styles.row} onPress={() => onOpenIssue(currentTask)}>
              <StatusDot status="ok" size={8} pulse />
              <Text style={styles.rowTitle} numberOfLines={2}>
                {currentTask.title}
              </Text>
              <Text style={styles.chevron}>›</Text>
            </AppCard>
          ) : (
            <Text style={styles.emptyText}>当前没有进行中的任务</Text>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader title="执行态势" count={recentRuns.length} />
          {recentRuns.length === 0 ? (
            <Text style={styles.emptyText}>暂无执行记录</Text>
          ) : (
            recentRuns.map((run) => {
              const duration = formatRunDuration(run.startedAt, run.finishedAt);
              const model = run.usageJson?.model || "默认模型";
              const tokens =
                run.usageJson?.totalTokens ||
                (Number(run.usageJson?.inputTokens || 0) + Number(run.usageJson?.outputTokens || 0));
              const cost = run.usageJson?.costUsd
                ? `$${Number(run.usageJson.costUsd).toFixed(4)}`
                : null;
              const summary =
                typeof run.resultJson?.summary === "string" && run.resultJson.summary.trim()
                  ? run.resultJson.summary.trim().split("\n")[0]
                  : (run.error || `${run.invocationSource || "自动"} 运行`);
              const isOk = run.status === "succeeded";
              const isErr = run.status === "failed" || run.status === "timed_out" || run.status === "cancelled";

              return (
                <AppCard key={run.id} variant="surface" row style={styles.row}>
                  <StatusDot
                    status={isOk ? "ok" : isErr ? "err" : "idle"}
                    size={7}
                    pulse={run.status === "running"}
                  />
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {summary}
                      </Text>
                      <View style={[styles.runTag, isOk ? styles.runTagOk : isErr ? styles.runTagErr : styles.runTagIdle]}>
                        <Text style={[styles.runTagText, isOk ? styles.runTagTextOk : isErr ? styles.runTagTextErr : styles.runTagTextIdle]}>
                          {RUN_STATUS_LABEL[run.status] ?? "完成"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.rowMeta}>
                      {model}{duration ? ` · ${duration}` : ""}{tokens > 0 ? ` · ${tokens.toLocaleString()} tokens` : ""}{cost ? ` · ${cost}` : ""} · {formatRelativeTime(run.createdAt)}
                    </Text>
                  </View>
                </AppCard>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader title="最近任务" count={recentTasks.length} />
          {recentTasks.length === 0 ? (
            <Text style={styles.emptyText}>暂无指派任务</Text>
          ) : (
            recentTasks.map((task) => (
              <AppCard key={task.id} variant="surface" row style={styles.row} onPress={() => onOpenIssue(task)}>
                <StatusDot
                  status={task.status === "blocked" ? "err" : task.status === "done" ? "ok" : "idle"}
                  size={7}
                />
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {task.title}
                </Text>
                <Text style={styles.chevron}>›</Text>
              </AppCard>
            ))
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader title="最近产物" count={recentArtifacts.length} />
          {recentArtifacts.length === 0 ? (
            <Text style={styles.emptyText}>暂无产物</Text>
          ) : (
            recentArtifacts.map((artifact) => (
              <AppCard key={artifact.id} variant="surface" row style={styles.row}>
                <Ionicons name="cube-outline" size={16} color={C.accent} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {artifact.title}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {artifact.mediaKind} · {formatRelativeTime(artifact.updatedAt)}
                  </Text>
                </View>
              </AppCard>
            ))
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader title="技能清单 (点击查看职责)" count={skillEntries.length} />
          {skillEntries.length === 0 ? (
            <Text style={styles.emptyText}>未挂载额外技能</Text>
          ) : (
            <View style={styles.chips}>
              {skillEntries.map((skill, idx) => (
                <Pressable
                  key={`${skill.name}-${idx}`}
                  style={[styles.chip, expandedSkill === skill.name && styles.chipActive]}
                  onPress={() =>
                    setExpandedSkill(expandedSkill === skill.name ? null : skill.name)
                  }
                >
                  <Text style={[styles.chipText, expandedSkill === skill.name && styles.chipTextActive]}>
                    {skill.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {(() => {
            const active = skillEntries.find((s) => s.name === expandedSkill);
            if (!active) return null;
            return (
              <View style={styles.skillDetailBox}>
                <Text style={styles.skillDetailName}>{active.name}</Text>
                <Text style={styles.skillDetailDesc}>
                  {active.description || "该技能由适配器挂载, 无内置说明。详见公司技能库。"}
                </Text>
              </View>
            );
          })()}
        </View>

        {loading ? <ActivityIndicator color={C.accent} style={{ marginTop: 8 }} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  errorWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  backLink: { marginTop: 16 },
  backLinkText: { color: C.accent, fontSize: 13, fontWeight: "500" },
  headRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: C.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: C.ink, fontSize: 22, fontWeight: "600" },
  name: { color: C.ink, fontSize: 20, fontWeight: "600", letterSpacing: -0.3 },
  headMeta: { color: C.ink3, fontSize: 12 },
  card: { gap: 12 },
  section: { gap: 8 },
  row: { gap: 10 },
  rowTitle: { color: C.ink, fontSize: 14, fontWeight: "500", flex: 1 },
  rowMeta: { color: C.ink4, fontSize: 11, fontVariant: ["tabular-nums"] },
  chevron: { color: C.ink4, fontSize: 20 },
  emptyText: { color: C.ink4, fontSize: 12, fontStyle: "italic", paddingVertical: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chipActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
  },
  chipTextActive: {
    color: C.accent,
  },
  skillDetailBox: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    padding: 12,
    marginTop: 10,
  },
  skillDetailName: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },
  skillDetailDesc: {
    color: C.ink2,
    fontSize: 12,
    lineHeight: 18,
  },
  chip: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: C.lineSubtle,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: { color: C.ink2, fontSize: 11 },
  runTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  runTagOk: {
    backgroundColor: "rgba(39, 166, 68, 0.12)",
    borderColor: "rgba(39, 166, 68, 0.3)",
  },
  runTagErr: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  runTagIdle: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  runTagText: {
    fontSize: 10,
    fontWeight: "600",
  },
  runTagTextOk: { color: C.ok },
  runTagTextErr: { color: C.err },
  runTagTextIdle: { color: C.warn },
});
