import { z } from "zod";
import { ISSUE_SPEC_KINDS } from "../constants.js";
import { multilineTextSchema } from "./text.js";

/**
 * Validators for the spec-driven development chain (wave147).
 *
 * `issueSpecSchema` is the contract the write path accepts: a kind plus the one
 * payload that kind names. `issueSpecDraftSchema` is the lenient half — every
 * field optional — so an editor can persist an in-progress spec without the
 * server refusing it for being incomplete.
 */

const BLOCK_MAX = 20_000;
const LINE_MAX = 2_000;
const FILE_MAX = 500;

const blockText = multilineTextSchema.pipe(z.string().trim().min(1).max(BLOCK_MAX));
const lineList = z.array(z.string().trim().min(1).max(LINE_MAX)).max(100);
const fileList = z.array(z.string().trim().min(1).max(FILE_MAX)).max(300);

export const issueSpecKindSchema = z.enum(ISSUE_SPEC_KINDS);

export const issueSpecRequirementSchema = z
  .object({
    body: blockText,
    acceptanceCriteria: lineList.optional().default([]),
  })
  .strict();

export const issueSpecBugfixSchema = z
  .object({
    reproSteps: blockText,
    expectedBehavior: blockText,
    actualBehavior: blockText,
  })
  .strict();

export const issueSpecDesignSchema = z
  .object({
    approach: blockText,
    tradeoffs: lineList.optional().default([]),
    apiSurface: multilineTextSchema
      .pipe(z.string().trim().max(BLOCK_MAX))
      .optional()
      .nullable()
      .default(null),
  })
  .strict();

export const issueSpecTaskSchema = z
  .object({
    files: fileList.optional().default([]),
    steps: lineList.optional().default([]),
  })
  .strict();

/** kind names the payload key it requires, so the check is one lookup. */
export const issueSpecSchema = z
  .object({
    kind: issueSpecKindSchema,
    parentSpecId: z.string().uuid().optional().nullable().default(null),
    requirement: issueSpecRequirementSchema.optional(),
    bugfix: issueSpecBugfixSchema.optional(),
    design: issueSpecDesignSchema.optional(),
    task: issueSpecTaskSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value[value.kind]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `spec.kind="${value.kind}" requires a "${value.kind}" payload`,
        path: [value.kind],
      });
    }
  });

export type IssueSpecInput = z.infer<typeof issueSpecSchema>;

/**
 * Lenient draft: an editor may hold a half-written spec. No payload is required
 * and each payload's own fields are optional, so a save never fails on shape.
 */
export const issueSpecDraftSchema = z
  .object({
    kind: issueSpecKindSchema.optional(),
    parentSpecId: z.string().uuid().optional().nullable(),
    requirement: issueSpecRequirementSchema.partial().optional(),
    bugfix: issueSpecBugfixSchema.partial().optional(),
    design: issueSpecDesignSchema.partial().optional(),
    task: issueSpecTaskSchema.partial().optional(),
  })
  .strict();

export type IssueSpecDraftInput = z.infer<typeof issueSpecDraftSchema>;

/** `POST /api/issues/:id/spec` — a full spec, or a partial draft when `draft`. */
export const saveIssueSpecSchema = z
  .object({
    spec: issueSpecSchema,
    draft: z.boolean().optional().default(false),
  })
  .strict();

export type SaveIssueSpecInput = z.infer<typeof saveIssueSpecSchema>;

/** `POST /api/companies/:companyId/specs/from-template`. */
export const createSpecFromTemplateSchema = z
  .object({
    kind: issueSpecKindSchema,
    templateName: issueSpecKindSchema.optional(),
    title: z.string().trim().min(1).max(300).optional(),
    description: multilineTextSchema.pipe(z.string().trim().max(BLOCK_MAX)).optional(),
    projectId: z.string().uuid().optional().nullable(),
    parentIssueId: z.string().uuid().optional().nullable(),
    assigneeAgentId: z.string().uuid().optional().nullable(),
  })
  .strict();

export type CreateSpecFromTemplateInput = z.infer<typeof createSpecFromTemplateSchema>;

/** `GET /api/companies/:companyId/specs/tree` query. */
export const specTreeQuerySchema = z
  .object({
    projectId: z.string().uuid().optional(),
  })
  .strict();
