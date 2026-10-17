#!/usr/bin/env node
/**
 * scripts/hermes-scheduler-health-check.mjs
 *
 * **调度器体检 (Scheduler Health Watchdog)** — 守护调度器自己的守护.
 *
 * 背景: 心祖 routine `*\/15 * * * *` 是当前唯一"常驻自愈"机制 (COOA-114 主线
 * 收口卡里的选项③就是直接停掉它). 但此前所有巡检工具都只盯**工单**
 * (`hermes-open-issue-liveness-scan.mjs` 判活路, `hermes-heartbeat-snapshot.mjs`
 * 打印 routine 指纹), 没有一个工具回答: **调度器本人还在按节奏起搏吗?**
 *
 * 已实测过的失效形态 (心法 #108): routine 还在, 触发器却失联 —— 工单看板一切
 * 正常, 下一跳永不到来; 每轮心跳都在"巡检", 却没人巡检巡检器本身. 另有两类
 * **数据语义**必须区分, 不能误报:
 *
 *   1. `lastFiredAt` / `nextRunAt` / `cronExpression` 会阶段态翻 null
 *      (心法 #124/#138/#170/#177) —— 字段为 null 是**阶段态**, 不是故障,
 *      不许据此判 stalled, 更不许因此重启 dev-server.
 *   2. `nextRunAt` 承诺的下一跳若已过期, 才算"跳票"; 单看 lastFiredAt 的绝对
 *      年龄对大周期 routine (`0 * * * *`) 必然误报.
 *
 * 判定口径 (verdict):
 *   healthy           — 上跳在 ≤ (周期+宽限) 内, 且 nextRunAt 未跳票
 *   late              — 已过 (周期+宽限) 或 nextRunAt 跳票 > 宽限, 但未到停滞阈值
 *   stalled           — 超过 stalePeriods 个周期未起搏, 或 nextRunAt 跳票超过之
 *   trigger_missing   — routine 在, 但**零触发器** ⇒ 永不自动起搏 (心法 #108, 门禁)
 *   trigger_disabled  — 触发器存在但 enabled=false ⇒ 无人会再拉起 (门禁)
 *   paused            — routine.status 非 active (掌柜主动暂停, 不算故障, 不门禁)
 *   unsupported_cron  — cron 形态超出本工具解析面 ⇒ 只报不门禁 (不许猜)
 *   no_schedule_data  — lastFiredAt 与 nextRunAt 双 null ⇒ 数据语义 (心法 #124)
 *
 * 起搏缺跳审计 (cadence, 与上面的单点判定正交):
 *   上面判定读的是 `lastFiredAt` / `nextRunAt` **两个点**, 一跳被吞掉后下一跳补上,
 *   这两个字段立刻恢复正常 —— 整跳缺失在单点体检里永远不可见. 所以本工具还会拉
 *   `/routines/{id}/runs`, 按 cron 周期逐跳对齐窗口内的历史, 抓出窗口内空洞:
 *     cadence_ok           — 逐跳对齐
 *     cadence_skipped      — 缺 1 ~ (stalePeriods-1) 跳 ⇒ 只报不门禁
 *     cadence_stalled      — 缺 ≥ stalePeriods 跳 ⇒ 门禁
 *     cadence_missing_data — runs < 2 条 / 窗口短于周期 ⇒ 不判
 *     cadence_unsupported  — cron 超解析面 ⇒ 不判
 *
 * 用法:
 *   node scripts/hermes-scheduler-health-check.mjs            # 人读报告
 *   node scripts/hermes-scheduler-health-check.mjs --brief    # 一行体检 (心跳用)
 *   node scripts/hermes-scheduler-health-check.mjs --json     # 机器读 JSON
 *   node scripts/hermes-scheduler-health-check.mjs --gate     # 门禁: 有关键失效时退出码 3
 *   node scripts/hermes-scheduler-health-check.mjs --issue <uuid>   # 由工单反查 companyId (心法 #148)
 *   node scripts/hermes-scheduler-health-check.mjs --no-cadence     # 只做单点体检 (调试)
 *
 * 环境变量: PAPERCLIP_API_URL / PAPERCLIP_API_KEY / PAPERCLIP_COMPANY_ID / PAPERCLIP_TASK_ID
 *
 * 退出码: 0 = 体检完成 (无门禁失效, 或不带 --gate); 2 = 缺 API base/key;
 *         3 = `--gate` 下存在 trigger_missing / trigger_disabled / stalled / cadence_stalled.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeApiBase, pickRoutines, roleForRoutine } from "./hermes-heartbeat-snapshot.mjs";
import { resolveCompanyId } from "./hermes-open-issue-liveness-scan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..");

/** 判定分组顺序 (人读报告按这个顺序渲染) */
export const SCHED_VERDICTS = [
  "trigger_missing",
  "trigger_disabled",
  "stalled",
  "late",
  "healthy",
  "paused",
  "unsupported_cron",
  "no_schedule_data",
];

/** 会让调度器**永不自动起搏**的形态 ⇒ 门禁 (--gate 退出码 3) */
export const GATE_VERDICTS = ["trigger_missing", "trigger_disabled", "stalled"];

/** 上跳迟到多久算"下一跳跳票"的宽限窗口 (分钟) */
export const DEFAULT_GRACE_MINUTES = 5;

/** 落后多少个周期算停滞 (stalled) */
export const DEFAULT_STALE_PERIODS = 3;

/**
 * 起搏缺跳 (cadence gap) 审计默认窗口 (小时).
 *
 * 为什么必须单独审计: `lastFiredAt` / `nextRunAt` 是**两个点的状态**, 一次 45 分钟的
 * 双跳缺失在 tick 补上之后, 这两个字段立刻恢复正常 —— 单点体检永远看不见它.
 * 2026-10-18 02:45 CST 实测: routine `b35ff456` (`*\/15`) 在 17:00Z / 17:15Z 两跳
 * 整段缺失 (runs 回包 16:45:29 → 17:30:30, 45 分钟空洞), 而同刻小时级 routine 在
 * 17:00:29 正常起搏 ⇒ 不是全服 downtime, 是这一条 routine 的两跳被吞掉.
 * 只有按 runs 历史逐跳对齐周期, 才能把这种"补上就看不见"的缺跳抓出来.
 */
export const DEFAULT_CADENCE_WINDOW_HOURS = 6;

/** 相邻两跳允许的迟到宽限 (分钟) — 调度 tick 自身有 ~60s 抖动, 别把抖动算成缺跳 */
export const DEFAULT_CADENCE_GRACE_MINUTES = 2;

/** 每条 routine 拉取的 runs 条数上限 (enough for 6h of 15m cadence + 小时级 routine 的 3 天) */
export const CADENCE_RUNS_LIMIT = 200;

/**
 * 起搏缺跳判定 (与工单体检正交, 不并进 SCHED_VERDICTS):
 *   cadence_ok           — 窗口内逐跳对齐, 无缺跳
 *   cadence_skipped      — 缺 1 ~ (stalePeriods-1) 跳 ⇒ 只报不门禁 (advisory)
 *   cadence_stalled      — 缺 ≥ stalePeriods 跳 ⇒ 门禁 (调度器真的漏跳成片)
 *   cadence_missing_data — 窗口内 runs < 2 条 ⇒ 数据不足, 不判
 *   cadence_unsupported  — cron 超解析面 ⇒ 只报不门禁 (不许猜周期)
 */
export const CADENCE_VERDICTS = [
  "cadence_stalled",
  "cadence_skipped",
  "cadence_ok",
  "cadence_missing_data",
  "cadence_unsupported",
];

export const CADENCE_BADGE = {
  cadence_stalled: "❌ 成片缺跳",
  cadence_skipped: "⚠️ 缺跳",
  cadence_ok: "✅ 逐跳对齐",
  cadence_missing_data: "❔ runs 数据不足",
  cadence_unsupported: "❔ 周期超解析面",
};

/** 无法解析 cron 时的保守周期假设 (分钟) — 只用于报"看起来多久没动", 不参与门禁 */
export const FALLBACK_PERIOD_MINUTES = 60;

export const VERDICT_BADGE = {
  trigger_missing: "❌ 触发器失联",
  trigger_disabled: "❌ 触发器关闭",
  stalled: "❌ 停滞",
  late: "⚠️ 迟到",
  healthy: "✅ 起搏正常",
  paused: "⏸ 已暂停",
  unsupported_cron: "❔ cron 超解析面",
  no_schedule_data: "❔ 无排程数据",
};

const isNum = (value) => typeof value === "number" && Number.isFinite(value);

/** 触发器官能: 取第一个 trigger (与 heartbeat-snapshot / 控制面一致) */
export function triggerOf(routine) {
  const triggers = Array.isArray(routine?.triggers) ? routine.triggers : [];
  return triggers[0] ?? null;
}

/**
 * cron → 周期分钟数 (只解析本平台实际使用的形态, 不认识就返回 null 而不是猜).
 *
 * 支持: `*\/N * * * *` (每 N 分钟) · `M * * * *` (小时级) ·
 *       `M H * * *` (天级) · `M H * * D` (周级)
 */
export function parseCronIntervalMinutes(expression) {
  if (typeof expression !== "string") return null;
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dom, month, dow] = parts;

  const everyMinutes = /^\*\/(\d+)$/.exec(minute);
  if (everyMinutes) {
    const step = Number(everyMinutes[1]);
    if (!Number.isInteger(step) || step <= 0 || step > 60 || 60 % step !== 0) return null;
    if (hour !== "*" || dom !== "*" || month !== "*" || dow !== "*") return null;
    return step;
  }

  const fixedMinute = /^\d{1,2}$/.test(minute);
  if (!fixedMinute) return null;
  const min = Number(minute);
  if (min < 0 || min > 59) return null;

  if (hour === "*" && dom === "*" && month === "*" && dow === "*") return 60;
  if (/^\d{1,2}$/.test(hour) && dom === "*" && month === "*" && dow === "*") return 60 * 24;
  if (/^\d{1,2}$/.test(hour) && dom === "*" && month === "*" && /^\d$/.test(dow)) return 60 * 24 * 7;
  return null;
}

/** minutes ago (now - iso) ; null 安全 */
export function minutesSince(iso, now = Date.now()) {
  if (typeof iso !== "string") return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  return Math.round(((now - ts) / 60000) * 10) / 10;
}

/**
 * 单条 routine 体检 (纯函数, 可复算).
 *
 * @param {object} routine 控制面 `/companies/{cid}/routines` 的一条
 * @param {number} now     毫秒时间戳 (注入以便单测)
 * @param {{graceMinutes?:number, stalePeriods?:number}} [opts]
 */
export function evaluateRoutine(routine, now = Date.now(), opts = {}) {
  const grace = opts.graceMinutes ?? DEFAULT_GRACE_MINUTES;
  const stalePeriods = opts.stalePeriods ?? DEFAULT_STALE_PERIODS;

  const r = routine ?? {};
  const trigger = triggerOf(r);
  const linked = r.lastRun?.linkedIssue && typeof r.lastRun.linkedIssue === "object" ? r.lastRun.linkedIssue : null;

  const base = {
    id: r.id ?? null,
    title: r.title ?? r.name ?? null,
    role: roleForRoutine(r),
    status: r.status ?? null,
    cronExpression: trigger?.cronExpression ?? null,
    enabled: trigger?.enabled ?? null,
    lastFiredAt: trigger?.lastFiredAt ?? null,
    nextRunAt: trigger?.nextRunAt ?? null,
    lastResult: trigger?.lastResult ?? null,
    linkedIssue: linked ? { identifier: linked.identifier ?? null, status: linked.status ?? null } : null,
    periodMinutes: null,
    minutesSinceLastFire: minutesSince(trigger?.lastFiredAt, now),
    minutesSinceNextRun: minutesSince(trigger?.nextRunAt, now),
    verdict: "healthy",
    gate: false,
    notes: [],
  };

  if (typeof r.status === "string" && r.status !== "active") {
    base.verdict = "paused";
    base.notes.push(`routine.status=${r.status} (非 active ⇒ 掌柜已主动暂停, 不门禁)`);
    return base;
  }

  if (!trigger) {
    base.verdict = "trigger_missing";
    base.gate = true;
    base.notes.push("零触发器 ⇒ 永不自动起搏 (心法 #108 实测失效形态): 需重建 trigger");
    return base;
  }

  if (trigger.enabled === false) {
    base.verdict = "trigger_disabled";
    base.gate = true;
    base.notes.push("trigger.enabled=false ⇒ 已排定但不会起搏: 需重新 enable");
    return base;
  }

  const period = parseCronIntervalMinutes(base.cronExpression);
  base.periodMinutes = period;
  if (period === null) base.notes.push("cron 形态超出解析面 ⇒ 只报不门禁 (不许猜)");

  if (base.lastFiredAt === null) base.notes.push("phase-null: lastFiredAt (字段阶段态, 心法 #124)");
  if (base.nextRunAt === null) base.notes.push("phase-null: nextRunAt");

  const expected = period ?? FALLBACK_PERIOD_MINUTES;
  const staleLimit = expected * stalePeriods;
  const sinceLast = base.minutesSinceLastFire;
  const nextOverdue = base.minutesSinceNextRun; // >0 ⇒ 承诺过的下一跳已过时

  if (sinceLast === null && nextOverdue === null) {
    base.verdict = "no_schedule_data";
    base.notes.push("lastFiredAt 与 nextRunAt 双 null ⇒ 数据语义, 不判故障 (心法 #124/#138)");
    return base;
  }

  const nextMissed = nextOverdue !== null && nextOverdue > grace;
  const staleByNext = nextOverdue !== null && nextOverdue > staleLimit;
  const staleByLast = sinceLast !== null && sinceLast > staleLimit;
  const lateByLast = sinceLast !== null && sinceLast > expected + grace;

  if (staleByNext || staleByLast) {
    base.verdict = "stalled";
    base.gate = period !== null;
    base.notes.push(
      `超 ${stalePeriods} 个周期未起搏 (${staleByNext ? `nextRunAt 跳票 ${nextOverdue} 分钟` : `上跳距今 ${sinceLast} 分钟`}, 周期 ${expected} 分钟)`,
    );
  } else if (nextMissed || lateByLast) {
    base.verdict = "late";
    base.notes.push(
      nextMissed
        ? `nextRunAt 跳票 ${nextOverdue} 分钟 (> 宽限 ${grace} 分钟)`
        : `上跳距今 ${sinceLast} 分钟 (> 周期+宽限 ${expected + grace} 分钟)`,
    );
  } else {
    base.verdict = "healthy";
  }

  // 上一跳的执行单是否已落地 (advisory, 不门禁): 起搏了但工单挂着 = 球在别人手里
  if (linked && linked.status === "in_progress" && linked.updatedAt) {
    const linkIdle = minutesSince(linked.updatedAt, now);
    if (isNum(linkIdle) && linkIdle > expected) {
      base.notes.push(`linkedIssue ${linked.identifier ?? ""} 仍 in_progress (idle ${linkIdle} 分钟) — 起搏正常但执行单未闭环`);
    }
  }

  return base;
}

/** runs 回包归一: 控制面既可回数组, 也可能回 {runs:[...]} / {data:[...]} */
export function pickRuns(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.runs)) return payload.runs;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

/**
 * 起搏缺跳审计: 把 runs 历史逐跳对齐 cron 周期, 抓出"补上就看不见"的整跳缺失.
 *
 * 口径 (纯函数, 可复算):
 *   1. 只取窗口 `[now - windowHours, now]` 内的 `triggeredAt`;
 *   2. 1 秒内的重复行视为同一跳 (重试/重放会产出同刻多行);
 *   3. 相邻两跳间隔 > 周期+宽限 ⇒ 按 `round(gap/period)-1` 记缺跳数;
 *   4. 缺 ≥ stalePeriods 跳 ⇒ `cadence_stalled` (门禁), 否则只报 (advisory).
 *
 * 关键: **窗口内的空洞**才判, 窗口外 (历史停机/掌柜暂停) 与尾部空档 (归 evaluateRoutine
 * 的 late/stalled 判) 都不在这里重复计, 避免同一事实两套口径互相打脸.
 */
export function auditCadence({
  runs,
  now = Date.now(),
  periodMinutes = null,
  windowHours = DEFAULT_CADENCE_WINDOW_HOURS,
  graceMinutes = DEFAULT_CADENCE_GRACE_MINUTES,
  stalePeriods = DEFAULT_STALE_PERIODS,
} = {}) {
  const windowMs = windowHours * 3600000;
  const windowStart = now - windowMs;
  const base = {
    verdict: "cadence_ok",
    gate: false,
    periodMinutes,
    windowHours,
    windowStart: new Date(windowStart).toISOString(),
    fires: 0,
    expectedFires: null,
    missedFires: 0,
    maxGapMinutes: null,
    gaps: [],
    notes: [],
  };

  if (periodMinutes === null) {
    base.verdict = "cadence_unsupported";
    base.notes.push("cron 形态超出解析面 ⇒ 不做缺跳判定 (不许猜周期)");
    return base;
  }

  const stamps = [];
  for (const run of pickRuns(runs)) {
    const raw = run?.triggeredAt ?? run?.createdAt ?? null;
    const ts = typeof raw === "string" ? Date.parse(raw) : Number.NaN;
    if (Number.isNaN(ts) || ts < windowStart || ts > now) continue;
    stamps.push(ts);
  }
  stamps.sort((a, b) => a - b);
  const unique = stamps.filter((ts, index) => index === 0 || ts - stamps[index - 1] > 1000);
  base.fires = unique.length;

  if (unique.length < 2) {
    base.verdict = "cadence_missing_data";
    base.notes.push(
      periodMinutes > windowHours * 60
        ? `窗口 ${windowHours}h 短于周期 ${periodMinutes}m (日级/周级 routine 正常形态) ⇒ 不判缺跳`
        : `窗口 ${windowHours}h 内仅 ${unique.length} 跳 ⇒ 数据不足, 不判缺跳 (不误报)`,
    );
    return base;
  }

  let missed = 0;
  let maxGap = 0;
  for (let i = 1; i < unique.length; i += 1) {
    const gapMinutes = Math.round(((unique[i] - unique[i - 1]) / 60000) * 10) / 10;
    if (gapMinutes > maxGap) maxGap = gapMinutes;
    if (gapMinutes <= periodMinutes + graceMinutes) continue;
    const missedTicks = Math.max(1, Math.round(gapMinutes / periodMinutes) - 1);
    missed += missedTicks;
    base.gaps.push({
      from: new Date(unique[i - 1]).toISOString(),
      to: new Date(unique[i]).toISOString(),
      gapMinutes,
      missedTicks,
    });
  }

  base.maxGapMinutes = Math.round(maxGap * 10) / 10;
  base.missedFires = missed;
  base.expectedFires = Math.floor((now - unique[0]) / (periodMinutes * 60000)) + 1;

  if (missed >= stalePeriods) {
    base.verdict = "cadence_stalled";
    base.gate = true;
    base.notes.push(
      `窗口 ${windowHours}h 内缺 ${missed} 跳 (≥ ${stalePeriods} 跳) ⇒ 调度器成片漏跳: 查 server-dev.log 的 "routine scheduler tick" 是否断档`,
    );
  } else if (missed > 0) {
    base.verdict = "cadence_skipped";
    base.notes.push(
      `窗口 ${windowHours}h 内缺 ${missed} 跳, 最大空洞 ${base.maxGapMinutes} 分钟 (单点 lastFiredAt/nextRunAt 已自愈 ⇒ 只有 runs 历史看得见)`,
    );
  }

  return base;
}

/**
 * routine 列表体检汇总.
 *
 * @param {object[]} routines 控制面 `/companies/{cid}/routines` 回包
 * @param {number} now        毫秒时间戳 (注入以便单测)
 * @param {object} [opts]
 * @param {Record<string, unknown>} [opts.runsById] 每条 routine 的 runs 回包 (缺省则跳过缺跳审计)
 * @returns {{generatedAt:string, routines:object[], counts:object, gate:{failed:boolean, verdicts:string[], ids:string[]}}}
 */
export function checkRoutines(routines, now = Date.now(), opts = {}) {
  const runsById = opts.runsById ?? null;
  const cadenceOpts = {
    windowHours: opts.cadenceWindowHours ?? DEFAULT_CADENCE_WINDOW_HOURS,
    graceMinutes: opts.cadenceGraceMinutes ?? DEFAULT_CADENCE_GRACE_MINUTES,
    stalePeriods: opts.stalePeriods ?? DEFAULT_STALE_PERIODS,
  };
  const rows = (Array.isArray(routines) ? routines : [])
    .map((routine) => {
      const row = evaluateRoutine(routine, now, opts);
      if (runsById) {
        row.cadence = auditCadence({
          runs: runsById[row.id] ?? [],
          now,
          periodMinutes: row.periodMinutes,
          ...cadenceOpts,
        });
      }
      return row;
    })
    .sort((a, b) => {
      const rank = (row) => SCHED_VERDICTS.indexOf(row.verdict);
      return rank(a) - rank(b) || String(a.role).localeCompare(String(b.role));
    });

  const counts = {};
  for (const verdict of SCHED_VERDICTS) counts[verdict] = 0;
  for (const row of rows) counts[row.verdict] = (counts[row.verdict] ?? 0) + 1;

  const failed = rows.filter((row) => row.gate);
  const cadenceFailed = rows.filter((row) => row.cadence?.gate);
  return {
    generatedAt: new Date(now).toISOString(),
    routines: rows,
    counts,
    gate: {
      failed: failed.length > 0 || cadenceFailed.length > 0,
      verdicts: [...new Set([
        ...failed.map((row) => row.verdict),
        ...cadenceFailed.map((row) => row.cadence.verdict),
      ])],
      ids: [...new Set([...failed.map((row) => row.id), ...cadenceFailed.map((row) => row.id)])],
    },
  };
}

/** 一行心脏起搏 / 门禁输出 */
export function renderBrief(report) {
  const head = `SCHED ${report.generatedAt} routines=${report.routines.length} ${SCHED_VERDICTS.filter((v) => report.counts[v] > 0)
    .map((v) => `${v}=${report.counts[v]}`)
    .join(" ")} · gate=${report.gate.failed ? `FAIL(${report.gate.verdicts.join(",")})` : "OK"}`;

  const body = report.routines
    .map((row) => {
      const cadence = row.periodMinutes === null ? `cron=${row.cronExpression ?? "null"}` : `${row.periodMinutes}m`;
      const age = isNum(row.minutesSinceLastFire) ? `上跳 ${row.minutesSinceLastFire}m 前` : "上跳时间缺";
      const next = isNum(row.minutesSinceNextRun) ? (row.minutesSinceNextRun <= 0 ? `下跳 ${-row.minutesSinceNextRun}m 后` : `下跳跳票 ${row.minutesSinceNextRun}m`) : "下跳时间缺";
      const link = row.linkedIssue?.identifier ? `→ ${row.linkedIssue.identifier}(${row.linkedIssue.status ?? "?"})` : "→ 无执行单";
      // 缺跳只在非 ok 时占字, 保持一行可读: `⚠️ 缺跳(2跳/45m)`
      const cad = row.cadence && row.cadence.verdict !== "cadence_ok"
        ? ` ${CADENCE_BADGE[row.cadence.verdict] ?? row.cadence.verdict}${
          row.cadence.missedFires > 0 ? `(${row.cadence.missedFires}跳/${row.cadence.maxGapMinutes}m)` : ""
        }`
        : "";
      return `${row.role}:${VERDICT_BADGE[row.verdict] ?? row.verdict} ${cadence} ${age} ${next} ${link}${cad}`;
    })
    .join(" · ");

  return body ? `${head} · ${body}` : head;
}

/** 人读分组报告 */
export function renderText(report) {
  const lines = [];
  lines.push(`═══ 调度器体检 (Scheduler Health Watchdog) @ ${report.generatedAt} ═══`);
  lines.push(
    `routine ${report.routines.length} 条 · ` +
      SCHED_VERDICTS.filter((v) => report.counts[v] > 0)
        .map((v) => `${v}=${report.counts[v]}`)
        .join(" · "),
  );
  lines.push(`门禁: ${report.gate.failed ? `❌ FAIL (${report.gate.verdicts.join(",")})` : "✅ OK"}`);
  lines.push("");
  for (const row of report.routines) {
    lines.push(`${VERDICT_BADGE[row.verdict] ?? row.verdict}  [${row.role}] ${row.title ?? "(无标题)"}`);
    lines.push(
      `    id=${row.id} status=${row.status} cron=${row.cronExpression ?? "null"} enabled=${row.enabled} period=${
        row.periodMinutes === null ? "n/a" : `${row.periodMinutes}m`
      }`,
    );
    lines.push(
      `    上跳=${row.lastFiredAt ?? "null"} (${isNum(row.minutesSinceLastFire) ? `${row.minutesSinceLastFire} 分钟前` : "n/a"}) · 下跳=${
        row.nextRunAt ?? "null"
      } (${isNum(row.minutesSinceNextRun) ? (row.minutesSinceNextRun <= 0 ? `${-row.minutesSinceNextRun} 分钟后` : `跳票 ${row.minutesSinceNextRun} 分钟`) : "n/a"})`,
    );
    if (row.linkedIssue) lines.push(`    执行单=${row.linkedIssue.identifier ?? "null"} (${row.linkedIssue.status ?? "?"})`);
    if (row.cadence) {
      lines.push(
        `    起搏缺跳=${CADENCE_BADGE[row.cadence.verdict] ?? row.cadence.verdict} 窗口${row.cadence.windowHours}h 实测${row.cadence.fires}跳` +
          `${row.cadence.missedFires > 0 ? ` 缺${row.cadence.missedFires}跳 最大空洞${row.cadence.maxGapMinutes}分钟` : ""}`,
      );
      for (const gap of row.cadence.gaps ?? []) {
        lines.push(`      · 空洞 ${gap.from} → ${gap.to} (${gap.gapMinutes} 分钟, 缺 ${gap.missedTicks} 跳)`);
      }
      for (const note of row.cadence.notes ?? []) lines.push(`      · ${note}`);
    }
    for (const note of row.notes) lines.push(`    · ${note}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** 与仓库既有工具同形: {flags, options}, 未知参数抛错由 main 归一为退出码 2 */
export function parseArgs(argv = []) {
  const flags = { json: false, brief: false, gate: false, help: false, noCadence: false };
  const options = {
    issue: null,
    company: null,
    graceMinutes: DEFAULT_GRACE_MINUTES,
    stalePeriods: DEFAULT_STALE_PERIODS,
    cadenceWindowHours: DEFAULT_CADENCE_WINDOW_HOURS,
    cadenceGraceMinutes: DEFAULT_CADENCE_GRACE_MINUTES,
    runsLimit: CADENCE_RUNS_LIMIT,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--brief") flags.brief = true;
    else if (arg === "--gate") flags.gate = true;
    else if (arg === "--no-cadence") flags.noCadence = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--issue") options.issue = argv[++i] || null;
    else if (arg === "--company") options.company = argv[++i] || null;
    else if (arg === "--grace-minutes") options.graceMinutes = Number(argv[++i]) || DEFAULT_GRACE_MINUTES;
    else if (arg === "--stale-periods") options.stalePeriods = Number(argv[++i]) || DEFAULT_STALE_PERIODS;
    else if (arg === "--cadence-window-hours") options.cadenceWindowHours = Number(argv[++i]) || DEFAULT_CADENCE_WINDOW_HOURS;
    else if (arg === "--cadence-grace-minutes") options.cadenceGraceMinutes = Number(argv[++i]) || DEFAULT_CADENCE_GRACE_MINUTES;
    else if (arg === "--runs-limit") options.runsLimit = Number(argv[++i]) || CADENCE_RUNS_LIMIT;
    else throw new Error(`未知参数: ${arg}`);
  }
  return { flags, options };
}

const HELP = `hermes-scheduler-health-check — 调度器体检 (守护调度器自己的守护)

  --brief                      一行体检 (心跳专用)
  --json                       机器读 JSON
  --gate                       门禁: 存在 trigger_missing / trigger_disabled / stalled / cadence_stalled 时退出码 3
  --issue <uuid>               用该工单解析 companyId (心法 #148)
  --company <cid>              指定 companyId (默认取 PAPERCLIP_COMPANY_ID)
  --grace-minutes <n>          下一跳跳票宽限分钟数 (默认 ${DEFAULT_GRACE_MINUTES})
  --stale-periods <n>          落后几个周期算停滞 (默认 ${DEFAULT_STALE_PERIODS})
  --cadence-window-hours <n>   起搏缺跳审计窗口小时数 (默认 ${DEFAULT_CADENCE_WINDOW_HOURS})
  --cadence-grace-minutes <n>  相邻两跳迟到宽限分钟数 (默认 ${DEFAULT_CADENCE_GRACE_MINUTES})
  --runs-limit <n>             每条 routine 拉取的 runs 条数 (默认 ${CADENCE_RUNS_LIMIT})
  --no-cadence                 跳过起搏缺跳审计 (只做单点体检, 调试用)
`;

async function getJson(url, { apiKey, fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function main(argv = process.argv.slice(2), env = process.env, deps = {}) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    console.error(String(err?.message || err));
    return 2;
  }
  const { flags, options } = parsed;
  if (flags.help) {
    console.log(HELP);
    return 0;
  }

  const apiKey = env.PAPERCLIP_API_KEY;
  const apiBase = normalizeApiBase(env.PAPERCLIP_API_URL);
  if (!apiKey || !apiBase) {
    console.error("缺少 PAPERCLIP_API_URL / PAPERCLIP_API_KEY");
    return 2;
  }

  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const now = deps.now ?? Date.now();
  const issueId = options.issue || env.PAPERCLIP_TASK_ID || null;
  const companyId = await resolveCompanyId({
    apiBase,
    apiKey,
    companyId: options.company || env.PAPERCLIP_COMPANY_ID || null,
    issueId,
    fetchImpl,
  });
  if (!companyId) {
    console.error("无法解析 companyId (传 --company / --issue 或注入 PAPERCLIP_COMPANY_ID)");
    return 2;
  }

  // 心法 #66: `/companies/{cid}/routines` 是唯一返回 routine 数据的路由
  const payload = await getJson(`${apiBase}/companies/${companyId}/routines`, { apiKey, fetchImpl });
  const routines = pickRoutines(payload);

  // 起搏缺跳审计: 逐条拉 runs 历史 (单点 lastFiredAt/nextRunAt 看不见已自愈的整跳缺失).
  // 拉取失败只让该条退化为"数据不足", 不让整次体检失败 (守护工具本身必须先说得出话).
  let runsById = null;
  if (!flags.noCadence) {
    runsById = {};
    for (const routine of routines) {
      const trigger = triggerOf(routine);
      if (!routine?.id || !trigger?.cronExpression) continue;
      try {
        const runsPayload = await getJson(`${apiBase}/routines/${routine.id}/runs?limit=${options.runsLimit}`, { apiKey, fetchImpl });
        runsById[routine.id] = pickRuns(runsPayload);
      } catch {
        runsById[routine.id] = null;
      }
    }
  }

  const report = checkRoutines(routines, now, {
    graceMinutes: options.graceMinutes,
    stalePeriods: options.stalePeriods,
    runsById,
    cadenceWindowHours: options.cadenceWindowHours,
    cadenceGraceMinutes: options.cadenceGraceMinutes,
  });

  if (flags.json) console.log(JSON.stringify({ companyId, ...report }, null, 2));
  else if (flags.brief) console.log(renderBrief(report));
  else console.log(renderText(report));

  if (flags.gate && report.gate.failed) return 3;
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().then((code) => {
    process.exitCode = code;
  });
}
