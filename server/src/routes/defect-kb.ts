import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { badRequest } from "../errors.js";
import { DEFECT_PLAYBOOK_THRESHOLD, defectKbService } from "../services/defect-kb.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

/**
 * Coolie fork — wave152 (D): defect knowledge base read surface.
 *
 * Board-only and company-scoped. Returns the aggregate rows (fingerprint →
 * count → first/last seen → suggested playbook) so the defect detail page and a
 * KB page can show "this defect has been seen N times; a playbook exists".
 */

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  minCount: z.coerce.number().int().min(1).optional(),
});

export function defectKbRoutes(db: Db) {
  const router = Router();
  const svc = defectKbService(db);

  router.get("/companies/:companyId/defect-kb", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);

    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest("Invalid defect-kb query", parsed.error.issues);
    }

    const items = await svc.list(companyId, {
      limit: parsed.data.limit,
      minCount: parsed.data.minCount,
    });

    res.json({ playbookThreshold: DEFECT_PLAYBOOK_THRESHOLD, items });
  });

  return router;
}
