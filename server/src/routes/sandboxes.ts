import { Router } from "express";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { executionWorkspaces } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";
import { badRequest, notFound } from "../errors.js";

/**
 * Coolie fork — wave215: 老板看原型 (boss sandbox view) endpoint.
 *
 * The coolie App's 老板面板 wants "the active sandboxes right now" — the
 * isolated execution workspaces currently running for the company, grouped
 * by project, with `lastUsedAt` so the UI can show "idle 4m" timers.
 *
 *   GET /api/companies/:companyId/sandboxes?status=&projectId=&limit=
 *
 * Auth: company-scoped (board + agent key allowed). Workspace metadata is
 * operator telemetry by design.
 */

const listQuerySchema = z.object({
  status: z.string().trim().min(1).max(32).optional(),
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

function serializeSandbox(row: typeof executionWorkspaces.$inferSelect) {
  return {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId,
    projectWorkspaceId: row.projectWorkspaceId ?? null,
    sourceIssueId: row.sourceIssueId ?? null,
    mode: row.mode,
    strategyType: row.strategyType,
    name: row.name,
    status: row.status,
    cwd: row.cwd ?? null,
    repoUrl: row.repoUrl ?? null,
    baseRef: row.baseRef ?? null,
    branchName: row.branchName ?? null,
    providerType: row.providerType,
    providerRef: row.providerRef ?? null,
    derivedFromExecutionWorkspaceId: row.derivedFromExecutionWorkspaceId ?? null,
    lastUsedAt: row.lastUsedAt.toISOString(),
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    cleanupEligibleAt: row.cleanupEligibleAt ? row.cleanupEligibleAt.toISOString() : null,
    cleanupReason: row.cleanupReason ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function sandboxesRoutes(db: Db) {
  const router = Router();

  router.get("/companies/:companyId/sandboxes", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest("Invalid sandboxes query", parsed.error.issues);
    }
    const { status, projectId, limit } = parsed.data;

    const conditions = [eq(executionWorkspaces.companyId, companyId)];
    if (status) conditions.push(eq(executionWorkspaces.status, status));
    if (projectId) conditions.push(eq(executionWorkspaces.projectId, projectId));

    const rows = await db
      .select()
      .from(executionWorkspaces)
      .where(and(...conditions))
      .orderBy(desc(executionWorkspaces.lastUsedAt))
      .limit(limit ?? 100);

    const counts = await db
      .select({
        status: executionWorkspaces.status,
        count: sql<number>`count(*)::int`,
      })
      .from(executionWorkspaces)
      .where(eq(executionWorkspaces.companyId, companyId))
      .groupBy(executionWorkspaces.status);

    res.json({
      generatedAt: new Date().toISOString(),
      counts: counts.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = Number(row.count);
        return acc;
      }, {}),
      items: rows.map(serializeSandbox),
    });
  });

  router.get("/companies/:companyId/sandboxes/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const id = req.params.id as string;

    const row = await db
      .select()
      .from(executionWorkspaces)
      .where(
        and(
          eq(executionWorkspaces.id, id),
          eq(executionWorkspaces.companyId, companyId),
        ),
      )
      .then((rows) => rows[0] ?? null);

    if (!row) throw notFound("Sandbox not found");
    res.json(serializeSandbox(row));
  });

  return router;
}