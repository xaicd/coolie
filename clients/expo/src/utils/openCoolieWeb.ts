import { Alert, Linking } from "react-native";

/**
 * Coolie Web (cloud.coolie.app.web / clients/expo-paperclip-web) 的深链 scheme。
 * 见 clients/expo-paperclip-web/app.json 的 `expo.scheme = "coolieweb"`。
 */
export const COOLIE_WEB_SCHEME = "coolieweb://";

/**
 * 从驾驶舱 App 跳到 Coolie Web App。
 *
 * 本机没装 Coolie Web 时 `openURL` 会 reject (Android: 没有 Activity 处理该
 * scheme), 于是给出可操作的提示而不是静默失败。
 */
export async function openCoolieWeb(): Promise<void> {
  try {
    await Linking.openURL(COOLIE_WEB_SCHEME);
  } catch {
    Alert.alert("未安装 Coolie Web", "请先装 cloud.coolie.app.web (Coolie Web)");
  }
}
