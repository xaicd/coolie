# wave215-b — 4 老板端点收口 (1 个真改 + 3 个核验) QA Report

> **状态:** ✅ /metrics (3 window) 200 / typecheck ✅ / 4 端点全 200 / 25 smoke 25/25 green
> **变更面:** `server/src/routes/metrics.ts` + `server/src/services/metrics.ts` (2 文件, 111+ / 8-)
> **commit:** pending (本文件写完 push)

## 1. 真因

wave215 修 11/12 老板需求, 剩 4 个"看似缺"实则"路径不对"的端点:

| Boss | 端点 | 真实情况 |
|---|---|---|
| 6 看进度 | `/api/companies/:id/dashboard` | 已存在, 返回 200, 全字段齐 (agents/tasks/costs/pendingApprovals/progress/idle/deliveryCycle/efficiency/failureRate/metrics/runActivity) |
| 7 看空闲度 | `/api/companies/:id/agents` | 已存在, 返回 200, `assertCompanyAccess` 已接受 `x-paperclip-api-key` (board actor 路径在 wave59 已落, 见 [[paperclip-board-concierge-bypass]]) |
| 9 车间效率 | `/api/companies/:id/metrics` | **404** — 实际只有 `/metrics/overview` (wave152, board-only) |
| 11 本体域 | `/api/companies/:id/ontology/graph` | 已存在, 返回 200, `assertCompanyAccess` 已接受 api key |

3 个无需代码改动, 1 个 (boss 9) 真要改路径。

## 2. 改动 (1 端点 / 2 文件)

### server/src/services/metrics.ts

新增 `efficiency(companyId)` 服务方法 — 返回 7d / 30d / 90d 三个滚动窗口, 共享 `_overviewImpl` 的 SQL 实现 (复用以避免重复 query 逻辑)。每个窗口独立计算, 一个窗口的 90 天取消峰值不会污染 7 天视图。

```ts
export interface MetricsWindow {
  period_days: 7 | 30 | 90;
  window: { from: string; to: string };
  totals: MetricsTotals;
  failure_rate: number;
  delivery_cycle_days_avg: number | null;
  throughput_per_day: number;
  series: MetricsSeriesPoint[];
}

export interface MetricsEfficiency {
  generated_at: string;
  company_id: string;
  windows: MetricsWindow[];
}

const EFFICIENCY_WINDOW_DAYS = [7, 30, 90] as const;

export function metricsService(db: Db) {
  async function window(companyId, periodDays): Promise<MetricsWindow> {
    // 一行复用 _overviewImpl
  }
  async function efficiency(companyId): Promise<MetricsEfficiency> {
    const windows = await Promise.all(
      EFFICIENCY_WINDOW_DAYS.map((days) => window(companyId, days)),
    );
    return { generated_at: new Date().toISOString(), company_id: companyId, windows };
  }
  async function overview(companyId, opts) { return _overviewImpl(db, companyId, opts); }
  return { overview, window, efficiency };
}
```

`_overviewImpl` 是把原 `metricsService.overview` 函数体提到模块顶层 — 因为新 `window` 也用它, 没必要复制。导出 contract 多两个方法, 老 caller 走的还是同一个 overview path。

### server/src/routes/metrics.ts

新增 GET `/companies/:companyId/metrics` 路由 (boss 9 真要的路径), `assertCompanyAccess` only — 因为 `x-paperclip-api-key` 已经升 board actor, 不需要 `assertBoard`。原 `GET /companies/:companyId/metrics/overview` 路径完整保留 + `assertBoard` 不动 (wave152 行为不变)。

```ts
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
```

## 3. 4 端点 curl 实测 (PM 真值)

测试公司 = `b1d6850c-02a4-41cc-a716-67797fe2b494` (onboarding-cache-test-1790227862, 有 34 tasks / 1 done / 3 agents 真数据)。

```bash
$ CID=b1d6850c-02a4-41cc-a716-67797fe2b494
$ /usr/bin/curl -s -o /dev/null -w "%{http_code}" "http://localhost:3100/api/companies/$CID/dashboard"
200
$ /usr/bin/curl -s -o /dev/null -w "%{http_code}" "http://localhost:3100/api/companies/$CID/agents"
200
$ /usr/bin/curl -s -o /dev/null -w "%{http_code}" "http://localhost:3100/api/companies/$CID/metrics"
200   # ← wave215-b 新增
$ /usr/bin/curl -s -o /dev/null -w "%{http_code}" "http://localhost:3100/api/companies/$CID/metrics/overview"
200   # ← wave152 保留
$ /usr/bin/curl -s -o /dev/null -w "%{http_code}" "http://localhost:3100/api/companies/$CID/ontology/graph?root_type=company&root_id=$CID"
200
$ /usr/bin/curl -s -o /dev/null -w "%{http_code}" "http://localhost:3100/api/companies/$CID/ontology/stats"
200
```

## 4. /metrics 真值响应样例

```json
{
  "generated_at": "2026-09-30T12:49:45.896Z",
  "company_id": "b1d6850c-02a4-41cc-a716-67797fe2b494",
  "windows": [
    {
      "period_days": 7,
      "window": {"from": "2026-09-23T12:49:45.892Z", "to": "2026-09-30T12:49:45.892Z"},
      "failure_rate": 0,
      "delivery_cycle_days_avg": null,
      "throughput_per_day": 0.1429,
      "totals": {"tasks": 34, "done": 1, "cancelled": 0, "blocked": 0, "blockedStuck": 0, "inProgress": 1},
      "series": [/* 7 个 date */]
    },
    {
      "period_days": 30,
      ...
      "throughput_per_day": 0.0333,
      "series": [/* 30 个 date */]
    },
    {
      "period_days": 90,
      ...
      "throughput_per_day": 0.0111,
      "series": [/* 90 个 date */]
    }
  ]
}
```

3 个窗口, 各 7/30/90 个 daily series point, 与窗口天数对齐。

## 5. dashboard 真值响应 (boss 6 看的所有字段)

dashboard service 一次性返回 (per `server/src/services/dashboard.ts`):

```ts
return {
  companyId,
  agents: { active, running, paused, error },
  tasks: { open, inProgress, blocked, done },
  costs: { monthSpendCents, monthBudgetCents, monthUtilizationPercent },
  pendingApprovals,
  budgets: { activeIncidents, pendingApprovals, pausedAgents, pausedProjects },
  runActivity: Array<{ date, succeeded, failed, recovered, other, total, failedByErrorCode }>,  // 14 天
  quota: { budgetMonthlyCents, spentMonthlyCents, costEventsSpendCents, utilizationPercent, remainingCents },
  progress: { total, open, inProgress, blocked, done, cancelled, byStatus, completionRatePercent },
  idle: { totalAgents, activeCount, idleCount, pausedCount, errorCount, agents[] },  // 每人 lastHeartbeatAt + idleSeconds
  deliveryCycle: { count, avgSeconds, medianSeconds, p90Seconds, minSeconds, maxSeconds, buckets[] },
  efficiency: { completedTasks24h, completedTasks7d, completedTasks30d, ..., velocityPerDay, dailyThroughput[] },
  failureRate: { totalTasks, cancelledTasks, taskFailureRatePercent, totalRuns, failedRuns, recoveredRuns, runFailureRatePercent, overallFailureRatePercent },
  metrics: { quota, progress, idle, deliveryCycle, efficiency, failureRate },  // 嵌套版
};
```

覆盖任务书所有字段: 已启用员工数 (idle.totalAgents / .activeCount), 执行中任务数 (tasks.inProgress), 本月花费 (costs.monthSpendCents), 待审批数 (pendingApprovals), 任务进度 (progress), 近 7 天运行活动 (runActivity 14 天 + efficiency.dailyThroughput 14 天)。

## 6. agents 真值响应 (boss 7 看的空闲度)

`/api/companies/:cid/agents` 直接返回 agent 列表 (3 agents 在测试公司):

```json
[
  {
    "id": "...", "name": "onboarding-cache-test-agent",
    "status": "idle", "lastHeartbeatAt": "...",
    ...
  },
  ...
]
```

`status` + `lastHeartbeatAt` + dashboard.idle 视图已经把空闲度算到秒 (`idleSeconds`)。

## 7. ontology/graph + ontology/stats 真值响应 (boss 11 看本体域)

两个端点都过 `assertCompanyAccess`, 接受 `x-paperclip-api-key` (board actor) + session board actor + agent_api_key (同公司)。

## 8. 4 护栏

| 护栏 | 状态 |
|---|---|
| typecheck (`pnpm --filter @paperclipai/server typecheck`) | ✅ 0 errors |
| build (typecheck-only 本波, server start 验证) | ✅ server 进程存活, curl 200 |
| test:run (targeted 子集) | ✅ metrics-routes 3/3 + ontology-graph-routes 7/7 + agent-permissions-routes 63/63 + actor-middleware-api-key 5/5 + agent-* 121/121 = 199/199 |
| 25 端点 smoke (`node scripts/qa-api-smoke-25.mjs`) | ✅ 25/25 green (含 /metrics/overview) |

> 注: 本波只动 2 文件 (routes/metrics.ts + services/metrics.ts), 不改 ui / clients/expo / 不动 wave156/163/164/167/213/214/215/216/218 的任何文件。test:run 受 wave215 / wave218 子集覆盖。

## 9. 变更文件

```
server/src/routes/metrics.ts        (+ /companies/:cid/metrics, +14 行, preserve /metrics/overview)
server/src/services/metrics.ts      (+ efficiency + window + _overviewImpl refactor, +77 -3)
```

未触碰: `ui/` `clients/expo` `wave156/163/164/167/213/214/215/216/218 已 push 的 commit 文件`。

## 10. Boss 一眼能看完

| 看点 | 文件 |
|---|---|
| /metrics (7d/30d/90d) 真有 | 本报告 § 4 真值 JSON |
| /dashboard /agents /ontology/graph 4 端点全 200 | 本报告 § 3 curl 表 |
| 不动 wave156/163/164/167/213/214/215/216/218 | 本报告 § 9 + git diff --stat 只 2 文件 |
| 4 护栏绿 | 本报告 § 8 |
| 不动客户端 version | version.json 未改 |
