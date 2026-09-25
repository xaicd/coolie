import { Alert, Clipboard, Linking, Platform } from "react-native";

/**
 * QQ 浏览器专有 URI Scheme
 * iOS & Android 均支持 mttbrowser://url=<encoded_url> 协议呼起 QQ 浏览器。
 */
export const QQ_BROWSER_SCHEME_PREFIX = "mttbrowser://url=";

/** QQ 浏览器 Android 标准包名 */
export const QQ_BROWSER_PACKAGE = "com.tencent.mtt";

/**
 * 探测本机是否已安装并支持唤起 QQ 浏览器。
 */
export async function isQQBrowserAvailable(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const testUrl = `${QQ_BROWSER_SCHEME_PREFIX}https://www.qq.com`;
    return await Linking.canOpenURL(testUrl);
  } catch {
    return false;
  }
}

/**
 * 定向使用 QQ 浏览器打开目标链接。
 *
 * 针对 MVP 原型演示与各类工程文档（.docx / .xlsx / .pptx / .pdf / .html）：
 * QQ 浏览器内置腾讯 TBS (X5) 高性能内核，免安装 Office 即可实现文档的高保真秒开，
 * 并且对 H5 交互原型具有优秀的兼容性与全屏沉浸体验。
 *
 * @param url 待打开的原型或文档外部地址
 * @returns 是否成功拉起 QQ 浏览器
 */
export async function openInQQBrowser(url: string): Promise<boolean> {
  if (!url) return false;
  const encoded = encodeURIComponent(url);
  const qqScheme = `${QQ_BROWSER_SCHEME_PREFIX}${encoded}`;

  try {
    const canOpen = await Linking.canOpenURL(qqScheme);
    if (canOpen) {
      await Linking.openURL(qqScheme);
      return true;
    }
  } catch {
    // canOpenURL 报错或拦截，尝试 intent 协议降级
  }

  // Android Intent 方案备用
  if (Platform.OS === "android") {
    try {
      const cleanUrl = url.replace(/^https?:\/\//i, "");
      const intentUrl = `intent://${cleanUrl}#Intent;scheme=https;package=${QQ_BROWSER_PACKAGE};end`;
      const canIntent = await Linking.canOpenURL(intentUrl);
      if (canIntent) {
        await Linking.openURL(intentUrl);
        return true;
      }
    } catch {
      // intent 失败，交由外层兜底
    }
  }

  return false;
}

/**
 * 使用外部应用/浏览器打开链接。
 *
 * @param url 目标地址
 * @param preferQQ 是否优先尝试呼起 QQ 浏览器（若未安装则自动无缝降级到系统浏览器）
 */
export async function openInExternalApp(
  url: string,
  preferQQ: boolean = false,
): Promise<boolean> {
  if (!url) return false;

  if (preferQQ) {
    const openedWithQQ = await openInQQBrowser(url);
    if (openedWithQQ) return true;
  }

  // 默认通过系统应用选择器打开（由用户选择系统浏览器、Chrome 或已安装的应用）
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert("无法打开外部应用", "未能呼起外部浏览器，请检查手机网络或安全权限设置。");
    return false;
  }
}

/**
 * 复制链接到系统剪贴板，并提示用户。
 */
export function copyUrlToClipboard(url: string, customNotice?: string) {
  if (!url) return;
  Clipboard.setString(url);
  Alert.alert(
    "链接已复制",
    customNotice || "链接已成功复制到剪贴板，您可随时在 QQ 浏览器或其他外部应用中粘贴打开。",
  );
}

/**
 * 弹出外部应用打开选项对话框（支持快捷选择 QQ 浏览器、系统浏览器或复制链接）。
 */
export function showExternalAppChooser(
  url: string,
  title: string = "打开外部应用",
  subtitle?: string,
) {
  if (!url) return;

  Alert.alert(
    title,
    subtitle ||
      "针对 MVP 原型交互与文档预览，推荐使用 QQ 浏览器（内置 TBS 内核秒开 Office/PDF 与原型），也可使用系统默认浏览器打开：",
    [
      {
        text: "🚀 QQ 浏览器打开",
        onPress: async () => {
          const success = await openInQQBrowser(url);
          if (!success) {
            // 未安装 QQ 浏览器，降级打开并引导
            Alert.alert(
              "未检测到 QQ 浏览器",
              "本机可能未安装 QQ 浏览器，正在为您调用系统默认浏览器打开…",
              [
                {
                  text: "确定",
                  onPress: () => void Linking.openURL(url),
                },
              ],
            );
          }
        },
      },
      {
        text: "🌐 系统默认浏览器",
        onPress: () => {
          void Linking.openURL(url);
        },
      },
      {
        text: "📋 复制链接",
        onPress: () => {
          copyUrlToClipboard(url);
        },
      },
      {
        text: "取消",
        style: "cancel",
      },
    ],
  );
}
