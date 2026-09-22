/**
 * 装机自检 + What's New —— 新版本首次启动时弹的全屏说明。
 *
 * 解决的是 0.5.x 的「老板说装了啥也没变」：老板装对版本后，第一屏就把本版功能点、
 * APK 版本、OTA 运行时版本一起摆出来。装错（OTA 关着，或运行时版本与 APK 对不上）
 * 当场给红字，不让人去猜。
 *
 * 首启判定：SecureStore 里存 `coolie.lastSeenVersion`，与当前 expo.version 不等才弹；
 * 点「我知道了」写回当前版本，之后再启动就不弹了。装了新版 → 版本号变 → 自动再弹。
 *
 * 「查看演示」不在这里直接跳转，而是把意图交回 App.tsx（onViewDemo）：切到工坊
 * (BoardChatScreen) 并向对话流投一条示例 prompt —— 屏幕本层不该知道导航细节。
 */

import React, { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { C } from "../coolie";
import { RADIUS, SPACING } from "../ui/tokens";
import { noteForVersion, type ReleaseNote } from "../releaseNotes";
import { checkOTAManifest, type OTAManifestCheck } from "../OTA";

const SEEN_VERSION_KEY = "coolie.lastSeenVersion";

/**
 * wave15 OTA 增量更新指纹 —— 这一段字符串只存在于这次 patch bundle 里。
 * 它的唯一用途是验证「设备真的加载了 OTA 下发的新 bundle」而不是 APK 内嵌的旧
 * 那份：装机后用 `adb logcat | grep OTA_PATCH` 就能一眼看到，无需猜。
 */
export const OTA_PATCH_MARKER = "ota-patch-wave15-2026-09-21";

/** 更新源地址 —— 来自 app.json 的 expo.updates.url，打包时内联。 */
function otaManifestUrl(): string {
  const updates = Constants.expoConfig?.updates as { url?: string } | undefined;
  return updates?.url ?? "";
}

/** 当前 APK 的版本号 —— 来自 app.json 的 expo.version，打包时内联。 */
export function currentAppVersion(): string {
  return Constants.expoConfig?.version ?? "0.0.0";
}

/** 本版说明是否还没被看过（首次启动新版 = true）。读失败时按「该弹」处理。 */
export async function shouldShowWhatsNew(): Promise<boolean> {
  try {
    const seen = await SecureStore.getItemAsync(SEEN_VERSION_KEY);
    return seen !== currentAppVersion();
  } catch {
    return true;
  }
}

/** 写回「本版已看过」。失败静默 —— 大不了下次再弹一次。 */
export async function markWhatsNewSeen(): Promise<void> {
  try {
    await SecureStore.setItemAsync(SEEN_VERSION_KEY, currentAppVersion());
  } catch {
    // 忽略：放弃持久化不应拦住用户。
  }
}

export interface WhatsNewScreenProps {
  visible: boolean;
  /** 「我知道了」/ 返回键：收起并标记已读 */
  onClose: () => void;
  /** 「查看演示」：由 App.tsx 切到工坊 + 投示例 prompt */
  onViewDemo?: () => void;
}

function CheckRow({
  ok,
  label,
  value,
}: {
  ok: boolean;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.checkRow}>
      <Ionicons
        name={ok ? "checkmark-circle" : "alert-circle"}
        size={16}
        color={ok ? C.ok : C.warn}
      />
      <Text style={styles.checkLabel}>{label}</Text>
      <Text style={[styles.checkValue, { color: ok ? C.ink2 : C.warn }]}>{value}</Text>
    </View>
  );
}

export function WhatsNewScreen({ visible, onClose, onViewDemo }: WhatsNewScreenProps) {
  const version = currentAppVersion();
  const note: ReleaseNote = noteForVersion(version);

  const otaEnabled = Updates.isEnabled;
  const runtimeVersion = Updates.runtimeVersion ?? null;
  // 运行时版本由 app.json 的 runtimeVersion 策略（appVersion）决定，理论上等于
  // APK 版本；OTA 下发新 bundle 后仍是同一 runtimeVersion，属正常。
  const runtimeMatches = runtimeVersion === null || runtimeVersion === version;

  // 更新源真伪：HTTP 200 不算数，得是 application/json 且能解析出 launchAsset。
  // 这一行就是 0.5.x「OTA 已启用」误报的修复点 —— 见 checkOTAManifest 的注释。
  const manifestUrl = otaManifestUrl();
  const [manifestCheck, setManifestCheck] = useState<OTAManifestCheck | null>(null);
  const manifestChecking = otaEnabled && manifestCheck === null;
  const manifestOk = manifestCheck?.ok === true;
  // updateId 非空 = 当前跑的 JS bundle 由 OTA 下发（而非 APK 内嵌）。
  const usingOtaBundle = Updates.updateId !== null;

  useEffect(() => {
    if (!visible || !otaEnabled) return;
    let cancelled = false;
    setManifestCheck(null);
    void checkOTAManifest(manifestUrl).then((result) => {
      if (cancelled) return;
      // 打到 logcat（ReactNativeJS tag），装机验证时可直接 grep 这一段。
      console.info(
        `[OTA] manifest check url=${manifestUrl} ok=${result.ok} status=${result.status} ` +
          `contentType=${result.contentType} protocolVersion=${result.protocolVersion} ` +
          `runtimeVersion=${result.runtimeVersion} updateId=${Updates.updateId ?? "embedded"} ` +
          `OTA_PATCH_MARKER=${OTA_PATCH_MARKER} error=${result.error ?? "none"}`,
      );
      setManifestCheck(result);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, otaEnabled, manifestUrl]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView
        style={[
          styles.safeArea,
          { paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0 },
        ]}
      >
        <StatusBar style="light" />
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Text style={styles.heroGlyph}>🎉</Text>
            <Text style={styles.badge}>v{version}</Text>
            <Text style={styles.title}>Coolie {version} 已就绪</Text>
            <Text style={styles.subtitle}>{note.title}</Text>
          </View>

          {/* 装机自检：装对没有，版本说了算 */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>装机自检</Text>
            <CheckRow ok label="APK 版本" value={`v${version}`} />
            <CheckRow
              ok={otaEnabled}
              label="OTA 热更新"
              value={otaEnabled ? "已启用" : "未启用"}
            />
            <CheckRow
              ok={runtimeMatches}
              label="OTA 运行时"
              value={runtimeVersion ?? "未知"}
            />
            <CheckRow
              ok={manifestOk}
              label="更新源"
              value={
                !otaEnabled
                  ? "未启用"
                  : manifestChecking
                    ? "检测中…"
                    : manifestOk
                      ? "已连通"
                      : "未连通"
              }
            />
            <CheckRow
              ok
              label="当前运行 bundle"
              value={usingOtaBundle ? "OTA 下发" : "APK 内嵌"}
            />
            {!otaEnabled ? (
              <Text style={styles.warn}>
                这台设备上的 App 没开 OTA —— 很可能是旧 APK。请从装机指南里的最新直链重装。
              </Text>
            ) : manifestChecking ? (
              <Text style={styles.hint}>正在检测更新源 {manifestUrl || "(未配置)"} …</Text>
            ) : !manifestOk ? (
              <>
                <Text style={styles.warn}>OTA 未启用, 当前用 APK 内嵌版本。</Text>
                <Text style={styles.hint}>
                  更新源 {manifestUrl || "(未配置)"} 不可用：{manifestCheck?.error ?? "未知原因"}
                </Text>
              </>
            ) : !runtimeMatches ? (
              <Text style={styles.hint}>
                运行时版本（{runtimeVersion}）与 APK 版本（{version}）不同：当前 bundle 由 OTA
                下发，属正常。杀后台重开一次即拉到最新。
              </Text>
            ) : usingOtaBundle ? (
              <Text style={styles.okText}>更新源连通，当前 bundle 由 OTA 下发。</Text>
            ) : (
              <Text style={styles.okText}>
                更新源连通；本次运行仍是 APK 内嵌 bundle，重启 App 即拉到最新。
              </Text>
            )}
          </View>

          {/* 本版功能点 */}
          <Text style={styles.sectionTitle}>本版更新</Text>
          {note.features.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <Ionicons
                name="checkmark-circle-outline"
                size={18}
                color={C.accent}
                style={styles.featureIcon}
              />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}

          {/* 动作 */}
          <View style={styles.actions}>
            {onViewDemo ? (
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={onViewDemo}>
                <Ionicons name="play-circle-outline" size={18} color={C.accent} />
                <Text style={styles.btnGhostText}>查看演示</Text>
              </Pressable>
            ) : null}
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onClose}>
              <Text style={styles.btnPrimaryText}>我知道了</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  content: {
    padding: SPACING.xl,
    paddingBottom: SPACING.xxl,
    gap: SPACING.lg,
  },
  hero: {
    alignItems: "center",
    gap: 6,
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  heroGlyph: {
    fontSize: 40,
  },
  badge: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "600",
    backgroundColor: "rgba(94,106,210,0.14)",
    borderColor: C.brand,
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 3,
    overflow: "hidden",
  },
  title: {
    color: C.ink,
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: -0.4,
    marginTop: SPACING.sm,
  },
  subtitle: {
    color: C.ink3,
    fontSize: 14,
    textAlign: "center",
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  cardTitle: {
    color: C.ink,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  checkLabel: {
    color: C.ink2,
    fontSize: 13,
    flex: 1,
  },
  checkValue: {
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  warn: {
    color: C.err,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  hint: {
    color: C.ink3,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  okText: {
    color: C.ok,
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
    marginTop: SPACING.sm,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },
  featureIcon: {
    marginTop: 1,
  },
  featureText: {
    color: C.ink2,
    fontSize: 14,
    lineHeight: 21,
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: RADIUS.md,
    paddingVertical: 13,
    flex: 1,
  },
  btnPrimary: {
    backgroundColor: C.brand,
  },
  btnPrimaryText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  btnGhost: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
  },
  btnGhostText: {
    color: C.accent,
    fontSize: 15,
    fontWeight: "500",
  },
});

export default WhatsNewScreen;
