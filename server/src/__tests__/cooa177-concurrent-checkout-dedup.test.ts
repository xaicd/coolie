import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  agents,
  companies,
  createDb,
  heartbeatRuns,
  issueComments,
  issues,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";

/**
 * COOA-177 WP4 — concurrent checkout / dispatch must produce zero duplicate
 * execution.
 *
 * The atomic lock is a single compare-and-swap UPDATE on the issue row. This
 * suite fires many `checkout` calls at once, each from a *different* live run
 * racing for the same issue, and asserts the platform invariant that survives
 * a burst: exactly one run wins the lock, every loser is rejected, and only the
 * winning run passes `assertCheckoutOwner`. Because every agent write path is
 * gated on `assertCheckoutOwner`, "one lock holder per issue" is exactly "zero
 * duplicate execution" for concurrent dispatch.
 */

import { issueService } from "../services/issues.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres COOA-177 concurrency tests on this host: ${
      embeddedPostgresSupport.reason ?? "unsupported environment"
    }`,
  );
}

describeEmbeddedPostgres("COOA-177 WP4 — concurrent checkout zero-duplicate-execution", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("cooa177-concurrent-checkout-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(issueComments);
    await db.delete(issues);
    await db.delete(heartbeatRuns);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedContendedIssue(runCount: number) {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const issueId = randomUUID();
    const runIds = Array.from({ length: runCount }, () => randomUUID());

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Coder",
      role: "engineer",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });
    // Every contending run is live ("running"), so a loser cannot adopt the
    // winner's lock by mistake: only a stale lock is adoptable.
    await db.insert(heartbeatRuns).values(
      runIds.map((id) => ({
        id,
        companyId,
        agentId,
        status: "running",
        invocationSource: "assignment",
        startedAt: new Date(),
      })),
    );
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Contended checkout",
      status: "todo",
      priority: "high",
    });

    return { companyId, agentId, issueId, runIds };
  }

  it("lets exactly one of many racing runs win the checkout lock", async () => {
    const { agentId, issueId, runIds } = await seedContendedIssue(8);
    const svc = issueService(db);

    const results = await Promise.allSettled(
      runIds.map((runId) => svc.checkout(issueId, agentId, ["todo"], runId)),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(runIds.length - 1);

    const winnerIndex = results.findIndex((r) => r.status === "fulfilled");
    const winnerRunId = runIds[winnerIndex]!;

    const lock = await db
      .select({
        status: issues.status,
        assigneeAgentId: issues.assigneeAgentId,
        checkoutRunId: issues.checkoutRunId,
        executionRunId: issues.executionRunId,
      })
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0]);
    expect(lock).toMatchObject({
      status: "in_progress",
      assigneeAgentId: agentId,
      checkoutRunId: winnerRunId,
      executionRunId: winnerRunId,
    });

    // Zero duplicate execution: only the lock holder is authorized to act.
    const holdsLock = await Promise.all(
      runIds.map(async (runId) => {
        try {
          const ownership = await svc.assertCheckoutOwner(issueId, agentId, runId);
          return ownership.checkoutRunId === runId;
        } catch {
          return false;
        }
      }),
    );
    expect(holdsLock.filter(Boolean)).toHaveLength(1);
    expect(holdsLock[runIds.indexOf(winnerRunId)]).toBe(true);
  });

  it("is idempotent when the same run re-checks-out concurrently", async () => {
    const { agentId, issueId, runIds } = await seedContendedIssue(4);
    const svc = issueService(db);
    const [winnerRunId] = runIds;

    const first = await svc.checkout(issueId, agentId, ["todo"], winnerRunId!);
    expect(first.checkoutRunId).toBe(winnerRunId);

    const repeated = await Promise.all(
      Array.from({ length: 6 }, () =>
        svc.checkout(issueId, agentId, ["in_progress"], winnerRunId!),
      ),
    );
    expect(repeated.every((row) => row.checkoutRunId === winnerRunId)).toBe(true);

    const lock = await db
      .select({ checkoutRunId: issues.checkoutRunId, executionRunId: issues.executionRunId })
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0]);
    expect(lock).toEqual({ checkoutRunId: winnerRunId, executionRunId: winnerRunId });
  });
});
