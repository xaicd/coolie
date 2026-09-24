import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import type { Issue, IssueWorkProduct } from "@coolie/api-client";
import {
  C,
  coolie,
  type AgentRow,
  type IssueComment,
} from "../coolie";
import { StatusDot } from "../components/StatusDot";
import { AppCard } from "../ui/AppCard";
import { ErrorRetry } from "../ui/ErrorRetry";
import { KeyValueRow } from "../ui/KeyValueRow";
import { LoadingState } from "../ui/LoadingState";
import { Pill } from "../ui/Pill";
import { ScreenHeader } from "../ui/ScreenHeader";
import { SectionHeader } from "../ui/SectionHeader";
import { formatDateTime, formatRelativeTime } from "../utils/format";

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

const STATUS_DOT: Record<string, string> = {
  backlog: C.ink3,
  todo: C.ink3,
  in_progress: C.accent,
  in_review: C.warn,
  blocked: C.err,
  done: C.ok,
  cancelled: C.ink4,
};

/**
 * 任务详情屏。
 *
 * 一屏交代清任务的全部上下文：标题 / 描述 / 状态 / 优先级 / 分配到的智能体，
 * 以及把每条评论当作时间线事件竖向铺开。底部评论框支持 @ 智能体 —— 点上方
 * 员工胶囊即把 `@名字 ` 追加进输入框，再发送。
 *
 * `issue` 只带最小字段，评论与员工名单各自从 API 拉；点 Diff / 沙箱按钮走
 * 上层注入的回调，与既有代码审查流保持一致。
 */
export function TaskDetailScreen({
  issue,
  onBack,
  onOpenSandbox,
}: {
  issue: Issue;
  company?: { id: string; name: string };
  onBack: () => void;
  onOpenSandbox?: (issue: Issue) => void;
}) {
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  // wave70 — git-ops PR 显示: 拉 work products, 抽出 type === "pull_request" 那条
  const [pullRequests, setPullRequests] = useState<IssueWorkProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadComments = useCallback(async () => {
    setError(null);
    try {
      setComments(await coolie.getIssueComments(issue.id));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  }, [issue.id]);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        await Promise.all([
          loadComments(),
          issue.companyId
            ? coolie.listAgents(issue.companyId).then(setAgents).catch(() => setAgents([]))
            : Promise.resolve(),
          // wave70 — 拉 work products, 抽出 pull_request 用于 PR 链接卡
          coolie
            .listWorkProducts(issue.id)
            .then((products) =>
              setPullRequests(products.filter((wp) => wp.type === "pull_request")),
            )
            .catch(() => setPullRequests([])),
        ]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadComments, issue.companyId, issue.id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of agents) map.set(agent.id, agent.name);
    return map;
  }, [agents]);

  const assigneeName = useMemo(() => {
    const id = (issue as Issue & { assigneeAgentId?: string | null }).assigneeAgentId;
    if (!id) return "未分配";
    return agentNameById.get(id) ?? `员工 ${id.slice(0, 6)}`;
  }, [issue, agentNameById]);

  const insertMention = useCallback((name: string) => {
    setInput((prev) => {
      const spacer = prev.length === 0 || prev.endsWith(" ") ? "" : " ";
      return `${prev}${spacer}@${name} `;
    });
  }, []);

  const submitComment = useCallback(async () => {
    const body = input.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      await coolie.addIssueComment(issue.id, body);
      setInput("");
      await loadComments();
    } catch (e) {
      Alert.alert("评论发送失败", String((e as Error)?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  }, [input, submitting, issue.id, loadComments]);

  if (loading && comments.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LoadingState text="正在加载任务详情…" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
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
          <ScreenHeader onBack={onBack} backLabel="返回任务列表" />

          <Text style={styles.title}>{issue.title}</Text>

          <View style={styles.metaRow}>
            <Pill
              label={STATUS_LABEL[issue.status] ?? issue.status}
              dotColor={STATUS_DOT[issue.status] ?? C.ink3}
              mono
            />
            <Pill
              label={PRIORITY_LABEL[issue.priority] ?? issue.priority}
              dotColor={PRIORITY_DOT[issue.priority] ?? C.ink3}
              mono
            />
          </View>

          <AppCard padding={16} style={styles.card}>
            <KeyValueRow label="分配智能体" value={assigneeName} />
            <KeyValueRow
              label="状态"
              value={STATUS_LABEL[issue.status] ?? issue.status}
              valueColor={STATUS_DOT[issue.status] ?? C.ink}
            />
            <KeyValueRow
              label="优先级"
              value={PRIORITY_LABEL[issue.priority] ?? issue.priority}
              valueColor={PRIORITY_DOT[issue.priority] ?? C.ink}
            />
            <KeyValueRow label="编号" value={issue.id} mono />
          </AppCard>

          {issue.description ? (
            <View style={styles.section}>
              <SectionHeader title="描述" />
              <AppCard padding={16} style={styles.descriptionCard}>
                <Text style={styles.description}>{issue.description}</Text>
              </AppCard>
            </View>
          ) : null}

          {/* wave70 — git-ops PR 显示: 列出本任务关联的 pull request */}
          {pullRequests.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader title="Pull Request" count={pullRequests.length} />
              <View style={{ gap: 8 }}>
                {pullRequests.map((pr) => (
                  <AppCard key={pr.id} padding={14}>
                    <View style={styles.prHeaderRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.prTitle} numberOfLines={1}>
                          {pr.title}
                        </Text>
                        <Text style={styles.prMeta} numberOfLines={1}>
                          {pr.provider} · {pr.status}
                        </Text>
                      </View>
                      {pr.url ? (
                        <Pressable
                          onPress={() => {
                            void Linking.openURL(pr.url!).catch(() =>
                              Alert.alert("无法打开 PR", "请在浏览器里查看。"),
                            );
                          }}
                          hitSlop={8}
                          style={styles.prBtn}
                          accessibilityLabel="查看 PR"
                        >
                          <Ionicons
                            name="open-outline"
                            size={14}
                            color={C.accent}
                          />
                          <Text style={styles.prBtnText}>查看 PR</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    {pr.url ? (
                      <Text style={styles.prUrl} numberOfLines={1}>
                        {pr.url}
                      </Text>
                    ) : null}
                  </AppCard>
                ))}
              </View>
            </View>
          ) : null}

          {onOpenSandbox ? (
            <View style={styles.actionRow}>
              <Pressable style={[styles.btnGhost, { flex: 1 }]} onPress={() => onOpenSandbox(issue)}>
                <Ionicons name="play-circle-outline" size={16} color={C.accent} />
                <Text style={styles.btnGhostText}>原型沙箱</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionHeader
              title="时间线 / 评论"
              count={comments.length}
              onRefresh={() => void loadComments()}
              refreshing={loading}
            />
            {error ? (
              <ErrorRetry variant="inline" message={`评论加载失败: ${error}`} onRetry={() => void loadComments()} />
            ) : comments.length === 0 ? (
              <Text style={styles.emptyText}>还没有评论，来说第一句。</Text>
            ) : (
              <View style={styles.timeline}>
                {comments.map((comment, index) => {
                  const isUser = Boolean(comment.authorUserId);
                  const author = comment.authorAgentId
                    ? agentNameById.get(comment.authorAgentId) ?? `员工 ${comment.authorAgentId.slice(0, 6)}`
                    : isUser
                      ? "掌柜"
                      : "系统";
                  const last = index === comments.length - 1;
                  return (
                    <View key={comment.id} style={styles.timelineRow}>
                      <View style={styles.timelineDotCol}>
                        <View
                          style={[
                            styles.timelineDot,
                            { backgroundColor: isUser ? C.accent : C.ok },
                          ]}
                        />
                        {!last ? <View style={styles.timelineLine} /> : null}
                      </View>
                      <View style={styles.commentBubble}>
                        <View style={styles.commentHeader}>
                          <Text style={styles.commentAuthor}>{author}</Text>
                          <Text style={styles.commentTime}>{formatRelativeTime(comment.createdAt)}</Text>
                        </View>
                        <Text style={styles.commentBody}>{comment.body}</Text>
                        <Text style={styles.commentStamp}>{formatDateTime(comment.createdAt)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <SectionHeader title="@ 智能体" hint="点名字插入评论框" />
            {agents.length === 0 ? (
              <Text style={styles.emptyText}>该公司暂无智能体</Text>
            ) : (
              <View style={styles.mentionChips}>
                {agents.map((agent) => (
                  <Pressable key={agent.id} style={styles.mentionChip} onPress={() => insertMention(agent.name)}>
                    <StatusDot
                      status={agent.status === "active" ? "ok" : agent.status === "error" ? "err" : "idle"}
                      size={5}
                    />
                    <Text style={styles.mentionChipText}>{agent.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="写评论，可用 @ 提及智能体…"
            placeholderTextColor={C.ink3}
            value={input}
            onChangeText={setInput}
            multiline
            editable={!submitting}
          />
          <Pressable
            style={[styles.sendBtn, (!input.trim() || submitting) && styles.btnDisabled]}
            disabled={!input.trim() || submitting}
            onPress={() => void submitComment()}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={C.ink} />
            ) : (
              <Text style={styles.sendBtnText}>发送</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 24, gap: 16 },
  title: { color: C.ink, fontSize: 20, fontWeight: "600", letterSpacing: -0.4 },
  metaRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  card: { gap: 12 },
  section: { gap: 8 },
  descriptionCard: { padding: 16 },
  description: { color: C.ink2, fontSize: 14, lineHeight: 20 },
  prHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  prTitle: { color: C.ink, fontSize: 14, fontWeight: "600" },
  prMeta: { color: C.ink3, fontSize: 11, marginTop: 2 },
  prUrl: { color: C.ink3, fontSize: 11, marginTop: 6, fontFamily: "monospace" },
  prBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.accent,
  },
  prBtnText: { color: C.accent, fontSize: 12, fontWeight: "500" },
  actionRow: { flexDirection: "row", gap: 8 },
  btnGhost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    borderColor: C.brand,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
  },
  btnGhostText: { color: C.accent, fontSize: 14, fontWeight: "500" },
  emptyText: { color: C.ink4, fontSize: 12, fontStyle: "italic", paddingVertical: 6 },
  timeline: { gap: 0 },
  timelineRow: { flexDirection: "row", gap: 10 },
  timelineDotCol: { alignItems: "center", width: 14 },
  timelineDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  timelineLine: { width: 1, flex: 1, backgroundColor: C.line, marginVertical: 2 },
  commentBubble: {
    flex: 1,
    gap: 4,
    backgroundColor: C.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
    padding: 10,
    marginBottom: 12,
  },
  commentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  commentAuthor: { color: C.ink2, fontSize: 12, fontWeight: "600" },
  commentTime: { color: C.ink4, fontSize: 10, fontVariant: ["tabular-nums"] },
  commentBody: { color: C.ink, fontSize: 13, lineHeight: 18 },
  commentStamp: { color: C.ink4, fontSize: 10, fontVariant: ["tabular-nums"] },
  mentionChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  mentionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  mentionChipText: { color: C.ink2, fontSize: 12 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
    backgroundColor: C.panel,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.ink,
    fontSize: 14,
  },
  sendBtn: {
    backgroundColor: C.brand,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnText: { color: C.ink, fontSize: 14, fontWeight: "600" },
  btnDisabled: { opacity: 0.4 },
});
