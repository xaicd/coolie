#!/usr/bin/env node
/**
 * scripts/check-ios-distribution-links.mjs
 *
 * iOS 分发死链与契约守卫 (COOA-470 / COOA-468).
 *
 * 目的: 防止「version.json 声明了 iOS 下载入口, 但该 URL 是 404 死链」或
 * 「脚本写嵌套 ios 对象 / App 读扁平字段」的契约错位再次悄悄发生 (App 端不会报错,
 * 只会把下载按钮静默隐藏 —— 正是 COOA-468 想避免的『iOS 分发不可用却无人察觉』)。
 *
 * 规则:
 *   1. 若 version.json 声明了 iOS 下载字段 (iosDownloadUrl / iosTestFlightUrl /
 *      iosManifestUrl / iosQrUrl), 该 URL 必须可探测 (HEAD/GET → 200/206);
 *   2. 若 version.json 残留 App 端不消费的嵌套 `ios` 对象 → 判定契约错位, 失败;
 *   3. 无任何 iOS 分发声明 → 「诚实空态」, 通过 (不误报)。
 *
 * 用法:
 *   node scripts/check-ios-distribution-links.mjs                        # 探远端
 *   node scripts/check-ios-distribution-links.mjs --url <url>            # 指定 version.json
 *   node scripts/check-ios-distribution-links.mjs --file version.json    # 本地文件
 *   node scripts/check-ios-distribution-links.mjs --skip-http            # 只做结构/契约检查
 *   node scripts/check-ios-distribution-links.mjs --json                 # 机器可读输出
 *
 * 退出码: 0 通过 (含诚实空态) / 1 死链或契约错位 / 2 用法或读取失败
 */

import { readFileSync } from "node:fs";
import { extractIosDistributionLinks } from "./lib/ios-version-json.mjs";

const DEFAULT_URL = process.env.VERSION_JSON_URL || "https://xrobinai.cn/version.json";
const DEFAULT_TIMEOUT_MS = 15000;

/** HEAD 优先 (大文件不下载), 部分服务端拒绝 HEAD 时回退 Range GET。返回 HTTP 状态码。 */
export async function probeHttp(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal });
    if ([403, 405, 501].includes(res.status)) {
      res = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        redirect: "follow",
        signal,
      });
    }
    return res.status;
  } catch {
    return 0;
  }
}

/**
 * 核心判决逻辑 (与网络 I/O 解耦, 可注入 probe 以便单测)。
 *
 * @param {object} params
 * @param {unknown} params.data     version.json 解析后的对象
 * @param {boolean} [params.skipHttp] 只做结构/契约检查, 不探测 HTTP
 * @param {(url: string) => Promise<number>} [params.probe] URL → HTTP 状态码
 * @param {string} [params.source]  证据里标注的来源
 * @returns {Promise<{declared: boolean, nestedIos: boolean, failed: boolean, results: object[]}>}
 */
export async function evaluateIosDistributionLinks({ data, skipHttp = false, probe = probeHttp, source = "" }) {
  const { declared, links, nestedIos, warnings } = extractIosDistributionLinks(data);
  const results = [];
  let failed = false;

  for (const w of warnings) {
    const isContract = nestedIos && /嵌套/.test(w);
    results.push({ level: isContract ? "FAIL" : "WARN", message: w });
  }
  if (nestedIos) failed = true;

  if (skipHttp) {
    for (const { key, url } of links) {
      results.push({ level: "SKIP", key, url, message: `结构检查通过 (--skip-http, 未探测): ${key} = ${url}` });
    }
  } else {
    for (const { key, url } of links) {
      const code = await probe(url);
      const ok = code === 200 || code === 206;
      if (!ok) failed = true;
      results.push({
        level: ok ? "PASS" : "FAIL",
        key,
        url,
        status: code,
        message: `${ok ? "✓" : "✗"} ${key} → HTTP ${code}  ${url}`,
      });
    }
  }

  if (!declared && !nestedIos) {
    results.push({ level: "PASS", message: "version.json 未声明任何 iOS 分发字段 (诚实空态, 未误报)" });
  }

  return { source, declared, nestedIos, failed, results };
}

function parseArgs(argv) {
  const opts = { url: DEFAULT_URL, file: "", skipHttp: false, json: false, timeoutMs: DEFAULT_TIMEOUT_MS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") opts.url = argv[++i];
    else if (a === "--file") opts.file = argv[++i];
    else if (a === "--skip-http") opts.skipHttp = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--timeout") opts.timeoutMs = Number(argv[++i]) || DEFAULT_TIMEOUT_MS;
    else if (a === "-h" || a === "--help") opts.help = true;
    else {
      process.stderr.write(`未知参数: ${a}\n`);
      process.exit(2);
    }
  }
  return opts;
}

async function loadVersionJson(opts) {
  if (opts.file) {
    return JSON.parse(readFileSync(opts.file, "utf8"));
  }
  const res = await fetch(opts.url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`抓取 ${opts.url} 失败: HTTP ${res.status}`);
  }
  return res.json();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(
      "usage: check-ios-distribution-links.mjs [--url <url>] [--file <path>] [--skip-http] [--json] [--timeout <ms>]\n",
    );
    process.exit(0);
  }

  let data;
  try {
    data = await loadVersionJson(opts);
  } catch (err) {
    process.stderr.write(`✗ 读取 version.json 失败: ${err?.message || err}\n`);
    process.exit(2);
  }

  const verdict = await evaluateIosDistributionLinks({
    data,
    skipHttp: opts.skipHttp,
    probe: (url) => probeHttp(url, opts.timeoutMs),
    source: opts.file || opts.url,
  });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
  } else {
    process.stdout.write(`iOS 分发字段守卫 — 源: ${verdict.source}\n`);
    for (const r of verdict.results) {
      const tag = { PASS: "✓", FAIL: "✗", WARN: "⚠", SKIP: "·" }[r.level] || "-";
      process.stdout.write(`  ${tag} ${r.message}\n`);
    }
  }

  process.exit(verdict.failed ? 1 : 0);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`✗ 守卫异常: ${err?.stack || err}\n`);
    process.exit(2);
  });
}
