#!/usr/bin/env node
/**
 * scripts/hermes-routine-execution-audit.mjs
 *
 * **巡检单闭环审计 (Routine Execution Closure Audit)** — 调度器起了搏, 它拉起的执行单收口了吗?
 *
 * 背景: 前两轮补上了两块缺口 —— `hermes-scheduler-health-check.mjs` 答"**调度器本人
 * 还在按节奏起搏吗**", `hermes-open-issue-liveness-scan.mjs` 答"**工单还有活路吗**".
 * 但两者都答不了一件事: routine 每跳**真的会拉起一张新的执行单**, 这些执行单有谁在收口?
 * 体检只看得见 `trigger.lastResult` 链到的那**一张** (最近一跳), 历史跳次的执行单无人统计,
 * 于是"起搏 100% 正常 + 执行单大批漏网"这种形态可以长期隐形.
 *
 * 归属口径 (本工具唯一的数据基础, 不靠猜):
 *   控制面给每张执行单落 `originKind = "routine_execution"` 与 `originId = <routineId>`,
 *   据此把执行单精确归到 routine —— 不用标题正则, 不按时间近似.
 *
 * 三态口径 (与 liveness scan 同一套 `OPEN_STATUSES`, 不另立第二份说法):
 *   done       — 正常收口
 *   cancelled  — **显式治理收口** (有人做了决定: 该跳不适用/被否决). 是闭环, **不是漏网**;
 *                单独计数并报 cancelRate, 取消率过高说明该 routine 的产出被治理否定, 值得看一眼,
 *                但不门禁 —— 否则一次批量治理就会被读成"巡检器坏了" (假警报比漏报更能毁掉巡检器)
 *   open       — backlog/todo/in_progress/in_review/blocked ⇒ 该跳的执行单**没人收口**
 *
 * 判定口径 (verdict, 每 routine):
 *   leak           — 有超期未闭环的执行单 ⇒ **门禁** (该跳的球掉在地上了)
 *   low_closure    — 无超期单, 但闭环率 < 阈值 (默认 0.9) ⇒ 只报不门禁
 *   in_flight      — 仍开着的单都在阈值内 (含**本 run 自己**这一跳) ⇒ 正常在飞, 不门禁
 *   clean          — 窗口内执行单全部收口
 *   no_executions  — 窗口内零执行单 (新绑定 routine / 已停用) ⇒ 数据语义, **不判故障** (心法 #124)
 *
 * 两条不许猜的铁律:
 *   ① 漏网阈值随 cron 周期缩放 (`周期 × leakPeriods + 宽限`), 否则小时级 routine 会被
 *      15 分钟口径天天误报 —— 与调度器体检同一套防假警报口径.
 *   ② 归属不明的执行单 (originId 不在现行 routine 表里, 例: routine 已删) 落到
 *      `unattributed` 组, 用保守周期 60 分钟判漏网, 组名如实标 `unattributed_leak`.
 *
 * 用法:
 *   node scripts/hermes-routine-execution-audit.mjs              # 人读报告
 *   node scripts/hermes-routine-execution-audit.mjs --brief      # 一行审计 (心跳用)
 *   node scripts/hermes-routine-execution-audit.mjs --json       # 机器读 JSON
 *   node scripts/hermes-routine-execution-audit.mjs --gate       # 门禁: 有漏网时退出码 3
 *   node scripts/hermes-routine-execution-audit.mjs --issue <uuid>   # 由工单反查 companyId (心法 #148)
 *
 * 环境变量: PAPERCLIP_API_URL / PAPERCLIP_API_KEY / PAPERCLIP_COMPANY_ID / PAPERCLIP_TASK_ID
 *
 * 退出码: 0 = 审计完成 (无门禁失效, 或不带 --gate); 2 = 缺 API base/key 或参数非法;
 *         3 = `--gate` 下存在 leak / unattributed_leak.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeApiBase, pickRoutines, pickIssues, roleForRoutine } from "./hermes-heartbeat-snapshot.mjs";
import { scanAllIssues } from "./lib/paperclip-issue-scan.mjs";
import { resolveCompanyId, OPEN_STATUSES } from "./hermes-open-issue-liveness-scan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..");

/** 控制面给 routine 执行单落的 originKind (归属唯一依据) */
export const ROUTINE_EXECUTION_ORIGIN = "routine_execution";

/** 终结态: done = 正常收口; cancelled = 显式治理收口 (都是闭环, 不是漏网) */
export const CLOSED_STATUSES = ["done", "cancelled"];

/** 判定顺序 (人读报告按这个顺序渲染) */
export const AUDIT_VERDICTS = ["leak", "low_closure", "in_flight", "clean", "no_executions"];

/** 会让执行单**永久掉在地上**的形态 ⇒ 门禁 (--gate 退出码 3) */
export const GATE_VERDICTS = ["leak"];

export const VERDICT_BADGE = {
  leak: "❌ 漏网",
  low_closure: "⚠️ 闭环偏低",
  in_flight: "🔄 在飞",
  clean: "✅ 全闭环",
  no_executions: "❔ 窗口内无执行单",
};

/** 下一跳宽限窗口 (分钟) — 与调度器体检同一口径 */
export const DEFAULT_GRACE_MINUTES = 5;

/** 落后几个周期算漏网 */
export const DEFAULT_LEAK_PERIODS = 1;

/** 闭环率红线 (done + cancelled / 该收口的执行单) */
export const DEFAULT_CLOSURE_THRESHOLD = 0.9;

/**
 * 低于这个样本量不下闭环率判定.
 *
 * 必要性: 一条刚绑定/刚启用的 routine 头几跳里, 开放单占比天然很高 (首跳那一刻开放率就是 100%),
 * 按比例判 low_closure 会把"新 routine 正在起步"误报成"闭环偏低" —— 样本不足不下判定 (不许猜).
 */
export const DEFAULT_MIN_CLOSURE_SAMPLE = 5;

/** 归属不明的执行单, 无法解析 cron 时的保守周期假设 (分钟) — 只用于判漏网, 如实标注 */
export const DEFAULT_FALLBACK_PERIOD_MINUTES = 60;

/** issues 列表一次拉取条数 (控制面默认分页远小于本值) */
export const DEFAULT_ISSUE_LIMIT = 1000;

// ── 基础口径 ────────────────────────────────────────────────────────────────

const isNum = (value) => typeof value === "number" && Number.isFinite(value);

/** 本张工单是不是 routine 执行单 */
export function isExecutionIssue(issue) {
  return issue?.originKind === ROUTINE_EXECUTION_ORIGIN;
}

/** 执行单 → 拉起它的 routineId (非执行单返回 null) */
export function executionRoutineIdOf(issue) {
  if (!isExecutionIssue(issue)) return null;
  return typeof issue.originId === "string" && issue.originId !== "" ? issue.originId : null;
}

export function isClosedStatus(status) {
  return CLOSED_STATUSES.includes(status);
}

/** 与 liveness scan 同一份开放态口径 (不另立第二份说法) */
export function isOpenStatus(status) {
  return OPEN_STATUSES.includes(status);
}

export function parseTimeMs(value) {
  if (typeof value !== "string" || value === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** 两点间分钟数 (含小数, 保留 1 位); 任一不可解析返回 null */
export function minutesBetween(fromIso, toIso) {
  const from = parseTimeMs(fromIso);
  const to = parseTimeMs(toIso);
  if (from === null || to === null) return null;
  return round1((to - from) / 60000);
}

export function minutesSince(iso, now = Date.now()) {
  const ms = parseTimeMs(iso);
  if (ms === null) return null;
  return round1((now - ms) / 60000);
}

const round1 = (value) => (isNum(value) ? Math.round(value * 10) / 10 : null);

/** 最近秩 (nearest-rank) 分位: p ∈ (0,1], 对升序数组 */
export function percentile(sortedAsc, p) {
  if (!Array.isArray(sortedAsc) || sortedAsc.length === 0) return null;
  if (!isNum(p) || p <= 0 || p > 1) return null;
  const index = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
  return sortedAsc[index];
}

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : round1((sorted[mid - 1] + sorted[mid]) / 2);
}

export function sortByCreatedAt(rows) {
  return [...rows].sort((a, b) => {
    const ta = parseTimeMs(a?.createdAt) ?? 0;
    const tb = parseTimeMs(b?.createdAt) ?? 0;
    return ta - tb || String(a?.identifier ?? "").localeCompare(String(b?.identifier ?? ""));
  });
}

// ── 闭环耗时 ────────────────────────────────────────────────────────────────

/**
 * 闭环耗时统计 (只算 done, 用 completedAt; 缺 completedAt 时降级用 updatedAt 并计数).
 *
 * cancelled 行**不进耗时**: 取消时刻反映的是治理动作发生的时间, 不是执行单的闭环性能,
 * 把两者混进同一个中位数会让本指标失去意义 (示范项目 44 张单在同一个晚上被批量取消).
 */
export function closureLatency(rows) {
  const values = [];
  let fallbacks = 0;
  let unmeasured = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.status !== "done") continue;
    const created = parseTimeMs(row.createdAt);
    if (created === null) {
      unmeasured += 1;
      continue;
    }
    const completed = parseTimeMs(row.completedAt);
    let end = completed;
    if (end === null) {
      end = parseTimeMs(row.updatedAt);
      if (end !== null) fallbacks += 1;
    }
    if (end === null) {
      unmeasured += 1;
      continue;
    }
    values.push(round1((end - created) / 60000));
  }
  if (values.length === 0) {
    return { n: 0, medianMinutes: null, p95Minutes: null, maxMinutes: null, fallbacks, unmeasured };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    medianMinutes: median(sorted),
    p95Minutes: percentile(sorted, 0.95),
    maxMinutes: sorted[sorted.length - 1],
    fallbacks,
    unmeasured,
  };
}

/** 漏网阈值: 周期 × leakPeriods + 宽限 (周期不可解析时用保守周期), 与调度器体检同口径 */
export function leakThresholdMinutes(periodMinutes, opts = {}) {
  const leakPeriods = isNum(opts.leakPeriods) && opts.leakPeriods > 0 ? opts.leakPeriods : DEFAULT_LEAK_PERIODS;
  const grace = isNum(opts.graceMinutes) && opts.graceMinutes >= 0 ? opts.graceMinutes : DEFAULT_GRACE_MINUTES;
  const period = isNum(periodMinutes) && periodMinutes > 0 ? periodMinutes : DEFAULT_FALLBACK_PERIOD_MINUTES;
  return round1(period * leakPeriods + grace);
}

// ── 单 routine 审计 ─────────────────────────────────────────────────────────

function executionRowOf(issue, now, { currentIssueId, thresholdMinutes, fallbackPeriod = false }) {
  const ageMinutes = minutesSince(issue.createdAt, now);
  const isCurrent = Boolean(currentIssueId) && issue.id === currentIssueId;
  return {
    id: issue.id ?? null,
    identifier: issue.identifier ?? null,
    status: issue.status ?? null,
    assigneeAgentId: issue.assigneeAgentId ?? null,
    createdAt: issue.createdAt ?? null,
    updatedAt: issue.updatedAt ?? null,
    completedAt: issue.completedAt ?? null,
    ageMinutes,
    current: isCurrent,
    fallbackPeriod,
    // 本轮 run 自己的执行单永远是 open —— 天然不算漏网
    overThreshold: !isCurrent && isOpenStatus(issue.status) && isNum(ageMinutes) && ageMinutes > thresholdMinutes,
  };
}

/**
 * 单 routine 执行单闭环审计.
 *
 * @returns 行对象: 计数 / 闭环率 / 耗时 / leak 明细 / verdict / gate / notes
 */
export function auditRoutine({ routine, executions, now = Date.now(), opts = {} } = {}) {
  const r = routine ?? {};
  const trigger = Array.isArray(r.triggers) ? r.triggers[0] : null;
  const cronExpression = trigger?.cronExpression ?? null;
  const periodMinutes = opts.periodMinutes ?? null;
  const thresholdMinutes = opts.thresholdMinutes ?? leakThresholdMinutes(periodMinutes, opts);
  const closureThreshold = isNum(opts.closureThreshold) ? opts.closureThreshold : DEFAULT_CLOSURE_THRESHOLD;
  const currentIssueId = opts.currentIssueId ?? null;
  const rows = sortByCreatedAt(Array.isArray(executions) ? executions : []);

  const counts = { done: 0, cancelled: 0, open: 0 };
  for (const row of rows) {
    if (row?.status === "done") counts.done += 1;
    else if (row?.status === "cancelled") counts.cancelled += 1;
    else if (isOpenStatus(row?.status)) counts.open += 1;
  }

  const detail = rows.map((row) => executionRowOf(row, now, { currentIssueId, thresholdMinutes }));
  const leak = detail.filter((row) => row.overThreshold);
  const current = detail.find((row) => row.current) ?? null;
  const inFlight = detail.filter((row) => !row.overThreshold && !row.current && isOpenStatus(row.status));
  const total = rows.length;

  const notes = [];
  // 闭环率分母剔除**本 run 自己**这一跳: 它此刻必然是 open, 算进去等于自己给自己扣分.
  const currentOpen = detail.find((row) => row.current && isOpenStatus(row.status)) ? 1 : 0;
  const rateBasis = Math.max(0, total - (current ? 1 : 0));
  const minSample = isNum(opts.minClosureSample) ? opts.minClosureSample : DEFAULT_MIN_CLOSURE_SAMPLE;

  const closureRate = rateBasis === 0 ? null : round1(((counts.done + counts.cancelled) / rateBasis) * 100) / 100;
  const doneRate = rateBasis === 0 ? null : round1((counts.done / rateBasis) * 100) / 100;
  const cancelRate = rateBasis === 0 ? null : round1((counts.cancelled / rateBasis) * 100) / 100;

  let verdict;
  let gate = false;
  if (total === 0) {
    verdict = "no_executions";
    notes.push("窗口内零执行单 ⇒ 数据语义, 不判故障 (心法 #124): 可能新绑定 / 已停用 / 窗口太窄");
  } else if (leak.length > 0) {
    verdict = "leak";
    gate = true;
    notes.push(`${leak.length} 张执行单超期未闭环 (> ${thresholdMinutes} 分钟): 该跳的球掉在地上了`);
  } else if (rateBasis >= minSample && isNum(closureRate) && closureRate < closureThreshold) {
    verdict = "low_closure";
    notes.push(
      `闭环率 ${closureRate} < 阈值 ${closureThreshold} (样本 ${rateBasis} ≥ ${minSample}, 含 cancelled 一起算仍不达标) ⇒ 只报不门禁`,
    );
  } else if (counts.open > 0) {
    verdict = "in_flight";
    notes.push(`${counts.open} 张仍开着, 全部在阈值 ${thresholdMinutes} 分钟内 ⇒ 正常在飞, 不判漏网`);
  } else {
    verdict = "clean";
  }

  if (rateBasis > 0 && rateBasis < minSample) {
    notes.push(`样本 ${rateBasis} < ${minSample} ⇒ 不下闭环率判定 (新 routine 起步期会被比例误报)`);
  }
  if (counts.cancelled > 0) {
    notes.push(`cancelled ${counts.cancelled} 张 (cancelRate ${cancelRate}) — 显式治理收口, 计入闭环不计入漏网`);
  }
  if (current) {
    notes.push(
      `本轮执行单 ${current.identifier ?? current.id} 由本 run 持有 (${current.status}) — 天然在飞${currentOpen ? ", 已从闭环率分母剔除" : ""}`,
    );
  }
  if (cronExpression === null) notes.push("cronExpression 缺失/阶段态 ⇒ 漏网阈值回落保守周期, 如实标注");

  return {
    id: r.id ?? null,
    role: roleForRoutine(r),
    title: r.title ?? r.name ?? null,
    status: r.status ?? null,
    cronExpression,
    periodMinutes,
    thresholdMinutes,
    closureThreshold,
    total,
    done: counts.done,
    cancelled: counts.cancelled,
    open: counts.open,
    closureRate,
    doneRate,
    cancelRate,
    latency: closureLatency(rows),
    leak,
    inFlight,
    current,
    lastCreatedAt: rows.length > 0 ? rows[rows.length - 1].createdAt ?? null : null,
    verdict,
    gate,
    notes,
  };
}

/** 归属不明的执行单 (originId 不在现行 routine 表里 / 缺 originId) */
export function groupUnattributed(executions, knownRoutineIds, now = Date.now(), opts = {}) {
  const known = new Set(Array.isArray(knownRoutineIds) ? knownRoutineIds : []);
  const rows = (Array.isArray(executions) ? executions : []).filter((row) => {
    if (!isExecutionIssue(row)) return false;
    const origin = executionRoutineIdOf(row);
    return origin === null || !known.has(origin);
  });
  const currentIssueId = opts.currentIssueId ?? null;
  const thresholdMinutes = opts.thresholdMinutes ?? leakThresholdMinutes(null, opts);
  const detail = rows.map((row) => executionRowOf(row, now, { currentIssueId, thresholdMinutes, fallbackPeriod: true }));
  const leaks = detail.filter((row) => row.overThreshold);
  const openRows = detail.filter((row) => isOpenStatus(row.status) && !row.current);
  return {
    total: rows.length,
    done: detail.filter((row) => row.status === "done").length,
    cancelled: detail.filter((row) => row.status === "cancelled").length,
    open: openRows.length,
    openRows,
    leaks,
    thresholdMinutes,
    rows: detail,
  };
}

/** 全部 routine + 全部工单 → 巡检单闭环审计报告 */
export function auditExecutions({ routines, issues, now = Date.now(), opts = {} } = {}) {
  const routineList = pickRoutines(routines);
  const issueList = pickIssues(issues);
  const currentIssueId = opts.currentIssueId ?? null;
  const sinceHours = isNum(opts.sinceHours) && opts.sinceHours > 0 ? opts.sinceHours : null;
  const windowStart = sinceHours === null ? null : now - sinceHours * 3600000;

  const executions = issueList.filter((issue) => {
    if (!isExecutionIssue(issue)) return false;
    if (windowStart === null) return true;
    const created = parseTimeMs(issue.createdAt);
    return created !== null && created >= windowStart;
  });

  const byRoutine = new Map(routineList.map((routine) => [routine?.id ?? null, []]));
  const unattributedRows = [];
  for (const row of executions) {
    const origin = executionRoutineIdOf(row);
    if (origin !== null && byRoutine.has(origin)) byRoutine.get(origin).push(row);
    else unattributedRows.push(row);
  }

  const rows = routineList
    .map((routine) => {
      const periodMinutes = opts.periodMinutesOf ? opts.periodMinutesOf(routine) : null;
      return auditRoutine({
        routine,
        executions: byRoutine.get(routine?.id ?? null) ?? [],
        now,
        opts: { ...opts, periodMinutes, currentIssueId },
      });
    })
    .sort((a, b) => {
      const rank = (row) => AUDIT_VERDICTS.indexOf(row.verdict);
      return rank(a) - rank(b) || String(a.role).localeCompare(String(b.role));
    });

  const unattributed = groupUnattributed(unattributedRows, routineList.map((r) => r?.id), now, {
    ...opts,
    currentIssueId,
    fallbackPeriodMinutes: DEFAULT_FALLBACK_PERIOD_MINUTES,
  });

  const counts = {};
  for (const verdict of AUDIT_VERDICTS) counts[verdict] = 0;
  for (const row of rows) counts[row.verdict] = (counts[row.verdict] ?? 0) + 1;

  const totals = executions.reduce(
    (acc, row) => {
      if (row?.status === "done") acc.done += 1;
      else if (row?.status === "cancelled") acc.cancelled += 1;
      else if (isOpenStatus(row?.status)) acc.open += 1;
      return acc;
    },
    { done: 0, cancelled: 0, open: 0 },
  );

  const createdLast24h = executions.filter((row) => {
    const created = parseTimeMs(row.createdAt);
    return created !== null && created >= now - 86400000;
  }).length;

  const unattributedGate = unattributed.leaks.length > 0;
  const failed = rows.filter((row) => row.gate);

  return {
    generatedAt: new Date(now).toISOString(),
    windowHours: sinceHours,
    routines: rows,
    counts,
    executions: { total: executions.length, ...totals, createdLast24h },
    noise: {
      totalIssues: issueList.length,
      executionShare: issueList.length === 0 ? null : round1((executions.length / issueList.length) * 100) / 100,
      perDay24h: createdLast24h,
    },
    unattributed: {
      total: unattributed.total,
      done: unattributed.done,
      cancelled: unattributed.cancelled,
      open: unattributed.open,
      leaks: unattributed.leaks,
      thresholdMinutes: unattributed.thresholdMinutes,
    },
    gate: {
      failed: failed.length > 0 || unattributedGate,
      verdicts: [...new Set([...failed.map((row) => row.verdict), ...(unattributedGate ? ["unattributed_leak"] : [])])],
      ids: failed.map((row) => row.id),
      leakIssueIds: [...failed.flatMap((row) => row.leak.map((l) => l.id)), ...unattributed.leaks.map((l) => l.id)],
    },
  };
}

// ── 渲染 ────────────────────────────────────────────────────────────────────

const pct = (value) => (isNum(value) ? `${Math.round(value * 100)}%` : "n/a");

/** 一行审计 (心跳专用) */
export function renderBrief(audit) {
  const head =
    `EXEC ${audit.generatedAt} routines=${audit.routines.length}` +
    ` executions=${audit.executions.total} ${audit.executions.done}done/${audit.executions.cancelled}cancel/${audit.executions.open}open` +
    (audit.unattributed.total > 0 ? ` ±unattributed=${audit.unattributed.total}` : "") +
    ` · leak=${audit.routines.reduce((n, row) => n + row.leak.length, 0) + audit.unattributed.leaks.length}` +
    ` inflight=${audit.routines.reduce((n, row) => n + row.inFlight.length, 0)}` +
    ` · noise=${pct(audit.noise.executionShare)}` +
    ` · gate=${audit.gate.failed ? `FAIL(${audit.gate.verdicts.join(",")})` : "OK"}`;

  const body = audit.routines
    .map((row) => {
      const parts =
        `${row.total}=${row.done}done+${row.cancelled}cancel+${row.open}open`;
      const cadence = row.periodMinutes === null ? `cron=${row.cronExpression ?? "null"}` : `${row.periodMinutes}m`;
      const latency = row.latency.n > 0 ? ` 中位${row.latency.medianMinutes}m(p95 ${row.latency.p95Minutes}m)` : " 无耗时样本";
      const last = row.current?.identifier ? ` → 本跳 ${row.current.identifier}` : row.lastCreatedAt ? ` → 上跳 ${String(row.lastCreatedAt).slice(11, 16)}Z` : "";
      return `${row.role}:${VERDICT_BADGE[row.verdict] ?? row.verdict} ${cadence} ${parts}${latency}${last}`;
    })
    .join(" · ");

  return body ? `${head} · ${body}` : head;
}

/** 人读报告 */
export function renderText(audit) {
  const lines = [];
  lines.push(`═══ 巡检单闭环审计 (Routine Execution Closure Audit) @ ${audit.generatedAt} ═══`);
  lines.push(
    `routine ${audit.routines.length} 条 · 执行单 ${audit.executions.total} 张` +
      ` (done ${audit.executions.done} · cancelled ${audit.executions.cancelled} · open ${audit.executions.open})` +
      ` · 24h 新增 ${audit.executions.createdLast24h} 张` +
      (audit.windowHours === null ? "" : ` · 窗口 ${audit.windowHours}h`),
  );
  lines.push(
    `盘面噪音: 执行单 ${audit.executions.total} / 全部工单 ${audit.noise.totalIssues} = ${pct(audit.noise.executionShare)}`,
  );
  lines.push(`门禁: ${audit.gate.failed ? `❌ FAIL (${audit.gate.verdicts.join(", ")})` : "✅ OK"}`);
  lines.push("");

  for (const row of audit.routines) {
    lines.push(`${VERDICT_BADGE[row.verdict] ?? row.verdict}  [${row.role}] ${row.title ?? "(无标题)"}`);
    lines.push(
      `    id=${row.id} status=${row.status} cron=${row.cronExpression ?? "null"} 阈值=${row.thresholdMinutes} 分钟` +
        ` · 闭环率=${pct(row.closureRate)} (done ${pct(row.doneRate)} / cancel ${pct(row.cancelRate)})`,
    );
    lines.push(
      `    执行单 ${row.total} = done ${row.done} + cancelled ${row.cancelled} + open ${row.open}` +
        ` · 耗时 n=${row.latency.n} 中位=${row.latency.medianMinutes ?? "n/a"}m p95=${row.latency.p95Minutes ?? "n/a"}m max=${
          row.latency.maxMinutes ?? "n/a"
        }m`,
    );
    if (row.lastCreatedAt) lines.push(`    最近一跳执行单: ${String(row.lastCreatedAt)}`);
    for (const leak of row.leak) {
      lines.push(
        `    ❌ 漏网: ${leak.identifier ?? leak.id} (${leak.status}, 已 ${leak.ageMinutes} 分钟, 联系人 ${leak.assigneeAgentId ?? "无"})`,
      );
    }
    for (const note of row.notes) lines.push(`    · ${note}`);
    lines.push("");
  }

  if (audit.unattributed.total > 0) {
    lines.push(
      `归属不明执行单 ${audit.unattributed.total} 张 (originId 不在现行 routine 表里)` +
        ` = done ${audit.unattributed.done} + cancelled ${audit.unattributed.cancelled} + open ${audit.unattributed.open}` +
        ` · 保守阈值 ${audit.unattributed.thresholdMinutes} 分钟`,
    );
    for (const leak of audit.unattributed.leaks) {
      lines.push(`    ❌ unattributed_leak: ${leak.identifier ?? leak.id} (${leak.status}, 已 ${leak.ageMinutes} 分钟)`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── CLI ─────────────────────────────────────────────────────────────────────

/** 与仓库既有工具同形: {flags, options}, 未知参数抛错由 main 归一为退出码 2 */
export function parseArgs(argv = []) {
  const flags = { json: false, brief: false, gate: false, help: false };
  const options = {
    issue: null,
    company: null,
    current: null,
    limit: DEFAULT_ISSUE_LIMIT,
    sinceHours: 0,
    closureThreshold: DEFAULT_CLOSURE_THRESHOLD,
    leakPeriods: DEFAULT_LEAK_PERIODS,
    graceMinutes: DEFAULT_GRACE_MINUTES,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--brief") flags.brief = true;
    else if (arg === "--gate") flags.gate = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--issue") options.issue = argv[++i] || null;
    else if (arg === "--company") options.company = argv[++i] || null;
    else if (arg === "--current") options.current = argv[++i] || null;
    else if (arg === "--limit") options.limit = Number(argv[++i]) || DEFAULT_ISSUE_LIMIT;
    else if (arg === "--since-hours") options.sinceHours = Number(argv[++i]) || 0;
    else if (arg === "--closure-threshold") {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value <= 0 || value > 1) throw new Error("--closure-threshold 需落在 (0, 1]");
      options.closureThreshold = value;
    } else if (arg === "--leak-periods") options.leakPeriods = Number(argv[++i]) || DEFAULT_LEAK_PERIODS;
    else if (arg === "--grace-minutes") options.graceMinutes = Number(argv[++i]) || DEFAULT_GRACE_MINUTES;
    else throw new Error(`未知参数: ${arg}`);
  }
  return { flags, options };
}

const HELP = `hermes-routine-execution-audit — 巡检单闭环审计 (调度器起了搏, 执行单收口了吗)

  --brief                      一行审计 (心跳专用)
  --json                       机器读 JSON
  --gate                       门禁: 存在 leak / unattributed_leak 时退出码 3
  --issue <uuid>               用该工单解析 companyId (心法 #148)
  --company <cid>              指定 companyId (默认取 PAPERCLIP_COMPANY_ID)
  --current <uuid>             本轮 run 自己的执行单 (默认取 PAPERCLIP_TASK_ID, 天然不算漏网)
  --limit <n>                  issues 列表拉取条数 (默认 ${DEFAULT_ISSUE_LIMIT})
  --since-hours <n>            只看最近 n 小时创建的执行单 (0 = 全量)
  --closure-threshold <0..1>   闭环率红线 (默认 ${DEFAULT_CLOSURE_THRESHOLD})
  --leak-periods <n>           落后几个周期算漏网 (默认 ${DEFAULT_LEAK_PERIODS})
  --grace-minutes <n>          漏网宽限分钟数 (默认 ${DEFAULT_GRACE_MINUTES})
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

/** cron → 周期分钟数; 不在本工具解析面就返回 null (不许猜) */
export function periodMinutesOfRoutine(routine) {
  const trigger = Array.isArray(routine?.triggers) ? routine.triggers[0] : null;
  const expression = trigger?.cronExpression;
  if (typeof expression !== "string") return null;
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dom, month, dow] = parts;
  const every = /^\*\/(\d+)$/.exec(minute);
  if (every) {
    const step = Number(every[1]);
    if (!Number.isInteger(step) || step <= 0 || step > 60 || 60 % step !== 0) return null;
    return hour === "*" && dom === "*" && month === "*" && dow === "*" ? step : null;
  }
  if (!/^\d{1,2}$/.test(minute)) return null;
  const min = Number(minute);
  if (min < 0 || min > 59) return null;
  if (dom === "*" && month === "*" && dow === "*") {
    if (hour === "*") return 60;
    if (/^\d{1,2}$/.test(hour) && Number(hour) <= 23) return 1440;
    return null;
  }
  if (/^\d{1,2}$/.test(hour) && /^\d$/.test(dow)) return 10080;
  return null;
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
  const routinesPayload = await getJson(`${apiBase}/companies/${companyId}/routines`, { apiKey, fetchImpl });
  // 必须翻页: 单枪 `?limit=N` 会静默截断 — 审计漏工单 = 漏判 routine 泄漏. 见 scripts/lib/paperclip-issue-scan.mjs
  const issuesScan = await scanAllIssues({
    loadPage: async (params) =>
      pickIssues(await getJson(`${apiBase}/companies/${companyId}/issues?${params.toString()}`, { apiKey, fetchImpl })),
    pageLimit: options.limit,
  });

  const audit = auditExecutions({
    routines: routinesPayload,
    issues: issuesScan.rows,
    now,
    opts: {
      currentIssueId: options.current || env.PAPERCLIP_TASK_ID || null,
      sinceHours: options.sinceHours,
      closureThreshold: options.closureThreshold,
      leakPeriods: options.leakPeriods,
      graceMinutes: options.graceMinutes,
      periodMinutesOf: periodMinutesOfRoutine,
    },
  });

  if (flags.json) console.log(JSON.stringify({ companyId, ...audit }, null, 2));
  else if (flags.brief) console.log(renderBrief(audit));
  else console.log(renderText(audit));

  if (flags.gate && audit.gate.failed) return 3;
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().then((code) => {
    process.exitCode = code;
  });
}
