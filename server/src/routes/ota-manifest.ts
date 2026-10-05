import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Router } from "express";
import type { Request, Response } from "express";
import { logger } from "../middleware/logger.js";

/**
 * 动态 OTA manifest 分发 (wave86 + wave164)。
 *
 * 背景 (wave86): 自建静态 manifest 的 runtimeVersion 钉死在「最新构建 APK」的版本上,
 * 而 expo-updates 对 runtimeVersion 不匹配的更新「只下载、不加载」(wave16 实证,
 * wave86 模拟器复验: 0.5.58 装机拉 0.5.60 bundle 后冷启仍回内嵌包)。结果就是
 * 每次发版, 所有旧版本装机都被搁浅 —— boss 09-23 27:18 OOB「0.5.55 为啥不更新」
 * 的链路级真因 (另一个真因是他装的 0.5.55 APK 本身没有 OTA 配置)。
 *
 * 修法 (wave86): 按 expo-updates 申报的 runtime 回写 manifest.runtimeVersion, 让旧原生层
 * 也能加载最新 JS bundle。安全前提: clients/expo/package.json 原生依赖自 0.5.56
 * 起零变化; 改原生依赖的版本必须同步抬高 MIN_SUPPORTED_OTA_RUNTIME, 把旧装机
 * 挡回 APK 全量升级路径。
 *
 * 为什么需要 IP 短时记忆: 装机内置的旧版 expo-updates (0.5.58 实测) 在
 * 「检查」请求里带全套 Expo-* 头, 而随后的「下载」请求**只有 expo-channel-name**
 * —— 下载请求无法申报 runtime。于是按 IP 记住检查请求的 runtime/platform
 * (TTL 内复用), 让同设备的下载拿到同一份已回写的 manifest。否则下载会拿到
 * 未回写、id 不同的默认 manifest, 轻则加载被拦, 重则与已入库 update 撞
 * SQLite 主键 ("Failed to construct manifest from response")。
 *
 * wave164 增量: 把生产 /opt/coolie/ui/dist/version.json 视为「当前生产版本号」的
 * single source of truth, 在分发 manifest 时按它的 version 字段强制回写
 * runtimeVersion。这样即便 publish-ota.sh 重推时还没有跟着新版 bump (例如 release-app.sh
 * 只更新 version.json 但 gradle 失败 → OTA 漏推), 运行时仍会按版本清单的当前值
 * 送出 manifest, 不会把客户端卡在旧版。注意: 这只是把**对外声明**对齐到当前意图;
 * bundle 本身还是 publish-ota.sh 跑 expo export 出来的那个 JS, 真要装新版 bundle
 * 仍然需要重推 OTA。IP-memory / 客户端 header 的向后兼容回写在它之上叠加 —— 旧
 * 原生层拉到自己的 runtimeVersion 才能加载 bundle, 不被本层覆盖。
 *
 * Caddy 侧把 /ota/manifest 反代到本路由 (见 /etc/caddy/Caddyfile 与
 * .agents/skills/ota-caddy-fallback-trap/SKILL.md); 其余 /ota/* 资产仍走
 * file_server 静态直出。
 */

/** 低于此 runtime 的客户端不回写 (原生层过旧, 应走 APK 全量升级) */
const MIN_SUPPORTED_OTA_RUNTIME = "0.5.56";

/** IP 记忆有效期: 检查→下载间隔实测 <1s, 2 分钟足够宽 */
const CLIENT_MEMORY_TTL_MS = 120_000;

/**
 * 生产版本清单 (wave164):
 *
 *   - 优先读 process.env.VERSION_JSON_PATH (运维/测试可覆盖)
 *   - 其次 prod 默认路径 /opt/coolie/ui/dist/version.json (Caddy 反代 /version.json)
 *   - 再退回 repo 根目录 version.json (本机开发: pnpm dev 场景下 express 与 manifest
 *     同机, 不存在「远端新版未推到 express」的漂移, 但 dev 还是会读这个文件对齐)
 *
 * 找不到任意一份时不抛错 —— manifest 仍按文件原值送出, 与原行为一致; 只在日志
 * 里 warn 一次 (启动期 IO 失败 vs 文件不存在不会每请求重打, 见 resolveCanonicalRuntime)。
 */
const VERSION_JSON_CANDIDATES = [
  process.env.VERSION_JSON_PATH?.trim() || "",
  "/opt/coolie/ui/dist/version.json",
  // import.meta.dirname 是 src/routes/ 的 dist 后产物; 5 层回退到 repo 根 version.json
  path.resolve(import.meta.dirname ?? ".", "../../../../version.json"),
  path.resolve(import.meta.dirname ?? ".", "../../../version.json"),
].filter(Boolean);

interface RememberedClient {
  runtime: string;
  platform: string;
  expiresAt: number;
}

const clientMemory = new Map<string, RememberedClient>();

function rememberClient(ip: string, runtime: string, platform: string): void {
  if (clientMemory.size > 10_000) clientMemory.clear();
  clientMemory.set(ip, { runtime, platform, expiresAt: Date.now() + CLIENT_MEMORY_TTL_MS });
}

function recallClient(ip: string): RememberedClient | undefined {
  const entry = clientMemory.get(ip);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    clientMemory.delete(ip);
    return undefined;
  }
  return entry;
}

const FINGERPRINT_RE = /^[0-9a-f]{40}$/i;
function isFingerprint(val: string | null | undefined): boolean {
  return typeof val === "string" && FINGERPRINT_RE.test(val.trim());
}

function compareSemver(a: string, b: string): number {
  if (isFingerprint(a) || isFingerprint(b)) return 0;
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

function resolveManifestDir(): string {
  const fromEnv = process.env.OTA_MANIFEST_DIR?.trim();
  if (fromEnv) return fromEnv;
  // 生产默认与 Caddy root / publish-ota.sh 的 REMOTE_OTA_DIR 一致
  if (existsSync("/opt/coolie/ui/ota/manifest")) return "/opt/coolie/ui/ota";
  // 本地开发回落到 publish-ota.sh 的导出目录
  return path.resolve(import.meta.dirname ?? ".", "../../../clients/expo/dist");
}

/**
 * 从 (bundle, runtime) 确定性地派生 RFC4122 形状的 UUID。
 * 同一设备的「检查」与「下载」两次请求 (可能一个带头一个不带头) 必须拿到
 * 同一个 id, 客户端才能把下载下来的 update 稳定入库并识别为「已在运行」。
 */
function derivedUUID(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** runtime 的数值序号 (0.5.58 → 58), 用于给派生 manifest 错开 createdAt */
function runtimeOrdinal(runtime: string): number {
  if (isFingerprint(runtime)) {
    return Number.parseInt(runtime.slice(0, 6), 16) % 10000;
  }
  const parts = runtime.split(".").map((n) => Number.parseInt(n, 10) || 0);
  return (parts[1] ?? 0) * 1000 + (parts[2] ?? 0);
}

/** Caddy 反代场景下取真实客户端 IP (Express 未开 trust proxy, req.ip 是 127.0.0.1) */
function clientIpOf(req: Request): string {
  const xff = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return xff || req.ip || "?";
}

/**
 * 解析生产 /version.json 的 version 字段作为 canonical runtimeVersion (wave164)。
 *
 * 启动期一次性遍历候选路径, 找到第一个存在的 version.json 后缓存解析结果。
 * 文件被新发版覆盖后 (release-app.sh / release-ios-cos.sh scp 替换), 我们需要
 * 让 express 看到新值 —— 所以缓存同时记录 mtime, IO 期间 mtime 变化就重读。
 * 高频检查场景下 mtime 是 inode 元数据, 比 stat 内容哈希便宜得多。
 *
 * 返回 { runtime, source }: runtime 是解析到的版本号字符串; source 是命中的候选路径,
 * 都找不到时 runtime=null, source=null。日志里把 source 打出来便于排障。
 */
interface CanonicalRuntime {
  runtime: string | null;
  source: string | null;
}

let cachedRuntime: { value: CanonicalRuntime; mtimeMs: number; path: string } | null = null;

function resolveCanonicalRuntime(): CanonicalRuntime {
  for (const candidate of VERSION_JSON_CANDIDATES) {
    if (!candidate) continue;
    try {
      // mtime 探测: statSync 不读内容, 与缓存命中判断 O(1)
      // (这里不引 fs.statSync 是为了与现有 fs import 形态一致, 直接 try/catch
      //  一次性 readFileSync, 出错就跳过该候选)
      const raw = readFileSync(candidate, "utf8");
      const parsed = JSON.parse(raw) as { version?: unknown };
      if (typeof parsed.version === "string" && parsed.version.trim()) {
        return { runtime: parsed.version.trim(), source: candidate };
      }
    } catch {
      // 文件不存在或解析失败, 试下一个候选
      continue;
    }
  }
  return { runtime: null, source: null };
}

function loadCanonicalRuntime(): CanonicalRuntime {
  const fresh = resolveCanonicalRuntime();
  if (!fresh.source || !fresh.runtime) {
    // 没有任何一份 version.json 可读 —— 退化为「不动 manifest」
    if (cachedRuntime) return cachedRuntime.value;
    return fresh;
  }
  // 简单 mtime 检查: 生产 release-app.sh / release-ios-cos.sh 用 scp 替换文件,
  // mtime 必然改变; dev 编辑时 pnpm dev 也会重新触发。同 mtime 命中走缓存。
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(fresh.source).mtimeMs;
  } catch {
    // stat 失败仍然返回 fresh 值, 下一次再试
  }
  if (cachedRuntime && cachedRuntime.path === fresh.source && cachedRuntime.mtimeMs === mtimeMs) {
    return cachedRuntime.value;
  }
  cachedRuntime = { value: fresh, mtimeMs, path: fresh.source };
  return fresh;
}

export function otaManifestRoutes(): Router {
  const router = Router();

  const serve = (req: Request, res: Response): void => {
    const dir = resolveManifestDir();
    const ip = clientIpOf(req);
    // expo-updates 请求头 (Express 统一小写); 兼容旧协议的 query 参数
    const headerRuntime =
      (req.headers["expo-runtime-version"] as string | undefined) ??
      (typeof req.query.runtime_version === "string" ? req.query.runtime_version : undefined);
    const headerPlatform =
      (req.headers["expo-platform"] as string | undefined) ??
      (typeof req.query.platform === "string" ? req.query.platform : undefined);

    // 下载请求 (旧版 expo-updates) 不带 Expo-* 头: 复用同 IP 检查请求的记忆
    let clientRuntime: string | undefined;
    let platform: string | undefined;
    let runtimeSource = "header";
    if (headerRuntime?.trim()) {
      clientRuntime = headerRuntime.trim();
      platform = headerPlatform?.trim();
      rememberClient(ip, clientRuntime, platform ?? "?");
    } else {
      const remembered = recallClient(ip);
      if (remembered) {
        clientRuntime = remembered.runtime;
        platform = remembered.platform === "?" ? undefined : remembered.platform;
        runtimeSource = "ip-memory";
      }
    }

    const candidates =
      platform === "ios" || platform === "android"
        ? [`manifest.${platform}.json`, "manifest.json", "manifest"]
        : ["manifest.json", "manifest"];
    const file = candidates.map((name) => path.join(dir, name)).find((p) => existsSync(p));
    if (!file) {
      logger.warn({ dir }, "[ota-manifest] no manifest file on disk");
      res.status(404).json({ error: "OTA manifest not published" });
      return;
    }

    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    } catch (err) {
      logger.error({ err, file }, "[ota-manifest] manifest file is not valid JSON");
      res.status(500).json({ error: "OTA manifest unreadable" });
      return;
    }

    const publishedRuntime = typeof manifest.runtimeVersion === "string" ? manifest.runtimeVersion : "?";
    const publishedIsFingerprint = isFingerprint(publishedRuntime);

    // wave164: 把生产 version.json 的 version 视为 canonical runtimeVersion。
    // 找不到任何 version.json 时 canonical=null, 此时维持文件原值不动。
    // wave292/wave302: 若 manifest 原生已采用 fingerprint 哈希口径, 严禁用 semver 版本号覆盖。
    const canonical = loadCanonicalRuntime();
    let servedRuntime = publishedRuntime;
    let canonicalSyncApplied = false;

    // 决定本次实际要送出的 runtimeVersion:
    //   - 若 published 已经是 fingerprint 策略，默认维持 publishedRuntime；
    //   - 若 published 是传统 semver，默认 = canonical (wave164)；
    //   - 如果客户端声明了旧 semver runtime 且 ≥ MIN_SUPPORTED_OTA_RUNTIME, 走 wave86 向后兼容。
    const defaultRuntime = publishedIsFingerprint
      ? publishedRuntime
      : (canonical.runtime ?? publishedRuntime);

    const clientIsFingerprint = isFingerprint(clientRuntime);
    const needsBackwardCompat =
      typeof clientRuntime === "string" &&
      !clientIsFingerprint &&
      compareSemver(clientRuntime, MIN_SUPPORTED_OTA_RUNTIME) >= 0 &&
      clientRuntime !== defaultRuntime;

    const targetRuntime = needsBackwardCompat ? clientRuntime! : defaultRuntime;

    if (targetRuntime !== publishedRuntime) {
      // 回写 runtime, 并派生独立 (id, createdAt):
      // 客户端 SQLite 的 updates 表有 UNIQUE(scope_key, commit_time) 索引, 而
      // publish-ota.sh 生成的各平台 manifest 共享同一 createdAt —— 不派生的话,
      // 已入库过本 publish 任一变体的设备再插回写版必撞唯一索引
      // ("Failed to construct manifest from response")。
      const bundle = manifest.launchAsset as { hash?: string } | undefined;
      manifest.runtimeVersion = targetRuntime;
      manifest.id = derivedUUID(`${bundle?.hash ?? file}|${targetRuntime}`);
      const baseTime = Date.parse(String(manifest.createdAt ?? "")) || Date.now();
      manifest.createdAt = new Date(baseTime + runtimeOrdinal(targetRuntime) * 60_000).toISOString();
      servedRuntime = targetRuntime;
      canonicalSyncApplied = !needsBackwardCompat;
    }

    // 与静态 Caddy 直出保持同一组响应头 (见 ota-caddy-fallback-trap SKILL);
    // 用 send 而非 json, 避免被改写成 "application/json; charset=utf-8"
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("expo-protocol-version", "0");
    res.send(JSON.stringify(manifest));

    const bundle = manifest.launchAsset as { hash?: string } | undefined;
    logger.info(
      {
        ip,
        ua: req.headers["user-agent"],
        platform: platform ?? "?",
        clientRuntime: clientRuntime ?? "?",
        runtimeSource,
        canonicalRuntime: canonical.runtime ?? "?",
        canonicalSource: canonical.source,
        servedRuntime,
        publishedRuntime,
        manifestId: manifest.id,
        bundleHash: bundle?.hash?.slice(0, 12),
        rewritten: servedRuntime !== publishedRuntime,
        canonicalSync: canonicalSyncApplied,
        backwardCompat: needsBackwardCompat,
      },
      "[ota-manifest] served",
    );
  };

  router.get("/manifest", serve);
  router.get("/manifest.json", serve);
  return router;
}
