// scripts/__tests__/hermes-boss-intent-dispatcher-gates.test.mjs
//
// 守卫: hermes-boss-intent-dispatcher.sh 关键拦截门禁回归保护 (wave286 · COOA-480 沉淀)
// 防止后续重构误删 §0.05 (probe-tool-status 直通) / §0.06 (探活前缀拦截) / §0.1 (Echo 模糊澄清)
// 等门禁, 避免掌柜探活文本被误判成 forge-core-swe 真派单 (心法 #190 已踩 1 次, COOA-481 误派).

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const DISPATCHER = path.join(REPO_ROOT, "scripts/hermes-boss-intent-dispatcher.sh");

function runDispatcher(input) {
  try {
    const out = execFileSync("bash", [DISPATCHER, input], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      // cron-team-status.sh 直通探针在并发测试下可达 ~6s, 全量跑时 ~10s, 给 25s 缓冲
      timeout: 25000,
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
  ];
  for (const p of probes) {
    const { code, stdout } = runDispatcher(p);
    assert.equal(code, 0, `probe "${p}" should exit 0, got ${code}`);
    assert.match(stdout, /探活前缀拦截/, `probe "${p}" must be intercepted, banner missing`);
    assert.doesNotMatch(stdout, /recorded receipt/, `probe "${p}" must not create receipt`);
  }
});

test("dispatcher §0.06: regression guard — text containing 'test' but no probe keyword still dispatches", () => {
  // 反向断言: 不是所有含 test 的指令都被拦, 必须命中 probe-only / 探活 等关键词才拦
  // 这里只静态检查门禁关键字列表存在, 不真发起 forge-core-swe 派单 (会撞 Dev Server 写)
  const src = fs.readFileSync(DISPATCHER, "utf8");
  assert.match(src, /探活前缀拦截/, "should contain §0.06 banner");
  assert.match(src, /\(探活\|probe-only\|dry-probe\|巡检hourly\|hourly\[/, "should list probe keywords");
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

test("dispatcher: real business intent still parses (smoke)", () => {
  // smoke: 一个真业务动词+宾语不能被 §0.06 误拦
  const { code, stdout } = runDispatcher("帮我看看 coolie 主线巡检的本轮缺陷");
  assert.equal(code, 0);
  // 既不能被 §0.06 拦截 (没命中探活关键词), 也不应 echo 一个空字符串
  assert.ok(stdout.length > 0, "real intent should produce some output");
  assert.doesNotMatch(stdout, /探活前缀拦截/, "real intent must not be intercepted by §0.06");
});
