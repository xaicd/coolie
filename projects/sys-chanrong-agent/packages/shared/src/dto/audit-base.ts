/**
 * 八大审计底座列（REQ-BASE-002）。
 * 所有业务 DTO 强制继承本接口，缺一不可。
 */
export interface AuditBaseColumns {
  id: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  isDeleted: boolean;
  version: number;
}

export const AUDIT_BASE_COLUMNS = [
  "id",
  "companyId",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "isDeleted",
  "version",
] as const;

export type AuditBaseColumnName = (typeof AUDIT_BASE_COLUMNS)[number];
