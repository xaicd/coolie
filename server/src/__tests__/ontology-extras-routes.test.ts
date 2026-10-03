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
  issueAttachments,
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
    await db.delete(issueAttachments);
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

  // wave284 收尾: the App's api-client (wave239) echoes the path's companyId
  // into its query strings — on /ontology/graph that met a strict schema and
  // 400-ed (the prod 关系图谱 black screen). /instances must stay tolerant:
  // the route overrides the query key with the path param, so an OTA-lagged
  // build sending `?companyId=...` keeps working — and the redundant key can
  // never cross company scoping.
  it("wave284: /instances tolerates a redundant companyId query and scopes by the path", async () => {
    const companyId = await seedCompany();
    // seedCompany() relies on the shared default issue_prefix (unique index),
    // so the foreign company gets its own explicit prefix.
    const otherCompanyId = randomUUID();
    await db.insert(companies).values({
      id: otherCompanyId,
      name: "Coolie Other",
      slug: "coolie-other",
      createdByUserId: "test-board",
      issuePrefix: "COOA",
    });
    const mineId = randomUUID();
    const theirsId = randomUUID();
    await db.insert(projects).values([
      { id: mineId, companyId, name: "Mine", identifier: "mine" },
      { id: theirsId, companyId: otherCompanyId, name: "Theirs", identifier: "theirs" },
    ]);

    const res = await request(app).get(
      `/api/companies/${companyId}/ontology/instances?entityType=project&companyId=${otherCompanyId}`,
    );
    expect(res.status).toBe(200);
    // The path param wins: rows come from the caller's company only.
    expect(res.body.companyId).toBe(companyId);
    const labels = (res.body.instances as Array<{ label: string }>).map((row) => row.label);
    expect(labels).toContain("Mine");
    expect(labels).not.toContain("Theirs");
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

  // wave293-G3 D2: `entityType=attachment` used to 500 on every company —
  // the label query referenced an `issue_attachments.filename` column that
  // does not exist (the name lives in `assets.original_filename`). The QA
  // repro was the *empty* case, so assert that first, then the labels.
  it("GET /ontology/instances?entityType=attachment returns 200 and joins asset filenames", async () => {
    const companyId = await seedCompany();

    // The QA curl repro: a company with zero attachments must 200, not 500.
    const empty = await request(app).get(
      `/api/companies/${companyId}/ontology/instances?entityType=attachment`,
    );
    expect(empty.status).toBe(200);
    expect(empty.body.totalCount).toBe(0);
    expect(empty.body.instances).toEqual([]);

    const issueId = randomUUID();
    await db.insert(issues).values({ id: issueId, companyId, title: "附证件" });
    const named = randomUUID();
    const anonymous = randomUUID();
    await db.insert(assets).values([
      {
        id: named,
        companyId,
        provider: "local",
        objectKey: `wave293/${named}`,
        contentType: "application/pdf",
        byteSize: 10,
        sha256: "a".repeat(64),
        originalFilename: "报告.pdf",
      },
      {
        id: anonymous,
        companyId,
        provider: "local",
        objectKey: `wave293/${anonymous}`,
        contentType: "application/pdf",
        byteSize: 10,
        sha256: "b".repeat(64),
        originalFilename: null,
      },
    ]);
    await db.insert(issueAttachments).values([
      { id: randomUUID(), companyId, issueId, assetId: named },
      { id: randomUUID(), companyId, issueId, assetId: anonymous },
    ]);

    const res = await request(app).get(
      `/api/companies/${companyId}/ontology/instances?entityType=attachment`,
    );
    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(2);
    const labels = (res.body.instances as Array<{ id: string; label: string }>).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
    expect(labels.map((row) => row.label)).toEqual(["(未命名)", "报告.pdf"]);
  });

  // wave293-G3 D1: the App's drilldown rows only carry the entityType
  // business key, so the properties routes must accept it directly — before
  // this the uuid column met `"issue"` and every call 500-ed (PG 22P02).
  it("GET/PATCH /ontology/types/issue/properties round-trips via the business key", async () => {
    const companyId = await seedCompany();

    const first = await request(app).get(
      `/api/companies/${companyId}/ontology/types/issue/properties`,
    );
    expect(first.status).toBe(200);
    expect(first.body.properties).toEqual([]);
    expect(first.body.schemaVersion).toBe(0);

    const patch = await request(app)
      .patch(`/api/companies/${companyId}/ontology/types/issue/properties`)
      .send({ properties: [{ key: "displayName", type: "String", sample: "任务工单" }] });
    expect(patch.status).toBe(200);
    expect(patch.body.properties).toHaveLength(1);
    expect(patch.body.schemaVersion).toBe(1);

    const roundTrip = await request(app).get(
      `/api/companies/${companyId}/ontology/types/issue/properties`,
    );
    expect(roundTrip.status).toBe(200);
    expect(roundTrip.body.properties).toHaveLength(1);
    expect(roundTrip.body.properties[0].key).toBe("displayName");
  });

  it("GET /ontology/types/:id/properties answers 400 for a non-uuid non-entityType id", async () => {
    const companyId = await seedCompany();
    const res = await request(app).get(
      `/api/companies/${companyId}/ontology/types/not-a-uuid-or-key/properties`,
    );
    expect(res.status).toBe(400);
  });
});
