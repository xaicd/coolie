/**
 * Coolie工坊 原型交互沙箱 — wave138c
 *
 * 在 wave136 真渲染通道之上叠加「文件列表视图」:
 *   · 顶部 segmented 切换 列表 / 预览 两个视图。
 *   · 列表: 列出当前上下文(任务/项目)全部交付物与附件
 *     (名称 | 类型徽标 | 大小 | 时间 | 产出者), 可按类型筛选(html/图片/视频/文档),
 *     点击任一文件 → 切到预览视图渲染它。
 *   · 预览: 保留 wave136 语义 —— HTML 交付物「带凭据取回正文 + baseUrl 注入 WebView」
 *     真渲染(不再依赖 WebView 的 cookie 存储); 图片走 expo-image 原生; 视频走 expo-av
 *     原生; 文本/文档走 WebView(text/html inline + 沙箱 CSP)。
 *   · 列表为空 → 信息充分的可操作空态(说明原因 + CTA), 不再是一句空话。
 *
 * wave136 真值回放 (不可回退):
 *   A. 工具条: [‹ 列表] + URL tag (LIVE / SNAPSHOT) + [刷新] + [浏览器打开]
 *   B. HTML 交付物: RN 侧 credentials:"include" 取回正文, 以 baseUrl=交付物 URL 注入
 *      WebView 渲染, 并注入与 server HTML_ATTACHMENT_CONTENT_SECURITY_POLICY 对齐的
 *      meta CSP(connect-src 'none' 断脚本外发)。
 *   C. wave141 版本链 chip 行(入口交付物有多个版本时可切换)。
 *   D. 会话登录走 /api/auth/exchange 桥给 WebView 落 cookie。
 *   E. 本屏固定渲染在原生壳内(顶部状态栏与底部 TabBar 之间), 不再整屏覆盖。
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { Image } from "expo-image";
import { ResizeMode, Video } from "expo-av";
import type {
  Company,
  IssueAttachment,
  IssueWorkProduct,
  WorkProductVersion,
  WorkspaceRuntimeService,
} from "@coolie/api-client";
import { C, COOLIE_BASE_URL, coolie, getAuthToken, getWebExchangeToken } from "../coolie";
import { EmptyState } from "../ui/EmptyState";
import { ScreenHeader } from "../ui/ScreenHeader";
import { SegmentedControl } from "../ui/SegmentedControl";
import { ExternalOpenSheet } from "../components/ExternalOpenSheet";
import { openInExternalApp } from "../utils/openExternalApp";

/** 当前沙箱上下文 —— 决定列表视图列出哪些交付物与附件。 */
export interface SandboxScope {
  issueId?: string | null;
  issueTitle?: string | null;
  projectId?: string | null;
  projectName?: string | null;
}

export interface PrototypeSandboxScreenProps {
  company: Company;
  initialUrl?: string | null;
  // 保留以兼容 App.tsx 调用契约; DS 真值不展示 runtime service 信息
  service?: WorkspaceRuntimeService | null;
  workProduct?: IssueWorkProduct | null;
  /** wave138c — 列表视图的数据范围(任务/项目)。缺省时列表只含入口项。 */
  scope?: SandboxScope | null;
  onBack: () => void;
  /** 空态 CTA: 去创建任务 */
  onCreateTask?: () => void;
  /** 空态 CTA: 查看任务 */
  onOpenTask?: (issueId: string) => void;
  /** 空态 CTA: 去交付产物中心 */
  onOpenArtifacts?: () => void;
}

type ViewMode = "list" | "preview";
type KindFilter = "all" | "html" | "image" | "video" | "document";
type DeliverableKind = "html" | "image" | "video" | "document" | "text" | "file";

interface SandboxDeliverable {
  key: string;
  title: string;
  kind: DeliverableKind;
  contentType: string | null;
  size: number | null;
  createdAt: string | null;
  producer: string | null;
  url: string | null;
  downloadUrl: string | null;
  source: "work_product" | "attachment" | "document";
  versionLabel: string | null;
}

// ── 展示辅助 ────────────────────────────────────────────────────────────────

const KIND_META: Record<
  DeliverableKind,
  { icon: string; label: string; color: string; bg: string }
> = {
  html: { icon: "🌐", label: "网页", color: C.accent, bg: "rgba(94,106,210,0.12)" },
  image: { icon: "🖼️", label: "图片", color: C.ok, bg: "rgba(39,166,68,0.12)" },
  video: { icon: "🎬", label: "视频", color: "#38BDF8", bg: "rgba(56,189,248,0.12)" },
  document: { icon: "📄", label: "文档", color: C.warn, bg: "rgba(245,158,11,0.12)" },
  text: { icon: "📝", label: "文本", color: C.ink2, bg: "rgba(255,255,255,0.05)" },
  file: { icon: "📎", label: "文件", color: C.ink3, bg: "rgba(255,255,255,0.04)" },
};

const EXT_KIND: Array<[RegExp, DeliverableKind]> = [
  [/\.(html?|xhtml)$/i, "html"],
  [/\.(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/i, "image"],
  [/\.(mp4|webm|mov|m4v|avi|mkv)$/i, "video"],
  [/\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf)$/i, "document"],
  [/\.(md|markdown|txt|json|csv|ya?ml|xml|log)$/i, "text"],
];

/** 由 content-type + 文件名 + URL 推断展示类型(html/图片/视频/文档/文本/文件)。 */
function classifyKind(
  contentType: string | null | undefined,
  filename: string | null | undefined,
  url: string | null | undefined,
): DeliverableKind {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("text/html") || ct.includes("application/xhtml")) return "html";
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("video/")) return "video";
  if (
    ct.includes("pdf") ||
    ct.includes("msword") ||
    ct.includes("officedocument") ||
    ct.includes("opendocument") ||
    ct.includes("rtf")
  ) {
    return "document";
  }
  if (
    ct.startsWith("text/") ||
    ct.includes("json") ||
    ct.includes("xml") ||
    ct.includes("markdown")
  ) {
    return "text";
  }
  const probe = `${filename ?? ""} ${url ?? ""}`.split("?")[0];
  for (const [re, kind] of EXT_KIND) {
    if (re.test(probe)) return kind;
  }
  return "file";
}

function formatBytes(size: number | null | undefined): string {
  if (size == null || !Number.isFinite(size)) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch {
    return "—";
  }
}

function absoluteUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${COOLIE_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function metaString(wp: IssueWorkProduct, key: string): string | null {
  const value = (wp.metadata as Record<string, unknown> | null | undefined)?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function metaNumber(wp: IssueWorkProduct, key: string): number | null {
  const value = (wp.metadata as Record<string, unknown> | null | undefined)?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

/** 解析入口预览 URL 优先 LIVE (service.url) 否则 SNAPSHOT (workProduct.url)。
 *  DS 真值: buildHostPreviewUrl(sessionId) + fetchSnapshotPreviewUrl(sessionId, taskId)。
 *  我们后端无这两个端点, 暂用 service.id 作 session 键, 后续补代理时把
 *  内部实现换成 DS 的 buildHostPreviewUrl 即可, 工具条不变。 */
function resolvePreviewUrl(
  service: WorkspaceRuntimeService | null | undefined,
  workProduct: IssueWorkProduct | null | undefined,
  initialUrl: string | null | undefined,
  bust: number,
  overrideUrl?: string | null,
): { url: string | null; isSnapshot: boolean } {
  // wave141 — 用户在版本链里选中的历史版本优先展示 (始终按 SNAPSHOT 处理)。
  if (overrideUrl) return { url: overrideUrl, isSnapshot: true };
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

// wave136: 交付产物是 HTML 时, 我们在 RN 侧带凭据把它取回来再交给 WebView 渲染。
// 这样不依赖 WebView 自己的 cookie 存储 —— Android 上 sharedCookiesEnabled 无效,
// 且实测旧内核的 WebView 会把 exchange 302 的 Set-Cookie 丢掉, 附件请求变匿名
// 而 404。参数与 server 端 HTML_ATTACHMENT_CONTENT_SECURITY_POLICY 对齐:
// connect-src 'none' 断脚本外发; sandbox 只能由响应头下发, meta 不支持, 所以这里
// 退一步只约束资源与网络, 页面仍在 App 自己的 WebView 内执行。
const INLINE_HTML_CSP =
  "default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src 'self' data:; media-src 'self' blob: data:; connect-src 'none'";

function withInlineHtmlCsp(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${INLINE_HTML_CSP}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}\n  ${meta}`);
  }
  return `${meta}\n${html}`;
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

// ── 交付物 → 列表行模型 ─────────────────────────────────────────────────────

function mapWorkProduct(
  wp: IssueWorkProduct,
  latest: WorkProductVersion | null,
  versionCount: number,
): SandboxDeliverable {
  if (latest) {
    const url = absoluteUrl(latest.openPath || latest.contentPath);
    return {
      key: `wp:${wp.id}`,
      title: latest.originalFilename || wp.title || latest.title,
      kind: classifyKind(latest.contentType, latest.originalFilename, url),
      contentType: latest.contentType,
      size: latest.byteSize,
      createdAt: latest.createdAt,
      producer: latest.createdByAgent?.name ?? null,
      url,
      downloadUrl: absoluteUrl(latest.downloadPath || latest.contentPath) ?? url,
      source: "work_product",
      versionLabel:
        versionCount > 1
          ? `v${latest.versionNumber} · 共${versionCount}版`
          : `v${latest.versionNumber}`,
    };
  }
  const ct = metaString(wp, "contentType");
  const url = absoluteUrl(wp.url || metaString(wp, "contentPath") || metaString(wp, "openPath"));
  return {
    key: `wp:${wp.id}`,
    title: wp.title,
    kind: classifyKind(ct, null, url),
    contentType: ct,
    size: metaNumber(wp, "byteSize"),
    createdAt: (wp as unknown as { createdAt?: string }).createdAt ?? null,
    producer: null,
    url,
    downloadUrl: absoluteUrl(metaString(wp, "downloadPath")) ?? url,
    source: "work_product",
    versionLabel: wp.versionNumber ? `v${wp.versionNumber}` : null,
  };
}

function mapAttachment(a: IssueAttachment, agentName: Map<string, string>): SandboxDeliverable {
  const url = absoluteUrl(a.openPath || a.contentPath);
  const createdAt =
    typeof a.createdAt === "string"
      ? a.createdAt
      : (a.createdAt as Date | undefined)?.toISOString?.() ?? null;
  const producer = a.createdByAgentId
    ? (agentName.get(a.createdByAgentId) ?? `员工 ${a.createdByAgentId.slice(0, 6)}`)
    : a.createdByUserId
      ? "成员"
      : null;
  return {
    key: `att:${a.id}`,
    title: a.originalFilename || `附件 ${a.id.slice(0, 6)}`,
    kind: classifyKind(a.contentType, a.originalFilename, url),
    contentType: a.contentType ?? null,
    size: a.byteSize ?? null,
    createdAt,
    producer,
    url,
    downloadUrl: absoluteUrl(a.contentPath) ?? url,
    source: "attachment",
    versionLabel: null,
  };
}

function byNewest(a: SandboxDeliverable, b: SandboxDeliverable): number {
  const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
  const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
  return tb - ta;
}

export function PrototypeSandboxScreen({
  company,
  initialUrl,
  service: _service,
  workProduct,
  scope,
  onBack,
  onCreateTask,
  onOpenTask,
  onOpenArtifacts,
}: PrototypeSandboxScreenProps) {
  const [view, setView] = useState<ViewMode>("list");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [deliverables, setDeliverables] = useState<SandboxDeliverable[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SandboxDeliverable | null>(null);

  const [bust, setBust] = useState<number>(() => Date.now());
  const [loading, setLoading] = useState<boolean>(true);
  const [webLoading, setWebLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [markdownHtml, setMarkdownHtml] = useState<string | null>(null);
  // 取回来的 HTML 交付产物: 直接渲染成 WebView 文档, 不走文本/markdown 通道。
  const [htmlDoc, setHtmlDoc] = useState<{ html: string; baseUrl: string } | null>(null);
  // wave141 — 版本链: 有历史版本时, 工具条下方出现版本 chip 行, 可切换预览。
  const [versions, setVersions] = useState<WorkProductVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [authHeaders, setAuthHeaders] = useState<Record<string, string> | undefined>(undefined);
  const [bridgeUrl, setBridgeUrl] = useState<string | null>(null);

  const workProductId = workProduct?.id?.replace(/^work_product:/, "") ?? null;
  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? null,
    [versions, selectedVersionId],
  );
  const overrideUrl = selectedVersion
    ? absoluteUrl(selectedVersion.openPath || selectedVersion.contentPath)
    : null;
  const [{ url, isSnapshot }, setResolved] = useState<{
    url: string | null;
    isSnapshot: boolean;
  }>(() => resolvePreviewUrl(_service, workProduct, initialUrl, bust, overrideUrl));

  // ── 列表视图数据加载 ──────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      if (scope?.issueId) {
        const [workProducts, attachments, agents] = await Promise.all([
          coolie.listWorkProducts(scope.issueId).catch(() => [] as IssueWorkProduct[]),
          coolie.listAttachments(scope.issueId, company.id).catch(() => [] as IssueAttachment[]),
          coolie.listAgents(company.id).catch(() => []),
        ]);
        const agentName = new Map<string, string>(agents.map((a) => [a.id, a.name]));
        const versionResults = await Promise.all(
          workProducts.map((wp) => coolie.listWorkProductVersions(wp.id).catch(() => null)),
        );
        const items: SandboxDeliverable[] = [];
        const usedAttachmentIds = new Set<string>();
        workProducts.forEach((wp, index) => {
          const all = versionResults[index]?.versions ?? [];
          const latest = all.find((v) => v.isLatest) ?? all[all.length - 1] ?? null;
          if (latest?.attachmentId) usedAttachmentIds.add(latest.attachmentId);
          items.push(mapWorkProduct(wp, latest, all.length));
        });
        for (const attachment of attachments) {
          if (usedAttachmentIds.has(attachment.id)) continue;
          items.push(mapAttachment(attachment, agentName));
        }
        items.sort(byNewest);
        setDeliverables(items);
      } else if (scope?.projectId) {
        const res = await coolie
          .listArtifacts(company.id, { projectId: scope.projectId, limit: 100 })
          .catch(() => null);
        const items: SandboxDeliverable[] = (res?.artifacts ?? []).map((a) => {
          const entryUrl = absoluteUrl(a.openPath || a.contentPath);
          const mapped: DeliverableKind =
            a.mediaKind === "image" ||
            a.mediaKind === "video" ||
            a.mediaKind === "document" ||
            a.mediaKind === "text"
              ? (a.mediaKind as DeliverableKind)
              : classifyKind(a.contentType, a.title, entryUrl);
          return {
            key: a.id,
            title: a.title,
            kind: mapped,
            contentType: a.contentType,
            size: null,
            createdAt: a.updatedAt,
            producer: a.createdByAgent?.name ?? null,
            url: entryUrl,
            downloadUrl: absoluteUrl(a.downloadPath || a.contentPath) ?? entryUrl,
            source:
              a.source === "work_product"
                ? "work_product"
                : a.source === "document"
                  ? "document"
                  : "attachment",
            versionLabel: a.version
              ? a.version.count > 1
                ? `v${a.version.number} · 共${a.version.count}版`
                : `v${a.version.number}`
              : null,
          };
        });
        items.sort(byNewest);
        setDeliverables(items);
      } else {
        // 无上下文: 列表只含入口交付物(如果有), 否则空。
        const entryUrl = extractPreviewUrl(workProduct) || initialUrl || null;
        setDeliverables(
          workProduct && entryUrl
            ? [
                {
                  key: `wp:${workProduct.id}`,
                  title: workProduct.title || "当前交付物",
                  kind: classifyKind(metaString(workProduct, "contentType"), null, entryUrl),
                  contentType: metaString(workProduct, "contentType"),
                  size: metaNumber(workProduct, "byteSize"),
                  createdAt: null,
                  producer: null,
                  url: entryUrl,
                  downloadUrl: entryUrl,
                  source: "work_product",
                  versionLabel: null,
                },
              ]
            : [],
        );
      }
    } catch (e) {
      setListError(String((e as Error)?.message ?? e));
      setDeliverables([]);
    } finally {
      setListLoading(false);
    }
  }, [scope?.issueId, scope?.projectId, company.id, workProduct, initialUrl]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // wave141 — 版本链 (仅入口交付物)。
  useEffect(() => {
    if (!workProductId) {
      setVersions([]);
      return;
    }
    let cancelled = false;
    void coolie
      .listWorkProductVersions(workProductId)
      .then((res) => {
        if (!cancelled) setVersions(res.versions);
      })
      .catch(() => {
        if (!cancelled) setVersions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workProductId]);

  // 附件内容端点需要鉴权。两种登录方式各有各的凭据 (wave136 真值):
  //   · API Key 登录 → SecureStore 里的 bearer token, 直接塞进 WebView 请求头;
  //   · 邮箱/会话登录 → 原生 cookie jar 里有会话 cookie, WebView 先走 /api/auth/exchange 桥。
  useEffect(() => {
    let cancelled = false;
    setAuthHeaders(undefined);
    setBridgeUrl(null);
    if (!url) return;
    void (async () => {
      const token = await getAuthToken().catch(() => null);
      if (cancelled) return;
      if (token) {
        setAuthHeaders({ Authorization: `Bearer ${token}` });
        return;
      }
      const session = await getWebExchangeToken().catch(() => null);
      if (cancelled || !session) return;
      let origin = COOLIE_BASE_URL;
      try {
        origin = new URL(url).origin;
      } catch {
        // 相对路径时沿用默认站点。
      }
      setBridgeUrl(
        `${origin.replace(/\/+$/, "")}/api/auth/exchange?token=${encodeURIComponent(
          session,
        )}&next=${encodeURIComponent(url)}`,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // DS 真值: useEffect(resolve, [sessionId]); 我们重入参 resolve() 一次。
  // wave138c: 列表里选中的交付物优先于入口 URL。
  useEffect(() => {
    let cancelled = false;
    const raw = resolvePreviewUrl(_service, workProduct, initialUrl, bust, overrideUrl);
    const entryUrl = raw.url && raw.url.startsWith("/") ? `${COOLIE_BASE_URL}${raw.url}` : raw.url;
    const target = selected ? selected.url : entryUrl;
    const targetIsSnapshot = selected ? true : raw.isSnapshot;
    setResolved({ url: target, isSnapshot: targetIsSnapshot });
    setLoading(false);
    setMarkdownHtml(null);
    setHtmlDoc(null);

    const applySummaryFallback = () => {
      if (workProduct?.summary && (!target || target.endsWith(".md"))) {
        setMarkdownHtml(generateMarkdownHtml(workProduct.title ?? "产物概览", workProduct.summary));
      }
    };

    const isTextDocUrl =
      !!target &&
      (target.endsWith(".md") || target.endsWith(".txt") || target.includes("/docs/"));
    const isAttachmentUrl = !!target && target.includes("/attachments/");
    const kind = selected?.kind ?? null;
    const shouldProbeText =
      kind === "html" ||
      kind === "text" ||
      kind === "document" ||
      (!kind && (isTextDocUrl || isAttachmentUrl));

    if (target && shouldProbeText) {
      void (async () => {
        try {
          const token = await getAuthToken().catch(() => null);
          // credentials:"include" 借原生 cookie jar 授权(会话登录的探测路径);
          // bearer 登录已由 headers 带上。
          const res = await fetch(target, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            credentials: "include",
          });
          if (cancelled) return;
          if (!res.ok) return; // 鉴权/网络失败时交给 WebView(桥/头部)去处理
          const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
          if (kind === "document" || contentType.includes("pdf")) {
            return; // 二进制文档不适合文本渲染 — 交给 WebView/外部应用
          }
          const text = await res.text();
          if (cancelled) return;
          if (
            kind === "html" ||
            contentType.includes("text/html") ||
            contentType.includes("application/xhtml+xml")
          ) {
            // HTML 交付产物: 带凭据取回正文, 交给 WebView 渲染真页面(而不是源码)。
            setHtmlDoc({ html: withInlineHtmlCsp(text), baseUrl: target });
            return;
          }
          setMarkdownHtml(
            generateMarkdownHtml(selected?.title ?? workProduct?.title ?? "产物文档", text),
          );
        } catch {
          if (cancelled) return;
          applySummaryFallback();
        }
      })();
    } else if (!target || kind === null) {
      applySummaryFallback();
    }
  }, [_service, workProduct, initialUrl, bust, overrideUrl, selected]);

  const handleRefresh = useCallback(() => {
    setError(null);
    setBust(Date.now());
    if (view === "list") void loadList();
  }, [view, loadList]);

  const [showExternalSheet, setShowExternalSheet] = useState<boolean>(false);

  // wave107 (QA 报告 D02): 主入口直接走 QQ 浏览器优先 + 系统 fallback,
  // 不弹选择 sheet (跳出感强); 三选 sheet 仅作兜底 (fallback 抛错时).
  const handleOpenExternal = useCallback(() => {
    const target = selected?.downloadUrl || selected?.url || url;
    if (!target) return;
    void openInExternalApp(target, true).catch(() => {
      setShowExternalSheet(true);
    });
  }, [url, selected]);

  const openDeliverable = useCallback((item: SandboxDeliverable) => {
    if (!item.url && !item.downloadUrl) {
      Alert.alert("无法预览", "该文件没有可用的预览或下载地址。");
      return;
    }
    setSelected(item);
    setView("preview");
    setError(null);
    setBust(Date.now());
  }, []);

  const filteredList = useMemo(() => {
    if (kindFilter === "all") return deliverables;
    if (kindFilter === "document") {
      return deliverables.filter((d) => d.kind === "document" || d.kind === "text");
    }
    return deliverables.filter((d) => d.kind === kindFilter);
  }, [deliverables, kindFilter]);

  const counts = useMemo(() => {
    let html = 0;
    let image = 0;
    let video = 0;
    let document = 0;
    for (const d of deliverables) {
      if (d.kind === "html") html += 1;
      else if (d.kind === "image") image += 1;
      else if (d.kind === "video") video += 1;
      else if (d.kind === "document" || d.kind === "text") document += 1;
    }
    return { all: deliverables.length, html, image, video, document };
  }, [deliverables]);

  const canWebView = (!!url || !!markdownHtml || !!htmlDoc) && Platform.OS !== "web";
  const selectedKind = selected?.kind ?? null;
  const showImage = !!selected && selectedKind === "image" && !!selected.url;
  const showVideo = !!selected && selectedKind === "video" && !!selected.url;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        onBack={onBack}
        backLabel="返回"
        title="原型交互沙箱"
        subtitle={
          <Text style={styles.headerSub} numberOfLines={1}>
            {scope?.issueTitle
              ? `任务 · ${scope.issueTitle}`
              : scope?.projectName
                ? `项目 · ${scope.projectName}`
                : "交付物 · 文件与预览"}
          </Text>
        }
        style={styles.header}
      />

      <SegmentedControl
        options={[
          { key: "list", label: `列表 (${counts.all})` },
          { key: "preview", label: "预览" },
        ]}
        value={view}
        onChange={(key) => setView(key as ViewMode)}
        style={styles.seg}
      />

      {view === "list" ? (
        <>
          {/* 类型筛选 (网页 / 图片 / 视频 / 文档) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {(
              [
                { key: "all", label: `全部 ${counts.all}` },
                { key: "html", label: `网页 ${counts.html}` },
                { key: "image", label: `图片 ${counts.image}` },
                { key: "video", label: `视频 ${counts.video}` },
                { key: "document", label: `文档 ${counts.document}` },
              ] as Array<{ key: KindFilter; label: string }>
            ).map((f) => {
              const active = kindFilter === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setKindFilter(f.key)}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {listLoading ? (
            <View style={styles.center}>
              <Text style={styles.hint}>加载交付物…</Text>
            </View>
          ) : filteredList.length === 0 ? (
            <View style={styles.center}>
              <EmptyState
                variant="standalone"
                icon={<Text style={styles.emptyIcon}>📭</Text>}
                title={kindFilter === "all" ? "当前上下文还没有交付物" : "该类型下没有文件"}
                subtitle={
                  kindFilter !== "all"
                    ? "换一个类型筛选看看，或切回「全部」。"
                    : scope?.issueId
                      ? "这个任务还没有交付产物或附件。AI 员工执行任务产出的文档、图片、原型会实时出现在这里。"
                      : scope?.projectId
                        ? "该项目下还没有交付产物或附件。可进入任务让 AI 员工产出交付物。"
                        : "暂无可列出的文件。"
                }
                action={
                  <View style={styles.emptyActions}>
                    {kindFilter !== "all" ? (
                      <Pressable style={styles.emptyBtn} onPress={() => setKindFilter("all")}>
                        <Text style={styles.emptyBtnText}>查看全部</Text>
                      </Pressable>
                    ) : null}
                    {scope?.issueId && onOpenTask ? (
                      <Pressable
                        style={styles.emptyBtnPrimary}
                        onPress={() => onOpenTask(scope.issueId as string)}
                      >
                        <Text style={styles.emptyBtnPrimaryText}>查看任务</Text>
                      </Pressable>
                    ) : null}
                    {!scope?.issueId && onCreateTask ? (
                      <Pressable style={styles.emptyBtnPrimary} onPress={onCreateTask}>
                        <Text style={styles.emptyBtnPrimaryText}>去创建任务</Text>
                      </Pressable>
                    ) : null}
                    {onOpenArtifacts ? (
                      <Pressable style={styles.emptyBtn} onPress={onOpenArtifacts}>
                        <Text style={styles.emptyBtnText}>去交付产物中心</Text>
                      </Pressable>
                    ) : null}
                    <Pressable style={styles.emptyBtn} onPress={onBack}>
                      <Text style={styles.emptyBtnText}>返回</Text>
                    </Pressable>
                  </View>
                }
              />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.listContent}>
              {listError ? <Text style={styles.errInline}>⚠️ {listError}</Text> : null}
              {filteredList.map((item) => {
                const meta = KIND_META[item.kind];
                return (
                  <Pressable
                    key={item.key}
                    style={styles.row}
                    onPress={() => openDeliverable(item)}
                    accessibilityRole="button"
                  >
                    <View style={[styles.rowIcon, { backgroundColor: meta.bg }]}>
                      <Text style={styles.rowIconText}>{meta.icon}</Text>
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <View style={styles.rowMetaLine}>
                        <Text style={[styles.rowKind, { color: meta.color }]}>{meta.label}</Text>
                        <Text style={styles.rowMetaDot}>·</Text>
                        <Text style={styles.rowMeta}>{formatBytes(item.size)}</Text>
                        <Text style={styles.rowMetaDot}>·</Text>
                        <Text style={styles.rowMeta}>{formatTime(item.createdAt)}</Text>
                        {item.producer ? (
                          <>
                            <Text style={styles.rowMetaDot}>·</Text>
                            <Text style={styles.rowMeta} numberOfLines={1}>
                              🤖 {item.producer}
                            </Text>
                          </>
                        ) : null}
                      </View>
                      <View style={styles.rowBadges}>
                        {item.versionLabel ? (
                          <Text style={styles.rowVersion}>{item.versionLabel}</Text>
                        ) : null}
                        <Text style={styles.rowSource}>
                          {item.source === "work_product"
                            ? "交付物"
                            : item.source === "document"
                              ? "文档资产"
                              : "任务附件"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.rowChevron}>›</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </>
      ) : (
        <>
          {/* 工具条 — 仿 DS PreviewWebView 真值: [‹ 列表] + tag + 刷新 + 浏览器打开 */}
          <View style={styles.toolbar}>
            <Pressable
              onPress={() => {
                setSelected(null);
                setView("list");
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.toolBtn}
            >
              <Text style={styles.closeText}>‹ 列表</Text>
            </Pressable>

            <View style={styles.toolMid}>
              <View style={[styles.tag, isSnapshot ? styles.tagSnap : styles.tagLive]}>
                <Text style={styles.tagText}>{isSnapshot ? "SNAPSHOT" : "LIVE"}</Text>
              </View>
              {selected ? (
                <Text style={styles.loadingHint} numberOfLines={1}>
                  {KIND_META[selected.kind].icon} {selected.title}
                </Text>
              ) : webLoading || loading ? (
                <Text style={styles.loadingHint}>加载中…</Text>
              ) : null}
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

          {/* wave141 — 版本链 chip 行: 仅当入口交付物有多个版本且未选中列表项时出现 */}
          {!selected && versions.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.versionRow}
            >
              {versions.map((version) => {
                const active = selectedVersionId === version.id;
                return (
                  <Pressable
                    key={version.id}
                    onPress={() => setSelectedVersionId(version.id)}
                    style={[styles.versionChip, active && styles.versionChipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.versionChipText, active && styles.versionChipTextActive]}>
                      v{version.versionNumber}
                      {version.isLatest ? " 最新" : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {/* 主体 */}
          {showImage ? (
            <View style={styles.mediaWrap}>
              <Image
                source={{ uri: selected?.url ?? "", headers: authHeaders }}
                style={styles.media}
                contentFit="contain"
                transition={200}
              />
            </View>
          ) : showVideo ? (
            <View style={styles.mediaWrap}>
              <Video
                source={selected?.url ? { uri: selected.url, headers: authHeaders } : undefined}
                style={styles.media}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={false}
              />
            </View>
          ) : loading ? (
            <View style={styles.center}>
              <Text style={styles.hint}>加载预览…</Text>
            </View>
          ) : canWebView ? (
            <WebView
              key={
                markdownHtml
                  ? "markdown-preview"
                  : htmlDoc
                    ? "html-doc"
                    : (bridgeUrl ?? url ?? "preview")
              }
              source={
                markdownHtml
                  ? { html: markdownHtml }
                  : htmlDoc
                    ? // HTML 交付产物: 已带凭据取回, 以 baseUrl 为准渲染(相对资源可解析)。
                      { html: htmlDoc.html, baseUrl: htmlDoc.baseUrl }
                    : authHeaders
                      ? { uri: url ?? "", headers: authHeaders }
                      : // 会话登录的 URL 预览: 先走 exchange 桥给 WebView 的 cookie jar
                        // 落 cookie, 再 302 到目标 URL。
                        { uri: bridgeUrl ?? url ?? "" }
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
              onHttpError={(syntheticEvent: { nativeEvent: { statusCode?: number } }) => {
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
              <Text style={styles.emptyIcon}>
                {selected ? KIND_META[selected.kind].icon : "🖥️"}
              </Text>
              <Text style={styles.hint}>
                {selected && (selected.kind === "document" || selected.kind === "file")
                  ? "该文件无法内嵌渲染，可用外部应用打开。"
                  : error || "暂无可用预览"}
              </Text>
              <View style={styles.emptyActions}>
                {selected?.downloadUrl || selected?.url ? (
                  <Pressable style={styles.primaryBtn} onPress={handleOpenExternal}>
                    <Text style={styles.primaryBtnText}>外部应用打开</Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.emptyBtn} onPress={handleRefresh}>
                  <Text style={styles.emptyBtnText}>重试</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* 加载错误横幅 — DS 真值: 有 URL 但代理报错时 */}
          {url && error ? (
            <View style={styles.errBar}>
              <Text style={styles.errText} numberOfLines={1}>
                {error}
              </Text>
              <Pressable onPress={handleRefresh} hitSlop={6}>
                <Text style={styles.errBtn}>刷新</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}

      {/* 外部应用与浏览器选择底栏 */}
      <ExternalOpenSheet
        visible={showExternalSheet}
        url={selected?.downloadUrl || selected?.url || url}
        title="打开原型外部应用"
        subtitle="推荐使用 QQ 浏览器（内置腾讯 TBS X5 内核秒开 Office/PDF 与原型），也可调用系统默认浏览器打开。"
        onClose={() => setShowExternalSheet(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  headerSub: {
    color: C.ink3,
    fontSize: 12,
    marginTop: 2,
  },
  seg: {
    marginHorizontal: 16,
    marginTop: 10,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterChip: {
    paddingHorizontal: 12,
    // wave214 — chip 文字被 Android 默认 line-height 截断. 旧值 5 + 12*1.2 + 5 = 24.4
    // 实测只够装下半截, 上半截被截. 改 paddingVertical 8 + 显式 lineHeight 18 + 关
    // includeFontPadding 让行盒精确等于 (fontSize * 1.5), 即 12*1.5 = 18, 文字垂直居中.
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: C.lineSubtle,
    alignItems: "center",
    justifyContent: "center",
    // wave214 — Pressable 在 RN 上会无视 paddingVertical 给一个「最小高度」, 实测
    // 仍渲到 67px. 显式 height 锁死 (borderWidth 1*2 + paddingV 8*2 + lineHeight 18 = 36).
    height: 36,
  },
  filterChipActive: {
    backgroundColor: "rgba(94,106,210,0.15)",
    borderColor: C.accent,
  },
  filterChipText: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
    // wave214 — Android 默认 line-height 会把文字压扁; 显式行高 + 关 includeFontPadding
    // (iOS 无 includeFontPadding 概念, 在 Android 上让 padding 精确等于 lineHeight - fontSize)
    lineHeight: 18,
    textAlignVertical: "center",
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  filterChipTextActive: {
    color: C.accent,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconText: {
    fontSize: 18,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    color: C.ink,
    fontSize: 14,
    fontWeight: "600",
  },
  rowMetaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  rowKind: {
    fontSize: 11,
    fontWeight: "600",
  },
  rowMeta: {
    color: C.ink3,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  rowMetaDot: {
    color: C.ink4,
    fontSize: 11,
  },
  rowBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowVersion: {
    color: C.ok,
    fontSize: 10,
    fontWeight: "600",
  },
  rowSource: {
    color: C.ink4,
    fontSize: 10,
  },
  rowChevron: {
    color: C.ink4,
    fontSize: 20,
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
    flexShrink: 1,
  },
  versionRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  versionChip: {
    paddingHorizontal: 10,
    // wave214 — 与 filterChip 对齐, 上下各加 3px 防 Android 文字压扁
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: C.lineSubtle,
    alignItems: "center",
    justifyContent: "center",
    // wave214 — 显式 height 锁死 (border 2 + paddingV 14 + lineH 18 = 34), 详见 filterChip 注释
    height: 34,
  },
  versionChipActive: {
    backgroundColor: "rgba(94, 106, 210, 0.15)",
    borderColor: C.accent,
  },
  versionChipText: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
    // wave214 — 显式 lineHeight + Android 关 includeFontPadding, 与 filterChip 同一原因
    lineHeight: 18,
    textAlignVertical: "center",
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  versionChipTextActive: {
    color: C.accent,
    fontWeight: "600",
  },
  web: { flex: 1, backgroundColor: "#FFFFFF" },
  mediaWrap: { flex: 1, backgroundColor: C.panel, alignItems: "center", justifyContent: "center" },
  media: { width: "100%", height: "100%" },
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
  emptyActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  emptyBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  emptyBtnText: { color: C.ink2, fontSize: 13, fontWeight: "500" },
  emptyBtnPrimary: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: C.brand,
  },
  emptyBtnPrimaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  primaryBtn: {
    backgroundColor: C.brand,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: C.ink, fontWeight: "600", fontSize: 14 },
  errInline: {
    color: C.err,
    fontSize: 12,
    paddingVertical: 4,
  },
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
});
