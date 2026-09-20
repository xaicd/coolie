import { StyleSheet, Text, View } from "react-native";
import { C } from "../../coolie";
import type { IssueComment } from "../../coolie";
import { formatTime } from "../../utils/format";

export interface CommentBubbleProps {
  comment: IssueComment;
}

/** 评论气泡: 掌柜在左描边品牌色, 员工/系统用绿色描边 */
export function CommentBubble({ comment }: CommentBubbleProps) {
  const isUser = Boolean(comment.authorUserId);
  const authorName = isUser
    ? "掌柜"
    : comment.authorAgentId
      ? `员工 ${comment.authorAgentId.slice(0, 8)}`
      : "系统";
  const timeStr = comment.createdAt ? formatTime(comment.createdAt) : "";

  return (
    <View
      style={[
        styles.commentBubble,
        isUser ? styles.commentBubbleUser : styles.commentBubbleAgent,
      ]}
    >
      <View style={styles.commentHeader}>
        <Text style={styles.commentAuthor}>{authorName}</Text>
        <Text style={styles.commentTime}>{timeStr}</Text>
      </View>
      <Text style={styles.commentBody}>{comment.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  commentBubble: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
    gap: 4,
  },
  commentBubbleUser: {
    backgroundColor: C.surface,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
  },
  commentBubbleAgent: {
    backgroundColor: C.panel,
    borderLeftWidth: 3,
    borderLeftColor: C.ok,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  commentAuthor: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "600",
  },
  commentTime: {
    color: C.ink4,
    fontSize: 10,
    fontVariant: ["tabular-nums"],
  },
  commentBody: {
    color: C.ink,
    fontSize: 13,
    lineHeight: 18,
  },
});
