#!/usr/bin/env node
/**
 * OTA 运行时版本的唯一口径 (single source of truth)。
 *
 * expo-updates 加载一份已下载的 bundle 前会比对「运行时的 version」和
 * manifest 里的 runtimeVersion；对不上就只下载、不加载（老板看到的「下了不装」）。
 * 同一个值必须同时在三处成立，缺一处就漂移：
 *
 *   1. app.json 声明的意图        (runtimeVersion.policy=appVersion → expo.version)
 *   2. 装机 APK 内嵌的原生值       AndroidManifest 里的
 *                                 expo.modules.updates.EXPO_RUNTIME_VERSION
 *   3. 生产 /ota/manifest 的 runtimeVersion
 *
 * 这个模块就是「怎么从 1 推导出 2/3」的唯一实现 —— 漂移之所以发生，正是因为没有
 * 单一口径：0.5.7 的 APK 里钉的是 0.5.5，而 manifest 按 app.json 声称 0.5.7。
 *
 * 用法:
 *   node runtime-version.mjs                  # 已发布 manifest 应采用的值
 *                                             #   (有 APK 读 APK 真值, 否则回落 app.json 意图)
 *   node runtime-version.mjs --app-json       # app.json 的意图值
 *   node runtime-version.mjs --apk [PATH]     # APK 内嵌的原生值 (aapt2)
 *   node runtime-version.mjs --native-manifest PATH   # 源码 AndroidManifest.xml 的值
 *   node runtime-version.mjs --json           # { intent, apk, resolved, source, agrees }
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const EXPO_DIR = resolve(HERE, "..");
export const APP_JSON = resolve(EXPO_DIR, "app.json");
export const DEFAULT_APK = resolve(
  EXPO_DIR,
  "android/app/build/outputs/apk/release/app-release.apk",
);
export const NATIVE_MANIFEST = resolve(
  EXPO_DIR,
  "android/app/src/main/AndroidManifest.xml",
);

const RUNTIME_META = "expo.modules.updates.EXPO_RUNTIME_VERSION";

export function readAppJson(path = APP_JSON) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * 纯函数：app.json 声明的意图值。
 *
 * policy=appVersion 是「运行时=版本号」的显式声明；字面量则原样返回。
 * 其它 policy（nativeVersion/fingerprint/custom）本 App 不使用 —— 猜测会制造出
 * 正是本模块要消除的那种静默漂移，所以这里直接报错而不是硬塞一个值。
 */
export function resolveIntent(expo) {
  const version = expo?.version;
  if (!version) throw new Error("app.json 缺少 expo.version");
  const rv = expo.runtimeVersion;
  if (rv === undefined || rv === null) return version;
  if (typeof rv === "string") return rv;
  if (typeof rv === "object" && typeof rv.policy === "string") {
    if (rv.policy === "appVersion") return version;
    throw new Error(`不支持的 expo.runtimeVersion.policy: ${rv.policy}`);
  }
  throw new Error("无法识别的 expo.runtimeVersion 形态");
}

/** app.json 的 runtimeVersion 是否以「跟随版本号」的方式声明。 */
export function runtimeTracksVersion(expo) {
  const rv = expo?.runtimeVersion;
  if (rv === undefined || rv === null) return true;
  if (typeof rv === "string") return false;
  return typeof rv === "object" && rv.policy === "appVersion";
}

function compareVersionsDesc(a, b) {
  const pa = a.split(/[._-]/).map(Number);
  const pb = b.split(/[._-]/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pb[i] || 0) - (pa[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** 找到一台可用的 aapt2：显式 AAPT2 → 各 SDK 根下最新 build-tools → PATH。 */
export function findAapt2(env = process.env) {
  if (env.AAPT2 && existsSync(env.AAPT2)) return env.AAPT2;
  const home = env.HOME || "";
  const roots = [
    env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT,
    home ? resolve(home, "android-sdk") : null,
    home ? resolve(home, "Library/Android/sdk") : null,
  ].filter(Boolean);
  for (const root of roots) {
    const buildTools = resolve(root, "build-tools");
    if (!existsSync(buildTools)) continue;
    for (const v of readdirSync(buildTools).sort(compareVersionsDesc)) {
      const candidate = resolve(buildTools, v, "aapt2");
      if (existsSync(candidate)) return candidate;
    }
  }
  try {
    const found = execFileSync("sh", ["-c", "command -v aapt2"], {
      encoding: "utf8",
    }).trim();
    return found || null;
  } catch {
    return null;
  }
}

const VALUE_RE = /android:value\(0x[0-9a-f]+\)="([^"]*)"/;

/**
 * 从 aapt2 dump xmltree 输出里取 EXPO_RUNTIME_VERSION 的值。
 *
 * 注：这条路径只读得到字面字符串值。expo-updates 会把 EXPO_RUNTIME_VERSION 编译成
 * Android string resource（meta-data 里是 `@0x7f...` 形式的资源引用，不是字面值），
 * 因此单靠 xmltree 永远读到 null。生产读 APK 一律走 parseApkResources（dump resources）。
 * 这个函数保留下来只为调试「manifest 里到底写了什么」。
 */
export function parseApkXmltree(xml) {
  const lines = xml.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes(RUNTIME_META)) continue;
    // name / value 各占一行；value 跟在 name 之后（少数版本会同行）。
    for (let j = i; j < Math.min(i + 4, lines.length); j += 1) {
      const match = lines[j].match(VALUE_RE);
      if (match) return match[1];
    }
  }
  return null;
}

/**
 * 资源表里 string/<name> 那一段的起始正则。
 *
 * 例:
 *     resource 0x7f120082 string/expo_runtime_version
 *       () "0.5.56"
 */
const RESOURCE_HEADER_RE = /^\s*resource\s+0x[0-9a-fA-F]+\s+string\/([\w.]+)\s*$/;
/** 单条 (config) "value" 行；config 可以为空（默认），value 不含转义双引号。 */
const RESOURCE_VALUE_RE = /^\s*\(([^)]*)\)\s+"([^"]*)"\s*$/;

/**
 * 从 aapt2 dump resources 输出里取 string/<name> 的资源值。
 *
 * 优先 default config（`()` —— 空括号），否则取第一条非空字符串值。
 * 资源名直接拼死（不写 `@0x7f...` 的 id 反查），是因为 expo-updates 把
 * `EXPO_RUNTIME_VERSION` 编译进 resources.arsc 时用的资源名就是字符串 `expo_runtime_version`，
 * 写死比 xmltree+dump 两步走更稳。
 */
export function parseApkResources(resources, name) {
  if (!resources || !name) return null;
  const lines = resources.split("\n");
  let inBlock = false;
  let firstValue = null;
  for (const line of lines) {
    const header = line.match(RESOURCE_HEADER_RE);
    if (header) {
      if (inBlock) break;
      if (header[1] === name) inBlock = true;
      continue;
    }
    if (!inBlock) continue;
    const value = line.match(RESOURCE_VALUE_RE);
    if (!value) {
      if (line.trim() === "") continue;
      if (/^\s*resource\s+0x/.test(line)) break;
      continue;
    }
    const [, config, val] = value;
    if (val === "") continue;
    if (config === "") return val;
    if (firstValue === null) firstValue = val;
  }
  return firstValue;
}

/** 读装机 APK 内嵌的原生运行时版本；不可读（无 APK/无 aapt2/无 meta-data）返回 null。 */
export function readApkRuntimeVersion(apkPath = DEFAULT_APK, env = process.env) {
  if (!apkPath || !existsSync(apkPath)) return null;
  const aapt2 = findAapt2(env);
  if (!aapt2) return null;
  const resources = execFileSync(
    aapt2,
    ["dump", "resources", apkPath],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return parseApkResources(resources, "expo_runtime_version");
}

const SOURCE_ELEMENT_RE = /<meta-data\b[^>]*\/?>/g;

/** 读源码 AndroidManifest.xml 里该 meta-data 的值（构建前检查/断言用）。 */
export function readNativeManifestRuntimeVersion(path = NATIVE_MANIFEST) {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  for (const elem of text.match(SOURCE_ELEMENT_RE) || []) {
    if (!elem.includes(`android:name="${RUNTIME_META}"`)) continue;
    const match = elem.match(/android:value="([^"]*)"/);
    if (match) return match[1];
  }
  return null;
}

/**
 * 已发布 manifest 应采用的 runtimeVersion。
 *
 * 以装机 APK 的原生值为准：manifest 必须迁就「用户设备实际报告的运行时」，
 * 否则 bundle 会被下了不加载。没有可读 APK 时回落 app.json 的意图值。
 */
export function resolvePublished({ apkPath = DEFAULT_APK, env = process.env } = {}) {
  const intent = resolveIntent(readAppJson().expo);
  const apk = readApkRuntimeVersion(apkPath, env);
  return {
    intent,
    apk,
    resolved: apk ?? intent,
    source: apk ? "apk" : "app.json",
    agrees: apk === null || apk === intent,
    apkPath,
  };
}

/** 把 --flag=PATH / --flag PATH 两种写法都吃下。 */
function flagValue(args, name) {
  const inline = args.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const i = args.indexOf(name);
  if (i >= 0) {
    const next = args[i + 1];
    if (next && !next.startsWith("--")) return next;
  }
  return undefined;
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--json")) {
    console.log(JSON.stringify(resolvePublished(), null, 2));
    return;
  }

  if (args.includes("--app-json")) {
    console.log(resolveIntent(readAppJson().expo));
    return;
  }

  if (args.includes("--native-manifest")) {
    const path = flagValue(args, "--native-manifest") || NATIVE_MANIFEST;
    const value = readNativeManifestRuntimeVersion(path);
    if (!value) {
      console.error(`✗ 在 ${path} 里读不到 ${RUNTIME_META}`);
      process.exit(1);
    }
    console.log(value);
    return;
  }

  if (args.includes("--apk")) {
    const path = flagValue(args, "--apk") || DEFAULT_APK;
    const value = readApkRuntimeVersion(path);
    if (!value) {
      console.error(`✗ 读不到 ${path} 的 ${RUNTIME_META}（APK 不存在或缺 aapt2）`);
      process.exit(1);
    }
    console.log(value);
    return;
  }

  const result = resolvePublished({ apkPath: flagValue(args, "--apk") || DEFAULT_APK });
  if (result.source === "app.json") {
    console.error(`· 无可用 APK (${result.apkPath})，回落 app.json 意图值 ${result.intent}`);
  } else if (!result.agrees) {
    console.error(
      `⚠ APK 原生运行时 ${result.apk} ≠ app.json 意图 ${result.intent}；` +
        `manifest 采用 APK 真值 ${result.resolved}（重建 APK 才能对齐）`,
    );
  }
  console.log(result.resolved);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
