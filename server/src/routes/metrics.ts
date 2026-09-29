import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { badRequest } from "../errors.js";
import { MAX_METRICS_PERIOD_DAYS, metricsService } from "../services/metrics.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

/**
 * Coolie fork — wave152 (C): company metrics read surface.
 *
 * Board-only and company-scoped: this is the operator's delivery-health view.
 * The wire shape uses snake_case keys (`failure_rate`, `delivery_cycle_days_avg`,
 * `throughput_per_day`) as the brief specifies, and carries the raw totals plus
 * a daily series so the UI can draw both the cards and the sparklines.
 */

const overviewQuerySchema = z.object({
  period: z.coerce.number().int().min(1).max(MAX_METRICS_PERIOD_DAYS).optional(),
  series: z.coerce.number().int().min(1).max(90).optional(),
});

export function metricsRoutes(db: Db) {
  const router = Router();
  const svc = metricsService(db);

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
