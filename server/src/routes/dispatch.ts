import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, isNotNull, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issues as issuesTable } from "@paperclipai/db";
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

  /**
   * wave237: boss 派活历史列表 (20 条默认).
   *
   * "Dispatch" = an issue created via POST /dispatch above. Since the POST
   * path requires an assignee (agent OR user) per dispatchSchema, every
   * dispatched row has `assigneeAgentId OR assigneeUserId IS NOT NULL`.
   * We use that as the dispatch filter rather than a dedicated flag, so the
   * list keeps matching the schema contract even after future refactors.
   *
   *   GET /api/companies/:companyId/dispatch?limit=20
   *     → { generatedAt, items: [{ id, identifier, title, status, priority,
   *           assigneeAgentId, assigneeUserId, projectId, createdAt, updatedAt }] }
   *
   * Auth: company-scoped (board + agent key allowed). The boss concierge's
   * dispatch history panel is operator-visible telemetry by design.
   */
  const listQuerySchema = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    })
    .strict();

  router.get("/companies/:companyId/dispatch", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest("Invalid dispatch list query", parsed.error.issues);
    }
    const { limit } = parsed.data;

    const rows = await db
      .select({
        id: issuesTable.id,
        identifier: issuesTable.identifier,
        title: issuesTable.title,
        status: issuesTable.status,
        priority: issuesTable.priority,
        assigneeAgentId: issuesTable.assigneeAgentId,
        assigneeUserId: issuesTable.assigneeUserId,
        projectId: issuesTable.projectId,
        createdAt: issuesTable.createdAt,
        updatedAt: issuesTable.updatedAt,
      })
      .from(issuesTable)
      .where(
        and(
          eq(issuesTable.companyId, companyId),
          or(
            isNotNull(issuesTable.assigneeAgentId),
            isNotNull(issuesTable.assigneeUserId),
          ),
        ),
      )
      .orderBy(desc(issuesTable.createdAt))
      .limit(limit);

    res.json({
      generatedAt: new Date().toISOString(),
      items: rows.map((row) => ({
        id: row.id,
        identifier: row.identifier,
        title: row.title,
        status: row.status,
        priority: row.priority,
        assigneeAgentId: row.assigneeAgentId ?? null,
        assigneeUserId: row.assigneeUserId ?? null,
        projectId: row.projectId ?? null,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
        updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
      })),
    });
  });

  return router;
}