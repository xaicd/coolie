import type { AuditBaseColumns } from "./audit-base.js";

/** 会签裁定结果（对齐 cr_approval_task.decision）。 */
export type ApprovalDecision = "PENDING" | "APPROVED" | "REJECTED";

/** 会签审批任务 DTO（人类双人复核门禁）。 */
export interface ApprovalTaskDto extends AuditBaseColumns {
  applicationId: string;
  approverId: string;
  decision: ApprovalDecision;
  decidedAt: string | null;
}

export interface DecideApprovalRequest {
  decision: Exclude<ApprovalDecision, "PENDING">;
  comment?: string | null;
}

/**
 * 双人会签守恒判定：需满足所需数量的不同审批人各自 APPROVED。
 */
export function isDualApprovalSatisfied(
  decisions: readonly ApprovalDecision[],
  requiredApprovers: number,
): boolean {
  return decisions.filter((decision) => decision === "APPROVED").length >= requiredApprovers;
}
