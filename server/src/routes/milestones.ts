import { Router } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import type { IssueMilestone } from "@paperclipai/shared";
import { issues as issuesTable } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";
import { badRequest, notFound } from "../errors.js";

/**
 * Coolie fork — wave215: 老板里程碑 (boss milestones view) endpoint.
 *
 * Milestones are stored as `issues` with `is_milestone = true` and a JSON
 * `milestone` payload (gate / dates / approver / evidence / exemption). This
 * route exposes the company-scoped list + detail the coolie App's 老板面板
 * shows under "里程碑".
 *
 *   GET  /api/companies/:companyId/milestones?status=&gate=
 *   GET  /api/companies/:companyId/milestones/:id
 *
 * Auth: company-scoped (board + agent key allowed). Milestone metadata is
 * operator-visible telemetry by design.
 */

const MILESTONE_STATUSES = [
  "not_started",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
] as const;

const listQuerySchema = z.object({
  status: z.enum(MILESTONE_STATUSES).optional(),
  gate: z.string().trim().min(1).max(32).optional(),
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

function serializeMilestone(row: typeof issuesTable.$inferSelect) {
  const milestone = (row.milestone as IssueMilestone | null) ?? null;
  return {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId ?? null,
    identifier: row.identifier,
    title: row.title,
    status: row.status,
    milestone,
    plannedDate: milestone?.plannedDate ?? null,
    completedDate: milestone?.completedDate ?? null,
    gate: milestone?.gate ?? null,
    approver: milestone?.approver ?? null,
    evidence: milestone?.evidence ?? null,
    exempted: milestone?.exempted ?? false,
    exemptionReason: milestone?.exemptionReason ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export function milestonesRoutes(db: Db) {
  const router = Router();

  router.get("/companies/:companyId/milestones", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest("Invalid milestones query", parsed.error.issues);
    }
    const { projectId, limit } = parsed.data;

    const conditions = [
      eq(issuesTable.companyId, companyId),
      eq(issuesTable.isMilestone, true),
    ];
    if (projectId) conditions.push(eq(issuesTable.projectId, projectId));

    const rows = await db
      .select()
      .from(issuesTable)
      .where(and(...conditions))
      .orderBy(desc(issuesTable.updatedAt))
      .limit(limit ?? 200);

    // status filter happens in app code because the status lives inside the
    // `milestone` JSONB column.
    let filteredRows = rows;
    if (parsed.data.status) {
      filteredRows = rows.filter((r) => {
        const milestone = (r.milestone as IssueMilestone | null) ?? null;
        return (milestone?.status ?? "not_started") === parsed.data.status;
      });
    }
    if (parsed.data.gate) {
      const wantedGate = parsed.data.gate;
      filteredRows = filteredRows.filter((r) => {
        const milestone = (r.milestone as IssueMilestone | null) ?? null;
        return milestone?.gate === wantedGate;
      });
    }

    const allMilestoneStatus = rows.reduce<Record<string, number>>((acc, row) => {
      const milestone = (row.milestone as IssueMilestone | null) ?? null;
      const status = milestone?.status ?? "not_started";
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {});

    res.json({
      generatedAt: new Date().toISOString(),
      counts: allMilestoneStatus,
      items: filteredRows.map(serializeMilestone),
    });
  });

  router.get("/companies/:companyId/milestones/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const id = req.params.id as string;

    const row = await db
      .select()
      .from(issuesTable)
      .where(
        and(
          eq(issuesTable.id, id),
          eq(issuesTable.companyId, companyId),
          eq(issuesTable.isMilestone, true),
        ),
      )
      .then((rows) => rows[0] ?? null);

    if (!row) throw notFound("Milestone not found");
    res.json(serializeMilestone(row));
  });

  return router;
}