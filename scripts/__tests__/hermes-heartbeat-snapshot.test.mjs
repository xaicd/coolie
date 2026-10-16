import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
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
  parseArgs,
  collectSnapshot,
  renderText,
  INBOX_BUCKETS,
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
    const { stdout } = await execFileAsync("node", [SCRIPT, "--json", "--issue", ISSUE.id], {
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
      [SCRIPT, "--json", "--issue", ISSUE.id, "--routine-ids", singleId, "--skip-inbox"],
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
    const { stdout } = await execFileAsync("node", [SCRIPT, "--issue", ISSUE.id, "--skip-inbox"], {
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
