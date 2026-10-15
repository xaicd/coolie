import { createHash } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { authUsers, boardApiKeys } from "@paperclipai/db";
import { actorMiddleware } from "../middleware/auth.js";

function createStubDb() {
  return {
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: () => Promise.resolve(undefined), onConflictDoNothing: () => Promise.resolve(undefined) }) }),
    delete: () => ({ where: () => Promise.resolve(undefined) }),
  } as any;
}

function buildApp(apiKey: string | null | undefined) {
  const app = express();
  app.use(actorMiddleware(createStubDb(), {
    deploymentMode: "authenticated",
    apiKey: apiKey ?? null,
    resolveSession: async () => null,
  }));
  app.get("/actor", (req, res) => {
    res.json(req.actor);
  });
  return app;
}

describe("actorMiddleware x-paperclip-api-key bypass", () => {
  it("elevates a matching x-paperclip-api-key header to a board actor on authenticated", async () => {
    const app = buildApp("loopback-concierge-secret");
    const res = await request(app)
      .get("/actor")
      .set("x-paperclip-api-key", "loopback-concierge-secret");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      type: "board",
      userId: "paperclip-concierge",
      userName: "Paperclip Board Concierge",
      userEmail: null,
      isInstanceAdmin: true,
      source: "api_key",
    });
  });

  it("rejects a mismatched x-paperclip-api-key header with no elevation", async () => {
    const app = buildApp("loopback-concierge-secret");
    const res = await request(app)
      .get("/actor")
      .set("x-paperclip-api-key", "wrong-key");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ type: "none", source: "none" });
  });

  it("ignores the bypass entirely when no apiKey is configured", async () => {
    const app = buildApp(null);
    const res = await request(app)
      .get("/actor")
      .set("x-paperclip-api-key", "any-value");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ type: "none", source: "none" });
  });

  it("trims whitespace from the configured apiKey (env-file tolerance)", async () => {
    const app = buildApp("  loopback-concierge-secret  ");
    const res = await request(app)
      .get("/actor")
      .set("x-paperclip-api-key", "loopback-concierge-secret");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ type: "board", source: "api_key" });
  });

  it("propagates x-paperclip-run-id through to the api_key actor", async () => {
    const app = buildApp("loopback-concierge-secret");
    const res = await request(app)
      .get("/actor")
      .set("x-paperclip-api-key", "loopback-concierge-secret")
      .set("x-paperclip-run-id", "run-1234");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      type: "board",
      source: "api_key",
      runId: "run-1234",
    });
  });
});

// wave380: the fork's MCP client may present a real board key (not just the
// loopback concierge key) on the board channel, declared with
// PAPERCLIP_MCP_TOKEN_TYPE=board|user. The middleware resolves it to a board
// actor; a value that matches no board key is ignored and never a 401.
describe("actorMiddleware board-channel x-paperclip-api-key (wave380)", () => {
  const boardToken = `pcp_board_${"a".repeat(48)}`;
  const boardTokenHash = createHash("sha256").update(boardToken).digest("hex");
  const boardUserId = "11111111-1111-4111-8111-111111111111";

  // findBoardApiKeyByToken hashes the token itself and queries by hash, so the
  // stub reads the hash back out of the drizzle `where(...)` node and answers
  // like a hash-keyed lookup would — otherwise every value would "match".
  function hashIn(cond: unknown): string | null {
    let found: string | null = null;
    const walk = (value: unknown, depth = 0) => {
      if (found || depth > 6 || value === null || typeof value !== "object") return;
      const asRecord = value as Record<string, unknown>;
      if (typeof asRecord.value === "string" && /^[0-9a-f]{64}$/.test(asRecord.value)) {
        found = asRecord.value;
        return;
      }
      for (const key of Object.keys(asRecord)) walk(asRecord[key], depth + 1);
    };
    walk(cond);
    return found;
  }

  function buildBoardKeyApp() {
    const boardRow = {
      id: "22222222-2222-4222-8222-222222222222",
      userId: boardUserId,
      keyHash: boardTokenHash,
      name: "board-channel-probe",
      revokedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      lastUsedAt: null,
    };
    const db = {
      select: () => ({
        from: (table: unknown) => ({
          where: (cond: unknown) => {
            if (table === boardApiKeys) {
              return Promise.resolve(hashIn(cond) === boardTokenHash ? [boardRow] : []);
            }
            if (table === authUsers) {
              return Promise.resolve([{ id: boardUserId, name: "Board User", email: "board@example.com" }]);
            }
            return Promise.resolve([]);
          },
        }),
      }),
      update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
      insert: () => ({ values: () => Promise.resolve([]) }),
      delete: () => ({ where: () => Promise.resolve([]) }),
    } as any;

    const app = express();
    app.use(actorMiddleware(db, {
      deploymentMode: "authenticated",
      apiKey: null,
      resolveSession: async () => null,
    }));
    app.get("/actor", (req, res) => {
      res.json(req.actor);
    });
    return app;
  }

  it("promotes a real board key on x-paperclip-api-key to a board actor", async () => {
    const res = await request(buildBoardKeyApp())
      .get("/actor")
      .set("x-paperclip-api-key", boardToken);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      type: "board",
      userId: boardUserId,
      source: "board_key",
    });
  });

  it("ignores an unrecognized x-paperclip-api-key value without a 401", async () => {
    const res = await request(buildBoardKeyApp())
      .get("/actor")
      .set("x-paperclip-api-key", "not-a-board-key");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ type: "none", source: "none" });
  });
});