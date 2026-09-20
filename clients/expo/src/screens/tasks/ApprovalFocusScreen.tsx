import { useCallback } from "react";
import { StyleSheet, Text } from "react-native";
import type { Approval } from "@coolie/api-client";
import { C, coolie } from "../../coolie";
import { useAsync } from "../../hooks/useAsync";
import { Surface } from "../../ui/Surface";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { LoadingState } from "../../ui/LoadingState";
import { ErrorRetry } from "../../ui/ErrorRetry";
import { QuickApprovalCard } from "../../components/QuickApprovalCard";
import { exportBoardEcho } from "../BoardChatScreen";

export interface ApprovalFocusScreenProps {
  companyId: string;
  approvalId: string;
  onBack: () => void;
}

function approvalLabel(approval: Approval): string {
  if (approval.title) return approval.title;
  const payload = approval.payload ?? {};
  if (typeof payload.title === "string" && payload.title) return payload.title;
  if (typeof payload.name === "string" && payload.name) return payload.name;
  return approval.type;
}

/**
 * 审批裁决页 (驾驶舱待审批卡单条点入)
 * 复用 QuickApprovalCard 就地裁决，并把结果/取消写入工坊聊天流。
 */
export function ApprovalFocusScreen({
  companyId,
  approvalId,
  onBack,
}: ApprovalFocusScreenProps) {
  const {
    data: approval,
    error,
    loading,
    refetch,
  } = useAsync(() => coolie.getApproval(approvalId), [approvalId]);

  const handleResolved = useCallback(
    (resolvedId: string, decision: "approve" | "reject") => {
      const label = approval ? approvalLabel(approval) : resolvedId.slice(0, 8);
      exportBoardEcho(
        decision === "approve"
          ? `✅ 审批已批准：${label}`
          : `⛔ 审批已驳回：${label}`,
      );
      onBack();
    },
    [approval, onBack],
  );

  const handleDismiss = useCallback(() => {
    exportBoardEcho("↩️ 已取消审批处理，该审批单仍待裁决。");
    onBack();
  }, [onBack]);

  return (
    <Surface>
      <ScreenHeader onBack={onBack} backLabel="返回驾驶舱" />

      <Text style={styles.detailTitle}>审批裁决</Text>

      {loading && !approval ? (
        <LoadingState style={styles.inlineLoader} />
      ) : error ? (
        <ErrorRetry
          variant="section"
          message={`⚠️ ${error}`}
          onRetry={() => void refetch()}
        />
      ) : approval ? (
        <>
          <QuickApprovalCard
            companyId={companyId}
            approval={approval}
            floating={false}
            onResolved={handleResolved}
            onDismiss={handleDismiss}
          />
          {approval.status !== "pending" ? (
            <Text style={styles.sectionEmptyText}>
              该审批单已处理完毕（当前状态: {approval.status}）。
            </Text>
          ) : null}
        </>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  detailTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: C.ink,
    letterSpacing: -0.4,
  },
  inlineLoader: {
    flex: 0,
    marginVertical: 24,
    paddingVertical: 0,
  },
  sectionEmptyText: {
    color: C.ink4,
    fontSize: 12,
    paddingVertical: 8,
  },
});
