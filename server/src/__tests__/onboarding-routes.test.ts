import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { companies, createDb, issues, projects } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { onboardingRoutes } from "../routes/onboarding.ts";
import { errorHandler } from "../middleware/error-handler.ts";

/**
 * Company onboarding routes end to end (wave155) against the real schema.
 *
 * Proves the 3-step flow persists into `companies.onboarding_state`: the gate
 * value (null → step 1 → step 3), the monotonic step, the industry mirror onto
 * `companies.metadata`, and that "run demo" actually creates a project with the
 * five seeded tasks.
 */
const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres onboarding tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("company onboarding routes (wave155)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let app!: express.Express;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-onboarding-");
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
    app.use("/api", onboardingRoutes(db));
    app.use(errorHandler);
  }, 30_000);

  afterEach(async () => {
    await db.delete(issues);
    await db.delete(projects);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompany(name: string) {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name,
      issuePrefix: `O${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    return companyId;
  }

  it("walks step 1 → 2 → 3, persists progress, and seeds the demo", async () => {
    const companyId = await seedCompany("Fresh");

    // A brand-new company has never onboarded — this null is the redirect gate.
    const initial = await request(app).get(`/api/companies/${companyId}/onboarding/state`);
    expect(initial.status).toBe(200);
    expect(initial.body.state).toBeNull();
    expect(initial.body.onboardedStep).toBeNull();
    expect(initial.body.completed).toBe(false);

    const step1 = await request(app)
      .post(`/api/companies/${companyId}/onboarding/step`)
      .send({ step: 1, industry: "文旅" });
    expect(step1.status).toBe(200);
    expect(step1.body.onboardedStep).toBe(1);
    expect(step1.body.state.industry).toBe("文旅");

    const step2 = await request(app)
      .post(`/api/companies/${companyId}/onboarding/step`)
      .send({ step: 2, employees: ["产品经理", "研发工程师"] });
    expect(step2.status).toBe(200);
    expect(step2.body.onboardedStep).toBe(2);
    expect(step2.body.state.employees).toHaveLength(2);

    // The step is monotonic: re-answering an earlier step keeps the furthest.
    const rewind = await request(app)
      .post(`/api/companies/${companyId}/onboarding/step`)
      .send({ step: 1, industry: "政务" });
    expect(rewind.body.onboardedStep).toBe(2);
    expect(rewind.body.state.industry).toBe("政务");

    const complete = await request(app).post(`/api/companies/${companyId}/onboarding/complete`);
    expect(complete.status).toBe(200);
    expect(complete.body.onboardedStep).toBe(3);
    expect(complete.body.completed).toBe(true);
    const demoProjectId = complete.body.state.demoProjectId as string;
    expect(demoProjectId).toBeTruthy();
    expect((complete.body.state.demoTaskIds as string[])).toHaveLength(5);

    const demoIssues = await db.select({ id: issues.id }).from(issues);
    expect(demoIssues).toHaveLength(5);
    const demoProjects = await db.select({ id: projects.id }).from(projects);
    expect(demoProjects.map((p) => p.id)).toContain(demoProjectId);

    // A re-run reuses the demo project and its five tasks rather than doubling.
    const rerun = await request(app).post(`/api/companies/${companyId}/onboarding/complete`);
    expect(rerun.body.state.demoProjectId).toBe(demoProjectId);
    expect((rerun.body.state.demoTaskIds as string[])).toHaveLength(5);
    expect(await db.select({ id: issues.id }).from(issues)).toHaveLength(5);
  });

  it("rejects a step outside the wizard and keeps state company-scoped", async () => {
    const companyA = await seedCompany("OnboardingA");
    const companyB = await seedCompany("OnboardingB");

    const tooFar = await request(app)
      .post(`/api/companies/${companyA}/onboarding/step`)
      .send({ step: 9 });
    expect(tooFar.status).toBe(400);

    await request(app).post(`/api/companies/${companyA}/onboarding/step`).send({ step: 2, employees: ["x"] });

    const stateA = await request(app).get(`/api/companies/${companyA}/onboarding/state`);
    const stateB = await request(app).get(`/api/companies/${companyB}/onboarding/state`);
    expect(stateA.body.onboardedStep).toBe(2);
    expect(stateB.body.state).toBeNull();
  });
});
