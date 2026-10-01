import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  companies,
  createDb,
  issues,
  projects,
  activityLog,
} from "@paperclipai/db";
import { eq } from "drizzle-orm";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { dispatchRoutes } from "../routes/dispatch.ts";
import { errorHandler } from "../middleware/error-handler.ts";

/**
 * Dispatch routes end-to-end (wave215 POST + wave237 GET list).
 *
 * The GET handler returns the most recent issues with an assignee (agent or
 * user) — those are the rows the boss concierge created via POST. We seed a
 * company with one agent, then POST twice to create dispatched issues, then
 * GET to confirm both come back ordered by `created_at desc`. We also seed
 * an unassigned issue that must NOT show up in the dispatch list.
 *
 * Auth here is `local_implicit` (board) — the smoke probe uses the same
 * shortcut via `x-paperclip-api-key`. The "board only" assertion belongs to
 * the existing wave215 route tests.
 */
const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres dispatch tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("dispatch routes (wave215 POST + wave237 GET)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let app!: express.Express;
  let companyId: string;
  let agentId: string;
  let projectId: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-dispatch-");
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
    app.use("/api", dispatchRoutes(db));
    app.use(errorHandler);

    companyId = randomUUID();
    agentId = randomUUID();
    projectId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Dispatch Test Co",
      issuePrefix: `W${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Test Worker",
      role: "engineer",
      adapter: "test",
      status: "active",
    });
    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "Dispatch Test Project",
    });
    // We only test the agent path here. userId assignment goes through
    // company_memberships and is exercised by the issue-route test suite.
  }, 30_000);

  afterEach(async () => {
    await db.delete(issues).where(eq(issues.companyId, companyId));
  });

  afterAll(async () => {
    // activity_log has rows the dispatch POST writes; clear them before
    // dropping the company.
    await db.delete(issues).where(eq(issues.companyId, companyId));
    await db.delete(activityLog).where(eq(activityLog.companyId, companyId));
    await db.delete(agents).where(eq(agents.companyId, companyId));
    await db.delete(projects).where(eq(projects.companyId, companyId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await tempDb?.cleanup();
  });

  it("creates a dispatched issue via POST and returns the identifier", async () => {
    const res = await request(app)
      .post(`/api/companies/${companyId}/dispatch`)
      .send({ title: "Dispatch task one", assigneeAgentId: agentId });
    expect(res.status).toBe(201);
    expect(res.body.issueId).toBeTruthy();
    expect(res.body.title).toBe("Dispatch task one");
  });

  it("rejects dispatch POST without an assignee", async () => {
    const res = await request(app)
      .post(`/api/companies/${companyId}/dispatch`)
      .send({ title: "Missing assignee" });
    expect(res.status).toBe(400);
  });

  it("GET /dispatch returns issues with an assignee, ordered by created_at desc", async () => {
    // Seed: two dispatched issues (both to agent, project attached on first) + one unassigned.
    const dispatchedFirst = await request(app)
      .post(`/api/companies/${companyId}/dispatch`)
      .send({ title: "Task first", assigneeAgentId: agentId, projectId });
    expect(dispatchedFirst.status).toBe(201);

    // Wait 5ms so the second row has a strictly later createdAt — ordering
    // assertion depends on it, and the timer resolution is millisecond.
    await new Promise((r) => setTimeout(r, 5));

    const dispatchedSecond = await request(app)
      .post(`/api/companies/${companyId}/dispatch`)
      .send({ title: "Task second", assigneeAgentId: agentId });
    expect(dispatchedSecond.status).toBe(201);

    // Unassigned — must NOT appear in the dispatch list.
    await db.insert(issues).values({
      id: randomUUID(),
      companyId,
      title: "Unassigned task",
      status: "todo",
      priority: "medium",
      assigneeAgentId: null,
      assigneeUserId: null,
    });

    const res = await request(app).get(`/api/companies/${companyId}/dispatch`);
    expect(res.status).toBe(200);
    expect(res.body.generatedAt).toBeTruthy();
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(2);
    // The second row was created later → comes first.
    expect(res.body.items[0].title).toBe("Task second");
    expect(res.body.items[0].assigneeAgentId).toBe(agentId);
    expect(res.body.items[1].title).toBe("Task first");
    expect(res.body.items[1].projectId).toBe(projectId);
    // Unassigned must be filtered out.
    const titles = res.body.items.map((i: { title: string }) => i.title);
    expect(titles).not.toContain("Unassigned task");
  });

  it("GET /dispatch honours the limit parameter", async () => {
    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post(`/api/companies/${companyId}/dispatch`)
        .send({ title: `Bulk task ${i}`, assigneeAgentId: agentId });
    }
    const res = await request(app)
      .get(`/api/companies/${companyId}/dispatch`)
      .query({ limit: 3 });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(3);
  });

  it("GET /dispatch rejects limit > 100", async () => {
    const res = await request(app)
      .get(`/api/companies/${companyId}/dispatch`)
      .query({ limit: 500 });
    expect(res.status).toBe(400);
  });
});
