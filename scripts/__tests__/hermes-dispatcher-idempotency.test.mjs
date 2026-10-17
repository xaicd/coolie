// scripts/__tests__/hermes-dispatcher-idempotency.test.mjs
//
// COOA-486 防退化守卫: Hermes dispatcher 派单幂等去重.
// 源自 wave286 真实缺陷: 掌柜同一句微信原话裂变成 5 张工单 (COOA-481~485),
// 根因是 hermes-boss-intent-dispatcher.sh 每次无条件 POST /issues 且每次无条件写 Receipt.
//
// 核心断言 (完成判据):
//   1. 连调 dispatcher 两次同题 → 只产生 1 张 Issue + 1 份 Receipt (第二次复用既有 open 工单).
//   2. 裸巡检缺陷语义 → 0 派单 (不建单, 不落 Receipt).
//   3. Receipt MUST 带去重键; 同 dedupKey 未终结 receipt 重复调用 MUST 跳过而非新增.

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  normalizeBossInput,
  dedupKeyOf,
  intentTitleOf,
  issueMatchesIntent,
  findReusableIssue,
  parseDedupArgs,
  OPEN_STATUSES,
} from "../lib/dispatcher-intent-dedup.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const DISPATCHER = path.join(REPO_ROOT, "scripts/hermes-boss-intent-dispatcher.sh");
const DISPATCH_EMPLOYEE = path.join(REPO_ROOT, "scripts/dispatch-local-employee.sh");

// ── 纯函数: 归一化 / 去重键 ─────────────────────────────────────────────────

test("normalizeBossInput 去空白与标点, 保留中英文数字", () => {
  assert.equal(normalizeBossInput("修一下工单审批流卡死！"), "修一下工单审批流卡死");
  assert.equal(normalizeBossInput("  修 一下\t工单  "), "修一下工单");
  assert.equal(normalizeBossInput("Help Me, NOW!"), "helpmenow");
  assert.equal(normalizeBossInput(null), "");
});

test("dedupKeyOf 稳定且对空白/标点抖动不敏感", () => {
  const a = dedupKeyOf("帮我看看 coolie 主线巡检的本轮缺陷");
  const b = dedupKeyOf("帮我看看 coolie 主线巡检的本轮缺陷。");
  const c = dedupKeyOf("帮我看看coolie主线巡检的本轮缺陷");
  assert.match(a, /^[0-9a-f]{16}$/, "去重键应为 16 hex");
  assert.equal(a, b, "末尾标点不应改变去重键");
  assert.equal(a, c, "空白不应改变去重键");
  assert.notEqual(a, dedupKeyOf("修一下工单审批流卡死"), "不同原话必须不同键");
  assert.equal(dedupKeyOf(""), "", "空输入 → 空键 (调用方据此跳过去重)");
});

test("issueMatchesIntent: exact 命中或同徽标前缀 + 同 task 后缀 (wave 漂移也命中)", () => {
  const task = "修一下工单审批流卡死";
  assert.equal(issueMatchesIntent(intentTitleOf("wave286", task), task, intentTitleOf("wave286", task)), true);
  assert.equal(
    issueMatchesIntent(intentTitleOf("wave287", task), task, intentTitleOf("wave286", task)),
    true,
    "wave 漂移但同 task → 命中",
  );
  assert.equal(issueMatchesIntent(intentTitleOf("wave286", "别的任务"), task, intentTitleOf("wave286", task)), false);
  assert.equal(issueMatchesIntent("随手记一下", task, intentTitleOf("wave286", task)), false);
});

// ── 纯函数: 近邻窗口匹配 ────────────────────────────────────────────────────

test("findReusableIssue: 窗口内同题 open 工单 → 命中", () => {
  const now = Date.parse("2026-10-18T06:00:00Z");
  const task = "修一下工单审批流卡死";
  const issues = [
    {
      id: "i-1",
      identifier: "COOA-482",
      title: intentTitleOf("wave286", task),
      status: "todo",
      updatedAt: new Date(now - 3 * 60000).toISOString(),
    },
  ];
  const { hit } = findReusableIssue({ issues, task, wave: "wave286", windowMinutes: 10, now });
  assert.equal(hit.identifier, "COOA-482");
  assert.equal(hit.ageMinutes, 3);
});

test("findReusableIssue: 已终结工单 / 超窗口 / 异题 一律不命中", () => {
  const now = Date.parse("2026-10-18T06:00:00Z");
  const task = "修一下工单审批流卡死";
  const title = intentTitleOf("wave286", task);
  const mk = (overrides) => ({ id: "x", identifier: "COOA-9", title, status: "todo", updatedAt: new Date(now).toISOString(), ...overrides });

  assert.equal(findReusableIssue({ issues: [mk({ status: "done" })], task, wave: "wave286", now }).hit, null, "done 不命中");
  assert.equal(findReusableIssue({ issues: [mk({ status: "cancelled" })], task, wave: "wave286", now }).hit, null, "cancelled 不命中");
  assert.equal(
    findReusableIssue({ issues: [mk({ updatedAt: new Date(now - 30 * 60000).toISOString() })], task, wave: "wave286", windowMinutes: 10, now }).hit,
    null,
    "超 10 分钟窗口不命中",
  );
  assert.equal(findReusableIssue({ issues: [mk({ title: "别的标题" })], task, wave: "wave286", now }).hit, null, "异题不命中");
});

test("findReusableIssue: {issues:[...]} 形态与空/畸形输入都安全", () => {
  const now = Date.now();
  const task = "修一下工单审批流卡死";
  const payload = { issues: [{ identifier: "COOA-1", title: intentTitleOf("wave286", task), status: "in_progress", updatedAt: new Date(now).toISOString() }] };
  assert.equal(findReusableIssue({ issues: payload, task, wave: "wave286", now }).hit.identifier, "COOA-1");
  assert.equal(findReusableIssue({ issues: null, task, wave: "wave286", now }).hit, null);
  assert.equal(findReusableIssue({ issues: [{ title: null }, 7, "x"], task, wave: "wave286", now }).hit, null);
});

test("OPEN_STATUSES 覆盖五态且不含终结态", () => {
  assert.deepEqual(OPEN_STATUSES, ["backlog", "todo", "in_progress", "in_review", "blocked"]);
  assert.ok(!OPEN_STATUSES.includes("done"));
});

test("parseDedupArgs 解析 --input/--wave/--window/--print-key", () => {
  const o = parseDedupArgs(["--input", "abc", "--wave", "wave286", "--window", "5", "--print-key"]);
  assert.equal(o.input, "abc");
  assert.equal(o.wave, "wave286");
  assert.equal(o.window, 5);
  assert.equal(o.printKey, true);
});

// ── 集成: mock Dev Server + 真跑 dispatcher ────────────────────────────────

/** 最小 mock: GET /api/health, GET .../issues, POST .../issues (记录建单次数). */
function startMockDevServer() {
  const issues = [];
  let postCount = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const json = (code, body) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && url.pathname === "/api/health") return json(200, { status: "ok" });
    if (req.method === "GET" && url.pathname.endsWith("/issues")) return json(200, issues);
    if (req.method === "POST" && url.pathname.endsWith("/issues")) {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        postCount += 1;
        let payload = {};
        try {
          payload = JSON.parse(body || "{}");
        } catch {
          payload = {};
        }
        const created = {
          id: `issue-${postCount}`,
          identifier: `COOA-99${postCount}`,
          title: payload.title ?? null,
          status: payload.status ?? "todo",
          priority: payload.priority ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        issues.unshift(created);
        json(201, { id: created.id, identifier: created.identifier, title: created.title, status: created.status });
      });
      return;
    }
    json(404, { error: "not found" });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port, getPostCount: () => postCount, issues });
    });
  });
}

/**
 * 异步执行 dispatcher —— 必须异步: mock Dev Server 跑在同一进程的事件循环上,
 * 同步 execFileSync 会阻塞事件循环导致 mock 无法应答. stdin 关闭防悬挂.
 */
function runDispatcher(input, env) {
  return new Promise((resolve) => {
    const child = execFile(
      "bash",
      [DISPATCHER, input],
      { cwd: REPO_ROOT, encoding: "utf8", timeout: 60000, env: { ...process.env, ...env } },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
        resolve({ code, stdout: stdout || "", stderr: stderr || "" });
      },
    );
    child.stdin?.end();
  });
}

function runDispatchEmployee(args, env) {
  return new Promise((resolve) => {
    const child = execFile(
      "bash",
      [DISPATCH_EMPLOYEE, ...args],
      { cwd: REPO_ROOT, encoding: "utf8", timeout: 60000, env: { ...process.env, ...env } },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
        resolve({ code, stdout: stdout || "", stderr: stderr || "" });
      },
    );
    child.stdin?.end();
  });
}

/** 建临时 COOLIE_LOCAL_DIR 并预建 dispatch/ (否则 receipt 会重定向到 .paperclip-local). */
function makeLocalDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coolie-disp-idem-"));
  fs.mkdirSync(path.join(dir, "dispatch"), { recursive: true });
  return dir;
}

function receiptFiles(dir) {
  const dispatchDir = path.join(dir, "dispatch");
  if (!fs.existsSync(dispatchDir)) return [];
  return fs.readdirSync(dispatchDir).filter((f) => f.endsWith(".json"));
}

test("dispatcher 幂等: 连调两次同题 → 1 张 Issue + 1 份 Receipt (核心修复)", async () => {
  const mock = await startMockDevServer();
  const localDir = makeLocalDir();
  try {
    const env = {
      COOLIE_DEV_SERVER_URL: `http://127.0.0.1:${mock.port}`,
      COOLIE_LOCAL_DIR: localDir,
      COOLIE_DISPATCH_DEDUP_WINDOW_MIN: "10",
      // 隔离测试: 关掉 dispatcher §0.07 的凭据窗口去重, 让重复调用走到本 issue 的
      // 「Dev Server 既有 open 工单复用」路径 (§create_issue_on_dev 幂等门禁).
      COOLIE_DISPATCH_DEDUP_WINDOW_SEC: "0",
    };
    const input = "修一下工单审批流卡死";

    const first = await runDispatcher(input, env);
    assert.equal(first.code, 0, `first run exit ${first.code}: ${first.stderr}`);
    assert.match(first.stdout, /Dev Server 已建任务/, "首次应真建单");
    assert.equal(mock.getPostCount(), 1, "首次应 POST 建 1 张工单");
    assert.equal(receiptFiles(localDir).length, 1, "首次应落 1 份 Receipt");

    const second = await runDispatcher(input, env);
    assert.equal(second.code, 0, `second run exit ${second.code}: ${second.stderr}`);
    assert.match(second.stdout, /幂等复用|派单幂等去重/, "第二次必须 echo 复用提示");
    assert.doesNotMatch(second.stdout, /Dev Server 已建任务/, "第二次严禁再报新建");
    assert.equal(mock.getPostCount(), 1, "第二次 MUST 复用既有单, MUST NOT 再建 Issue");
    assert.equal(receiptFiles(localDir).length, 1, `第二次 MUST NOT 再写 Receipt, 实际 ${receiptFiles(localDir).length} 份`);
  } finally {
    mock.server.close();
    fs.rmSync(localDir, { recursive: true, force: true });
  }
});

test("dispatcher 幂等: Receipt 必须带 16-hex 去重键", async () => {
  const mock = await startMockDevServer();
  const localDir = makeLocalDir();
  try {
    const env = { COOLIE_DEV_SERVER_URL: `http://127.0.0.1:${mock.port}`, COOLIE_LOCAL_DIR: localDir };
    const input = "修一下工单审批流卡死";
    const run = await runDispatcher(input, env);
    assert.equal(run.code, 0, run.stderr);
    const files = receiptFiles(localDir);
    assert.equal(files.length, 1, "应落 1 份 Receipt");
    const receipt = JSON.parse(fs.readFileSync(path.join(localDir, "dispatch", files[0]), "utf8"));
    assert.match(String(receipt.dedupKey), /^[0-9a-f]{16}$/, "Receipt MUST 带 bossInput 归一化哈希去重键");
    assert.equal(receipt.dedupKey, dedupKeyOf(input), "去重键应与原话归一化哈希一致");
  } finally {
    mock.server.close();
    fs.rmSync(localDir, { recursive: true, force: true });
  }
});

test("dispatcher 裸巡检缺陷语义: 0 派单 0 建单 (含 --review-probe)", async () => {
  const mock = await startMockDevServer();
  const localDir = makeLocalDir();
  try {
    const env = { COOLIE_DEV_SERVER_URL: `http://127.0.0.1:${mock.port}`, COOLIE_LOCAL_DIR: localDir };
    const probes = [
      "看看有什么缺陷",
      "看看这轮有什么缺陷",
      "帮我看看 coolie 主线巡检的本轮缺陷",
      "巡检本轮的缺陷",
      "缺陷巡检一下",
      "--review-probe",
    ];
    for (const p of probes) {
      const run = await runDispatcher(p, env);
      assert.equal(run.code, 0, `probe "${p}" exit ${run.code}: ${run.stderr}`);
      assert.match(run.stdout, /探活\/巡检查询拦截/, `probe "${p}" 必须被 §0.06 拦截`);
    }
    assert.equal(mock.getPostCount(), 0, "裸巡检语义 MUST NOT 建任何 Issue");
    assert.equal(receiptFiles(localDir).length, 0, "裸巡检语义 MUST NOT 落任何 Receipt");
  } finally {
    mock.server.close();
    fs.rmSync(localDir, { recursive: true, force: true });
  }
});

test("dispatch-local-employee: 同 dedupKey 未终结 receipt 重复调用 → 跳过不新增", async () => {
  const localDir = makeLocalDir();
  try {
    const env = { COOLIE_LOCAL_DIR: localDir };
    const args = ["--agent", "forge-core-swe", "--task", "修一下工单审批流卡死", "--wave", "wave286", "--tool", "agy", "--dedup-key", "abc123abc123abcd"];

    const first = await runDispatchEmployee(args, env);
    assert.equal(first.code, 0, first.stderr);
    assert.match(first.stdout, /recorded receipt/, "首次应落 receipt");
    assert.equal(receiptFiles(localDir).length, 1);

    const second = await runDispatchEmployee(args, env);
    assert.equal(second.code, 0, second.stderr);
    assert.match(second.stdout, /幂等去重/, "重复调用应命中幂等去重");
    assert.equal(receiptFiles(localDir).length, 1, "重复调用 MUST NOT 新增 receipt");
  } finally {
    fs.rmSync(localDir, { recursive: true, force: true });
  }
});

test("守卫: 已有 open 工单在窗口外时允许新开 (不误拦合法重开)", async () => {
  const mock = await startMockDevServer();
  const localDir = makeLocalDir();
  try {
    const task = "修一下工单审批流卡死";
    mock.issues.push({
      id: "old-1",
      identifier: "COOA-100",
      title: intentTitleOf("wave286", task),
      status: "in_progress",
      updatedAt: new Date(Date.now() - 60 * 60000).toISOString(), // 60 分钟前 → 超窗口
    });
    const env = { COOLIE_DEV_SERVER_URL: `http://127.0.0.1:${mock.port}`, COOLIE_LOCAL_DIR: localDir, COOLIE_DISPATCH_DEDUP_WINDOW_MIN: "10" };
    const run = await runDispatcher(task, env);
    assert.equal(run.code, 0, run.stderr);
    assert.match(run.stdout, /Dev Server 已建任务/, "超窗口历史工单不应拦合法重开");
    assert.equal(mock.getPostCount(), 1, "超窗口 → 应新开 1 张");
  } finally {
    mock.server.close();
    fs.rmSync(localDir, { recursive: true, force: true });
  }
});
