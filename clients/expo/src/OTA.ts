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
/**
 * 触发链观测点 (wave86, boss 09-25 27:18 OOB「0.5.55 为啥不更新」):
 * 把「更新源声称的 runtimeVersion」和「本机原生的 runtimeVersion」打进 logcat。
 * 实测 (09-25 模拟器 0.5.58 ← manifest 0.5.59) expo-updates 并不因 runtimeVersion
 * 不同拒载 bundle —— mismatch 只是提示「新 bundle 跑在旧原生层上」, 不是失败。
 */
async function logOTAProbe(): Promise<void> {
  const installed = Updates.runtimeVersion ?? Constants.expoConfig?.version ?? "unknown";
  const updatesCfg = (Constants.expoConfig as Record<string, any> | undefined)?.updates as
    | { url?: string }
    | undefined;
  if (!updatesCfg?.url) {
    console.warn(`[OTA] probe skipped: expoConfig 无 updates.url (installedApp=${installed})`);
    return;
  }
  const probe = await checkOTAManifest(updatesCfg.url, 8000);
  if (!probe.ok) {
    console.warn(`[OTA] check manifest FAILED: ${probe.error} (installedApp=${installed})`);
    return;
  }
  const verdict = probe.runtimeVersion === installed ? "match" : "MISMATCH";
  console.log(
    `[OTA] check manifest runtimeVersion=${probe.runtimeVersion} vs installedApp=${installed} → ${verdict}`,
  );
}

export async function initOTASecurity(): Promise<void> {
  if (!Updates.isEnabled) return;
  try {
    const deviceId =
      (Constants as Record<string, any>).installationId ??
      Constants.sessionId ??
      "coolie-mobile-client";
    await Updates.setExtraParamAsync("device_id", String(deviceId));
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
    console.log("[OTA] listener: updates disabled (dev 宿主或打包未启用), 不检查更新");
    return () => {};
  }

  console.log(
    `[OTA] listener setup: runtimeVersion=${Updates.runtimeVersion ?? "?"} channel=${Updates.channel ?? "?"} updateId=${Updates.updateId ?? "embedded(装机包)"}`,
  );

  void initOTASecurity();
  void logOTAProbe();

  try {
    // 已下载待重启时只提示一次：状态每变一次就弹窗会把用户轰炸到「稍后」永远不点。
    let pendingNotified = false;
    const subscription = Updates.addUpdatesStateChangeListener((event) => {
      if (event.context.isUpdatePending && !pendingNotified) {
        pendingNotified = true;
        console.log("[OTA] update downloaded & pending, prompting restart");
        if (onUpdateDownloaded) {
          onUpdateDownloaded();
        } else {
          promptRestart(
            "更新就绪",
            "应用新版本已在后台静默下载完毕，是否立即重启生效？",
          );
        }
      } else if (!event.context.isUpdatePending) {
        pendingNotified = false;
      }
    });

    // checkAutomatically=ON_LOAD 只覆盖冷启动；App 常驻前台时 (老板的手机很少冷启)
    // 每次发版都要等到下次冷启才可见 —— 这里每 60s 主动复查一次。
    const interval = setInterval(() => {
      void (async () => {
        if (pendingNotified) return; // 已下载待重启, 复查只是重复弹窗
        try {
          await logOTAProbe();
          const check = await Updates.checkForUpdateAsync();
          if (check.isAvailable) {
            console.log("[OTA] periodic check: update available → fetching");
            const fetched = await Updates.fetchUpdateAsync();
            console.log(`[OTA] periodic fetch: isNew=${fetched.isNew}`);
          }
        } catch (e: unknown) {
          console.warn("[OTA] periodic check error:", e);
        }
      })();
    }, 60_000);

    return () => {
      clearInterval(interval);
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
    console.log(
      `[OTA] checkAndApplyUpdate: isAvailable=${String(checkResult.isAvailable)} (installedApp=${Updates.runtimeVersion ?? Constants.expoConfig?.version ?? "?"})`,
    );
    if (!checkResult.isAvailable) {
      if (interactive) {
        Alert.alert("检查更新", "当前已是最新版本，无需更新。");
      }
      return false;
    }

    // 发现可用更新，下载更新包
    const fetchResult = await Updates.fetchUpdateAsync();
    console.log(`[OTA] checkAndApplyUpdate: fetch isNew=${String(fetchResult.isNew)}`);
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

export interface OTAManifestCheck {
  /** 更新源真的可用（2xx + JSON + 含 launchAsset.url）时为 true */
  ok: boolean;
  /** HTTP 状态码；请求没发出去时为 null */
  status: number | null;
  /** 响应 Content-Type 原样，用于把「被 SPA 兜底成 HTML」当场点名 */
  contentType: string | null;
  /** 响应头的 expo-protocol-version；expo-updates 靠它判定协议版本 */
  protocolVersion: string | null;
  /** manifest 的 runtimeVersion；解析成功才有 */
  runtimeVersion: string | null;
  /** manifest 指向的 bundle 地址 */
  bundleUrl: string | null;
  /** 失败原因（人话，直接显示在自检屏上） */
  error: string | null;
}

/**
 * 严格探测更新源是否真的可用 —— 不自欺的版本。
 *
 * 老板 2026-09-21 撞的坑：自检只看 `Updates.isEnabled`（那是打包时的开关），于是
 * 生产上 manifest URL 被 Caddy 的 SPA 兜底路由返回 HTML 时，屏上仍然绿字「OTA 已
 * 启用」。这里按 expo-updates 真正会做的事重新验一遍：
 *   1. GET manifest URL（带 expo-channel-name，与客户端请求头一致）
 *   2. HTTP 必须 2xx
 *   3. Content-Type 必须是 application/json —— HTML 兜底当场露馅
 *   4. 必须带 expo-protocol-version 响应头 —— 缺它 expo-updates 判为旧协议
 *   5. body 必须能 JSON.parse，且含 launchAsset.url
 * 任一步不过 → ok:false + 人话原因，绝不返回「看起来没问题」。
 */
export async function checkOTAManifest(
  url: string,
  timeoutMs = 8000,
): Promise<OTAManifestCheck> {
  const fail = (
    error: string,
    extra: Partial<OTAManifestCheck> = {},
  ): OTAManifestCheck => ({
    ok: false,
    status: null,
    contentType: null,
    protocolVersion: null,
    runtimeVersion: null,
    bundleUrl: null,
    error,
    ...extra,
  });

  if (!url) return fail("未配置更新源地址");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "expo-channel-name": "production" },
      signal: controller.signal,
    });
    const contentType = res.headers.get("content-type");
    const protocolVersion = res.headers.get("expo-protocol-version");
    if (!res.ok) {
      return fail(`HTTP ${res.status}`, { status: res.status, contentType });
    }
    if (!contentType || !contentType.toLowerCase().includes("application/json")) {
      return fail(
        `响应不是 JSON（${contentType ?? "无 Content-Type"}）—— 多半被 SPA 兜底成了 HTML`,
        { status: res.status, contentType },
      );
    }
    // expo-updates 0.27 (SDK 52) 的 UpdateFactory 在缺这个头时直接判为「旧协议」并抛错
    // —— 哪怕 body 是合法 JSON。生产上这正是 "Failed to construct manifest" 的真凶。
    if (!protocolVersion) {
      return fail("响应缺少 expo-protocol-version 头（expo-updates 会当成旧协议拒绝）", {
        status: res.status,
        contentType,
      });
    }
    const text = await res.text();
    let manifest: {
      runtimeVersion?: string;
      launchAsset?: { url?: string };
    } | null = null;
    try {
      manifest = JSON.parse(text);
    } catch {
      return fail("manifest 不是合法 JSON", {
        status: res.status,
        contentType,
        protocolVersion,
      });
    }
    const bundleUrl = manifest?.launchAsset?.url ?? null;
    if (!bundleUrl) {
      return fail("manifest 缺 launchAsset.url", {
        status: res.status,
        contentType,
        protocolVersion,
      });
    }
    return {
      ok: true,
      status: res.status,
      contentType,
      protocolVersion,
      runtimeVersion: manifest?.runtimeVersion ?? null,
      bundleUrl,
      error: null,
    };
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    return fail(aborted ? `请求超时（${timeoutMs}ms）` : e?.message || String(e));
  } finally {
    clearTimeout(timer);
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
  };
}
