import type { CompanyOnboardingResponse, OnboardingStepInput } from "@paperclipai/shared";
import { api } from "./client";

/**
 * Company onboarding client (wave155). Paths are relative to `/api`, matching
 * the server's `onboardingRoutes`.
 */
export const onboardingApi = {
  state: (companyId: string) =>
    api.get<CompanyOnboardingResponse>(
      `/companies/${encodeURIComponent(companyId)}/onboarding/state`,
    ),
  step: (companyId: string, input: OnboardingStepInput) =>
    api.post<CompanyOnboardingResponse>(
      `/companies/${encodeURIComponent(companyId)}/onboarding/step`,
      input,
    ),
  complete: (companyId: string) =>
    api.post<CompanyOnboardingResponse>(
      `/companies/${encodeURIComponent(companyId)}/onboarding/complete`,
      {},
    ),
};
