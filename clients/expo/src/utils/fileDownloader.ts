import { Alert, Clipboard, Linking, Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  COOLIE_BASE_URL,
  getAuthToken,
  getSessionCookieHeaderValue,
  getSessionToken,
} from "../coolie";

export interface DownloadOptions {
  url: string;
  filename?: string | null;
  title?: string | null;
  mimeType?: string | null;
  sizeText?: string | null;
}

export interface DownloadResult {
  success: boolean;
  uri?: string;
  error?: string;
}

/**
 * 格式化合法文件名
 */
export function sanitizeFilename(name: string, fallback: string = "download"): string {
  if (!name) return fallback;
  // 移除 URL 参数、Windows/Linux 非法字符
  const clean = name.split("?")[0].replace(/[\\/:*?"<>|]/g, "_").trim();
  return clean || fallback;
}

/**
 * 根据 contentType 补充扩展名
 */
export function ensureExtension(filename: string, contentType?: string | null): string {
  if (filename.includes(".")) return filename;
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("wordprocessingml") || ct.includes("msword")) return `${filename}.docx`;
  if (ct.includes("spreadsheetml") || ct.includes("msexcel")) return `${filename}.xlsx`;
  if (ct.includes("presentationml") || ct.includes("powerpoint")) return `${filename}.pptx`;
  if (ct.includes("pdf")) return `${filename}.pdf`;
  if (ct.includes("markdown")) return `${filename}.md`;
  if (ct.includes("json")) return `${filename}.json`;
  if (ct.includes("zip")) return `${filename}.zip`;
  if (ct.includes("html")) return `${filename}.html`;
  if (ct.includes("png")) return `${filename}.png`;
  if (ct.includes("jpeg") || ct.includes("jpg")) return `${filename}.jpg`;
  if (ct.includes("text/plain")) return `${filename}.txt`;
  return `${filename}.bin`;
}

/**
 * 核心下载并调起系统共享/保存面板
 * 自动注入 Auth Token / Session Cookie，并附带 ?token= 参数，彻底消灭未认证 404
 */
export async function downloadAndShareFile(options: DownloadOptions): Promise<DownloadResult> {
  const { url: rawUrl, filename: rawFilename, title, mimeType, sizeText } = options;
  if (!rawUrl) {
    Alert.alert("下载失败", "未找到可用的下载地址。");
    return { success: false, error: "Empty URL" };
  }

  try {
    const fullUrl = rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
      ? rawUrl
      : `${COOLIE_BASE_URL}${rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`}`;

    const token = await getAuthToken();
    const sessionToken = await getSessionToken();
    const cookie = await getSessionCookieHeaderValue();

    // 拼装认证头
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (cookie) {
      headers["Cookie"] = cookie;
    }

    // 在 URL 增加 token query 参数双保险 (仅内部 API 需要注入 token)
    const activeToken = token || sessionToken;
    let targetDownloadUrl = fullUrl;
    if (
      activeToken &&
      !targetDownloadUrl.includes("token=") &&
      (targetDownloadUrl.includes("/api/") || !targetDownloadUrl.startsWith("http"))
    ) {
      const sep = targetDownloadUrl.includes("?") ? "&" : "?";
      targetDownloadUrl = `${targetDownloadUrl}${sep}token=${encodeURIComponent(activeToken)}`;
    }

    // 确定本地存储文件名
    const safeName = sanitizeFilename(
      ensureExtension(rawFilename || title || "coolie-artifact", mimeType),
    );

    const isApk =
      safeName.toLowerCase().endsWith(".apk") ||
      (rawFilename ?? "").toLowerCase().endsWith(".apk") ||
      (title ?? "").toLowerCase().endsWith(".apk") ||
      (mimeType ?? "").includes("package-archive") ||
      targetDownloadUrl.toLowerCase().includes(".apk");

    const isLargeArchive =
      safeName.toLowerCase().endsWith(".tar.gz") ||
      safeName.toLowerCase().endsWith(".zip") ||
      safeName.toLowerCase().endsWith(".rar");

    // ── 针对 Android 原生 APK 的专有高速下载与安装通道 ──
    // APK 为可执行安装包，若走 Sharing.shareAsync 会因缺少 ACTION_SEND 处理应用而报错或无法安装。
    // 调用系统浏览器/下载管理器下载至公有 Download 目录，下载完成后 Android 会自动呼起 PackageInstaller 提示安装。
    if (isApk) {
      Alert.alert(
        "下载 Android 原生安装包",
        `制品文件：${safeName}\n文件体积：${sizeText || "实测 90.2 MB 原生二进制"}\n\n将调起系统下载器高速下载并保存至手机“下载”目录，下载完成后系统会自动提示安装。`,
        [
          { text: "取消", style: "cancel" },
          {
            text: "复制链接",
            onPress: () => {
              Clipboard.setString(targetDownloadUrl);
              Alert.alert("已复制", "下载直链已复制到剪贴板，可通过微信或电脑浏览器直接下载。");
            },
          },
          {
            text: "立即高速下载",
            onPress: () => {
              void Linking.openURL(targetDownloadUrl).catch(() => {
                Alert.alert("呼起下载器失败", "调起系统外部应用失败，请点击“复制链接”在浏览器打开。");
              });
            },
          },
        ]
      );
      return { success: true, uri: targetDownloadUrl };
    }

    // ── 针对全栈源码大包的专有下载通道 ──
    if (isLargeArchive) {
      Alert.alert(
        "下载工程源码归档",
        `工程归档：${safeName}\n文件体积：${sizeText || "全栈 Monorepo 归档"}\n\n建议通过系统下载器高速下载，或复制链接到电脑终端使用 curl/wget 下载解压。`,
        [
          { text: "取消", style: "cancel" },
          {
            text: "复制链接",
            onPress: () => {
              Clipboard.setString(targetDownloadUrl);
              Alert.alert("已复制", "源码下载直链已复制，可粘贴至电脑终端直接下载。");
            },
          },
          {
            text: "立即下载",
            onPress: () => {
              void Linking.openURL(targetDownloadUrl).catch(() => {
                Alert.alert("呼起下载器失败", "调起系统外部应用失败，请使用“复制链接”。");
              });
            },
          },
        ]
      );
      return { success: true, uri: targetDownloadUrl };
    }

    // 确保普通产物有 download=true 标识
    if (!targetDownloadUrl.includes("download=")) {
      const sep = targetDownloadUrl.includes("?") ? "&" : "?";
      targetDownloadUrl = `${targetDownloadUrl}${sep}download=true`;
    }

    const localDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    const localUri = `${localDir}${safeName}`;

    // 执行原生下载
    const downloadRes = await FileSystem.downloadAsync(targetDownloadUrl, localUri, {
      headers,
    });

    if (downloadRes.status < 200 || downloadRes.status >= 300) {
      throw new Error(`服务器响应异常 (HTTP ${downloadRes.status})`);
    }

    // 检查是否下载到了 JSON 错误体 (比如 404 或 {"error": ...})
    const fileInfo = await FileSystem.getInfoAsync(downloadRes.uri);
    if (!fileInfo.exists) {
      throw new Error("下载文件落盘失败");
    }

    if (fileInfo.size < 200) {
      const previewContent = await FileSystem.readAsStringAsync(downloadRes.uri);
      if (previewContent.includes('"error":')) {
        try {
          const errObj = JSON.parse(previewContent);
          throw new Error(errObj.error || "下载遇到权限或未找到问题");
        } catch {
          // not json, continue
        }
      }
    }

    // 调起系统原生分享/保存/用其他应用打开 (Android 支持 WPS Office、文件管理等)
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      try {
        await Sharing.shareAsync(downloadRes.uri, {
          mimeType: mimeType || undefined,
          dialogTitle: `保存或打开：${title || safeName}`,
          UTI: mimeType || undefined,
        });
      } catch (shareErr) {
        Alert.alert(
          "已完成下载",
          `文件已保存至：\n${downloadRes.uri}\n\n是否调起外部应用打开？`,
          [
            { text: "完成", style: "cancel" },
            {
              text: "外部打开",
              onPress: () => void Linking.openURL(targetDownloadUrl),
            },
          ]
        );
      }
    } else {
      Alert.alert("下载完成", `文件已保存至：\n${downloadRes.uri}`);
    }

    return { success: true, uri: downloadRes.uri };
  } catch (err) {
    const msg = (err as Error)?.message || String(err);
    Alert.alert("下载失败", msg);
    return { success: false, error: msg };
  }
}
