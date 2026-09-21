import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import type { Issue } from "@coolie/api-client";
import {
  C,
  coolie,
  type SearchAgentResult,
  type SearchDocumentResult,
  type SearchResults,
  type SearchTaskResult,
} from "../coolie";
import { StatusDot } from "../components/StatusDot";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { ScreenHeader } from "../ui/ScreenHeader";
import { SectionHeader } from "../ui/SectionHeader";
import { formatRelativeTime } from "../utils/format";

const STATUS_LABEL: Record<string, string> = {
  backlog: "待办池",
  todo: "待处理",
  in_progress: "进行中",
  in_review: "评审中",
  blocked: "受阻",
  done: "已完成",
  cancelled: "已取消",
};

const DEBOUNCE_MS = 300;

/**
 * 全局搜索：一条输入框，实时跨 员工 / 任务 / 文档 三类结果。
 *
 * 输入去抖 300ms 才打服务端（`GET /api/search`），避免逐字符请求；点任一条
 * 结果跳到对应详情屏。
 */
export function SearchScreen({
  company,
  onOpenIssue,
  onOpenAgent,
  onBack,
}: {
  company: { id: string; name: string };
  onOpenIssue: (issue: Issue) => void;
  onOpenAgent: (agent: SearchAgentResult) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const handle = setTimeout(() => {
      void (async () => {
        try {
          const res = await coolie.search(company.id, q);
          if (!cancelled) {
            setResults(res);
            setError(null);
          }
        } catch (e) {
          if (!cancelled) setError(String((e as Error)?.message ?? e));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, company.id]);

  const openTask = useCallback(
    (task: SearchTaskResult) => {
      onOpenIssue({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        companyId: company.id,
      } as Issue);
    },
    [onOpenIssue, company.id],
  );

  const totalResults =
    (results?.agents.length ?? 0) + (results?.tasks.length ?? 0) + (results?.documents.length ?? 0);
  const hasQuery = query.trim().length > 0;

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0 },
      ]}
    >
      <StatusBar style="light" />
      <View style={styles.header}>
        <ScreenHeader title="全局搜索" onBack={onBack} backLabel="返回" />
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={C.ink3} />
          <TextInput
            style={styles.input}
            placeholder="搜员工 / 任务 / 文档…"
            placeholderTextColor={C.ink3}
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons name="close-circle" size={16} color={C.ink3} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {!hasQuery ? (
          <EmptyState
            icon="🔍"
            title="输入关键字开始搜索"
            subtitle="可搜智能体员工、任务标题与文档标题。"
            style={styles.emptyBox}
          />
        ) : error ? (
          <ErrorRetry variant="inline" message={`搜索失败: ${error}`} onRetry={() => setQuery(query)} />
        ) : loading && !results ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 24 }} />
        ) : totalResults === 0 ? (
          <EmptyState
            icon="🫙"
            title={`没有匹配「${query.trim()}」的结果`}
            subtitle="换个关键字试试。"
            style={styles.emptyBox}
          />
        ) : (
          <>
            {results && results.agents.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader title="员工" count={results.agents.length} />
                {results.agents.map((agent) => (
                  <AppCard
                    key={agent.id}
                    variant="surface"
                    row
                    style={styles.row}
                    onPress={() => onOpenAgent(agent)}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{agent.name.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {agent.name}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {agent.role} · {agent.status}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </AppCard>
                ))}
              </View>
            ) : null}

            {results && results.tasks.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader title="任务" count={results.tasks.length} />
                {results.tasks.map((task) => (
                  <AppCard
                    key={task.id}
                    variant="surface"
                    row
                    style={styles.row}
                    onPress={() => openTask(task)}
                  >
                    <StatusDot
                      status={task.status === "blocked" ? "err" : task.status === "done" ? "ok" : "idle"}
                      size={7}
                    />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {task.title}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {STATUS_LABEL[task.status] ?? task.status} · {formatRelativeTime(task.updatedAt)}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </AppCard>
                ))}
              </View>
            ) : null}

            {results && results.documents.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader title="文档" count={results.documents.length} />
                {results.documents.map((doc: SearchDocumentResult) => (
                  <AppCard key={doc.id} variant="surface" row style={styles.row}>
                    <Ionicons name="document-text-outline" size={16} color={C.ink3} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {doc.title}
                      </Text>
                      <Text style={styles.rowMeta}>{formatRelativeTime(doc.updatedAt)}</Text>
                    </View>
                  </AppCard>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 12 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  input: { flex: 1, paddingVertical: 10, fontSize: 15, color: C.ink },
  list: { padding: 16, paddingBottom: 32, gap: 16 },
  emptyBox: { marginTop: 24, backgroundColor: C.surface, borderRadius: 14, borderWidth: 0 },
  section: { gap: 8 },
  row: { gap: 10 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: C.accent, fontSize: 14, fontWeight: "600" },
  rowTitle: { color: C.ink, fontSize: 14, fontWeight: "500" },
  rowMeta: { color: C.ink4, fontSize: 11, fontVariant: ["tabular-nums"] },
  chevron: { color: C.ink4, fontSize: 20 },
});
