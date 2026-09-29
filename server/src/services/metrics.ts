import { and, asc, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, issues } from "@paperclipai/db";

/**
 * Coolie fork — wave152 (C): failure rate / delivery cycle / throughput.
 *
 * Definitions (fixed by the brief, PRD 9–11):
 *   failure_rate            (cancelled + blocked-stuck > 7 days) / total tasks
 *   delivery_cycle_days_avg avg(completedAt − createdAt) over done tasks
 *   throughput_per_day      done count / period days
 *
 * All three are computed over the tasks *created* in the window, so the numbers
 * describe one cohort of work rather than a mix of ages. Per-agent and a short
 * daily series are returned for the dashboard cards + sparklines.
 */

export const DEFAULT_METRICS_PERIOD_DAYS = 30;
export const MAX_METRICS_PERIOD_DAYS = 365;
export const DEFAULT_SERIES_DAYS = 14;
export const BLOCKED_STUCK_DAYS = 7;

const DAY_MS = 86_400_000;

export function normalizeMetricsPeriod(days: number | undefined): number {
  if (!Number.isFinite(days)) return DEFAULT_METRICS_PERIOD_DAYS;
  return Math.max(1, Math.min(MAX_METRICS_PERIOD_DAYS, Math.floor(days ?? DEFAULT_METRICS_PERIOD_DAYS)));
}

export interface MetricsTotals {
  tasks: number;
  done: number;
  cancelled: number;
  blocked: number;
  blockedStuck: number;
  inProgress: number;
}

export interface MetricsAgentRow {
  agentId: string;
  agentName: string | null;
  tasks: number;
  done: number;
  cancelled: number;
  blockedStuck: number;
  failureRate: number;
  deliveryCycleDaysAvg: number | null;
}

export interface MetricsSeriesPoint {
  date: string;
  throughput: number;
  failures: number;
}

export interface MetricsOverview {
  periodDays: number;
  window: { from: string; to: string };
  totals: MetricsTotals;
  failureRate: number;
  deliveryCycleDaysAvg: number | null;
  throughputPerDay: number;
  byAgent: MetricsAgentRow[];
  series: MetricsSeriesPoint[];
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function dateKeyUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function metricsService(db: Db) {
  async function overview(
    companyId: string,
    opts: { periodDays?: number; seriesDays?: number } = {},
  ): Promise<MetricsOverview> {
    const periodDays = normalizeMetricsPeriod(opts.periodDays);
    const seriesDays = Math.max(1, Math.min(90, opts.seriesDays ?? DEFAULT_SERIES_DAYS));
    const now = new Date();
    const since = new Date(now.getTime() - periodDays * DAY_MS);
    const seriesSince = new Date(now.getTime() - (seriesDays - 1) * DAY_MS);
    seriesSince.setUTCHours(0, 0, 0, 0);

    const blockedStuckExpr = sql`${issues.status} = 'blocked'
      and ${issues.blockedTransitionAt} is not null
      and ${issues.blockedTransitionAt} < now() - (${BLOCKED_STUCK_DAYS} * interval '1 day')`;

    const [totalsRow] = await db
      .select({
        tasks: sql<number>`count(*)::int`,
        done: sql<number>`count(*) filter (where ${issues.status} = 'done')::int`,
        cancelled: sql<number>`count(*) filter (where ${issues.status} = 'cancelled')::int`,
        blocked: sql<number>`count(*) filter (where ${issues.status} = 'blocked')::int`,
        blockedStuck: sql<number>`count(*) filter (where ${blockedStuckExpr})::int`,
        inProgress: sql<number>`count(*) filter (where ${issues.status} = 'in_progress')::int`,
        deliveryCycleDaysAvg: sql<number | null>`(avg(extract(epoch from (${issues.completedAt} - ${issues.createdAt})) / 86400.0) filter (where ${issues.status} = 'done' and ${issues.completedAt} is not null))::float8`,
      })
      .from(issues)
      .where(and(eq(issues.companyId, companyId), gte(issues.createdAt, since)));

    const tasks = toNumber(totalsRow?.tasks);
    const cancelled = toNumber(totalsRow?.cancelled);
    const blockedStuck = toNumber(totalsRow?.blockedStuck);
    const done = toNumber(totalsRow?.done);
    const totals: MetricsTotals = {
      tasks,
      done,
      cancelled,
      blocked: toNumber(totalsRow?.blocked),
      blockedStuck,
      inProgress: toNumber(totalsRow?.inProgress),
    };

    const agentRows = await db
      .select({
        agentId: issues.assigneeAgentId,
        agentName: agents.name,
        tasks: sql<number>`count(*)::int`,
        done: sql<number>`count(*) filter (where ${issues.status} = 'done')::int`,
        cancelled: sql<number>`count(*) filter (where ${issues.status} = 'cancelled')::int`,
        blockedStuck: sql<number>`count(*) filter (where ${blockedStuckExpr})::int`,
        deliveryCycleDaysAvg: sql<number | null>`(avg(extract(epoch from (${issues.completedAt} - ${issues.createdAt})) / 86400.0) filter (where ${issues.status} = 'done' and ${issues.completedAt} is not null))::float8`,
      })
      .from(issues)
      .leftJoin(agents, eq(agents.id, issues.assigneeAgentId))
      .where(
        and(
          eq(issues.companyId, companyId),
          gte(issues.createdAt, since),
          isNotNull(issues.assigneeAgentId),
        ),
      )
      .groupBy(issues.assigneeAgentId, agents.name)
      .orderBy(desc(sql`count(*) filter (where ${issues.status} = 'done')`), asc(issues.assigneeAgentId));

    const byAgent: MetricsAgentRow[] = agentRows
      .filter((row): row is typeof row & { agentId: string } => Boolean(row.agentId))
      .map((row) => {
        const agentTasks = toNumber(row.tasks);
        const failures = toNumber(row.cancelled) + toNumber(row.blockedStuck);
        return {
          agentId: row.agentId,
          agentName: row.agentName ?? null,
          tasks: agentTasks,
          done: toNumber(row.done),
          cancelled: toNumber(row.cancelled),
          blockedStuck: toNumber(row.blockedStuck),
          failureRate: agentTasks > 0 ? round(failures / agentTasks) : 0,
          deliveryCycleDaysAvg: toNumberOrNull(row.deliveryCycleDaysAvg),
        };
      });

    const throughputRows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${issues.completedAt}), 'YYYY-MM-DD')`,
        n: sql<number>`count(*)::int`,
      })
      .from(issues)
      .where(
        and(
          eq(issues.companyId, companyId),
          eq(issues.status, "done"),
          gte(issues.completedAt, seriesSince),
        ),
      )
      .groupBy(sql`date_trunc('day', ${issues.completedAt})`);

    const failureRows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${issues.cancelledAt}), 'YYYY-MM-DD')`,
        n: sql<number>`count(*)::int`,
      })
      .from(issues)
      .where(
        and(
          eq(issues.companyId, companyId),
          eq(issues.status, "cancelled"),
          gte(issues.cancelledAt, seriesSince),
        ),
      )
      .groupBy(sql`date_trunc('day', ${issues.cancelledAt})`);

    const throughputByDay = new Map(throughputRows.map((row) => [row.day, toNumber(row.n)]));
    const failureByDay = new Map(failureRows.map((row) => [row.day, toNumber(row.n)]));

    const series: MetricsSeriesPoint[] = [];
    for (let offset = 0; offset < seriesDays; offset += 1) {
      const day = dateKeyUTC(new Date(seriesSince.getTime() + offset * DAY_MS));
      series.push({
        date: day,
        throughput: throughputByDay.get(day) ?? 0,
        failures: failureByDay.get(day) ?? 0,
      });
    }

    const failures = cancelled + blockedStuck;
    return {
      periodDays,
      window: { from: since.toISOString(), to: now.toISOString() },
      totals,
      failureRate: tasks > 0 ? round(failures / tasks) : 0,
      deliveryCycleDaysAvg: toNumberOrNull(totalsRow?.deliveryCycleDaysAvg),
      throughputPerDay: round(done / periodDays),
      byAgent,
      series,
    };
  }

  return { overview };
}

export type MetricsService = ReturnType<typeof metricsService>;
