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
import type { Issue } from "@coolie/api-client";
import {
  C,
  coolie,
  type InboxFeed,
  type InboxFailureItem,
  type InboxMentionItem,
} from "../coolie";
import { StatusDot } from "../components/StatusDot";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { Pill } from "../ui/Pill";
import { SegmentedControl } from "../ui/SegmentedControl";
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

const PRIORITY_LABEL: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "紧急",
};

const PRIORITY_DOT: Record<string, string> = {
  critical: C.err,
  high: C.warn,
  medium: C.ink3,
  low: C.ink4,
};

type InboxFilter = "all" | "approval" | "failure" | "mention";

/**
 * 收件箱：把「需要老板拍板的三类东西」收在一屏 —— 待审批、受阻任务、@我。
 *
 * 数据全部来自 `GET /api/inbox` 的公司级聚合；点任一行的任务/审批都会跳到
 * 对应详情。为了点进任务时详情屏能显示真实状态，这里并行拉一次任务列表做
 * id → issue 映射，命不中再退回聚合项里的最小字段。
 */
export function InboxScreen({
  company,
  onOpenIssue,
  onOpenApproval,
  onOpenSettings,
}: {
  company: { id: string; name: string };
  onOpenIssue: (issue: Issue) => void;
  onOpenApproval: (approvalId: string) => void;
  onOpenSettings?: () => void;
}) {
  const [feed, setFeed] = useState<InboxFeed | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<InboxFilter>("all");

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const [nextFeed, nextIssues] = await Promise.all([
          coolie.getInbox(company.id),
          coolie.listIssues(company.id, { limit: 50 }).catch(() => [] as Issue[]),
        ]);
        setFeed(nextFeed);
        setIssues(nextIssues);
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

  const issueById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of issues) map.set(issue.id, issue);
    return map;
  }, [issues]);

  const openIssue = useCallback(
    (id: string, title: string, status: string, priority: string) => {
      const known = issueById.get(id);
      if (known) {
        onOpenIssue(known);
        return;
      }
      onOpenIssue({ id, title, status, priority, companyId: company.id } as Issue);
    },
    [issueById, onOpenIssue, company.id],
  );

  const counts = {
    approval: feed?.pendingApprovals.length ?? 0,
    failure: feed?.failures.length ?? 0,
    mention: feed?.mentionedBy.length ?? 0,
  };

  const showApprovals = filter === "all" || filter === "approval";
  const showFailures = filter === "all" || filter === "failure";
  const showMentions = filter === "all" || filter === "mention";
  const empty =
    (showApprovals ? counts.approval : 0) +
      (showFailures ? counts.failure : 0) +
      (showMentions ? counts.mention : 0) ===
    0;

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0 },
      ]}
    >
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>收件箱</Text>
          <View style={styles.capsule}>
            <StatusDot status="ok" size={6} />
            <Text style={styles.capsuleText} numberOfLines={1}>
              {company.name}
            </Text>
            <Text style={styles.capsuleSub}>
              · 待审批 {counts.approval} · 受阻 {counts.failure} · @我 {counts.mention}
            </Text>
          </View>
          <SegmentedControl
            style={{ marginTop: 10 }}
            value={filter}
            onChange={(key) => setFilter(key as InboxFilter)}
            options={[
              { key: "all", label: "全部" },
              { key: "approval", label: `待审批 (${counts.approval})` },
              { key: "failure", label: `受阻 (${counts.failure})` },
              { key: "mention", label: `@我 (${counts.mention})` },
            ]}
          />
        </View>
        {onOpenSettings ? (
          <Pressable onPress={onOpenSettings} hitSlop={12}>
            <Ionicons name="settings-outline" size={20} color={C.ink3} />
          </Pressable>
        ) : null}
      </View>

      {loading && !feed ? (
        <LoadingState mode="spinner" size="small" style={styles.loader} />
      ) : error && !feed ? (
        <ErrorRetry
          variant="card"
          title="收件箱加载失败"
          message={error}
          onRetry={() => void load()}
          style={styles.errorCard}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
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
          {error ? (
            <ErrorRetry variant="inline" message={`刷新失败: ${error}`} onRetry={() => void load(true)} />
          ) : null}

          {empty ? (
            <EmptyState
              icon="📥"
              title="收件箱已清空"
              subtitle="没有待审批、受阻任务或 @你的消息。"
              style={styles.emptyBox}
            />
          ) : null}

          {showApprovals && counts.approval > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>待审批 ({counts.approval})</Text>
              {feed?.pendingApprovals.map((item) => (
                <AppCard key={item.id} variant="surface" row style={styles.row} onPress={() => onOpenApproval(item.id)}>
                  <View style={[styles.rowDot, { backgroundColor: C.warn }]} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {item.type} · {formatRelativeTime(item.createdAt)}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </AppCard>
              ))}
            </View>
          ) : null}

          {showFailures && counts.failure > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>受阻 / 异常 ({counts.failure})</Text>
              {feed?.failures.map((item: InboxFailureItem) => (
                <AppCard
                  key={item.id}
                  variant="surface"
                  row
                  style={styles.row}
                  onPress={() => openIssue(item.id, item.title, item.status, item.priority)}
                >
                  <View style={[styles.rowDot, { backgroundColor: C.err }]} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <View style={styles.metaRow}>
                      <Pill
                        label={STATUS_LABEL[item.status] ?? item.status}
                        dotColor={C.err}
                        mono
                        size="sm"
                      />
                      <Pill
                        label={PRIORITY_LABEL[item.priority] ?? item.priority}
                        dotColor={PRIORITY_DOT[item.priority] ?? C.ink3}
                        mono
                        size="sm"
                      />
                      <Text style={styles.rowMeta}>{formatRelativeTime(item.updatedAt)}</Text>
                    </View>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </AppCard>
              ))}
            </View>
          ) : null}

          {showMentions && counts.mention > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>@我 ({counts.mention})</Text>
              {feed?.mentionedBy.map((item: InboxMentionItem) => (
                <AppCard
                  key={item.id}
                  variant="surface"
                  style={styles.mentionCard}
                  onPress={() => openIssue(item.issueId, item.issueTitle, "todo", "medium")}
                >
                  <View style={styles.mentionHeader}>
                    <Text style={styles.mentionAuthor} numberOfLines={1}>
                      {item.authorName}
                    </Text>
                    <Text style={styles.rowMeta}>{formatRelativeTime(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.issueTitle}
                  </Text>
                  <Text style={styles.mentionBody} numberOfLines={2}>
                    {item.body}
                  </Text>
                </AppCard>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 },
  h1: { color: C.ink, fontSize: 22, fontWeight: "600", marginBottom: 8, letterSpacing: -0.4 },
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
  capsuleText: { color: C.ink2, fontSize: 12, maxWidth: 140 },
  capsuleSub: { color: C.ink3, fontSize: 12 },
  loader: { flex: 0, marginTop: 32, padding: 0 },
  errorCard: { marginTop: 16, backgroundColor: C.surface, borderRadius: 14, borderWidth: 0 },
  list: { padding: 16, paddingBottom: 32, gap: 16 },
  emptyBox: { marginTop: 8, backgroundColor: C.surface, borderRadius: 14, borderWidth: 0 },
  section: { gap: 8 },
  sectionTitle: { color: C.ink3, fontSize: 13, fontWeight: "500" },
  row: { gap: 10 },
  rowDot: { width: 8, height: 8, borderRadius: 4 },
  rowTitle: { color: C.ink, fontSize: 14, fontWeight: "500" },
  rowMeta: { color: C.ink4, fontSize: 11, fontVariant: ["tabular-nums"] },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  chevron: { color: C.ink4, fontSize: 20 },
  mentionCard: { gap: 6 },
  mentionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  mentionAuthor: { color: C.ok, fontSize: 12, fontWeight: "600", flex: 1 },
  mentionBody: { color: C.ink3, fontSize: 13, lineHeight: 18 },
});
