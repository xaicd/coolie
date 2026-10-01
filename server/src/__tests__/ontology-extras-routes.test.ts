import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  agents,
  assets,
  companies,
  createDb,
  entityRelations,
  issues,
  ontologyProperties,
  projects,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { ontologyExtrasRoutes } from "../routes/ontology-extras.ts";
import { errorHandler } from "../middleware/error-handler.ts";

/**
 * Wave239 — instances + properties endpoints, end to end against real
 * Postgres. Two suites that match the route's two concerns:
 *
 *   1. /instances — list + owner filter + type validation
 *   2. /properties — GET empty / PATCH upsert / GET round-trip
 *
 * The schema for `ontology_properties` (migration 9013) is the one piece
 * under test that the existing wave154 suite does not exercise.
 */
const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres ontology-extras tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("ontology extras routes (wave239)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let app!: express.Express;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-ontology-extras-");
    db = createDb(tempDb.connectionString);
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { actor: unknown }).actor = {
        type: "board",
        source: "local_implicit",
        actorId: "test-board",
        companyIds: [],
      };
      next();
    });
    app.use("/api", ontologyExtrasRoutes(db));
    app.use(errorHandler);
  }, 30_000);

  afterEach(async () => {
    await db.delete(ontologyProperties);
    await db.delete(entityRelations);
    await db.delete(activityLog);
    await db.delete(issues);
    await db.delete(agents);
    await db.delete(projects);
    await db.delete(assets);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompany() {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Coolie",
      slug: "coolie",
      createdByUserId: "test-board",
    });
    return companyId;
  }

  it("GET /ontology/instances lists one entity-type's rows", async () => {
    const companyId = await seedCompany();
    const projectIds = [randomUUID(), randomUUID(), randomUUID()];
    await db.insert(projects).values(
      projectIds.map((id, idx) => ({
        id,
        companyId,
        name: `Project ${idx + 1}`,
        identifier: `p${idx + 1}`,
      })),
    );

    const res = await request(app).get(
      `/api/companies/${companyId}/ontology/instances?entityType=project`,
    );
    expect(res.status).toBe(200);
    expect(res.body.companyId).toBe(companyId);
    expect(res.body.entityType).toBe("project");
    expect(res.body.totalCount).toBe(3);
    expect(res.body.instances).toHaveLength(3);
    expect(res.body.instances[0]).toHaveProperty("label");
    expect(res.body.instances[0]).toHaveProperty("id");
  });

  it("GET /ontology/instances with ownerId filters via assigned_to edges", async () => {
    const companyId = await seedCompany();
    const agentId = randomUUID();
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "铁匠",
      role: "builder",
      status: "active",
      adapterKey: "claude_local",
      adapterConfig: {},
    });
    const ownedProject = randomUUID();
    const unownedProject = randomUUID();
    await db.insert(projects).values([
      { id: ownedProject, companyId, name: "Owned", identifier: "po" },
      { id: unownedProject, companyId, name: "Unowned", identifier: "pu" },
    ]);
    // Owner edge points agent -> project via assigned_to (target=project, src=agent)
    await db.insert(entityRelations).values({
      companyId,
      srcType: "agent",
      srcId: agentId,
      relation: "assigned_to",
      targetType: "project",
      targetId: ownedProject,
      weight: 1,
      metadata: {},
    });

    const res = await request(app).get(
      `/api/companies/${companyId}/ontology/instances?entityType=project&ownerId=${agentId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(1);
    expect(res.body.instances[0].id).toBe(ownedProject);
    expect(res.body.instances[0].ownerLabel).toBe("铁匠");
  });

  it("GET /ontology/instances rejects an unknown entityType", async () => {
    const companyId = await seedCompany();
    const res = await request(app).get(
      `/api/companies/${companyId}/ontology/instances?entityType=invalid`,
    );
    expect(res.status).toBe(400);
  });

  it("GET /ontology/types/:id/properties returns empty array when never edited", async () => {
    const companyId = await seedCompany();
    const typeId = randomUUID();
    const res = await request(app).get(
      `/api/companies/${companyId}/ontology/types/${typeId}/properties`,
    );
    expect(res.status).toBe(200);
    expect(res.body.properties).toEqual([]);
    expect(res.body.schemaVersion).toBe(0);
  });

  it("PATCH /ontology/types/:id/properties upserts and bumps schemaVersion", async () => {
    const companyId = await seedCompany();
    const typeId = randomUUID();

    const patch = await request(app)
      .patch(`/api/companies/${companyId}/ontology/types/${typeId}/properties`)
      .send({
        properties: [
          { key: "displayName", type: "String", sample: "业务本体中文名" },
          { key: "ownerId", type: "Ref", sample: "用户·铁匠" },
        ],
      });
    expect(patch.status).toBe(200);
    expect(patch.body.properties).toHaveLength(2);
    expect(patch.body.schemaVersion).toBe(1);

    const get = await request(app).get(
      `/api/companies/${companyId}/ontology/types/${typeId}/properties`,
    );
    expect(get.status).toBe(200);
    expect(get.body.properties).toHaveLength(2);
    expect(get.body.schemaVersion).toBe(1);

    // A second PATCH bumps the version. The body is the new full list,
    // not a diff — client is expected to GET, mutate in memory, PATCH.
    const patch2 = await request(app)
      .patch(`/api/companies/${companyId}/ontology/types/${typeId}/properties`)
      .send({ properties: [{ key: "displayName", type: "String" }] });
    expect(patch2.status).toBe(200);
    expect(patch2.body.schemaVersion).toBe(2);
    expect(patch2.body.properties).toHaveLength(1);
  });

  it("PATCH /ontology/types/:id/properties rejects an invalid key", async () => {
    const companyId = await seedCompany();
    const typeId = randomUUID();
    const res = await request(app)
      .patch(`/api/companies/${companyId}/ontology/types/${typeId}/properties`)
      .send({ properties: [{ key: "1-bad-key", type: "String" }] });
    expect(res.status).toBe(400);
  });
});
