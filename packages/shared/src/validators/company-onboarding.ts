import { z } from "zod";
import { ONBOARDING_INDUSTRIES, ONBOARDING_STEP_COUNT } from "../types/company-onboarding.js";

/**
 * Validators for the company onboarding routes (wave155).
 *
 * The step number is bounded by the wizard's own length so a client cannot
 * advance past the end (or jump backwards past 1) by hand.
 */

export const onboardingStepSchema = z
  .object({
    step: z.coerce.number().int().min(1).max(ONBOARDING_STEP_COUNT),
    industry: z.enum(ONBOARDING_INDUSTRIES).optional(),
    employees: z.array(z.string().min(1)).max(50).optional(),
  })
  .strict();

export type OnboardingStepInput = z.infer<typeof onboardingStepSchema>;
