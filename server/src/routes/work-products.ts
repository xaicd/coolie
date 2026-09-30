import { Router } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issueWorkProducts, issues as issuesTable } from "@paperclipai/db";
import { workProductService } from "../services/work-products.js";
import { assertCompanyAccess } from "./authz.js";
import { badRequest, notFound } from "../errors.js";

/**
 * Coolie fork — wave215: 老板看产物 (boss work-products view) endpoint.
 *
 * The coolie App's 老板面板 surfaces "本轮所有交付物", grouped by issue and
 * ordered by `updated_at`. The `/issues/:id/work-products` route already
 * exists; this adds the company-scoped list endpoint the App's boss dashboard
 * actually calls.
 *
 *   GET  /api/companies/:companyId/work-products?type=&limit=&agentId=
 *   GET  /api/companies/:companyId/work-products/:id
 *   GET  /api/companies/:companyId/work-products/artifacts/code?limit=
 *
 * Auth: company-scoped (board + agent key allowed). Work-product data is
 * operator-visible telemetry by design.
 */

const listQuerySchema = z.object({
  type: z.string().trim().min(1).max(64).optional(),
  agentId: z.string().uuid().optional(),
  issueId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  refreshPullRequests: z
    .union([z.literal("true"), z.literal("false")])
    .optional(),
});

function serializeWorkProduct(row: {
  id: string;
  companyId: string;
  issueId: string;
  type: string;
  provider: string;
  externalId: string | null;
  title: string;
  url: string | null;
  status: string;
  reviewState: string;
  isPrimary: boolean;
  healthStatus: string;
  summary: string | null;
  versionNumber: number;
  isLatest: boolean;
  versionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    companyId: row.companyId,
    issueId: row.issueId,
    type: row.type,
    provider: row.provider,
    externalId: row.externalId,
    title: row.title,
    url: row.url,
    status: row.status,
    reviewState: row.reviewState,
    isPrimary: row.isPrimary,
    healthStatus: row.healthStatus,
    summary: row.summary,
    versionNumber: row.versionNumber,
    isLatest: row.isLatest,
    versionNote: row.versionNote,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

export function workProductsRoutes(db: Db) {
  const router = Router();
  const svc = workProductService(db);

  router.get("/companies/:companyId/work-products", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest("Invalid work-products query", parsed.error.issues);
    }
    const { type, agentId, issueId, limit, refreshPullRequests } = parsed.data;

    const conditions = [eq(issueWorkProducts.companyId, companyId)];
    if (type) conditions.push(eq(issueWorkProducts.type, type));
    if (issueId) conditions.push(eq(issueWorkProducts.issueId, issueId));

    let rows = await db
      .select({
        id: issueWorkProducts.id,
        companyId: issueWorkProducts.companyId,
        issueId: issueWorkProducts.issueId,
        type: issueWorkProducts.type,
        provider: issueWorkProducts.provider,
        externalId: issueWorkProducts.externalId,
        title: issueWorkProducts.title,
        url: issueWorkProducts.url,
        status: issueWorkProducts.status,
        reviewState: issueWorkProducts.reviewState,
        isPrimary: issueWorkProducts.isPrimary,
        healthStatus: issueWorkProducts.healthStatus,
        summary: issueWorkProducts.summary,
        versionNumber: issueWorkProducts.versionNumber,
        isLatest: issueWorkProducts.isLatest,
        versionNote: issueWorkProducts.versionNote,
        createdAt: issueWorkProducts.createdAt,
        updatedAt: issueWorkProducts.updatedAt,
      })
      .from(issueWorkProducts)
      .where(and(...conditions))
      .orderBy(desc(issueWorkProducts.updatedAt))
      .limit(limit ?? 100);

    if (agentId) {
      // filter to issues the agent owns/owned (wave215: 老板想看某 agent 的产物)
      const issueIds = rows.map((r) => r.issueId);
      const owned = issueIds.length
        ? await db
            .select({ id: issuesTable.id })
            .from(issuesTable)
            .where(eq(issuesTable.assigneeAgentId, agentId))
            .then((list) => new Set(list.map((r) => r.id)))
        : new Set<string>();
      rows = rows.filter((r) => owned.has(r.issueId));
    }

    if (refreshPullRequests === "true" && rows.length > 0) {
      // The /issues/:id/work-products route triggers a PR refresh; this company
      // endpoint does the same for the first 200 rows.
      const issueIds = Array.from(new Set(rows.slice(0, 200).map((r) => r.issueId)));
      await Promise.all(
        issueIds.map((id) =>
          svc.listForIssue(id, { refreshPullRequests: true }).catch(() => null),
        ),
      );
      // re-read updated rows after refresh
      rows = await db
        .select({
          id: issueWorkProducts.id,
          companyId: issueWorkProducts.companyId,
          issueId: issueWorkProducts.issueId,
          type: issueWorkProducts.type,
          provider: issueWorkProducts.provider,
          externalId: issueWorkProducts.externalId,
          title: issueWorkProducts.title,
          url: issueWorkProducts.url,
          status: issueWorkProducts.status,
          reviewState: issueWorkProducts.reviewState,
          isPrimary: issueWorkProducts.isPrimary,
          healthStatus: issueWorkProducts.healthStatus,
          summary: issueWorkProducts.summary,
          versionNumber: issueWorkProducts.versionNumber,
          isLatest: issueWorkProducts.isLatest,
          versionNote: issueWorkProducts.versionNote,
          createdAt: issueWorkProducts.createdAt,
          updatedAt: issueWorkProducts.updatedAt,
        })
        .from(issueWorkProducts)
        .where(and(...conditions))
        .orderBy(desc(issueWorkProducts.updatedAt))
        .limit(limit ?? 100);
    }

    res.json({
      generatedAt: new Date().toISOString(),
      items: rows.map(serializeWorkProduct),
    });
  });

  router.get("/companies/:companyId/work-products/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const id = req.params.id as string;

    const row = await db
      .select()
      .from(issueWorkProducts)
      .where(and(eq(issueWorkProducts.id, id), eq(issueWorkProducts.companyId, companyId)))
      .then((rows) => rows[0] ?? null);

    if (!row) {
      throw notFound("Work product not found");
    }
    res.json(serializeWorkProduct(row));
  });

  router.get("/companies/:companyId/work-products/artifacts/code", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const parsed = listQuerySchema
      .pick({ limit: true })
      .safeParse(req.query);
    if (!parsed.success) {
      throw badRequest("Invalid artifacts query", parsed.error.issues);
    }

    const conditions = [
      eq(issueWorkProducts.companyId, companyId),
      eq(issueWorkProducts.type, "code"),
    ];

    const rows = await db
      .select({
        id: issueWorkProducts.id,
        companyId: issueWorkProducts.companyId,
        issueId: issueWorkProducts.issueId,
        type: issueWorkProducts.type,
        provider: issueWorkProducts.provider,
        externalId: issueWorkProducts.externalId,
        title: issueWorkProducts.title,
        url: issueWorkProducts.url,
        status: issueWorkProducts.status,
        reviewState: issueWorkProducts.reviewState,
        isPrimary: issueWorkProducts.isPrimary,
        healthStatus: issueWorkProducts.healthStatus,
        summary: issueWorkProducts.summary,
        versionNumber: issueWorkProducts.versionNumber,
        isLatest: issueWorkProducts.isLatest,
        versionNote: issueWorkProducts.versionNote,
        createdAt: issueWorkProducts.createdAt,
        updatedAt: issueWorkProducts.updatedAt,
      })
      .from(issueWorkProducts)
      .where(and(...conditions))
      .orderBy(desc(issueWorkProducts.updatedAt))
      .limit(parsed.data.limit ?? 50);

    res.json({
      generatedAt: new Date().toISOString(),
      items: rows.map(serializeWorkProduct),
    });
  });

  return router;
}