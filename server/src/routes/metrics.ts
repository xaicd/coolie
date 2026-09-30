import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { badRequest } from "../errors.js";
import { MAX_METRICS_PERIOD_DAYS, metricsService } from "../services/metrics.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

/**
 * Coolie fork — wave152 (C) + wave215-b (boss 9 车间效率 view).
 *
 * Two surfaces:
 *   GET /api/companies/:companyId/metrics          — wave215-b: boss 9
 *                                                    "车间效率" three-window
 *                                                    efficiency (7d / 30d / 90d)
 *                                                    in a single round-trip.
 *                                                    `assertCompanyAccess` only:
 *                                                    the on-device PAPERCLIP_API_KEY
 *                                                    concierge is a board actor
 *                                                    and clears this gate.
 *   GET /api/companies/:companyId/metrics/overview — wave152 (C) original
 *                                                    view; keeps `assertBoard`
 *                                                    so the per-agent / per-period
 *                                                    breakdown stays operator-only.
 */

const overviewQuerySchema = z.object({
  period: z.coerce.number().int().min(1).max(MAX_METRICS_PERIOD_DAYS).optional(),
  series: z.coerce.number().int().min(1).max(90).optional(),
});

export function metricsRoutes(db: Db) {
  const router = Router();
  const svc = metricsService(db);

  router.get("/companies/:companyId/metrics", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const efficiency = await svc.efficiency(companyId);
    res.json({
      generated_at: efficiency.generated_at,
      company_id: efficiency.company_id,
      windows: efficiency.windows.map((window) => ({
        period_days: window.period_days,
        window: window.window,
        failure_rate: window.failure_rate,
        delivery_cycle_days_avg: window.delivery_cycle_days_avg,
        throughput_per_day: window.throughput_per_day,
        totals: window.totals,
        series: window.series,
      })),
    });
  });

  router.get("/companies/:companyId/metrics/overview", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);

    const parsed = overviewQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest("Invalid metrics query", parsed.error.issues);
    }

    const overview = await svc.overview(companyId, {
      periodDays: parsed.data.period,
      seriesDays: parsed.data.series,
    });

    res.json({
      period_days: overview.periodDays,
      window: overview.window,
      failure_rate: overview.failureRate,
      delivery_cycle_days_avg: overview.deliveryCycleDaysAvg,
      throughput_per_day: overview.throughputPerDay,
      totals: overview.totals,
      by_agent: overview.byAgent.map((agent) => ({
        agent_id: agent.agentId,
        agent_name: agent.agentName,
        tasks: agent.tasks,
        done: agent.done,
        cancelled: agent.cancelled,
        blocked_stuck: agent.blockedStuck,
        failure_rate: agent.failureRate,
        delivery_cycle_days_avg: agent.deliveryCycleDaysAvg,
      })),
      series: overview.series,
    });
  });

  return router;
}
