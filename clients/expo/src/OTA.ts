import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import * as Updates from "expo-updates";
import Constants from "expo-constants";

export interface OTAState {
  isEnabled: boolean;
  isChecking: boolean;
  isDownloading: boolean;
  isUpdateAvailable: boolean;
  isUpdatePending: boolean;
  currentlyRunningUpdateId: string | null;
  runtimeVersion: string | null;
  lastCheckedAt: Date | null;
  error: string | null;
}

/**
 * 弹出提示用户立即重启生效或稍后生效
 */
export function promptRestart(
  title = "发现新版本",
  message = "新版本已下载完成，是否立即重启应用以生效？",
): void {
  Alert.alert(
    title,
    message,
    [
      { text: "稍后", style: "cancel" },
      {
        text: "立即重启",
        style: "default",
        onPress: () => {
          void Updates.reloadAsync().catch((err: unknown) => {
            console.warn("[OTA] reloadAsync error:", err);
          });
        },
      },
    ],
    { cancelable: true },
  );
}

/**
 * 安全校验与设备识别审计
 *
 * 机制说明:
 * 1. 当前策略: 在 Updates 请求中携带设备唯一标识 (deviceId)，通过 ExtraParams 发送到更新源，
 *    用于自建 Caddy / 静态源的访问日志审计、设备追踪及灰度发布过滤。
 * 2. TODO: 开启 expo-updates 原生 Code Signing (代码公钥数字签名校验):
 *    - 离线生成 RSA 私钥与 X.509 公钥证书 (codeSigningCertificate)
 *    - 在 app.json 中配置 updates.codeSigningCertificate 及 updates.codeSigningMetadata
 *    - 发布脚本中对导出的 manifest 使用私钥计算数字签名，并作为 `expo-signature` 响应头下发
 *    - expo-updates 客户端原生验证签名，确保更新包未被劫持、篡改或未授权发布。
 */
export async function initOTASecurity(): Promise<void> {
  if (!Updates.isEnabled) return;
  try {
    const deviceId =
      (Constants as Record<string, any>).installationId ??
      Constants.sessionId ??
      "coolie-mobile-client";
    await Updates.setExtraParamAsync("deviceId", String(deviceId));
  } catch (e) {
    // 开发模式或部分非生产宿主环境不支持 setExtraParamAsync，忽略异常
    console.warn("[OTA] Failed to set security device ID header/extraParam:", e);
  }
}

/**
 * 注册全局 OTA 更新状态监听器
 * 适用于 checkAutomatically: "ON_LOAD" 策略下，在后台静默下载完毕后通知用户重启
 */
export function setupOTAListener(onUpdateDownloaded?: () => void): () => void {
  if (!Updates.isEnabled) {
    return () => {};
  }

  void initOTASecurity();

  try {
    const subscription = Updates.addUpdatesStateChangeListener((event) => {
      if (event.context.isUpdatePending) {
        if (onUpdateDownloaded) {
          onUpdateDownloaded();
        } else {
          promptRestart(
            "更新就绪",
            "应用新版本已在后台静默下载完毕，是否立即重启生效？",
          );
        }
      }
    });

    return () => {
      subscription.remove();
    };
  } catch (e) {
    console.warn("[OTA] setupOTAListener registration failed:", e);
    return () => {};
  }
}

/**
 * 手动检查并应用更新
 * @param interactive 是否为交互式 (弹出提示框或通知)
 */
export async function checkAndApplyUpdate(interactive = true): Promise<boolean> {
  if (!Updates.isEnabled) {
    if (interactive) {
      Alert.alert("提示", "当前运行在开发调试环境，OTA 热更新未启用。");
    }
    return false;
  }

  try {
    const checkResult = await Updates.checkForUpdateAsync();
    if (!checkResult.isAvailable) {
      if (interactive) {
        Alert.alert("检查更新", "当前已是最新版本，无需更新。");
      }
      return false;
    }

    // 发现可用更新，下载更新包
    const fetchResult = await Updates.fetchUpdateAsync();
    if (fetchResult.isNew) {
      promptRestart("发现新版本", "新版本已下载完成，是否立即重启应用？");
      return true;
    } else {
      if (interactive) {
        Alert.alert("检查更新", "当前已是最新版本。");
      }
      return false;
    }
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    console.warn("[OTA] checkAndApplyUpdate error:", errMsg);
    if (interactive) {
      Alert.alert("检查更新失败", `无法连接到更新源: ${errMsg}`);
    }
    return false;
  }
}

/**
 * React Hook: 管理 OTA 更新状态、静默监听与手动检查动作
 */
export function useOTA() {
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 绑定 expo-updates 响应式状态
  const nativeUpdates = Updates.useUpdates();

  useEffect(() => {
    // 监听后台就绪事件
    const unsubscribe = setupOTAListener();
    return () => {
      unsubscribe();
    };
  }, []);

  // 监听 nativeUpdates.isUpdatePending 状态变化
  useEffect(() => {
    if (nativeUpdates.isUpdatePending) {
      promptRestart(
        "更新就绪",
        "应用新版本已在后台下载完毕，是否立即重启以体验最新功能？",
      );
    }
  }, [nativeUpdates.isUpdatePending]);

  const triggerCheck = useCallback(async (interactive = true) => {
    setIsChecking(true);
    setError(null);
    try {
      const result = await checkAndApplyUpdate(interactive);
      setLastCheckedAt(new Date());
      return result;
    } catch (e: any) {
      const msg = e?.message || String(e);
      setError(msg);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, []);

  const reload = useCallback(async () => {
    if (Updates.isEnabled) {
      await Updates.reloadAsync();
    }
  }, []);

  return {
    isEnabled: Updates.isEnabled,
    isChecking: isChecking || nativeUpdates.isChecking,
    isDownloading: isDownloading || nativeUpdates.isDownloading,
    isUpdateAvailable: nativeUpdates.isUpdateAvailable,
    isUpdatePending: nativeUpdates.isUpdatePending,
    currentlyRunningUpdateId: Updates.updateId ?? null,
    runtimeVersion: Updates.runtimeVersion ?? null,
    lastCheckedAt,
    error: error || (nativeUpdates.checkError ? nativeUpdates.checkError.message : null),
    checkUpdate: triggerCheck,
    reload,
    downloadProgress: nativeUpdates.downloadProgress ?? 0,
  };
}
