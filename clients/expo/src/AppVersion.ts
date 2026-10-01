import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Linking } from "react-native";

/** 生产版本清单 — xrobinai.cn/version.json */
export interface RemoteVersionInfo {
  version: string;
  versionCode: number;
  downloadUrl: string;
  /** 低于此 versionCode 只能强制升级 */
  minSupportedVersionCode?: number;
  releaseNotes?: string;
  sha256?: string;
  // ── iOS (version.json 顶层扁平字段, 非嵌套) ──────────────────────────────
  /** iOS 直装 .ipa 直链 */
  iosDownloadUrl?: string;
  /** iOS bundle id (cn.xrobinai.app) */
  iosBundleId?: string;
  /** iOS .ipa sha256 */
  iosSha256?: string;
  /** TestFlight 公开链接；App Store Connect 建档前为 null */
  iosTestFlightUrl?: string | null;
}

export function localVersion(): string {
  return Constants.expoConfig?.version ?? "0.0.0";
}

export function localVersionCode(): number {
  // android.versionCode 由原生 BuildConfig 提供；退化用版本字符串
  const native = (Constants as Record<string, any>).manifest?.androidConfig?.versionCode;
  const fromNative = Number(native);
  if (Number.isFinite(fromNative) && fromNative > 0) return fromNative;
  const parts = localVersion().split(".").map((p) => parseInt(p, 10) || 0);
  return parts[0] * 10000 + parts[1] * 100 + parts[2];
}

/**
 * 装机 APK 的原生运行时版本 (EXPO_RUNTIME_VERSION), 由 expo-updates 在原生层
 * 读 AndroidManifest meta-data。运行时不变, 是判断「本机原生层是否已经追平远端
 * manifest」的唯一可信字段 (Constants.expoConfig.version 在 OTA 加载后会被
 * manifest extra.expoClient.version 覆盖, 不可作 native 真值)。
 *
 * 未启用 OTA (开发宿主) 时返回 null。
 */
export function nativeRuntimeVersion(): string | null {
  return Updates.isEnabled ? Updates.runtimeVersion ?? null : null;
}

/**
 * 比较本机原生 runtime 与远端 OTA manifest 的 runtimeVersion。
 *   本机 >= 远端 → 视为「已是最新」(native 已能加载现网 bundle, 无意义再升)
 *   本机 < 远端  → 远端声明更新 (但仅作信号, 不在本函数内触发下载)
 *
 * 真值示例 (wave243): 老板真机 native=0.6.10 (wave239 bump 608→610), 远端
 * manifest 旧版本停留在 0.6.8 → native ≥ remote → 不应再显示「升级」按钮。
 * 旧实现只用 Constants.expoConfig.version 与 version.json 比, 看不到 native 已
 * bump 过的真实情况, 把已升过级的老板又当成「待升级」。
 */
export function isNativeAheadOfManifest(nativeRuntime: string | null, manifestRuntime: string | null): boolean {
  if (!nativeRuntime || !manifestRuntime) return false;
  return cmpVersion(nativeRuntime, manifestRuntime) >= 0;
}

function cmpVersion(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

export interface VersionCheckResult {
  updateAvailable: boolean;
  forceUpdate: boolean;
  info: RemoteVersionInfo | null;
}

const DEFAULT_VERSION_ENDPOINT = "https://xrobinai.cn/version.json";

/** 原始拉取 version.json；任何失败返回 null（调用方按「无更新」处理） */
async function requestVersionJson(endpoint: string): Promise<RemoteVersionInfo | null> {
  try {
    const res = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const info = (await res.json()) as RemoteVersionInfo;
    if (!info?.version || !info?.downloadUrl) return null;
    return info;
  } catch {
    return null;
  }
}

let cachedVersionJson: Promise<RemoteVersionInfo | null> | null = null;

/**
 * version.json 拉取（默认端点进程内缓存）。App 启动时预热一次，之后
 * HomeScreen 的升级检查 / AppUpdateCard 直接复用，不再重复打网络。
 */
export function fetchVersionJson(): Promise<RemoteVersionInfo | null> {
  cachedVersionJson ??= requestVersionJson(DEFAULT_VERSION_ENDPOINT);
  return cachedVersionJson;
}

/** 检查远端新版本（静默失败返回无更新）。
 *
 * wave243 增量: 本机原生 runtime (Updates.runtimeVersion) 已 ≥ 远端 OTA
 * manifest 的 runtimeVersion 时, 即便 version.json 的 version 字符串更高
 * (常见于 OTA 跟 APK bump 抢跑 — 远端 manifest 还没重推), 也按「无更新」处理,
 * 不显示升级提示卡。native 已是 upgrade 卡的真值边界 (boss 09-30 实测:
 * 装了 0.6.10 真机被提示升级到 0.6.8, 因为 Constants.expoConfig.version
 * 在 OTA 加载后被回写成 0.6.8, 而 version.json 同样是 0.6.8; 升级链路看
 * 不到 native 0.6.10 已 bump 这一事实)。
 */
export async function checkAppVersion(
  endpoint = DEFAULT_VERSION_ENDPOINT,
): Promise<VersionCheckResult> {
  const info = await (endpoint === DEFAULT_VERSION_ENDPOINT
    ? fetchVersionJson()
    : requestVersionJson(endpoint));
  if (!info) {
    return { updateAvailable: false, forceUpdate: false, info: null };
  }
  // 先按 version.json 算是否有新版 (旧逻辑); 再用 OTA manifest 做 native
  // 边界压制 — 两个信号都允许「已是最新」才算无更新。
  const newerByJson = cmpVersion(info.version, localVersion()) > 0;
  let nativeAhead = false;
  if (newerByJson) {
    try {
      const manifestUrl = (Constants.expoConfig as { updates?: { url?: string } } | undefined)
        ?.updates?.url;
      if (manifestUrl) {
        const res = await fetch(manifestUrl, {
          headers: { "expo-channel-name": "production" },
        });
        if (res.ok) {
          const m = (await res.json()) as { runtimeVersion?: string };
          if (typeof m.runtimeVersion === "string") {
            nativeAhead = isNativeAheadOfManifest(nativeRuntimeVersion(), m.runtimeVersion);
          }
        }
      }
    } catch {
      // manifest 拉不到时回退到纯 version.json 判断 (旧行为)
    }
  }
  const newer = newerByJson && !nativeAhead;
  const force =
    newer
    && typeof info.minSupportedVersionCode === "number"
    && localVersionCode() < info.minSupportedVersionCode;
  return { updateAvailable: newer, forceUpdate: force, info };
}

/** 拉起系统下载（浏览器/APK 安装器接管） */
export async function downloadApk(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
