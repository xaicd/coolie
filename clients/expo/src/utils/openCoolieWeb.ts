import { Linking } from "react-native";

/**
 * Coolie Web (cloud.coolie.app.web / clients/expo-paperclip-web) 的深链 scheme。
 * 见 clients/expo-paperclip-web/app.json 的 `expo.scheme = "coolieweb"`。
 */
export const COOLIE_WEB_SCHEME = "coolieweb://";

/**
 * Coolie Web 独立 APK 的下载直链 (发版产物, 见
 * clients/expo-paperclip-web/scripts/update-version-json.sh 的 `${VERSION}-paperclip-web/`)。
 * 只用来「引导下载」, 绝不静默强装 (wave40 约束)。
 */
export const COOLIE_WEB_APK_URL =
  "https://dls.xrobinai.cn/coolie/app/0.6.4-paperclip-web/coolie-release.apk";

/** 内置 webview 兜底加载的远端地址 (paperclip 完整 PC web)。 */
export const COOLIE_WEB_URL = "https://www.xrobinai.cn/XROA";

/**
 * 从驾驶舱 App 跳到 Coolie Web App。
 *
 * 返回 true = 已交给 Coolie Web (深链拉起); false = 本机没装 Coolie Web, 调用方
 * 该走内置 webview 兜底 (wave40 方案 B) —— 这里只负责判定, 不弹窗、不强装。
 *
 * Android 11+ 的包可见性会让 `canOpenURL` 对未在 `<queries>` 里声明过的自定义
 * scheme 返回 false。`openURL` 是直接 startActivity, 不受包可见性限制; 所以
 * canOpenURL 说「不可用」时再试一次 openURL —— 装了 Coolie Web 的机器仍能深链
 * 打开 (与 wave40 前的行为一致), 只有真的 ActivityNotFoundException 才算没装。
 * `<queries>` 由 clients/expo/scripts/fix-android-manifest.sh 在构建前补上。
 */
export async function openCoolieWeb(): Promise<boolean> {
  if (await canOpenCoolieWeb()) {
    try {
      await Linking.openURL(COOLIE_WEB_SCHEME);
      return true;
    } catch {
      // canOpenURL 说能开、真开却失败: 交给调用方兜底, 不再弹「未安装」。
      return false;
    }
  }

  try {
    await Linking.openURL(COOLIE_WEB_SCHEME);
    return true;
  } catch {
    return false;
  }
}

async function canOpenCoolieWeb(): Promise<boolean> {
  try {
    return await Linking.canOpenURL(COOLIE_WEB_SCHEME);
  } catch {
    return false;
  }
}
