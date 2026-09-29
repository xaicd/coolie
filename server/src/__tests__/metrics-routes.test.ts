import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { agents, companies, createDb, issues } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { metricsRoutes } from "../routes/metrics.ts";
import { errorHandler } from "../middleware/error-handler.ts";

/**
 * wave152 (C) — failure rate / delivery cycle / throughput over a real schema.
 * The expected numbers are computed by hand from the fixed seed below.
 */
const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres metrics tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

const COMPANY_A_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_B_ID = "22222222-2222-4222-8222-222222222222";
const AGENT_1 = "33333333-3333-4333-8333-333333333333";

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

describeEmbeddedPostgres("metrics routes (wave152 C)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let app!: express.Express;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-metrics-");
    db = createDb(tempDb.connectionString);
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { actor: unknown }).actor = {
        type: "board",
        source: "session",
        userId: "alice",
        isInstanceAdmin: false,
        companyIds: [COMPANY_A_ID],
        memberships: [{ companyId: COMPANY_A_ID, status: "active", membershipRole: "editor" }],
      };
      next();
    });
    app.use("/api", metricsRoutes(db));
    app.use(errorHandler);
  }, 30_000);

  afterEach(async () => {
    await db.delete(issues);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seed() {
    await db.insert(companies).values([
      { id: COMPANY_A_ID, name: "A", issuePrefix: "AA", requireBoardApprovalForNewAgents: false },
      { id: COMPANY_B_ID, name: "B", issuePrefix: "BB", requireBoardApprovalForNewAgents: false },
    ]);
    await db.insert(agents).values({ id: AGENT_1, companyId: COMPANY_A_ID, name: "Ada" });

    await db.insert(issues).values([
      // 2 done, 3-day cycles, owned by agent 1
      {
        id: randomUUID(), companyId: COMPANY_A_ID, title: "done-1", status: "done", priority: "medium",
        assigneeAgentId: AGENT_1, createdAt: daysAgo(5), completedAt: daysAgo(2),
      },
      {
        id: randomUUID(), companyId: COMPANY_A_ID, title: "done-2", status: "done", priority: "medium",
        assigneeAgentId: AGENT_1, createdAt: daysAgo(10), completedAt: daysAgo(7),
      },
      // 1 cancelled (agent 1)
      {
        id: randomUUID(), companyId: COMPANY_A_ID, title: "cancelled-1", status: "cancelled", priority: "medium",
        assigneeAgentId: AGENT_1, createdAt: daysAgo(3), cancelledAt: daysAgo(1),
      },
      // 1 blocked for 10 days → stuck
      {
        id: randomUUID(), companyId: COMPANY_A_ID, title: "blocked-stuck", status: "blocked", priority: "medium",
        createdAt: daysAgo(20), blockedTransitionAt: daysAgo(10),
      },
      // 2 open tasks created half a day ago
      {
        id: randomUUID(), companyId: COMPANY_A_ID, title: "in-progress", status: "in_progress", priority: "medium",
        createdAt: daysAgo(0.5),
      },
      {
        id: randomUUID(), companyId: COMPANY_A_ID, title: "backlog", status: "backlog", priority: "medium",
        createdAt: daysAgo(0.5),
      },
      // company B noise — must never appear in company A's numbers
      {
        id: randomUUID(), companyId: COMPANY_B_ID, title: "b-done", status: "done", priority: "medium",
        createdAt: daysAgo(2), completedAt: daysAgo(1),
      },
    ]);
  }

  it("computes failure rate, delivery cycle and throughput for the cohort", async () => {
    await seed();

    const res = await request(app).get(`/api/companies/${COMPANY_A_ID}/metrics/overview`);
    expect(res.status).toBe(200);

    const body = res.body;
    expect(body.period_days).toBe(30);
    expect(body.totals).toEqual({
      tasks: 6, done: 2, cancelled: 1, blocked: 1, blockedStuck: 1, inProgress: 1,
    });
    // (1 cancelled + 1 blocked-stuck) / 6
    expect(body.failure_rate).toBeCloseTo(2 / 6, 4);
    // both done cycles are exactly 3 days
    expect(body.delivery_cycle_days_avg).toBeCloseTo(3, 3);
    // 2 done over a 30-day window
    expect(body.throughput_per_day).toBeCloseTo(2 / 30, 4);

    const agent = body.by_agent.find((row: { agent_id: string }) => row.agent_id === AGENT_1);
    expect(agent).toBeTruthy();
    expect(agent.agent_name).toBe("Ada");
    expect(agent.tasks).toBe(3);
    expect(agent.done).toBe(2);
    expect(agent.cancelled).toBe(1);
    expect(agent.failure_rate).toBeCloseTo(1 / 3, 4);
    expect(agent.delivery_cycle_days_avg).toBeCloseTo(3, 3);

    // 14-day series; the two completions land inside it
    expect(body.series).toHaveLength(14);
    const seriesThroughput = body.series.reduce(
      (sum: number, point: { throughput: number }) => sum + point.throughput,
      0,
    );
    expect(seriesThroughput).toBe(2);
  });

  it("honors the period filter and stays company-scoped", async () => {
    await seed();

    const res = await request(app).get(`/api/companies/${COMPANY_A_ID}/metrics/overview?period=1`);
    expect(res.status).toBe(200);
    expect(res.body.period_days).toBe(1);
    expect(res.body.totals.tasks).toBe(2);
    expect(res.body.failure_rate).toBe(0);
    expect(res.body.throughput_per_day).toBe(0);

    const cross = await request(app).get(`/api/companies/${COMPANY_B_ID}/metrics/overview`);
    expect(cross.status).toBe(403);
  });

  it("rejects an out-of-range period", async () => {
    await seed();
    const res = await request(app).get(`/api/companies/${COMPANY_A_ID}/metrics/overview?period=9999`);
    expect(res.status).toBe(400);
  });
});
