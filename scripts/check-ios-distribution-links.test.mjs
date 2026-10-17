#!/usr/bin/env node
// scripts/check-ios-distribution-links.test.mjs
// COOA-470: iOS 分发死链 + 契约错位守卫单测。
//
// 复现 COOA-468/470 的真实缺陷形态: 声明了 iOS 下载字段但 URL 404 / 写成嵌套 ios 对象,
// 断言守卫必须失败; 诚实空态与可真 200 则必须通过。
// 判决逻辑经注入式 probe 确定性覆盖; 另用 CLI 冒烟确认参数接线。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { evaluateIosDistributionLinks } from "./check-ios-distribution-links.mjs";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "check-ios-distribution-links.mjs");

function tmpJson(data) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ios-links-")), "version.json");
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  return file;
}

/** 假 probe: 只认 /ok 为 200, 其余 404。 */
const fakeProbe = async (url) => (/\/ok\b/.test(url) ? 200 : 404);

test("无 iOS 声明 → 诚实空态通过", async () => {
  const v = await evaluateIosDistributionLinks({ data: { version: "0.6.61", iosTestFlightUrl: null } });
  assert.equal(v.failed, false);
  assert.equal(v.declared, false);
  assert.match(v.results.at(-1).message, /诚实空态/);
});

test("声明 iosDownloadUrl 且真能 200 → 通过", async () => {
  const v = await evaluateIosDistributionLinks({
    data: { version: "1.0.0", iosDownloadUrl: "https://dls.xrobinai.cn/ok.ipa" },
    probe: fakeProbe,
  });
  assert.equal(v.failed, false);
  assert.equal(v.results.find((r) => r.key === "iosDownloadUrl").status, 200);
});

test("声明 iosDownloadUrl 但 404 死链 → 失败 —— 复现 COOA-468", async () => {
  const v = await evaluateIosDistributionLinks({
    data: { version: "1.0.0", iosDownloadUrl: "https://dls.xrobinai.cn/missing.ipa" },
    probe: fakeProbe,
  });
  assert.equal(v.failed, true);
  assert.equal(v.results.find((r) => r.key === "iosDownloadUrl").status, 404);
});

test("iosTestFlightUrl 是真链接时必须可探测 (非 null)", async () => {
  const dead = await evaluateIosDistributionLinks({
    data: { version: "1.0.0", iosTestFlightUrl: "https://testflight.apple.com/join/gone" },
    probe: fakeProbe,
  });
  assert.equal(dead.failed, true);
  const alive = await evaluateIosDistributionLinks({
    data: { version: "1.0.0", iosTestFlightUrl: "https://testflight.apple.com/ok" },
    probe: fakeProbe,
  });
  assert.equal(alive.failed, false);
});

test("残留嵌套 ios 对象 → 契约错位失败 —— 复现 COOA-470", async () => {
  const v = await evaluateIosDistributionLinks({
    data: { version: "1.0.0", ios: { downloadUrl: "https://dls.xrobinai.cn/ok.ipa" } },
    skipHttp: true,
  });
  assert.equal(v.nestedIos, true);
  assert.equal(v.failed, true);
  assert.match(v.results.map((r) => r.message).join("\n"), /嵌套/);
});

test("--skip-http: 已声明字段不再探测, 仅结构检查→通过", async () => {
  const v = await evaluateIosDistributionLinks({
    data: { version: "1.0.0", iosDownloadUrl: "https://dls.xrobinai.cn/never.ipa" },
    skipHttp: true,
  });
  assert.equal(v.failed, false);
  assert.equal(v.results.find((r) => r.key === "iosDownloadUrl").level, "SKIP");
});

test("CLI 接线: --file + --skip-http 通过 (exit 0)", () => {
  const file = tmpJson({ version: "1.0.0", iosDownloadUrl: "https://dls.xrobinai.cn/never.ipa" });
  const r = spawnSync("node", [SCRIPT, "--file", file, "--skip-http"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /结构检查/);
});

test("CLI 接线: 嵌套 ios 契约错位 → exit 1", () => {
  const file = tmpJson({ version: "1.0.0", ios: { downloadUrl: "https://x/y.ipa" } });
  const r = spawnSync("node", [SCRIPT, "--file", file, "--skip-http"], { encoding: "utf8" });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /嵌套/);
});

test("CLI 接线: 文件不存在 → exit 2", () => {
  const r = spawnSync("node", [SCRIPT, "--file", "/nonexistent/version.json"], { encoding: "utf8" });
  assert.equal(r.status, 2);
});
