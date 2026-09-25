import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Router } from "express";
import type { Request, Response } from "express";
import { logger } from "../middleware/logger.js";

/**
 * 动态 OTA manifest 分发 (wave86)。
 *
 * 背景: 自建静态 manifest 的 runtimeVersion 钉死在「最新构建 APK」的版本上,
 * 而 expo-updates 对 runtimeVersion 不匹配的更新「只下载、不加载」(wave16 实证,
 * wave86 模拟器复验: 0.5.58 装机拉 0.5.60 bundle 后冷启仍回内嵌包)。结果就是
 * 每次发版, 所有旧版本装机都被搁浅 —— boss 09-23 27:18 OOB「0.5.55 为啥不更新」
 * 的链路级真因 (另一个真因是他装的 0.5.55 APK 本身没有 OTA 配置)。
 *
 * 修法: 按 expo-updates 申报的 runtime 回写 manifest.runtimeVersion, 让旧原生层
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
 * Caddy 侧把 /ota/manifest 反代到本路由 (见 /etc/caddy/Caddyfile 与
 * .agents/skills/ota-caddy-fallback-trap/SKILL.md); 其余 /ota/* 资产仍走
 * file_server 静态直出。
 */

/** 低于此 runtime 的客户端不回写 (原生层过旧, 应走 APK 全量升级) */
const MIN_SUPPORTED_OTA_RUNTIME = "0.5.56";

/** IP 记忆有效期: 检查→下载间隔实测 <1s, 2 分钟足够宽 */
const CLIENT_MEMORY_TTL_MS = 120_000;

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

function compareSemver(a: string, b: string): number {
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
  const parts = runtime.split(".").map((n) => Number.parseInt(n, 10) || 0);
  return (parts[1] ?? 0) * 1000 + (parts[2] ?? 0);
}

/** Caddy 反代场景下取真实客户端 IP (Express 未开 trust proxy, req.ip 是 127.0.0.1) */
function clientIpOf(req: Request): string {
  const xff = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return xff || req.ip || "?";
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
    let servedRuntime = publishedRuntime;
    if (
      typeof clientRuntime === "string" &&
      compareSemver(clientRuntime, MIN_SUPPORTED_OTA_RUNTIME) >= 0 &&
      clientRuntime !== publishedRuntime
    ) {
      // 回写 runtime, 并派生独立 (id, createdAt):
      // 客户端 SQLite 的 updates 表有 UNIQUE(scope_key, commit_time) 索引, 而
      // publish-ota.sh 生成的各平台 manifest 共享同一 createdAt —— 不派生的话,
      // 已入库过本 publish 任一变体的设备再插回写版必撞唯一索引
      // ("Failed to construct manifest from response")。
      const bundle = manifest.launchAsset as { hash?: string } | undefined;
      manifest.runtimeVersion = clientRuntime;
      manifest.id = derivedUUID(`${bundle?.hash ?? file}|${clientRuntime}`);
      const baseTime = Date.parse(String(manifest.createdAt ?? "")) || Date.now();
      manifest.createdAt = new Date(baseTime + runtimeOrdinal(clientRuntime) * 60_000).toISOString();
      servedRuntime = clientRuntime;
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
        servedRuntime,
        publishedRuntime,
        manifestId: manifest.id,
        bundleHash: bundle?.hash?.slice(0, 12),
        rewritten: servedRuntime !== publishedRuntime,
      },
      "[ota-manifest] served",
    );
  };

  router.get("/manifest", serve);
  router.get("/manifest.json", serve);
  return router;
}
