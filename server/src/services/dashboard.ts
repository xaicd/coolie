import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, approvals, companies, costEvents, heartbeatRuns, issues } from "@paperclipai/db";
import { notFound } from "../errors.js";
import { budgetService } from "./budgets.js";
import { executionIssueCondition } from "./issue-visibility.js";

const DASHBOARD_RUN_ACTIVITY_DAYS = 14;

function formatUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getUtcMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getRecentUtcDateKeys(now: Date, days: number): string[] {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: days }, (_, index) => {
    const dayOffset = index - (days - 1);
    return formatUtcDateKey(new Date(todayUtc + dayOffset * 24 * 60 * 60 * 1000));
  });
}

export function dashboardService(db: Db) {
  const budgets = budgetService(db);
  return {
    summary: async (companyId: string) => {
      const company = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);

      if (!company) throw notFound("Company not found");

      const agentRows = await db
        .select({ status: agents.status, count: sql<number>`count(*)` })
        .from(agents)
        .where(eq(agents.companyId, companyId))
        .groupBy(agents.status);

      const taskRows = await db
        .select({ status: issues.status, count: sql<number>`count(*)` })
        .from(issues)
        .where(and(eq(issues.companyId, companyId), executionIssueCondition()))
        .groupBy(issues.status);

      const pendingApprovals = await db
        .select({ count: sql<number>`count(*)` })
        .from(approvals)
        .where(and(eq(approvals.companyId, companyId), eq(approvals.status, "pending")))
        .then((rows) => Number(rows[0]?.count ?? 0));

      const agentCounts: Record<string, number> = {
        active: 0,
        running: 0,
        paused: 0,
        error: 0,
      };
      for (const row of agentRows) {
        const count = Number(row.count);
        // "idle" agents are operational — count them as active
        const bucket = row.status === "idle" ? "active" : row.status;
        agentCounts[bucket] = (agentCounts[bucket] ?? 0) + count;
      }

      const taskCounts: Record<string, number> = {
        open: 0,
        inProgress: 0,
        blocked: 0,
        done: 0,
      };
      for (const row of taskRows) {
        const count = Number(row.count);
        if (row.status === "in_progress") taskCounts.inProgress += count;
        if (row.status === "blocked") taskCounts.blocked += count;
        if (row.status === "done") taskCounts.done += count;
        if (row.status !== "done" && row.status !== "cancelled") taskCounts.open += count;
      }

      const now = new Date();
      const monthStart = getUtcMonthStart(now);
      const runActivityDays = getRecentUtcDateKeys(now, DASHBOARD_RUN_ACTIVITY_DAYS);
      const runActivityStart = new Date(`${runActivityDays[0]}T00:00:00.000Z`);
      const [{ monthSpend }] = await db
        .select({
          monthSpend: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::double precision`,
        })
        .from(costEvents)
        .where(
          and(
            eq(costEvents.companyId, companyId),
            gte(costEvents.occurredAt, monthStart),
          ),
        );

      const monthSpendCents = Number(monthSpend);
      // Per-day run breakdown. A run is "recovered" when its retry chain later
      // succeeded (recovered_runs = all ancestors of a succeeded retry), so a
      // restart-killed run whose retry succeeded is pulled out of the headline
      // failed count. error_code is carried through so a failure spike can be
      // attributed to an error class (e.g. process_lost, provider_quota).
      // Both recursive arms are bounded to the chart window: a retry is always
      // created after the run it retries, so ancestors of an out-of-window
      // child are themselves out of window and invisible to the membership
      // test below. Unbounded, the seed walks every run the company ever had.
      const runActivityRows = (await db.execute(sql`
        WITH RECURSIVE recovered_runs(id) AS (
          SELECT parent.id
          FROM ${heartbeatRuns} AS child
          JOIN ${heartbeatRuns} AS parent ON parent.id = child.retry_of_run_id
          WHERE child.company_id = ${companyId}
            AND child.status = 'succeeded'
            AND child.created_at >= ${runActivityStart.toISOString()}::timestamptz
          UNION
          SELECT parent.id
          FROM recovered_runs rr
          JOIN ${heartbeatRuns} AS child ON child.id = rr.id
          JOIN ${heartbeatRuns} AS parent ON parent.id = child.retry_of_run_id
          WHERE child.created_at >= ${runActivityStart.toISOString()}::timestamptz
        )
        SELECT
          to_char(run.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
          run.status AS status,
          run.error_code AS error_code,
          (run.id IN (SELECT id FROM recovered_runs)) AS recovered,
          count(*)::double precision AS count
        FROM ${heartbeatRuns} AS run
        WHERE run.company_id = ${companyId}
          AND run.created_at >= ${runActivityStart.toISOString()}::timestamptz
        GROUP BY date, run.status, run.error_code, recovered
      `)) as unknown as Iterable<{
        date: string;
        status: string;
        error_code: string | null;
        recovered: boolean | string;
        count: number | string;
      }>;

      const runActivity = new Map(
        runActivityDays.map((date) => [
          date,
          {
            date,
            succeeded: 0,
            failed: 0,
            recovered: 0,
            other: 0,
            total: 0,
            failedByErrorCode: {} as Record<string, number>,
          },
        ]),
      );
      for (const row of runActivityRows) {
        const bucket = runActivity.get(String(row.date));
        if (!bucket) continue;
        const count = Number(row.count);
        const status = String(row.status);
        // Postgres booleans can arrive as JS boolean or "t"/"true" depending on driver.
        const recovered = row.recovered === true || row.recovered === "t" || row.recovered === "true";
        if (status === "succeeded") {
          bucket.succeeded += count;
        } else if (status === "failed" || status === "timed_out") {
          if (recovered) {
            bucket.recovered += count;
          } else {
            bucket.failed += count;
            const code =
              typeof row.error_code === "string" && row.error_code.length > 0
                ? row.error_code
                : "unknown";
            bucket.failedByErrorCode[code] = (bucket.failedByErrorCode[code] ?? 0) + count;
          }
        } else {
          bucket.other += count;
        }
        bucket.total += count;
      }

      const utilization =
        company.budgetMonthlyCents > 0
          ? (monthSpendCents / company.budgetMonthlyCents) * 100
          : 0;
      const budgetOverview = await budgets.overview(companyId);

      // --- Top1 驾驶舱效能指标 (需求②⑥⑦⑧⑨⑩) ---
      // 1. 员工空闲度 (需求⑦: agent last_heartbeat距今)
      const companyAgentList = await db
        .select({
          id: agents.id,
          name: agents.name,
          role: agents.role,
          title: agents.title,
          status: agents.status,
          lastHeartbeatAt: agents.lastHeartbeatAt,
        })
        .from(agents)
        .where(eq(agents.companyId, companyId));

      let activeAgentsCount = 0;
      let idleAgentsCount = 0;
      let pausedAgentsCount = 0;
      let errorAgentsCount = 0;

      const agentDetails = companyAgentList.map((ag) => {
        const lastHb = ag.lastHeartbeatAt ? new Date(ag.lastHeartbeatAt) : null;
        const idleSec =
          lastHb ? Math.max(0, Math.floor((now.getTime() - lastHb.getTime()) / 1000)) : null;

        if (ag.status === "paused") {
          pausedAgentsCount++;
        } else if (ag.status === "error") {
          errorAgentsCount++;
        } else if (ag.status === "running" || (idleSec !== null && idleSec < 300)) {
          activeAgentsCount++;
        } else {
          idleAgentsCount++;
        }

        return {
          id: ag.id,
          name: ag.name,
          role: ag.role,
          title: ag.title ?? null,
          status: ag.status,
          lastHeartbeatAt: ag.lastHeartbeatAt ? ag.lastHeartbeatAt.toISOString() : null,
          idleSeconds: idleSec,
        };
      });

      // 2. 工单进度 & 状态分布 (需求⑥)
      const tasksByStatus: Record<string, number> = {
        backlog: 0,
        todo: 0,
        in_progress: 0,
        in_review: 0,
        blocked: 0,
        done: 0,
        cancelled: 0,
      };
      let totalTasks = 0;
      for (const row of taskRows) {
        const count = Number(row.count);
        tasksByStatus[row.status] = (tasksByStatus[row.status] ?? 0) + count;
        totalTasks += count;
      }
      const cancelledTasks = tasksByStatus.cancelled ?? 0;

      // 3. 交付周期 (需求⑧: issue创建到done时长分布)
      const doneIssueRows = await db
        .select({
          id: issues.id,
          createdAt: issues.createdAt,
          completedAt: issues.completedAt,
          updatedAt: issues.updatedAt,
        })
        .from(issues)
        .where(
          and(
            eq(issues.companyId, companyId),
            eq(issues.status, "done"),
            executionIssueCondition(),
          ),
        );

      const nowMs = now.getTime();
      const ms24h = 24 * 3600 * 1000;
      const ms7d = 7 * 24 * 3600 * 1000;
      const ms30d = 30 * 24 * 3600 * 1000;

      const leadTimesSec: number[] = [];
      const dailyCompletedMap: Record<string, number> = {};
      let completedPast24h = 0;
      let completedPast7d = 0;
      let completedPast30d = 0;

      for (const row of doneIssueRows) {
        const finishDate = row.completedAt ? new Date(row.completedAt) : new Date(row.updatedAt);
        const finishMs = finishDate.getTime();
        const createMs = new Date(row.createdAt).getTime();
        const diffSec = Math.max(0, Math.floor((finishMs - createMs) / 1000));
        leadTimesSec.push(diffSec);

        const ageMs = nowMs - finishMs;
        if (ageMs <= ms24h && ageMs >= 0) completedPast24h++;
        if (ageMs <= ms7d && ageMs >= 0) completedPast7d++;
        if (ageMs <= ms30d && ageMs >= 0) completedPast30d++;

        const dateKey = formatUtcDateKey(finishDate);
        dailyCompletedMap[dateKey] = (dailyCompletedMap[dateKey] ?? 0) + 1;
      }

      leadTimesSec.sort((a, b) => a - b);
      const doneCount = leadTimesSec.length;
      let avgLeadSec = 0;
      let medianLeadSec = 0;
      let p90LeadSec = 0;
      let minLeadSec = 0;
      let maxLeadSec = 0;

      if (doneCount > 0) {
        avgLeadSec = Math.round(leadTimesSec.reduce((a, b) => a + b, 0) / doneCount);
        minLeadSec = leadTimesSec[0];
        maxLeadSec = leadTimesSec[doneCount - 1];
        medianLeadSec = leadTimesSec[Math.floor(doneCount * 0.5)];
        p90LeadSec = leadTimesSec[Math.floor(doneCount * 0.9)];
      }

      const bucketSpecs: Array<{ label: string; minSec: number; maxSec: number | null }> = [
        { label: "< 1小时", minSec: 0, maxSec: 3600 },
        { label: "1-4小时", minSec: 3600, maxSec: 14400 },
        { label: "4-24小时", minSec: 14400, maxSec: 86400 },
        { label: "1-3天", minSec: 86400, maxSec: 259200 },
        { label: "> 3天", minSec: 259200, maxSec: null },
      ];

      const deliveryBuckets = bucketSpecs.map((spec) => {
        const count = leadTimesSec.filter((sec) => {
          if (spec.maxSec === null) return sec >= spec.minSec;
          return sec >= spec.minSec && sec < spec.maxSec;
        }).length;
        const percent = doneCount > 0 ? Number(((count / doneCount) * 100).toFixed(1)) : 0;
        return {
          label: spec.label,
          minSec: spec.minSec,
          maxSec: spec.maxSec,
          count,
          percent,
        };
      });

      // 4. 车间效率 (需求⑨: 吞吐速率与产出)
      const createdIssueRows = await db
        .select({
          createdAt: issues.createdAt,
        })
        .from(issues)
        .where(
          and(
            eq(issues.companyId, companyId),
            gte(issues.createdAt, runActivityStart),
            executionIssueCondition(),
          ),
        );

      const dailyCreatedMap: Record<string, number> = {};
      let createdPast24h = 0;
      let createdPast7d = 0;
      let createdPast30d = 0;

      for (const row of createdIssueRows) {
        const createdDate = new Date(row.createdAt);
        const dateKey = formatUtcDateKey(createdDate);
        dailyCreatedMap[dateKey] = (dailyCreatedMap[dateKey] ?? 0) + 1;
        const ageMs = nowMs - createdDate.getTime();
        if (ageMs <= ms24h && ageMs >= 0) createdPast24h++;
        if (ageMs <= ms7d && ageMs >= 0) createdPast7d++;
        if (ageMs <= ms30d && ageMs >= 0) createdPast30d++;
      }

      const dailyThroughput = runActivityDays.map((dateKey) => ({
        date: dateKey,
        completed: dailyCompletedMap[dateKey] ?? 0,
        created: dailyCreatedMap[dateKey] ?? 0,
      }));

      // 5. 失败率 (需求⑩: cancelled+error 占比)
      const taskFailureRatePercent =
        totalTasks > 0 ? Number(((cancelledTasks / totalTasks) * 100).toFixed(1)) : 0;

      let totalRuns = 0;
      let failedRuns = 0;
      let recoveredRuns = 0;
      for (const b of runActivity.values()) {
        totalRuns += b.total;
        failedRuns += b.failed;
        recoveredRuns += b.recovered;
      }
      const runFailureRatePercent =
        totalRuns > 0 ? Number(((failedRuns / totalRuns) * 100).toFixed(1)) : 0;

      const totalOperations = totalTasks + totalRuns;
      const failureOperations = cancelledTasks + failedRuns;
      const overallFailureRatePercent =
        totalOperations > 0 ? Number(((failureOperations / totalOperations) * 100).toFixed(1)) : 0;

      // 6. 额度 (需求②: budget_monthly_cents vs spent_monthly_cents)
      const quota = {
        budgetMonthlyCents: company.budgetMonthlyCents ?? 0,
        spentMonthlyCents: company.spentMonthlyCents ?? 0,
        costEventsSpendCents: monthSpendCents,
        utilizationPercent:
          company.budgetMonthlyCents > 0
            ? Number(((company.spentMonthlyCents / company.budgetMonthlyCents) * 100).toFixed(1))
            : 0,
        remainingCents: Math.max(
          0,
          (company.budgetMonthlyCents ?? 0) - (company.spentMonthlyCents ?? 0),
        ),
      };

      const progress = {
        total: totalTasks,
        open: taskCounts.open,
        inProgress: taskCounts.inProgress,
        blocked: taskCounts.blocked,
        done: taskCounts.done,
        cancelled: cancelledTasks,
        byStatus: tasksByStatus,
        completionRatePercent:
          totalTasks > 0 ? Number(((taskCounts.done / totalTasks) * 100).toFixed(1)) : 0,
      };

      const idle = {
        totalAgents: companyAgentList.length,
        activeCount: activeAgentsCount,
        idleCount: idleAgentsCount,
        pausedCount: pausedAgentsCount,
        errorCount: errorAgentsCount,
        agents: agentDetails,
      };

      const deliveryCycle = {
        count: doneCount,
        avgSeconds: avgLeadSec,
        medianSeconds: medianLeadSec,
        p90Seconds: p90LeadSec,
        minSeconds: minLeadSec,
        maxSeconds: maxLeadSec,
        buckets: deliveryBuckets,
      };

      const efficiency = {
        completedTasks24h: completedPast24h,
        completedTasks7d: completedPast7d,
        completedTasks30d: completedPast30d,
        createdTasks24h: createdPast24h,
        createdTasks7d: createdPast7d,
        createdTasks30d: createdPast30d,
        velocityPerDay: Number((completedPast7d / 7).toFixed(1)),
        dailyThroughput,
      };

      const failureRate = {
        totalTasks,
        cancelledTasks,
        taskFailureRatePercent,
        totalRuns,
        failedRuns,
        recoveredRuns,
        runFailureRatePercent,
        overallFailureRatePercent,
      };

      const metrics = {
        quota,
        progress,
        idle,
        deliveryCycle,
        efficiency,
        failureRate,
      };

      return {
        companyId,
        agents: {
          active: agentCounts.active,
          running: agentCounts.running,
          paused: agentCounts.paused,
          error: agentCounts.error,
        },
        tasks: taskCounts,
        costs: {
          monthSpendCents,
          monthBudgetCents: company.budgetMonthlyCents,
          monthUtilizationPercent: Number(utilization.toFixed(2)),
        },
        pendingApprovals,
        budgets: {
          activeIncidents: budgetOverview.activeIncidents.length,
          pendingApprovals: budgetOverview.pendingApprovalCount,
          pausedAgents: budgetOverview.pausedAgentCount,
          pausedProjects: budgetOverview.pausedProjectCount,
        },
        runActivity: Array.from(runActivity.values()),
        quota,
        progress,
        idle,
        deliveryCycle,
        efficiency,
        failureRate,
        metrics,
      };
    },
  };
}
