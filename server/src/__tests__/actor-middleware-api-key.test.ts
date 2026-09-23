import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
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