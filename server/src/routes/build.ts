import { Router } from "express";
import type { Db } from "@paperclipai/db";
import type { DeploymentMode } from "@paperclipai/shared";
import { badRequest } from "../errors.js";
import {
  createBuildPlanIssues,
  detectBuildTrigger,
  generateBuildPlan,
  type BuildActor,
} from "../services/build-orchestrator.js";
import type { IssueAssignmentWakeupDeps } from "../services/issue-assignment-wakeup.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

/**
 * Build mode routes.
 *
 * `POST /build/start` (mounted under `/api`) turns one "build <x>" ask from the
 * board room into a sequenced chain of issue cards. It mirrors the board-chat
 * relay's preconditions: the same deployment gate, because it also spawns the
 * operator's `hermes` CLI with request-supplied text, and the same company
 * scoping.
 */
export function buildRoutes(
  db: Db,
  opts: {
    deploymentMode: DeploymentMode;
    heartbeat?: IssueAssignmentWakeupDeps;
    apiUrl?: string;
  },
) {
  const router = Router();

  router.post("/build/start", async (req, res) => {
    if (
      opts.deploymentMode !== "local_trusted" &&
      opts.deploymentMode !== "authenticated"
    ) {
      res.status(403).json({
        error: "Build mode is only available on local single-operator instances",
        code: "DEPLOYMENT_MODE_UNSUPPORTED",
      });
      return;
    }

    const { companyId, prompt } = (req.body ?? {}) as {
      companyId?: string;
      prompt?: string;
    };

    if (!companyId || typeof companyId !== "string") {
      throw badRequest("companyId is required");
    }
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      throw badRequest("prompt is required");
    }

    assertCompanyAccess(req, companyId);
    assertBoard(req);

    if (!detectBuildTrigger(prompt)) {
      throw badRequest("prompt is not a build request", {
        code: "NOT_A_BUILD_TRIGGER",
      });
    }

    const { plan, source } = await generateBuildPlan({
      companyId,
      prompt: prompt.trim(),
      apiUrl: opts.apiUrl,
    });

    const actor = getActorInfo(req);
    const buildActor: BuildActor = {
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
    };

    const result = await createBuildPlanIssues(
      { db, heartbeat: opts.heartbeat },
      { companyId, prompt: prompt.trim(), plan, actor: buildActor },
    );

    res.status(201).json({
      buildId: result.buildId,
      plan: result.plan,
      planSource: source,
      unassignedAgentTypes: result.unassignedAgentTypes,
    });
  });

  return router;
}
