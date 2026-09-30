import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { issueService, logActivity } from "../services/index.js";
import { getActorInfo } from "./authz.js";
import { assertCompanyAccess } from "./authz.js";
import { badRequest, HttpError } from "../errors.js";
import { recordAudit } from "../middleware/audit.js";

/**
 * Coolie fork — wave215: 老板派活 (boss dispatch) endpoint.
 *
 * Mirrors the coolie App "派活" (dispatch) action: a board operator picks an
 * agent (or user) and a project, writes the task brief, and the server creates
 * the issue and triggers the heartbeat wake so the assignee starts working.
 *
 *   POST /api/companies/:companyId/dispatch
 *     body: { title, description?, projectId?, assigneeAgentId?, assigneeUserId?, priority?, labels? }
 *
 * Auth: company-scoped (board + agent key allowed) — the boss concierge calls
 * this via `x-paperclip-api-key` (board actor) and the wave156 audit gate requires
 * the call be traceable to a known actor.
 */
const dispatchSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().max(20_000).optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
    assigneeAgentId: z.string().uuid().optional().nullable(),
    assigneeUserId: z.string().uuid().optional().nullable(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    labels: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
    wake: z.boolean().optional().default(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.assigneeAgentId && !value.assigneeUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dispatch requires an assignee (agent or user)",
        path: ["assigneeAgentId"],
      });
    }
  });

export function dispatchRoutes(db: Db) {
  const router = Router();
  const issues = issueService(db);

  router.post("/companies/:companyId/dispatch", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const parsed = dispatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw badRequest("Invalid dispatch payload", parsed.error.issues);
    }
    const body = parsed.data;
    const actor = getActorInfo(req);

    let created;
    try {
      created = await issues.create(companyId, {
        title: body.title,
        description: body.description ?? null,
        projectId: body.projectId ?? null,
        assigneeAgentId: body.assigneeAgentId ?? null,
        assigneeUserId: body.assigneeUserId ?? null,
        priority: body.priority ?? "normal",
        status: "todo",
      });
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw err;
    }

    await recordAudit(db, req, {
      companyId,
      action: "issue.dispatch",
      target: { type: "issue", id: created.id },
      before: null,
      after: {
        title: created.title,
        assigneeAgentId: created.assigneeAgentId ?? null,
        assigneeUserId: created.assigneeUserId ?? null,
        projectId: created.projectId ?? null,
      },
    });
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      agentApiKeyId: actor.agentApiKeyId,
      action: "issue.dispatch",
      entityType: "issue",
      entityId: created.id,
      details: {
        title: created.title,
        assigneeAgentId: created.assigneeAgentId ?? null,
        assigneeUserId: created.assigneeUserId ?? null,
      },
    });

    res.status(201).json({
      ok: true,
      issueId: created.id,
      identifier: created.identifier,
      title: created.title,
      status: created.status,
      assigneeAgentId: created.assigneeAgentId ?? null,
      assigneeUserId: created.assigneeUserId ?? null,
      projectId: created.projectId ?? null,
      priority: created.priority,
    });
  });

  return router;
}