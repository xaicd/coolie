/**
 * Coolie工坊 原型交互沙箱 — wave56 真仿 DS PreviewWebView.tsx (134 行)
 *
 * 仿 DS 真值 (boss 09-23 24:40 「你确定认真学习 digitalstaff 的预览了吗, 最新的预览」):
 *   A. 工具条: [关闭] + URL tag (LIVE / SNAPSHOT) + [刷新] + [浏览器打开]
 *   B. 同源代理: 走 <apiBase>/api/tasks/host-preview/<sessionId>/?token=<jwt>&_t=<bust>
 *      —— DS 端是真值; 我们后端目前没有 host-preview 代理端点 (见下方「真值 vs 现状」)
 *   C. React Native WebView (Platform.OS !== 'web') + originWhitelist=["*"]
 *   D. Linking.openURL External Link (跳 OS 浏览器)
 *   E. Empty state: 「预览未就绪」/「完成任务后将显示预览」
 *
 * 真值 vs 现状 (boss 09-23 24:40):
 *   DS PreviewWebView.tsx 的 sessionId-keyed host-preview 是建立在他们后端
 *   「GET /api/tasks/host-preview/<sessionId>/」同源代理 + 「GET
 *   /api/ide-sessions/<id>/snapshots/by-task/<taskId>/url」快照回放上的。
 *   我们的 server/src 暂无这两个端点 (grep 验证过)。本文件先用我们已有的
 *   service.url (LIVE 实时工作空间) / workProduct.url (SNAPSHOT 历史工作产品)
 *   顶上 — DS 工具条/标签/刷新/外链四项 UI 真值全部保留; 后续补 host-preview
 *   代理时只需把 resolve() 换成 buildHostPreviewUrl(sessionId) 即可, UI 不动。
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
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

/** 从 work product / artifact metadata 里直拿到预览 URL (轻量直开回退) */
function extractPreviewUrl(workProduct: IssueWorkProduct | null | undefined): string | null {
  if (!workProduct) return null;
  return (
    workProduct.url ||
    ((workProduct.metadata as Record<string, unknown> | null)?.previewUrl as
      | string
      | undefined) ||
    null
  );
}

/** 解析预览 URL 优先 LIVE (service.url) 否则 SNAPSHOT (workProduct.url)。
 *  DS 真值: buildHostPreviewUrl(sessionId) + fetchSnapshotPreviewUrl(sessionId, taskId)。
 *  我们后端无这两个端点, 暂用 service.id 作 session 键, 后续补代理时把
 *  内部实现换成 DS 的 buildHostPreviewUrl 即可, 工具条不变。 */
function resolvePreviewUrl(
  service: WorkspaceRuntimeService | null | undefined,
  workProduct: IssueWorkProduct | null | undefined,
  initialUrl: string | null | undefined,
  bust: number,
): { url: string | null; isSnapshot: boolean } {
  const live = service?.url?.length ? service.url : null;
  const snap = extractPreviewUrl(workProduct) || initialUrl || null;
  if (live) {
    // LIVE: 同源代理应在后端给我们带 _t 防缓存; 直 URL 时我们手加
    const sep = live.includes("?") ? "&" : "?";
    return { url: `${live}${sep}_t=${bust}`, isSnapshot: false };
  }
  // SNAPSHOT: 签名 URL 原样使用, 不追加 query (避免破坏签名)
  return { url: snap, isSnapshot: !!snap };
}

export function PrototypeSandboxScreen({
  company: _company,
  initialUrl,
  service: _service,
  workProduct,
  onBack,
}: PrototypeSandboxScreenProps) {
  const [bust, setBust] = useState<number>(() => Date.now());
  const [loading, setLoading] = useState<boolean>(true);
  const [webLoading, setWebLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [{ url, isSnapshot }, setResolved] = useState<{
    url: string | null;
    isSnapshot: boolean;
  }>(() => resolvePreviewUrl(_service, workProduct, initialUrl, bust));

  // DS 真值: useEffect(resolve, [sessionId]); 我们重入参 resolve() 一次
  useEffect(() => {
    setResolved(resolvePreviewUrl(_service, workProduct, initialUrl, bust));
    setLoading(false);
  }, [_service, workProduct, initialUrl, bust]);

  const handleRefresh = useCallback(() => {
    setError(null);
    setBust(Date.now());
  }, []);

  const handleOpenExternal = useCallback(() => {
    if (!url) return;
    void Linking.openURL(url).catch(() => {
      // 静默失败 —— 「跳到 OS 浏览器」是可选动作, 失败就让用户留在沙箱内
    });
  }, [url]);

  // DS 真值: Web 端降级为「在浏览器打开」; 我们也是
  const canWebView = !!url && Platform.OS !== "web";

  // DS 真值: 没链接就直接告诉他「暂无可用预览」, 不堆输入框
  if (!url) {
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* 工具条 — 仿 DS PreviewWebView 真值: 关闭 + tag + 刷新 + 浏览器打开 */}
      <View style={styles.toolbar}>
        <Pressable
          onPress={onBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.toolBtn}
        >
          <Text style={styles.closeText}>关闭</Text>
        </Pressable>

        <View style={styles.toolMid}>
          <View
            style={[
              styles.tag,
              isSnapshot ? styles.tagSnap : styles.tagLive,
            ]}
          >
            <Text style={styles.tagText}>
              {isSnapshot ? "SNAPSHOT" : "LIVE"}
            </Text>
          </View>
          {(webLoading || loading) && (
            <Text style={styles.loadingHint}>加载中…</Text>
          )}
        </View>

        <View style={styles.toolRight}>
          <Pressable
            onPress={handleRefresh}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.toolBtn}
          >
            <Text style={styles.barBtn}>刷新</Text>
          </Pressable>
          <Pressable
            onPress={handleOpenExternal}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.toolBtn}
          >
            <Text style={styles.barBtn}>浏览器打开</Text>
          </Pressable>
        </View>
      </View>

      {/* 主体 */}
      {loading ? (
        <View style={styles.center}>
          <Text style={styles.hint}>加载预览…</Text>
        </View>
      ) : canWebView ? (
        <WebView
          key={isSnapshot ? url : `${url}`}
          source={{ uri: url }}
          style={styles.web}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          onLoadStart={() => setWebLoading(true)}
          onLoadEnd={() => setWebLoading(false)}
          onError={() => {
            setWebLoading(false);
            setError("页面加载失败 · 工作空间可能尚无可预览内容");
          }}
          onHttpError={(syntheticEvent: {
            nativeEvent: { statusCode?: number };
          }) => {
            const code = syntheticEvent.nativeEvent.statusCode;
            setWebLoading(false);
            if (code === 404) setError("工作空间暂无 index.html 或可预览页面");
            else if (code && code >= 500) setError("预览服务错误 · 稍后刷新重试");
            else if (code) setError(`HTTP ${code}`);
          }}
        />
      ) : url && Platform.OS === "web" ? (
        <View style={styles.center}>
          <Text style={styles.hint}>Web 端不内嵌 WebView</Text>
          <Pressable style={styles.primaryBtn} onPress={handleOpenExternal}>
            <Text style={styles.primaryBtnText}>在浏览器打开预览</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🖥️</Text>
          <Text style={styles.hint}>{error || "暂无可用预览"}</Text>
          <Pressable style={styles.primaryBtn} onPress={handleRefresh}>
            <Text style={styles.primaryBtnText}>重试</Text>
          </Pressable>
        </View>
      )}

      {/* 加载错误横幅 — DS 真值: 有 URL 但代理报错时 */}
      {url && error && (
        <View style={styles.errBar}>
          <Text style={styles.errText} numberOfLines={1}>
            {error}
          </Text>
          <Pressable onPress={handleRefresh} hitSlop={6}>
            <Text style={styles.errBtn}>刷新</Text>
          </Pressable>
        </View>
      )}
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
    gap: 8,
  },
  toolBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  closeText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: "600",
  },
  toolMid: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  toolRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  barBtn: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "600",
  },
  tag: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  tagLive: {
    borderColor: "rgba(52,211,153,0.5)",
    backgroundColor: "rgba(52,211,153,0.12)",
  },
  tagSnap: {
    borderColor: "rgba(167,139,250,0.5)",
    backgroundColor: "rgba(167,139,250,0.12)",
  },
  tagText: {
    color: C.ink,
    fontSize: 11,
    fontWeight: "600",
  },
  loadingHint: {
    color: C.ink3,
    fontSize: 11,
  },
  web: { flex: 1, backgroundColor: "#FFFFFF" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 14,
    backgroundColor: C.bg,
  },
  emptyIcon: { fontSize: 40 },
  hint: { color: C.ink3, fontSize: 14, textAlign: "center", lineHeight: 20 },
  primaryBtn: {
    backgroundColor: C.brand,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  errBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(251,113,133,0.12)",
    borderTopColor: "rgba(251,113,133,0.4)",
    borderTopWidth: 1,
  },
  errText: { color: C.err, fontSize: 12, flex: 1 },
  errBtn: { color: C.err, fontSize: 12, fontWeight: "700" },
  emptyWrap: { flex: 1 },
});