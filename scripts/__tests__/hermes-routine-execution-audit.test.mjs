import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import {
  ROUTINE_EXECUTION_ORIGIN,
  CLOSED_STATUSES,
  AUDIT_VERDICTS,
  GATE_VERDICTS,
  VERDICT_BADGE,
  DEFAULT_GRACE_MINUTES,
  DEFAULT_LEAK_PERIODS,
  DEFAULT_CLOSURE_THRESHOLD,
  DEFAULT_FALLBACK_PERIOD_MINUTES,
  DEFAULT_ISSUE_LIMIT,
  isExecutionIssue,
  executionRoutineIdOf,
  isClosedStatus,
  isOpenStatus,
  parseTimeMs,
  minutesBetween,
  minutesSince,
  percentile,
  median,
  sortByCreatedAt,
  closureLatency,
  leakThresholdMinutes,
  auditRoutine,
  groupUnattributed,
  auditExecutions,
  renderBrief,
  renderText,
  parseArgs,
  periodMinutesOfRoutine,
  main,
  REPO_ROOT,
} from "../hermes-routine-execution-audit.mjs";
import { OPEN_STATUSES } from "../hermes-open-issue-liveness-scan.mjs";

const NOW = Date.parse("2026-10-16T14:40:00.000Z");
const iso = (minutesAgo) => new Date(NOW - minutesAgo * 60000).toISOString();

const XINZU = "b35ff456-cad2-42ef-9880-0fe3626beb70";
const MAINLINE = "57f09c90-ec83-4372-94c0-38684a9b2bb6";
const DEMO = "15c090f8-89cd-4359-ab51-32899784176d";
const COMPANY = "da2e705c-c80a-411b-b2ae-e39372b1251f";

function execution(overrides = {}) {
  return {
    id: "aaaaaaaa-1111-2222-3333-444444444444",
    identifier: "COOA-900",
    title: "Coolie 工坊持续研发与版本升级守护调度器 (Foundry Evolution Routine)",
    status: "done",
    originKind: ROUTINE_EXECUTION_ORIGIN,
    originId: XINZU,
    assigneeAgentId: "5419bef9-6b72-477b-a5e4-0fe19aac5b77",
    createdAt: iso(30),
    updatedAt: iso(25),
    completedAt: iso(25),
    ...overrides,
  };
}

function routine(id = XINZU, cron = "*/15 * * * *", title = "Coolie 工坊持续研发与版本升级守护调度器 (Foundry Evolution Routine)") {
  return { id, title, status: "active", triggers: [{ cronExpression: cron, enabled: true }] };
}

// ── 口径常量 ────────────────────────────────────────────────────────────────

test("ROUTINE_EXECUTION_ORIGIN 是控制面给巡检执行单落的 originKind", () => {
  assert.equal(ROUTINE_EXECUTION_ORIGIN, "routine_execution");
});

test("CLOSED_STATUSES 只含两个终结态, 且全部是闭环", () => {
  assert.deepEqual(CLOSED_STATUSES, ["done", "cancelled"]);
  for (const status of CLOSED_STATUSES) assert.ok(isClosedStatus(status));
  assert.ok(!isClosedStatus("in_progress"));
  assert.ok(!isClosedStatus("blocked"));
});

test("AUDIT_VERDICTS 顺序稳定且 GATE_VERDICTS 是其子集", () => {
  assert.deepEqual(AUDIT_VERDICTS, ["leak", "low_closure", "in_flight", "clean", "no_executions"]);
  assert.deepEqual(GATE_VERDICTS, ["leak"]);
  for (const verdict of GATE_VERDICTS) assert.ok(AUDIT_VERDICTS.includes(verdict));
  for (const verdict of AUDIT_VERDICTS) assert.equal(typeof VERDICT_BADGE[verdict], "string");
});

test("默认阈值: 宽限 5 分钟 / 漏网 1 周期 / 闭环率 0.9 / 保守周期 60 分钟 / limit 1000", () => {
  assert.equal(DEFAULT_GRACE_MINUTES, 5);
  assert.equal(DEFAULT_LEAK_PERIODS, 1);
  assert.equal(DEFAULT_CLOSURE_THRESHOLD, 0.9);
  assert.equal(DEFAULT_FALLBACK_PERIOD_MINUTES, 60);
  assert.equal(DEFAULT_ISSUE_LIMIT, 1000);
  assert.equal(REPO_ROOT.endsWith("coolie"), true);
});

// ── 归属口径 ────────────────────────────────────────────────────────────────

test("isExecutionIssue 只认 routine_execution", () => {
  assert.ok(isExecutionIssue({ originKind: ROUTINE_EXECUTION_ORIGIN }));
  assert.ok(!isExecutionIssue({ originKind: "manual" }));
  assert.ok(!isExecutionIssue({ originKind: "build_plan" }));
  assert.ok(!isExecutionIssue(null));
  assert.ok(!isExecutionIssue({}));
});

test("executionRoutineIdOf 取 originId, 非执行单或空 originId 返回 null", () => {
  assert.equal(executionRoutineIdOf({ originKind: ROUTINE_EXECUTION_ORIGIN, originId: XINZU }), XINZU);
  assert.equal(executionRoutineIdOf({ originKind: ROUTINE_EXECUTION_ORIGIN }), null, "缺 originId 不猜");
  assert.equal(executionRoutineIdOf({ originKind: ROUTINE_EXECUTION_ORIGIN, originId: "" }), null);
  assert.equal(executionRoutineIdOf({ originKind: "manual", originId: XINZU }), null);
});

// ── 状态口径与 liveness scan 同一份 ─────────────────────────────────────────

test("开放态口径与 liveness scan 完全一致 (不另立第二份说法)", () => {
  assert.deepEqual(OPEN_STATUSES, ["backlog", "todo", "in_progress", "in_review", "blocked"]);
  for (const status of OPEN_STATUSES) {
    assert.ok(isOpenStatus(status), `${status} 应判开放`);
    assert.ok(!isClosedStatus(status), `${status} 不应判闭环`);
  }
  assert.ok(!isOpenStatus("done"));
  assert.ok(!isOpenStatus("cancelled"));
  assert.ok(!isOpenStatus(null));
});

// ── 时间工具 ────────────────────────────────────────────────────────────────

test("parseTimeMs 对空值/畸形字符串返回 null", () => {
  assert.equal(parseTimeMs("2026-10-16T14:40:00.000Z"), NOW);
  assert.equal(parseTimeMs(""), null);
  assert.equal(parseTimeMs(null), null);
  assert.equal(parseTimeMs("not-a-date"), null);
  assert.equal(parseTimeMs(1750000000000), null, "只吃 ISO 字符串");
});

test("minutesBetween / minutesSince 保留 1 位小数, 不可解析返回 null", () => {
  assert.equal(minutesBetween("2026-10-16T14:00:00.000Z", "2026-10-16T14:05:06.000Z"), 5.1);
  assert.equal(minutesBetween("2026-10-16T14:00:00.000Z", "2026-10-16T13:00:00.000Z"), -60);
  assert.equal(minutesBetween("bad", "2026-10-16T14:00:00.000Z"), null);
  assert.equal(minutesSince("2026-10-16T14:30:00.000Z", NOW), 10);
  assert.equal(minutesSince(null, NOW), null);
});

test("percentile 用最近秩, 越界 p 返回 null", () => {
  assert.equal(percentile([1, 2, 3, 4], 0.95), 4);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2);
  assert.equal(percentile([1, 2, 3, 4], 1), 4);
  assert.equal(percentile([1], 0.95), 1);
  assert.equal(percentile([], 0.95), null);
  assert.equal(percentile([1, 2], 0), null);
  assert.equal(percentile([1, 2], 1.5), null);
});

test("median 奇偶都对, 空数组返回 null", () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([7]), 7);
  assert.equal(median([]), null);
  assert.equal(median(null), null);
});

test("sortByCreatedAt 按时间升序, 同刻按 identifier 稳定", () => {
  const rows = [
    execution({ identifier: "COOA-999", createdAt: iso(10) }),
    execution({ identifier: "COOA-901", createdAt: iso(20) }),
    execution({ identifier: "COOA-900", createdAt: iso(20) }),
  ];
  assert.deepEqual(
    sortByCreatedAt(rows).map((row) => row.identifier),
    ["COOA-900", "COOA-901", "COOA-999"],
  );
});

// ── 闭环耗时 ────────────────────────────────────────────────────────────────

test("closureLatency 用 completedAt 算 done 闭环耗时", () => {
  const stats = closureLatency([
    execution({ identifier: "COOA-1", createdAt: iso(30), completedAt: iso(24) }), // 6 分钟
    execution({ identifier: "COOA-2", createdAt: iso(30), completedAt: iso(26) }), // 4 分钟
    execution({ identifier: "COOA-3", createdAt: iso(30), completedAt: iso(20) }), // 10 分钟
  ]);
  assert.equal(stats.n, 3);
  assert.equal(stats.medianMinutes, 6);
  assert.equal(stats.p95Minutes, 10);
  assert.equal(stats.maxMinutes, 10);
  assert.equal(stats.fallbacks, 0);
});

test("closureLatency 缺 completedAt 时降级 updatedAt 并计数 fallbacks", () => {
  const stats = closureLatency([execution({ createdAt: iso(30), completedAt: null, updatedAt: iso(27) })]);
  assert.equal(stats.n, 1);
  assert.equal(stats.medianMinutes, 3);
  assert.equal(stats.fallbacks, 1);
});

test("closureLatency 排除 cancelled (治理时刻不等于闭环性能)", () => {
  const stats = closureLatency([
    execution({ status: "done", createdAt: iso(30), completedAt: iso(28), updatedAt: iso(28) }),
    execution({ status: "cancelled", createdAt: iso(30), completedAt: null, updatedAt: iso(1) }),
  ]);
  assert.equal(stats.n, 1);
  assert.equal(stats.maxMinutes, 2);
});

test("closureLatency 对缺 createdAt 的行计 unmeasured, 空输入全 null", () => {
  const stats = closureLatency([execution({ createdAt: null }), execution({ createdAt: iso(30), completedAt: iso(28) })]);
  assert.equal(stats.n, 1);
  assert.equal(stats.unmeasured, 1);
  const empty = closureLatency([]);
  assert.deepEqual(empty, { n: 0, medianMinutes: null, p95Minutes: null, maxMinutes: null, fallbacks: 0, unmeasured: 0 });
});

// ── 漏网阈值随周期缩放 (防小时级 routine 被 15 分钟口径误报) ──────────────────

test("leakThresholdMinutes = 周期 × leakPeriods + 宽限", () => {
  assert.equal(leakThresholdMinutes(15), 20);
  assert.equal(leakThresholdMinutes(60), 65);
  assert.equal(leakThresholdMinutes(1440), 1445);
  assert.equal(leakThresholdMinutes(15, { leakPeriods: 3 }), 50);
  assert.equal(leakThresholdMinutes(60, { graceMinutes: 0 }), 60);
  assert.equal(leakThresholdMinutes(null), 65, "周期不可解析回落保守 60 分钟");
  assert.equal(leakThresholdMinutes(0), 65);
  assert.equal(leakThresholdMinutes(-5), 65);
});

// ── 单 routine 判定 ─────────────────────────────────────────────────────────

test("全部收口 → clean", () => {
  const row = auditRoutine({
    routine: routine(),
    executions: [execution(), execution({ identifier: "COOA-901", status: "cancelled", completedAt: null })],
    now: NOW,
    opts: { periodMinutes: 15 },
  });
  assert.equal(row.verdict, "clean");
  assert.equal(row.gate, false);
  assert.equal(row.closureRate, 1);
  assert.equal(row.cancelRate, 0.5);
  assert.ok(row.notes.some((note) => note.includes("显式治理收口")));
});

test("超期未闭环执行单 → leak + 门禁", () => {
  const row = auditRoutine({
    routine: routine(),
    executions: [execution({ identifier: "COOA-950", status: "in_progress", completedAt: null, createdAt: iso(45) })],
    now: NOW,
    opts: { periodMinutes: 15 },
  });
  assert.equal(row.verdict, "leak");
  assert.equal(row.gate, true);
  assert.equal(row.thresholdMinutes, 20);
  assert.equal(row.leak.length, 1);
  assert.equal(row.leak[0].identifier, "COOA-950");
  assert.equal(row.leak[0].ageMinutes, 45);
});

test("阈值内的开放执行单 → in_flight, 不算漏网", () => {
  const row = auditRoutine({
    routine: routine(),
    executions: [execution({ identifier: "COOA-951", status: "todo", completedAt: null, createdAt: iso(5), updatedAt: iso(5) })],
    now: NOW,
    opts: { periodMinutes: 15 },
  });
  assert.equal(row.verdict, "in_flight");
  assert.equal(row.gate, false);
  assert.equal(row.leak.length, 0);
  assert.equal(row.inFlight.length, 1);
  assert.ok(row.notes.some((note) => note.includes("样本")), "样本不足要如实标注, 不硬判闭环率");
});

test("本轮 run 自己的执行单天然不算漏网, 单独登记为 current", () => {
  const row = auditRoutine({
    routine: routine(),
    executions: [
      execution({ id: "self-run-issue", identifier: "COOA-301", status: "in_progress", completedAt: null, createdAt: iso(1) }),
    ],
    now: NOW,
    opts: { periodMinutes: 15, currentIssueId: "self-run-issue" },
  });
  assert.equal(row.verdict, "in_flight", "本跳正在处理 ⇒ 在飞, 不是漏网");
  assert.equal(row.leak.length, 0);
  assert.equal(row.current.identifier, "COOA-301");
  assert.equal(row.current.current, true);
  assert.ok(row.notes.some((note) => note.includes("由本 run 持有")));
});

test("自 run 单即使很老也不误判为漏网 (边界: 长任务跳次)", () => {
  const row = auditRoutine({
    routine: routine(),
    executions: [execution({ id: "self", identifier: "COOA-302", status: "in_progress", completedAt: null, createdAt: iso(300) })],
    now: NOW,
    opts: { periodMinutes: 15, currentIssueId: "self" },
  });
  assert.equal(row.leak.length, 0);
  assert.equal(row.verdict, "in_flight");
});

test("闭环率 (含 cancelled) 低于阈值 → low_closure, 不门禁", () => {
  const rows = [];
  for (let i = 0; i < 8; i += 1) {
    rows.push(execution({ identifier: `COOA-9${i}0`, status: "cancelled", completedAt: null }));
  }
  rows.push(execution({ identifier: "COOA-980", status: "todo", createdAt: iso(3), completedAt: null }));
  rows.push(execution({ identifier: "COOA-981", status: "todo", createdAt: iso(4), completedAt: null }));
  const row = auditRoutine({ routine: routine(), executions: rows, now: NOW, opts: { periodMinutes: 15 } });
  assert.equal(row.total, 10);
  assert.equal(row.closureRate, 0.8);
  assert.equal(row.verdict, "low_closure");
  assert.equal(row.gate, false);
  assert.ok(row.notes.some((note) => note.includes("只报不门禁")));
});

test("窗口内零执行单 → no_executions (数据语义, 不判故障)", () => {
  const row = auditRoutine({ routine: routine(), executions: [], now: NOW, opts: { periodMinutes: 15 } });
  assert.equal(row.verdict, "no_executions");
  assert.equal(row.gate, false);
  assert.equal(row.closureRate, null);
  assert.equal(row.latency.n, 0);
  assert.ok(row.notes.some((note) => note.includes("心法 #124")));
});

test("cron 缺失时回落保守阈值并如实标注", () => {
  const row = auditRoutine({
    routine: { id: XINZU, title: "x", status: "active", triggers: [] },
    executions: [execution({ createdAt: iso(45) })],
    now: NOW,
    opts: {},
  });
  assert.equal(row.cronExpression, null);
  assert.equal(row.thresholdMinutes, 65);
  assert.ok(row.notes.some((note) => note.includes("保守周期")));
});

test("auditRoutine 行带 role/cron/最近一跳等真值字段", () => {
  const row = auditRoutine({
    routine: routine(DEMO, "0 * * * *", "[交付主线例行巡检] 示范项目"),
    executions: [execution({ originId: DEMO, createdAt: iso(30) })],
    now: NOW,
    opts: { periodMinutes: 60 },
  });
  assert.equal(row.role, "示范项目");
  assert.equal(row.cronExpression, "0 * * * *");
  assert.equal(row.lastCreatedAt, iso(30));
  assert.equal(row.status, "active");
});

// ── 归属不明 ────────────────────────────────────────────────────────────────

test("groupUnattributed 收 originId 不在现行 routine 表里的执行单", () => {
  const group = groupUnattributed(
    [
      execution({ id: "k1", identifier: "COOA-970", originId: "deleted-routine", status: "in_progress", completedAt: null, createdAt: iso(120) }),
      execution({ id: "k2", identifier: "COOA-971", originId: null }),
      execution({ id: "k3", identifier: "COOA-972", originId: XINZU }),
      execution({ id: "k4", identifier: "COOA-973", originKind: "manual", originId: null }),
    ],
    [XINZU],
    NOW,
    {},
  );
  assert.equal(group.total, 2);
  assert.equal(group.open, 1);
  assert.equal(group.openRows.length, 1);
  assert.equal(group.leaks.length, 1, "超保守阈值 (60+5) 的开放单判漏网");
  assert.equal(group.leaks[0].identifier, "COOA-970");
  assert.equal(group.leaks[0].fallbackPeriod, true, "如实标注用了保守周期");
  assert.equal(group.thresholdMinutes, 65);
});

test("groupUnattributed 对已知 routine 与手工单一律不算归属不明", () => {
  const group = groupUnattributed([execution({ originId: XINZU }), execution({ originKind: "manual" })], [XINZU], NOW, {});
  assert.equal(group.total, 0);
});

// ── 全盘审计 ────────────────────────────────────────────────────────────────

function fixture() {
  return {
    routines: [routine(), routine(MAINLINE, "0 * * * *", "[交付主线例行巡检] Coolie 工坊 AI 原生交付工厂本体系统"), routine(DEMO, "0 * * * *", "[交付主线例行巡检] 示范项目")],
    issues: [
      // 心祖: 3 done + 1 超期漏网
      execution({ id: "x1", identifier: "COOA-960", createdAt: iso(60), completedAt: iso(57), updatedAt: iso(57) }),
      execution({ id: "x2", identifier: "COOA-961", createdAt: iso(45), completedAt: iso(42), updatedAt: iso(42) }),
      execution({ id: "x3", identifier: "COOA-962", createdAt: iso(30), completedAt: iso(27), updatedAt: iso(27) }),
      execution({ id: "x4", identifier: "COOA-963", status: "blocked", completedAt: null, createdAt: iso(90) }),
      // 交付主线: 2 done
      execution({ id: "m1", identifier: "COOA-964", originId: MAINLINE, createdAt: iso(120), completedAt: iso(115), updatedAt: iso(115) }),
      execution({ id: "m2", identifier: "COOA-965", originId: MAINLINE, createdAt: iso(60), completedAt: iso(55), updatedAt: iso(55) }),
      // 示范项目: 1 done + 1 cancelled
      execution({ id: "d1", identifier: "COOA-966", originId: DEMO, createdAt: iso(180), completedAt: iso(175), updatedAt: iso(175) }),
      execution({ id: "d2", identifier: "COOA-967", originId: DEMO, status: "cancelled", completedAt: null, createdAt: iso(150), updatedAt: iso(149) }),
      // 归属不明 + 普通工单
      execution({ id: "u1", identifier: "COOA-968", originId: "ghost-routine", createdAt: iso(30), completedAt: iso(29), updatedAt: iso(29) }),
      { id: "n1", identifier: "COOA-114", status: "in_progress", originKind: "manual" },
    ],
    now: NOW,
    opts: { periodMinutesOf: periodMinutesOfRoutine },
  };
}

test("auditExecutions 按 originId 精确归属, 不靠标题正则", () => {
  const audit = auditExecutions(fixture());
  const byId = Object.fromEntries(audit.routines.map((row) => [row.id, row]));
  assert.equal(byId[XINZU].total, 4);
  assert.equal(byId[MAINLINE].total, 2);
  assert.equal(byId[DEMO].total, 2);
  assert.equal(audit.unattributed.total, 1);
});

test("auditExecutions 汇总计数与盘面噪音", () => {
  const audit = auditExecutions(fixture());
  assert.equal(audit.executions.total, 9);
  assert.equal(audit.executions.done, 7);
  assert.equal(audit.executions.cancelled, 1);
  assert.equal(audit.executions.open, 1);
  assert.equal(audit.noise.totalIssues, 10);
  assert.equal(audit.noise.executionShare, 0.9);
  assert.equal(audit.executions.createdLast24h, 9);
});

test("auditExecutions 门禁汇总 leak 与 unattributed_leak", () => {
  const audit = auditExecutions(fixture());
  assert.equal(audit.gate.failed, true);
  assert.deepEqual(audit.gate.verdicts, ["leak"]);
  assert.deepEqual(audit.gate.ids, [XINZU]);
  assert.deepEqual(audit.gate.leakIssueIds, ["x4"]);

  const ghost = fixture();
  ghost.issues.push(execution({ id: "u2", identifier: "COOA-969", originId: null, status: "todo", completedAt: null, createdAt: iso(600) }));
  const audit2 = auditExecutions(ghost);
  assert.ok(audit2.gate.verdicts.includes("unattributed_leak"), "归属不明的老开放单也要门禁");
  assert.ok(audit2.gate.leakIssueIds.includes("u2"));
});

test("auditExecutions 判定排序: 故障在前, 正常在后", () => {
  const audit = auditExecutions(fixture());
  assert.equal(audit.routines[0].verdict, "leak");
  assert.equal(audit.counts.leak, 1);
  assert.equal(audit.counts.clean, 2);
  assert.equal(audit.counts.no_executions, 0);
});

test("auditExecutions 支持 --since-hours 窗口过滤", () => {
  const audit = auditExecutions({
    ...fixture(),
    opts: { periodMinutesOf: periodMinutesOfRoutine, sinceHours: 1 },
  });
  assert.equal(audit.executions.total, 5, "只保留 60 分钟内创建的执行单 (x1/x2/x3/m2/u1)");
  assert.equal(audit.windowHours, 1);
  const byId = Object.fromEntries(audit.routines.map((row) => [row.id, row]));
  assert.equal(byId[DEMO].total, 0);
  assert.equal(byId[DEMO].verdict, "no_executions");
});

test("auditExecutions 对空回包不炸 (端点没给 routines/issues)", () => {
  const audit = auditExecutions({ routines: { error: "nope" }, issues: null, now: NOW, opts: {} });
  assert.deepEqual(audit.routines, []);
  assert.equal(audit.executions.total, 0);
  assert.equal(audit.noise.executionShare, null);
  assert.equal(audit.gate.failed, false);
});

// ── 渲染 ────────────────────────────────────────────────────────────────────

test("renderBrief 一行含 EXEC/归属计数/gate, 健康时 gate=OK", () => {
  const audit = auditExecutions({
    routines: [routine(MAINLINE, "0 * * * *", "[交付主线例行巡检] x")],
    issues: [execution({ originId: MAINLINE, createdAt: iso(120), completedAt: iso(115), updatedAt: iso(115) })],
    now: NOW,
    opts: { periodMinutesOf: periodMinutesOfRoutine },
  });
  const line = renderBrief(audit);
  assert.ok(line.startsWith("EXEC "));
  assert.ok(line.includes("routines=1"));
  assert.ok(line.includes("executions=1 1done/0cancel/0open"));
  assert.ok(line.includes("leak=0"));
  assert.ok(line.includes("gate=OK"));
  assert.ok(line.includes("交付主线:✅ 全闭环"));
  assert.ok(!line.includes("\n"), "简报必须是一行");
});

test("renderBrief 漏网时打出 FAIL(leak)", () => {
  const line = renderBrief(auditExecutions(fixture()));
  assert.ok(line.includes("gate=FAIL(leak)"));
  assert.ok(line.includes("leak=1"));
});

test("renderText 含漏网明细与取消说明, 归属不明单列一段", () => {
  const text = renderText(auditExecutions(fixture()));
  assert.ok(text.includes("巡检单闭环审计"));
  assert.ok(text.includes("❌ 漏网: COOA-963"));
  assert.ok(text.includes("显式治理收口"));
  assert.ok(text.includes("归属不明执行单 1 张"));
  assert.ok(text.includes("门禁: ❌ FAIL (leak)"));
});

// ── 参数解析 ────────────────────────────────────────────────────────────────

test("parseArgs 默认值", () => {
  const { flags, options } = parseArgs([]);
  assert.deepEqual(flags, { json: false, brief: false, gate: false, help: false });
  assert.equal(options.limit, DEFAULT_ISSUE_LIMIT);
  assert.equal(options.sinceHours, 0);
  assert.equal(options.closureThreshold, DEFAULT_CLOSURE_THRESHOLD);
  assert.equal(options.leakPeriods, DEFAULT_LEAK_PERIODS);
  assert.equal(options.graceMinutes, DEFAULT_GRACE_MINUTES);
  assert.equal(options.current, null);
});

test("parseArgs 认 --since-hours / --leak-periods / --current", () => {
  const { flags, options } = parseArgs(["--brief", "--gate", "--since-hours", "24", "--leak-periods", "3", "--current", "abc"]);
  assert.equal(flags.brief, true);
  assert.equal(flags.gate, true);
  assert.equal(options.sinceHours, 24);
  assert.equal(options.leakPeriods, 3);
  assert.equal(options.current, "abc");
});

test("parseArgs 对越界闭环率与未知参数抛错", () => {
  assert.throws(() => parseArgs(["--closure-threshold", "1.5"]), /closure-threshold/);
  assert.throws(() => parseArgs(["--closure-threshold", "0"]), /closure-threshold/);
  assert.throws(() => parseArgs(["--nope"]), /未知参数/);
});

test("periodMinutesOfRoutine 只解析本平台实际形态, 认不出返回 null (不许猜)", () => {
  assert.equal(periodMinutesOfRoutine({ triggers: [{ cronExpression: "*/15 * * * *" }] }), 15);
  assert.equal(periodMinutesOfRoutine({ triggers: [{ cronExpression: "0 * * * *" }] }), 60);
  assert.equal(periodMinutesOfRoutine({ triggers: [{ cronExpression: "0 3 * * *" }] }), 1440);
  assert.equal(periodMinutesOfRoutine({ triggers: [{ cronExpression: "0 3 * * 1" }] }), 10080);
  assert.equal(periodMinutesOfRoutine({ triggers: [{ cronExpression: "*/7 * * * *" }] }), null);
  assert.equal(periodMinutesOfRoutine({ triggers: [{ cronExpression: "*/15 2 * * *" }] }), null);
  assert.equal(periodMinutesOfRoutine({ triggers: [] }), null);
  assert.equal(periodMinutesOfRoutine(null), null);
});

// ── 端到端 (真起本地服务, 不是 mock fetch) ──────────────────────────────────

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function dataHandler({ routines, issues }) {
  return (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    res.setHeader("Content-Type", "application/json");
    if (req.headers.authorization !== "Bearer test-key") {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (url.pathname === `/api/companies/${COMPANY}/routines`) {
      res.end(JSON.stringify(routines));
      return;
    }
    if (url.pathname === `/api/companies/${COMPANY}/issues`) {
      res.end(JSON.stringify(issues));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "API route not found" }));
  };
}

test("端到端: 真起本地服务, --brief 正常盘面 gate=OK 退出 0", async () => {
  const { routines, issues } = fixture();
  // 去掉那张超期漏网单 (x4), 盘面应是全绿
  const healthyIssues = issues.filter((row) => row.id !== "x4");
  const { server, baseUrl } = await startServer(dataHandler({ routines, issues: healthyIssues }));
  try {
    const captured = [];
    const original = console.log;
    console.log = (...args) => captured.push(args.join(" "));
    const code = await main(["--brief", "--company", COMPANY], {
      PAPERCLIP_API_URL: `${baseUrl}/api`,
      PAPERCLIP_API_KEY: "test-key",
      PAPERCLIP_TASK_ID: "self-issue-not-in-fixture",
    });
    console.log = original;
    assert.equal(code, 0);
    assert.equal(captured.length, 1);
    assert.ok(captured[0].includes("gate=OK"), captured[0]);
    assert.ok(captured[0].includes("executions=8 7done/1cancel/0open"), captured[0]);
    assert.ok(captured[0].includes("leak=0"), captured[0]);
  } finally {
    server.close();
  }
});

test("端到端: 有超期漏网单时 --gate 退出码 3, --json 结构完整", async () => {
  const { routines, issues } = fixture();
  const { server, baseUrl } = await startServer(dataHandler({ routines, issues }));
  try {
    const captured = [];
    const original = console.log;
    console.log = (...args) => captured.push(args.join(" "));

    const gateCode = await main(["--brief", "--gate", "--company", COMPANY], {
      PAPERCLIP_API_URL: baseUrl,
      PAPERCLIP_API_KEY: "test-key",
      PAPERCLIP_TASK_ID: "x1",
    });
    assert.equal(gateCode, 3);
    assert.ok(captured[0].includes("gate=FAIL(leak)"));

    captured.length = 0;
    const jsonCode = await main(["--json", "--company", COMPANY], {
      PAPERCLIP_API_URL: `${baseUrl}/api`,
      PAPERCLIP_API_KEY: "test-key",
      PAPERCLIP_TASK_ID: "x1",
    });
    console.log = original;
    assert.equal(jsonCode, 0);
    const parsed = JSON.parse(captured.join("\n"));
    assert.equal(parsed.companyId, COMPANY);
    assert.equal(parsed.gate.failed, true);
    assert.equal(parsed.executions.total, 9);
    assert.equal(parsed.routines.length, 3);
    assert.equal(parsed.noise.executionShare, 0.9);
    assert.ok(parsed.generatedAt.endsWith("Z"));
  } finally {
    server.close();
  }
});

test("端到端: 由 --issue 反查 companyId (心法 #148)", async () => {
  const { routines, issues } = fixture();
  const handler = (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/api/issues/issue-uuid") {
      res.end(JSON.stringify({ id: "issue-uuid", companyId: COMPANY }));
      return;
    }
    return dataHandler({ routines, issues })(req, res);
  };
  const { server, baseUrl } = await startServer(handler);
  try {
    const captured = [];
    const original = console.log;
    console.log = (...args) => captured.push(args.join(" "));
    const code = await main(["--json", "--issue", "issue-uuid"], {
      PAPERCLIP_API_URL: baseUrl,
      PAPERCLIP_API_KEY: "test-key",
    });
    console.log = original;
    assert.equal(code, 0);
    const parsed = JSON.parse(captured.join("\n"));
    assert.equal(parsed.companyId, COMPANY);
  } finally {
    server.close();
  }
});

test("端到端: 缺 API base/key 退出码 2, --help 退出码 0", async () => {
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  const code = await main(["--brief"], {});
  const helpCode = await main(["--help"], {});
  console.error = originalError;
  assert.equal(code, 2);
  assert.equal(helpCode, 0);
  assert.ok(errors.some((line) => line.includes("PAPERCLIP_API_URL")));
});

test("端到端: 未知参数退出码 2 (不静默吞掉)", async () => {
  const originalError = console.error;
  console.error = () => {};
  const code = await main(["--bogus"], { PAPERCLIP_API_URL: "http://127.0.0.1:1/api", PAPERCLIP_API_KEY: "k" });
  console.error = originalError;
  assert.equal(code, 2);
});
