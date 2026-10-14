import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_RUN_IDLE_HEARTBEAT_INTERVAL_MS,
  startHeartbeatRunIdleHeartbeat,
} from "./heartbeat-run-idle-heartbeat.js";
import {
  clearAllHeartbeatRunRuntimeStatuses,
  getHeartbeatRunRuntimeStatus,
  setHeartbeatRunRuntimeStatus,
} from "./heartbeat-run-runtime-status.js";

describe("heartbeat run idle heartbeat", () => {
  afterEach(() => {
    clearAllHeartbeatRunRuntimeStatuses();
    vi.useRealTimers();
  });

  it("publishes a progress tick every interval while preserving status context", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T00:00:00.000Z"));
    setHeartbeatRunRuntimeStatus({
      companyId: "company-1",
      issueId: "issue-1",
      agentId: "agent-1",
      runId: "run-1",
      phase: "run_activity",
      message: "Using Bash",
      currentToolName: "Bash",
      updatedAt: new Date("2026-06-24T00:00:00.000Z"),
      lastEventAt: new Date("2026-06-24T00:00:00.000Z"),
    });

    const ticks: string[] = [];
    startHeartbeatRunIdleHeartbeat({
      companyId: "company-1",
      agentId: "agent-1",
      runId: "run-1",
      issueId: "issue-1",
      onTick: (status) => ticks.push(status.message),
    });

    // No tick before the first interval elapses.
    expect(ticks).toEqual([]);

    vi.advanceTimersByTime(ACTIVE_RUN_IDLE_HEARTBEAT_INTERVAL_MS);
    vi.advanceTimersByTime(ACTIVE_RUN_IDLE_HEARTBEAT_INTERVAL_MS);

    expect(ticks).toEqual(["Using Bash", "Using Bash"]);
    // The store stays fresh well past its TTL because the heartbeat refreshed it.
    expect(
      getHeartbeatRunRuntimeStatus("run-1", {
        companyId: "company-1",
        now: new Date("2026-06-24T00:00:20.000Z"),
      }),
    ).toMatchObject({ message: "Using Bash", currentToolName: "Bash" });
  });

  it("keeps a silent run fresh past the runtime-status TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T00:00:00.000Z"));
    // Seed an active status, then let the heartbeat carry it well past the 90s
    // TTL that would otherwise expire it during a long, silent step.
    setHeartbeatRunRuntimeStatus({
      companyId: "company-1",
      issueId: "issue-1",
      agentId: "agent-1",
      runId: "run-1",
      phase: "adapter_startup",
      message: "Starting adapter",
      updatedAt: new Date("2026-06-24T00:00:00.000Z"),
    });

    startHeartbeatRunIdleHeartbeat({
      companyId: "company-1",
      agentId: "agent-1",
      runId: "run-1",
      issueId: "issue-1",
      onTick: () => {},
    });

    vi.advanceTimersByTime(5 * ACTIVE_RUN_IDLE_HEARTBEAT_INTERVAL_MS);

    expect(
      getHeartbeatRunRuntimeStatus("run-1", {
        companyId: "company-1",
        now: new Date("2026-06-24T00:00:50.000Z"),
      }),
    ).toMatchObject({ message: "Starting adapter" });
  });

  it("skips ticks while the run is no longer active", () => {
    vi.useFakeTimers();
    let active = true;
    const onTick = vi.fn();
    startHeartbeatRunIdleHeartbeat({
      companyId: "company-1",
      agentId: "agent-1",
      runId: "run-1",
      issueId: null,
      isActive: () => active,
      onTick,
    });

    vi.advanceTimersByTime(ACTIVE_RUN_IDLE_HEARTBEAT_INTERVAL_MS);
    expect(onTick).toHaveBeenCalledTimes(1);

    active = false;
    vi.advanceTimersByTime(3 * ACTIVE_RUN_IDLE_HEARTBEAT_INTERVAL_MS);
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it("stops ticking after stop and stop is idempotent", () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const stop = startHeartbeatRunIdleHeartbeat({
      companyId: "company-1",
      agentId: "agent-1",
      runId: "run-1",
      issueId: null,
      onTick,
    });

    vi.advanceTimersByTime(ACTIVE_RUN_IDLE_HEARTBEAT_INTERVAL_MS);
    expect(onTick).toHaveBeenCalledTimes(1);

    stop();
    stop();
    vi.advanceTimersByTime(3 * ACTIVE_RUN_IDLE_HEARTBEAT_INTERVAL_MS);
    expect(onTick).toHaveBeenCalledTimes(1);
  });
});
