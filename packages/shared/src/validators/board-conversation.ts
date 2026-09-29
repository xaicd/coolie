import { z } from "zod";

/**
 * Validators for workshop conversations (wave148).
 *
 * `createBoardConversationSchema` is the create contract; `updateBoardConversationSchema`
 * carries the rename (`title`) and the soft delete (`archived`).
 */

export const createBoardConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    projectId: z.string().uuid().nullable().optional(),
  })
  .strict();

export type CreateBoardConversationInput = z.infer<
  typeof createBoardConversationSchema
>;

export const updateBoardConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export type UpdateBoardConversationInput = z.infer<
  typeof updateBoardConversationSchema
>;
