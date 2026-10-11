import type { AuditBaseColumns } from "./audit-base.js";

/** 纳税人信用等级（对齐 cr_enterprise_profile.tax_rating）。 */
export type TaxRating = "A" | "B" | "M" | "C" | "D";

/** 风险分级（对齐 cr_enterprise_profile.risk_level）。 */
export type RiskLevel = "LOW" | "NORMAL" | "HIGH";

/** 企业本体档案 DTO（隔离根实体）。 */
export interface EnterpriseProfileDto extends AuditBaseColumns {
  creditCode: string;
  enterpriseName: string;
  legalPerson: string;
  registeredCapital: number;
  industryCategory: string | null;
  taxRating: TaxRating;
  riskLevel: RiskLevel;
  metadata: Record<string, unknown>;
}

/** 新建企业档案请求 DTO（companyId 由网关注入，禁止客户端传入）。 */
export interface CreateEnterpriseRequest {
  creditCode: string;
  enterpriseName: string;
  legalPerson: string;
  registeredCapital: number;
  industryCategory?: string | null;
  metadata?: Record<string, unknown>;
}

export interface EnterpriseListQuery {
  keyword?: string;
  riskLevel?: RiskLevel;
  taxRating?: TaxRating;
  page?: number;
  pageSize?: number;
}
