import { Router, type Request } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { authUsers } from "@paperclipai/db";
import {
  authSessionSchema,
  currentUserProfileSchema,
  updateCurrentUserProfileSchema,
} from "@paperclipai/shared";
import {
  signUpWithEmailPassword,
  type BetterAuthApiClient,
} from "../auth/better-auth.js";
import {
  isAppWebLoginBridgeRequestSecure,
  runAppWebLoginBridge,
} from "../auth/app-web-login-bridge.js";
import { badRequest, unauthorized } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { logActivity } from "../services/activity-log.js";
import { accessService } from "../services/access.js";
import { companyService } from "../services/companies.js";
import { resolveSentryDsns } from "../sentry-dsn.js";

function requestHeaders(req: Request): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

type RegisterBody = {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  companyName?: unknown;
};

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw badRequest(`${field} is required`);
  return value.trim();
}

async function loadCurrentUserProfile(db: Db, userId: string) {
  const user = await db
    .select({
      id: authUsers.id,
      email: authUsers.email,
      name: authUsers.name,
      image: authUsers.image,
    })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .then((rows) => rows[0] ?? null);

  if (!user) {
    throw unauthorized("Signed-in user not found");
  }

  return currentUserProfileSchema.parse({
    id: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
    image: user.image ?? null,
  });
}

export function authRoutes(db: Db, opts: { betterAuth?: BetterAuthApiClient } = {}) {
  const router = Router();
  const companies = companyService(db);
  const access = accessService(db);

  /**
   * Mobile self-registration: create the account through Better Auth, then
   * bootstrap its first company owned by the new user. Returns the same shape
   * the client gets from sign-in, with the session cookie already set, so the
   * app can drop straight into the board. Unavailable when the instance was
   * booted without an authenticated Better Auth instance (e.g. local_trusted).
   */
  router.post("/register", async (req, res) => {
    const body = req.body as RegisterBody;
    const email = readRequiredString(body.email, "email");
    const password = readRequiredString(body.password, "password");
    const name = readRequiredString(body.name, "name");
    const companyName = readRequiredString(body.companyName, "companyName");

    const outcome = await signUpWithEmailPassword(opts.betterAuth ?? {}, {
      email,
      password,
      name,
      headers: requestHeaders(req),
    });
    if (!outcome.ok) {
      const status = outcome.status >= 400 && outcome.status < 500 ? outcome.status : 400;
      res.status(status).json({ error: outcome.message });
      return;
    }

    if (outcome.setCookies.length > 0) {
      res.setHeader("set-cookie", outcome.setCookies);
    }

    const company = await companies.create({
      name: companyName,
      defaultResponsibleUserId: outcome.user.id,
    });
    await access.ensureMembership(company.id, "user", outcome.user.id, "owner", "active");
    await access.ensureRoleDefaultGrants(company.id, outcome.user.id, "owner", outcome.user.id);
    await logActivity(db, {
      companyId: company.id,
      actorType: "user",
      actorId: outcome.user.id,
      action: "company.created",
      entityType: "company",
      entityId: company.id,
      details: { name: company.name, source: "app_register" },
    });

    res.status(200).json({
      user: {
        id: outcome.user.id,
        email: outcome.user.email,
        name: outcome.user.name,
        image: null,
      },
      company,
    });
  });

  router.get("/get-session", async (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) {
      throw unauthorized("Board authentication required");
    }

    const user = await loadCurrentUserProfile(db, req.actor.userId);
    res.json(authSessionSchema.parse({
      session: {
        id: `paperclip:${req.actor.source ?? "none"}:${req.actor.userId}`,
        userId: req.actor.userId,
      },
      user,
      // The browser reads this value to open its own Sentry gate — see
      // `ui/src/lib/sentry.ts`. `req.actor.type` already gates this whole
      // handler, so no second authorization check runs here. This field
      // carries the front-end DSN only; it never carries the backend DSN.
      sentryDsn: resolveSentryDsns().frontend,
    }));
  });

  router.get("/profile", async (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) {
      throw unauthorized("Board authentication required");
    }

    res.json(await loadCurrentUserProfile(db, req.actor.userId));
  });

  router.patch("/profile", validate(updateCurrentUserProfileSchema), async (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) {
      throw unauthorized("Board authentication required");
    }

    const patch = updateCurrentUserProfileSchema.parse(req.body);
    const now = new Date();

    const updated = await db
      .update(authUsers)
      .set({
        name: patch.name,
        ...(patch.image !== undefined ? { image: patch.image } : {}),
        updatedAt: now,
      })
      .where(eq(authUsers.id, req.actor.userId))
      .returning({
        id: authUsers.id,
        email: authUsers.email,
        name: authUsers.name,
        image: authUsers.image,
      })
      .then((rows) => rows[0] ?? null);

    if (!updated) {
      throw unauthorized("Signed-in user not found");
    }

    res.json(currentUserProfileSchema.parse({
      id: updated.id,
      email: updated.email ?? null,
      name: updated.name ?? null,
      image: updated.image ?? null,
    }));
  });

  /**
   * Wave 80 — App ↔ Web full-feature login sharing (PAP-board-bridge).
   *
   * The Coolie App signs in against Better Auth and stores the raw
   * `paperclip-<instance>.session_token` value in `expo-secure-store`. Its
   * WebView's cookie jar never sees that value, so opening the Web full-feature
   * board from `WebContainerScreen` would normally land the user on the
   * sign-in screen again. This endpoint mirrors the App's token into a real
   * `Set-Cookie` header on a 302 redirect — the WebView follows the redirect
   * with the cookie attached, and the browser session becomes the same session
   * the App already holds.
   *
   * Mounted at `/api/auth/exchange` BEFORE the Better Auth wildcard handler so
   * Express matches this route first and never lets Better Auth see the
   * query string (the token must stay off Better Auth's logs and never hit a
   * third-party plugin that doesn't expect it). Mounted without `auth` (no
   * board/agent actor required): the token itself is the credential, validated
   * server-side against Better Auth's session table.
   */
  router.get("/exchange", async (req, res) => {
    const outcome = await runAppWebLoginBridge({
      req,
      res,
      auth: opts.betterAuth ?? {},
      secure: isAppWebLoginBridgeRequestSecure(req as unknown as Parameters<typeof isAppWebLoginBridgeRequestSecure>[0]),
    });
    if (!outcome.ok) {
      res.status(401).json({ ok: false, reason: outcome.reason });
      return;
    }
  });

  return router;
}
