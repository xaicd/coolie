import { useCallback, useEffect, useState } from "react";
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
import { C, coolie, type AgentRow, type AgentCostRow } from "../coolie";
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

/** 员工详情浮层：改状态(启停)、改头衔、看 token 用量 */
function AgentDetailSheet({
  agent,
  cost,
  onClose,
  onChanged,
}: {
  agent: AgentRow;
  cost?: AgentCostRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(agent.title ?? "");
  const [busy, setBusy] = useState(false);

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
        </View>
      </View>
    </Modal>
  );
}

export function AgentsScreen({ company, onOpenSettings }: { company: { id: string; name: string }; onOpenSettings?: () => void }) {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [costs, setCosts] = useState<Record<string, AgentCostRow>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgentRow | null>(null);

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
          {agents.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyTitle}>还没有员工</Text>
              <Text style={styles.muted}>在控制台 Web 端创建智能体员工后，这里会展示。</Text>
            </View>
          ) : (
            agents.map((item) => (
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
          agent={selected}
          cost={costs[selected.id]}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            void load(true);
          }}
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
});
