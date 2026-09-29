import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { activityLog, companies, createDb, issues } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { issueSpecRoutes } from "../routes/issue-specs.ts";
import { errorHandler } from "../middleware/error-handler.ts";

/**
 * The spec chain end to end against the real schema (wave147).
 *
 * Exercises the four routes (from-template → tree → read → write) through a real
 * Express mount and a real Postgres, so the storage columns added by migration
 * 9008 are proven to round-trip rather than merely to compile.
 */
const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres spec-route tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("issue spec routes (wave147)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let app!: express.Express;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-issue-spec-routes-");
    db = createDb(tempDb.connectionString);
    app = express();
    app.use(express.json());
    // A loopback board actor, the same bypass the local dev concierge uses.
    app.use((req, _res, next) => {
      (req as unknown as { actor: unknown }).actor = {
        type: "board",
        source: "local_implicit",
        actorId: "test-board",
        companyIds: [],
      };
      next();
    });
    app.use("/api", issueSpecRoutes(db));
    app.use(errorHandler);
  }, 30_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(issues);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompany() {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Wave147",
      issuePrefix: `W${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    return companyId;
  }

  it("builds requirement → design → task through the API and reads the tree back", async () => {
    const companyId = await seedCompany();

    const requirement = await request(app)
      .post(`/api/companies/${companyId}/specs/from-template`)
      .send({ kind: "requirement", title: "Board chat receipt" });
    expect(requirement.status).toBe(201);
    expect(requirement.body.specKind).toBe("requirement");
    expect(requirement.body.spec.requirement.acceptanceCriteria.length).toBeGreaterThan(0);
    const requirementIssueId = requirement.body.issueId as string;

    const design = await request(app)
      .post(`/api/companies/${companyId}/specs/from-template`)
      .send({ kind: "design", parentIssueId: requirementIssueId });
    expect(design.status).toBe(201);
    const designIssueId = design.body.issueId as string;

    const task = await request(app)
      .post(`/api/companies/${companyId}/specs/from-template`)
      .send({ kind: "task", parentIssueId: designIssueId });
    expect(task.status).toBe(201);
    const taskIssueId = task.body.issueId as string;

    const tree = await request(app).get(`/api/companies/${companyId}/specs/tree`);
    expect(tree.status).toBe(200);
    expect(tree.body.roots).toHaveLength(1);
    expect(tree.body.roots[0].issueId).toBe(requirementIssueId);
    expect(tree.body.roots[0].children[0].issueId).toBe(designIssueId);
    expect(tree.body.roots[0].children[0].children[0].issueId).toBe(taskIssueId);

    const readTask = await request(app).get(`/api/issues/${taskIssueId}/spec`);
    expect(readTask.status).toBe(200);
    expect(readTask.body.specKind).toBe("task");
    expect(readTask.body.spec.task.files.length).toBeGreaterThan(0);
    expect(readTask.body.spec.parentSpecId).toBe(designIssueId);
  });

  it("writes a complete spec and rejects an incomplete one", async () => {
    const companyId = await seedCompany();
    const issueId = randomUUID();
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Write a spec",
      status: "backlog",
      priority: "medium",
    });

    const bad = await request(app).post(`/api/issues/${issueId}/spec`).send({ kind: "requirement" });
    expect(bad.status).toBe(400);

    const ok = await request(app)
      .post(`/api/issues/${issueId}/spec`)
      .send({
        kind: "requirement",
        requirement: { body: "Do the thing", acceptanceCriteria: ["WHEN x THEN y"] },
      });
    expect(ok.status).toBe(200);
    expect(ok.body.spec.requirement.body).toBe("Do the thing");

    // Read it back through the read surface, not from the write response.
    const read = await request(app).get(`/api/issues/${issueId}/spec`);
    expect(read.body.spec.requirement.acceptanceCriteria).toEqual(["WHEN x THEN y"]);
  });

  it("accepts a partial draft with ?draft=1 and refuses a self-parent", async () => {
    const companyId = await seedCompany();
    const issueId = randomUUID();
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Drafty",
      status: "backlog",
      priority: "medium",
    });

    const draft = await request(app)
      .post(`/api/issues/${issueId}/spec?draft=1`)
      .send({ kind: "design", design: { approach: "half thought through" } });
    expect(draft.status).toBe(200);

    const selfParent = await request(app)
      .post(`/api/issues/${issueId}/spec?draft=1`)
      .send({ kind: "design", parentSpecId: issueId, design: { approach: "x" } });
    expect(selfParent.status).toBe(422);
  });
});
