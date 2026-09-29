import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { badRequest } from "../errors.js";
import { MAX_AUDIT_LIMIT, auditService } from "../services/audit.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

/**
 * Coolie fork — wave152: read surface for the governance audit trail.
 *
 * Board-only: an audit trail is an operator/governance view, so an agent key
 * (which is scoped to its own company and has its own action audit) is not the
 * audience here. Company access is still enforced, so a board member of company
 * A cannot read company B's trail.
 */

const auditQuerySchema = z.object({
  action: z.string().min(1).optional(),
  targetType: z.string().min(1).optional(),
  targetId: z.string().min(1).optional(),
  actorAgentId: z.string().guid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_AUDIT_LIMIT).optional(),
  cursor: z.string().min(1).optional(),
});

export function auditLogRoutes(db: Db) {
  const router = Router();
  const svc = auditService(db);

  router.get("/companies/:companyId/audit-log", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);

    const parsed = auditQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest("Invalid audit-log query", parsed.error.issues);
    }

    const result = await svc.list({ companyId, ...parsed.data });
    res.json(result);
  });

  return router;
}
