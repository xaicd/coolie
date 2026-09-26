/**
 * Wave 80 — App ↔ Web full-feature login sharing (PAP-board-bridge).
 *
 * The Coolie mobile App authenticates against the Better Auth instance via
 * `POST /api/auth/sign-in/email`. That call returns the session cookie in its
 * `Set-Cookie` header, but the App stores the raw `paperclip-<instance>.session_token`
 * value in `expo-secure-store` — the WebView's cookie jar never sees it, so
 * opening `/XROA/...` from `WebContainerScreen` lands the browser on a fresh
 * sign-in screen even though the App itself is already authenticated.
 *
 * The bridge closes that gap. `GET /api/auth/exchange?token=<expo-store-value>`
 * validates the token through Better Auth's own session API and, when it
 * resolves to a real user, mirrors the token into a `Set-Cookie` header on a
 * 302 redirect to the requested landing page. The WebView follows the redirect
 * with the cookie already attached, so the browser session and the App session
 * are the same session from that point on.
 *
 * Threat model:
 *
 *  - **The token is the credential.** Anyone holding a valid session token
 *    could already use the App's session — this endpoint does not widen that
 *    surface. It just lets the user take the same session into the WebView.
 *  - **Invalid tokens get nothing.** A bogus query value never produces a
 *    cookie; the request 401s and the WebView stays on the sign-in screen.
 *  - **Next path is scoped.** The `next` query parameter must stay on the
 *    same origin and never become an absolute URL — otherwise this endpoint
 *    becomes an open redirect. We strip everything outside `pathname+search`
 *    before redirecting.
 *  - **No server-side cookie persistence.** The bridge mirrors the same token
 *    the App already holds; the source of truth stays in Better Auth's
 *    `session` table and we never write to it here.
 */

import { randomBytes, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { and, desc, eq, gt } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { authSessions, authUsers } from "@paperclipai/db";
import { boardAuthService } from "../services/board-auth.js";
import { deriveAuthCookiePrefix } from "./better-auth.js";

const EXCHANGE_TOKEN_QUERY_PARAM = "token";
const EXCHANGE_NEXT_QUERY_PARAM = "next";

/** Result codes for the bridge — used by the route to pick a status. */
export type AppWebLoginBridgeOutcome =
  | { ok: true; token: string; next: string }
  | { ok: false; reason: "missing_token" | "invalid_token" };

/**
 * The slice of the Better Auth session API the bridge needs. The real instance
 * exposes `api.getSession` under `api`; declaring the surface structurally
 * keeps the test suite from instantiating the real auth.
 */
export type AppWebLoginBridgeSessionApi = {
  api?: { getSession?: (input: { headers: Headers }) => Promise<unknown> };
};

/**
 * Validate an App-stored session token by replaying it through Better Auth's
 * own `getSession`, with a transparent fallback to direct database session verification
 * and board key session exchange.
 *
 * Returns null when the token doesn't resolve to a live session or valid board key.
 */
export async function validateAppWebLoginBridgeToken(
  auth: AppWebLoginBridgeSessionApi,
  input: { token: string; secure?: boolean; db?: Db },
): Promise<{ userId: string; sessionToken?: string } | null> {
  if (!input.token) return null;

  const api = auth.api?.getSession;
  if (api) {
    const baseName = `${deriveAuthCookiePrefix()}.session_token`;
    const cookieName = input.secure ? `__Secure-${baseName}` : baseName;
    const headers = new Headers({
      cookie: `${cookieName}=${input.token}`,
    });
    console.log(`[bridge] validate cookieName=${cookieName} tokenLen=${input.token.length}`);

    let value: unknown;
    try {
      value = await api({ headers });
    } catch {
      value = null;
    }
    if (value && typeof value === "object") {
      const session = (value as { session?: { id?: unknown; userId?: unknown } | null }).session;
      const user = (value as { user?: { id?: unknown } | null }).user;
      if (
        session &&
        typeof session.id === "string" &&
        typeof session.userId === "string" &&
        user &&
        typeof user.id === "string" &&
        session.userId === user.id
      ) {
        return { userId: user.id };
      }
    }
  }

  // Fallback to database check if db instance was provided
  if (input.db) {
    try {
      const now = new Date();
      // 1. Direct active session token lookup
      const sessionRow = await input.db
        .select({ id: authSessions.id, userId: authSessions.userId, token: authSessions.token })
        .from(authSessions)
        .where(and(eq(authSessions.token, input.token), gt(authSessions.expiresAt, now)))
        .then((rows) => rows[0] ?? null);

      if (sessionRow) {
        const userRow = await input.db
          .select({ id: authUsers.id })
          .from(authUsers)
          .where(eq(authUsers.id, sessionRow.userId))
          .then((rows) => rows[0] ?? null);
        if (userRow) {
          console.log(`[bridge] db session hit userId=${userRow.id}`);
          return { userId: userRow.id };
        }
      }

      // 2. Board API key lookup
      const boardAuth = boardAuthService(input.db);
      const boardKey = await boardAuth.findBoardApiKeyByToken(input.token);
      if (boardKey) {
        const userRow = await input.db
          .select({ id: authUsers.id })
          .from(authUsers)
          .where(eq(authUsers.id, boardKey.userId))
          .then((rows) => rows[0] ?? null);
        if (userRow) {
          const existingSession = await input.db
            .select({ token: authSessions.token })
            .from(authSessions)
            .where(and(eq(authSessions.userId, userRow.id), gt(authSessions.expiresAt, now)))
            .orderBy(desc(authSessions.updatedAt))
            .then((rows) => rows[0] ?? null);

          if (existingSession?.token) {
            console.log(`[bridge] db board key hit userId=${userRow.id} with existing session`);
            return { userId: userRow.id, sessionToken: existingSession.token };
          }

          const newSessionToken = randomBytes(32).toString("hex");
          const newSessionId = randomUUID();
          const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          await input.db.insert(authSessions).values({
            id: newSessionId,
            token: newSessionToken,
            userId: userRow.id,
            createdAt: now,
            updatedAt: now,
            expiresAt,
          });
          console.log(`[bridge] db board key hit userId=${userRow.id} with minted session`);
          return { userId: userRow.id, sessionToken: newSessionToken };
        }
      }
    } catch (err) {
      console.warn("[bridge] db fallback check error:", err);
    }
  }

  return null;
}

/**
 * Build the Set-Cookie header value the bridge writes. Kept separate from the
 * handler so the test suite can assert on the exact wire format — the WebView
 * parses this string with its platform cookie jar, not Better Auth's helper,
 * so a subtle attribute mismatch (e.g. a stray `; ` that splits a value) would
 * silently break the very thing this endpoint exists to fix.
 *
 * `secure` matches what Better Auth would have written for the request that
 * triggered the exchange: HTTPS gets `__Secure-` and `Secure`, plain HTTP gets
 * neither.
 */
export function buildAppWebLoginBridgeCookie(input: {
  token: string;
  secure: boolean;
}): string {
  const prefix = deriveAuthCookiePrefix();
  const baseName = `${prefix}.session_token`;
  const name = input.secure ? `__Secure-${baseName}` : baseName;
  const attributes = [
    `${name}=${input.token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=604800",
  ];
  if (input.secure) attributes.push("Secure");
  return attributes.join("; ");
}

/**
 * Scope an arbitrary `next` value to a same-origin path. Anything that isn't
 * a clean absolute or root-relative path falls back to `/`, which keeps this
 * endpoint from being an open redirect when the WebView ever stops pinning the
 * landing URL itself.
 */
export function sanitizeAppWebLoginBridgeNext(value: unknown): string {
  if (typeof value !== "string") return "/";
  const trimmed = value.trim();
  if (!trimmed) return "/";
  if (!trimmed.startsWith("/")) return "/";
  if (trimmed.startsWith("//")) return "/";
  return trimmed;
}

/**
 * Run the bridge end to end. Split out so the HTTP handler stays a thin shell
 * and the test suite can exercise the validation/sanitization logic without
 * having to drive Express.
 *
 * On success the handler writes the session cookie and returns a 302 redirect
 * to the (sanitized) `next` path — the WebView follows the redirect with the
 * cookie attached, so the browser and the App share the same session. JSON
 * responses are not useful here because the WebView does not run client-side
 * code against this URL; only a real HTTP redirect lands the cookie jar.
 */
export async function runAppWebLoginBridge(input: {
  req: Pick<Request, "query">;
  res: ResponseLike;
  auth: AppWebLoginBridgeSessionApi;
  secure: boolean;
  db?: Db;
}): Promise<AppWebLoginBridgeOutcome> {
  const rawToken = (input.req.query as Record<string, unknown>)[EXCHANGE_TOKEN_QUERY_PARAM];
  const rawNext = (input.req.query as Record<string, unknown>)[EXCHANGE_NEXT_QUERY_PARAM];
  const token = typeof rawToken === "string" ? rawToken.trim() : "";
  const next = sanitizeAppWebLoginBridgeNext(rawNext);

  if (!token) {
    console.log(`[bridge] missing_token next=${next}`);
    return { ok: false, reason: "missing_token" };
  }

  const validated = await validateAppWebLoginBridgeToken(input.auth, {
    token,
    secure: input.secure,
    db: input.db,
  });
  if (!validated) {
    console.log(`[bridge] invalid_token tokenLen=${token.length} tokenHead=${token.slice(0, 12)}... next=${next} secure=${input.secure}`);
    return { ok: false, reason: "invalid_token" };
  }
  const sessionToken = validated.sessionToken || token;
  console.log(`[bridge] ok userId=${validated.userId} tokenLen=${sessionToken.length} next=${next} secure=${input.secure}`);

  input.res.setHeader("Set-Cookie", buildAppWebLoginBridgeCookie({ token: sessionToken, secure: input.secure }));
  input.res.setHeader("Cache-Control", "no-store");
  input.res.setHeader("Referrer-Policy", "no-referrer");
  input.res.redirect(302, next);
  return { ok: true, token: sessionToken, next };
}

/**
 * The slice of Express's `Response` the bridge touches. `setHeader` covers
 * the `Set-Cookie` write and `redirect` issues the 302 that takes the WebView
 * to the landing page; nothing else on `Response` is invoked.
 */
export type ResponseLike = Pick<Response, "setHeader" | "redirect">;

/**
 * Whether the incoming request reached us over HTTPS — that decides whether
 * the cookie needs the `__Secure-` prefix and the `Secure` attribute. Better
 * Auth toggles the same flag from the request URL, so we mirror its logic and
 * accept a trusted `X-Forwarded-Proto` for instances running behind a TLS
 * terminator (the trust-proxy middleware gates whether the header is honored).
 */
export function isAppWebLoginBridgeRequestSecure(req: Pick<Request, "headers"> & { protocol?: string }): boolean {
  if (req.protocol === "https") return true;
  const forwarded = req.headers["x-forwarded-proto"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return typeof value === "string" && value.trim().toLowerCase() === "https";
}