import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  ontologyInstancesQuerySchema,
  ontologyPropertiesUpdateSchema,
  type EntityType,
} from "@paperclipai/shared";
import { logActivity } from "../services/activity-log.js";
import { ontologyInstancesService, ontologyPropertiesService } from "../services/ontology-extras.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

/**
 * Wave239 — ontology instances + per-type properties.
 *
 *   GET  /api/companies/:companyId/ontology/instances?entityType=&ownerId=&limit=&offset=
 *   GET  /api/companies/:companyId/ontology/types/:typeId/properties
 *   PATCH /api/companies/:companyId/ontology/types/:typeId/properties
 *
 * Two distinct read concerns and one mutating write:
 *
 * - `/instances` powers the App's 屏 2 (instance graph) — single-type
 *   listing with optional owner filter. Read-only, any actor can call.
 * - `/types/:typeId/properties` GET returns whatever custom properties
 *   the company has saved for that type. PATCH is gated to Board actors
 *   (matching the audit posture of `ontology.backfill`) and writes one
 *   activity-log entry per save with the property count delta.
 *
 * `/graph` already exists (wave154 + wave237) and is not touched here.
 */
export function ontologyExtrasRoutes(db: Db) {
  const router = Router();
  const instances = ontologyInstancesService(db);
  const properties = ontologyPropertiesService(db);

  router.get("/companies/:companyId/ontology/instances", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = ontologyInstancesQuerySchema.parse({
      ...req.query,
      companyId,
    });
    const result = await instances.listInstances({
      companyId,
      entityType: query.entityType as EntityType,
      ownerId: query.ownerId,
      limit: query.limit,
      offset: query.offset,
    });
    res.json(result);
  });

  router.get("/companies/:companyId/ontology/types/:typeId/properties", async (req, res) => {
    const companyId = req.params.companyId as string;
    const typeId = req.params.typeId as string;
    assertCompanyAccess(req, companyId);
    const result = await properties.getProperties({ companyId, typeId });
    res.json(result);
  });

  router.patch("/companies/:companyId/ontology/types/:typeId/properties", async (req, res) => {
    const companyId = req.params.companyId as string;
    const typeId = req.params.typeId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const body = ontologyPropertiesUpdateSchema.parse(req.body ?? {});
    const before = await properties.getProperties({ companyId, typeId });
    const result = await properties.updateProperties({ companyId, typeId, update: body });

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      agentApiKeyId: actor.agentApiKeyId,
      action: "ontology.properties.update",
      entityType: "company",
      entityId: companyId,
      details: {
        typeId,
        beforeCount: before.properties.length,
        afterCount: result.properties.length,
        schemaVersion: result.schemaVersion,
      },
    });

    res.json(result);
  });

  return router;
}
