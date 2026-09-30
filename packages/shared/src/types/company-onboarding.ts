/**
 * Company onboarding (wave155) — the 3-step first-run state a new company
 * carries.
 *
 * This is separate from `onboarding-seed` (the Cloud-pushed seed): the seed is
 * *content* written once by the platform; this is the board's own *progress*
 * through the 3-step wizard (pick industry → pick employees → run a demo), which
 * the customer drives and which survives across sessions.
 *
 * `CompanyOnboardingState.step` is the furthest step reached; a company with no
 * state (`onboarding_state` is null) has never onboarded and is forced to the
 * wizard. The field is optional-tolerant on read: an old row written by an
 * earlier shape still parses, because a missing step just reads as not-onboarded.
 */

/** The eight business scenarios step 1 offers. */
export const ONBOARDING_INDUSTRIES = [
  "文旅",
  "政务",
  "教育",
  "金融",
  "医疗",
  "制造",
  "零售",
  "通用",
] as const;
export type OnboardingIndustry = (typeof ONBOARDING_INDUSTRIES)[number];

export const ONBOARDING_STEP_COUNT = 3;

export interface CompanyOnboardingState {
  /** Furthest step reached: 1 (industry), 2 (employees), 3 (demo run). */
  step: number;
  industry?: OnboardingIndustry;
  /** Chosen employee role keys (the default six, plus any custom). */
  employees?: string[];
  /** The demo project the "run demo" step created, if it ran. */
  demoProjectId?: string | null;
  demoTaskIds?: string[];
  completedAt?: string | null;
}

export interface CompanyOnboardingResponse {
  companyId: string;
  /** Null until the company has taken at least one step. */
  state: CompanyOnboardingState | null;
  /** Convenience mirror of `state?.step ?? null` for the redirect gate. */
  onboardedStep: number | null;
  completed: boolean;
}
