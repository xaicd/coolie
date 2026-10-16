import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  normalizeApiBase,
  pickRoutines,
  apiErrorOf,
  roleForRoutine,
  summarizeRoutine,
  summarizeInbox,
  summarizeQueue,
  queueLineCounts,
  queueKeyOf,
  summarizeLiveness,
  summarizeWaiting,
  livenessSummaryText,
  waitingSummaryText,
  canonicalSnapshot,
  lockStateOf,
  statePathFor,
  isSameIssue,
  snapshotSignature,
  diffSnapshots,
  readState,
  writeState,
  parseArgs,
  collectSnapshot,
  renderText,
  renderBrief,
  INBOX_BUCKETS,
  QUEUE_BUCKETS,
  REPO_ROOT,
} from "../hermes-heartbeat-snapshot.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT = path.join(REPO_ROOT, "scripts", "hermes-heartbeat-snapshot.mjs");

// ---------------------------------------------------------------------------
// 1. API base 归一 (心法 #84/#159/#161: 裸 origin / 尾斜杠 / 已带 /api 三种形态)
// ---------------------------------------------------------------------------

test("normalizeApiBase handles bare origin, trailing slash and existing /api", () => {
  assert.equal(normalizeApiBase("http://127.0.0.1:3100"), "http://127.0.0.1:3100/api");
  assert.equal(normalizeApiBase("http://127.0.0.1:3100/"), "http://127.0.0.1:3100/api");
  assert.equal(normalizeApiBase("http://127.0.0.1:3100///"), "http://127.0.0.1:3100/api");
  assert.equal(normalizeApiBase("http://127.0.0.1:3100/api"), "http://127.0.0.1:3100/api");
  assert.equal(normalizeApiBase("http://127.0.0.1:3100/api/"), "http://127.0.0.1:3100/api");
  assert.equal(normalizeApiBase("  http://127.0.0.1:3100  "), "http://127.0.0.1:3100/api");
  assert.equal(normalizeApiBase(""), null);
  assert.equal(normalizeApiBase(undefined), null);
  assert.equal(normalizeApiBase(null), null);
});

// ---------------------------------------------------------------------------
// 2. list 端点回包形态自适应 (心法 #78/#155/#184/#188)
// ---------------------------------------------------------------------------

test("pickRoutines accepts array, {routines}, {data} and degrades safely", () => {
  const items = [{ id: "a" }];
  assert.deepEqual(pickRoutines(items), items);
  assert.deepEqual(pickRoutines({ routines: items }), items);
  assert.deepEqual(pickRoutines({ data: items }), items);
  assert.deepEqual(pickRoutines({ error: "API route not found" }), []);
  assert.deepEqual(pickRoutines(null), []);
  assert.deepEqual(pickRoutines("<!DOCTYPE html>"), []);
});

test("apiErrorOf only reports real string errors from object payloads", () => {
  assert.equal(apiErrorOf({ error: "API route not found" }), "API route not found");
  assert.equal(apiErrorOf({ routines: [] }), null);
  assert.equal(apiErrorOf([{ id: "a" }]), null);
  assert.equal(apiErrorOf("text"), null);
  assert.equal(apiErrorOf(null), null);
});

// ---------------------------------------------------------------------------
// 3. routine 真值摘要 (心法 #147/#162/#167/#170/#177)
// ---------------------------------------------------------------------------

test("roleForRoutine identifies 心祖 / 交付主线 / 示范项目", () => {
  assert.equal(
    roleForRoutine({ title: "Coolie 工坊持续研发与版本升级守护调度器 (Foundry Evolution Routine)" }),
    "心祖"
  );
  assert.equal(roleForRoutine({ title: "[交付主线例行巡检] 示范项目" }), "示范项目");
  assert.equal(roleForRoutine({ title: "[交付主线例行巡检] Coolie 工坊 AI 原生交付工厂本体系统" }), "交付主线");
  assert.equal(roleForRoutine({ title: "随便", triggers: [{ cronExpression: "*/15 * * * *" }] }), "心祖");
  assert.equal(roleForRoutine({}), "其他");
});

test("summarizeRoutine reads nested lastRun.linkedIssue as the single source of truth", () => {
  const summary = summarizeRoutine({
    id: "b35ff456",
    title: "Foundry Evolution Routine",
    status: "active",
    lastRun: {
      dispatchFingerprint: "4f6ace9c04b2359605578b5fb4558de5b75b4619b766981d1db2037e7ae95dbb",
      linkedIssueId: "aa01c4ba-fa97",
      linkedIssue: { identifier: "COOA-295", status: "done", updatedAt: "2026-10-16T13:31:47.951Z" },
    },
    triggers: [
      {
        cronExpression: "*/15 * * * *",
        lastFiredAt: "2026-10-16T13:30:25.026Z",
        nextRunAt: "2026-10-16T13:45:00.000Z",
        lastResult: "Created execution issue aa01c4ba-fa97",
      },
    ],
  });

  assert.equal(summary.role, "心祖");
  assert.equal(summary.fingerprint.slice(0, 12), "4f6ace9c04b2");
  assert.equal(summary.linkedIssue.identifier, "COOA-295");
  assert.equal(summary.linkedIssue.status, "done");
  assert.equal(summary.cronExpression, "*/15 * * * *");
  assert.deepEqual(summary.phaseNullFields, []);
});

test("summarizeRoutine treats null fields as phase-null, never as an error", () => {
  const summary = summarizeRoutine({
    id: "57f09c90",
    status: "active",
    lastRun: { dispatchFingerprint: "47f7df89", linkedIssueId: "c5158631" },
    triggers: [{ cronExpression: "0 * * * *" }],
  });

  assert.equal(summary.status, "active");
  assert.equal(summary.linkedIssue, null);
  assert.deepEqual(summary.phaseNullFields, ["trigger.lastFiredAt", "trigger.nextRunAt"]);
});

test("summarizeRoutine survives an empty or non-object routine", () => {
  const summary = summarizeRoutine(undefined);
  assert.equal(summary.id, null);
  assert.equal(summary.linkedIssue, null);
  assert.ok(summary.phaseNullFields.includes("fingerprint"));
});

// ---------------------------------------------------------------------------
// 4. inbox 桶计数 (心法 #138/#143/#153)
// ---------------------------------------------------------------------------

test("summarizeInbox counts arrays, numbers and object buckets", () => {
  const payload = {
    pendingApprovals: [{ id: "a" }, { id: "b" }],
    failures: [{ id: "c" }, { id: "d" }, { id: "e" }],
    failedRuns: new Array(20).fill({ id: "x" }),
    mentionedBy: { m1: {}, m2: {} },
    joinRequests: [],
  };
  const inbox = summarizeInbox(payload);
  assert.equal(inbox.degenerate, false);
  assert.equal(inbox.pendingApprovals, 2);
  assert.equal(inbox.failures, 3);
  assert.equal(inbox.failedRuns, 20);
  assert.equal(inbox.mentionedBy, 2);
  assert.equal(inbox.joinRequests, 0);
  assert.equal(inbox.shape, "populated");
});

test("summarizeInbox degrades on {error}, null buckets and non-object payloads", () => {
  const errored = summarizeInbox({ error: "API route not found" });
  assert.equal(errored.degenerate, true);
  assert.equal(errored.error, "API route not found");
  for (const bucket of INBOX_BUCKETS) assert.equal(errored[bucket], null);

  const allNull = summarizeInbox(Object.fromEntries(INBOX_BUCKETS.map((b) => [b, null])));
  assert.equal(allNull.shape, "all-null");
  assert.equal(allNull.degenerate, false, "all-null is a data semantics terminal state, not an error");

  const none = summarizeInbox(null);
  assert.equal(none.degenerate, true);
  assert.equal(none.shape, "none");
});

// ---------------------------------------------------------------------------
// 5. CLI 参数解析
// ---------------------------------------------------------------------------

test("parseArgs supports flags, space form and = form", () => {
  const parsed = parseArgs([
    "--json",
    "--issue",
    "COOA-114",
    "--company=da2e705c",
    "--api-base",
    "http://127.0.0.1:3100",
    "--routine-ids=a,b",
    "--skip-inbox",
  ]);
  assert.equal(parsed.flags.json, true);
  assert.equal(parsed.flags.skipInbox, true);
  assert.equal(parsed.options.issue, "COOA-114");
  assert.equal(parsed.options.company, "da2e705c");
  assert.equal(parsed.options.apiBase, "http://127.0.0.1:3100");
  assert.deepEqual(parsed.options.routineIds, ["a", "b"]);
  assert.equal(parseArgs(["-h"]).flags.help, true);
});

// ---------------------------------------------------------------------------
// 6. 端到端: 真起一个本地 HTTP 服务, 跑 CLI 全流程 (含 list 死掉时的单条回退)
// ---------------------------------------------------------------------------

function startFixtureServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

const ISSUE = {
  id: "179c5dfe-e531-48ac-8e29-fcfb2db2d74b",
  identifier: "COOA-114",
  title: "[主线长任务] Coolie 工坊全生命周期持续研发与能力升级",
  status: "in_progress",
  priority: "high",
  checkoutRunId: "acadde18-5284-4e10-ac9d-881e780359d4",
  companyId: "da2e705c-c80a-411b-b2ae-e39372b1251f",
};

const ROUTINE_LINKED_ISSUE = {
  id: "aa01c4ba-fa97-4f4c-9dc7-fcb4b4880326",
  identifier: "COOA-295",
  status: "done",
  updatedAt: "2026-10-16T13:31:47.951Z",
};

const ROUTINES = [
  {
    id: "b35ff456-cad2-42ef-9880-0fe3626beb70",
    title: "Coolie 工坊持续研发与版本升级守护调度器 (Foundry Evolution Routine)",
    status: "active",
    lastRun: {
      dispatchFingerprint: "4f6ace9c04b2359605578b5fb4558de5b75b4619b766981d1db2037e7ae95dbb",
      linkedIssueId: ROUTINE_LINKED_ISSUE.id,
      linkedIssue: ROUTINE_LINKED_ISSUE,
    },
    triggers: [{ cronExpression: "*/15 * * * *", lastFiredAt: "2026-10-16T13:30:25.026Z", nextRunAt: "2026-10-16T13:45:00.000Z" }],
  },
  {
    id: "57f09c90-ec83-4372-94c0-38684a9b2bb6",
    title: "[交付主线例行巡检] Coolie 工坊 AI 原生交付工厂本体系统",
    status: "active",
    lastRun: { dispatchFingerprint: "47f7df8991b479d1f11f", linkedIssueId: "c5158631-14f4-415c-a1a4-f7dfd14502ee" },
    triggers: [{ cronExpression: "0 * * * *" }],
  },
];

test("CLI produces a real snapshot against a live companies-scoped list endpoint", async () => {
  const { server, baseUrl } = await startFixtureServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === `/api/issues/${ISSUE.id}`) return res.end(JSON.stringify(ISSUE));
    if (req.url === "/api/companies/da2e705c-c80a-411b-b2ae-e39372b1251f/routines") {
      return res.end(JSON.stringify(ROUTINES));
    }
    if (req.url === "/api/inbox?companyId=da2e705c-c80a-411b-b2ae-e39372b1251f") {
      return res.end(
        JSON.stringify({
          pendingApprovals: [{ id: "a" }, { id: "b" }],
          failures: new Array(6).fill({ id: "f" }),
          failedRuns: new Array(20).fill({ id: "r" }),
          mentionedBy: new Array(20).fill({ id: "m" }),
          joinRequests: [],
        })
      );
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "API route not found" }));
  });

  try {
    // 故意给裸 origin: 归一化必须自己补 /api (心法 #159/#161 回归)
    const { stdout } = await execFileAsync("node", [SCRIPT, "--json", "--issue", ISSUE.id, "--no-state"], {
      env: { ...process.env, PAPERCLIP_API_URL: baseUrl, PAPERCLIP_API_KEY: "test-key" },
    });
    const snapshot = JSON.parse(stdout);

    assert.equal(snapshot.routines.source, "companies-list");
    assert.equal(snapshot.routines.items.length, 2);
    assert.equal(snapshot.routines.items[0].role, "心祖");
    assert.equal(snapshot.routines.items[0].linkedIssue.identifier, "COOA-295");
    assert.equal(snapshot.routines.items[1].role, "交付主线");
    assert.equal(snapshot.companyId, ISSUE.companyId);
    assert.equal(snapshot.issue.identifier, "COOA-114");
    assert.equal(snapshot.inbox.failures, 6);
    assert.equal(snapshot.inbox.pendingApprovals, 2);
  } finally {
    server.close();
  }
});

test("CLI falls back to the single-routine endpoint when the list endpoint is dead", async () => {
  const singleId = "b35ff456-cad2-42ef-9880-0fe3626beb70";
  const { server, baseUrl } = await startFixtureServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === `/api/issues/${ISSUE.id}`) return res.end(JSON.stringify(ISSUE));
    if (req.url.endsWith("/routines") && req.url.startsWith("/api/companies/")) {
      // 端点反漂移实况 (心法 #184/#188)
      return res.end(JSON.stringify({ error: "API route not found" }));
    }
    if (req.url === `/api/routines/${singleId}`) return res.end(JSON.stringify(ROUTINES[0]));
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "API route not found" }));
  });

  try {
    const { stdout } = await execFileAsync(
      "node",
      [SCRIPT, "--json", "--issue", ISSUE.id, "--routine-ids", singleId, "--skip-inbox", "--no-state"],
      { env: { ...process.env, PAPERCLIP_API_URL: baseUrl, PAPERCLIP_API_KEY: "test-key" } }
    );
    const snapshot = JSON.parse(stdout);

    assert.equal(snapshot.routines.source, "single-endpoint-fallback");
    assert.equal(snapshot.routines.items.length, 1);
    assert.equal(snapshot.routines.items[0].linkedIssue.status, "done");
    assert.match(snapshot.routines.unavailableReason, /companies-list/);
    assert.equal(snapshot.inbox, null);
  } finally {
    server.close();
  }
});

test("CLI reports routines as unavailable (never fabricates) when list dies and no ids are known", async () => {
  const { server, baseUrl } = await startFixtureServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === `/api/issues/${ISSUE.id}`) return res.end(JSON.stringify(ISSUE));
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "API route not found" }));
  });

  try {
    const { stdout } = await execFileAsync("node", [SCRIPT, "--issue", ISSUE.id, "--skip-inbox", "--no-state"], {
      env: { ...process.env, PAPERCLIP_API_URL: baseUrl, PAPERCLIP_API_KEY: "test-key" },
    });
    assert.match(stdout, /routines: unavailable/);
    assert.match(stdout, /companies-list: API route not found/);
  } finally {
    server.close();
  }
});

test("CLI refuses to run without an API key instead of silently returning empty data", async () => {
  await assert.rejects(
    execFileAsync("node", [SCRIPT, "--skip-inbox"], {
      env: { ...process.env, PAPERCLIP_API_URL: "http://127.0.0.1:3100", PAPERCLIP_API_KEY: "" },
    }),
    /缺少 PAPERCLIP_API_KEY/
  );
});

test("collectSnapshot resolves a missing linkedIssue.identifier via the linked issue lookup", async () => {
  const raw = {
    id: "b35ff456",
    title: "Foundry Evolution Routine",
    status: "active",
    lastRun: { dispatchFingerprint: "4f6ace9c", linkedIssueId: "uuid-1" },
    triggers: [{ cronExpression: "*/15 * * * *" }],
  };
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const body = url.includes("/issues/uuid-1")
      ? { identifier: "COOA-999", status: "done", updatedAt: "2026-10-16T13:31:47.951Z" }
      : url.includes("/routines")
        ? [raw]
        : { pendingApprovals: [] };
    return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
  };

  const snapshot = await collectSnapshot({
    apiBase: "http://x/api",
    apiKey: "k",
    company: "cid",
    fetchImpl,
  });
  assert.equal(snapshot.routines.items[0].linkedIssue.identifier, "COOA-999");
  assert.ok(calls.some((u) => u.endsWith("/issues/uuid-1")), "must look the linked issue up by uuid");
});

test("renderText prints a compact, non-duplicated snapshot", () => {
  const text = renderText({
    apiBase: "http://127.0.0.1:3100/api",
    companyId: "da2e705c",
    generatedAt: "2026-10-16T13:35:00.000Z",
    issue: { identifier: "COOA-114", status: "in_progress", priority: "high", checkoutRunId: "acadde18-5284" },
    routines: { source: "companies-list", unavailableReason: null, items: [summarizeRoutine(ROUTINES[1])] },
    inbox: summarizeInbox({ pendingApprovals: [], failures: new Array(6).fill(1) }),
  });
  assert.match(text, /routines: 1 via companies-list/);
  assert.match(text, /\[交付主线\]/);
  assert.match(text, /pendingApprovals=0 failures=6/);
  assert.ok(text.split("\n").length < 15, "snapshot must stay one-screen small");
});

// ---------------------------------------------------------------------------
// 7. 工单大盘四桶 (与 scripts/coolie-dev-task.sh 同口径)
// ---------------------------------------------------------------------------

const ISSUES = [
  { identifier: "COOA-4", status: "in_progress", priority: "high", checkoutRunId: null },
  { identifier: "COOA-114", status: "in_progress", priority: "high", checkoutRunId: "run-1" },
  { identifier: "COOA-278", status: "in_review", priority: "low", checkoutRunId: null },
  { identifier: "COOA-44", status: "blocked", priority: "low", checkoutRunId: null },
  { identifier: "COOA-1", status: "todo", priority: "medium", checkoutRunId: null },
  { identifier: "COOA-253", status: "backlog", priority: "medium", checkoutRunId: null },
  { identifier: "COOA-99", status: "cancelled", priority: "low", checkoutRunId: null },
];

test("summarizeQueue maps statuses to the 4 buckets and merges todo+backlog", () => {
  const queue = summarizeQueue(ISSUES);
  assert.equal(queue.total, ISSUES.length);
  assert.equal(queueLineCounts(queue), "2/1/1/2");
  assert.deepEqual(
    queue.buckets.in_progress.map((i) => i.identifier),
    ["COOA-114", "COOA-4"],
    "sorted by identifier so the signature never jitters on response order"
  );
  assert.deepEqual(queue.buckets.todo.map((i) => i.identifier), ["COOA-1", "COOA-253"]);
  assert.equal(queue.unscoped, 1, "cancelled falls outside the 4 buckets but stays visible as unscoped");
  assert.deepEqual(
    QUEUE_BUCKETS.map((b) => b.key),
    ["in_progress", "in_review", "blocked", "todo"]
  );
});

test("summarizeQueue tolerates garbage rows and {issues:[...]} wrappers", () => {
  assert.equal(summarizeQueue(null).total, 0);
  assert.equal(summarizeQueue([null, 7, "x"]).total, 3);
  assert.equal(summarizeQueue({ issues: ISSUES }).buckets.blocked.length, 1);
});

test("queueKeyOf falls back to a uuid prefix when identifier is null", () => {
  assert.equal(queueKeyOf({ identifier: "COOA-4" }), "COOA-4");
  assert.equal(queueKeyOf({ id: "d6277389-1234-4567-89ab-cdef01234567" }), "d6277389");
  assert.equal(queueKeyOf({ identifier: null, id: null }), "?");
  assert.equal(queueKeyOf(null), "?");
  // 实测: blocked 桶里 3 条受限工单 identifier=null, 只靠 identifier 渲染会变空串
  const queue = summarizeQueue([
    { id: "d6277389-aaaa", status: "blocked" },
    { identifier: "COOA-44", status: "blocked" },
  ]);
  assert.equal(queue.buckets.blocked.length, 2);
  assert.deepEqual(
    queue.buckets.blocked.map((i) => queueKeyOf(i)),
    ["COOA-44", "d6277389"],
    "sorted by display key, so identifier-less rows keep a stable position"
  );
  assert.notEqual(
    canonicalSnapshot({ queue }).queue[2][1][0],
    canonicalSnapshot({ queue }).queue[2][1][1],
    "two identifier-less issues must not collapse into one signature entry"
  );
});

// ---------------------------------------------------------------------------
// 8. 盘面指纹 + delta (心法 #176: 无变化就只发一行)
// ---------------------------------------------------------------------------

const FIXTURE_NOW = Date.parse("2026-10-16T13:39:00.000Z");

function makeSnapshot({
  routines = ROUTINES,
  issues = ISSUES,
  inboxPayload = {
    pendingApprovals: [{ id: "a" }, { id: "b" }],
    failures: new Array(6).fill({ id: "f" }),
    failedRuns: new Array(20).fill({ id: "r" }),
    mentionedBy: [],
    joinRequests: [],
  },
  waiting = null,
} = {}) {
  return {
    apiBase: "http://127.0.0.1:3100/api",
    companyId: ISSUE.companyId,
    generatedAt: "2026-10-16T13:39:00.000Z",
    issue: {
      identifier: ISSUE.identifier,
      status: ISSUE.status,
      priority: ISSUE.priority,
      checkoutRunId: ISSUE.checkoutRunId,
    },
    routines: { source: "companies-list", unavailableReason: null, items: routines.map(summarizeRoutine) },
    inbox: summarizeInbox(inboxPayload),
    queue: summarizeQueue(issues),
    liveness: summarizeLiveness(issues, { now: FIXTURE_NOW }),
    waiting,
  };
}

test("snapshotSignature is stable against response order", () => {
  const a = makeSnapshot();
  const b = makeSnapshot({ routines: [...ROUTINES].reverse(), issues: [...ISSUES].reverse() });
  assert.equal(snapshotSignature(a), snapshotSignature(b));
  assert.match(snapshotSignature(a), /^[0-9a-f]{16}$/);
});

test("snapshotSignature ignores phase-null churn but reacts to real state changes", () => {
  const base = makeSnapshot();
  const baseSig = snapshotSignature(base);

  // 字段阶段态: trigger 时间戳整片变 null —— 不进指纹, 否则 changed 恒为 true
  const phaseNull = makeSnapshot({
    routines: ROUTINES.map((r) => ({ ...r, triggers: [{ cronExpression: r.triggers?.[0]?.cronExpression }] })),
  });
  assert.equal(snapshotSignature(phaseNull), baseSig, "phase-null churn must not move the signature");

  // 真变化: 心祖 linkedIssue 换人
  const moved = makeSnapshot({
    routines: ROUTINES.map((r) =>
      r.id === ROUTINES[0].id
        ? { ...r, lastRun: { ...r.lastRun, linkedIssue: { identifier: "COOA-296", status: "in_progress", updatedAt: "2026-10-16T13:45:00.000Z" } } }
        : r
    ),
  });
  assert.notEqual(snapshotSignature(moved), baseSig);
});

// 心跳每轮 harness 都会重新签出本 issue → checkoutRunId 必然换新.
// 这是实测 bug: 心跳 #142 报 CHANGED 却只有 `~ issue: ... run=9d9ca1fa -> run=2fa53594` 一条 delta,
// 即指纹被"每分钟必变"的字段污染, no-change 模式永远不可能触发.
test("signature survives the per-heartbeat checkout run id rotation", () => {
  const first = { ...makeSnapshot(), selfRunId: "run-aaaa" };
  const second = { ...makeSnapshot(), selfRunId: "run-bbbb" };
  first.issue = { ...first.issue, checkoutRunId: "run-aaaa" };
  second.issue = { ...second.issue, checkoutRunId: "run-bbbb" };

  assert.equal(snapshotSignature(first), snapshotSignature(second), "self run id rotation must not move the signature");
  assert.deepEqual(diffSnapshots({ canonical: canonicalSnapshot(first) }, second), []);
  assert.equal(snapshotSignature({ ...first, selfRunId: "run-aaaa" }), snapshotSignature(first));
});

test("signature still moves on real lock transitions (unlock / foreign run)", () => {
  const self = { ...makeSnapshot(), selfRunId: "run-aaaa" };
  self.issue = { ...self.issue, checkoutRunId: "run-aaaa" };
  const baseSig = snapshotSignature(self);

  const unlocked = { ...self, issue: { ...self.issue, checkoutRunId: null } };
  assert.notEqual(snapshotSignature(unlocked), baseSig, "losing the lock must move the signature");
  assert.match(diffSnapshots({ canonical: canonicalSnapshot(self) }, unlocked)[0], /lock=self -> null/);

  const foreign = { ...self, issue: { ...self.issue, checkoutRunId: "someone-else" } };
  assert.notEqual(snapshotSignature(foreign), baseSig, "a foreign run holding the lock must move the signature");
  assert.match(diffSnapshots({ canonical: canonicalSnapshot(self) }, foreign)[0], /lock=self -> other/);

  // 无 selfRunId 时退化为稳定的 "locked", 不会随 run id 抖动
  const unknownA = { ...makeSnapshot(), issue: { ...makeSnapshot().issue, checkoutRunId: "run-x" } };
  const unknownB = { ...makeSnapshot(), issue: { ...makeSnapshot().issue, checkoutRunId: "run-y" } };
  assert.equal(snapshotSignature(unknownA), snapshotSignature(unknownB));
  assert.equal(lockStateOf(makeSnapshot().issue, null), "locked");
});

test("lockStateOf covers null / error / self / other", () => {
  assert.equal(lockStateOf(null, "r"), null);
  assert.equal(lockStateOf({ error: "HTTP 500" }, "r"), null);
  assert.equal(lockStateOf({ checkoutRunId: null }, "r"), null);
  assert.equal(lockStateOf({ checkoutRunId: "r" }, "r"), "self");
  assert.equal(lockStateOf({ checkoutRunId: "z" }, "r"), "other");
});

// 同仓会并发跑多个心跳 (COOA-114 与心祖自己的执行 issue). 共用一个状态文件时,
// 后者会覆盖前者的基线 → 每轮都 CHANGED 并刷一屏假 delta.
test("statePathFor scopes the baseline per issue instead of sharing one file", () => {
  const a = statePathFor("COOA-114");
  const b = statePathFor("COOA-296");
  assert.notEqual(a, b, "different issues must not share a baseline file");
  assert.match(a, /heartbeat-snapshot-state\.COOA-114\.json$/);
  assert.match(statePathFor(null), /heartbeat-snapshot-state\.shared\.json$/);
  assert.match(statePathFor("uuid/with:bad chars"), /heartbeat-snapshot-state\.uuid_with_bad_chars\.json$/);
  assert.equal(path.dirname(a), path.dirname(statePathFor("x", a)), "sibling files stay in one directory");
});

test("isSameIssue refuses to diff baselines across issues or degenerate boards", () => {
  const current = makeSnapshot();
  assert.equal(isSameIssue(null, current), true, "first run has no baseline to compare, still a baseline run");
  assert.equal(
    isSameIssue({ canonical: canonicalSnapshot({ ...current, issue: { ...current.issue, identifier: "COOA-296" } }) }, current),
    false,
    "a baseline from another issue must not be diffed"
  );
  assert.equal(isSameIssue({ canonical: canonicalSnapshot(current) }, current), true);
  assert.equal(
    isSameIssue({ canonical: { issue: null } }, current),
    false,
    "a degenerate stored baseline must not be treated as comparable"
  );
  assert.equal(
    isSameIssue({ canonical: canonicalSnapshot(current) }, { ...current, issue: { error: "HTTP 401" } }),
    false,
    "a degenerate current board must not be stored as a diffable baseline"
  );
});

test("diffSnapshots reports routine / inbox / queue / issue changes as readable lines", () => {
  const before = makeSnapshot();
  const after = makeSnapshot({
    issues: [
      ...ISSUES,
      { identifier: "COOA-296", status: "in_progress", priority: "high", checkoutRunId: "run-2" },
    ],
    inboxPayload: {
      pendingApprovals: [{ id: "a" }],
      failures: new Array(7).fill({ id: "f" }),
      failedRuns: [],
      mentionedBy: [],
      joinRequests: [],
    },
    routines: ROUTINES.map((r) =>
      r.id === ROUTINES[0].id
        ? { ...r, lastRun: { ...r.lastRun, linkedIssue: { identifier: "COOA-296", status: "in_progress", updatedAt: "2026-10-16T13:45:00.000Z" } } }
        : r
    ),
  });

  const state = { signature: snapshotSignature(before), canonical: canonicalSnapshot(before) };
  const deltas = diffSnapshots(state, after).join("\n");
  assert.match(deltas, /心祖 linkedIssue COOA-295 done -> COOA-296 in_progress/);
  assert.match(deltas, /\+ in_progress: COOA-296/);
  assert.match(deltas, /~ inbox pendingApprovals 2 -> 1/);
  assert.match(deltas, /~ inbox failures 6 -> 7/);

  assert.deepEqual(diffSnapshots(state, before), [], "identical board yields no delta lines");
  assert.deepEqual(diffSnapshots(null, before), ["(无上一轮状态, 本轮为基线)"]);
});

test("diffSnapshots caps the delta list instead of flooding the comment", () => {
  const before = makeSnapshot({ issues: [] });
  const after = makeSnapshot({
    issues: Array.from({ length: 30 }, (_, i) => ({ identifier: `COOA-9${i}`, status: "blocked", priority: "low" })),
    inboxPayload: { pendingApprovals: [], failures: [], failedRuns: [], mentionedBy: [], joinRequests: [] },
  });
  const deltas = diffSnapshots({ canonical: canonicalSnapshot(before) }, after);
  assert.equal(deltas.length, 13, "12 lines + 1 fold counter");
  assert.match(deltas.at(-1), /另有 \d+ 条变化/);
  assert.match(
    deltas.at(-1),
    /另有 51 条变化/,
    "30 queue adds + 3 inbox moves + 30 活路 adds (每条第 0 个 blocked 且零 blocker 边 = dead_letter), folded after 12"
  );
});

test("readState / writeState round-trip, and degrade on missing or corrupt files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hb-state-"));
  const file = path.join(dir, "nested", "state.json");
  try {
    assert.equal(readState(file), null, "missing file is a first run, not an error");
    const snapshot = makeSnapshot();
    assert.equal(
      writeState({ signature: snapshotSignature(snapshot), canonical: canonicalSnapshot(snapshot) }, file),
      true
    );
    assert.equal(readState(file).signature, snapshotSignature(snapshot));

    fs.writeFileSync(file, "{ this is not json");
    assert.equal(readState(file), null, "corrupt state must not break the heartbeat");
    assert.equal(writeState({ signature: "x" }, path.join(dir, "\u0000bad")), false, "unwritable path returns false");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("renderBrief prints one line when the board is unchanged and adds deltas when it moved", () => {
  const stable = { ...makeSnapshot(), signature: "abc123abc123abcd", previousSignature: "abc123abc123abcd", changed: false, deltas: [] };
  const brief = renderBrief(stable);
  assert.equal(brief.split("\n").length, 1);
  assert.match(brief, /no-change/);
  assert.match(brief, /COOA-114 in_progress/);
  assert.match(brief, /queue 2\/1\/1\/2/);
  assert.match(brief, /pa=2 f=6 fr=20/);

  const moved = { ...makeSnapshot(), signature: "ffff0000ffff0000", previousSignature: "abc123abc123abcd", changed: true, deltas: ["+ in_progress: COOA-296"] };
  const movedBrief = renderBrief(moved);
  assert.match(movedBrief.split("\n")[0], /CHANGED sig=ffff0000ffff0000/);
  assert.equal(movedBrief.split("\n").length, 2);
});

test("parseArgs understands the new heartbeat flags", () => {
  const { flags, options } = parseArgs(["--brief", "--no-state", "--skip-queue", "--state=/tmp/s.json"]);
  assert.equal(flags.brief, true);
  assert.equal(flags.noState, true);
  assert.equal(flags.skipQueue, true);
  assert.equal(options.state, "/tmp/s.json");
  assert.equal(parseArgs(["--state", "/tmp/x.json"]).options.state, "/tmp/x.json");
  assert.equal(parseArgs(["--state-base", "/tmp/base.json"]).options.stateBase, "/tmp/base.json");
  assert.equal(parseArgs(["--state-base=/tmp/base2.json"]).options.stateBase, "/tmp/base2.json");
});

// ---------------------------------------------------------------------------
// 9. 端到端: 同一盘面连跑两次 → 第二次必须 no-change (一行心脏起搏)
// ---------------------------------------------------------------------------

const E2E_ISSUES = [
  { identifier: "COOA-4", status: "in_progress", priority: "high", checkoutRunId: null },
  { identifier: "COOA-114", status: "in_progress", priority: "high", checkoutRunId: ISSUE.checkoutRunId },
  { identifier: "COOA-44", status: "blocked", priority: "low", checkoutRunId: null },
  { identifier: "COOA-1", status: "todo", priority: "medium", checkoutRunId: null },
];

function startHeartbeatFixture() {
  return startFixtureServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === `/api/issues/${ISSUE.id}`) return res.end(JSON.stringify(ISSUE));
    if (req.url === `/api/companies/${ISSUE.companyId}/routines`) return res.end(JSON.stringify(ROUTINES));
    if (req.url === `/api/companies/${ISSUE.companyId}/issues?limit=400`) return res.end(JSON.stringify(E2E_ISSUES));
    if (req.url === `/api/inbox?companyId=${ISSUE.companyId}`) {
      return res.end(
        JSON.stringify({
          pendingApprovals: [{ id: "a" }, { id: "b" }],
          failures: new Array(6).fill({ id: "f" }),
          failedRuns: new Array(20).fill({ id: "r" }),
          mentionedBy: [],
          joinRequests: [],
        })
      );
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "API route not found" }));
  });
}

test("end to end: first --brief run is a baseline, the second on the same board is one line of no-change", async () => {
  const { server, baseUrl } = await startHeartbeatFixture();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hb-brief-"));
  const statePath = path.join(dir, "state.json");
  const env = { ...process.env, PAPERCLIP_API_URL: baseUrl, PAPERCLIP_API_KEY: "test-key" };
  try {
    const first = await execFileAsync("node", [SCRIPT, "--brief", "--issue", ISSUE.id, "--state", statePath], { env });
    assert.match(first.stdout, /CHANGED sig=[0-9a-f]{16}/);
    assert.match(first.stdout, /queue 2\/0\/1\/1/);
    assert.match(first.stdout, /\(无上一轮状态, 本轮为基线\)/);
    assert.ok(fs.existsSync(statePath), "state must be persisted for the next heartbeat");

    const second = await execFileAsync("node", [SCRIPT, "--brief", "--issue", ISSUE.id, "--state", statePath], { env });
    assert.match(second.stdout, /no-change/);
    assert.equal(second.stdout.trim().split("\n").length, 1, "unchanged board must stay a single line");

    // --json 仍然可用, 且带上比对结论
    const third = await execFileAsync("node", [SCRIPT, "--json", "--issue", ISSUE.id, "--state", statePath], { env });
    const payload = JSON.parse(third.stdout);
    assert.equal(payload.changed, false);
    assert.equal(payload.queue.buckets.in_progress.length, 2);
    assert.equal(payload.signature, payload.previousSignature);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("end to end: a new blocked issue shows up as a delta line on the next heartbeat", async () => {
  const { server, baseUrl } = await startHeartbeatFixture();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hb-brief2-"));
  const statePath = path.join(dir, "state.json");
  const env = { ...process.env, PAPERCLIP_API_URL: baseUrl, PAPERCLIP_API_KEY: "test-key" };
  try {
    await execFileAsync("node", [SCRIPT, "--brief", "--issue", ISSUE.id, "--state", statePath], { env });
    E2E_ISSUES.push({ identifier: "COOA-297", status: "blocked", priority: "high", checkoutRunId: null });
    const after = await execFileAsync("node", [SCRIPT, "--brief", "--issue", ISSUE.id, "--state", statePath], { env });
    assert.match(after.stdout, /CHANGED/);
    assert.match(after.stdout, /\+ blocked: COOA-297/);
    assert.match(after.stdout, /queue 2\/0\/2\/1/);
  } finally {
    E2E_ISSUES.pop();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// 回归: 真实心跳里每次 run 的 PAPERCLIP_RUN_ID 都不同 —— 只有 run id 在转时, 下一轮必须仍是
// 单行 no-change (bug 现象: 指纹被 run id 污染, 每轮恒 CHANGED 且 delta 只有一行 run=...).
test("end to end: rotating PAPERCLIP_RUN_ID between heartbeats keeps the board no-change", async () => {
  const { server, baseUrl } = await startHeartbeatFixture();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hb-runid-"));
  const statePath = path.join(dir, "state.json");
  const base = { ...process.env, PAPERCLIP_API_URL: baseUrl, PAPERCLIP_API_KEY: "test-key" };
  try {
    const first = await execFileAsync("node", [SCRIPT, "--brief", "--issue", ISSUE.id, "--state", statePath], {
      env: { ...base, PAPERCLIP_RUN_ID: "run-9d9ca1fa-0ea0-4bc4-b26d-1e82c2c77553" },
    });
    assert.match(first.stdout, /CHANGED sig=[0-9a-f]{16}/);

    const second = await execFileAsync("node", [SCRIPT, "--brief", "--issue", ISSUE.id, "--state", statePath], {
      env: { ...base, PAPERCLIP_RUN_ID: "run-2fa53594-c256-44d1-b30e-4cda21289a6e" },
    });
    assert.match(second.stdout, /no-change/, "a new run id alone must not count as a board change");
    assert.equal(second.stdout.trim().split("\n").length, 1, "run id rotation must stay a single line");
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// 回归: 默认状态文件按 issue 分文件 —— 第二个心跳不该读到第一个心跳的基线
test("end to end: the default baseline file is per issue, so concurrent heartbeats do not clobber each other", async () => {
  const { server, baseUrl } = await startHeartbeatFixture();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hb-perissue-"));
  const baseState = path.join(dir, "state.json");
  const env = { ...process.env, PAPERCLIP_API_URL: baseUrl, PAPERCLIP_API_KEY: "test-key" };
  try {
    await execFileAsync("node", [SCRIPT, "--brief", "--issue", ISSUE.id, "--state-base", baseState], { env });
    assert.ok(fs.existsSync(path.join(dir, "state.COOA-114.json")), "baseline must land in an issue-scoped file");

    const second = await execFileAsync("node", [SCRIPT, "--brief", "--issue", ISSUE.id, "--state-base", baseState], { env });
    assert.match(second.stdout, /no-change/);
    assert.equal(second.stdout.trim().split("\n").length, 1);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// 回归: 显式共用同一个 --state 文件时, 换 issue 只当"新基线", 不把两个 issue 的盘面差刷成 delta
const OTHER_ISSUE = {
  id: "other-issue-id-0000",
  identifier: "COOA-296",
  title: "Coolie 工坊持续研发与版本升级守护调度器",
  status: "in_progress",
  priority: "high",
  checkoutRunId: null,
  companyId: ISSUE.companyId,
};

function startTwoIssueFixture() {
  return startFixtureServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === `/api/issues/${ISSUE.id}`) return res.end(JSON.stringify(ISSUE));
    if (req.url === `/api/issues/${OTHER_ISSUE.id}`) return res.end(JSON.stringify(OTHER_ISSUE));
    if (req.url === `/api/companies/${ISSUE.companyId}/routines`) return res.end(JSON.stringify(ROUTINES));
    if (req.url === `/api/companies/${ISSUE.companyId}/issues?limit=400`) return res.end(JSON.stringify(E2E_ISSUES));
    if (req.url === `/api/inbox?companyId=${ISSUE.companyId}`) {
      return res.end(
        JSON.stringify({ pendingApprovals: [], failures: [], failedRuns: [], mentionedBy: [], joinRequests: [] })
      );
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "API route not found" }));
  });
}

test("end to end: a baseline written by another issue is reported as a fresh baseline, not a fake delta flood", async () => {
  const { server, baseUrl } = await startTwoIssueFixture();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hb-crossissue-"));
  const statePath = path.join(dir, "shared-state.json");
  const env = { ...process.env, PAPERCLIP_API_URL: baseUrl, PAPERCLIP_API_KEY: "test-key" };
  try {
    await execFileAsync("node", [SCRIPT, "--brief", "--issue", OTHER_ISSUE.id, "--state", statePath], { env });
    const other = await execFileAsync("node", [SCRIPT, "--brief", "--issue", ISSUE.id, "--state", statePath], { env });
    assert.match(other.stdout, /\(无上一轮状态, 本轮为基线\)/);
    assert.doesNotMatch(other.stdout, /- routine 心祖 消失/, "a foreign baseline must not fabricate deltas");
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 12. 活路 (liveness) 并入心跳
// 大盘四桶只回答"有几条", 活路回答"还回不回得来". 这两件事分开数,
// 就会把"永不自动恢复"的工单读成"已知稳态"——本仓实测吃过一次 (6 条 blocked
// 既无 blocker 边、又无解阻责任人, 每轮巡检都报成正常)。
// ---------------------------------------------------------------------------

/** 带时间戳的工单行: idleHours 只有在有 updatedAt 时才成立 */
function agedIssue(identifier, status, hoursAgo, extra = {}) {
  return {
    identifier,
    status,
    priority: "high",
    checkoutRunId: null,
    updatedAt: new Date(FIXTURE_NOW - hoursAgo * 3600 * 1000).toISOString(),
    ...extra,
  };
}

test("summarizeLiveness counts every verdict and sorts attention by identifier", () => {
  const lx = summarizeLiveness(ISSUES, { now: FIXTURE_NOW });
  assert.equal(lx.openCount, 6, "cancelled 不算开放工单");
  assert.equal(lx.counts.live, 1, "COOA-114 有 active run");
  assert.equal(lx.counts.stalled_in_progress, 1, "COOA-4 in_progress 无 run");
  assert.equal(lx.counts.review_no_monitor, 1, "COOA-278 in_review 无 monitor");
  assert.equal(lx.counts.dead_letter, 1, "COOA-44 blocked 且零 blocker 边 / 零 descriptor");
  assert.equal(lx.counts.orphan, 2, "COOA-1 + COOA-253 零指派");
  assert.equal(lx.counts.queued, 0);
  assert.equal(lx.attentionCount, 5, "五类需出手之和");
  assert.deepEqual(
    lx.attention.map((a) => a.identifier),
    ["COOA-1", "COOA-253", "COOA-278", "COOA-4", "COOA-44"],
    "attention 必须按 identifier 排序: 扫描器内部按 idle 倒序, 轮次间会抖动"
  );
  assert.ok(lx.attention.every((a) => typeof a.reason === "string" && a.reason.length > 0));
});

test("summarizeLiveness never invents data from garbage input", () => {
  const lx = summarizeLiveness(null, { now: FIXTURE_NOW });
  assert.equal(lx.openCount, 0);
  assert.equal(lx.attentionCount, 0);
  assert.deepEqual(lx.attention, []);
  assert.equal(summarizeLiveness([]).attentionCount, 0);
});

test("idle growth must not move the signature — only (identifier:verdict) is fingerprinted", () => {
  const rows = [agedIssue("COOA-4", "in_progress", 6), agedIssue("COOA-1", "todo", 30)];
  const early = summarizeLiveness(rows, { now: FIXTURE_NOW });
  const later = summarizeLiveness(rows, { now: FIXTURE_NOW + 5 * 3600 * 1000 });
  const idleOf = (lx) => lx.attention.find((a) => a.identifier === "COOA-4")?.idleHours;
  assert.equal(idleOf(early), 6);
  assert.equal(idleOf(later), 11, "idle 时长确实在长");
  const sig = (lx) => snapshotSignature({ ...makeSnapshot({ issues: rows }), liveness: lx });
  assert.equal(sig(early), sig(later), "否则心跳每轮都会 CHANGED (同 phase-null / run-id 轮转那类坑)");
});

test("a工单 losing its liveness path must move the signature", () => {
  const healthy = [agedIssue("COOA-5", "in_progress", 0, { checkoutRunId: "run-live" })];
  const stalled = [agedIssue("COOA-5", "in_progress", 6)];
  const sig = (rows) =>
    snapshotSignature({ ...makeSnapshot({ issues: rows }), liveness: summarizeLiveness(rows, { now: FIXTURE_NOW }) });
  assert.notEqual(sig(healthy), sig(stalled), "有活路 -> 假活着 是最该被看见的信号");
});

test("diffSnapshots reports 工单 entering and leaving the attention set", () => {
  const healthyRows = [agedIssue("COOA-5", "in_progress", 0, { checkoutRunId: "run-live" })];
  const stalledRows = [agedIssue("COOA-5", "in_progress", 6)];
  const before = {
    ...makeSnapshot({ issues: healthyRows }),
    liveness: summarizeLiveness(healthyRows, { now: FIXTURE_NOW }),
  };
  const after = {
    ...makeSnapshot({ issues: stalledRows }),
    liveness: summarizeLiveness(stalledRows, { now: FIXTURE_NOW }),
  };
  const deltas = diffSnapshots({ canonical: canonicalSnapshot(before) }, after);
  assert.ok(
    deltas.some((d) => d.includes("+ 活路: COOA-5:stalled_in_progress")),
    `expected a liveness delta, got: ${JSON.stringify(deltas)}`
  );
  const back = diffSnapshots({ canonical: canonicalSnapshot(after) }, before);
  assert.ok(back.some((d) => d.includes("- 活路: COOA-5:stalled_in_progress")));
});

test("renderBrief carries the lx segment, and says (ok) when nothing needs a human", () => {
  const line = renderBrief({ ...makeSnapshot(), signature: "abc", changed: false });
  assert.match(line, /lx 5\/6 \(dead=1 stall=1 nomon=1 orphan=2\)/);
  assert.equal(livenessSummaryText(null), "lx null");
  assert.equal(
    livenessSummaryText({ attentionCount: 0, openCount: 4, counts: { live: 4 } }),
    "lx 0/4 (ok)",
    "全零不能渲染成空括号"
  );
});

test("renderText lists each attention 工单 with its verdict and reason", () => {
  const text = renderText(makeSnapshot());
  assert.match(text, /liveness: lx 5\/6/);
  assert.match(text, /COOA-4 stalled_in_progress in_progress .*无 active run/);
  assert.match(text, /COOA-1 orphan todo .*零指派/);
});

test("end to end: the CLI reports liveness on a real board (live fixture server)", async () => {
  const board = [
    { ...agedIssue("COOA-4", "in_progress", 7), id: "11111111-1111-1111-1111-111111111111" },
    {
      ...agedIssue("COOA-114", "in_progress", 0, { checkoutRunId: "run-self" }),
      id: "179c5dfe-e531-48ac-8e29-fcfb2db2d74b",
    },
  ];
  const { server, baseUrl } = await startFixtureServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === `/api/issues/${ISSUE.id}`) return res.end(JSON.stringify(ISSUE));
    if (req.url === `/api/companies/${ISSUE.companyId}/routines`) return res.end(JSON.stringify(ROUTINES));
    if (req.url === `/api/companies/${ISSUE.companyId}/issues?limit=400`) return res.end(JSON.stringify(board));
    if (req.url === `/api/inbox?companyId=${ISSUE.companyId}`) {
      return res.end(JSON.stringify({ pendingApprovals: [], failures: [], mentionedBy: [], joinRequests: [] }));
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "API route not found" }));
  });
  const env = { ...process.env, PAPERCLIP_API_URL: baseUrl, PAPERCLIP_API_KEY: "test-key" };
  try {
    const { stdout } = await execFileAsync("node", [SCRIPT, "--brief", "--issue", ISSUE.id, "--no-state"], { env });
    assert.match(stdout, /lx 1\/2 \(stall=1\)/, `brief must carry liveness, got: ${stdout}`);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// 10. 挂起卡片 (waiting): 心跳要回答的第三问 —— 我还在等谁
//     背景: 主线盘面无死信、routine 全绿, 而我本人正等着一张没人回复的卡片 ——
//     这一格此前只活在散文里, 每轮都得靠人读评论才知道在等谁.
// ---------------------------------------------------------------------------

const WAITING_NOW = Date.parse("2026-10-16T14:20:00.000Z");

test("summarizeWaiting only counts pending cards and measures the oldest one", () => {
  const waiting = summarizeWaiting(
    [
      { id: "a", kind: "ask_user_questions", status: "pending", continuationPolicy: "wake_assignee", createdAt: "2026-10-16T13:57:00.000Z" },
      { id: "b", kind: "request_confirmation", status: "pending", continuationPolicy: "wake_assignee_on_accept", createdAt: "2026-10-16T14:05:00.000Z" },
      { id: "c", kind: "ask_user_questions", status: "cancelled", createdAt: "2026-10-16T12:00:00.000Z" },
    ],
    { now: WAITING_NOW }
  );
  assert.equal(waiting.checked, true);
  assert.equal(waiting.pendingCount, 2, "cancelled 卡片不是等待路径");
  assert.equal(waiting.wakeCount, 2, "两张都声明了回复即唤醒");
  assert.deepEqual(waiting.kinds, ["ask_user_questions", "request_confirmation"]);
  assert.equal(waiting.oldestAgeMinutes, 23, "最老一张 13:57 挂到现在");
  assert.deepEqual(
    waiting.items.map((i) => i.id),
    ["a", "b"],
    "排序稳定 → 回包顺序不影响指纹"
  );
});

test("summarizeWaiting degrades honestly instead of inventing zero cards", () => {
  for (const bad of [{ error: "API route not found" }, "not json", null, 42, {}]) {
    const waiting = summarizeWaiting(bad);
    assert.equal(waiting.checked, false, `must not claim a clean wait state for ${JSON.stringify(bad)}`);
    assert.equal(waiting.pendingCount, null, "查不到时不能假装 0 张卡");
    assert.deepEqual(waiting.items, []);
  }
  for (const empty of [[], { interactions: [] }]) {
    const waiting = summarizeWaiting(empty);
    assert.equal(waiting.checked, true);
    assert.equal(waiting.pendingCount, 0);
    assert.equal(waiting.oldestAgeMinutes, null);
  }
  const noStamp = summarizeWaiting([{ id: "x", kind: "ask_user_questions", status: "pending" }], { now: WAITING_NOW });
  assert.equal(noStamp.pendingCount, 1);
  assert.equal(noStamp.oldestAgeMinutes, null, "createdAt 不可解析 → 年龄留 null, 不猜");
});

test("a waiting card aging must not move the signature — only (count, kinds) is fingerprinted", () => {
  const card = { id: "a", kind: "ask_user_questions", status: "pending", continuationPolicy: "wake_assignee", createdAt: "2026-10-16T14:19:00.000Z" };
  const young = summarizeWaiting([card], { now: Date.parse("2026-10-16T14:20:00.000Z") });
  const old = summarizeWaiting([card], { now: Date.parse("2026-10-16T20:20:00.000Z") });
  assert.equal(young.oldestAgeMinutes, 1);
  assert.equal(old.oldestAgeMinutes, 361);
  assert.equal(
    snapshotSignature(makeSnapshot({ waiting: young })),
    snapshotSignature(makeSnapshot({ waiting: old })),
    "年龄每轮都在长, 进指纹会让 changed 恒为 true"
  );
});

test("a card leaving the waiting set must move the signature and print a delta line", () => {
  const one = makeSnapshot({
    waiting: summarizeWaiting([{ id: "a", kind: "ask_user_questions", status: "pending", createdAt: "2026-10-16T13:58:00.000Z" }], { now: WAITING_NOW }),
  });
  const none = makeSnapshot({
    waiting: summarizeWaiting([{ id: "a", kind: "ask_user_questions", status: "cancelled", createdAt: "2026-10-16T13:58:00.000Z" }], { now: WAITING_NOW }),
  });
  assert.notEqual(snapshotSignature(one), snapshotSignature(none), "被答复/撤回的卡片必须让指纹动");
  const deltas = diffSnapshots({ canonical: canonicalSnapshot(one) }, none);
  assert.ok(
    deltas.some((d) => d.includes("挂起卡片") && d.includes("1 pending") && d.includes("0 pending")),
    `expected a waiting delta, got ${JSON.stringify(deltas)}`
  );
});

test("renderBrief carries the wait segment and renderText lists each pending card", () => {
  const waiting = summarizeWaiting(
    [{ id: "f2a695e7", kind: "ask_user_questions", status: "pending", continuationPolicy: "wake_assignee", createdAt: "2026-10-16T13:58:00.000Z" }],
    { now: WAITING_NOW }
  );
  const brief = renderBrief({ ...makeSnapshot({ waiting }), signature: "abc", changed: false });
  assert.match(brief, /wait=1p\/22m ask_user_questions/);
  const text = renderText(makeSnapshot({ waiting }));
  assert.match(text, /waiting : wait=1p\/22m ask_user_questions/);
  assert.match(text, /ask_user_questions f2a695e7 pending 22m policy=wake_assignee \(回复即唤醒\)/);
  assert.equal(waitingSummaryText(null), "wait=skip");
  assert.equal(waitingSummaryText(summarizeWaiting({ error: "API route not found" })), "wait=?");
  assert.equal(waitingSummaryText(summarizeWaiting([])), "wait=0p");
});

test("parseArgs understands --skip-waiting", () => {
  assert.equal(parseArgs(["--skip-waiting"]).flags.skipWaiting, true);
  assert.equal(parseArgs([]).flags.skipWaiting, false);
});

test("end to end: the brief shows the open card, then flags it when the card is answered", async () => {
  let cards = [
    {
      id: "f2a695e7-e5c1-4438-bd54-45fb6dfd1293",
      kind: "ask_user_questions",
      status: "pending",
      continuationPolicy: "wake_assignee",
      createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    },
  ];
  const { server, baseUrl } = await startFixtureServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === `/api/issues/${ISSUE.id}`) return res.end(JSON.stringify(ISSUE));
    if (req.url === `/api/issues/${ISSUE.id}/interactions`) return res.end(JSON.stringify(cards));
    if (req.url === `/api/companies/${ISSUE.companyId}/routines`) return res.end(JSON.stringify(ROUTINES));
    if (req.url === `/api/companies/${ISSUE.companyId}/issues?limit=400`) return res.end(JSON.stringify(E2E_ISSUES));
    if (req.url === `/api/inbox?companyId=${ISSUE.companyId}`) {
      return res.end(JSON.stringify({ pendingApprovals: [], failures: [], failedRuns: [], mentionedBy: [], joinRequests: [] }));
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "API route not found" }));
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hb-wait-"));
  const statePath = path.join(dir, "state.json");
  const env = { ...process.env, PAPERCLIP_API_URL: baseUrl, PAPERCLIP_API_KEY: "test-key" };
  try {
    const first = await execFileAsync("node", [SCRIPT, "--brief", "--issue", ISSUE.id, "--state", statePath], { env });
    assert.match(first.stdout, /wait=1p\/5m ask_user_questions/, `brief must show the open card, got: ${first.stdout}`);

    cards = [{ ...cards[0], status: "answered" }];
    const second = await execFileAsync("node", [SCRIPT, "--brief", "--issue", ISSUE.id, "--state", statePath], { env });
    assert.match(second.stdout, /CHANGED/);
    assert.match(second.stdout, /挂起卡片: 1 pending .* -> 0 pending/);
    assert.match(second.stdout, /wait=0p/);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
