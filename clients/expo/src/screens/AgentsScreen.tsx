import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import type { Issue } from "@coolie/api-client";
import {
  C,
  coolie,
  type AgentRow,
  type AgentCostRow,
  type AgentSkillsSnapshot,
  type AgentConfiguration,
} from "../coolie";
import { StatusDot } from "../components/StatusDot";
import { AssetsAgentCard } from "../components/AssetsAgentCard";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Sheet } from "../ui/Sheet";
import { StatTile } from "../ui/StatTile";
import { KeyValueRow } from "../ui/KeyValueRow";
import { formatMoney, formatTokens } from "../utils/format";

const STATUS_LABEL: Record<string, string> = {
  active: "在线",
  idle: "空闲",
  paused: "已暂停",
  running: "运行中",
  error: "异常",
  pending_approval: "待审批",
  disabled: "停用",
};

const STATUS_DOT: Record<string, "ok" | "idle" | "err"> = {
  active: "ok",
  running: "ok",
  idle: "idle",
  paused: "idle",
  disabled: "idle",
  error: "err",
};

/** 员工详情浮层：改状态(启停)、看 token 用量、看技能/配置、看最近任务 */
function AgentDetailSheet({
  companyId,
  agent,
  cost,
  onClose,
  onChanged,
  onOpenIssue,
}: {
  companyId: string;
  agent: AgentRow;
  cost?: AgentCostRow;
  onClose: () => void;
  onChanged: () => void;
  onOpenIssue?: (issue: Issue) => void;
}) {
  const [busy, setBusy] = useState(false);

  const [skills, setSkills] = useState<AgentSkillsSnapshot | null>(null);
  const [config, setConfig] = useState<AgentConfiguration | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);
  const [infoError, setInfoError] = useState<string | null>(null);

  const [recentTasks, setRecentTasks] = useState<Issue[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const fetchAgentInfo = useCallback(async () => {
    setInfoLoading(true);
    setInfoError(null);
    try {
      const [skillsData, configData] = await Promise.all([
        coolie.getAgentSkills(agent.id).catch(() => ({}) as AgentSkillsSnapshot),
        coolie.getAgentConfiguration(agent.id).catch(() => ({}) as AgentConfiguration),
      ]);
      setSkills(skillsData);
      setConfig(configData);
    } catch (e) {
      setInfoError(String((e as Error)?.message ?? e));
    } finally {
      setInfoLoading(false);
    }
  }, [agent.id]);

  const fetchRecentTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError(null);
    try {
      const issues = await coolie.listIssues(companyId, { limit: 50 });
      const assigned = issues
        .filter(
          (i) =>
            (i as any).assigneeAgentId === agent.id ||
            (i as any).assignee?.id === agent.id,
        )
        .slice(0, 5);
      setRecentTasks(assigned);
    } catch (e) {
      setTasksError(String((e as Error)?.message ?? e));
    } finally {
      setTasksLoading(false);
    }
  }, [companyId, agent.id]);

  useEffect(() => {
    void fetchAgentInfo();
    void fetchRecentTasks();
  }, [fetchAgentInfo, fetchRecentTasks]);

  const skillNames = useMemo(() => {
    const list: string[] = [];
    if (skills?.skills && Array.isArray(skills.skills)) {
      for (const s of skills.skills) if (s.name || s.key) list.push(s.name || s.key);
    }
    if (skills?.desiredSkills && Array.isArray(skills.desiredSkills)) {
      list.push(...skills.desiredSkills);
    }
    if (skills?.entries && Array.isArray(skills.entries)) {
      for (const e of skills.entries) if (e.name || e.key) list.push(e.name || e.key);
    }
    return list.filter((v, i, a) => a.indexOf(v) === i);
  }, [skills]);

  const setStatus = useCallback(
    async (status: string) => {
      setBusy(true);
      try {
        await coolie.updateAgent(agent.id, { status });
        onChanged();
        if (status === "paused") Alert.alert("已暂停", `${agent.name} 已暂停，不再接新活。`);
      } catch (e) {
        Alert.alert("操作失败", String((e as Error)?.message ?? e));
      } finally {
        setBusy(false);
      }
    },
    [agent.id, agent.name, onChanged],
  );

  return (
    <Sheet onClose={onClose} maxHeight={540} contentStyle={{ gap: 0 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingBottom: 16 }}
        style={{ flexShrink: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{agent.name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={2}>{agent.name}</Text>
            {/* wave65 — boss 25:00 '工坊 5 角色员工 描述都去掉'.
                不再渲染 agent.title 长描述; 只显示状态 + 适配器 + 短角色标签.
                wave256 — 头部加 roleLabel(中文角色徽章文本), 详情卡更直观. */}
            <Text style={styles.meta}>
              {agent.roleLabel ? `${agent.roleLabel} · ` : ""}
              {STATUS_LABEL[agent.status] ?? agent.status}
              {agent.adapterType ? ` · ${agent.adapterType}` : ""}
            </Text>
          </View>
          <StatusDot
            status={STATUS_DOT[agent.status] ?? "idle"}
            size={9}
            pulse={agent.status === "active"}
          />
        </View>

        {cost ? (
          <AppCard variant="surface" style={{ marginBottom: 6 }}>
            <Text style={styles.costTitle}>Token 用量（累计）</Text>
            <View style={styles.costRow}>
              <StatTile value={formatTokens(cost.inputTokens)} label="输入" />
              <StatTile value={formatTokens(cost.cachedInputTokens)} label="缓存" />
              <StatTile value={formatTokens(cost.outputTokens)} label="输出" />
              <StatTile
                value={cost.costCents > 0 ? formatMoney(cost.costCents, "$") : "订阅"}
                label="计费"
                valueColor={C.accent}
              />
            </View>
          </AppCard>
        ) : null}

        {/* 配置 / 技能行 */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardHeader}>
            <Text style={styles.sectionLabelNoMargin}>配置与技能</Text>
            {infoLoading && <ActivityIndicator size="small" color={C.accent} />}
          </View>

          {/* wave256 — 完整职责列表 (卡片只展示 1 行, 详情展示全部).
              与下方「技能清单」分开渲染, 因为这两类信息维度不同:
                  职责 = 「他能干什么活」(人工理解层)
                  技能 = 「他会用什么工具」(技术能力层) */}
          {(agent.responsibilities?.length ?? 0) > 0 ? (
            <View style={styles.infoPropRow}>
              <Text style={[styles.infoPropLabel, { marginTop: 4 }]}>职责</Text>
              <View style={styles.skillsChipsWrap}>
                {agent.responsibilities!.map((r, idx) => (
                  <View key={idx} style={styles.skillChip}>
                    <Text style={styles.skillChipText}>{r}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {infoError ? (
            <ErrorRetry
              variant="inline"
              message={`配置加载失败: ${infoError}`}
              onRetry={() => void fetchAgentInfo()}
            />
          ) : (
            <View style={styles.infoCardBody}>
              <KeyValueRow
                layout="inline"
                label="适配器"
                value={config?.adapterType || agent.adapterType || "通用"}
              />
              {/* wave65 — boss 25:00 '工坊 5 角色员工 描述都去掉'.
                  不再渲染 agent.title 行; 适配器 + 心跳 + 技能 三行已足够. */}
              <View style={styles.infoPropRow}>
                <Text style={styles.infoPropLabel}>心跳状态</Text>
                <View style={styles.rowAlignCenter}>
                  <StatusDot status={STATUS_DOT[agent.status] ?? "idle"} size={6} />
                  <Text style={[styles.infoPropValue, { marginLeft: 6 }]}>
                    {STATUS_LABEL[agent.status] ?? agent.status}
                  </Text>
                </View>
              </View>
              <View style={[styles.infoPropRow, { alignItems: "flex-start" }]}>
                <Text style={[styles.infoPropLabel, { marginTop: 4 }]}>技能清单</Text>
                <View style={styles.skillsChipsWrap}>
                  {skillNames.length === 0 ? (
                    <Text style={styles.infoEmptyText}>未挂载额外技能</Text>
                  ) : (
                    skillNames.map((s, idx) => (
                      <View key={idx} style={styles.skillChip}>
                        <Text style={styles.skillChipText}>{s}</Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
            </View>
          )}

          {/* wave258 — 工具 (英文 cli 名, 跟中文 2 字 skill 拆开) */}
          {(agent.tools?.length ?? 0) > 0 ? (
            <View style={styles.infoPropRow}>
              <Text style={[styles.infoPropLabel, { marginTop: 4 }]}>工具</Text>
              <View style={styles.skillsChipsWrap}>
                {agent.tools!.map((t, idx) => (
                  <View key={idx} style={[styles.skillChip, styles.toolChip]}>
                    <Text style={[styles.skillChipText, styles.toolChipText]}>{t}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        {/* 最近分配任务 (最多5条，点击跳任务tab) */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardHeader}>
            <Text style={styles.sectionLabelNoMargin}>
              最近指派任务 {recentTasks.length > 0 ? `(${recentTasks.length})` : ""}
            </Text>
            {tasksLoading && <ActivityIndicator size="small" color={C.accent} />}
          </View>

          {tasksError ? (
            <ErrorRetry
              variant="inline"
              message={`任务加载失败: ${tasksError}`}
              onRetry={() => void fetchRecentTasks()}
            />
          ) : recentTasks.length === 0 ? (
            <Text style={styles.infoEmptyText}>暂无分配的任务</Text>
          ) : (
            <View style={styles.tasksListWrap}>
              {recentTasks.map((t) => (
                <Pressable
                  key={t.id}
                  style={styles.taskItemRow}
                  onPress={() => {
                    onClose();
                    onOpenIssue?.(t);
                  }}
                >
                  <StatusDot
                    status={t.status === "done" ? "ok" : t.status === "in_progress" ? "ok" : t.status === "blocked" ? "err" : "idle"}
                    size={6}
                  />
                  <Text style={styles.taskItemTitle} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <Text style={styles.taskItemChevron}>›</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* wave65 — boss 25:00 '工坊 5 角色员工 描述都去掉'.
            整段 '头衔 / 职责' 输入框 (title) 删除 — agents.title 不再展示/编辑. */}

        <Text style={styles.sectionLabel}>运行状态</Text>
        <View style={styles.statusRow}>
          {agent.status === "paused" || agent.status === "disabled" ? (
            <Pressable
              style={[styles.statusBtn, styles.statusActivate]}
              disabled={busy}
              onPress={() => void setStatus("active")}
            >
              <Ionicons name="play" size={16} color={C.done} />
              <Text style={[styles.statusBtnText, { color: C.done }]}>启用</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.statusBtn, styles.statusPause]}
              disabled={busy}
              onPress={() => void setStatus("paused")}
            >
              <Ionicons name="pause" size={16} color={C.warn} />
              <Text style={[styles.statusBtnText, { color: C.warn }]}>暂停</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.hint}>
          暂停后员工不再接新任务；当前: {STATUS_LABEL[agent.status] ?? agent.status}
        </Text>
      </ScrollView>
    </Sheet>
  );
}

export function AgentsScreen({
  company,
  onOpenIssue,
}: {
  company: { id: string; name: string };
  onOpenIssue?: (issue: Issue) => void;
}) {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [costs, setCosts] = useState<Record<string, AgentCostRow>>({});
  // wave256 — 每个 agent 已完成的任务数 (status=done), 卡片底部状态行显示.
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgentRow | null>(null);
  const [filter, setFilter] = useState<"all" | "online" | "error">("all");

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const [rows, costRows, allIssues] = await Promise.all([
          coolie.listAgents(company.id),
          coolie.costsByAgent(company.id).catch(() => [] as AgentCostRow[]),
          // wave256 — listIssues 一并拉, 然后按 assigneeAgentId 聚合.
          // 用 limit=200 是 wave65 dashboard 的口径 (超过 200 不显示「全部任务数」),
          // 卡片底部用 done 数做软指标, 不要求严格准确.
          coolie.listIssues(company.id, { limit: 200 }).catch(() => [] as Issue[]),
        ]);
        setAgents(rows);
        const costMap: Record<string, AgentCostRow> = {};
        for (const cr of costRows) costMap[cr.agentId] = cr;
        setCosts(costMap);

        // 聚合每个 agent 已完成的任务数 (assigneeAgentId === agent.id && status === done).
        const counts: Record<string, number> = {};
        for (const issue of allIssues) {
          if (issue.status !== "done") continue;
          const assignee =
            (issue as unknown as { assigneeAgentId?: string | null }).assigneeAgentId ??
            (issue as unknown as { assignee?: { id?: string } }).assignee?.id;
          if (!assignee) continue;
          counts[assignee] = (counts[assignee] ?? 0) + 1;
        }
        setTaskCounts(counts);
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

  const online = agents.filter((a) => a.status === "active" || a.status === "running").length;
  const errCount = agents.filter((a) => a.status === "error").length;

  const filteredAgents = agents.filter((a) => {
    if (filter === "online") return a.status === "active" || a.status === "running";
    if (filter === "error") return a.status === "error";
    return true;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>员工</Text>
          <View style={styles.capsule}>
            <StatusDot status="ok" size={6} />
            <Text style={styles.capsuleText} numberOfLines={1}>
              {company.name}
            </Text>
            <Text style={styles.capsuleSub}>
              · 共 {agents.length} 人 · 在线 {online}
              {errCount > 0 ? ` · 异常 ${errCount}` : ""}
            </Text>
          </View>

          {/* 列表头部员工筛选：全部/在线/异常 三个胶囊 */}
          <SegmentedControl
            style={{ marginTop: 10 }}
            value={filter}
            onChange={(key) => setFilter(key as "all" | "online" | "error")}
            options={[
              { key: "all", label: `全部 (${agents.length})` },
              { key: "online", label: `在线 (${online})` },
              { key: "error", label: `异常 (${errCount})`, color: errCount > 0 ? C.err : undefined },
            ]}
          />
        </View>
      </View>

      {loading ? (
        <LoadingState mode="spinner" size="small" style={{ flex: 0, marginTop: 32, padding: 0 }} />
      ) : error ? (
        <ErrorRetry
          variant="card"
          title="员工列表加载失败"
          message={error}
          onRetry={() => void load()}
          style={{ marginTop: 16, backgroundColor: C.surface, borderRadius: 14, borderWidth: 0 }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 10 }}
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
          {filteredAgents.length === 0 ? (
            <EmptyState
              icon="👥"
              title={filter === "all" ? "还没有员工" : "暂无匹配员工"}
              subtitle={
                filter === "all"
                  ? "在控制台 Web 端创建智能体员工后，这里会展示。"
                  : "当前筛选分类下暂无对应状态的员工。"
              }
              style={{ marginTop: 16, backgroundColor: C.surface, borderRadius: 14, borderWidth: 0 }}
            />
          ) : (
            filteredAgents.map((item) => (
              <AssetsAgentCard
                key={item.id}
                agent={item}
                cost={costs[item.id]}
                taskCount={taskCounts[item.id] ?? 0}
                onPress={() => setSelected(item)}
              />
            ))
          )}
        </ScrollView>
      )}

      {selected ? (
        <AgentDetailSheet
          companyId={company.id}
          agent={selected}
          cost={costs[selected.id]}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            void load(true);
          }}
          onOpenIssue={onOpenIssue}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  h1: { color: C.ink, fontSize: 22, fontWeight: "600", marginBottom: 8 },
  capsule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.surface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  capsuleText: { color: C.ink2, fontSize: 12 },
  capsuleSub: { color: C.ink3, fontSize: 12 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: C.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: C.accent, fontSize: 16, fontWeight: "600" },
  name: { color: C.ink, fontSize: 15, fontWeight: "600" },
  meta: { color: C.ink3, fontSize: 12, marginTop: 3 },
  costTitle: { color: C.ink2, fontSize: 12, marginBottom: 10 },
  costRow: { flexDirection: "row", gap: 8 },
  sectionLabel: { color: C.ink3, fontSize: 12, marginTop: 12, marginBottom: 6 },
  statusRow: { flexDirection: "row", gap: 10 },
  statusBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.surface,
    borderRadius: 10,
    paddingVertical: 12,
  },
  statusActivate: { borderWidth: 1, borderColor: C.done },
  statusPause: { borderWidth: 1, borderColor: C.warn },
  statusBtnText: { fontSize: 14, fontWeight: "600" },
  hint: { color: C.ink4, fontSize: 11, marginTop: 8 },
  infoCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  infoCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionLabelNoMargin: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "600",
  },
  infoCardBody: {
    gap: 8,
  },
  infoPropRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  infoPropLabel: {
    fontSize: 12,
    color: C.ink3,
  },
  infoPropValue: {
    fontSize: 12,
    color: C.ink,
    fontWeight: "500",
  },
  rowAlignCenter: {
    flexDirection: "row",
    alignItems: "center",
  },
  skillsChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    flex: 1,
    justifyContent: "flex-end",
  },
  skillChip: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: C.lineSubtle,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  skillChipText: {
    color: C.ink2,
    fontSize: 11,
  },
  // wave258 — 工具 chip 样式 (英文 cli, 等宽字体 + 浅边框)
  toolChip: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
  },
  toolChipText: {
    color: C.ink3,
    fontFamily: "monospace",
  },
  infoEmptyText: {
    fontSize: 12,
    color: C.ink4,
    fontStyle: "italic",
  },
  tasksListWrap: {
    gap: 6,
  },
  taskItemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  taskItemTitle: {
    flex: 1,
    fontSize: 13,
    color: C.ink,
  },
  taskItemChevron: {
    color: C.ink4,
    fontSize: 16,
  },
});
