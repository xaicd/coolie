#!/usr/bin/env node
/**
 * OTA 运行时版本一致性门禁 (3 条线)。
 *
 * 同一个 runtimeVersion 必须在三处同时成立，任一处漂移，expo-updates 就会只下载
 * 不加载（「下了不装」）：
 *
 *   1. app.json     —— 意图：runtimeVersion.policy=appVersion 时运行时=版本号
 *   2. APK 原生     —— 装机 App 实际报告的运行时可加载值
 *   3. 生产 manifest —— 下发 bundle 声称的运行时
 *
 * 本文件的诚实规则（与仓库其它门禁一致）：跑不成的线报 NOT VERIFIED 并说明缺什么，
 * 前一条失败而没跑的线报 NOT RUN，只有三条全跑通才报 PASS —— 任何不满都算「不是完整
 * 交付」，而不是「通过」。退出码：0=全验证, 1=有 FAIL, 2=无 FAIL 但未全验证。
 *
 * 用法:
 *   node scripts/verify-ota-runtime-consistency.mjs
 *   node scripts/verify-ota-runtime-consistency.mjs --only=apk
 *   node scripts/verify-ota-runtime-consistency.mjs --json
 */
import { existsSync } from "node:fs";
import {
  DEFAULT_APK,
  findAapt2,
  readApkRuntimeVersion,
  readAppJson,
  resolveIntent,
} from "./runtime-version.mjs";

const MANIFEST_URL =
  process.env.OTA_MANIFEST_URL || "https://xrobinai.cn/ota/manifest";
const TIMEOUT_MS = Number(process.env.OTA_GATE_TIMEOUT_MS || 10000);

const VERIFIED = "VERIFIED";
const FAIL = "FAIL";
const NOT_VERIFIED = "NOT VERIFIED";
const NOT_RUN = "NOT RUN";

const LINES = [
  { name: "app-json", title: "app.json 的 runtimeVersion 跟随 version" },
  { name: "apk", title: "APK 原生 EXPO_RUNTIME_VERSION == app.json" },
  { name: "remote", title: "生产 manifest.runtimeVersion == APK 原生" },
];

async function checkAppJson() {
  const expo = readAppJson().expo;
  const rv = expo?.runtimeVersion;
  let value;
  try {
    value = resolveIntent(expo);
  } catch (error) {
    return { name: "app-json", status: FAIL, detail: error.message, value: null };
  }
  const derived =
    rv === undefined || rv === null || (typeof rv === "object" && rv.policy === "appVersion");
  if (derived) {
    return {
      name: "app-json",
      status: VERIFIED,
      value,
      detail: `intent=${value} (policy=appVersion → 跟随 version ${expo.version})`,
    };
  }
  if (rv === value) {
    return { name: "app-json", status: VERIFIED, value, detail: `intent=${value} (字面量, 与 version 一致)` };
  }
  return {
    name: "app-json",
    status: FAIL,
    value,
    detail: `runtimeVersion 字面量 ${JSON.stringify(rv)} ≠ version ${expo.version}`,
  };
}

async function checkApk(intent) {
  if (!existsSync(DEFAULT_APK)) {
    return {
      name: "apk",
      status: NOT_VERIFIED,
      value: null,
      detail: `无 APK：${DEFAULT_APK}`,
      needs: "先构建 APK (bash scripts/release-app.sh / gradle assembleRelease)",
    };
  }
  if (!findAapt2()) {
    return {
      name: "apk",
      status: NOT_VERIFIED,
      value: null,
      detail: "找不到 aapt2",
      needs: "设置 AAPT2=/path/to/aapt2 或 ANDROID_HOME",
    };
  }
  const apk = readApkRuntimeVersion(DEFAULT_APK);
  if (!apk) {
    return {
      name: "apk",
      status: NOT_VERIFIED,
      value: null,
      detail: "APK 内没有 EXPO_RUNTIME_VERSION meta-data（旧包会整块关掉 OTA）",
      needs: "重跑 clients/expo/scripts/fix-android-manifest.sh 后重建",
    };
  }
  if (apk === intent) {
    return { name: "apk", status: VERIFIED, value: apk, detail: `原生 ${apk} == app.json ${intent}` };
  }
  return {
    name: "apk",
    status: FAIL,
    value: apk,
    detail:
      `原生 ${apk} ≠ app.json ${intent} —— 这就是 OTA「下了不装」的根因；` +
      `重建 APK 才能对齐（在此之前 publish-ota 会采用 APK 真值 ${apk}）`,
  };
}

async function checkRemote(apkRuntime) {
  if (!apkRuntime) {
    return {
      name: "remote",
      status: NOT_RUN,
      value: null,
      detail: "上游未取得 APK 原生值，本线未运行",
    };
  }
  let manifest;
  try {
    const res = await fetch(MANIFEST_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      return {
        name: "remote",
        status: NOT_VERIFIED,
        value: null,
        detail: `${MANIFEST_URL} → HTTP ${res.status}`,
      };
    }
    manifest = await res.json();
  } catch (error) {
    return {
      name: "remote",
      status: NOT_VERIFIED,
      value: null,
      detail: `拉取失败：${error.message}`,
      needs: "网络可达且 OTA 已发布",
    };
  }
  const remote = manifest.runtimeVersion;
  if (remote === apkRuntime) {
    return { name: "remote", status: VERIFIED, value: remote, detail: `远端 ${remote} == APK 原生 ${apkRuntime}` };
  }
  return {
    name: "remote",
    status: FAIL,
    value: remote,
    detail: `远端 ${remote} ≠ APK 原生 ${apkRuntime} → 现装机 App 会「下了不装」（重跑 publish-ota.sh 会把 manifest 拉回 APK 真值）`,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const only = (args.find((a) => a.startsWith("--only=")) || "").slice("--only=".length);
  const wanted = only ? LINES.filter((l) => l.name === only) : LINES;
  if (wanted.length === 0) {
    console.error(`✗ 未知的 --only=${only}（可选：${LINES.map((l) => l.name).join(", ")}）`);
    process.exit(2);
  }

  const intentResult = await checkAppJson();
  const intent = intentResult.value;
  const apkResult = intent
    ? await checkApk(intent)
    : { name: "apk", status: NOT_RUN, value: null, detail: "第 1 条失败，未运行" };
  // 只有「拿不到 APK 原生值」才跳过第 3 条；第 2 条只是不一致时，远端仍值得比对。
  const remoteResult = apkResult.value
    ? await checkRemote(apkResult.value)
    : { name: "remote", status: NOT_RUN, value: null, detail: "上游未取得 APK 原生值，未运行" };

  const all = { "app-json": intentResult, apk: apkResult, remote: remoteResult };
  const results = wanted.map((l) => all[l.name]);

  if (args.includes("--json")) {
    console.log(JSON.stringify({ results, manifestUrl: MANIFEST_URL }, null, 2));
  } else {
    console.log("OTA 运行时版本一致性门禁");
    console.log(`  manifest: ${MANIFEST_URL}`);
    for (const r of results) {
      console.log(`  [${r.status.padEnd(12)}] ${all[r.name].name}: ${r.detail}`);
      if (r.needs) console.log(`                需要: ${r.needs}`);
    }
    const failed = results.filter((r) => r.status === FAIL).length;
    const notVerified = results.filter((r) => r.status === NOT_VERIFIED || r.status === NOT_RUN).length;
    console.log("");
    if (failed > 0) {
      console.log(`FAIL — ${failed} 条不一致，${notVerified} 条未验证。`);
    } else if (notVerified > 0) {
      console.log(`NOT A FULL HAND-OFF — ${results.length - notVerified}/${results.length} 条验证，${notVerified} 条未验证。`);
    } else {
      console.log(`PASS — all ${results.length} lines verified.`);
    }
  }

  const failed = results.some((r) => r.status === FAIL);
  const notVerified = results.some((r) => r.status === NOT_VERIFIED || r.status === NOT_RUN);
  process.exit(failed ? 1 : notVerified ? 2 : 0);
}

main();
