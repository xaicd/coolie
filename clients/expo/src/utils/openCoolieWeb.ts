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
 * 判定只认 `canOpenURL`: Coolie Web 的启动 Activity 声明了
 * VIEW + BROWSABLE + scheme `coolieweb` + CATEGORY_DEFAULT, 所以装了就是 true;
 * Android 11+ 的包可见性由 clients/expo/scripts/fix-android-manifest.sh 补的
 * `<queries>` 覆盖。
 *
 * 不拿 `openURL` 当判定, 也不在 canOpenURL=false 时「再试一次」: 带
 * FLAG_ACTIVITY_NEW_TASK 启动无人接管的 intent 时, Android 只回一个失败 result
 * code 而不抛异常, RN 的 openURL 会照常 resolve(true) —— 那会让「没装」被误判成
 * 「已打开」, 兜底永不触发 (wave40 实测踩到)。
 */
export async function openCoolieWeb(): Promise<boolean> {
  const canOpen = await canOpenCoolieWeb();
  if (!canOpen) return false;

  try {
    await Linking.openURL(COOLIE_WEB_SCHEME);
    return true;
  } catch {
    // canOpenURL 说能开、真开却失败: 交给调用方兜底, 不再弹「未安装」。
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
