import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

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

/** 员工详情浮层：改状态(启停)、改头衔、看 token 用量、看技能/配置、看最近任务 */
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
  const [title, setTitle] = useState(agent.title ?? "");
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

  const saveTitle = useCallback(async () => {
    setBusy(true);
    try {
      await coolie.updateAgent(agent.id, { title: title.trim() || null });
      onChanged();
    } catch (e) {
      Alert.alert("保存失败", String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [agent.id, title, onChanged]);

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingBottom: 16 }}
            style={{ maxHeight: 540 }}
          >
            <View style={styles.headRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{agent.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{agent.name}</Text>
                <Text style={styles.meta}>
                  {STATUS_LABEL[agent.status] ?? agent.status}
                  {agent.adapterType ? ` · ${agent.adapterType}` : ""}
                  {agent.role ? ` · ${agent.role}` : ""}
                </Text>
              </View>
              <StatusDot
                status={STATUS_DOT[agent.status] ?? "idle"}
                size={9}
                pulse={agent.status === "active"}
              />
            </View>

            {cost ? (
              <View style={styles.costCard}>
                <Text style={styles.costTitle}>Token 用量（累计）</Text>
                <View style={styles.costRow}>
                  <View style={styles.costCell}>
                    <Text style={styles.costNum}>{fmtTok(cost.inputTokens)}</Text>
                    <Text style={styles.costLabel}>输入</Text>
                  </View>
                  <View style={styles.costCell}>
                    <Text style={styles.costNum}>{fmtTok(cost.cachedInputTokens)}</Text>
                    <Text style={styles.costLabel}>缓存</Text>
                  </View>
                  <View style={styles.costCell}>
                    <Text style={styles.costNum}>{fmtTok(cost.outputTokens)}</Text>
                    <Text style={styles.costLabel}>输出</Text>
                  </View>
                  <View style={styles.costCell}>
                    <Text style={[styles.costNum, { color: C.accent }]}>
                      {cost.costCents > 0 ? `$${(cost.costCents / 100).toFixed(2)}` : "订阅"}
                    </Text>
                    <Text style={styles.costLabel}>计费</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* 配置 / 技能行 */}
            <View style={styles.infoCard}>
              <View style={styles.infoCardHeader}>
                <Text style={styles.sectionLabelNoMargin}>配置与技能</Text>
                {infoLoading && <ActivityIndicator size="small" color={C.accent} />}
              </View>

              {infoError ? (
                <View style={styles.errorInlineBox}>
                  <Text style={styles.errorInlineText}>配置加载失败: {infoError}</Text>
                  <Pressable style={styles.retryBtnSmall} onPress={() => void fetchAgentInfo()}>
                    <Text style={styles.retryBtnSmallText}>重试</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.infoCardBody}>
                  <View style={styles.infoPropRow}>
                    <Text style={styles.infoPropLabel}>适配器</Text>
                    <Text style={styles.infoPropValue}>
                      {config?.adapterType || agent.adapterType || "通用"}
                    </Text>
                  </View>
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
                <View style={styles.errorInlineBox}>
                  <Text style={styles.errorInlineText}>任务加载失败: {tasksError}</Text>
                  <Pressable style={styles.retryBtnSmall} onPress={() => void fetchRecentTasks()}>
                    <Text style={styles.retryBtnSmallText}>重试</Text>
                  </Pressable>
                </View>
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

            <Text style={styles.sectionLabel}>头衔 / 职责</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="如: 全栈工匠"
                placeholderTextColor={C.ink3}
                value={title}
                onChangeText={setTitle}
              />
              <Pressable
                style={[styles.saveBtn, busy && styles.btnDisabled]}
                disabled={busy}
                onPress={saveTitle}
              >
                <Text style={styles.saveBtnText}>保存</Text>
              </Pressable>
            </View>

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
        </View>
      </View>
    </Modal>
  );
}

export function AgentsScreen({
  company,
  onOpenSettings,
  onOpenIssue,
}: {
  company: { id: string; name: string };
  onOpenSettings?: () => void;
  onOpenIssue?: (issue: Issue) => void;
}) {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [costs, setCosts] = useState<Record<string, AgentCostRow>>({});
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
        const [rows, costRows] = await Promise.all([
          coolie.listAgents(company.id),
          coolie.costsByAgent(company.id).catch(() => [] as AgentCostRow[]),
        ]);
        setAgents(rows);
        const map: Record<string, AgentCostRow> = {};
        for (const cr of costRows) map[cr.agentId] = cr;
        setCosts(map);
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
          <View style={styles.filterBar}>
            <Pressable
              style={[styles.filterCapsule, filter === "all" && styles.filterCapsuleActive]}
              onPress={() => setFilter("all")}
            >
              <Text
                style={[
                  styles.filterCapsuleText,
                  filter === "all" && styles.filterCapsuleTextActive,
                ]}
              >
                全部 ({agents.length})
              </Text>
            </Pressable>
            <Pressable
              style={[styles.filterCapsule, filter === "online" && styles.filterCapsuleActive]}
              onPress={() => setFilter("online")}
            >
              <Text
                style={[
                  styles.filterCapsuleText,
                  filter === "online" && styles.filterCapsuleTextActive,
                ]}
              >
                在线 ({online})
              </Text>
            </Pressable>
            <Pressable
              style={[styles.filterCapsule, filter === "error" && styles.filterCapsuleActive]}
              onPress={() => setFilter("error")}
            >
              <Text
                style={[
                  styles.filterCapsuleText,
                  filter === "error" && styles.filterCapsuleTextActive,
                  errCount > 0 && { color: C.err },
                ]}
              >
                异常 ({errCount})
              </Text>
            </Pressable>
          </View>
        </View>
        {onOpenSettings ? (
          <Pressable onPress={onOpenSettings} hitSlop={12}>
            <Ionicons name="settings-outline" size={20} color={C.ink3} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 32 }} />
      ) : error ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyTitle}>员工列表加载失败</Text>
          <Text style={styles.muted}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryBtnText}>重试</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 10 }}
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
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyTitle}>
                {filter === "all" ? "还没有员工" : "暂无匹配员工"}
              </Text>
              <Text style={styles.muted}>
                {filter === "all"
                  ? "在控制台 Web 端创建智能体员工后，这里会展示。"
                  : "当前筛选分类下暂无对应状态的员工。"}
              </Text>
            </View>
          ) : (
            filteredAgents.map((item) => (
              <Pressable key={item.id} style={styles.card} onPress={() => setSelected(item)}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <StatusDot
                      status={STATUS_DOT[item.status] ?? "idle"}
                      size={7}
                      pulse={item.status === "active"}
                    />
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.title ? (
                      <Text style={styles.titleTag} numberOfLines={1}>
                        {item.title}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.meta} numberOfLines={1}>
                    {STATUS_LABEL[item.status] ?? item.status}
                    {item.adapterType ? ` · ${item.adapterType}` : ""}
                  </Text>
                  {costs[item.id] ? (
                    <Text style={styles.tokenMeta} numberOfLines={1}>
                      Tokens 入 {fmtTok(costs[item.id].inputTokens)} · 缓存{" "}
                      {fmtTok(costs[item.id].cachedInputTokens)} · 出 {fmtTok(costs[item.id].outputTokens)}
                      {costs[item.id].costCents > 0
                        ? ` · $${(costs[item.id].costCents / 100).toFixed(2)}`
                        : ""}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
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
  h1: { color: C.ink, fontSize: 22, fontWeight: "700", marginBottom: 8 },
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
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: C.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: C.accent, fontSize: 16, fontWeight: "700" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { color: C.ink, fontSize: 15, fontWeight: "600" },
  titleTag: { color: C.ink3, fontSize: 12, flexShrink: 1 },
  meta: { color: C.ink3, fontSize: 12, marginTop: 3 },
  tokenMeta: { color: C.ink4, fontSize: 11, marginTop: 2 },
  chevron: { color: C.ink4, fontSize: 22 },
  emptyCard: {
    alignItems: "center",
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 28,
    marginTop: 16,
  },
  emptyIcon: { fontSize: 34 },
  emptyTitle: { color: C.ink, fontSize: 16, fontWeight: "600" },
  muted: { color: C.ink3, fontSize: 13, textAlign: "center" },
  retryBtn: {
    marginTop: 8,
    backgroundColor: C.brand,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 22,
  },
  retryBtnText: { color: C.ink, fontSize: 13, fontWeight: "600" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 18,
    paddingBottom: 34,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.surfaceHover,
    marginBottom: 12,
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  costCard: { backgroundColor: C.surface, borderRadius: 12, padding: 14, marginBottom: 6 },
  costTitle: { color: C.ink2, fontSize: 12, marginBottom: 10 },
  costRow: { flexDirection: "row", gap: 8 },
  costCell: { flex: 1, alignItems: "center", gap: 3 },
  costNum: { color: C.ink, fontSize: 16, fontWeight: "700" },
  costLabel: { color: C.ink4, fontSize: 11 },
  sectionLabel: { color: C.ink3, fontSize: 12, marginTop: 12, marginBottom: 6 },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.ink,
    fontSize: 14,
  },
  saveBtn: { backgroundColor: C.brand, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  saveBtnText: { color: C.ink, fontSize: 13, fontWeight: "600" },
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
  btnDisabled: { opacity: 0.5 },
  filterBar: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  filterCapsule: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  filterCapsuleActive: {
    backgroundColor: "rgba(113, 112, 255, 0.15)",
    borderColor: "rgba(113, 112, 255, 0.4)",
  },
  filterCapsuleText: {
    fontSize: 12,
    color: C.ink3,
    fontWeight: "500",
  },
  filterCapsuleTextActive: {
    color: C.accent,
  },
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
  errorInlineBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.25)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  errorInlineText: {
    color: C.err,
    fontSize: 11,
    flex: 1,
  },
  retryBtnSmall: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  retryBtnSmallText: {
    color: C.err,
    fontSize: 11,
    fontWeight: "600",
  },
});
