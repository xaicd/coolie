/**
 * Wave 80 — App ↔ Web full-feature login sharing (PAP-board-bridge).
 *
 * The Coolie App authenticates with email/password and stores the resulting
 * Better Auth session token in `expo-secure-store`. The Web full-feature
 * board lives in a WebView with its own cookie jar — without help, the jar
 * never sees the token and the user lands on the sign-in screen again.
 *
 * The bridge closes that gap. This suite proves the validator, cookie writer,
 * redirect sanitizer, and end-to-end handler all behave correctly: a valid
 * token becomes a real `Set-Cookie` header plus a 302 redirect, a missing or
 * forged token becomes a 401 with no cookie, and a hostile `next` query value
 * never turns the bridge into an open redirect.
 */

import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { authUsers } from "@paperclipai/db";
import { authRoutes } from "../routes/auth.js";
import {
  buildAppWebLoginBridgeCookie,
  isAppWebLoginBridgeRequestSecure,
  runAppWebLoginBridge,
  sanitizeAppWebLoginBridgeNext,
  validateAppWebLoginBridgeToken,
} from "../auth/app-web-login-bridge.js";

const SESSION_ID = "session-bridge-1";
const USER_ID = "user-bridge-1";
const TOKEN = "raw-bridge-token-aaaaaaaa.bbbbbbbb";

function createAuthStub(opts: {
  acceptToken?: string | null;
  userId?: string | null;
}) {
  return {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const cookie = headers.get("cookie") ?? "";
        const match = cookie.match(/session_token=([^;]+)/);
        const presented = match ? decodeURIComponent(match[1] ?? "") : null;
        if (!presented || presented !== opts.acceptToken) return null;
        if (!opts.userId) return null;
        return {
          session: { id: SESSION_ID, userId: opts.userId },
          user: { id: opts.userId },
        };
      },
    },
  };
}

function createSelectChain(row: Record<string, unknown> | null) {
  return {
    from() {
      return {
        where() {
          return Promise.resolve(row ? [row] : []);
        },
      };
    },
  };
}

function createDb(row: Record<string, unknown> | null = null) {
  return {
    select: () => createSelectChain(row),
    update: () => ({
      set() {
        return {
          where() {
            return {
              returning() {
                return Promise.resolve([row]);
              },
            };
          },
        };
      },
    }),
  } as any;
}

function createBridgeApp(opts: { auth: unknown; row?: Record<string, unknown> | null }) {
  const app = express();
  app.use((req, _res, next) => {
    // The bridge runs without a board actor — the token itself is the credential.
    req.actor = { type: "none", source: "none" };
    next();
  });
  app.use(
    "/api/auth",
    authRoutes(createDb(opts.row ?? null), { betterAuth: opts.auth as any }),
  );
  return app;
}

const ORIGINAL_INSTANCE_ID = process.env.PAPERCLIP_INSTANCE_ID;

afterEach(() => {
  if (ORIGINAL_INSTANCE_ID === undefined) delete process.env.PAPERCLIP_INSTANCE_ID;
  else process.env.PAPERCLIP_INSTANCE_ID = ORIGINAL_INSTANCE_ID;
});

describe.sequential("app-web-login-bridge validators", () => {
  it("rejects an empty token before touching Better Auth", async () => {
    const calls: Array<{ headers: Headers }> = [];
    const auth = {
      api: {
        getSession: async (input: { headers: Headers }) => {
          calls.push(input);
          return { session: { id: SESSION_ID, userId: USER_ID }, user: { id: USER_ID } };
        },
      },
    };

    const result = await validateAppWebLoginBridgeToken(auth, { token: "" });
    expect(result).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("returns the userId for a token Better Auth recognises", async () => {
    const auth = createAuthStub({ acceptToken: TOKEN, userId: USER_ID });
    const result = await validateAppWebLoginBridgeToken(auth, { token: TOKEN });
    expect(result).toEqual({ userId: USER_ID });
  });

  it("returns null when Better Auth rejects the token", async () => {
    const auth = createAuthStub({ acceptToken: "different-token", userId: USER_ID });
    const result = await validateAppWebLoginBridgeToken(auth, { token: TOKEN });
    expect(result).toBeNull();
  });

  it("returns null when Better Auth returns a session whose userId disagrees with the user payload", async () => {
    const auth = {
      api: {
        getSession: async () => ({
          session: { id: SESSION_ID, userId: "user-a" },
          user: { id: "user-b" },
        }),
      },
    };
    const result = await validateAppWebLoginBridgeToken(auth, { token: TOKEN });
    expect(result).toBeNull();
  });

  it("uses the instance-scoped cookie name so a worktree token never validates against default", async () => {
    process.env.PAPERCLIP_INSTANCE_ID = "pap-worktree";
    const seenCookies: string[] = [];
    const auth = {
      api: {
        getSession: async ({ headers }: { headers: Headers }) => {
          seenCookies.push(headers.get("cookie") ?? "");
          return null;
        },
      },
    };

    await validateAppWebLoginBridgeToken(auth, { token: TOKEN });

    expect(seenCookies[0]).toMatch(/^paperclip-pap-worktree\.session_token=/);
    expect(seenCookies[0]).not.toMatch(/paperclip-default\.session_token=/);
  });

  it("prefixes the cookie name with __Secure- when secure=true so HTTPS validation works", async () => {
    process.env.PAPERCLIP_INSTANCE_ID = "default";
    const seenCookies: string[] = [];
    const auth = {
      api: {
        getSession: async ({ headers }: { headers: Headers }) => {
          seenCookies.push(headers.get("cookie") ?? "");
          return null;
        },
      },
    };

    await validateAppWebLoginBridgeToken(auth, { token: TOKEN, secure: true });

    expect(seenCookies[0]).toMatch(/^__Secure-paperclip-default\.session_token=/);
  });

  it("omits the __Secure- prefix when secure=false so HTTP loopback validation works", async () => {
    process.env.PAPERCLIP_INSTANCE_ID = "default";
    const seenCookies: string[] = [];
    const auth = {
      api: {
        getSession: async ({ headers }: { headers: Headers }) => {
          seenCookies.push(headers.get("cookie") ?? "");
          return null;
        },
      },
    };

    await validateAppWebLoginBridgeToken(auth, { token: TOKEN, secure: false });

    expect(seenCookies[0]).toMatch(/^paperclip-default\.session_token=/);
    expect(seenCookies[0]).not.toContain("__Secure-");
  });

  it("returns null when Better Auth's getSession throws", async () => {
    const auth = {
      api: {
        getSession: async () => {
          throw new Error("storage down");
        },
      },
    };
    const result = await validateAppWebLoginBridgeToken(auth, { token: TOKEN });
    expect(result).toBeNull();
  });
});

describe.sequential("app-web-login-bridge cookie format", () => {
  it("writes the Secure-prefixed name with the Secure attribute over HTTPS", async () => {
    process.env.PAPERCLIP_INSTANCE_ID = "default";
    const cookie = await buildAppWebLoginBridgeCookie({ token: TOKEN, secure: true });
    expect(cookie.startsWith(`__Secure-paperclip-default.session_token=${TOKEN}; `)).toBe(true);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=604800");
    expect(cookie).toContain("Secure");
  });

  it("writes the plain name without the Secure attribute over HTTP", async () => {
    process.env.PAPERCLIP_INSTANCE_ID = "default";
    const cookie = await buildAppWebLoginBridgeCookie({ token: TOKEN, secure: false });
    expect(cookie.startsWith(`paperclip-default.session_token=${TOKEN}; `)).toBe(true);
    expect(cookie).not.toContain("__Secure-");
    expect(cookie).not.toMatch(/;\s*Secure(?:\b|$)/);
  });

  it("signs a raw token when the auth secret is available", async () => {
    process.env.PAPERCLIP_INSTANCE_ID = "default";
    const cookie = await buildAppWebLoginBridgeCookie({ token: TOKEN, secure: true, secret: "test-secret" });
    const value = cookie.slice("__Secure-paperclip-default.session_token=".length).split(";")[0];
    const decoded = decodeURIComponent(value);
    expect(decoded.startsWith(`${TOKEN}.`)).toBe(true);
    const signature = decoded.slice(TOKEN.length + 1);
    expect(signature).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    // Better Auth verifies the signature against the token with the same secret.
    const crypto = await import("node:crypto");
    const expected = crypto.createHmac("sha256", "test-secret").update(TOKEN).digest("base64");
    expect(signature).toBe(expected);
  });

  it("does not double-sign an already-signed token", async () => {
    process.env.PAPERCLIP_INSTANCE_ID = "default";
    const signed = `${TOKEN}.${"A".repeat(43)}=`;
    const cookie = await buildAppWebLoginBridgeCookie({ token: signed, secure: false, secret: "test-secret" });
    expect(cookie.startsWith(`paperclip-default.session_token=${encodeURIComponent(signed)}; `)).toBe(true);
  });
});

describe.sequential("app-web-login-bridge next-path sanitization", () => {
  it("keeps a clean root-relative path", () => {
    expect(sanitizeAppWebLoginBridgeNext("/XROA/issues/PAP-123")).toBe(
      "/XROA/issues/PAP-123",
    );
  });

  it("falls back to / for an absolute URL", () => {
    expect(sanitizeAppWebLoginBridgeNext("https://evil.example/x")).toBe("/");
  });

  it("falls back to / for a protocol-relative URL", () => {
    expect(sanitizeAppWebLoginBridgeNext("//evil.example/x")).toBe("/");
  });

  it("falls back to / for an empty or non-string value", () => {
    expect(sanitizeAppWebLoginBridgeNext("")).toBe("/");
    expect(sanitizeAppWebLoginBridgeNext(null)).toBe("/");
    expect(sanitizeAppWebLoginBridgeNext(42)).toBe("/");
  });
});

describe.sequential("app-web-login-bridge request secure detection", () => {
  it("treats req.protocol === 'https' as secure", () => {
    expect(
      isAppWebLoginBridgeRequestSecure({ protocol: "https", headers: {} }),
    ).toBe(true);
  });

  it("treats x-forwarded-proto: https as secure", () => {
    expect(
      isAppWebLoginBridgeRequestSecure({
        protocol: "http",
        headers: { "x-forwarded-proto": "https" },
      }),
    ).toBe(true);
  });

  it("treats plain http with no forwarded header as insecure", () => {
    expect(
      isAppWebLoginBridgeRequestSecure({ protocol: "http", headers: {} }),
    ).toBe(false);
  });
});

describe.sequential("app-web-login-bridge end-to-end", () => {
  it("sets the session cookie and 302-redirects to the sanitized next path on a valid token", async () => {
    process.env.PAPERCLIP_INSTANCE_ID = "default";
    const auth = createAuthStub({ acceptToken: TOKEN, userId: USER_ID });
    const app = createBridgeApp({ auth });

    const res = await request(app)
      .get(`/api/auth/exchange?token=${encodeURIComponent(TOKEN)}&next=${encodeURIComponent("/XROA/issues/PAP-1")}`)
      .set("x-forwarded-proto", "https");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/XROA/issues/PAP-1");
    const setCookie = res.headers["set-cookie"];
    expect(Array.isArray(setCookie) ? setCookie.join("\n") : setCookie).toContain(
      `__Secure-paperclip-default.session_token=${TOKEN}`,
    );
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("answers 401 with no Set-Cookie when the token is missing", async () => {
    const auth = createAuthStub({ acceptToken: TOKEN, userId: USER_ID });
    const app = createBridgeApp({ auth });

    const res = await request(app).get("/api/auth/exchange");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ ok: false, reason: "missing_token" });
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("answers 401 with no Set-Cookie when the token is forged", async () => {
    const auth = createAuthStub({ acceptToken: "real-token", userId: USER_ID });
    const app = createBridgeApp({ auth });

    const res = await request(app)
      .get(`/api/auth/exchange?token=${encodeURIComponent("forged-token")}`)
      .set("x-forwarded-proto", "https");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ ok: false, reason: "invalid_token" });
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("falls back to / when next is hostile and never lets the redirect leave the origin", async () => {
    const auth = createAuthStub({ acceptToken: TOKEN, userId: USER_ID });
    const app = createBridgeApp({ auth });

    const res = await request(app)
      .get(`/api/auth/exchange?token=${encodeURIComponent(TOKEN)}&next=${encodeURIComponent("https://evil.example/x")}`)
      .set("x-forwarded-proto", "https");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
    expect(res.headers.location).not.toContain("evil.example");
  });

  it("writes the non-secure cookie name when the request is plain HTTP", async () => {
    process.env.PAPERCLIP_INSTANCE_ID = "default";
    const auth = createAuthStub({ acceptToken: TOKEN, userId: USER_ID });
    const app = createBridgeApp({ auth });

    const res = await request(app).get(
      `/api/auth/exchange?token=${encodeURIComponent(TOKEN)}`,
    );

    expect(res.status).toBe(302);
    const setCookie = res.headers["set-cookie"];
    expect(Array.isArray(setCookie) ? setCookie.join("\n") : setCookie).toContain(
      `paperclip-default.session_token=${TOKEN}`,
    );
    expect(
      Array.isArray(setCookie) ? setCookie.join("\n") : setCookie,
    ).not.toContain("__Secure-");
  });
});

describe.sequential("runAppWebLoginBridge direct invocation", () => {
  it("returns ok:false when the token is empty without calling Better Auth", async () => {
    const calls: unknown[] = [];
    const auth = {
      api: {
        getSession: async (input: unknown) => {
          calls.push(input);
          return null;
        },
      },
    };
    const setHeader = () => undefined;
    const redirect = () => undefined;
    const outcome = await runAppWebLoginBridge({
      req: { query: {} } as any,
      res: { setHeader, redirect } as any,
      auth,
      secure: true,
    });
    expect(outcome).toEqual({ ok: false, reason: "missing_token" });
    expect(calls).toHaveLength(0);
  });

  it("validates token via db authSessions when Better Auth getSession misses", async () => {
    const auth = { api: { getSession: async () => null } };
    const mockDb = {
      select: () => ({
        from: (table: any) => ({
          where: () => ({
            then: (resolve: (rows: any[]) => any) => {
              if (table === authUsers || table?._?.name === "user") {
                return resolve([{ id: "user-db-1" }]);
              }
              return resolve([{ id: "session-1", userId: "user-db-1", token: "valid-db-token" }]);
            },
          }),
        }),
      }),
    } as any;

    const result = await validateAppWebLoginBridgeToken(auth, {
      token: "valid-db-token",
      db: mockDb,
    });
    expect(result).toEqual({ userId: "user-db-1" });
  });

  it("signs the exchange cookie with the auth secret when validation went through the db", async () => {
    const auth = { api: { getSession: async () => null }, options: { secret: "bridge-secret" } };
    const mockDb = {
      select: () => ({
        from: (table: any) => ({
          where: () => ({
            then: (resolve: (rows: any[]) => any) => {
              if (table === authUsers || table?._?.name === "user") {
                return resolve([{ id: "user-db-1" }]);
              }
              return resolve([{ id: "session-1", userId: "user-db-1", token: "valid-db-token" }]);
            },
          }),
        }),
      }),
    } as any;

    let setCookie: string | undefined;
    const outcome = await runAppWebLoginBridge({
      req: { query: { token: "valid-db-token", next: "/" } } as any,
      res: {
        setHeader: (key: string, value: string) => {
          if (key === "Set-Cookie") setCookie = value;
        },
        redirect: () => undefined,
      } as any,
      auth,
      secure: true,
      db: mockDb,
    });

    expect(outcome.ok).toBe(true);
    const value = decodeURIComponent(setCookie!.split(";")[0].split("=").slice(1).join("="));
    const crypto = await import("node:crypto");
    const expected = crypto.createHmac("sha256", "bridge-secret").update("valid-db-token").digest("base64");
    expect(value).toBe(`valid-db-token.${expected}`);
  });

  it("mints a session token when input is a valid board API key", async () => {
    const auth = { api: { getSession: async () => null } };
    let insertedValues: any = null;
    const mockDb = {
      select: () => ({
        from: (table: any) => ({
          where: () => ({
            then: (resolve: (rows: any[]) => any) => {
              // Simulating findBoardApiKeyByToken -> authUsers lookup
              return resolve([{ id: "user-board-1" }]);
            },
            orderBy: () => ({
              then: (resolve: (rows: any[]) => any) => resolve([]),
            }),
          }),
        }),
      }),
      insert: () => ({
        values: (val: any) => {
          insertedValues = val;
          return Promise.resolve();
        },
      }),
    } as any;

    // Provide mock board key lookup
    const outcome = await runAppWebLoginBridge({
      req: { query: { token: "valid-board-key", next: "/XROA" } } as any,
      res: {
        setHeader: () => undefined,
        redirect: () => undefined,
      } as any,
      auth,
      secure: true,
      db: mockDb,
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.token).toBeTruthy();
      expect(outcome.next).toBe("/XROA");
    }
  });
});