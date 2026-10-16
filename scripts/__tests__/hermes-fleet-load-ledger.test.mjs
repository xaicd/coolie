import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import {
  LEDGER_VERDICTS,
  BUCKETS,
  DEFAULT_OVERLOAD_THRESHOLD,
  DEFAULT_ISSUE_LIMIT,
  GATE_REASONS,
  VERDICT_BADGE,
  REASON_BADGE,
  pickAgents,
  isOpenIssue,
  isUnassigned,
  bucketKeyOf,
  labelOf,
  issueRow,
  evaluateAgent,
  buildLedger,
  renderBrief,
  renderText,
  parseArgs,
  main,
  REPO_ROOT,
} from "../hermes-fleet-load-ledger.mjs";

const NOW = Date.parse("2026-10-16T14:50:00.000Z");
const agoHours = (hours) => new Date(NOW - hours * 3600000).toISOString();

const HERMES = "5419bef9-6b72-477b-a5e4-0fe19aac5b77";
const MOBSTER = "09af00a0-f1cd-4a17-8ef5-3a8bcba381d7";
const DOOR_GOD = "58dc794d-ae28-47f4-9e6e-5e798ef55df2";

function agent(overrides = {}) {
  return {
    id: MOBSTER,
    name: "墨斗",
    role: "fda",
    roleLabel: "FDA",
    status: "idle",
    ...overrides,
  };
}

function issue(overrides = {}) {
  return {
    id: overrides.id ?? "i-1",
    identifier: overrides.identifier ?? "COOA-9",
    title: overrides.title ?? "某工单",
    status: overrides.status ?? "todo",
    priority: overrides.priority ?? "high",
    assigneeAgentId: overrides.assigneeAgentId === undefined ? MOBSTER : overrides.assigneeAgentId,
    assigneeUserId: overrides.assigneeUserId ?? null,
    updatedAt: overrides.updatedAt ?? agoHours(1),
    ...overrides,
  };
}

// ── 口径常量 ────────────────────────────────────────────────────────────────

test("LEDGER_VERDICTS 六态齐备且都有徽章", () => {
  assert.deepEqual(LEDGER_VERDICTS, ["overloaded", "driving", "waiting_review", "queued", "idle", "unknown_agent"]);
  for (const verdict of LEDGER_VERDICTS) assert.equal(typeof VERDICT_BADGE[verdict], "string");
});

test("GATE_REASONS 只有派单缺口两类, 且都有徽章", () => {
  assert.deepEqual(GATE_REASONS, ["unassigned_open", "idle_capacity_gap"]);
  for (const reason of GATE_REASONS) assert.equal(typeof REASON_BADGE[reason], "string");
});

test("BUCKETS 四桶与 coolie-dev-task 同口径 (todo+backlog 合并)", () => {
  assert.deepEqual(
    BUCKETS.map((bucket) => bucket.key),
    ["carrying", "waiting", "blocked", "queued"],
  );
  const queued = BUCKETS.find((bucket) => bucket.key === "queued");
  assert.deepEqual(queued.statuses, ["todo", "backlog"]);
});

test("默认阈值: 超载 2 条 / 列表上限 500", () => {
  assert.equal(DEFAULT_OVERLOAD_THRESHOLD, 2);
  assert.equal(DEFAULT_ISSUE_LIMIT, 500);
});

// ── 回包形态自适应 / 基础谓词 ───────────────────────────────────────────────

test("pickAgents 认数组 / {agents:[]} / 垃圾输入", () => {
  assert.deepEqual(pickAgents([{ id: "a" }]), [{ id: "a" }]);
  assert.deepEqual(pickAgents({ agents: [{ id: "a" }] }), [{ id: "a" }]);
  assert.deepEqual(pickAgents({}), []);
  assert.deepEqual(pickAgents(null), []);
  assert.deepEqual(pickAgents("nope"), []);
});

test("isOpenIssue 只认五个开放状态", () => {
  for (const status of ["backlog", "todo", "in_progress", "in_review", "blocked"]) {
    assert.equal(isOpenIssue({ status }), true, status);
  }
  for (const status of ["done", "cancelled", null, undefined]) {
    assert.equal(isOpenIssue({ status }), false, String(status));
  }
  assert.equal(isOpenIssue(null), false);
});

test("isUnassigned 只在 agent 与 human 双空时成立, 且必须开放", () => {
  assert.equal(isUnassigned({ status: "todo", assigneeAgentId: null, assigneeUserId: null }), true);
  assert.equal(isUnassigned({ status: "todo", assigneeAgentId: MOBSTER, assigneeUserId: null }), false);
  assert.equal(isUnassigned({ status: "todo", assigneeAgentId: null, assigneeUserId: "u-1" }), false);
  assert.equal(isUnassigned({ status: "done", assigneeAgentId: null, assigneeUserId: null }), false);
});

test("bucketKeyOf 四桶映射, 非开放状态返回 null", () => {
  assert.equal(bucketKeyOf("in_progress"), "carrying");
  assert.equal(bucketKeyOf("in_review"), "waiting");
  assert.equal(bucketKeyOf("blocked"), "blocked");
  assert.equal(bucketKeyOf("todo"), "queued");
  assert.equal(bucketKeyOf("backlog"), "queued");
  assert.equal(bucketKeyOf("done"), null);
  assert.equal(bucketKeyOf(undefined), null);
});

test("labelOf 优先 identifier, 退化 shortId", () => {
  assert.equal(labelOf({ identifier: "COOA-1", id: "abcdef1234" }), "COOA-1");
  assert.equal(labelOf({ identifier: null, id: "abcdef1234" }), "abcdef12");
  assert.equal(labelOf(null), "?");
});

test("issueRow 空转按 updatedAt 算 (lastActivityAt 被刷成当下不作数)", () => {
  const row = issueRow({ id: "i", identifier: "COOA-2", status: "todo", updatedAt: agoHours(5), lastActivityAt: new Date(NOW).toISOString() }, NOW);
  assert.equal(row.idleHours, 5);
  assert.equal(row.label, "COOA-2");
});

test("issueRow 无时间戳时 idleHours=null (不猜)", () => {
  assert.equal(issueRow({ id: "i", status: "todo", updatedAt: null }, NOW).idleHours, null);
});

// ── 单员工判定 ──────────────────────────────────────────────────────────────

test("零开放工单 ⇒ idle (有产能可派)", () => {
  const row = evaluateAgent(agent(), [], { now: NOW });
  assert.equal(row.verdict, "idle");
  assert.equal(row.total, 0);
  assert.equal(row.oldestCarryIdleHours, null);
  assert.match(row.notes.join(" "), /有产能可派/);
});

test("在手 1 条 ⇒ driving", () => {
  const row = evaluateAgent(agent(), [issue({ status: "in_progress" })], { now: NOW });
  assert.equal(row.verdict, "driving");
  assert.equal(row.counts.carrying, 1);
  assert.equal(row.hand.length, 1);
});

test("在手 2 条 (默认阈值) ⇒ overloaded", () => {
  const rows = [
    issue({ id: "i-1", identifier: "COOA-1", status: "in_progress" }),
    issue({ id: "i-2", identifier: "COOA-2", status: "in_progress", updatedAt: agoHours(4) }),
  ];
  const row = evaluateAgent(agent(), rows, { now: NOW });
  assert.equal(row.verdict, "overloaded");
  assert.equal(row.counts.carrying, 2);
  assert.equal(row.oldestCarryIdleHours, 4, "最久在手空转取最大值");
  assert.match(row.notes.join(" "), /球权集中/);
});

test("--overload-threshold 3 时在手 2 条回到 driving", () => {
  const rows = [
    issue({ id: "i-1", status: "in_progress" }),
    issue({ id: "i-2", status: "in_progress" }),
  ];
  assert.equal(evaluateAgent(agent(), rows, { now: NOW, overloadThreshold: 3 }).verdict, "driving");
});

test("无在手但有一条 in_review ⇒ waiting_review", () => {
  const row = evaluateAgent(agent(), [issue({ status: "in_review" })], { now: NOW });
  assert.equal(row.verdict, "waiting_review");
  assert.equal(row.counts.waiting, 1);
});

test("无在手无待拍但有 blocked/queued ⇒ queued", () => {
  assert.equal(evaluateAgent(agent(), [issue({ status: "blocked" })], { now: NOW }).verdict, "queued");
  assert.equal(evaluateAgent(agent(), [issue({ status: "todo" })], { now: NOW }).verdict, "queued");
  assert.equal(evaluateAgent(agent(), [issue({ status: "backlog" })], { now: NOW }).verdict, "queued");
});

test("判决优先级: 在手 > 等拍板 > 排队 > 空转", () => {
  const rows = [
    issue({ id: "i-1", status: "in_progress" }),
    issue({ id: "i-2", status: "in_review" }),
    issue({ id: "i-3", status: "todo" }),
  ];
  assert.equal(evaluateAgent(agent(), rows, { now: NOW }).verdict, "driving");
});

test("isOpenIssue 之外的状态不进桶 (done/cancelled 被剔除)", () => {
  const rows = [issue({ status: "done" }), issue({ id: "i-2", status: "cancelled" })];
  const row = evaluateAgent(agent(), rows, { now: NOW });
  assert.equal(row.total, 0);
  assert.equal(row.verdict, "idle");
});

test("只统计自己名下的工单 (不串号)", () => {
  const rows = [issue({ assigneeAgentId: MOBSTER, status: "in_progress" }), issue({ id: "i-2", assigneeAgentId: DOOR_GOD, status: "in_progress" })];
  const row = evaluateAgent(agent(), rows, { now: NOW });
  assert.equal(row.counts.carrying, 1);
});

test("桶内按空转时长降序 (最久的排最前)", () => {
  const rows = [
    issue({ id: "i-1", identifier: "COOA-1", status: "in_progress", updatedAt: agoHours(1) }),
    issue({ id: "i-2", identifier: "COOA-2", status: "in_progress", updatedAt: agoHours(9) }),
  ];
  const row = evaluateAgent(agent(), rows, { now: NOW, overloadThreshold: 5 });
  assert.deepEqual(
    row.buckets.carrying.map((r) => r.label),
    ["COOA-2", "COOA-1"],
  );
});

// ── 舰队台账 ────────────────────────────────────────────────────────────────

test("buildLedger 汇总球权分布 + 计数 + 空转名单", () => {
  const ledger = buildLedger(
    {
      agents: [agent({ id: HERMES, name: "Hermes", role: "pm" }), agent()],
      issues: [
        issue({ id: "i-1", assigneeAgentId: HERMES, status: "in_progress" }),
        issue({ id: "i-2", assigneeAgentId: MOBSTER, status: "todo" }),
        issue({ id: "i-3", assigneeAgentId: null, status: "todo", identifier: "COOA-3" }),
      ],
    },
    NOW,
  );
  assert.equal(ledger.agents.length, 2);
  assert.equal(ledger.counts.driving, 1);
  assert.equal(ledger.counts.queued, 1);
  assert.equal(ledger.openTotal, 3);
  assert.equal(ledger.handTotal, 1);
  assert.equal(ledger.unassigned.length, 1);
  assert.equal(ledger.unassigned[0].label, "COOA-3");
  assert.deepEqual(ledger.idleAgents, []);
});

test("buildLedger 名册外 agentId ⇒ unknown_agent 单列, 不合并进名册", () => {
  const ledger = buildLedger(
    { agents: [agent()], issues: [issue({ assigneeAgentId: "ghost-agent", status: "in_progress" })] },
    NOW,
  );
  const stray = ledger.agents.find((row) => row.verdict === "unknown_agent");
  assert.ok(stray);
  assert.equal(stray.id, "ghost-agent");
  assert.equal(stray.name, null);
  assert.equal(stray.counts.carrying, 1);
  assert.equal(ledger.counts.unknown_agent, 1);
});

test("buildLedger 排序: overloaded 在最前, unknown_agent 在最后", () => {
  const ledger = buildLedger(
    {
      agents: [agent({ id: "a-idle", name: "空转甲" }), agent({ id: "b-over", name: "超载乙" }), agent({ id: "c-drive", name: "在扛丙" })],
      issues: [
        issue({ id: "i-1", assigneeAgentId: "b-over", status: "in_progress" }),
        issue({ id: "i-2", assigneeAgentId: "b-over", status: "in_progress" }),
        issue({ id: "i-3", assigneeAgentId: "c-drive", status: "in_progress" }),
        issue({ id: "i-4", assigneeAgentId: "ghost", status: "blocked" }),
      ],
    },
    NOW,
  );
  assert.deepEqual(
    ledger.agents.map((row) => row.verdict),
    ["overloaded", "driving", "idle", "unknown_agent"],
  );
});

test("门禁 1: 有零指派开放工单 ⇒ unassigned_open", () => {
  const ledger = buildLedger(
    { agents: [agent()], issues: [issue({ assigneeAgentId: null, status: "todo" })] },
    NOW,
  );
  assert.equal(ledger.gate.failed, true);
  assert.ok(ledger.gate.reasons.includes("unassigned_open"));
});

test("门禁 2: 有空转员工 + 零指派工单 ⇒ idle_capacity_gap", () => {
  const ledger = buildLedger(
    { agents: [agent(), agent({ id: DOOR_GOD, name: "门神" })], issues: [issue({ assigneeAgentId: null, status: "todo" })] },
    NOW,
  );
  assert.deepEqual(ledger.gate.reasons, ["unassigned_open", "idle_capacity_gap"]);
  assert.deepEqual([...ledger.gate.idleAgents].sort(), ["墨斗", "门神"]);
});

test("门禁不误报: 全员有活且无零指派 ⇒ gate OK", () => {
  const ledger = buildLedger(
    { agents: [agent()], issues: [issue({ status: "in_progress" })] },
    NOW,
  );
  assert.equal(ledger.gate.failed, false);
  assert.deepEqual(ledger.gate.reasons, []);
});

test("门禁不误报: 有人空转但无零指派工单 ⇒ 不算派单缺口", () => {
  const ledger = buildLedger(
    { agents: [agent(), agent({ id: DOOR_GOD, name: "门神" })], issues: [issue({ status: "in_progress" })] },
    NOW,
  );
  assert.equal(ledger.gate.failed, false);
  assert.deepEqual(ledger.idleAgents, ["门神"]);
});

test("buildLedger 容错空输入", () => {
  const ledger = buildLedger({}, NOW);
  assert.deepEqual(ledger.agents, []);
  assert.deepEqual(ledger.unassigned, []);
  assert.equal(ledger.gate.failed, false);
  assert.equal(buildLedger(null, NOW).agents.length, 0);
});

test("开放工单计数只算开放状态 (done/cancelled 排除)", () => {
  const ledger = buildLedger(
    { agents: [agent()], issues: [issue({ status: "done" }), issue({ id: "i-2", status: "in_progress" })] },
    NOW,
  );
  assert.equal(ledger.openTotal, 1);
});

// ── 渲染 ────────────────────────────────────────────────────────────────────

test("renderBrief 一行含 FLEET + 计数 + 门禁 + 每员工球权", () => {
  const ledger = buildLedger(
    {
      agents: [agent({ id: HERMES, name: "Hermes", roleLabel: "PM" }), agent()],
      issues: [issue({ id: "i-1", assigneeAgentId: HERMES, status: "in_progress" }), issue({ id: "i-2", status: "todo" })],
    },
    NOW,
  );
  const line = renderBrief(ledger);
  assert.ok(!line.includes("\n"));
  assert.match(line, /^FLEET \d{4}-\d{2}-\d{2}T[\d:.]+Z agents=2 /);
  assert.match(line, /driving=1/);
  assert.match(line, /unassigned=0/);
  assert.match(line, /gate=OK/);
  assert.match(line, /Hermes:🔨 在扛 在手1 等0 卡0 排0 最久1h/);
});

test("renderBrief 门禁失败标 FAIL 与原因", () => {
  const ledger = buildLedger(
    { agents: [agent()], issues: [issue({ assigneeAgentId: null, status: "todo" })] },
    NOW,
  );
  assert.match(renderBrief(ledger), /gate=FAIL\(unassigned_open,idle_capacity_gap\)/);
});

test("renderBrief 空名册也不炸", () => {
  assert.match(renderBrief(buildLedger({}, NOW)), /^FLEET .* agents=0 /);
});

test("renderText 人读台账含门禁行/球权行/无人认领段", () => {
  const ledger = buildLedger(
    { agents: [agent()], issues: [issue({ assigneeAgentId: null, status: "todo", identifier: "COOA-77" })] },
    NOW,
  );
  const text = renderText(ledger);
  assert.match(text, /舰队负载与球权台账/);
  assert.match(text, /门禁: ❌ FAIL/);
  assert.match(text, /💤 空转/);
  assert.match(text, /无人认领的开放工单 1 条/);
  assert.match(text, /COOA-77/);
});

test("renderText 无零指派时明写 (无)", () => {
  const text = renderText(buildLedger({ agents: [agent()], issues: [issue({ status: "in_progress" })] }, NOW));
  assert.match(text, /无人认领的开放工单 0 条/);
  assert.match(text, /\(无\)/);
});

// ── CLI 参数 ────────────────────────────────────────────────────────────────

test("parseArgs 默认值", () => {
  const { flags, options } = parseArgs([]);
  assert.deepEqual(flags, { json: false, brief: false, gate: false, help: false });
  assert.equal(options.issue, null);
  assert.equal(options.company, null);
  assert.equal(options.limit, DEFAULT_ISSUE_LIMIT);
  assert.equal(options.overloadThreshold, DEFAULT_OVERLOAD_THRESHOLD);
});

test("parseArgs 认全部开关与阈值覆盖", () => {
  const { flags, options } = parseArgs([
    "--brief",
    "--gate",
    "--json",
    "--company",
    "c-1",
    "--issue",
    "i-1",
    "--limit",
    "50",
    "--overload-threshold",
    "3",
  ]);
  assert.equal(flags.brief, true);
  assert.equal(flags.gate, true);
  assert.equal(flags.json, true);
  assert.equal(options.company, "c-1");
  assert.equal(options.issue, "i-1");
  assert.equal(options.limit, 50);
  assert.equal(options.overloadThreshold, 3);
});

test("parseArgs 遇未知参数抛错 (由 main 归一为退出码 2)", () => {
  assert.throws(() => parseArgs(["--nope"]), /未知参数/);
});

// ── main ────────────────────────────────────────────────────────────────────

const stubFetch = (agents, issues) => async (url) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(url.includes("/agents") ? agents : issues),
});

test("main 缺 key/base 返回 2, --help 返回 0", async () => {
  assert.equal(await main(["--brief"], {}), 2);
  assert.equal(await main(["--help"], {}), 0);
});

test("main 无法解析 companyId 返回 2", async () => {
  assert.equal(await main(["--brief"], { PAPERCLIP_API_URL: "http://127.0.0.1:3100", PAPERCLIP_API_KEY: "k" }), 2);
});

test("main 端到端: 桩 fetch 拉名册+工单并打印一行台账", async () => {
  const printed = [];
  const realLog = console.log;
  console.log = (line) => printed.push(line);
  try {
    const code = await main(
      ["--brief"],
      { PAPERCLIP_API_URL: "http://127.0.0.1:3100", PAPERCLIP_API_KEY: "k", PAPERCLIP_COMPANY_ID: "c-test" },
      {
        fetchImpl: stubFetch([agent()], [issue({ status: "in_progress" })]),
        now: NOW,
      },
    );
    assert.equal(code, 0);
    assert.match(printed.join("\n"), /FLEET .* agents=1 driving=1 .* gate=OK/);
  } finally {
    console.log = realLog;
  }
});

test("main --gate 有派单缺口时返回 3 (可当 CI 门禁)", async () => {
  const code = await main(
    ["--gate", "--brief"],
    { PAPERCLIP_API_URL: "http://127.0.0.1:3100", PAPERCLIP_API_KEY: "k", PAPERCLIP_COMPANY_ID: "c-test" },
    { fetchImpl: stubFetch([agent()], [issue({ assigneeAgentId: null, status: "todo" })]), now: NOW },
  );
  assert.equal(code, 3);
});

test("main --json 结构含 companyId / counts / gate", async () => {
  const printed = [];
  const realLog = console.log;
  console.log = (line) => printed.push(line);
  try {
    const code = await main(
      ["--json"],
      { PAPERCLIP_API_URL: "http://127.0.0.1:3100", PAPERCLIP_API_KEY: "k", PAPERCLIP_COMPANY_ID: "c-test" },
      { fetchImpl: stubFetch([agent()], [issue({ status: "in_progress" })]), now: NOW },
    );
    assert.equal(code, 0);
    const payload = JSON.parse(printed.join("\n"));
    assert.equal(payload.companyId, "c-test");
    assert.equal(payload.counts.driving, 1);
    assert.equal(payload.gate.failed, false);
  } finally {
    console.log = realLog;
  }
});

test("main 由 --issue 反查 companyId (心法 #148: env 未注入时)", async () => {
  const urls = [];
  const code = await main(
    ["--json", "--issue", "i-1"],
    { PAPERCLIP_API_URL: "http://127.0.0.1:3100", PAPERCLIP_API_KEY: "k" },
    {
      fetchImpl: async (url) => {
        urls.push(url);
        if (/\/issues\//.test(url)) return { ok: true, status: 200, text: async () => JSON.stringify({ id: "i-1", companyId: "c-from-issue" }) };
        return { ok: true, status: 200, text: async () => JSON.stringify(url.includes("/agents") ? [agent()] : []) };
      },
      now: NOW,
    },
  );
  assert.equal(code, 0);
  assert.ok(urls.some((url) => url.includes("/companies/c-from-issue/agents")));
  assert.ok(urls.some((url) => url.includes("/companies/c-from-issue/issues?limit=")));
});

test("main 走 PAPERCLIP_TASK_ID 反查 companyId (心跳默认形态)", async () => {
  const urls = [];
  const code = await main(
    ["--brief"],
    { PAPERCLIP_API_URL: "http://127.0.0.1:3100", PAPERCLIP_API_KEY: "k", PAPERCLIP_TASK_ID: "88ae9fe8-7f6c-4eb9-8d3f-163826644489" },
    {
      fetchImpl: async (url) => {
        urls.push(url);
        if (/\/issues\//.test(url)) return { ok: true, status: 200, text: async () => JSON.stringify({ id: "x", companyId: "c-env" }) };
        return { ok: true, status: 200, text: async () => JSON.stringify(url.includes("/agents") ? [agent()] : []) };
      },
      now: NOW,
    },
  );
  assert.equal(code, 0);
  assert.ok(urls.some((url) => url.includes("/companies/c-env/issues?limit=")));
});

test("REPO_ROOT 指向仓库根 (脚本可被任意 cwd 调用)", () => {
  assert.ok(path.isAbsolute(REPO_ROOT));
  assert.equal(path.basename(REPO_ROOT), "coolie");
});
