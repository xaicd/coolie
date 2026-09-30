import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import * as Location from "expo-location";
import { LocationAccuracy } from "expo-location";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Notifications from "expo-notifications";
import { SchedulableTriggerInputTypes } from "expo-notifications";
import * as FileSystem from "expo-file-system";
import { C } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "../ui/tokens";
import { Sheet } from "../ui/Sheet";
import { showErrorToast, showInfoToast, showSuccessToast } from "../ui/toast";

/**
 * wave188 — 6 个 expo-* 原生模块的最小集成 demo.
 *
 * 目的: 装上 6 个常用 expo-* (task-manager / background-fetch / location /
 * sharing / print / notifications), 给老板一个统一入口挨个点一点看效果。
 * 每节一个按钮 + 一段结果, 不替代产品级实现, 仅为后续接业务逻辑铺地基。
 *
 * 范围:
 * - expo-task-manager: 注册/注销 1 个 demo 任务, 列已注册
 * - expo-background-fetch: 注册 15min 周期间隔, 读状态
 * - expo-location: 前台一次性定位
 * - expo-sharing: 写临时 txt, 调系统分享面板
 * - expo-print: HTML → PDF, 分享出去
 * - expo-notifications: 5s 后本地推送
 *
 * 不接: FCM/APNs (后端配 APNs 证书是另一波)、后台定位 (UIBackgroundModes
 * + ACCESS_BACKGROUND_LOCATION 复杂权限)、真后台拉取业务逻辑。
 */

const DEMO_TASK_NAME = "coolie-demo-task";

/** 在模块顶层注册任务回调, expo-task-manager 要求模块顶层调用 (见其 README)。 */
TaskManager.defineTask(DEMO_TASK_NAME, async () => {
  // demo 占位: 真实业务接后台时在这里写逻辑
  return BackgroundFetch.BackgroundFetchResult.NoData;
});

interface SectionProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  hint: string;
  busy: boolean;
  buttonLabel: string;
  onRun: () => void;
  result?: string;
}

function Section({
  icon,
  title,
  hint,
  busy,
  buttonLabel,
  onRun,
  result,
}: SectionProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon} size={16} color={C.accent} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <Text style={styles.cardHint}>{hint}</Text>
      <Pressable style={styles.btn} disabled={busy} onPress={onRun}>
        {busy ? (
          <ActivityIndicator size="small" color={C.accent} />
        ) : (
          <Text style={styles.btnText}>{buttonLabel}</Text>
        )}
      </Pressable>
      {result ? (
        <View style={styles.resultBox}>
          <Text style={styles.resultLabel}>结果</Text>
          <Text style={styles.resultText} selectable>
            {result}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function NativeModulesScreen({
  onClose,
}: {
  onClose: () => void;
}) {
  // ─── task-manager ───────────────────────────────────────────────────────
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskResult, setTaskResult] = useState<string | undefined>();
  const refreshTasks = useCallback(async () => {
    try {
      const list = await TaskManager.getRegisteredTasksAsync();
      const names = list.map((t) => t.taskName).join(", ") || "(无)";
      setTaskResult(`已注册 ${list.length} 个: ${names}`);
    } catch (err) {
      setTaskResult(`读取失败: ${(err as Error).message ?? String(err)}`);
    }
  }, []);
  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  const runTaskManager = useCallback(async () => {
    setTaskBusy(true);
    try {
      // TaskManager 自身不暴露 registerTaskAsync —— 在 SDK 52 里注册入口由
      // BackgroundFetch 提供 (registerTaskAsync 自动调 TaskManager.register)。
      // 我们先清掉历史注册, 再用 BackgroundFetch 注册一次, 这会同时挂上
      // defineTask 定义的回调, 也算在 TaskManager 的注册列表里。
      await TaskManager.unregisterAllTasksAsync();
      await BackgroundFetch.registerTaskAsync(DEMO_TASK_NAME, {
        minimumInterval: 15,
      });
      showSuccessToast("任务已注册", DEMO_TASK_NAME);
      await refreshTasks();
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      showErrorToast("task-manager 失败", msg);
      setTaskResult(`失败: ${msg}`);
    } finally {
      setTaskBusy(false);
    }
  }, [refreshTasks]);

  // ─── background-fetch ──────────────────────────────────────────────────
  const [bgBusy, setBgBusy] = useState(false);
  const [bgResult, setBgResult] = useState<string | undefined>();
  const runBackgroundFetch = useCallback(async () => {
    setBgBusy(true);
    try {
      const status = await BackgroundFetch.getStatusAsync();
      const statusText = statusTextOf(status ?? null);
      await BackgroundFetch.registerTaskAsync(DEMO_TASK_NAME, {
        minimumInterval: 15, // 分钟, 系统可能延后
      });
      showSuccessToast("已注册后台拉取", "系统级, 间隔 ~15min");
      setBgResult(
        `${statusText}\n任务: ${DEMO_TASK_NAME}\n间隔: ~15min (系统决定实际调度)`,
      );
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      showErrorToast("background-fetch 失败", msg);
      setBgResult(`失败: ${msg}`);
    } finally {
      setBgBusy(false);
    }
  }, []);

  // ─── location ─────────────────────────────────────────────────────────
  const [locBusy, setLocBusy] = useState(false);
  const [locResult, setLocResult] = useState<string | undefined>();
  const runLocation = useCallback(async () => {
    setLocBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocResult(`权限未授予: ${status} (到系统设置 → Coolie → 位置 开启)`);
        showErrorToast("定位权限被拒", "请到系统设置开启");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: LocationAccuracy.Balanced,
      });
      const text =
        `lat: ${pos.coords.latitude.toFixed(6)}\n` +
        `lng: ${pos.coords.longitude.toFixed(6)}\n` +
        `accuracy: ${pos.coords.accuracy ?? "?"} m`;
      setLocResult(text);
      showSuccessToast("定位成功");
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      showErrorToast("定位失败", msg);
      setLocResult(`失败: ${msg}`);
    } finally {
      setLocBusy(false);
    }
  }, []);

  // ─── sharing ──────────────────────────────────────────────────────────
  const [shareBusy, setShareBusy] = useState(false);
  const runSharing = useCallback(async () => {
    setShareBusy(true);
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        showErrorToast("分享不可用", "当前设备不支持文件分享");
        return;
      }
      const path = `${FileSystem.cacheDirectory}coolie-share-demo.txt`;
      const content = `Coolie 工坊 · wave188 sharing demo\n时间: ${new Date().toISOString()}\n设备: ${Platform.OS}`;
      await FileSystem.writeAsStringAsync(path, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(path, {
        mimeType: "text/plain",
        dialogTitle: "Coolie 工坊分享",
      });
      showInfoToast("已打开分享面板");
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      showErrorToast("分享失败", msg);
    } finally {
      setShareBusy(false);
    }
  }, []);

  // ─── print ────────────────────────────────────────────────────────────
  const [printBusy, setPrintBusy] = useState(false);
  const runPrint = useCallback(async () => {
    setPrintBusy(true);
    try {
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,system-ui,sans-serif;padding:32px;color:#111}h1{font-size:22px}p{color:#444}</style>
</head><body>
<h1>Coolie 工坊 · wave188 print demo</h1>
<p>这份 PDF 由 <code>expo-print</code> 渲染, <code>expo-sharing</code> 调起系统分享。</p>
<p>时间: ${new Date().toISOString()}</p>
<p>设备: ${Platform.OS}</p>
</body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      showSuccessToast("PDF 已生成", uri);
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "分享 PDF",
      });
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      showErrorToast("打印失败", msg);
    } finally {
      setPrintBusy(false);
    }
  }, []);

  // ─── notifications (本地推送) ─────────────────────────────────────────
  const [notifBusy, setNotifBusy] = useState(false);
  const runNotifications = useCallback(async () => {
    setNotifBusy(true);
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") {
        showErrorToast("通知权限被拒", "到系统设置开启通知");
        return;
      }
      // 5s 后推一条本地通知 — 不依赖 FCM/APNs, 纯本地排程
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Coolie 工坊",
          body: "wave188 notifications demo — 5s 定时本地推送",
          sound: "default",
        },
        trigger: {
          type: SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 5,
        },
      });
      showSuccessToast("已排程", "5s 后会在通知栏出现");
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      showErrorToast("通知排程失败", msg);
    } finally {
      setNotifBusy(false);
    }
  }, []);

  return (
    <Sheet
      onClose={onClose}
      title="原生模块 (6 expo-*)"
      maxHeight={Math.round(Dimensions.get("window").height * 0.92)}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          6 个 expo-* 模块最小集成 demo。每节一个按钮 + 结果回显。生产环境可在此基础上接后台 OTA / 后台通知 / 任务上报 / 导出 PDF 报表。
        </Text>

        <Section
          icon="albums-outline"
          title="expo-task-manager"
          hint="在 JS 顶层定义后台任务回调。后续接后台 OTA / 心跳检查的底层。"
          busy={taskBusy}
          buttonLabel="注册 coolie-demo-task"
          onRun={runTaskManager}
          result={taskResult}
        />

        <Section
          icon="sync-outline"
          title="expo-background-fetch"
          hint="系统级周期性后台拉取 (iOS BackgroundTasks / Android WorkManager)。"
          busy={bgBusy}
          buttonLabel="注册周期拉取 (15min)"
          onRun={runBackgroundFetch}
          result={bgResult}
        />

        <Section
          icon="location-outline"
          title="expo-location"
          hint="前台一次性 GPS 定位。后台定位需额外权限 (本波不接)。"
          busy={locBusy}
          buttonLabel="请求权限 + 拿当前坐标"
          onRun={runLocation}
          result={locResult}
        />

        <Section
          icon="share-outline"
          title="expo-sharing"
          hint="调起系统分享面板传文件 (Android chooser / iOS share sheet)。"
          busy={shareBusy}
          buttonLabel="写 tmp txt + 分享"
          onRun={runSharing}
        />

        <Section
          icon="document-outline"
          title="expo-print"
          hint="HTML → PDF, 生成的 URI 直接走 expo-sharing 分享出去。"
          busy={printBusy}
          buttonLabel="渲染 PDF + 分享"
          onRun={runPrint}
        />

        <Section
          icon="notifications-outline"
          title="expo-notifications (本地推送)"
          hint="5s 后本地推送。APNs/FCM 远程推送需服务端配 APNs 证书 (后续波次)。"
          busy={notifBusy}
          buttonLabel="请求权限 + 排程 5s 后通知"
          onRun={runNotifications}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            模拟器无 GPS / 无通知声音, 真机可验完整链路。
          </Text>
        </View>
      </ScrollView>
    </Sheet>
  );
}

function statusTextOf(
  s: BackgroundFetch.BackgroundFetchStatus | null,
): string {
  if (s === null) return "状态: 未知 (getStatusAsync 返回 null)";
  switch (s) {
    case BackgroundFetch.BackgroundFetchStatus.Available:
      return "状态: available (系统允许后台拉取)";
    case BackgroundFetch.BackgroundFetchStatus.Restricted:
      return "状态: restricted (家长控制/企业 MDM 限制)";
    case BackgroundFetch.BackgroundFetchStatus.Denied:
      return "状态: denied (用户拒绝 — 到系统设置 → 通用 → 后台 App 刷新 开启)";
    default:
      return `状态: ${String(s)}`;
  }
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: SPACING.xl, gap: SPACING.md },
  intro: {
    color: C.ink3,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: SPACING.xs,
  },
  card: {
    backgroundColor: ELEVATION.base,
    borderColor: C.lineSubtle,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  cardTitle: {
    color: C.ink,
    fontSize: 14,
    fontWeight: "600",
  },
  cardHint: {
    color: C.ink3,
    fontSize: 11,
    lineHeight: 16,
  },
  btn: {
    backgroundColor: ELEVATION.soft,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    alignItems: "center",
    alignSelf: "flex-start",
    minWidth: 180,
  },
  btnText: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "500",
  },
  resultBox: {
    backgroundColor: C.panel,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    gap: 4,
  },
  resultLabel: {
    color: C.ink4,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  resultText: {
    color: C.ink2,
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 16,
  },
  footer: {
    paddingTop: SPACING.sm,
  },
  footerText: {
    color: C.ink4,
    fontSize: 11,
    textAlign: "center",
  },
});
