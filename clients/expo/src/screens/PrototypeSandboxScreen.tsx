import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  StatusBar as RNStatusBar,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { WebView, type WebViewNavigation } from "react-native-webview";
import type {
  Company,
  IssueWorkProduct,
  WorkspaceRuntimeService,
} from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { StatusDot } from "../components/StatusDot";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { Pill } from "../ui/Pill";
import { ScreenHeader } from "../ui/ScreenHeader";

const SafeWebView = WebView as unknown as React.ComponentType<any>;

export interface PrototypeSandboxScreenProps {
  company: Company;
  initialUrl?: string | null;
  service?: WorkspaceRuntimeService | null;
  workProduct?: IssueWorkProduct | null;
  onBack: () => void;
}

type ViewportMode = "fullscreen" | "mobile" | "desktop";

/**
 * 提取 URL 的主机名与端口 (例如: 192.168.1.100:3000 或 myapp.ts.net)
 */
function extractHostAndPort(url: string): string | null {
  try {
    const match = /^https?:\/\/([^/]+)/i.exec(url);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * 提取 URL 的 Origin (例如: http://192.168.1.100:3000)
 */
function extractOrigin(url: string): string | null {
  try {
    const match = /^(https?:\/\/[^/]+)/i.exec(url);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

const HTTP_URL_PATTERN = /https?:\/\/[^\s"'<>()[\]{},;，。]+/i;

/**
 * 从任意字符串中取首个 http(s) URL
 */
function firstHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = HTTP_URL_PATTERN.exec(value);
  return match ? match[0] : null;
}

/**
 * 轻量直开回退：从传入的 workProduct / artifact 中提取可直连预览的 http(s) 地址。
 * 优先级: work product url → metadata.previewUrl → metadata.resourceRef.url
 *        → 内容文本中的首个 URL → metadata 其余字符串字段中的首个 URL
 */
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

export function PrototypeSandboxScreen({
  company,
  initialUrl,
  service: initialService,
  workProduct,
  onBack,
}: PrototypeSandboxScreenProps) {
  const [services, setServices] = useState<WorkspaceRuntimeService[]>([]);
  const [selectedService, setSelectedService] = useState<WorkspaceRuntimeService | null>(
    initialService ?? null,
  );
  const [activeUrl, setActiveUrl] = useState<string>(
    initialUrl || initialService?.url || extractPreviewUrl(workProduct) || "",
  );
  const [urlInput, setUrlInput] = useState<string>(activeUrl);
  const [loadingServices, setLoadingServices] = useState(false);
  const [webLoading, setWebLoading] = useState(true);
  const [webError, setWebError] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [viewportMode, setViewportMode] = useState<ViewportMode>("fullscreen");
  const [blockedAttempt, setBlockedAttempt] = useState<string | null>(null);

  const webViewRef = useRef<WebView>(null);
  const companyId = company.id;

  // 轻量直开模式：无可用 runtime service 时，直接以 URL 预览（不依赖容器/K8s）
  const isLightweightPreview =
    !selectedService && services.length === 0 && Boolean(activeUrl);

  // 加载当前公司所有可用的 runtime services
  const loadServices = useCallback(async () => {
    setLoadingServices(true);
    try {
      const list = await coolie.listRuntimeServices(companyId);
      setServices(list);
      // 如果当前没有选定 URL 且有运行中的服务，默认选第一个包含 url 的服务
      if (!activeUrl) {
        const running = list.find((s) => s.url && s.status === "running");
        const anyWithUrl = running || list.find((s) => s.url);
        if (anyWithUrl && anyWithUrl.url) {
          setSelectedService(anyWithUrl);
          setActiveUrl(anyWithUrl.url);
          setUrlInput(anyWithUrl.url);
        }
      }
    } catch {
      // 容错处理
      setServices([]);
    } finally {
      setLoadingServices(false);
    }
  }, [companyId, activeUrl]);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  // 计算当前允许的白名单 Host / Origin
  const allowedWhitelist = useMemo(() => {
    if (!activeUrl) return { host: null, origin: null };
    return {
      host: extractHostAndPort(activeUrl),
      origin: extractOrigin(activeUrl),
    };
  }, [activeUrl]);

  /**
   * 沙箱安全拦截机制 (PRD 需求⑤核心规范):
   * 1. 允许同源/同主机内的路由跳转与静态资源加载
   * 2. 允许内置空协议 (about:blank, data:, blob:)
   * 3. 严格禁止导航到外部非 runtime 域名 (例如外链跳转、钓鱼跨站等)
   */
  const handleShouldStartLoadWithRequest = useCallback(
    (request: { url: string }): boolean => {
      const target = request.url;
      if (!target) return true;

      // 允许内置协议
      if (
        target.startsWith("about:") ||
        target.startsWith("data:") ||
        target.startsWith("blob:") ||
        target.startsWith("javascript:")
      ) {
        return true;
      }

      // 若未配置 runtime 目标，允许初始加载
      if (!allowedWhitelist.host && !allowedWhitelist.origin) {
        return true;
      }

      const reqHost = extractHostAndPort(target);
      const reqOrigin = extractOrigin(target);

      // 校验主机名或 Origin 是否吻合
      const isAllowed =
        (reqHost && reqHost === allowedWhitelist.host) ||
        (reqOrigin && reqOrigin === allowedWhitelist.origin);

      if (!isAllowed) {
        setBlockedAttempt(target);
        Alert.alert(
          "沙箱安全隔离拦截",
          `已阻止跳转到非原型域名：\n${target}\n\n沙箱已隔离外部 Cookie 与宿主凭据，杜绝跨站越权。`,
          [
            {
              text: "我知道了",
              onPress: () => setBlockedAttempt(null),
            },
          ],
        );
        return false;
      }

      return true;
    },
    [allowedWhitelist],
  );

  const handleSelectService = (srv: WorkspaceRuntimeService) => {
    setSelectedService(srv);
    if (srv.url) {
      setActiveUrl(srv.url);
      setUrlInput(srv.url);
      setWebError(null);
    }
  };

  const handleApplyUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    let finalUrl = trimmed;
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `http://${finalUrl}`;
    }
    setActiveUrl(finalUrl);
    setUrlInput(finalUrl);
    setWebError(null);
  };

  const handleReload = () => {
    setWebError(null);
    webViewRef.current?.reload();
  };

  const handleNavStateChange = (navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
    setCanGoForward(navState.canGoForward);
    if (navState.url && navState.url !== "about:blank") {
      setUrlInput(navState.url);
    }
  };

  const windowWidth = Dimensions.get("window").width;
  const isMobileMode = viewportMode === "mobile";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* 顶部主控制条 */}
      <View style={styles.topBar}>
        <View style={styles.topLeft}>
          <ScreenHeader onBack={onBack} backLabel="返回" style={styles.backBar} />

          <View style={styles.titleInfo}>
            <View style={styles.titleRow}>
              <Text style={styles.screenTitle} numberOfLines={1}>
                {selectedService?.serviceName || workProduct?.title || "原型交互沙箱"}
              </Text>
              <StatusDot
                status={
                  selectedService?.status === "running"
                    ? "ok"
                    : selectedService?.status === "failed"
                    ? "err"
                    : "idle"
                }
                size={7}
                pulse={selectedService?.status === "running"}
              />
            </View>
            <Text style={styles.subtitle} numberOfLines={1}>
              {selectedService
                ? `端口 ${selectedService.port ?? "N/A"} · ${selectedService.status}`
                : "隔离运行沙箱环境"}
            </Text>
          </View>
        </View>

        {/* 视口模式切换器 */}
        <View style={styles.viewportControl}>
          <Pressable
            style={[
              styles.viewportBtn,
              viewportMode === "fullscreen" && styles.viewportBtnActive,
            ]}
            onPress={() => setViewportMode("fullscreen")}
          >
            <Text
              style={[
                styles.viewportBtnText,
                viewportMode === "fullscreen" && styles.viewportBtnTextActive,
              ]}
            >
              全屏
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.viewportBtn,
              viewportMode === "mobile" && styles.viewportBtnActive,
            ]}
            onPress={() => setViewportMode("mobile")}
          >
            <Text
              style={[
                styles.viewportBtnText,
                viewportMode === "mobile" && styles.viewportBtnTextActive,
              ]}
            >
              📱 外框
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 轻量直开提示条 (无容器回退) */}
      {isLightweightPreview && (
        <View style={styles.lightweightBanner}>
          <Text style={styles.lightweightBannerText} numberOfLines={1}>
            ⚡ 轻量预览（直连 URL）· 未检测到容器服务，直接打开产物地址
          </Text>
        </View>
      )}

      {/* 运行中服务选择器胶囊条 (如有多个服务) */}
      {services.length > 0 && (
        <View style={styles.serviceSelectorBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.serviceList}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.servicePickerLabel}>服务:</Text>
            {services.map((srv) => {
              const isSelected = selectedService?.id === srv.id;
              const isRunning = srv.status === "running";
              return (
                <Pressable
                  key={srv.id}
                  onPress={() => handleSelectService(srv)}
                >
                  <Pill
                    style={isSelected ? styles.serviceChipActive : styles.serviceChip}
                  >
                    <StatusDot
                      status={isRunning ? "ok" : "idle"}
                      size={6}
                      pulse={isRunning}
                    />
                    <Text
                      style={[
                        styles.serviceChipText,
                        isSelected && styles.serviceChipTextActive,
                      ]}
                    >
                      {srv.serviceName} ({srv.port ?? "N/A"})
                    </Text>
                  </Pill>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* 沙箱安全地址栏与导航控制 */}
      <View style={styles.addressBar}>
        <View style={styles.urlInputBox}>
          <Text style={styles.shieldIcon}>🔒</Text>
          <TextInput
            style={styles.urlInput}
            value={urlInput}
            onChangeText={setUrlInput}
            placeholder="http://localhost:3000 或 runtime 暴露地址..."
            placeholderTextColor={C.ink3}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={handleApplyUrl}
          />
          {activeUrl !== urlInput && (
            <Pressable
              style={styles.goBtn}
              onPress={handleApplyUrl}
              hitSlop={8}
            >
              <Text style={styles.goBtnText}>进入</Text>
            </Pressable>
          )}
        </View>

        {/* 刷新与前进后退 */}
        <View style={styles.navActions}>
          <Pressable
            disabled={!canGoBack}
            onPress={() => webViewRef.current?.goBack()}
            style={[styles.navActionBtn, !canGoBack && styles.navActionDisabled]}
            hitSlop={8}
          >
            <Text style={styles.navActionText}>‹</Text>
          </Pressable>
          <Pressable
            disabled={!canGoForward}
            onPress={() => webViewRef.current?.goForward()}
            style={[styles.navActionBtn, !canGoForward && styles.navActionDisabled]}
            hitSlop={8}
          >
            <Text style={styles.navActionText}>›</Text>
          </Pressable>
          <Pressable
            onPress={handleReload}
            style={styles.navActionBtn}
            hitSlop={8}
          >
            <Text style={styles.navActionText}>↻</Text>
          </Pressable>
        </View>
      </View>

      {/* 拦截告警横条 */}
      {blockedAttempt && (
        <View style={styles.blockedBanner}>
          <Text style={styles.blockedBannerText} numberOfLines={1}>
            🛡️ 已拦截非沙箱导航: {blockedAttempt}
          </Text>
          <Pressable onPress={() => setBlockedAttempt(null)}>
            <Text style={styles.blockedClose}>✕</Text>
          </Pressable>
        </View>
      )}

      {/* 原型预览区域 (支持手机外框或全屏) */}
      <View style={styles.sandboxContainer}>
        {!activeUrl ? (
          <EmptyState
            variant="standalone"
            icon={<Text style={styles.emptyPromptIcon}>⚡</Text>}
            title="未检测到正在运行的原型服务"
            subtitle="AI 智能体在工作区中启动 Web 服务（如 Vite / Next.js）后，地址将自动投影至此。也可直接输入预览地址即时查看。"
            action={
              <>
                <View style={styles.emptyInputRow}>
                  <TextInput
                    style={styles.emptyInput}
                    value={urlInput}
                    onChangeText={setUrlInput}
                    placeholder="输入预览地址 (http://…)"
                    placeholderTextColor={C.ink3}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    returnKeyType="go"
                    onSubmitEditing={handleApplyUrl}
                  />
                  <Pressable
                    style={[
                      styles.emptyInputBtn,
                      !urlInput.trim() && styles.emptyInputBtnDisabled,
                    ]}
                    onPress={handleApplyUrl}
                    disabled={!urlInput.trim()}
                  >
                    <Text style={styles.emptyInputBtnText}>打开</Text>
                  </Pressable>
                </View>
                <Pressable style={styles.emptyRefreshBtn} onPress={loadServices}>
                  <Text style={styles.emptyRefreshBtnText}>
                    {loadingServices ? "扫描中…" : "刷新服务列表"}
                  </Text>
                </Pressable>
              </>
            }
            style={styles.emptyPrompt}
          />
        ) : (
          <View
            style={[
              styles.viewportWrapper,
              isMobileMode && [
                styles.mobileFrame,
                { width: Math.min(windowWidth - 32, 390) },
              ],
            ]}
          >
            {isMobileMode && (
              <View style={styles.mobileFrameHeader}>
                <View style={styles.mobileNotch} />
              </View>
            )}

            <View style={styles.webviewWrapper}>
              {webLoading && (
                <LoadingState
                  mode="spinner"
                  size="small"
                  text="加载原型环境中…"
                  style={styles.webviewLoader}
                />
              )}

              {webError ? (
                <ErrorRetry
                  variant="card"
                  title="无法连接到原型服务"
                  message={`${webError}\n请确认工作区内的开发服务器是否已启动并正常暴露端口。`}
                  onRetry={handleReload}
                  style={styles.errorContainer}
                />
              ) : (
                <SafeWebView
                  ref={webViewRef}
                  source={{ uri: activeUrl }}
                  style={styles.webview}
                  /* ── 沙箱隔离核心配置 ── */
                  javaScriptEnabled={true}
                  sharedCookiesEnabled={false}
                  thirdPartyCookiesEnabled={false}
                  domStorageEnabled={true}
                  incognito={true}
                  /* ── 白名单导航拦截 ── */
                  onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
                  onNavigationStateChange={handleNavStateChange}
                  onLoadStart={() => {
                    setWebLoading(true);
                    setWebError(null);
                  }}
                  onLoadEnd={() => setWebLoading(false)}
                  onError={(syntheticEvent: { nativeEvent: { description?: string; code?: number } }) => {
                    const { nativeEvent } = syntheticEvent;
                    setWebLoading(false);
                    setWebError(
                      `${nativeEvent.description || "连接超时或拒绝连接"} (代码: ${nativeEvent.code ?? "N/A"})`,
                    );
                  }}
                />
              )}
            </View>

            {isMobileMode && (
              <View style={styles.mobileFrameFooter}>
                <View style={styles.homeBar} />
              </View>
            )}
          </View>
        )}
      </View>

      {/* 底部安全隔离状态栏 */}
      <View style={styles.securityFooter}>
        <Text style={styles.securityBadge}>
          🔒 沙箱已隔离: sharedCookies=false · 仅允许 runtime 域名
        </Text>
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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  topLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  backBar: {
    alignSelf: "center",
  },
  titleInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  screenTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  subtitle: {
    color: C.ink3,
    fontSize: 11,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  viewportControl: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 6,
    padding: 2,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  viewportBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  viewportBtnActive: {
    backgroundColor: "rgba(94, 106, 210, 0.2)",
  },
  viewportBtnText: {
    color: C.ink3,
    fontSize: 11,
  },
  viewportBtnTextActive: {
    color: C.accent,
    fontWeight: "500",
  },
  serviceSelectorBar: {
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
    paddingVertical: 6,
  },
  serviceList: {
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  servicePickerLabel: {
    color: C.ink4,
    fontSize: 11,
    marginRight: 2,
  },
  serviceChip: {
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.lineSubtle,
  },
  serviceChipActive: {
    gap: 6,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    borderColor: "rgba(94, 106, 210, 0.35)",
  },
  serviceChipText: {
    color: C.ink3,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  serviceChipTextActive: {
    color: C.accent,
    fontWeight: "500",
  },
  addressBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  urlInputBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 34,
  },
  shieldIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  urlInput: {
    flex: 1,
    color: C.ink,
    fontSize: 12,
    paddingVertical: 0,
    fontVariant: ["tabular-nums"],
  },
  goBtn: {
    backgroundColor: C.brand,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  goBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "500",
  },
  navActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  navActionBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  navActionDisabled: {
    opacity: 0.3,
  },
  navActionText: {
    color: C.ink2,
    fontSize: 14,
    fontWeight: "600",
  },
  blockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(239, 68, 68, 0.3)",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  blockedBannerText: {
    color: C.err,
    fontSize: 11,
    flex: 1,
  },
  blockedClose: {
    color: C.err,
    fontSize: 12,
    paddingLeft: 8,
  },
  lightweightBanner: {
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(94, 106, 210, 0.3)",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  lightweightBannerText: {
    color: C.accent,
    fontSize: 11,
  },
  sandboxContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.bg,
  },
  viewportWrapper: {
    flex: 1,
    width: "100%",
    backgroundColor: "#000000",
  },
  mobileFrame: {
    flex: 0,
    height: "92%",
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "#000000",
    marginVertical: 12,
  },
  mobileFrameHeader: {
    height: 24,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  mobileNotch: {
    width: 90,
    height: 12,
    backgroundColor: "#161618",
    borderRadius: 6,
  },
  mobileFrameFooter: {
    height: 16,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  homeBar: {
    width: 100,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderRadius: 2,
  },
  webviewWrapper: {
    flex: 1,
    position: "relative",
  },
  webview: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  webviewLoader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(8, 9, 10, 0.7)",
    zIndex: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: C.bg,
    borderWidth: 0,
  },
  emptyPrompt: {
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyPromptIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  emptyInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    width: "100%",
    maxWidth: 360,
  },
  emptyInput: {
    flex: 1,
    height: 34,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: C.ink,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  emptyInputBtn: {
    backgroundColor: C.brand,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  emptyInputBtnDisabled: {
    opacity: 0.4,
  },
  emptyInputBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
  },
  emptyRefreshBtn: {
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  emptyRefreshBtnText: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "500",
  },
  securityFooter: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: C.panel,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
    alignItems: "center",
  },
  securityBadge: {
    color: C.ink4,
    fontSize: 10,
    fontVariant: ["tabular-nums"],
  },
});
