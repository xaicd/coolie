/**
 * @paperclipai/templates — Coolie 平台内置公司模板（WAVE 1 skeleton）。
 *
 * 仅导出模板描述符；第二波由 server/src/services/company-template.ts 接入
 * POST /api/companies。字段命名与 @paperclipai/shared 的 `Company` 保持一致，
 * 避免接入时契约漂移。
 */

/** Palantir 五角色 id。 */
export type CompanyTemplateRole = "fda" | "core-swe" | "pre-sre" | "fdse" | "ds";

/** 模板中一个角色的默认绑定（cli / 模型 / 角色 skill）。 */
export interface CompanyTemplateRoleBinding {
  role: CompanyTemplateRole;
  cli: string;
  model: string;
  skillRef: string;
}

/**
 * 建公司种子。与 Company 对齐：name / description 直接落库；
 * roles / workspaceSkeletonPath / submodules 供第二波 service 建 agent 与 workspace。
 */
export interface CompanyTemplateSeed {
  templateId: string;
  name: string;
  description: string | null;
  ownerUserId: string | null;
  memberUserIds: string[];
  roles: CompanyTemplateRoleBinding[];
  workspaceSkeletonPath: string | null;
  submodules: string[];
}
