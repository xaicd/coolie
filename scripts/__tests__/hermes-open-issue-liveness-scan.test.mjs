import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import {
  OPEN_STATUSES,
  VERDICTS,
  ATTENTION_VERDICTS,
  classifyIssue,
  idleHours,
  isOpenIssue,
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
