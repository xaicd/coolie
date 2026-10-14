import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setupLiveEventsWebSocketServer } from "../realtime/live-events-ws.ts";
import {
  ACTIVE_RUN_IDLE_HEARTBEAT_INTERVAL_MS,
  startHeartbeatRunIdleHeartbeat,
} from "../services/heartbeat-run-idle-heartbeat.ts";

/**
 * COOA-177 WP2 — silent long-task heartbeat over the *real* WebSocket channel.
 *
 * `heartbeat-run-idle-heartbeat.test.ts` proves the timer fires `onTick` on the
 * interval, and `heartbeat-runtime-state.test.ts` proves the publisher emits on
 * the in-process `publishLiveEvent` emitter. Neither proves the last hop: that a
 * browser connected to `/api/companies/:id/events/ws` actually receives a
 * `heartbeat.run.progress` frame. This suite closes that gap by binding the
 * real `setupLiveEventsWebSocketServer`, connecting a real `ws` client, running
 * the real idle heartbeat with the real production publisher (`onTick`), and
 * asserting the frames arrive on the socket at the expected cadence.
 */

vi.doMock("../adapters/index.js", () => ({
  getServerAdapter: vi.fn(() => ({
    type: "process",
    execute: vi.fn(),
    testEnvironment: vi.fn(),
  })),
  runningProcesses: new Map(),
}));

const { publishHeartbeatRunRuntimeProgress } = await import("../services/heartbeat.ts");

const require = createRequire(import.meta.url);
const { WebSocket } = require("ws") as {
  WebSocket: new (url: string) => {
    readyState: number;
    send(data: string): void;
    close(): void;
    on(event: "open", listener: () => void): void;
    on(event: "message", listener: (data: Buffer | string) => void): void;
    on(event: "close", listener: () => void): void;
    on(event: "error", listener: (err: Error) => void): void;
  };
};

async function listen(server: HttpServer) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind a TCP port");
  return address.port;
}

function waitForOpen(ws: InstanceType<typeof WebSocket>) {
  return new Promise<void>((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
}

async function waitUntil(predicate: () => boolean, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("COOA-177 WP2 — silent long-task heartbeat over a real WebSocket", () => {
  const servers: HttpServer[] = [];
  const sockets: Array<InstanceType<typeof WebSocket>> = [];
  const wss: Array<{ close(cb?: () => void): void }> = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      try {
        socket.close();
      } catch {
        /* already closed */
      }
    }
    await Promise.all(
      wss.splice(0).map(
        (server) => new Promise<void>((resolve) => server.close(() => resolve())),
      ),
    );
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            if (!server.listening) return resolve();
            server.close(() => resolve());
          }),
      ),
    );
  });

  it("pushes heartbeat.run.progress frames to a connected client while a silent run idles", async () => {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const runId = randomUUID();
    const issueId = randomUUID();

    const server = createServer();
    servers.push(server);
    const wssServer = setupLiveEventsWebSocketServer(server, {} as never, {
      deploymentMode: "local_trusted",
    });
    wss.push(wssServer);
    const port = await listen(server);

    const client = new WebSocket(`ws://127.0.0.1:${port}/api/companies/${companyId}/events/ws`);
    sockets.push(client);

    const frames: Array<{ arrivedAt: number; frame: any }> = [];
    client.on("message", (data: Buffer | string) => {
      const text = typeof data === "string" ? data : data.toString("utf8");
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }
      if (parsed?.type === "heartbeat.run.progress" && parsed?.payload?.runId === runId) {
        frames.push({ arrivedAt: Date.now(), frame: parsed });
      }
    });

    await waitForOpen(client);

    // The production idle-heartbeat wiring: the timer refreshes the in-memory
    // runtime status and hands it to the real publisher, exactly as executeRun
    // does at heartbeat.ts (`onTick: (status) => publishHeartbeatRunRuntimeProgress(status)`).
    const stop = startHeartbeatRunIdleHeartbeat({
      companyId,
      agentId,
      runId,
      issueId,
      intervalMs: 25,
      onTick: (status) => publishHeartbeatRunRuntimeProgress(status),
    });

    try {
      await waitUntil(() => frames.length >= 5, 4_000);
    } finally {
      stop();
    }

    expect(frames.length).toBeGreaterThanOrEqual(5);

    // Every frame carries the run's identity so the console can bind it to the
    // live task row.
    for (const { frame } of frames) {
      expect(frame).toMatchObject({
        companyId,
        type: "heartbeat.run.progress",
        payload: expect.objectContaining({ runId, agentId, issueId }),
      });
    }

    // The heartbeats arrive faster than the production 10s ceiling, so a silent
    // long task never lets the console's live status expire.
    const gaps = frames.slice(1).map((entry, index) => entry.arrivedAt - frames[index]!.arrivedAt);
    expect(Math.max(...gaps)).toBeLessThan(ACTIVE_RUN_IDLE_HEARTBEAT_INTERVAL_MS);
  });

  it("keeps the production idle interval at or below the 10s console tolerance", () => {
    expect(ACTIVE_RUN_IDLE_HEARTBEAT_INTERVAL_MS).toBe(10_000);
  });
});
