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
 * 用法:
 *   node scripts/hermes-scheduler-health-check.mjs            # 人读报告
 *   node scripts/hermes-scheduler-health-check.mjs --brief    # 一行体检 (心跳用)
 *   node scripts/hermes-scheduler-health-check.mjs --json     # 机器读 JSON
 *   node scripts/hermes-scheduler-health-check.mjs --gate     # 门禁: 有关键失效时退出码 3
 *   node scripts/hermes-scheduler-health-check.mjs --issue <uuid>   # 由工单反查 companyId (心法 #148)
 *
 * 环境变量: PAPERCLIP_API_URL / PAPERCLIP_API_KEY / PAPERCLIP_COMPANY_ID / PAPERCLIP_TASK_ID
 *
 * 退出码: 0 = 体检完成 (无门禁失效, 或不带 --gate); 2 = 缺 API base/key;
 *         3 = `--gate` 下存在 trigger_missing / trigger_disabled / stalled.
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

/**
 * routine 列表体检汇总.
 *
 * @returns {{generatedAt:string, routines:object[], counts:object, gate:{failed:boolean, verdicts:string[], ids:string[]}}}
 */
export function checkRoutines(routines, now = Date.now(), opts = {}) {
  const rows = (Array.isArray(routines) ? routines : [])
    .map((routine) => evaluateRoutine(routine, now, opts))
    .sort((a, b) => {
      const rank = (row) => SCHED_VERDICTS.indexOf(row.verdict);
      return rank(a) - rank(b) || String(a.role).localeCompare(String(b.role));
    });

  const counts = {};
  for (const verdict of SCHED_VERDICTS) counts[verdict] = 0;
  for (const row of rows) counts[row.verdict] = (counts[row.verdict] ?? 0) + 1;

  const failed = rows.filter((row) => row.gate);
  return {
    generatedAt: new Date(now).toISOString(),
    routines: rows,
    counts,
    gate: {
      failed: failed.length > 0,
      verdicts: [...new Set(failed.map((row) => row.verdict))],
      ids: failed.map((row) => row.id),
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
      return `${row.role}:${VERDICT_BADGE[row.verdict] ?? row.verdict} ${cadence} ${age} ${next} ${link}`;
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
    for (const note of row.notes) lines.push(`    · ${note}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** 与仓库既有工具同形: {flags, options}, 未知参数抛错由 main 归一为退出码 2 */
export function parseArgs(argv = []) {
  const flags = { json: false, brief: false, gate: false, help: false };
  const options = {
    issue: null,
    company: null,
    graceMinutes: DEFAULT_GRACE_MINUTES,
    stalePeriods: DEFAULT_STALE_PERIODS,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--brief") flags.brief = true;
    else if (arg === "--gate") flags.gate = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--issue") options.issue = argv[++i] || null;
    else if (arg === "--company") options.company = argv[++i] || null;
    else if (arg === "--grace-minutes") options.graceMinutes = Number(argv[++i]) || DEFAULT_GRACE_MINUTES;
    else if (arg === "--stale-periods") options.stalePeriods = Number(argv[++i]) || DEFAULT_STALE_PERIODS;
    else throw new Error(`未知参数: ${arg}`);
  }
  return { flags, options };
}

const HELP = `hermes-scheduler-health-check — 调度器体检 (守护调度器自己的守护)

  --brief                      一行体检 (心跳专用)
  --json                       机器读 JSON
  --gate                       门禁: 存在 trigger_missing / trigger_disabled / stalled 时退出码 3
  --issue <uuid>               用该工单解析 companyId (心法 #148)
  --company <cid>              指定 companyId (默认取 PAPERCLIP_COMPANY_ID)
  --grace-minutes <n>          下一跳跳票宽限分钟数 (默认 ${DEFAULT_GRACE_MINUTES})
  --stale-periods <n>          落后几个周期算停滞 (默认 ${DEFAULT_STALE_PERIODS})
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
  const report = checkRoutines(routines, now, {
    graceMinutes: options.graceMinutes,
    stalePeriods: options.stalePeriods,
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
