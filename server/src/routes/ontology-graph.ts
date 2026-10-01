import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  ontologyGraphQuerySchema,
  ontologyPathsQuerySchema,
  type EntityRef,
  type EntityType,
} from "@paperclipai/shared";
import { ontologyGraphService } from "../services/ontology-graph.js";
import { ontologyBackfillService } from "../services/ontology-backfill.js";
import { logActivity } from "../services/activity-log.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

/**
 * Ontology graph routes (wave154) — the "Workshop" read surface over the link
 * layer.
 *
 *   GET  /api/companies/:companyId/ontology/graph?root_type=&root_id=&depth=&view=
 *   GET  /api/companies/:companyId/ontology/paths?src_type=&src_id=&target_type=&target_id=
 *   GET  /api/companies/:companyId/ontology/stats
 *   GET  /api/companies/:companyId/ontology/levels   (wave261 — drilldown summary)
 *   POST /api/companies/:companyId/ontology/backfill   (wave155)
 *
 * Every route is company-scoped: `assertCompanyAccess` runs first, and the
 * service only ever reads rows whose `company_id` matches, so an id from another
 * tenant resolves to an empty view rather than leaking a shape.
 *
 * The mutating endpoint (`/backfill`) additionally calls `assertBoard` and
 * writes an `ontology.backfill` activity log entry — see wave156 audit
 * remediation spec: an Agent API Key must not silently mutate the link graph
 * on the company's behalf, and compliance reviewers need a forensic trail of
 * who triggered a backfill and how many rows it inserted.
 */
export function ontologyGraphRoutes(db: Db) {
  const router = Router();
  const svc = ontologyGraphService(db);
  const backfill = ontologyBackfillService(db);

  router.get("/companies/:companyId/ontology/graph", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = ontologyGraphQuerySchema.parse(req.query);
    // wave237: root_type + root_id are both optional. When the smoke probe
    // (or a UI "show me the company graph") calls without them, the service
    // returns a flat company snapshot anchored at no root. An explicit pair
    // preserves the original anchor-BFS behavior.
    const root: EntityRef | null =
      query.root_type && query.root_id
        ? { type: query.root_type as EntityType, id: query.root_id }
        : null;
    const relations = query.relations
      ? query.relations.split(",").map((entry) => entry.trim()).filter(Boolean)
      : undefined;
    res.json(await svc.buildView({ companyId, root, depth: query.depth, view: query.view, relations }));
  });

  router.get("/companies/:companyId/ontology/paths", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = ontologyPathsQuerySchema.parse(req.query);
    const src: EntityRef = { type: query.src_type as EntityType, id: query.src_id };
    const target: EntityRef = { type: query.target_type as EntityType, id: query.target_id };
    res.json(await svc.findPaths({ companyId, src, target, maxDepth: query.max_depth }));
  });

  router.get("/companies/:companyId/ontology/stats", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.stats(companyId));
  });

  /**
   * Wave261 — five-level drilldown summary. Read-only, returns the company's
   * real (uncapped) totals bucketed by domain + entityType so the App can
   * decide whether to enter a graph view (≤ 30 nodes) or stay in list mode.
   * No mutating effect; any actor with company access can read it.
   */
  router.get("/companies/:companyId/ontology/levels", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.summarizeLevels(companyId));
  });

  // Derive the link rows a company's existing data already implies. Idempotent
  // and safe to re-run; the response reports what was newly inserted. This is
  // the callable form of the one-shot inference migration 9010 ran.
  //
  // wave156 (audit remediation): backfill is gated to Board actors and writes
  // one activity log entry with the actor identity, company id, and the
  // (inserted, total) counters so compliance can replay who triggered a graph
  // rebuild and what it produced.
  router.post("/companies/:companyId/ontology/backfill", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const result = await backfill.backfill(companyId);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      agentApiKeyId: actor.agentApiKeyId,
      action: "ontology.backfill",
      entityType: "company",
      entityId: companyId,
      details: {
        inserted: result.totalInserted,
        total: result.totalRelations,
        buckets: result.buckets,
      },
    });
    res.json(result);
  });

  return router;
}