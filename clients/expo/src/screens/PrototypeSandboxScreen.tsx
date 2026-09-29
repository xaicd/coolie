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
import { C, COOLIE_BASE_URL, getAuthToken } from "../coolie";
import { EmptyState } from "../ui/EmptyState";
import { ScreenHeader } from "../ui/ScreenHeader";
import { ExternalOpenSheet } from "../components/ExternalOpenSheet";
import { openInExternalApp } from "../utils/openExternalApp";

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

function generateMarkdownHtml(title: string, md: string): string {
  const lines = md.split("\n");
  let inCode = false;
  const codeBuffer: string[] = [];
  const htmlLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        htmlLines.push(`<pre><code>${codeBuffer.join("\n")}</code></pre>`);
        codeBuffer.length = 0;
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
      continue;
    }

    if (line.startsWith("# ")) {
      htmlLines.push(`<h1>${line.slice(2)}</h1>`);
    } else if (line.startsWith("## ")) {
      htmlLines.push(`<h2>${line.slice(3)}</h2>`);
    } else if (line.startsWith("### ")) {
      htmlLines.push(`<h3>${line.slice(4)}</h3>`);
    } else if (line.startsWith("> ")) {
      htmlLines.push(`<blockquote>${line.slice(2)}</blockquote>`);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      htmlLines.push(`<li>${line.slice(2)}</li>`);
    } else if (line.trim().length === 0) {
      htmlLines.push(`<div style="height: 8px;"></div>`);
    } else {
      const formatted = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, "<code>$1</code>");
      htmlLines.push(`<p>${formatted}</p>`);
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title}</title>
  <style>
    body {
      background-color: #08090A;
      color: #E6E6E6;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 16px 20px 48px;
      line-height: 1.6;
      font-size: 15px;
    }
    h1 { font-size: 20px; color: #FFFFFF; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px; margin-top: 16px; }
    h2 { font-size: 17px; color: #FFFFFF; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 6px; margin-top: 16px; }
    h3 { font-size: 15px; color: #9BA1A6; margin-top: 14px; }
    p { margin: 8px 0; color: #E6E6E6; }
    li { margin: 4px 0; color: #D1D5DB; }
    code {
      background: #191A1B;
      color: #828FFF;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
      font-family: monospace;
    }
    pre {
      background: #191A1B;
      border: 1px solid rgba(255,255,255,0.08);
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 12px 0;
    }
    pre code {
      background: transparent;
      padding: 0;
      color: #34D399;
    }
    blockquote {
      border-left: 3px solid #5E6AD2;
      background: rgba(94,106,210,0.08);
      margin: 12px 0;
      padding: 8px 14px;
      border-radius: 0 6px 6px 0;
      color: #9BA1A6;
    }
    strong { color: #FFFFFF; font-weight: 600; }
  </style>
</head>
<body>
  ${htmlLines.join("\n")}
</body>
</html>`;
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
  const [markdownHtml, setMarkdownHtml] = useState<string | null>(null);
  const [{ url, isSnapshot }, setResolved] = useState<{
    url: string | null;
    isSnapshot: boolean;
  }>(() => resolvePreviewUrl(_service, workProduct, initialUrl, bust));
  // 附件内容端点需要鉴权; WebView 与内容探测都带上 SecureStore 里的 bearer token。
  const [authHeaders, setAuthHeaders] = useState<Record<string, string> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void getAuthToken()
      .then((token) => {
        if (!cancelled) setAuthHeaders(token ? { Authorization: `Bearer ${token}` } : undefined);
      })
      .catch(() => {
        if (!cancelled) setAuthHeaders(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // DS 真值: useEffect(resolve, [sessionId]); 我们重入参 resolve() 一次
  useEffect(() => {
    let cancelled = false;
    const raw = resolvePreviewUrl(_service, workProduct, initialUrl, bust);
    const resolvedUrl = raw.url && raw.url.startsWith("/") ? `${COOLIE_BASE_URL}${raw.url}` : raw.url;
    setResolved({ url: resolvedUrl, isSnapshot: raw.isSnapshot });
    setLoading(false);
    setMarkdownHtml(null);

    const applySummaryFallback = () => {
      if (workProduct?.summary && (!resolvedUrl || resolvedUrl.endsWith(".md"))) {
        setMarkdownHtml(generateMarkdownHtml(workProduct.title ?? "产物概览", workProduct.summary));
      }
    };

    const isTextDocUrl =
      !!resolvedUrl &&
      (resolvedUrl.endsWith(".md") ||
        resolvedUrl.endsWith(".txt") ||
        resolvedUrl.includes("/docs/"));
    // wave136: 附件 URL 不带扩展名, 不能只看路径就断定它是文本文档 —— 先探一次
    // content-type: text/html(.htm) 的交付产物要交给 WebView 直接渲染真页面,
    // 而不是 fetch 成文本再走 markdown 渲染器(那会把 HTML 源码显示出来)。
    const isAttachmentUrl = !!resolvedUrl && resolvedUrl.includes("/attachments/");

    if (resolvedUrl && (isTextDocUrl || isAttachmentUrl)) {
      void (async () => {
        try {
          const token = await getAuthToken().catch(() => null);
          const res = await fetch(resolvedUrl, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
          if (cancelled) return;
          const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
          if (
            contentType.includes("text/html") ||
            contentType.includes("application/xhtml+xml")
          ) {
            // 保持 markdownHtml=null, 让 WebView 用 uri 加载渲染页面。
            return;
          }
          const text = await res.text();
          if (cancelled) return;
          setMarkdownHtml(generateMarkdownHtml(workProduct?.title ?? "产物文档", text));
        } catch {
          if (cancelled) return;
          applySummaryFallback();
        }
      })();
    } else {
      applySummaryFallback();
    }
  }, [_service, workProduct, initialUrl, bust]);

  const handleRefresh = useCallback(() => {
    setError(null);
    setBust(Date.now());
  }, []);

  const [showExternalSheet, setShowExternalSheet] = useState<boolean>(false);

  // wave107 (QA 报告 D02): 主入口直接走 QQ 浏览器优先 + 系统 fallback,
  // 不弹选择 sheet (跳出感强); 三选 sheet 仅作兜底 (fallback 抛错时).
  const handleOpenExternal = useCallback(() => {
    if (!url) return;
    void openInExternalApp(url, true).catch(() => {
      setShowExternalSheet(true);
    });
  }, [url]);

  // DS 真值: Web 端降级为「在浏览器打开」; 我们也是
  const canWebView = (!!url || !!markdownHtml) && Platform.OS !== "web";

  // DS 真值: 没链接且无可用预览内容就直接告诉他「暂无可用预览」
  if (!url && !markdownHtml) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <ScreenHeader onBack={onBack} backLabel="返回" title="原型交互沙箱" style={styles.header} />
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
          key={markdownHtml ? "markdown-preview" : isSnapshot ? url : `${url}`}
          source={
            markdownHtml
              ? { html: markdownHtml }
              : { uri: url ?? "", headers: authHeaders }
          }
          style={styles.web}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
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

      {/* 外部应用与浏览器选择底栏 */}
      <ExternalOpenSheet
        visible={showExternalSheet}
        url={url}
        title="打开原型外部应用"
        subtitle="推荐使用 QQ 浏览器（内置腾讯 TBS X5 内核秒开 Office/PDF 与原型），也可调用系统默认浏览器打开。"
        onClose={() => setShowExternalSheet(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0,
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    paddingHorizontal: 16,
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
  primaryBtnText: { color: C.ink, fontWeight: "600", fontSize: 14 },
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
  errBtn: { color: C.err, fontSize: 12, fontWeight: "600" },
  emptyWrap: { flex: 1 },
});