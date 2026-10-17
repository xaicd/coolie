// scripts/__tests__/hermes-boss-intent-dispatcher-gates.test.mjs
//
// 守卫: hermes-boss-intent-dispatcher.sh 关键拦截门禁回归保护 (wave286 · COOA-480 沉淀)
// 防止后续重构误删 §0.05 (probe-tool-status 直通) / §0.06 (探活前缀拦截) / §0.1 (Echo 模糊澄清)
// 等门禁, 避免掌柜探活文本被误判成 forge-core-swe 真派单 (心法 #190 已踩 1 次, COOA-481 误派).

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const DISPATCHER = path.join(REPO_ROOT, "scripts/hermes-boss-intent-dispatcher.sh");

function runDispatcher(input, extraEnv = {}) {
  try {
    const out = execFileSync("bash", [DISPATCHER, input], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      // cron-team-status.sh 直通探针在并发测试下可达 ~6s, 全量跑时 ~10s, 给 25s 缓冲
      timeout: 25000,
      env: {
        ...process.env,
        // COOA-485: 强制干跑, 测试严禁在 Dev Server (3100) 真建单或落 Receipt, 否则巡检单元测试自造工单风暴
        COOLIE_DISPATCH_DRY_RUN: "1",
        // 默认关闭幂等去重, 使既有用例不受仓库真实凭据影响 (去重单测单独覆盖)
        COOLIE_DISPATCH_DEDUP_WINDOW_SEC: "0",
        ...extraEnv,
      },
    });
    return { code: 0, stdout: out, stderr: "" };
  } catch (e) {
    return {
      code: e.status ?? 1,
      stdout: (e.stdout || "").toString(),
      stderr: (e.stderr || "").toString(),
    };
  }
}

test("dispatcher: file exists and is executable", () => {
  assert.ok(fs.existsSync(DISPATCHER), `missing: ${DISPATCHER}`);
  const stat = fs.statSync(DISPATCHER);
  // executable bit on owner (any of +x)
  assert.ok((stat.mode & 0o111) !== 0, "dispatcher must be executable");
});

test("dispatcher §0.05: --probe-tool-status echoes probe banner without calling Dev Server", () => {
  const { code, stdout } = runDispatcher("--probe-tool-status");
  assert.equal(code, 0, `exit non-zero: ${code}`);
  assert.match(stdout, /工具池状态探测|--probe-tool-status/, "should print probe banner");
  // 严禁在 stdout 里看到 "queued" / "Receipt" 这类真派单信号
  assert.doesNotMatch(stdout, /recorded receipt/, "probe must not create a real receipt");
  assert.doesNotMatch(stdout, /queued -> running/, "probe must not enter run queue");
});

test("dispatcher §0.06: probe-only prefix is intercepted, not dispatched", () => {
  const probes = [
    "巡检hourly routine test 红测",
    "probe-only check tools",
    "dry-probe 工具池",
    "探活工具池",
    "探针 dispatcher",
    "hourly routine 快照",
    // COOA-485: 掌柜真实探活原话族 (裸「巡检…缺陷」), 必须一并拦截, 否则一线巡检单风暴复发
    "帮我看看 coolie 主线巡检的本轮缺陷",
    "巡检本轮的缺陷",
    "看看这轮有什么缺陷",
    "coolie 主线巡检",
  ];
  for (const p of probes) {
    const { code, stdout } = runDispatcher(p);
    assert.equal(code, 0, `probe "${p}" should exit 0, got ${code}`);
    assert.match(stdout, /探活\/巡检查询拦截/, `probe "${p}" must be intercepted, banner missing`);
    assert.doesNotMatch(stdout, /recorded receipt/, `probe "${p}" must not create receipt`);
    // 拦截必须发生在写路径之前: 绝不能走到 §4.9 干跑收尾
    assert.doesNotMatch(stdout, /DRY_RUN 结束/, `probe "${p}" must exit at §0.06, before write path`);
  }
});

test("dispatcher §0.06: regression guard — text containing 'test' but no probe keyword still dispatches", () => {
  // 反向断言: 不是所有含 test 的指令都被拦, 必须命中 probe-only / 探活 / 巡检缺陷 等关键词才拦.
  // 这里只静态检查门禁关键字列表存在, 不真发起 forge-core-swe 派单 (会撞 Dev Server 写).
  const src = fs.readFileSync(DISPATCHER, "utf8");
  assert.match(src, /探活\/巡检查询拦截/, "should contain §0.06 banner");
  assert.match(src, /\(探活\|probe-only\|dry-probe\|巡检hourly\|hourly\[/, "should list base probe keywords");
  assert.ok(src.includes("主线巡检"), "should list 主线巡检 keyword");
  assert.ok(src.includes("本轮[^[:space:]]*缺陷"), "should list 本轮…缺陷 query pattern");
  assert.ok(src.includes("这轮[^[:space:]]*缺陷"), "should list 这轮…缺陷 query pattern");
});

test("dispatcher §0.06: 业务巡检 DS 派单路由不被巡检查询拦截误伤", () => {
  // 反向保护: 只拦「巡检…缺陷」查询语, 真实 ds 派单词 `业务巡检` 必须仍走 §1 分流 (干跑不再被 §0.06 拦)
  const { code, stdout } = runDispatcher("做一次业务巡检");
  assert.equal(code, 0);
  assert.doesNotMatch(stdout, /探活\/巡检查询拦截/, "`业务巡检` must not be swallowed by §0.06");
  assert.match(stdout, /Hermes 微信秒级接单/, "`业务巡检` should still parse as a real intent");
});

test("dispatcher §0.1: Echo clarification gate still triggers on fuzzy verbs", () => {
  for (const fuzzy of ["修一下", "改一下", "看下", "处理下"]) {
    const { code, stdout } = runDispatcher(fuzzy);
    assert.equal(code, 0);
    assert.match(stdout, /Echo 意图澄清追问|Echo Clarification/, `fuzzy "${fuzzy}" must trigger Echo gate`);
  }
});

test("dispatcher §0.0: empty / help / -h all exit 0 with usage banner", () => {
  for (const h of ["", "help", "-h", "--help"]) {
    const { code, stdout } = runDispatcher(h);
    assert.equal(code, 0, `help arg "${h}" should exit 0`);
    assert.match(stdout, /用法:|core能力/, `help arg "${h}" should print usage`);
  }
});

test("dispatcher: 掌柜巡检缺陷查询语被拦, 不再起假单 (COOA-485 核心修复)", () => {
  // COOA-485 真缺陷: 该原话此前被判「真意图」放行, 一次探活连起 4 张重单 (COOA-482/483/484/485).
  // 修复后必须走 §0.06 拦截, 且不落任何 receipts / 任务.
  const { code, stdout } = runDispatcher("帮我看看 coolie 主线巡检的本轮缺陷");
  assert.equal(code, 0);
  assert.ok(stdout.length > 0, "should echo the interception banner, not an empty string");
  assert.match(stdout, /探活\/巡检查询拦截/, "boss inspection-defect query must be intercepted by §0.06");
  assert.doesNotMatch(stdout, /recorded receipt/, "must not create a receipt");
});

test("dispatcher: real business intent still parses under dry-run (no write)", () => {
  // 干跑保护: 真业务动词+宾语不被 §0.06 误拦, 且 COOLIE_DISPATCH_DRY_RUN 保证零写副作用.
  const { code, stdout } = runDispatcher("修一下工单审批流卡死");
  assert.equal(code, 0);
  assert.match(stdout, /Hermes 微信秒级接单/, "real intent should parse");
  assert.doesNotMatch(stdout, /探活\/巡检查询拦截/, "real intent must not be intercepted by §0.06");
  assert.doesNotMatch(stdout, /recorded receipt/, "dry-run must not create receipt");
  assert.match(stdout, /DRY_RUN 结束/, "dry-run tail should report no write");
});

test("dispatcher §0.07: 幂等去重 — 窗口内同一原话不再重复建单 (COOA-486)", () => {
  // 隔离沙箱: COOLIE_LOCAL_DIR 指向临时目录, 放置一条「刚生成的」同题凭据.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cooa486-dedup-"));
  const dispatchDir = path.join(tmp, "dispatch");
  fs.mkdirSync(dispatchDir, { recursive: true });
  const task = "修一下工单审批流卡死";
  fs.writeFileSync(
    path.join(dispatchDir, "20261017T000000Z-wave286-forge-core-swe.json"),
    JSON.stringify({ id: "20261017T000000Z-wave286-forge-core-swe", createdAt: new Date().toISOString(), task, bossInput: task, employee: "铁匠", status: "queued" }),
    "utf8",
  );

  // 命中: 同题 + 默认 1800s 窗口 → 去重拦截
  const hit = runDispatcher(task, { COOLIE_LOCAL_DIR: tmp, COOLIE_DISPATCH_DEDUP_WINDOW_SEC: "1800" });
  assert.equal(hit.code, 0);
  assert.match(hit.stdout, /派单幂等去重/, "duplicate phrase must be deduped");
  assert.doesNotMatch(hit.stdout, /recorded receipt/, "dedup must not create receipt");
  assert.doesNotMatch(hit.stdout, /DRY_RUN 结束/, "dedup must exit before the write-path tail");

  // 未命中: 不同原话 → 不被去重
  const miss = runDispatcher("给工单页加上导出按钮", { COOLIE_LOCAL_DIR: tmp, COOLIE_DISPATCH_DEDUP_WINDOW_SEC: "1800" });
  assert.equal(miss.code, 0);
  assert.doesNotMatch(miss.stdout, /派单幂等去重/, "different phrase must not be deduped");

  // 窗口关闭: 同题也可强制复跑
  const off = runDispatcher(task, { COOLIE_LOCAL_DIR: tmp, COOLIE_DISPATCH_DEDUP_WINDOW_SEC: "0" });
  assert.equal(off.code, 0);
  assert.doesNotMatch(off.stdout, /派单幂等去重/, "window=0 must disable dedup");

  fs.rmSync(tmp, { recursive: true, force: true });
});
