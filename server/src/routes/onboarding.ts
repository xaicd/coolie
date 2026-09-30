import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { onboardingStepSchema } from "@paperclipai/shared";
import { validate } from "../middleware/index.js";
import { onboardingService } from "../services/onboarding.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

/**
 * Company onboarding routes (wave155) — the 3-step first-run wizard's state.
 *
 *   GET  /api/companies/:companyId/onboarding/state
 *   POST /api/companies/:companyId/onboarding/step      { step, industry?, employees? }
 *   POST /api/companies/:companyId/onboarding/complete
 *
 * Company-scoped like every other company route: `assertCompanyAccess` runs
 * first, so a caller cannot read or advance another tenant's onboarding.
 *
 * The mutating endpoints (`/step` and `/complete`) also call `assertBoard`:
 * onboarding writes the company's industry + employee roster into
 * `companies.metadata`, which is the kind of organisation-level decision an
 * Agent API Key must not be able to make on its own. An agent calling either
 * endpoint now receives 403 from the shared authz gate, in line with the
 * wave156 audit remediation spec (FDA RBAC defence).
 *
 * This is distinct from `onboardingSeedRoutes`
 * (`POST /companies/:companyId/onboarding-seed`), which receives the
 * Cloud-pushed seed. These endpoints read and write the company's own local
 * progress.
 */
export function onboardingRoutes(db: Db) {
  const router = Router();
  const svc = onboardingService(db);

  router.get("/companies/:companyId/onboarding/state", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.getOnboardingState(companyId));
  });

  router.post(
    "/companies/:companyId/onboarding/step",
    validate(onboardingStepSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertBoard(req);
      res.json(await svc.updateOnboardingStep(companyId, req.body));
    },
  );

  router.post("/companies/:companyId/onboarding/complete", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    res.json(await svc.completeOnboarding(companyId));
  });

  return router;
}