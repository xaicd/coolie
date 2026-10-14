import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  activityLog,
  agents,
  companies,
  createDb,
  heartbeatRunEvents,
  heartbeatRuns,
  issues,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";

/**
 * COOA-177 WP1 — single-person checkout lock self-heal, end to end.
 *
 * The existing `recovery-stale-issue-lock-sweep` suite proves the process-death
 * authority with a fabricated pid (`2_000_000_000`) that can never be alive.
 * This suite proves the same recovery path against a *real* process: it spawns
 * a child, records the child's live pid on the heartbeat run that holds the
 * issue checkout lock, hard-kills that process with `SIGKILL` (`kill -9`), and
 * then asserts that the recovery sweep
 *
 *   1. does NOT release the lock while the holder process is still alive,
 *   2. releases the lock once the process is gone, well inside the 5-minute
 *      lease window, and
 *   3. writes the `issue.stale_lock_cleared` recovery audit event.
 *
 * That is the "底座自愈" (self-heal) acceptance claim: a hard server/container
 * kill cannot leave a task permanently checked out.
 */

const mockTelemetryClient = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("../telemetry.ts", () => ({ getTelemetryClient: () => mockTelemetryClient }));

import { heartbeatService } from "../services/heartbeat.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres COOA-177 lock self-heal tests on this host: ${
      embeddedPostgresSupport.reason ?? "unsupported environment"
    }`,
  );
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

function isPidAlive(pid: number | null | undefined): boolean {
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForPidExit(pid: number, timeoutMs = 3_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return !isPidAlive(pid);
}

describeEmbeddedPostgres("COOA-177 WP1 — kill -9 checkout lock self-heal", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  const spawned: ChildProcess[] = [];

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("cooa177-lock-selfheal-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    for (const child of spawned.splice(0)) {
      if (child.pid && isPidAlive(child.pid)) child.kill("SIGKILL");
    }
    mockTelemetryClient.track.mockClear();
    await db.delete(heartbeatRunEvents);
    await db.delete(activityLog);
    await db.delete(issues);
    await db.delete(heartbeatRuns);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedLockHolder(pid: number) {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const runId = randomUUID();
    const issueId = randomUUID();

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
    await db.insert(heartbeatRuns).values({
      id: runId,
      companyId,
      agentId,
      status: "running",
      invocationSource: "assignment",
      startedAt: new Date(),
      processPid: pid,
      processStartedAt: new Date(),
      runtimeMode: "legacy",
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Single-person checkout lock held by a run whose process was killed",
      status: "in_progress",
      priority: "high",
      assigneeAgentId: agentId,
      checkoutRunId: runId,
      executionRunId: runId,
      executionLockedAt: new Date(),
    });

    return { companyId, agentId, runId, issueId };
  }

  it("keeps the lock while the holder process is alive, then releases it once the process is SIGKILLed and records the recovery audit", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    spawned.push(child);
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    const pid = child.pid;
    expect(typeof pid).toBe("number");
    expect(isPidAlive(pid)).toBe(true);

    const { runId, issueId } = await seedLockHolder(pid!);
    const heartbeat = heartbeatService(db);

    // Process-death authority must not fire while the holder is alive: the lock
    // stays held and no premature self-heal happens.
    const held = await heartbeat.sweepStaleIssueLocks();
    expect(held.cleared).toBe(0);
    expect(held.terminalizedRunIds).toEqual([]);
    const lockedWhileAlive = await db
      .select({ checkoutRunId: issues.checkoutRunId, executionRunId: issues.executionRunId })
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0]);
    expect(lockedWhileAlive).toEqual({ checkoutRunId: runId, executionRunId: runId });

    // Simulate a hard server/container kill: SIGKILL (kill -9) the process that
    // owns the run, then let the OS reap it.
    const killedAt = Date.now();
    child.kill("SIGKILL");
    expect(await waitForPidExit(pid!)).toBe(true);
    expect(isPidAlive(pid)).toBe(false);

    const swept = await heartbeat.sweepStaleIssueLocks();
    const releasedAfterMs = Date.now() - killedAt;

    // 1. The run is terminalized and the lock is released.
    expect(swept.terminalizedRunIds).toEqual([runId]);
    expect(swept.cleared).toBe(1);
    // 2. Auto-unlock lands well inside the 5-minute lease window.
    expect(releasedAfterMs).toBeLessThan(FIVE_MINUTES_MS);

    const run = await db
      .select({ status: heartbeatRuns.status, errorCode: heartbeatRuns.errorCode })
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, runId))
      .then((rows) => rows[0]);
    expect(run?.status).toBe("interrupted");
    expect(run?.errorCode).toBe("orphaned_running_run");

    const lock = await db
      .select({
        checkoutRunId: issues.checkoutRunId,
        executionRunId: issues.executionRunId,
        executionLockedAt: issues.executionLockedAt,
      })
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0]);
    expect(lock).toMatchObject({
      checkoutRunId: null,
      executionRunId: null,
      executionLockedAt: null,
    });

    // 3. The recovery audit event records what was released.
    const audit = await db
      .select({
        action: activityLog.action,
        actorType: activityLog.actorType,
        details: activityLog.details,
      })
      .from(activityLog)
      .where(and(eq(activityLog.entityId, issueId), eq(activityLog.action, "issue.stale_lock_cleared")))
      .then((rows) => rows[0]);
    expect(audit).toBeTruthy();
    expect(audit?.actorType).toBe("system");
    expect(audit?.details).toMatchObject({
      source: "recovery.sweep_stale_issue_locks",
      clearedCheckoutRunId: runId,
      clearedExecutionRunId: runId,
    });
  });
});
