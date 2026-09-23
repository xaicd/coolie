/**
 * Coolie工坊 原型交互沙箱 — wave55 真仿 DS PreviewPanel.tsx (180 行简洁)
 *
 * 仿 DS 真值 (boss 09-22 24:40 「你确定认真学习 digitalstaff 的预览了吗」):
 *   A. 视口切换: desktop (100%) / tablet (768px) / mobile (375px) — Ionicons
 *   B. Refresh 按钮 (refresh-outline)
 *   C. External Link 按钮 (open-outline → Linking.openURL, 跳出 OS browser)
 *   D. WebView 渲染预览 URL
 *   E. Empty state (「预览未就绪」/「完成任务后将显示预览」)
 *
 * 删 wave54 +302 行 (HOST PREVIEW banner + SESSION URL 三段 + sandbox 安全 footer +
 * logs panel — DS 真没有, 是 PM 臆想的)。
 */

import React, { useState } from "react";
import {
  Dimensions,
  Linking,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Platform,
  StatusBar as RNStatusBar,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import type {
  Company,
  IssueWorkProduct,
  WorkspaceRuntimeService,
} from "@coolie/api-client";
import { C } from "../coolie";
import { EmptyState } from "../ui/EmptyState";
import { ScreenHeader } from "../ui/ScreenHeader";

export interface PrototypeSandboxScreenProps {
  company: Company;
  initialUrl?: string | null;
  // 保留以兼容 App.tsx 调用契约; DS 真值不展示 runtime service 信息
  service?: WorkspaceRuntimeService | null;
  workProduct?: IssueWorkProduct | null;
  onBack: () => void;
}

type ViewportMode = "desktop" | "tablet" | "mobile";

/** 提取 URL 中首个 http(s) 地址 (workProduct.url / metadata.previewUrl / 内容里) */
function firstHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /https?:\/\/[^\s"'<>()[\]{},;，。]+/i.exec(value);
  return match ? match[0] : null;
}

/** 从 work product / artifact metadata 里直拿到预览 URL (轻量直开回退) */
function extractPreviewUrl(workProduct: IssueWorkProduct | null | undefined): string | null {
  if (!workProduct) return null;
  const metadata = (workProduct.metadata ?? {}) as Record<string, unknown>;
  const resourceRef = (metadata.resourceRef ?? {}) as Record<string, unknown>;
  const candidates: unknown[] = [
    workProduct.url,
    metadata.previewUrl,
    metadata.previewURL,
    resourceRef.url,
    metadata.url,
    workProduct.summary,
  ];
  for (const candidate of candidates) {
    const url = firstHttpUrl(candidate);
    if (url) return url;
  }
  for (const value of Object.values(metadata)) {
    const url = firstHttpUrl(value);
    if (url) return url;
  }
  return null;
}

interface ViewportSpec {
  width: number | string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

const VIEWPORTS: Record<ViewportMode, ViewportSpec> = {
  desktop: { width: "100%", icon: "desktop-outline", label: "桌面" },
  tablet: { width: 768, icon: "tablet-portrait-outline", label: "平板" },
  mobile: { width: 375, icon: "phone-portrait-outline", label: "手机" },
};

export function PrototypeSandboxScreen({
  company: _company,
  initialUrl,
  service: _service,
  workProduct,
  onBack,
}: PrototypeSandboxScreenProps) {
  // 把 workProduct / initialUrl 拼成一个稳定 URL; 任一来源有就用
  const initialResolved =
    initialUrl || extractPreviewUrl(workProduct) || "";
  const [previewUrl] = useState<string>(initialResolved);
  const [viewport, setViewport] = useState<ViewportMode>("desktop");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [webError, setWebError] = useState<string | null>(null);
  const [key, setKey] = useState<number>(0);

  const handleRefresh = () => {
    setWebError(null);
    setKey((k) => k + 1);
  };

  const handleOpenExternal = () => {
    if (!previewUrl) return;
    void Linking.openURL(previewUrl).catch(() => {
      // 静默失败 —— 这是「跳到 OS browser」的可选动作, 失败就让用户留在沙箱内
    });
  };

  const windowWidth = Dimensions.get("window").width;
  const isMobileMode = viewport === "mobile";
  const viewportSpec = VIEWPORTS[viewport];

  // DS 真没有「空态用大输入框直接输 URL」这种重 UI — 一个干净的 placeholder 就够。
  // 真要看预览, 用户从原型任务详情点进; 这里没链接就告诉他等任务跑完。
  if (!previewUrl) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <ScreenHeader onBack={onBack} backLabel="返回" title="原型交互沙箱" />
        <View style={styles.emptyWrap}>
          <EmptyState
            variant="standalone"
            icon={<Text style={styles.emptyIcon}>🚀</Text>}
            title="预览未就绪"
            subtitle="完成任务后将显示预览"
          />
        </View>
      </SafeAreaView>
    );
  }

  const viewportWidth =
    viewportSpec.width === "100%"
      ? windowWidth
      : Math.min(windowWidth - 32, viewportSpec.width as number);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Toolbar: 视口切换 (左) + Refresh + External link (右) — 仿 DS 真值 */}
      <View style={styles.toolbar}>
        <View style={styles.viewportGroup}>
          {(Object.keys(VIEWPORTS) as ViewportMode[]).map((mode) => {
            const spec = VIEWPORTS[mode];
            const active = mode === viewport;
            return (
              <Pressable
                key={mode}
                onPress={() => setViewport(mode)}
                style={[styles.viewportBtn, active && styles.viewportBtnActive]}
                hitSlop={6}
              >
                <Ionicons
                  name={spec.icon}
                  size={16}
                  color={active ? C.accent : C.ink3}
                />
                <Text
                  style={[
                    styles.viewportBtnText,
                    active && styles.viewportBtnTextActive,
                  ]}
                >
                  {spec.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={handleRefresh}
            disabled={isLoading}
            style={[styles.iconBtn, isLoading && styles.iconBtnDisabled]}
            hitSlop={8}
          >
            <Ionicons
              name="refresh-outline"
              size={18}
              color={isLoading ? C.ink4 : C.ink2}
            />
          </Pressable>
          <Pressable
            onPress={handleOpenExternal}
            style={styles.iconBtn}
            hitSlop={8}
          >
            <Ionicons name="open-outline" size={18} color={C.ink2} />
          </Pressable>
        </View>
      </View>

      {/* iframe WebView: originWhitelist + javaScriptEnabled + domStorageEnabled
          + cacheEnabled (RN WebView 没 sandbox attr; originWhitelist 起到近似白名单作用) */}
      <View style={styles.viewportOuter}>
        <View
          style={[
            styles.viewportInner,
            isMobileMode ? styles.mobileFrame : styles.desktopFrame,
            { width: viewportWidth },
          ]}
        >
          {webError ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={28} color={C.err} />
              <Text style={styles.errorTitle}>无法连接到原型服务</Text>
              <Text style={styles.errorMessage}>{webError}</Text>
              <Pressable style={styles.retryBtn} onPress={handleRefresh}>
                <Text style={styles.retryBtnText}>重试</Text>
              </Pressable>
            </View>
          ) : (
            <WebView
              key={key}
              source={{ uri: previewUrl }}
              style={styles.webview}
              originWhitelist={["*"]}
              javaScriptEnabled
              domStorageEnabled
              cacheEnabled
              sharedCookiesEnabled={false}
              thirdPartyCookiesEnabled={false}
              incognito
              onLoadStart={() => setIsLoading(true)}
              onLoadEnd={() => setIsLoading(false)}
              onHttpError={(syntheticEvent: { nativeEvent: { statusCode?: number } }) => {
                setIsLoading(false);
                const code = syntheticEvent.nativeEvent.statusCode;
                setWebError(code ? `HTTP ${code}` : "无法连接到原型服务");
              }}
              onError={(syntheticEvent: {
                nativeEvent: { description?: string; code?: number };
              }) => {
                setIsLoading(false);
                const { description, code } = syntheticEvent.nativeEvent;
                setWebError(
                  `${description || "连接超时或拒绝连接"} (代码: ${code ?? "N/A"})`,
                );
              }}
              renderError={(errorDomain: string | undefined) => (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={28} color={C.err} />
                  <Text style={styles.errorTitle}>{errorDomain || "加载失败"}</Text>
                  <Pressable style={styles.retryBtn} onPress={handleRefresh}>
                    <Text style={styles.retryBtnText}>重试</Text>
                  </Pressable>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0,
    flex: 1,
    backgroundColor: C.bg,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  viewportGroup: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  viewportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  viewportBtnActive: {
    backgroundColor: "rgba(94, 106, 210, 0.18)",
  },
  viewportBtnText: {
    color: C.ink3,
    fontSize: 11,
    fontWeight: "500",
  },
  viewportBtnTextActive: {
    color: C.accent,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  iconBtnDisabled: {
    opacity: 0.4,
  },
  emptyWrap: {
    flex: 1,
  },
  emptyIcon: {
    fontSize: 40,
  },
  viewportOuter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: C.bg,
  },
  viewportInner: {
    flex: 1,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "#FFFFFF",
  },
  desktopFrame: {
    height: "100%",
  },
  mobileFrame: {
    height: "92%",
    maxWidth: 390,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "#000000",
  },
  webview: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  errorBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: C.bg,
    gap: 8,
  },
  errorTitle: {
    color: C.ink,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
  },
  errorMessage: {
    color: C.ink3,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: C.brand,
    borderRadius: 6,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
  },
});