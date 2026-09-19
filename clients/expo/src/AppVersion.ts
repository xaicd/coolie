import Constants from "expo-constants";
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

/** 检查远端新版本（静默失败返回无更新） */
export async function checkAppVersion(
  endpoint = "https://xrobinai.cn/version.json",
): Promise<VersionCheckResult> {
  try {
    const res = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (!res.ok) return { updateAvailable: false, forceUpdate: false, info: null };
    const info = (await res.json()) as RemoteVersionInfo;
    if (!info?.version || !info?.downloadUrl) {
      return { updateAvailable: false, forceUpdate: false, info: null };
    }
    const newer = cmpVersion(info.version, localVersion()) > 0;
    const force =
      newer
      && typeof info.minSupportedVersionCode === "number"
      && localVersionCode() < info.minSupportedVersionCode;
    return { updateAvailable: newer, forceUpdate: force, info };
  } catch {
    return { updateAvailable: false, forceUpdate: false, info: null };
  }
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
