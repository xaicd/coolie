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
import { assertCompanyAccess } from "./authz.js";

/**
 * Ontology graph routes (wave154) — the "Workshop" read surface over the link
 * layer.
 *
 *   GET  /api/companies/:companyId/ontology/graph?root_type=&root_id=&depth=&view=
 *   GET  /api/companies/:companyId/ontology/paths?src_type=&src_id=&target_type=&target_id=
 *   GET  /api/companies/:companyId/ontology/stats
 *   POST /api/companies/:companyId/ontology/backfill   (wave155)
 *
 * Every route is company-scoped: `assertCompanyAccess` runs first, and the
 * service only ever reads rows whose `company_id` matches, so an id from another
 * tenant resolves to an empty view rather than leaking a shape.
 */
export function ontologyGraphRoutes(db: Db) {
  const router = Router();
  const svc = ontologyGraphService(db);
  const backfill = ontologyBackfillService(db);

  router.get("/companies/:companyId/ontology/graph", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = ontologyGraphQuerySchema.parse(req.query);
    const root: EntityRef = { type: query.root_type as EntityType, id: query.root_id };
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

  // Derive the link rows a company's existing data already implies. Idempotent
  // and safe to re-run; the response reports what was newly inserted. This is
  // the callable form of the one-shot inference migration 9010 ran.
  router.post("/companies/:companyId/ontology/backfill", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await backfill.backfill(companyId));
  });

  return router;
}
