/**
 * Login-flow unit coverage for the two credential-auth routes no other suite
 * exercises.
 *
 *  - `GET /api/auth/session-token` — the active session token the App ↔ Web
 *    login bridge and native clients replay. It must never leak a session to a
 *    non-board actor, must fall back from the request's own session to the
 *    user's newest active session, must mint and persist one when none exists,
 *    and must sign the value the way Better Auth's `getSignedCookie` expects
 *    whenever the instance secret is available.
 *  - `POST /api/auth/register` — mobile self-registration. Its failure contract
 *    is what callers code against: every client-input failure is a 4xx carrying
 *    the Better Auth message, and a provider 5xx is clamped to a 400 so the
 *    client never sees a raw 501/502.
 *
 * `signUpWithEmailPassword` is unit-tested directly as the registration core.
 */

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import { errorHandler } from "../middleware/index.js";
import { authRoutes } from "../routes/auth.js";
import { signUpWithEmailPassword } from "../auth/better-auth.js";

type Row = Record<string, unknown>;

/**
 * Minimal Drizzle chain for the session-token route: `select(...).from(...).where(...)`
 * resolves the queued rows, and `.orderBy(...)` (used only by the fallback
 * query) resolves the same list. Successive `select` calls consume the queue in
 * order so a test can describe each query's answer independently.
 */
function thenable(rows: Row[]) {
  const promise = Promise.resolve(rows);
  return {
    then: promise.then.bind(promise),
    orderBy: () => promise,
  };
}

function createSessionTokenDb(selectResults: Row[][]) {
  let selectCall = 0;
  const inserted: Row[] = [];
  return {
    select: () => ({
      from: () => ({
        where: () => thenable(selectResults[selectCall++] ?? []),
      }),
    }),
    insert: () => ({
      values: (values: Row) => {
        inserted.push(values);
        return Promise.resolve();
      },
    }),
    inserted,
  };
}

type Actor = Express.Request["actor"];

function createApp(input: { actor: Actor; db: unknown; betterAuth?: unknown }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = input.actor;
    next();
  });
  app.use(
    "/api/auth",
    authRoutes(
      input.db as Db,
      { betterAuth: input.betterAuth } as Parameters<typeof authRoutes>[1],
    ),
  );
  app.use(errorHandler);
  return app;
}

const boardActor: Actor = {
  type: "board",
  userId: "user-1",
  sessionId: "session-1",
  source: "session",
};

async function expectedSignature(token: string, secret: string): Promise<string> {
  const crypto = await import("node:crypto");
  return crypto.createHmac("sha256", secret).update(token).digest("base64");
}

describe("GET /api/auth/session-token", () => {
  it("rejects a non-board actor without minting a session", async () => {
    const db = createSessionTokenDb([]);
    const app = createApp({ actor: { type: "none", source: "none" }, db });

    const res = await request(app).get("/api/auth/session-token");

    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
    expect(db.inserted).toHaveLength(0);
  });

  it("returns the request's own session token, signed with the instance secret", async () => {
    const db = createSessionTokenDb([[{ token: "raw-session-token" }]]);
    const app = createApp({
      actor: boardActor,
      db,
      betterAuth: { options: { secret: "unit-secret" } },
    });

    const res = await request(app).get("/api/auth/session-token");

    expect(res.status).toBe(200);
    expect(res.body.token).toBe(
      `raw-session-token.${await expectedSignature("raw-session-token", "unit-secret")}`,
    );
  });

  it("falls back to the user's newest active session when the request carries no session id", async () => {
    const db = createSessionTokenDb([[{ token: "raw-active-token" }]]);
    const app = createApp({
      actor: { type: "board", userId: "user-1", source: "board_key" },
      db,
      betterAuth: { options: { secret: "unit-secret" } },
    });

    const res = await request(app).get("/api/auth/session-token");

    expect(res.status).toBe(200);
    expect(res.body.token).toBe(
      `raw-active-token.${await expectedSignature("raw-active-token", "unit-secret")}`,
    );
  });

  it("mints and persists a new session when the user has none", async () => {
    const db = createSessionTokenDb([[]]);
    const app = createApp({
      actor: { type: "board", userId: "user-1", source: "board_key" },
      db,
      betterAuth: { options: { secret: "unit-secret" } },
    });

    const res = await request(app).get("/api/auth/session-token");

    expect(res.status).toBe(200);
    expect(db.inserted).toHaveLength(1);
    const minted = db.inserted[0]!;
    expect(minted).toMatchObject({ userId: "user-1" });
    const raw = minted.token as string;
    expect(raw).toMatch(/^[a-f0-9]{64}$/);
    expect((minted.expiresAt as Date).getTime()).toBeGreaterThan(Date.now());
    expect(res.body.token).toBe(
      `${raw}.${await expectedSignature(raw, "unit-secret")}`,
    );
  });

  it("returns the raw token unchanged when the instance has no secret", async () => {
    const db = createSessionTokenDb([[{ token: "raw-session-token" }]]);
    const app = createApp({ actor: boardActor, db });

    const res = await request(app).get("/api/auth/session-token");

    expect(res.status).toBe(200);
    expect(res.body.token).toBe("raw-session-token");
  });

  it("does not double-sign an already-signed session token", async () => {
    const signed = `${"s".repeat(32)}.${"A".repeat(43)}=`;
    const db = createSessionTokenDb([[{ token: signed }]]);
    const app = createApp({
      actor: boardActor,
      db,
      betterAuth: { options: { secret: "unit-secret" } },
    });

    const res = await request(app).get("/api/auth/session-token");

    expect(res.status).toBe(200);
    expect(res.body.token).toBe(signed);
  });
});

describe("POST /api/auth/register", () => {
  const validBody = {
    email: "jane@example.com",
    password: "supersecret",
    name: "Jane",
    companyName: "Acme",
  };

  it("rejects a missing field with a 400 before touching the auth provider", async () => {
    const calls: unknown[] = [];
    const db = createSessionTokenDb([]);
    const app = createApp({
      actor: { type: "none", source: "none" },
      db,
      betterAuth: {
        api: {
          signUpEmail: async (input: unknown) => {
            calls.push(input);
            throw new Error("the provider must not be reached");
          },
        },
      },
    });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "jane@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("password is required");
    expect(calls).toHaveLength(0);
  });

  it("answers 400 with the provider message when sign-up fails with a 4xx", async () => {
    const db = createSessionTokenDb([]);
    const app = createApp({
      actor: { type: "none", source: "none" },
      db,
      betterAuth: {
        api: {
          signUpEmail: async () =>
            new Response(JSON.stringify({ message: "User already exists" }), {
              status: 422,
              headers: { "content-type": "application/json" },
            }),
        },
      },
    });

    const res = await request(app).post("/api/auth/register").send(validBody);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("User already exists");
    expect(db.inserted).toHaveLength(0);
  });

  it("clamps a provider 5xx to a 400 so the client never sees a 501/502", async () => {
    const db = createSessionTokenDb([]);
    const app = createApp({
      actor: { type: "none", source: "none" },
      db,
      betterAuth: {},
    });

    const res = await request(app).post("/api/auth/register").send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Email sign-up is unavailable on this instance");
  });
});

describe("signUpWithEmailPassword", () => {
  const input = {
    email: "jane@example.com",
    password: "supersecret",
    name: "Jane",
    headers: new Headers(),
  };

  it("returns the created user and the session cookies Better Auth minted", async () => {
    const auth = {
      api: {
        signUpEmail: async () =>
          new Response(
            JSON.stringify({ user: { id: "user-1", email: "jane@example.com", name: "Jane" } }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
                "set-cookie": "paperclip-default.session_token=abc; Path=/",
              },
            },
          ),
      },
    };

    const outcome = await signUpWithEmailPassword(auth, input);

    expect(outcome).toEqual({
      ok: true,
      user: { id: "user-1", email: "jane@example.com", name: "Jane" },
      setCookies: ["paperclip-default.session_token=abc; Path=/"],
    });
  });

  it("reports 501 when the instance exposes no email sign-up endpoint", async () => {
    const outcome = await signUpWithEmailPassword({}, input);

    expect(outcome).toEqual({
      ok: false,
      status: 501,
      message: "Email sign-up is unavailable on this instance",
    });
  });

  it("reports 502 when the endpoint does not return a Response", async () => {
    const outcome = await signUpWithEmailPassword(
      { api: { signUpEmail: async () => ({}) } },
      input,
    );

    expect(outcome).toEqual({
      ok: false,
      status: 502,
      message: "Unexpected sign-up response from the auth handler",
    });
  });

  it("surfaces the provider message for a failed sign-up", async () => {
    const auth = {
      api: {
        signUpEmail: async () =>
          new Response(JSON.stringify({ message: "Password too short" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          }),
      },
    };

    const outcome = await signUpWithEmailPassword(auth, input);

    expect(outcome).toEqual({ ok: false, status: 400, message: "Password too short" });
  });

  it("falls back to a status-derived message when the provider sends none", async () => {
    const auth = {
      api: {
        signUpEmail: async () =>
          new Response("", {
            status: 500,
            headers: { "content-type": "application/json" },
          }),
      },
    };

    const outcome = await signUpWithEmailPassword(auth, input);

    expect(outcome).toEqual({ ok: false, status: 500, message: "Sign-up failed (500)" });
  });
});
