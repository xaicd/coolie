import type { AuditBaseColumns } from "./audit-base.js";

/**
 * 授信审批状态机状态（design.md §3）。
 * 智能体在 DRAFT 阶段仅可写 riskSummary（建议值），不得直接驱动状态迁移。
 */
export type CreditApplicationStatus =
  | "DRAFT"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "DISBURSED";

/** 产融授信申请与风控工单 DTO。 */
export interface CreditApplicationDto extends AuditBaseColumns {
  enterpriseId: string;
  applicationNo: string;
  appliedAmount: number;
  suggestedAmount: number | null;
  approvedAmount: number | null;
  loanTermMonths: number;
  status: CreditApplicationStatus;
  riskSummary: string | null;
}

/** 提交授信申请请求 DTO。 */
export interface SubmitCreditApplicationRequest {
  enterpriseId: string;
  appliedAmount: number;
  loanTermMonths: number;
  riskSummary?: string | null;
}

/** 合法状态迁移表（REQ-BASE-007：签字未齐禁止流转到放款）。 */
export const CREDIT_APPLICATION_TRANSITIONS: Readonly<
  Record<CreditApplicationStatus, readonly CreditApplicationStatus[]>
> = {
  DRAFT: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["DISBURSED"],
  REJECTED: [],
  DISBURSED: [],
};

/** 5,000,000 以上（>500 万）触发双人会签。 */
export const DUAL_APPROVAL_THRESHOLD = 5_000_000;
export const DUAL_APPROVAL_REQUIRED_APPROVERS = 2;

export function canTransitionCreditApplication(
  from: CreditApplicationStatus,
  to: CreditApplicationStatus,
): boolean {
  return CREDIT_APPLICATION_TRANSITIONS[from].includes(to);
}

export function requiresDualApproval(appliedAmount: number): boolean {
  return appliedAmount > DUAL_APPROVAL_THRESHOLD;
}
