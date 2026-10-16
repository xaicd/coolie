import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import {
  OPEN_STATUSES,
  VERDICTS,
  ATTENTION_VERDICTS,
  WAKE_CONTINUATION_POLICIES,
  PROBE_VERDICTS,
  classifyIssue,
  idleHours,
  isOpenIssue,
  pickInteractions,
  pendingWakeInteractions,
  applyInteractionProbe,
  regroupScan,
  scanRow,
  scanIssues,
  renderText,
  renderBrief,
  parseArgs,
  resolveCompanyId,
  main,
  labelOf,
  REPO_ROOT,
} from "../hermes-open-issue-liveness-scan.mjs";

const NOW = Date.parse("2026-10-16T14:00:00.000Z");
const iso = (hoursAgo) => new Date(NOW - hoursAgo * 3600000).toISOString();

function issue(overrides = {}) {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    identifier: "COOA-999",
    title: "样例工单",
    status: "blocked",
    priority: "high",
    assigneeAgentId: "09af00a0-f1cd-4a17-8ef5-3a8bcba381d7",
    assigneeUserId: null,
    executionRunId: null,
    checkoutRunId: null,
    monitorNextCheckAt: null,
    unblockDescriptor: null,
    executionState: null,
    blockerAttention: null,
    reviewAttention: null,
    lastActivityAt: iso(1),
    updatedAt: iso(1),
    ...overrides,
  };
}

// ── 状态口径 ────────────────────────────────────────────────────────────────

test("OPEN_STATUSES 覆盖五态且不含终结态", () => {
  assert.deepEqual(OPEN_STATUSES, ["backlog", "todo", "in_progress", "in_review", "blocked"]);
  assert.ok(!OPEN_STATUSES.includes("done"));
  assert.ok(!OPEN_STATUSES.includes("cancelled"));
});

test("isOpenIssue 只认开放状态", () => {
  assert.equal(isOpenIssue(issue({ status: "in_progress" })), true);
  assert.equal(isOpenIssue(issue({ status: "done" })), false);
  assert.equal(isOpenIssue(null), false);
});

// ── 核心判定: 无活路 vs 有活路 ─────────────────────────────────────────────

test("blocked + 零 blocker 边 + 零 descriptor + 零 monitor ⇒ dead_letter", () => {
  const { verdict, reasons } = classifyIssue(
    issue({ blockerAttention: { unresolvedBlockerCount: 0, blockingTreeLive: false } }),
  );
  assert.equal(verdict, "dead_letter");
  assert.match(reasons.join(" "), /永不自动恢复/);
});

test("blockerAttention 整体缺失也算 dead_letter, 但登记为未知而非报错", () => {
  const { verdict, reasons } = classifyIssue(issue({ blockerAttention: null }));
  assert.equal(verdict, "dead_letter");
  assert.match(reasons.join(" "), /活路未知/);
});

test("blocked + unresolvedBlockerCount>0 ⇒ blocked_with_path (解阻后自动唤醒)", () => {
  const { verdict } = classifyIssue(
    issue({ blockerAttention: { unresolvedBlockerCount: 2, blockingTreeLive: true } }),
  );
  assert.equal(verdict, "blocked_with_path");
});

test("blocked + blockingTreeLive=true 但 unresolved=0 ⇒ 仍算有活路", () => {
  const { verdict } = classifyIssue(
    issue({ blockerAttention: { unresolvedBlockerCount: 0, blockingTreeLive: true } }),
  );
  assert.equal(verdict, "blocked_with_path");
});

test("blocked + 具名 unblockDescriptor ⇒ blocked_with_descriptor", () => {
  const { verdict } = classifyIssue(
    issue({
      blockerAttention: { unresolvedBlockerCount: 0, blockingTreeLive: false },
      unblockDescriptor: { owner: { agentId: "5419bef9" }, action: "复核 agy 适配器后重派" },
    }),
  );
  assert.equal(verdict, "blocked_with_descriptor");
});

test("blocked + monitor ⇒ live (有排定唤醒)", () => {
  const { verdict } = classifyIssue(issue({ monitorNextCheckAt: iso(-1) }));
  assert.equal(verdict, "live");
});

test("in_progress 有 run ⇒ live ; 无 run 无 monitor ⇒ stalled_in_progress", () => {
  assert.equal(
    classifyIssue(issue({ status: "in_progress", executionRunId: "abcabcab-0000" })).verdict,
    "live",
  );
  assert.equal(classifyIssue(issue({ status: "in_progress" })).verdict, "stalled_in_progress");
});

test("activeRun.id 与 checkoutRunId 也算活着的 run", () => {
  assert.equal(
    classifyIssue(issue({ status: "in_progress", activeRun: { id: "run-1" } })).verdict,
    "live",
  );
  assert.equal(
    classifyIssue(issue({ status: "in_progress", checkoutRunId: "run-2" })).verdict,
    "live",
  );
});

test("in_review: 无 monitor ⇒ review_no_monitor ; 指派人类 ⇒ waiting_human", () => {
  assert.equal(classifyIssue(issue({ status: "in_review" })).verdict, "review_no_monitor");
  assert.equal(
    classifyIssue(issue({ status: "in_review", assigneeUserId: "user-1", assigneeAgentId: null })).verdict,
    "waiting_human",
  );
});

// 实测 (2026-10-16): COOA-44 与 COOA-278 都报"⚠️ 等回复(无表)", 实际各自挂着一条
// pending 交互 (ask_user_questions / request_confirmation, wake_assignee)。
// 假警报会把真死路 (COOA-4 假活着) 淹掉 —— 这两条必须判 live。
test("in_review + reviewAttention.paths 非空 ⇒ live (球已递出, 回复即唤醒)", () => {
  const { verdict, reasons } = classifyIssue(
    issue({
      status: "in_review",
      reviewAttention: {
        state: "covered",
        reason: "Review has a maintained action path.",
        paths: [
          {
            kind: "interaction",
            label: "Pending ask user questions",
            responder: "Board",
            since: iso(0.1),
            ref: "bc44f8a9-906c-4c97-9c76-8bdcae30a1bb",
          },
        ],
      },
    }),
  );
  assert.equal(verdict, "live");
  assert.match(reasons.join(" "), /挂起交互/);
  assert.match(reasons.join(" "), /Board/);
});

test("in_review + reviewAttention.state=covered 但零 paths ⇒ 仍算活路", () => {
  assert.equal(
    classifyIssue(issue({ status: "in_review", reviewAttention: { state: "covered", paths: [] } }))
      .verdict,
    "live",
  );
});

test("in_review + reviewAttention=uncovered/none ⇒ 照旧报 review_no_monitor", () => {
  assert.equal(
    classifyIssue(issue({ status: "in_review", reviewAttention: { state: "uncovered", paths: [] } }))
      .verdict,
    "review_no_monitor",
  );
  assert.equal(
    classifyIssue(issue({ status: "in_review", reviewAttention: { state: "none", paths: [] } })).verdict,
    "review_no_monitor",
  );
});

test("reviewAttention 畸形输入只退化, 不抛错也不误判活路", () => {
  for (const bad of ["covered", 7, [], { paths: "covered" }, { paths: [null, 7, "x"] }]) {
    assert.equal(
      classifyIssue(issue({ status: "in_review", reviewAttention: bad })).verdict,
      "review_no_monitor",
      `畸形 reviewAttention 不得被当成活路: ${JSON.stringify(bad)}`,
    );
  }
});

test("in_progress 只认 run/monitor 活路 (review 活路只对 in_review 成立); 挂起交互由 --interaction-probe 层补判", () => {
  assert.equal(
    classifyIssue(
      issue({ status: "in_progress", reviewAttention: { state: "covered", paths: [{ label: "x" }] } }),
    ).verdict,
    "stalled_in_progress",
  );
  // 纯函数层不查交互表 (零网络); main 会在待判死判决上补一次挂起交互复核,
  // 见下方 applyInteractionProbe / regroupScan 用例.
});

test("todo/backlog: 零指派 ⇒ orphan ; 有指派 ⇒ queued", () => {
  assert.equal(
    classifyIssue(issue({ status: "todo", assigneeAgentId: null })).verdict,
    "orphan",
  );
  assert.equal(classifyIssue(issue({ status: "backlog" })).verdict, "queued");
});

// ── 排队超期 (复活后唤醒未送达的兜底探测) ───────────────────────────────────

test("指派在册但超过阈值无 run ⇒ queued_stale (唤醒可能未送达)", () => {
  const { verdict, reasons } = classifyIssue(issue({ status: "todo", updatedAt: iso(60) }), {
    now: NOW,
  });
  assert.equal(verdict, "queued_stale");
  assert.match(reasons.join(" "), /唤醒可能未送达/);
});

test("排队未超阈值仍算 queued; 阈值可调", () => {
  assert.equal(classifyIssue(issue({ status: "todo", updatedAt: iso(10) }), { now: NOW }).verdict, "queued");
  assert.equal(
    classifyIssue(issue({ status: "todo", updatedAt: iso(10) }), { now: NOW, queuedStaleHours: 6 })
      .verdict,
    "queued_stale",
  );
});

test("排队超期但有 monitor ⇒ 仍有活路, 不算超期", () => {
  const { verdict } = classifyIssue(
    issue({ status: "todo", updatedAt: iso(200), monitorNextCheckAt: iso(-1) }),
    { now: NOW },
  );
  assert.equal(verdict, "queued");
});

test("queued_stale 计入待出手数", () => {
  const scan = scanIssues(
    [
      issue({ identifier: "COOA-X", status: "todo", updatedAt: iso(60) }),
      issue({ identifier: "COOA-Y", status: "todo", updatedAt: iso(1) }),
    ],
    { now: NOW },
  );
  assert.equal(scan.counts.queued_stale, 1);
  assert.equal(scan.counts.queued, 1);
  assert.equal(scan.attentionCount, 1);
  assert.match(renderBrief(scan), /qstale=1/);
});

test("in_progress 有一 run 或刚落幕: 交接窗口内不报假活着, 窗口可调", () => {
  // run 刚落幕 3min ⇒ 交接窗口 (默认 10min)
  assert.equal(
    classifyIssue(issue({ status: "in_progress", updatedAt: iso(0.05) }), { now: NOW }).verdict,
    "live",
  );
  // 空转 30min ⇒ 超窗口, 判假活着
  assert.equal(
    classifyIssue(issue({ status: "in_progress", updatedAt: iso(0.5) }), { now: NOW }).verdict,
    "stalled_in_progress",
  );
  // 放宽窗口 ⇒ 30min 也算交接中
  assert.equal(
    classifyIssue(issue({ status: "in_progress", updatedAt: iso(0.5) }), {
      now: NOW,
      handoffGraceMinutes: 60,
    }).verdict,
    "live",
  );
});

// ── 空转时长 ────────────────────────────────────────────────────────────────

test("idleHours 以 updatedAt 为准 (lastActivityAt 会被 attention 巡检刷成当下)", () => {
  // COOA-4 实测复现: 空转 6.5h 且无 run 的工单, lastActivityAt 被控制面刷成"当下"
  assert.equal(idleHours(issue({ updatedAt: iso(6.5), lastActivityAt: iso(0) }), NOW), 6.5);
  assert.equal(idleHours(issue({ updatedAt: null, lastActivityAt: iso(3) }), NOW), 3);
  assert.equal(idleHours(issue({ updatedAt: null, lastActivityAt: null }), NOW), null);
});

// ── 全量扫描 ────────────────────────────────────────────────────────────────

test("scanIssues 只收开放工单, 分组计数与待出手数正确", () => {
  const scan = scanIssues(
    [
      issue({ status: "done", identifier: "COOA-1" }),
      issue({ status: "cancelled", identifier: "COOA-2" }),
      issue({ status: "blocked", identifier: "COOA-3", blockerAttention: { unresolvedBlockerCount: 0 } }),
      issue({ status: "in_progress", identifier: "COOA-4" }),
      issue({ status: "todo", identifier: "COOA-5", assigneeAgentId: null }),
      issue({ status: "in_progress", identifier: "COOA-6", executionRunId: "run-x" }),
    ],
    { now: NOW },
  );
  assert.equal(scan.openCount, 4);
  assert.equal(scan.counts.dead_letter, 1);
  assert.equal(scan.counts.stalled_in_progress, 1);
  assert.equal(scan.counts.orphan, 1);
  assert.equal(scan.counts.live, 1);
  assert.equal(scan.attentionCount, 3);
  assert.deepEqual(
    ATTENTION_VERDICTS.reduce((acc, v) => acc + (scan.counts[v] || 0), 0),
    scan.attentionCount,
  );
});

test("scanIssues 组内按空转时长降序, 最久的排最前", () => {
  const scan = scanIssues(
    [
      issue({ identifier: "COOA-A", lastActivityAt: iso(2), updatedAt: iso(2) }),
      issue({ identifier: "COOA-B", lastActivityAt: iso(100), updatedAt: iso(100) }),
      issue({ identifier: "COOA-C", lastActivityAt: iso(50), updatedAt: iso(50) }),
    ],
    { now: NOW },
  );
  assert.deepEqual(
    scan.byVerdict.dead_letter.map((r) => r.identifier),
    ["COOA-B", "COOA-C", "COOA-A"],
  );
});

test("scanRow 用短码兜底无 identifier 的工单 (老工单无 COOA 号)", () => {
  const row = scanRow(issue({ identifier: null, id: "d6277389-f0c4-4c6d-8d62-391dcaecbc09" }), { now: NOW });
  assert.equal(row.identifier, null);
  assert.equal(labelOf(row), "d6277389");
});

test("VERDICTS 覆盖 classifyIssue 的所有产出, 且 closed 不计入开放分组", () => {
  assert.ok(!VERDICTS.includes("closed"));
  const scan = scanIssues([issue({ status: "done" })], { now: NOW });
  assert.equal(scan.counts.closed, undefined);
});

// ── 渲染 ────────────────────────────────────────────────────────────────────

test("renderText 打印分组徽标与原因行", () => {
  const scan = scanIssues(
    [issue({ identifier: "COOA-77", blockerAttention: { unresolvedBlockerCount: 0 } })],
    { now: NOW },
  );
  const text = renderText(scan);
  assert.match(text, /开放工单活路扫描/);
  assert.match(text, /❌ 无活路 1 条/);
  assert.match(text, /COOA-77/);
  assert.match(text, /永不自动恢复/);
});

test("renderText 空盘面不炸", () => {
  const text = renderText(scanIssues([], { now: NOW }));
  assert.match(text, /开放 0 条/);
  assert.match(text, /无开放工单/);
});

test("renderBrief 一行含四类计数", () => {
  const scan = scanIssues([issue({ status: "todo", assigneeAgentId: null })], { now: NOW });
  const brief = renderBrief(scan);
  assert.match(brief, /^LIVENESS /);
  assert.match(brief, /open=1/);
  assert.match(brief, /orphan=1/);
  assert.match(brief, /dead=0/);
});

// ── CLI 参数 ────────────────────────────────────────────────────────────────

test("parseArgs 解析标志与选项, 未知参数抛错", () => {
  const { flags, options } = parseArgs(["--brief", "--issue", "u-1", "--company", "c-1", "--limit", "10"]);
  assert.equal(flags.brief, true);
  assert.equal(options.issue, "u-1");
  assert.equal(options.company, "c-1");
  assert.equal(options.limit, 10);
  assert.throws(() => parseArgs(["--nope"]), /未知参数/);
});

test("resolveCompanyId 优先显式 company, 否则从 issue 反查 (心法 #148)", async () => {
  assert.equal(
    await resolveCompanyId({ apiBase: "http://x/api", apiKey: "k", companyId: "c-explicit" }),
    "c-explicit",
  );
  const fetchImpl = async (url) => ({
    ok: true,
    text: async () => JSON.stringify({ id: "u-1", companyId: "c-from-issue" }),
  });
  const cid = await resolveCompanyId({
    apiBase: "http://x/api",
    apiKey: "k",
    companyId: null,
    issueId: "u-1",
    fetchImpl,
  });
  assert.equal(cid, "c-from-issue");
  assert.equal(
    await resolveCompanyId({ apiBase: "http://x/api", apiKey: "k", companyId: null, issueId: null }),
    null,
  );
});

test("main 缺 key/base 返回 2, --help 返回 0", async () => {
  assert.equal(await main(["--brief"], {}), 2);
  assert.equal(await main(["--help"], {}), 0);
});

test("main 端到端: 桩 fetch 驱动扫描并打印简报", async () => {
  const realFetch = globalThis.fetch;
  const realLog = console.log;
  const printed = [];
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        issues: [
          issue({ identifier: "COOA-77", blockerAttention: { unresolvedBlockerCount: 0 } }),
          issue({ status: "in_progress", identifier: "COOA-114", executionRunId: "run-live" }),
        ],
      }),
  });
  console.log = (line) => printed.push(line);
  try {
    const code = await main(["--brief"], {
      PAPERCLIP_API_URL: "http://127.0.0.1:3100",
      PAPERCLIP_API_KEY: "test-key",
      PAPERCLIP_COMPANY_ID: "c-test",
    });
    assert.equal(code, 0);
    assert.match(printed.join("\n"), /LIVENESS .*open=2 .*dead=1/);
  } finally {
    globalThis.fetch = realFetch;
    console.log = realLog;
  }
});

test("REPO_ROOT 指向仓库根 (脚本可被任意 cwd 调用)", () => {
  assert.ok(path.isAbsolute(REPO_ROOT));
  assert.equal(path.basename(REPO_ROOT), "coolie");
});

// ── 挂起交互复核 (COOA-114 主线假警报根治) ──────────────────────────────────

test("WAKE_CONTINUATION_POLICIES 认两类唤醒策略, PROBE_VERDICTS 只覆盖待判死判决", () => {
  assert.deepEqual(WAKE_CONTINUATION_POLICIES, ["wake_assignee", "wake_assignee_on_accept"]);
  assert.deepEqual(PROBE_VERDICTS, ["stalled_in_progress", "dead_letter", "review_no_monitor", "queued_stale"]);
  for (const verdict of PROBE_VERDICTS) assert.ok(ATTENTION_VERDICTS.includes(verdict));
  assert.ok(!PROBE_VERDICTS.includes("live"));
  assert.ok(!PROBE_VERDICTS.includes("orphan"), "零指派工单没有交互面, 不为它付 API 代价");
});

test("pickInteractions 接三种回包形态", () => {
  assert.deepEqual(pickInteractions([{ id: "i1" }]), [{ id: "i1" }]);
  assert.deepEqual(pickInteractions({ interactions: [{ id: "i2" }] }), [{ id: "i2" }]);
  assert.deepEqual(pickInteractions({ error: "API route not found" }), []);
  assert.deepEqual(pickInteractions(null), []);
  assert.deepEqual(pickInteractions("boom"), []);
});

test("pendingWakeInteractions 只认 pending + wake 类续跑策略", () => {
  const payload = [
    { id: "a", kind: "ask_user_questions", status: "pending", continuationPolicy: "wake_assignee" },
    { id: "b", kind: "request_confirmation", status: "pending", continuationPolicy: "wake_assignee_on_accept" },
    { id: "c", kind: "suggest_tasks", status: "pending", continuationPolicy: null },
    { id: "d", kind: "ask_user_questions", status: "resolved", continuationPolicy: "wake_assignee" },
    { id: "e", kind: "ask_user_questions", status: "cancelled", continuationPolicy: "wake_assignee" },
  ];
  assert.deepEqual(
    pendingWakeInteractions(payload).map((item) => item.id),
    ["a", "b"],
  );
});

test("applyInteractionProbe: 挂在 wake 类挂起交互上 ⇒ stalled_in_progress 改判 live", () => {
  const row = scanRow(issue({ status: "in_progress", identifier: "COOA-114", updatedAt: iso(0.3), lastActivityAt: iso(0.3) }), {
    now: NOW,
    handoffGraceMinutes: 0,
  });
  assert.equal(row.verdict, "stalled_in_progress", "前置: 零 run 零 monitor 时确实先被判假活着");
  applyInteractionProbe(row, [
    { id: "f2a695e7", kind: "ask_user_questions", status: "pending", resolverPolicy: "anyone", continuationPolicy: "wake_assignee" },
  ]);
  assert.equal(row.verdict, "live");
  assert.equal(row.reasons.length, 1);
  assert.match(row.reasons[0], /挂起交互/);
  assert.match(row.reasons[0], /回复即唤醒/);
  assert.deepEqual(row.interactionProbe, { checked: true, pendingWakeCount: 1, kinds: ["ask_user_questions"] });
});

test("applyInteractionProbe: 只有非 wake 的 pending 交互 ⇒ 判决不变, 但留痕", () => {
  const row = scanRow(issue({ status: "in_progress" }), { now: NOW, handoffGraceMinutes: 0 });
  const before = row.verdict;
  applyInteractionProbe(row, [{ id: "c", kind: "suggest_tasks", status: "pending", continuationPolicy: null }]);
  assert.equal(row.verdict, before);
  assert.equal(row.interactionProbe.checked, true);
  assert.equal(row.interactionProbe.pendingWakeCount, 0);
});

test("applyInteractionProbe: 查询失败/404 体 ⇒ 降级留痕, 不改判决 (不崩)", () => {
  const row = scanRow(issue({ status: "in_progress" }), { now: NOW, handoffGraceMinutes: 0 });
  const before = row.verdict;
  applyInteractionProbe(row, { error: "API route not found" });
  assert.equal(row.verdict, before);
  assert.equal(row.interactionProbe.checked, false);
  assert.equal(row.interactionProbe.error, "API route not found");
});

test("applyInteractionProbe: 非待判死判决完全不碰 (不付 API 代价也不添字段)", () => {
  const row = { id: "x", verdict: "queued", reasons: ["排队中"] };
  applyInteractionProbe(row, [{ status: "pending", continuationPolicy: "wake_assignee" }]);
  assert.equal(row.verdict, "queued");
  assert.equal(row.interactionProbe, undefined);
  assert.equal(applyInteractionProbe(null, []), null);
});

test("regroupScan: 改判后重建分组与计数 (同一口径源)", () => {
  const rows = [
    scanRow(issue({ status: "in_progress", identifier: "COOA-114" }), { now: NOW, handoffGraceMinutes: 0 }),
    scanRow(issue({ status: "todo", assigneeAgentId: null, identifier: "COOA-1" }), { now: NOW }),
  ];
  const before = regroupScan(rows, { now: NOW });
  assert.equal(before.counts.stalled_in_progress, 1);
  assert.equal(before.attentionCount, 2);

  applyInteractionProbe(rows[0], [{ status: "pending", continuationPolicy: "wake_assignee" }]);
  const after = regroupScan(rows, { now: NOW });
  assert.equal(after.counts.stalled_in_progress, 0);
  assert.equal(after.counts.live, 1);
  assert.equal(after.attentionCount, 1);
  assert.equal(after.openCount, 2);
  assert.equal(after.byVerdict.live[0].identifier, "COOA-114");
});

test("regroupScan 容错非数组输入", () => {
  const scan = regroupScan(null, { now: NOW });
  assert.deepEqual(scan.rows, []);
  assert.equal(scan.openCount, 0);
});

test("parseArgs 默认开启交互复核, --no-interaction-probe 可关", () => {
  assert.equal(parseArgs([]).options.probeInteractions, true);
  assert.equal(parseArgs(["--no-interaction-probe"]).options.probeInteractions, false);
});

test("main 端到端: 主线挂起交互被复核后不计入假活着 (stall 1→0)", async () => {
  const realFetch = globalThis.fetch;
  const realLog = console.log;
  const printed = [];
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    if (/\/interactions/.test(url)) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            { id: "f2a695e7", kind: "ask_user_questions", status: "pending", resolverPolicy: "anyone", continuationPolicy: "wake_assignee" },
          ]),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          issues: [
            issue({ status: "in_progress", identifier: "COOA-114", updatedAt: iso(0.5), lastActivityAt: iso(0.5) }),
          ],
        }),
    };
  };
  console.log = (line) => printed.push(line);
  try {
    const code = await main(["--brief", "--handoff-grace-minutes", "0"], {
      PAPERCLIP_API_URL: "http://127.0.0.1:3100",
      PAPERCLIP_API_KEY: "test-key",
      PAPERCLIP_COMPANY_ID: "c-test",
    });
    assert.equal(code, 0);
    const line = printed.join("\n");
    assert.match(line, /stall=0/);
    assert.match(line, /live=1/);
    assert.ok(urls.some((url) => /\/issues\/[\w-]+\/interactions/.test(url)), "确实对候选工单查了交互");
    assert.equal(urls.filter((url) => /\/interactions/.test(url)).length, 1, "只对候选工单查, 不扫全表");
  } finally {
    globalThis.fetch = realFetch;
    console.log = realLog;
  }
});

test("main 端到端: --no-interaction-probe 时不为任何工单查交互", async () => {
  const realFetch = globalThis.fetch;
  const realLog = console.log;
  const printed = [];
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ issues: [issue({ status: "in_progress", identifier: "COOA-114" })] }),
    };
  };
  console.log = (line) => printed.push(line);
  try {
    const code = await main(["--brief", "--no-interaction-probe", "--handoff-grace-minutes", "0"], {
      PAPERCLIP_API_URL: "http://127.0.0.1:3100",
      PAPERCLIP_API_KEY: "test-key",
      PAPERCLIP_COMPANY_ID: "c-test",
    });
    assert.equal(code, 0);
    assert.equal(urls.filter((url) => /\/interactions/.test(url)).length, 0);
    assert.match(printed.join("\n"), /stall=1/);
  } finally {
    globalThis.fetch = realFetch;
    console.log = realLog;
  }
});
