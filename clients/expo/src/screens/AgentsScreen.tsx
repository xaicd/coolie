import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
  error: "异常",
  disabled: "停用",
};

const STATUS_DOT: Record<string, "ok" | "idle" | "err"> = {
  active: "ok",
  idle: "idle",
  error: "err",
  disabled: "idle",
};

export function AgentsScreen({ company }: { company: { id: string; name: string } }) {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [costs, setCosts] = useState<Record<string, AgentCostRow>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const rows = await coolie.request<AgentRow[]>(
          "GET",
          `/api/companies/${company.id}/agents`,
        );
        setAgents(rows);
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

  const online = agents.filter((a) => a.status === "active").length;
  const errCount = agents.filter((a) => a.status === "error").length;

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { paddingTop: styles.safeArea.paddingTop },
      ]}
    >
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
        <FlatList
          data={agents}
          keyExtractor={(a) => a.id}
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
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyTitle}>还没有员工</Text>
              <Text style={styles.muted}>在控制台 Web 端创建智能体员工后，这里会展示。</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <StatusDot status={STATUS_DOT[item.status] ?? "idle"} size={7} pulse={item.status === "active"} />
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
                    Tokens 入 {fmtTok(costs[item.id].inputTokens)} · 缓存 {fmtTok(costs[item.id].cachedInputTokens)} · 出 {fmtTok(costs[item.id].outputTokens)}
                    {costs[item.id].costCents > 0 ? ` · $${(costs[item.id].costCents / 100).toFixed(2)}` : ""}
                  </Text>
                ) : null}
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
    paddingTop: 0, // App.tsx 外层 SafeAreaView 已处理状态栏；此屏由外层包裹时置 0
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  h1: {
    color: C.ink,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
  },
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
  emptyCard: {
    alignItems: "center",
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 28,
    marginTop: 32,
    marginHorizontal: 16,
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
});
