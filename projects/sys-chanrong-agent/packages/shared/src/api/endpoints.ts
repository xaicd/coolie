/**
 * 管理面 (Node) 与编排面 (Python) 的受控交互契约（REQ-BASE-006）。
 * 二者仅经 `/api/v1/chanrong/*` 通信，禁止编排面直连业务库。
 */
export const CHANRONG_API_PREFIX = "/api/v1/chanrong" as const;

/** 核心服务 (core 域：企业/授信/台账) 的只读与命令端点清单。 */
export const CHANRONG_ENDPOINTS = {
  enterprise: {
    list: `${CHANRONG_API_PREFIX}/enterprises`,
    detail: (id: string) => `${CHANRONG_API_PREFIX}/enterprises/${id}`,
  },
  invoice: {
    list: `${CHANRONG_API_PREFIX}/invoices`,
    verify: (id: string) => `${CHANRONG_API_PREFIX}/invoices/${id}/verify`,
  },
  creditApplication: {
    list: `${CHANRONG_API_PREFIX}/credit-applications`,
    detail: (id: string) => `${CHANRONG_API_PREFIX}/credit-applications/${id}`,
    submit: (id: string) => `${CHANRONG_API_PREFIX}/credit-applications/${id}/submit`,
    approve: (id: string) => `${CHANRONG_API_PREFIX}/credit-applications/${id}/approve`,
    reject: (id: string) => `${CHANRONG_API_PREFIX}/credit-applications/${id}/reject`,
    disburse: (id: string) => `${CHANRONG_API_PREFIX}/credit-applications/${id}/disburse`,
  },
  approvalTask: {
    pending: `${CHANRONG_API_PREFIX}/approval-tasks/pending`,
    decide: (id: string) => `${CHANRONG_API_PREFIX}/approval-tasks/${id}/decide`,
  },
  auditChain: {
    byEntity: (entityType: string, entityId: string) =>
      `${CHANRONG_API_PREFIX}/audit-chain?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
  },
} as const;
