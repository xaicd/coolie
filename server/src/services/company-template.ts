import {
  templateEmpty,
  templatePalantir5Role,
  templatePaperclipDefault,
  type CompanyTemplateRole,
  type CompanyTemplateRoleBinding,
  type CompanyTemplateSeed,
} from "@paperclipai/templates";
import { unprocessable } from "../errors.js";

/**
 * Coolie fork — wave70: boss 25:00 OOB 「5 角色描述都去掉」第 3 轮。
 *
 * 5 角色的 description 清空实际发生在 server/src/routes/agents.ts 的
 * `stripRoleDescription` (新注册时), 以及 packages/db/src/migrations/
 * 9003_clear_palantir_role_titles.sql (老 DB 一次性更新)。本文件负责
 * `CompanyTemplateSeed.description` (公司描述, 不是 5 角色) 的透传;
 * 那条由用户 wizard 输入, 不在此清洗范围内。
 */

/**
 * Coolie fork — company template catalogue.
 *
 * The built-in templates themselves live in `@paperclipai/templates` (pure data,
 * no server dependency) so the CLI, the UI and this service all read one list.
 * This service is the server-side view of that catalogue: it lists them for the
 * create wizard and resolves a requested `templateId` into a validated seed.
 *
 * `templatePalantir5Role` is the default: the 5 Palantir roles plus the company
 * workspace skeleton. `templatePaperclipDefault` keeps the historical
 * "name + owner only" behaviour, and `templateEmpty` is the bare minimum.
 */
const COMPANY_TEMPLATES: readonly CompanyTemplateSeed[] = [
  templatePalantir5Role,
  templatePaperclipDefault,
  templateEmpty,
];

/** The template used when a create request names none. */
export const DEFAULT_COMPANY_TEMPLATE_ID = templatePalantir5Role.templateId;

export function listCompanyTemplates(): readonly CompanyTemplateSeed[] {
  return COMPANY_TEMPLATES;
}

export function getCompanyTemplate(templateId: string): CompanyTemplateSeed | undefined {
  return COMPANY_TEMPLATES.find((template) => template.templateId === templateId);
}

/**
 * Resolve a requested template id to its seed.
 *
 * `null` / `undefined` (no template field in the request at all) resolves to the
 * palantir-5-role default, matching the one-key project script. An *unknown*
 * non-empty id is refused rather than silently downgraded, so a typo surfaces as
 * a 422 instead of a company quietly created without its roles.
 */
export function resolveCompanyTemplate(templateId: string | null | undefined): CompanyTemplateSeed {
  if (templateId === null || templateId === undefined || templateId === "") {
    return templatePalantir5Role;
  }
  const template = getCompanyTemplate(templateId);
  if (!template) {
    const known = COMPANY_TEMPLATES.map((entry) => entry.templateId).join(", ");
    throw unprocessable(`Unknown company template "${templateId}". Known templates: ${known}`);
  }
  return template;
}

/** The role bindings a template ships, in canonical order (empty for a bare template). */
export function templateRoleBindings(
  templateId: string | null | undefined,
): readonly CompanyTemplateRoleBinding[] {
  return resolveCompanyTemplate(templateId).roles;
}

/** The role ids a template ships, in canonical order. */
export function templateRoles(templateId: string | null | undefined): CompanyTemplateRole[] {
  return templateRoleBindings(templateId).map((binding) => binding.role);
}

/** A short, serialisable view of a template for `GET /api/companies/templates`. */
export function serializeCompanyTemplate(template: CompanyTemplateSeed) {
  return {
    templateId: template.templateId,
    name: template.name,
    description: template.description,
    roles: template.roles.map((binding) => binding.role),
    workspaceSkeletonPath: template.workspaceSkeletonPath,
    submodules: template.submodules,
  };
}

export type CompanyTemplateSummary = ReturnType<typeof serializeCompanyTemplate>;
