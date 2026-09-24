/**
 * `/api/git-credentials` — store and fetch encrypted Git provider credentials.
 *
 * Endpoints:
 *   POST /api/git-credentials
 *     Body: { provider: "github" | "gitlab" | "gitee" | "codeup" | "cnb",
 *             token: string, repoUrl?: string | null, companyId?: string | null }
 *     Auth: board
 *     Effect: encrypts `token` with `GIT_CREDENTIAL_ENCRYPTION_KEY` and
 *             upserts the row for `(req.actor.userId, provider)`.
 *
 *   GET /api/git-credentials
 *     Auth: board
 *     Effect: lists the current user's stored credentials (metadata only;
 *             never returns the encrypted token).
 *
 *   GET /api/git-credentials/:repoId
 *     Auth: board
 *     Effect: returns metadata for the given credential row id and the
 *             decrypted token (caller is the same user who owns the row).
 *
 *   DELETE /api/git-credentials/:repoId  (wave70)
 *     Auth: board
 *     Effect: deletes the credential row if (and only if) it belongs to the
 *             caller. Returns 404 for ids the caller doesn't own so we don't
 *             leak existence of other users' rows.
 */

import { Router } from "express";
import { z } from "zod";
import type { GitProvider } from "@paperclipai/adapter-git-ops/services";
import { gitOpsCredentialsService } from "../services/git-ops-credentials.js";
import { assertAuthenticated, assertBoard, hasCompanyAccess } from "./authz.js";
import { badRequest, notFound, unprocessable } from "../errors.js";
import type { Db } from "@paperclipai/db";

const PROVIDERS = ["github", "gitlab", "gitee", "codeup", "cnb"] as const;

const saveSchema = z.object({
  provider: z.enum(PROVIDERS),
  token: z.string().min(1, "token must not be empty").max(4096, "token too long"),
  repoUrl: z.string().url().nullable().optional(),
  companyId: z.string().nullable().optional(),
});

const PROVIDER_SET = new Set<string>(PROVIDERS);

export function gitCredentialsRoutes(db: Db): Router {
  const router = Router();
  const credentials = gitOpsCredentialsService(db);

  // All endpoints require an authenticated board actor.
  router.use("/git-credentials", (_req, _res, next) => {
    assertAuthenticated(_req);
    assertBoard(_req);
    next();
  });

  router.post("/git-credentials", async (req, res) => {
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid git-credential payload", { issues: parsed.error.issues });
    }
    const userId = req.actor.userId;
    if (!userId) {
      throw unprocessable("Authenticated user id is required");
    }
    const { provider, token, repoUrl, companyId } = parsed.data;

    if (companyId && !hasCompanyAccess(req, companyId)) {
      throw notFound("Company not found");
    }

    const stored = await credentials.save({
      userId,
      provider: provider as GitProvider,
      token,
      repoUrl: repoUrl ?? null,
      companyId: companyId ?? null,
    });
    if (!stored) {
      // No encryption key configured — surface a clear error to the caller
      // so they don't think the row was persisted.
      throw unprocessable(
        "Server has no GIT_CREDENTIAL_ENCRYPTION_KEY configured; refusing to store a credential in plaintext",
      );
    }
    res.status(200).json({ credential: stored });
  });

  router.get("/git-credentials", async (req, res) => {
    const userId = req.actor.userId;
    if (!userId) {
      throw unprocessable("Authenticated user id is required");
    }
    const items = await credentials.list(userId);
    res.status(200).json({ credentials: items });
  });

  router.get("/git-credentials/:repoId", async (req, res) => {
    const userId = req.actor.userId;
    if (!userId) {
      throw unprocessable("Authenticated user id is required");
    }
    const id = String(req.params.repoId ?? "").trim();
    if (!id) {
      throw badRequest("Missing credential id");
    }
    const meta = await credentials.findById(id);
    if (!meta || meta.userId !== userId) {
      throw notFound("Credential not found");
    }
    if (!PROVIDER_SET.has(meta.provider)) {
      throw unprocessable(`Unsupported provider on stored row: ${meta.provider}`);
    }

    const decrypted = await credentials.decrypt(userId, meta.provider);
    if (!decrypted) {
      throw notFound("Credential not found or expired");
    }

    res.status(200).json({
      credential: {
        ...meta,
        token: decrypted.accessToken,
      },
    });
  });

  // wave70 — App 端凭证管理屏「删除」按钮使用.
  // 只允许当前用户删自己的 row; 否则 404 不告知行存在.
  router.delete("/git-credentials/:repoId", async (req, res) => {
    const userId = req.actor.userId;
    if (!userId) {
      throw unprocessable("Authenticated user id is required");
    }
    const id = String(req.params.repoId ?? "").trim();
    if (!id) {
      throw badRequest("Missing credential id");
    }
    const removed = await credentials.remove(userId, id);
    if (!removed) {
      throw notFound("Credential not found");
    }
    res.status(200).json({ ok: true });
  });

  return router;
}