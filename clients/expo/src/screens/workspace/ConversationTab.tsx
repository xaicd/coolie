/**
 * 对话 Tab —— 把驾驶舱问答流嵌进工作空间
 *
 * 就是 BoardChatScreen 的内容区, 只是把它的整屏外壳 (SafeAreaView + 顶部大标题)
 * 收掉, 换成 embedded 模式, 免得在 Modal 里再套一层全屏页头。
 * 不重写对话逻辑: 流式、审批气泡、构建卡全走原样。
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Company, Issue } from "@coolie/api-client";
import { C } from "../../coolie";
import { SPACING } from "../../ui/tokens";
import { BoardChatScreen } from "../BoardChatScreen";

export interface ConversationTabProps {
  company: Company;
  whoami?: string;
  onOpenIssue?: (issue: Issue) => void;
  onOpenApproval?: (approvalId: string) => void;
}

export function ConversationTab({
  company,
  whoami,
  onOpenIssue,
  onOpenApproval,
}: ConversationTabProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>嵌入模式 · 与「工坊」页共用同一条对话流</Text>
      </View>
      <BoardChatScreen
        company={company}
        whoami={whoami}
        embedded
        onOpenIssue={onOpenIssue}
        onOpenApproval={onOpenApproval}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: C.bg,
  },
  banner: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  bannerText: {
    color: C.ink4,
    fontSize: 10,
  },
});

export default ConversationTab;
