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
  // android.versionCode 由原生 BuildConfig/expoConfig 提供；退化用版本字符串
  const c = Constants as Record<string, any>;
  const cand =
    c.platform?.android?.versionCode ??
    c.nativeBuildVersion ??
    c.expoConfig?.android?.versionCode ??
    c.manifest?.androidConfig?.versionCode ??
    c.manifest2?.extra?.expoClient?.android?.versionCode;
  const fromNative = Number(cand);
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

const FINGERPRINT_RE = /^[0-9a-f]{40}$/i;
function isFingerprint(val: string | null | undefined): boolean {
  return typeof val === "string" && FINGERPRINT_RE.test(val.trim());
}

/**
 * 比较本机原生 runtime 与远端 OTA manifest 的 runtimeVersion。
 *   本机 == 远端 → 视为「完全兼容/已是最新」(native 能无缝加载现网 bundle, 优先走静默 OTA)
 *   本机 >= 远端 (semver) → 视为「已是最新」(native 已能加载现网 bundle)
 *   本机 != 远端 (fingerprint) → 发生原生断代，必须整包升级 APK
 *
 * wave302 / wave360 修复:
 * 1. 无论是 fingerprint 还是 semver，只要两端完全一致，即代表原生环境完全对齐，返回 true 允许 OTA 接管。
 * 2. 只有当 fingerprint 不匹配时才判定无法 OTA（返回 false），迫使整包升级。
 * 3. 双方均为标准 semver 时，按 cmpVersion 比较大小。
 */
export function isNativeAheadOfManifest(nativeRuntime: string | null, manifestRuntime: string | null): boolean {
  if (!nativeRuntime || !manifestRuntime) return false;
  if (nativeRuntime.trim() === manifestRuntime.trim()) {
    return true;
  }
  if (isFingerprint(nativeRuntime) || isFingerprint(manifestRuntime)) {
    return false;
  }
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

/** 检查是否需要整包下载升级 APK/原生包（静默失败返回无更新）。
 *
 * 核心设计契约 (wave360 极简人机工程学):
 * 1. 本地原生装机包 versionCode 已追平或超前远端 info.versionCode 时，绝对判定为无更新，彻底根除刚装完新包仍弹升级提示的严重负体验。
 * 2. 远端 minSupportedVersionCode 强制原生断代时，触发 forceUpdate。
 * 3. 远端有更高版本时，优先感知 OTA 能力：若设备支持 OTA 且原生 runtimeVersion 与远端 OTA manifest 对齐，
 *    则升级由后台静默 OTA 接管，绝不弹窗打扰用户去浏览器下载 80MB 的整包 APK！
 * 4. 只有在 OTA 未启用、或 OTA 原生运行时断代无法热更时，才展示整包 APK 升级卡片。
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

  const localCode = localVersionCode();
  const localVer = localVersion();

  // 1. 本地原生 versionCode 已大于等于远端发布包 versionCode：说明本地装机包已是最新的，绝对不弹 APK 升级
  if (typeof info.versionCode === "number" && localCode >= info.versionCode) {
    return { updateAvailable: false, forceUpdate: false, info };
  }

  // 2. 远端强制最低版本限制：本地低于 minSupportedVersionCode 必须整包强制升级
  if (
    typeof info.minSupportedVersionCode === "number" &&
    localCode < info.minSupportedVersionCode
  ) {
    return { updateAvailable: true, forceUpdate: true, info };
  }

  // 3. 远端版本号字符串比对
  const newerByJson = cmpVersion(info.version, localVer) > 0;
  if (!newerByJson) {
    return { updateAvailable: false, forceUpdate: false, info };
  }

  // 4. 若启用了 OTA，优先检查远端 OTA manifest 能否覆盖此次更新
  //    如果本机原生 runtime 与远端 OTA manifest 对齐（isNativeAheadOfManifest 为 true），
  //    则该更新可通过静默 OTA 增量完成，无需打扰用户去浏览器下载整包 APK！
  if (Updates.isEnabled) {
    try {
      const manifestUrl = (Constants.expoConfig as { updates?: { url?: string } } | undefined)
        ?.updates?.url;
      if (manifestUrl) {
        const headers: Record<string, string> = { "expo-channel-name": "production" };
        const rt = nativeRuntimeVersion();
        if (rt) headers["expo-runtime-version"] = rt;
        const res = await fetch(manifestUrl, { headers });
        if (res.ok) {
          const m = (await res.json()) as { runtimeVersion?: string };
          if (typeof m.runtimeVersion === "string") {
            const otaCapable = isNativeAheadOfManifest(nativeRuntimeVersion(), m.runtimeVersion);
            if (otaCapable) {
              // OTA 能够无缝热更此版本，压制整包 APK 弹窗
              return { updateAvailable: false, forceUpdate: false, info };
            }
          }
        }
      }
    } catch {
      // manifest 拉取异常时，降级按纯 version.json 判定
    }
  }

  // 5. OTA 未启用，或原生 runtimeVersion 不匹配（发生了原生代码断代），必须整包下载 APK
  return { updateAvailable: true, forceUpdate: false, info };
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
