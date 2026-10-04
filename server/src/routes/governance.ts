import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { governanceService } from "../services/governance.js";

export function governanceRoutes(db: Db) {
  const router = Router();
  const service = governanceService(db);

  /**
   * GET /api/companies/:companyId/governance/summary?projectId=...
   * 获取指定公司 (及可选指定项目) 的真实治理态势、门禁状态与真实关联工单
   */
  router.get("/companies/:companyId/governance/summary", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : null;

    try {
      const summary = await service.getSummary(companyId, projectId);
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to fetch governance summary" });
    }
  });

  /**
   * POST /api/companies/:companyId/governance/gates/:gateId/waiver
   * 发起门禁特批/放行真实会签申请，并轨原生 Approvals 控制流
   */
  router.post("/companies/:companyId/governance/gates/:gateId/waiver", async (req, res) => {
    const companyId = req.params.companyId as string;
    const gateId = req.params.gateId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);

    const { gateName, reason, projectId } = req.body;
    if (!reason || typeof reason !== "string") {
      res.status(400).json({ error: "特批放行理由为必填项 (reason is required)" });
      return;
    }

    try {
      const approval = await service.createWaiver(companyId, {
        gateId,
        gateName: gateName || gateId.toUpperCase(),
        reason,
        projectId: projectId ?? null,
        requestedByUserId: actor.actorType === "user" ? actor.actorId : "local-board",
      });
      res.status(201).json({
        ok: true,
        approvalId: approval.id,
        message: "特批放行申请已成功提交至系统审批中心 (Approvals)",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to submit waiver approval" });
    }
  });

  return router;
}
