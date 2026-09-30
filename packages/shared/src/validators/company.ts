import { z } from "zod";
import {
  COMPANY_STATUSES,
  ISSUE_THREAD_INTERACTION_RESOLVER_POLICIES,
} from "../constants.js";
import { objectWithoutDefaults } from "./partial.js";

const logoAssetIdSchema = z.string().guid().nullable().optional();
const feedbackDataSharingTermsVersionSchema = z.string().min(1).nullable().optional();

const interactionResolverKindGovernanceSchema = z.object({
  defaultPolicy: z.enum(ISSUE_THREAD_INTERACTION_RESOLVER_POLICIES).optional(),
  cap: z.enum(ISSUE_THREAD_INTERACTION_RESOLVER_POLICIES).optional(),
}).strict();

export const interactionResolverGovernanceSchema = z.object({
  suggest_tasks: interactionResolverKindGovernanceSchema.optional(),
  ask_user_questions: interactionResolverKindGovernanceSchema.optional(),
  request_confirmation: interactionResolverKindGovernanceSchema.optional(),
  request_checkbox_confirmation: interactionResolverKindGovernanceSchema.optional(),
  request_item_verdicts: interactionResolverKindGovernanceSchema.optional(),
}).strict().default({});

export const createCompanySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  budgetMonthlyCents: z.number().int().nonnegative().optional().default(0),
  defaultResponsibleUserId: z.string().min(1).nullable().optional(),
  // Coolie fork: the built-in company template to create from. Optional — a
  // request without it behaves exactly as before. The value is validated
  // against the template catalogue in the route, not here, so an unknown id
  // is a 422 rather than a generic body-validation error.
  templateId: z.string().min(1).nullable().optional(),
  // Coolie fork — wave226: free-form company facts surfaced to the operator
  // (max agent quota, branding hints, onboarding flag). Stored verbatim in
  // `companies.metadata` JSONB. The quota service reads `maxAgents` here.
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateCompany = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = objectWithoutDefaults(
  createCompanySchema
    .partial()
    .extend({
      status: z.enum(COMPANY_STATUSES).optional(),
      spentMonthlyCents: z.number().int().nonnegative().optional(),
      requireBoardApprovalForNewAgents: z.boolean().optional(),
      interactionResolverGovernance: interactionResolverGovernanceSchema.optional(),
      feedbackDataSharingEnabled: z.boolean().optional(),
      feedbackDataSharingConsentAt: z.coerce.date().nullable().optional(),
      feedbackDataSharingConsentByUserId: z.string().min(1).nullable().optional(),
      feedbackDataSharingTermsVersion: feedbackDataSharingTermsVersionSchema,
      logoAssetId: logoAssetIdSchema,
    }),
);

export type UpdateCompany = z.infer<typeof updateCompanySchema>;

export const updateCompanyBrandingSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    logoAssetId: logoAssetIdSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined
      || value.description !== undefined
      || value.logoAssetId !== undefined,
    "At least one branding field must be provided",
  );

export type UpdateCompanyBranding = z.infer<typeof updateCompanyBrandingSchema>;

/**
 * 公司级紧急熔断 (wave105) — boss 失控时刻的「救命按钮」。
 *
 * 语义: 把 companies.status 切换为 paused — heartbeat 派单 (heartbeat.ts:10394
 * / 11788) 已经守门 active, 熔断后所有派单、待跑 agent 立即停摆。后续 web/移动
 * 端的读 API 仍可访问, 不会把人锁在库外。
 *
 * reason 必填: 留痕到 activity_log 让审计能解释为什么停。reasonKind 区分
 * "manual" (老板手按) 和 "budget" / "compliance" 等系统触发 — 当前手动场景
 * 只用 manual, 但 schema 留口给自动化触发器复用 (例如预算烧到 120% 自动熔断)。
 */
export const emergencyStopSchema = z
  .object({
    reason: z.string().min(1).max(280),
    reasonKind: z.enum(["manual", "budget", "compliance", "anomaly"]).default("manual"),
  })
  .strict();

export type EmergencyStopPayload = z.infer<typeof emergencyStopSchema>;
