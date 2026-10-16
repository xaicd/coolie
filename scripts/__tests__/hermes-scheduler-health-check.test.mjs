import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import {
  SCHED_VERDICTS,
  GATE_VERDICTS,
  DEFAULT_GRACE_MINUTES,
  DEFAULT_STALE_PERIODS,
  FALLBACK_PERIOD_MINUTES,
  VERDICT_BADGE,
  triggerOf,
  parseCronIntervalMinutes,
  minutesSince,
  evaluateRoutine,
  checkRoutines,
  renderBrief,
  renderText,
  parseArgs,
  main,
  REPO_ROOT,
} from "../hermes-scheduler-health-check.mjs";

const NOW = Date.parse("2026-10-16T14:20:00.000Z");
const iso = (minutesAgo) => new Date(NOW - minutesAgo * 60000).toISOString();
const future = (minutesAhead) => new Date(NOW + minutesAhead * 60000).toISOString();

function routine(overrides = {}) {
  const { trigger: triggerOverrides, ...rest } = overrides;
  return {
    id: "b35ff456-cad2-42ef-9880-0fe3626beb70",
    title: "Coolie 工坊持续研发与版本升级守护调度器 (Foundry Evolution Routine)",
    status: "active",
    triggers: [
      {
        cronExpression: "*/15 * * * *",
        enabled: true,
        lastFiredAt: iso(2),
        nextRunAt: future(13),
        ...(triggerOverrides ?? {}),
      },
    ],
    lastRun: { linkedIssueId: "issue-1", linkedIssue: { identifier: "COOA-300", status: "in_progress", updatedAt: iso(2) } },
    ...rest,
  };
}

// ── 口径常量 ────────────────────────────────────────────────────────────────

test("SCHED_VERDICTS 覆盖全部判定且 gate 三态是子集", () => {
  assert.deepEqual(SCHED_VERDICTS, [
    "trigger_missing",
    "trigger_disabled",
    "stalled",
    "late",
    "healthy",
    "paused",
    "unsupported_cron",
    "no_schedule_data",
  ]);
  assert.deepEqual(GATE_VERDICTS, ["trigger_missing", "trigger_disabled", "stalled"]);
  for (const verdict of GATE_VERDICTS) assert.ok(SCHED_VERDICTS.includes(verdict));
  for (const verdict of SCHED_VERDICTS) assert.ok(typeof VERDICT_BADGE[verdict] === "string");
});

test("默认阈值: 宽限 5 分钟 / 停滞 3 个周期 / 保守周期 60 分钟", () => {
  assert.equal(DEFAULT_GRACE_MINUTES, 5);
  assert.equal(DEFAULT_STALE_PERIODS, 3);
  assert.equal(FALLBACK_PERIOD_MINUTES, 60);
});

// ── cron 周期解析 ───────────────────────────────────────────────────────────

test("parseCronIntervalMinutes 认 */N 分钟级", () => {
  assert.equal(parseCronIntervalMinutes("*/15 * * * *"), 15);
  assert.equal(parseCronIntervalMinutes("*/5 * * * *"), 5);
  assert.equal(parseCronIntervalMinutes("*/1 * * * *"), 1);
  assert.equal(parseCronIntervalMinutes("*/30 * * * *"), 30);
});

test("parseCronIntervalMinutes 认小时级/天级/周级", () => {
  assert.equal(parseCronIntervalMinutes("0 * * * *"), 60);
  assert.equal(parseCronIntervalMinutes("30 * * * *"), 60);
  assert.equal(parseCronIntervalMinutes("0 3 * * *"), 1440);
  assert.equal(parseCronIntervalMinutes("0 3 * * 1"), 10080);
});

test("parseCronIntervalMinutes 对超出解析面的形态返回 null (不许猜)", () => {
  assert.equal(parseCronIntervalMinutes("*/7 * * * *"), null, "60 不能被 7 整除");
  assert.equal(parseCronIntervalMinutes("*/0 * * * *"), null);
  assert.equal(parseCronIntervalMinutes("*/61 * * * *"), null);
  assert.equal(parseCronIntervalMinutes("*/15 * * * 1"), null, "带周限定日的分钟级不予解析");
  assert.equal(parseCronIntervalMinutes("0 3 * * 1,5"), null);
  assert.equal(parseCronIntervalMinutes("0 3 1 * *"), null);
  assert.equal(parseCronIntervalMinutes("abc"), null);
  assert.equal(parseCronIntervalMinutes("*/15 * * *"), null, "四段不是合法 cron");
  assert.equal(parseCronIntervalMinutes(null), null);
  assert.equal(parseCronIntervalMinutes(undefined), null);
  assert.equal(parseCronIntervalMinutes(15), null);
});

test("minutesSince 对缺字段/坏字符串返回 null, 不改口径", () => {
  assert.equal(minutesSince(iso(10), NOW), 10);
  assert.equal(minutesSince(null, NOW), null);
  assert.equal(minutesSince("not-a-date", NOW), null);
  assert.equal(minutesSince(undefined, NOW), null);
});

test("triggerOf 只认数组第一个 trigger", () => {
  assert.equal(triggerOf({ triggers: [{ enabled: true }] }).enabled, true);
  assert.equal(triggerOf({ triggers: [] }), null);
  assert.equal(triggerOf({ triggers: null }), null);
  assert.equal(triggerOf({}), null);
  assert.equal(triggerOf(null), null);
});

// ── 判定: healthy ───────────────────────────────────────────────────────────

test("上跳在宽限内 + 下跳未跳票 ⇒ healthy", () => {
  const row = evaluateRoutine(routine(), NOW);
  assert.equal(row.verdict, "healthy");
  assert.equal(row.gate, false);
  assert.equal(row.periodMinutes, 15);
  assert.equal(row.minutesSinceLastFire, 2);
});

test("15 分钟周期: 上跳 19 分钟前仍在 (周期+宽限) 内 ⇒ healthy", () => {
  const row = evaluateRoutine(routine({ trigger: { lastFiredAt: iso(19), nextRunAt: future(1) } }), NOW);
  assert.equal(row.verdict, "healthy");
});

test("小时级 routine 上跳 17 分钟前 ⇒ healthy (不按 15 分钟口径误报)", () => {
  const row = evaluateRoutine(
    routine({
      title: "[交付主线例行巡检] Coolie 工坊 AI 原生交付工厂本体系统",
      triggers: [{ cronExpression: "0 * * * *", enabled: true, lastFiredAt: iso(17), nextRunAt: future(43) }],
    }),
    NOW,
  );
  assert.equal(row.role, "交付主线");
  assert.equal(row.periodMinutes, 60);
  assert.equal(row.verdict, "healthy");
});

test("phase-null: lastFiredAt=null 但 nextRunAt 在未来 ⇒ healthy (不是故障, 心法 #124)", () => {
  const row = evaluateRoutine(routine({ trigger: { lastFiredAt: null, nextRunAt: future(10) } }), NOW);
  assert.equal(row.verdict, "healthy");
  assert.equal(row.gate, false);
  assert.equal(row.minutesSinceLastFire, null);
  assert.ok(row.notes.some((note) => note.includes("phase-null: lastFiredAt")));
});

// ── 判定: late ──────────────────────────────────────────────────────────────

test("15 分钟周期: 上跳 25 分钟前 (超周期+宽限) ⇒ late 且不门禁", () => {
  const row = evaluateRoutine(routine({ trigger: { lastFiredAt: iso(25), nextRunAt: iso(-5) } }), NOW);
  assert.equal(row.verdict, "late");
  assert.equal(row.gate, false);
});

test("nextRunAt 跳票超宽限 ⇒ late (承诺过的下一跳没来)", () => {
  const row = evaluateRoutine(routine({ trigger: { lastFiredAt: iso(16), nextRunAt: iso(6) } }), NOW);
  assert.equal(row.verdict, "late");
  assert.ok(row.notes.some((note) => note.includes("跳票")));
});

test("nextRunAt 跳票正好在宽限内 ⇒ 仍 healthy (避免边界假警报)", () => {
  const row = evaluateRoutine(routine({ trigger: { lastFiredAt: iso(16), nextRunAt: iso(5) } }), NOW);
  assert.equal(row.verdict, "healthy");
});

// ── 判定: stalled (门禁) ────────────────────────────────────────────────────

test("15 分钟周期: 上跳 50 分钟前 (超 3 周期) ⇒ stalled 且门禁", () => {
  const row = evaluateRoutine(routine({ trigger: { lastFiredAt: iso(50), nextRunAt: null } }), NOW);
  assert.equal(row.verdict, "stalled");
  assert.equal(row.gate, true);
});

test("nextRunAt 跳票超 3 个周期 ⇒ stalled", () => {
  const row = evaluateRoutine(routine({ trigger: { lastFiredAt: iso(2), nextRunAt: iso(50) } }), NOW);
  assert.equal(row.verdict, "stalled");
  assert.equal(row.gate, true);
});

test("小时级 routine 上跳 200 分钟前 ⇒ stalled (阈值随周期缩放)", () => {
  const row = evaluateRoutine(
    routine({ triggers: [{ cronExpression: "0 * * * *", enabled: true, lastFiredAt: iso(200), nextRunAt: null }] }),
    NOW,
  );
  assert.equal(row.verdict, "stalled");
  assert.equal(row.gate, true);
});

test("--stale-periods / --grace-minutes 可覆盖阈值", () => {
  const row = evaluateRoutine(routine({ trigger: { lastFiredAt: iso(35), nextRunAt: null } }), NOW, {
    stalePeriods: 2,
  });
  assert.equal(row.verdict, "stalled");
  const relaxed = evaluateRoutine(routine({ trigger: { lastFiredAt: iso(35), nextRunAt: null } }), NOW, {
    stalePeriods: 4,
  });
  assert.equal(relaxed.verdict, "late");
});

// ── 判定: trigger_missing / trigger_disabled / paused ───────────────────────

test("零触发器 ⇒ trigger_missing 且门禁 (心法 #108 实测失效形态)", () => {
  const row = evaluateRoutine({ id: "r-1", title: "无触发器 routine", status: "active", triggers: [] }, NOW);
  assert.equal(row.verdict, "trigger_missing");
  assert.equal(row.gate, true);
  assert.ok(row.notes.some((note) => note.includes("永不自动起搏")));
});

test("触发器 enabled=false ⇒ trigger_disabled 且门禁", () => {
  const row = evaluateRoutine(routine({ trigger: { enabled: false } }), NOW);
  assert.equal(row.verdict, "trigger_disabled");
  assert.equal(row.gate, true);
});

test("routine 非 active ⇒ paused, 掌柜主动暂停不门禁 (且不再追究触发器)", () => {
  const row = evaluateRoutine(routine({ status: "paused", triggers: [] }), NOW);
  assert.equal(row.verdict, "paused");
  assert.equal(row.gate, false);
  assert.ok(row.notes.some((note) => note.includes("不门禁")));
});

// ── 判定: 数据语义 (unsupported_cron / no_schedule_data) ────────────────────

test("双 null 排程字段 ⇒ no_schedule_data, 判为数据语义而非故障", () => {
  const row = evaluateRoutine(routine({ trigger: { lastFiredAt: null, nextRunAt: null } }), NOW);
  assert.equal(row.verdict, "no_schedule_data");
  assert.equal(row.gate, false);
});

test("cron 超解析面 ⇒ 登记 note, 且停滞不门禁 (不许猜)", () => {
  const row = evaluateRoutine(
    routine({ trigger: { cronExpression: "0 3 * * 1,5", lastFiredAt: iso(500), nextRunAt: null } }),
    NOW,
  );
  assert.equal(row.periodMinutes, null);
  assert.equal(row.gate, false);
  assert.ok(row.notes.some((note) => note.includes("只报不门禁")));
});

// ── 执行单未闭环 (advisory) ─────────────────────────────────────────────────

test("起搏正常但上一跳执行单仍 in_progress 且超一个周期 ⇒ 记 advisory note", () => {
  const row = evaluateRoutine(
    routine({ lastRun: { linkedIssue: { identifier: "COOA-300", status: "in_progress", updatedAt: iso(30) } } }),
    NOW,
  );
  assert.equal(row.verdict, "healthy");
  assert.ok(row.notes.some((note) => note.includes("未闭环")));
});

test("执行单已 done ⇒ 无 advisory note", () => {
  const row = evaluateRoutine(
    routine({ lastRun: { linkedIssue: { identifier: "COOA-299", status: "done", updatedAt: iso(30) } } }),
    NOW,
  );
  assert.equal(row.notes.filter((note) => note.includes("未闭环")).length, 0);
});

// ── 汇总 ────────────────────────────────────────────────────────────────────

test("checkRoutines 汇总计数 + 门禁 id 列表", () => {
  const report = checkRoutines(
    [
      routine(),
      routine({ id: "r-stalled", triggers: [{ cronExpression: "*/15 * * * *", enabled: true, lastFiredAt: iso(50), nextRunAt: null }] }),
      routine({ id: "r-missing", triggers: [] }),
      routine({ id: "r-paused", status: "paused" }),
    ],
    NOW,
  );
  assert.equal(report.counts.healthy, 1);
  assert.equal(report.counts.stalled, 1);
  assert.equal(report.counts.trigger_missing, 1);
  assert.equal(report.counts.paused, 1);
  assert.equal(report.gate.failed, true);
  assert.deepEqual(report.gate.ids.sort(), ["r-missing", "r-stalled"]);
  assert.deepEqual(report.gate.verdicts.sort(), ["stalled", "trigger_missing"]);
});

test("checkRoutines 全绿 ⇒ gate.ids 空且 failed=false", () => {
  const report = checkRoutines([routine(), routine({ id: "r-2" })], NOW);
  assert.equal(report.gate.failed, false);
  assert.deepEqual(report.gate.ids, []);
});

test("checkRoutines 按严重度排序 (致命在前, 健康在后)", () => {
  const report = checkRoutines(
    [routine(), routine({ id: "r-stalled", triggers: [{ cronExpression: "*/15 * * * *", enabled: true, lastFiredAt: iso(50), nextRunAt: null }] })],
    NOW,
  );
  assert.equal(report.routines[0].verdict, "stalled");
  assert.equal(report.routines.at(-1).verdict, "healthy");
});

test("checkRoutines 容错非数组输入", () => {
  const report = checkRoutines(null, NOW);
  assert.deepEqual(report.routines, []);
  assert.equal(report.gate.failed, false);
});

// ── 渲染 ────────────────────────────────────────────────────────────────────

test("renderBrief 一行含 SCHED + 计数 + gate=OK", () => {
  const line = renderBrief(checkRoutines([routine()], NOW));
  assert.match(line, /^SCHED \d{4}-\d{2}-\d{2}T[\d:.]+Z routines=1 healthy=1 · gate=OK/);
  assert.ok(!line.includes("\n"));
  assert.match(line, /心祖:✅ 起搏正常 15m 上跳 2m 前 下跳 13m 后 → COOA-300/);
});

test("renderBrief 门禁失败时标 FAIL 与失效判决", () => {
  const line = renderBrief(
    checkRoutines([routine({ triggers: [{ cronExpression: "*/15 * * * *", enabled: true, lastFiredAt: iso(50), nextRunAt: null }] })], NOW),
  );
  assert.match(line, /gate=FAIL\(stalled\)/);
  assert.match(line, /❌ 停滞/);
});

test("renderText 人读报告含徽章/门禁行/执行单", () => {
  const text = renderText(checkRoutines([routine()], NOW));
  assert.match(text, /调度器体检/);
  assert.match(text, /门禁: ✅ OK/);
  assert.match(text, /✅ 起搏正常/);
  assert.match(text, /执行单=COOA-300/);
});

// ── CLI 参数 ────────────────────────────────────────────────────────────────

test("parseArgs 默认值", () => {
  const { flags, options } = parseArgs([]);
  assert.deepEqual(flags, { json: false, brief: false, gate: false, help: false });
  assert.equal(options.graceMinutes, DEFAULT_GRACE_MINUTES);
  assert.equal(options.stalePeriods, DEFAULT_STALE_PERIODS);
  assert.equal(options.company, null);
  assert.equal(options.issue, null);
});

test("parseArgs 认 --brief/--json/--gate/--company/--issue 与阈值覆盖", () => {
  const { flags, options } = parseArgs([
    "--brief",
    "--gate",
    "--company",
    "c-1",
    "--issue",
    "i-1",
    "--grace-minutes",
    "10",
    "--stale-periods",
    "5",
  ]);
  assert.equal(flags.brief, true);
  assert.equal(flags.gate, true);
  assert.equal(options.company, "c-1");
  assert.equal(options.issue, "i-1");
  assert.equal(options.graceMinutes, 10);
  assert.equal(options.stalePeriods, 5);
});

test("parseArgs 遇未知参数抛错 (由 main 归一为退出码 2)", () => {
  assert.throws(() => parseArgs(["--nope"]), /未知参数/);
});

// ── main ────────────────────────────────────────────────────────────────────

test("main 缺 key/base 返回 2, --help 返回 0", async () => {
  assert.equal(await main(["--brief"], {}), 2);
  assert.equal(await main(["--help"], {}), 0);
});

test("main 无法解析 companyId 返回 2", async () => {
  assert.equal(await main(["--brief"], { PAPERCLIP_API_URL: "http://127.0.0.1:3100", PAPERCLIP_API_KEY: "k" }), 2);
});

test("main 端到端: 桩 fetch 拉 routines 并打印一行体检", async () => {
  const printed = [];
  const realLog = console.log;
  console.log = (line) => printed.push(line);
  try {
    const code = await main(["--brief"], { PAPERCLIP_API_URL: "http://127.0.0.1:3100", PAPERCLIP_API_KEY: "k", PAPERCLIP_COMPANY_ID: "c-test" }, {
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify([routine()]) }),
      now: NOW,
    });
    assert.equal(code, 0);
    assert.match(printed.join("\n"), /SCHED .*routines=1 healthy=1 · gate=OK/);
  } finally {
    console.log = realLog;
  }
});

test("main --gate 在 stalled 时返回 3 (可当 CI 门禁)", async () => {
  const code = await main(["--gate", "--brief"], { PAPERCLIP_API_URL: "http://127.0.0.1:3100", PAPERCLIP_API_KEY: "k", PAPERCLIP_COMPANY_ID: "c-test" }, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify([routine({ triggers: [{ cronExpression: "*/15 * * * *", enabled: true, lastFiredAt: iso(50), nextRunAt: null }] })]),
    }),
    now: NOW,
  });
  assert.equal(code, 3);
});

test("main 由 --issue 反查 companyId (心法 #148: env 未注入时)", async () => {
  const urls = [];
  const code = await main(["--json", "--issue", "i-1"], { PAPERCLIP_API_URL: "http://127.0.0.1:3100", PAPERCLIP_API_KEY: "k" }, {
    fetchImpl: async (url) => {
      urls.push(url);
      if (/\/issues\//.test(url)) return { ok: true, status: 200, text: async () => JSON.stringify({ id: "i-1", companyId: "c-from-issue" }) };
      return { ok: true, status: 200, text: async () => JSON.stringify([routine()]) };
    },
    now: NOW,
  });
  assert.equal(code, 0);
  assert.ok(urls.some((url) => url.includes("/companies/c-from-issue/routines")));
});

test("main 走 PAPERCLIP_TASK_ID 反查 companyId (心跳默认形态)", async () => {
  const urls = [];
  const code = await main(["--brief"], {
    PAPERCLIP_API_URL: "http://127.0.0.1:3100",
    PAPERCLIP_API_KEY: "k",
    PAPERCLIP_TASK_ID: "88ae9fe8-7f6c-4eb9-8d3f-163826644489",
  }, {
    fetchImpl: async (url) => {
      urls.push(url);
      if (/\/issues\//.test(url)) return { ok: true, status: 200, text: async () => JSON.stringify({ id: "x", companyId: "c-env" }) };
      return { ok: true, status: 200, text: async () => JSON.stringify([routine()]) };
    },
    now: NOW,
  });
  assert.equal(code, 0);
  assert.ok(urls.some((url) => url.includes("/companies/c-env/routines")));
});

test("REPO_ROOT 指向仓库根 (脚本可被任意 cwd 调用)", () => {
  assert.ok(path.isAbsolute(REPO_ROOT));
  assert.equal(path.basename(REPO_ROOT), "coolie");
});
