#!/usr/bin/env node
/**
 * scripts/lib/ios-version-json.mjs
 *
 * version.json 的 iOS 分发字段**唯一契约源**。
 *
 * 背景 (COOA-470): scripts/release-ios-cos.sh --register 曾把 iOS 信息写成**嵌套**
 * `ios` 对象, 而 App 端 (clients/expo/src/AppVersion.ts / App.tsx) 只消费**顶层扁平**
 * `ios*` 字段 ⇒ 契约错位: 自动回填的产物 App 端永远解析不出 iOS 下载入口, 且无任何报错。
 *
 * 契约 (与 AppVersion.ts 的 RemoteVersionInfo 逐字段对齐):
 *   App 消费的字段  : iosDownloadUrl / iosSha256 / iosBundleId / iosTestFlightUrl
 *   脚本附带信息字段: iosManifestUrl / iosInstallUrl / iosQrUrl / iosSizeBytes
 *                     (ad-hoc 扫码直装信息, App 当前不消费, 但保留以免信息丢失)
 * 历史遗留的嵌套 `ios` 对象 (App 端从不读取) 一律移除。
 *
 * 本模块被 3 处共用, 保证契约单一真源:
 *   1. scripts/release-ios-cos.sh  (回填 version.json)
 *   2. scripts/check-ios-distribution-links.mjs (死链/契约守卫)
 *   3. scripts/lib/ios-version-json.test.mjs    (单测 + 与 AppVersion.ts 对齐断言)
 */

/** App 端 (AppVersion.ts) 真正消费的字段 —— 改动前必须同步 App 端类型。 */
export const IOS_APP_FIELDS = [
  "iosDownloadUrl",
  "iosSha256",
  "iosBundleId",
  "iosTestFlightUrl",
];

/** 脚本附带信息字段 (App 当前不消费, 保留以免信息丢失)。 */
export const IOS_INFO_FIELDS = [
  "iosManifestUrl",
  "iosInstallUrl",
  "iosQrUrl",
  "iosSizeBytes",
];

export const IOS_FLAT_FIELDS = [...IOS_APP_FIELDS, ...IOS_INFO_FIELDS];

/**
 * 需要 HTTP 探测的字段。`iosInstallUrl` 是 `itms-services://` 深链 (非 HTTP),
 * 无法直接 curl, 故不在其中。
 */
export const IOS_HTTP_FIELDS = [
  "iosDownloadUrl",
  "iosTestFlightUrl",
  "iosManifestUrl",
  "iosQrUrl",
];

/**
 * 把本次 iOS 发布产物合并进 version.json 的既有内容。
 * - 保留无关字段 (android 字段 / iosTestFlightUrl 等);
 * - 移除历史遗留的嵌套 `ios` 对象 (契约统一为顶层扁平 ios* 字段);
 * - 只写入本次真正产出的 ios* 字段。
 *
 * @param {unknown} existing 既有 version.json 对象
 * @param {object} fields { downloadUrl, sha256, bundleId, manifestUrl, installUrl, qrUrl, sizeBytes }
 * @returns {Record<string, unknown>}
 */
export function mergeIosVersionJson(existing, fields = {}) {
  const data =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};

  // 迁移: 旧的嵌套 ios 对象 (App 从不消费) 与扁平字段并存会造成契约歧义。
  delete data.ios;

  const { downloadUrl, sha256, bundleId, manifestUrl, installUrl, qrUrl, sizeBytes } = fields;
  if (downloadUrl) data.iosDownloadUrl = String(downloadUrl);
  if (sha256) data.iosSha256 = String(sha256);
  if (bundleId) data.iosBundleId = String(bundleId);
  if (manifestUrl) data.iosManifestUrl = String(manifestUrl);
  if (installUrl) data.iosInstallUrl = String(installUrl);
  if (qrUrl) data.iosQrUrl = String(qrUrl);
  const size = Number(sizeBytes);
  if (Number.isFinite(size) && size > 0) data.iosSizeBytes = size;

  return data;
}

/**
 * 从 version.json 提取所有"声明了"的 iOS 分发链接, 供死链守卫探测。
 *
 * - `null` / 空串视为「未声明」(诚实的空态, 例如尚未发 iOS 包);
 * - 非 http(s) 值 (如 itms-services:// ) 记录警告并跳过探测;
 * - 检测到嵌套 `ios` 对象即视为契约错位 (`nestedIos: true`) —— 这正是 COOA-470 的缺陷形态。
 *
 * @param {unknown} data version.json 解析后的对象
 * @returns {{ declared: boolean, links: {key: string, url: string}[], nestedIos: boolean, warnings: string[] }}
 */
export function extractIosDistributionLinks(data) {
  const warnings = [];
  const links = [];
  let nestedIos = false;

  const obj =
    data && typeof data === "object" && !Array.isArray(data) ? data : {};

  if (obj.ios !== undefined) {
    nestedIos = true;
    warnings.push(
      "version.json 含嵌套 `ios` 对象 —— App 端 (AppVersion.ts) 只认顶层扁平 ios* 字段, 嵌套形态永不被消费 (COOA-470 契约错位)",
    );
  }

  for (const key of IOS_HTTP_FIELDS) {
    const val = obj[key];
    if (val === undefined || val === null || val === "") continue;
    if (typeof val !== "string") {
      warnings.push(`${key} 非字符串 (${typeof val}), 已忽略`);
      continue;
    }
    if (!/^https?:\/\//i.test(val)) {
      warnings.push(`${key} 非 http(s) URL, 跳过探测: ${val}`);
      continue;
    }
    links.push({ key, url: val });
  }

  return { declared: links.length > 0, links, nestedIos, warnings };
}

// ── CLI: merge <path> --download-url ... --sha256 ... ────────────────────────
function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    flags[token.slice(2)] = argv[i + 1];
    i++;
  }
  return flags;
}

async function main() {
  const sub = process.argv[2];
  if (sub !== "merge") {
    process.stderr.write(
      "usage: node scripts/lib/ios-version-json.mjs merge <version.json> " +
        "--download-url <url> --sha256 <hex> --bundle-id <id> " +
        "[--manifest-url <url>] [--install-url <url>] [--qr-url <url>] [--size-bytes <n>]\n",
    );
    process.exit(2);
  }

  const path = process.argv[3];
  if (!path) {
    process.stderr.write("merge: 缺少 version.json 路径\n");
    process.exit(2);
  }
  const flags = parseFlags(process.argv.slice(4));

  const fs = await import("node:fs");
  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (err) {
    if (err && err.code === "ENOENT") {
      existing = {};
    } else {
      process.stderr.write(`merge: 读取/解析 ${path} 失败: ${err.message}\n`);
      process.exit(2);
    }
  }

  const merged = mergeIosVersionJson(existing, {
    downloadUrl: flags["download-url"],
    sha256: flags["sha256"],
    bundleId: flags["bundle-id"],
    manifestUrl: flags["manifest-url"],
    installUrl: flags["install-url"],
    qrUrl: flags["qr-url"],
    sizeBytes: flags["size-bytes"],
  });

  fs.writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(merged, null, 2)}\n`);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`merge: ${err?.stack || err}\n`);
    process.exit(2);
  });
}
