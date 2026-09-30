import { Router } from "express";
import { z } from "zod";
import { eq, and, gte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issues as issuesTable } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";
import { badRequest } from "../errors.js";

/**
 * Coolie fork — wave215: 老板交付周期 (boss cycle-time view) endpoint.
 *
 * The coolie App's 老板面板 wants the moving delivery-cycle trend (wave152's
 * `delivery_cycle_days_avg` rolled into a time series and broken down by
 * status cohort). The aggregate `/metrics/overview` already covers the
 * company-wide average; this endpoint exposes the per-day timeline so the
 * App can draw a sparkline.
 *
 *   GET /api/companies/:companyId/cycle-time?period=&bucket=
 *
 * Definitions (consistent with `services/metrics.ts`):
 *   delivery_cycle_days = (completed_at - created_at) / 86_400_000
 *   bucket = "day" | "week"
 *
 * Auth: company-scoped (board + agent key allowed). This is operator
 * delivery-health telemetry.
 */

const DAY_MS = 86_400_000;
const MAX_PERIOD_DAYS = 365;
const DEFAULT_PERIOD_DAYS = 30;
const DEFAULT_BUCKET = "day";

const querySchema = z.object({
  period: z.coerce.number().int().min(1).max(MAX_PERIOD_DAYS).optional(),
  bucket: z.enum(["day", "week"]).optional(),
});

function toBucketKey(date: Date, bucket: "day" | "week"): string {
  if (bucket === "day") return date.toISOString().slice(0, 10);
  // ISO week: round down to the Monday of the date's ISO week
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = utc.getUTCDay() || 7; // Sun=0 → 7
  utc.setUTCDate(utc.getUTCDate() - (day - 1));
  return utc.toISOString().slice(0, 10);
}

export function cycleTimeRoutes(db: Db) {
  const router = Router();

  router.get("/companies/:companyId/cycle-time", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest("Invalid cycle-time query", parsed.error.issues);
    }

    const periodDays = parsed.data.period ?? DEFAULT_PERIOD_DAYS;
    const bucket = parsed.data.bucket ?? DEFAULT_BUCKET;
    const since = new Date(Date.now() - periodDays * DAY_MS);

    const rows = await db
      .select({
        completedAt: issuesTable.completedAt,
        createdAt: issuesTable.createdAt,
      })
      .from(issuesTable)
      .where(
        and(
          eq(issuesTable.companyId, companyId),
          gte(issuesTable.completedAt, since),
          sql`${issuesTable.completedAt} is not null`,
        ),
      );

    // group + average
    const buckets = new Map<string, { sum: number; count: number }>();
    for (const row of rows) {
      if (!row.completedAt || !row.createdAt) continue;
      const key = toBucketKey(row.completedAt, bucket);
      const cycleDays = (row.completedAt.getTime() - row.createdAt.getTime()) / DAY_MS;
      if (cycleDays < 0) continue;
      const entry = buckets.get(key) ?? { sum: 0, count: 0 };
      entry.sum += cycleDays;
      entry.count += 1;
      buckets.set(key, entry);
    }

    const series = Array.from(buckets.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, { sum, count }]) => ({
        date,
        count,
        avg_days: count > 0 ? Math.round((sum / count) * 100) / 100 : null,
      }));

    const total = series.reduce((acc, point) => acc + point.count, 0);
    const totalSum = rows.reduce((acc, row) => {
      if (!row.completedAt || !row.createdAt) return acc;
      const days = (row.completedAt.getTime() - row.createdAt.getTime()) / DAY_MS;
      return days >= 0 ? acc + days : acc;
    }, 0);
    const overallAvgDays = total > 0 ? Math.round((totalSum / total) * 100) / 100 : null;

    res.json({
      generatedAt: new Date().toISOString(),
      companyId,
      periodDays,
      bucket,
      overall_avg_days: overallAvgDays,
      sample_size: total,
      series,
    });
  });

  return router;
}