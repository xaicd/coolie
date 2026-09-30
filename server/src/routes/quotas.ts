import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { ProviderQuotaResult } from "@paperclipai/shared";
import { fetchAllQuotaWindows } from "../services/quota-windows.js";
import { assertCompanyAccess } from "./authz.js";
import { badRequest } from "../errors.js";

/**
 * Coolie fork — wave215: 老板额度查看 (boss quota view) endpoint.
 *
 * Aggregates the per-adapter `ProviderQuotaResult[]` (anthropic, openai, ...)
 * returned by `getQuotaWindows()` on each registered adapter. The coolie App's
 * boss concierge renders the window list as a card grid; this endpoint keeps
 * the wire shape stable so the UI can swap to a different provider later
 * without a contract rewrite.
 *
 *   GET  /api/companies/:companyId/quotas          — current windows
 *   POST /api/companies/:companyId/quotas/refresh  — force a fresh poll
 *   GET  /api/companies/:companyId/usage           — alias of /quotas
 *
 * Auth: company-scoped (board + agent key allowed). Quota data is operator
 * telemetry — the wave156 audit gate requires the call be traceable.
 */

const refreshSchema = z
  .object({
    providers: z.array(z.string().trim().min(1).max(64)).max(32).optional(),
  })
  .strict()
  .optional();

function flattenWindows(result: ProviderQuotaResult) {
  return {
    provider: result.provider,
    source: result.source ?? null,
    ok: result.ok,
    error: result.error ?? null,
    errorFamily: result.errorFamily ?? null,
    windows: (result.windows ?? []).map((window) => ({
      label: window.label,
      usedPercent: window.usedPercent ?? null,
      resetsAt: window.resetsAt ?? null,
      valueLabel: window.valueLabel ?? null,
      detail: window.detail ?? null,
    })),
  };
}

export function quotasRoutes(db: Db) {
  const router = Router();

  async function getProviderWindows() {
    return fetchAllQuotaWindows();
  }

  router.get("/companies/:companyId/quotas", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const windows = await getProviderWindows();
    res.json({
      generatedAt: new Date().toISOString(),
      companyId,
      providers: windows.map(flattenWindows),
    });
  });

  router.post("/companies/:companyId/quotas/refresh", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const parsed = refreshSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw badRequest("Invalid refresh payload", parsed.error.issues);
    }

    const windows = await getProviderWindows();
    const filtered = parsed.data?.providers?.length
      ? windows.filter((w) => parsed.data!.providers!.includes(w.provider))
      : windows;

    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      companyId,
      providers: filtered.map(flattenWindows),
    });
  });

  // alias so the boss's "usage" panel hits the same data without a separate route
  router.get("/companies/:companyId/usage", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const windows = await getProviderWindows();
    res.json({
      generatedAt: new Date().toISOString(),
      companyId,
      providers: windows.map(flattenWindows),
    });
  });

  return router;
}