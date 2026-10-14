// Long-task idle heartbeat (COOA-137).
//
// A long-running heartbeat run can go quiet for minutes while its adapter
// executes a heavy step — a full test run, a container build — that streams no
// output. The run's ephemeral runtime status is only refreshed when output or a
// structured adapter update arrives, so during that silence the status expires
// past its TTL and the console's live "Working… / X ago" line goes stale even
// though the run is alive. This scheduler emits a lightweight, non-blocking
// progress tick on a fixed interval so the frontend keeps receiving a heartbeat
// at least every `ACTIVE_RUN_IDLE_HEARTBEAT_INTERVAL_MS`, independent of
// adapter output.
//
// The tick does no I/O: it refreshes the in-memory runtime status and hands the
// snapshot to the caller's publisher. The caller owns lifecycle — start it when
// the run begins executing and stop it in the same scope's `finally`.

import {
  touchHeartbeatRunRuntimeStatus,
  type HeartbeatRunRuntimeStatus,
} from "./heartbeat-run-runtime-status.js";

/** Maximum idle time the console tolerates between two live progress ticks. */
export const ACTIVE_RUN_IDLE_HEARTBEAT_INTERVAL_MS = 10_000;

export interface StartHeartbeatRunIdleHeartbeatOptions {
  companyId: string;
  agentId: string;
  runId: string;
  issueId: string | null;
  /** Receives the refreshed runtime status so the caller can publish it. */
  onTick: (status: HeartbeatRunRuntimeStatus) => void;
  /** Skip a tick while the run is no longer live. Default: always tick. */
  isActive?: () => boolean;
  intervalMs?: number;
  /** Injectable timer + clock so tests can drive the interval deterministically. */
  setTimer?: (handler: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearTimer?: (timer: ReturnType<typeof setInterval>) => void;
  now?: () => Date;
}

/**
 * Start the idle heartbeat and return an idempotent stop function. The interval
 * is `unref`-ed so an idle timer never keeps the process alive.
 */
export function startHeartbeatRunIdleHeartbeat(
  options: StartHeartbeatRunIdleHeartbeatOptions,
): () => void {
  const intervalMs = options.intervalMs ?? ACTIVE_RUN_IDLE_HEARTBEAT_INTERVAL_MS;
  const now = options.now ?? (() => new Date());
  const setTimer =
    options.setTimer ?? ((handler: () => void, ms: number) => setInterval(handler, ms));
  const clearTimer = options.clearTimer ?? ((timer: ReturnType<typeof setInterval>) => clearInterval(timer));
  const isActive = options.isActive ?? (() => true);

  const timer = setTimer(() => {
    if (!isActive()) return;
    const status = touchHeartbeatRunRuntimeStatus({
      companyId: options.companyId,
      agentId: options.agentId,
      runId: options.runId,
      issueId: options.issueId,
      at: now(),
    });
    if (status) options.onTick(status);
  }, intervalMs);
  (timer as { unref?: () => void }).unref?.();

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    clearTimer(timer);
  };
}
