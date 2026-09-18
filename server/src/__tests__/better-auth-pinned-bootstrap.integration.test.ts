/**
 * The pinned-email bootstrap, driven through the real Better Auth mount.
 *
 * The unit suite proves what `claimBootstrapAdminByEmail` decides; this one
 * proves the two hooks that call it actually fire on sign-up and on sign-in,
 * against the real Drizzle schema. The sign-in case is the one that matters in
 * practice: an operator registers, *then* pins their address, so the grant has
 * to happen on the next sign-in rather than at account creation. It is also the
 * only case that exercises the session hook's email lookup.
 */

import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { authUsers, createDb, instanceUserRoles } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { createBetterAuthHandler, createBetterAuthInstance } from "../auth/better-auth.js";
import type { Config } from "../config.js";

const ORIGIN = "http://127.0.0.1:41998";
const PINNED = "founder@example.com";
const OTHER = "teammate@example.com";
const PASSWORD = "correct-horse-battery-staple";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbeddedPostgres("pinned-email bootstrap through Better Auth", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db!: ReturnType<typeof createDb>;
  const originalEnv = {
    secret: process.env.BETTER_AUTH_SECRET,
    rateLimit: process.env.PAPERCLIP_AUTH_RATE_LIMIT_ENABLED,
  };

  // Only the auth-relevant fields are read by `createBetterAuthInstance`.
  function testConfig(bootstrapAdminEmail?: string): Config {
    return {
      deploymentMode: "authenticated",
      deploymentExposure: "public",
      authBaseUrlMode: "explicit",
      authPublicBaseUrl: ORIGIN,
      authDisableSignUp: false,
      allowedHostnames: ["127.0.0.1"],
      port: 41998,
      bootstrapAdminEmail,
    } as unknown as Config;
  }

  function mountAuth(bootstrapAdminEmail?: string) {
    const app = express();
    app.all(
      "/api/auth/{*authPath}",
      createBetterAuthHandler(createBetterAuthInstance(db, testConfig(bootstrapAdminEmail), [ORIGIN])),
    );
    return app;
  }

  function signUp(app: express.Express, email: string) {
    return request(app)
      .post("/api/auth/sign-up/email")
      .set("origin", ORIGIN)
      .send({ email, password: PASSWORD, name: "Founder" });
  }

  function signIn(app: express.Express, email: string) {
    return request(app)
      .post("/api/auth/sign-in/email")
      .set("origin", ORIGIN)
      .send({ email, password: PASSWORD });
  }

  async function adminUserIds() {
    const rows = await db.select().from(instanceUserRoles);
    return rows.filter((row) => row.role === "instance_admin").map((row) => row.userId);
  }

  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET = "better-auth-secret-for-pinned-bootstrap-tests";
    process.env.PAPERCLIP_AUTH_RATE_LIMIT_ENABLED = "false";

    database = await startEmbeddedPostgresTestDatabase("paperclip-pinned-bootstrap-");
    db = createDb(database.connectionString);
  }, 30_000);

  afterEach(async () => {
    await db.delete(instanceUserRoles);
    await db.delete(authUsers);
  });

  afterAll(async () => {
    await database?.cleanup();
    if (originalEnv.secret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = originalEnv.secret;
    if (originalEnv.rateLimit === undefined) delete process.env.PAPERCLIP_AUTH_RATE_LIMIT_ENABLED;
    else process.env.PAPERCLIP_AUTH_RATE_LIMIT_ENABLED = originalEnv.rateLimit;
  });

  it("grants instance admin on sign-up with the pinned address", async () => {
    const app = mountAuth(PINNED);
    const response = await signUp(app, PINNED);

    expect(response.status).toBe(200);
    expect(await adminUserIds()).toEqual([response.body?.user?.id]);
  });

  it("grants on sign-in when the account already existed before the pin", async () => {
    const beforePin = await signUp(mountAuth(), PINNED);
    expect(beforePin.status).toBe(200);
    expect(await adminUserIds()).toEqual([]);

    const response = await signIn(mountAuth(PINNED), PINNED);

    expect(response.status).toBe(200);
    expect(await adminUserIds()).toEqual([beforePin.body?.user?.id]);
  });

  it("never grants an address the operator did not pin", async () => {
    const app = mountAuth(PINNED);
    const pinned = await signUp(app, PINNED);
    const other = await signUp(app, OTHER);

    expect(other.status).toBe(200);
    expect(await adminUserIds()).toEqual([pinned.body?.user?.id]);
  });

  it("grants nothing when no address is pinned", async () => {
    const app = mountAuth();
    const response = await signUp(app, PINNED);

    expect(response.status).toBe(200);
    expect(await adminUserIds()).toEqual([]);
  });

  it("keeps the instance at one admin across later sign-ins", async () => {
    const app = mountAuth(PINNED);
    const first = await signUp(app, PINNED);
    expect(await adminUserIds()).toEqual([first.body?.user?.id]);

    const again = await signIn(app, PINNED);

    expect(again.status).toBe(200);
    expect(await adminUserIds()).toEqual([first.body?.user?.id]);
  });
});
