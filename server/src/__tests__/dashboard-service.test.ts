import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { agents, companies, createDb, heartbeatRuns, issues } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { dashboardService, getUtcMonthStart } from "../services/dashboard.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres dashboard service tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

function utcDay(offsetDays: number): Date {
  const now = new Date();
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays, 12);
  return new Date(day);
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe("getUtcMonthStart", () => {
  it("anchors the monthly spend window to UTC month boundaries", () => {
    expect(getUtcMonthStart(new Date("2026-03-31T20:30:00.000-05:00")).toISOString()).toBe(
      "2026-04-01T00:00:00.000Z",
    );
    expect(getUtcMonthStart(new Date("2026-04-01T00:30:00.000+14:00")).toISOString()).toBe(
      "2026-03-01T00:00:00.000Z",
    );
  });
});

describeEmbeddedPostgres("dashboard service", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-dashboard-service-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(heartbeatRuns);
    await db.delete(issues);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("aggregates the full 14-day run activity window without recent-run truncation", async () => {
    const companyId = randomUUID();
    const otherCompanyId = randomUUID();
    const agentId = randomUUID();
    const otherAgentId = randomUUID();
    const today = utcDay(0);
    const weekAgo = utcDay(-7);

    await db.insert(companies).values([
      {
        id: companyId,
        name: "Paperclip",
        issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
        requireBoardApprovalForNewAgents: false,
      },
      {
        id: otherCompanyId,
        name: "Other",
        issuePrefix: `T${otherCompanyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
        requireBoardApprovalForNewAgents: false,
      },
    ]);

    await db.insert(agents).values([
      {
        id: agentId,
        companyId,
        name: "CodexCoder",
        role: "engineer",
        status: "running",
        adapterType: "codex_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
      },
      {
        id: otherAgentId,
        companyId: otherCompanyId,
        name: "OtherAgent",
        role: "engineer",
        status: "running",
        adapterType: "codex_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
      },
    ]);

    await db.insert(heartbeatRuns).values([
      ...Array.from({ length: 105 }, () => ({
        id: randomUUID(),
        companyId,
        agentId,
        invocationSource: "assignment",
        status: "succeeded",
        createdAt: today,
      })),
      {
        id: randomUUID(),
        companyId,
        agentId,
        invocationSource: "assignment",
        status: "failed",
        createdAt: weekAgo,
      },
      {
        id: randomUUID(),
        companyId,
        agentId,
        invocationSource: "assignment",
        status: "timed_out",
        createdAt: weekAgo,
      },
      {
        id: randomUUID(),
        companyId,
        agentId,
        invocationSource: "assignment",
        status: "cancelled",
        createdAt: weekAgo,
      },
      {
        id: randomUUID(),
        companyId: otherCompanyId,
        agentId: otherAgentId,
        invocationSource: "assignment",
        status: "succeeded",
        createdAt: weekAgo,
      },
    ]);

    const summary = await dashboardService(db).summary(companyId);

    expect(summary.runActivity).toHaveLength(14);
    const todayBucket = summary.runActivity.find((bucket) => bucket.date === utcDateKey(today));
    const weekAgoBucket = summary.runActivity.find((bucket) => bucket.date === utcDateKey(weekAgo));

    expect(todayBucket).toMatchObject({
      succeeded: 105,
      failed: 0,
      recovered: 0,
      other: 0,
      total: 105,
      failedByErrorCode: {},
    });
    expect(weekAgoBucket).toMatchObject({
      succeeded: 0,
      failed: 2,
      recovered: 0,
      other: 1,
      total: 3,
      // failed + timed_out with no error code both bucket under "unknown"
      failedByErrorCode: { unknown: 2 },
    });
  });

  it("separates recovered restart kills from true failures and breaks failures down by error code", async () => {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const day = utcDay(-2);

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "CodexCoder",
      role: "engineer",
      status: "running",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    const base = {
      companyId,
      agentId,
      invocationSource: "assignment",
      createdAt: day,
    };

    // Direct recovery: a process-loss kill whose retry succeeded.
    const original = randomUUID();
    const retry = randomUUID();
    // Chained recovery: kill -> failed retry -> succeeded retry (both kills recovered).
    const chainedOriginal = randomUUID();
    const chainedRetry = randomUUID();
    const chainedRetrySuccess = randomUUID();
    // A genuine, unrecovered failure that should remain in the failed count.
    const trueFailure = randomUUID();

    await db.insert(heartbeatRuns).values([
      { ...base, id: original, status: "failed", errorCode: "process_lost" },
      { ...base, id: retry, status: "succeeded", retryOfRunId: original },
      { ...base, id: chainedOriginal, status: "failed", errorCode: "process_lost" },
      { ...base, id: chainedRetry, status: "failed", errorCode: "process_lost", retryOfRunId: chainedOriginal },
      { ...base, id: chainedRetrySuccess, status: "succeeded", retryOfRunId: chainedRetry },
      { ...base, id: trueFailure, status: "failed", errorCode: "provider_quota" },
    ]);

    const summary = await dashboardService(db).summary(companyId);
    const bucket = summary.runActivity.find((b) => b.date === utcDateKey(day));

    expect(bucket).toMatchObject({
      succeeded: 2,
      // original + chainedOriginal + chainedRetry all recovered via a later success
      recovered: 3,
      failed: 1,
      other: 0,
      total: 6,
      failedByErrorCode: { provider_quota: 1 },
    });
    // process_lost kills that recovered must not leak into the failed breakdown.
    expect(bucket?.failedByErrorCode.process_lost).toBeUndefined();
  });

  it("computes cockpit efficiency metrics: quota, progress, idle, deliveryCycle, efficiency, failureRate", async () => {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000);
    const threeHoursAgo = new Date(now.getTime() - 3 * 3600 * 1000);

    await db.insert(companies).values({
      id: companyId,
      name: "Cockpit Corp",
      issuePrefix: `C${companyId.replace(/-/g, "").slice(0, 5).toUpperCase()}`,
      budgetMonthlyCents: 50000,
      spentMonthlyCents: 12500,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "PilotAgent",
      role: "specialist",
      status: "running",
      lastHeartbeatAt: twoHoursAgo,
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    await db.insert(issues).values([
      {
        id: randomUUID(),
        companyId,
        title: "Done Task 1",
        status: "done",
        createdAt: threeHoursAgo,
        completedAt: twoHoursAgo,
      },
      {
        id: randomUUID(),
        companyId,
        title: "Cancelled Task 2",
        status: "cancelled",
        createdAt: threeHoursAgo,
      },
      {
        id: randomUUID(),
        companyId,
        title: "In Progress Task 3",
        status: "in_progress",
        createdAt: threeHoursAgo,
      },
    ]);

    const summary = await dashboardService(db).summary(companyId);

    // 1. Quota
    expect(summary.quota).toMatchObject({
      budgetMonthlyCents: 50000,
      spentMonthlyCents: 12500,
      utilizationPercent: 25,
      remainingCents: 37500,
    });

    // 2. Progress
    expect(summary.progress).toMatchObject({
      total: 3,
      done: 1,
      cancelled: 1,
      inProgress: 1,
      completionRatePercent: 33.3,
    });

    // 3. Idle
    expect(summary.idle.totalAgents).toBe(1);
    expect(summary.idle.agents[0]).toMatchObject({
      name: "PilotAgent",
      status: "running",
    });
    expect(summary.idle.agents[0].idleSeconds).toBeGreaterThan(7000);

    // 4. Delivery cycle (1 done task, 1 hour = 3600 sec)
    expect(summary.deliveryCycle.count).toBe(1);
    expect(summary.deliveryCycle.avgSeconds).toBe(3600);
    expect(summary.deliveryCycle.buckets.find((b) => b.label === "1-4小时")?.count).toBe(1);

    // 5. Efficiency
    expect(summary.efficiency.completedTasks24h).toBe(1);

    // 6. Failure rate (1 cancelled out of 3 total)
    expect(summary.failureRate.totalTasks).toBe(3);
    expect(summary.failureRate.cancelledTasks).toBe(1);
    expect(summary.failureRate.taskFailureRatePercent).toBe(33.3);

    // 7. Metrics object bundle
    expect(summary.metrics).toBeDefined();
    expect(summary.metrics.quota).toEqual(summary.quota);
    expect(summary.metrics.deliveryCycle).toEqual(summary.deliveryCycle);
  });
});
