import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  Issue,
  IssueWorkProduct,
  WorkspaceRuntimeService,
} from "@coolie/api-client";
import { C, coolie } from "../../coolie";
import { useAsync } from "../../hooks/useAsync";
import { Surface } from "../../ui/Surface";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { SectionHeader } from "../../ui/SectionHeader";
import { AppCard } from "../../ui/AppCard";
import { KeyValueRow } from "../../ui/KeyValueRow";
import { LoadingState } from "../../ui/LoadingState";
import { ErrorRetry } from "../../ui/ErrorRetry";
import { formatTokens } from "../../utils/format";
import { AttachmentRow } from "../../components/tasks/AttachmentRow";
import { CommentBubble } from "../../components/tasks/CommentBubble";
import {
  PRIORITY_DOT_COLOR,
  PRIORITY_LABEL,
  STATUS_DOT_COLOR,
  STATUS_LABEL,
} from "../../components/tasks/taskMeta";

export interface TaskDetailScreenProps {
  issue: Issue;
  onBack: () => void;
  onOpenDiff: (issue: Issue, workProduct?: IssueWorkProduct) => void;
  onOpenSandbox?: (
    url: string,
    service?: WorkspaceRuntimeService | null,
    workProduct?: IssueWorkProduct | null,
  ) => void;
}

/** 任务详情: 字段摘要 + Diff/沙箱入口 + 交付产物 + 附件 + 评论流 */
export function TaskDetailScreen({
  issue,
  onBack,
  onOpenDiff,
  onOpenSandbox,
}: TaskDetailScreenProps) {
  const workProductQuery = useAsync(
    () => coolie.listWorkProducts(issue.id),
    [issue.id],
  );
  const comments = useAsync(() => coolie.getIssueComments(issue.id), [issue.id]);
  const attachments = useAsync(
    () => coolie.getIssueAttachments(issue.id),
    [issue.id],
  );

  const workProducts = useMemo(
    () => workProductQuery.data ?? [],
    [workProductQuery.data],
  );
  const commentList = useMemo(() => comments.data ?? [], [comments.data]);
  const attachmentList = useMemo(
    () => attachments.data ?? [],
    [attachments.data],
  );

  const refetchComments = comments.refetch;
  const refetchAttachments = attachments.refetch;

  const [commentInput, setCommentInput] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const handleAddComment = useCallback(async () => {
    const text = commentInput.trim();
    if (!text || submittingComment) return;
    setSubmittingComment(true);
    try {
      await coolie.addIssueComment(issue.id, text);
      setCommentInput("");
      await refetchComments();
    } catch (e) {
      Alert.alert("评论发送失败", String((e as Error)?.message ?? e));
    } finally {
      setSubmittingComment(false);
    }
  }, [commentInput, issue.id, refetchComments, submittingComment]);

  const prototypeWp = workProducts.find(
    (item) => item.url || item.type === "prototype" || item.runtimeServiceId,
  );

  return (
    <Surface>
      <ScreenHeader onBack={onBack} backLabel="返回任务列表" />

      <Text style={styles.detailTitle}>{issue.title}</Text>

      <AppCard padding={16} style={styles.detailCard}>
        <KeyValueRow
          label="状态"
          value={STATUS_LABEL[issue.status] ?? issue.status}
          valueColor={STATUS_DOT_COLOR[issue.status] ?? C.ink}
        />
        <KeyValueRow
          label="优先级"
          value={PRIORITY_LABEL[issue.priority] ?? issue.priority}
          valueColor={PRIORITY_DOT_COLOR[issue.priority] ?? C.ink}
        />
        {issue.description ? (
          <KeyValueRow label="描述" value={issue.description} />
        ) : null}
        <KeyValueRow label="编号" value={issue.id} valueColor={C.ink3} mono />
        <IssueCostRow issueId={issue.id} />
      </AppCard>

      {/* 核心动作: 查看代码 Diff 与 打开原型沙箱 */}
      <View style={styles.rowGap}>
        <Pressable
          style={[styles.btnDiffAction, styles.btnFlex]}
          onPress={() => onOpenDiff(issue)}
        >
          <Text style={styles.btnDiffActionText}>🔍 代码 Diff</Text>
        </Pressable>
        {onOpenSandbox ? (
          <Pressable
            style={[
              styles.btnPrimary,
              styles.btnSandbox,
              !prototypeWp && styles.btnSandboxMuted,
            ]}
            onPress={() =>
              onOpenSandbox(prototypeWp?.url || "", null, prototypeWp || null)
            }
          >
            <Text style={styles.btnPrimaryText}>🎮 原型沙箱</Text>
          </Pressable>
        ) : null}
      </View>

      {/* 关联交付产物列表 */}
      {workProducts.length > 0 ? (
        <View style={styles.wpSection}>
          <SectionHeader title="关联交付产物" count={workProducts.length} />
          {workProducts.map((item) => {
            const hasPrototype = Boolean(
              item.url || item.type === "prototype" || item.runtimeServiceId,
            );
            return (
              <AppCard
                key={item.id}
                onPress={() => {
                  if (hasPrototype && onOpenSandbox) {
                    onOpenSandbox(item.url || "", null, item);
                  } else {
                    onOpenDiff(issue, item);
                  }
                }}
                row
                style={styles.cardBetween}
              >
                <View style={styles.wpMain}>
                  <Text style={styles.wpTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.wpType}>
                    类型: {item.type}{" "}
                    {item.executionWorkspaceId ? "· 关联工作区" : ""}
                  </Text>
                </View>
                <Text style={styles.wpLink}>
                  {hasPrototype ? "看原型 🎮 ›" : "看 Diff ›"}
                </Text>
              </AppCard>
            );
          })}
        </View>
      ) : null}
      {workProductQuery.loading ? (
        <ActivityIndicator color={C.accent} style={styles.wpLoader} />
      ) : null}

      {/* 任务附件列表 */}
      <View style={styles.detailSection}>
        <SectionHeader
          title="任务附件"
          count={attachmentList.length}
          onRefresh={() => void refetchAttachments()}
          refreshing={attachments.loading}
        />

        {attachments.loading && attachmentList.length === 0 ? (
          <LoadingState style={styles.sectionLoader} />
        ) : attachments.error ? (
          <ErrorRetry
            variant="section"
            message={`⚠️ ${attachments.error}`}
            onRetry={() => void refetchAttachments()}
          />
        ) : attachmentList.length === 0 ? (
          <Text style={styles.sectionEmptyText}>暂无附件</Text>
        ) : (
          attachmentList.map((attachment) => (
            <AttachmentRow key={attachment.id} attachment={attachment} />
          ))
        )}
      </View>

      {/* 评论流 */}
      <View style={styles.detailSection}>
        <SectionHeader
          title="评论流"
          count={commentList.length}
          onRefresh={() => void refetchComments()}
          refreshing={comments.loading}
        />

        {comments.loading && commentList.length === 0 ? (
          <LoadingState style={styles.sectionLoader} />
        ) : comments.error ? (
          <ErrorRetry
            variant="section"
            message={`⚠️ ${comments.error}`}
            onRetry={() => void refetchComments()}
          />
        ) : commentList.length === 0 ? (
          <Text style={styles.sectionEmptyText}>暂无跟进评论</Text>
        ) : (
          <View style={styles.commentsList}>
            {commentList.map((comment) => (
              <CommentBubble key={comment.id} comment={comment} />
            ))}
          </View>
        )}

        {/* 评论输入区域 */}
        <View style={styles.commentInputRow}>
          <TextInput
            style={styles.commentTextInput}
            placeholder="添加跟进评论…"
            placeholderTextColor={C.ink3}
            value={commentInput}
            onChangeText={setCommentInput}
            multiline
            editable={!submittingComment}
          />
          <Pressable
            style={[
              styles.commentSubmitBtn,
              (!commentInput.trim() || submittingComment) && styles.btnDisabled,
            ]}
            disabled={!commentInput.trim() || submittingComment}
            onPress={() => void handleAddComment()}
          >
            {submittingComment ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.commentSubmitBtnText}>发送</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Surface>
  );
}

function IssueCostRow({ issueId }: { issueId: string }) {
  // 取不到消耗就整行不显示 (与原实现一致), 所以这里只关心 data
  const { data: summary } = useAsync(
    () => coolie.issueCostSummary(issueId),
    [issueId],
  );

  if (!summary) return null;
  return (
    <KeyValueRow
      label="消耗"
      value={`tokens 入${formatTokens(summary.inputTokens)} 出${formatTokens(summary.outputTokens)} · 运行${summary.runCount}次${
        summary.costCents > 0 ? ` · $${(summary.costCents / 100).toFixed(2)}` : ""
      }`}
      valueColor={C.ink3}
    />
  );
}

const styles = StyleSheet.create({
  detailTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: C.ink,
    letterSpacing: -0.4,
  },
  detailCard: {
    gap: 12,
  },
  rowGap: {
    flexDirection: "row",
    gap: 8,
  },
  btnFlex: { flex: 1 },
  btnDiffAction: {
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    borderWidth: 1,
    borderColor: C.brand,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    marginTop: 4,
  },
  btnDiffActionText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: "500",
  },
  btnPrimary: {
    backgroundColor: C.brand,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSandbox: { flex: 1, paddingVertical: 12 },
  btnSandboxMuted: { backgroundColor: "rgba(94, 106, 210, 0.2)" },
  btnPrimaryText: {
    color: C.ink,
    fontWeight: "500",
    fontSize: 15,
  },
  btnDisabled: { opacity: 0.4 },
  cardBetween: {
    justifyContent: "space-between",
  },
  wpSection: {
    marginTop: 8,
    gap: 8,
  },
  wpMain: { flex: 1, gap: 2 },
  wpTitle: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "500",
  },
  wpType: {
    color: C.ink4,
    fontSize: 11,
  },
  wpLink: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "500",
    marginLeft: 8,
  },
  wpLoader: { marginTop: 8 },
  detailSection: {
    marginTop: 16,
    gap: 8,
  },
  sectionLoader: {
    flex: 0,
    marginVertical: 12,
    paddingVertical: 0,
  },
  sectionEmptyText: {
    color: C.ink4,
    fontSize: 12,
    paddingVertical: 8,
  },
  commentsList: {
    gap: 8,
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  commentTextInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: C.ink,
    fontSize: 13,
    maxHeight: 80,
  },
  commentSubmitBtn: {
    backgroundColor: C.brand,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  commentSubmitBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
});
