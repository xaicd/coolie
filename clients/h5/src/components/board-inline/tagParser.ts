/**
 * 对话流内嵌预览标签解析器
 *
 * 抄 DigitalStaff ChatHome 的意图: 总办/服务端在回复文本里夹带结构化标签,
 * 客户端把标签摘出来就地渲染成组件, 而不是让用户点链接跳到别的界面。
 *
 * 支持两种标签:
 *   <preview-url>https://example.com/preview</preview-url>
 *   <preview-mvp title="首页" thumb="https://…/thumb.png" meta='{"author":"张三"}'>…</preview-mvp>
 *
 * 设计原则:
 * - 解析失败的标签原样保留在 cleanText 里, 不吞字 —— 宁可露出原始标记,
 *   也不让掌柜看到"少了半句话"的回复。
 * - 纯函数, 不做 IO, 便于在列表每帧渲染时重复调用。
 *
 * 与 expo 端 `clients/expo/src/components/board-inline/tagParser.ts` 一字不差:
 * 这是纯 TS、渲染无关的解析层, H5 与 App 共用同一份语义。
 */

export type PreviewKind = "url" | "mvp";

/** 一条可渲染的预览规格 (InlinePreviewPanel 的入参来源) */
export interface PreviewSpec {
  /** 稳定 id: 由类型 + 顺序 + 目标派生, 用于 React key 与去重 */
  id: string;
  kind: PreviewKind;
  /** url 类型: 要加载的页面地址 */
  url?: string;
  /** mvp 类型: 缩略图地址 */
  imageUrl?: string;
  title?: string;
  meta?: Record<string, string>;
  /** 命中的原始标签文本, 便于调试与"编辑原始内容"回填 */
  raw: string;
}

export interface ParsedInlineText {
  /** 摘掉可识别标签后的正文 */
  cleanText: string;
  previews: PreviewSpec[];
}

/** <preview-url>…</preview-url> —— 允许标签带属性, 但只取标签体作为 URL */
const URL_TAG_PATTERN = /<preview-url\b[^>]*>([\s\S]*?)<\/preview-url>/gi;

/** <preview-mvp attrs>body</preview-mvp> 或自闭合 <preview-mvp attrs /> */
const MVP_TAG_PATTERN = /<preview-mvp\b([^>]*?)(?:\/>|>([\s\S]*?)<\/preview-mvp>)/gi;

/** 属性 key="value" / key='value' / key=value(无引号, 取到空白为止) */
const ATTR_PATTERN = /([a-zA-Z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let match: RegExpExecArray | null;
  ATTR_PATTERN.lastIndex = 0;
  while ((match = ATTR_PATTERN.exec(raw)) !== null) {
    const key = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (key) attrs[key] = value;
  }
  return attrs;
}

/** meta 属性是内联 JSON; 解析失败时降级为 { value: 原文 }, 不抛错 */
function parseMeta(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        out[k] = typeof v === "string" ? v : JSON.stringify(v);
      }
      return Object.keys(out).length > 0 ? out : undefined;
    }
    return undefined;
  } catch {
    return { value: raw };
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** 只去掉首尾空白与空行, 保留正文里正常的段落间距 */
function tidy(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeId(kind: PreviewKind, index: number, target: string): string {
  const tail = target.replace(/[^a-zA-Z0-9]+/g, "").slice(-16) || "x";
  return `${kind}-${index}-${tail}`;
}

/**
 * 从一段文本里摘出全部预览标签。
 *
 * @param text 原始文本 (可能是 SSE chunk 拼接后的完整回复)
 * @param seed 调用方提供的稳定前缀 (如消息 id), 避免多条消息产生同样的 key
 */
export function parseInlineTags(text: string, seed = ""): ParsedInlineText {
  const source = typeof text === "string" ? text : "";
  if (!source) return { cleanText: "", previews: [] };

  const previews: PreviewSpec[] = [];
  const spans: Array<{ start: number; end: number }> = [];

  URL_TAG_PATTERN.lastIndex = 0;
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = URL_TAG_PATTERN.exec(source)) !== null) {
    const body = (urlMatch[1] ?? "").trim();
    spans.push({ start: urlMatch.index, end: urlMatch.index + urlMatch[0].length });
    // 标签体不是 http(s) 地址时, 视为格式错误: 不产出预览, 也不摘掉标签
    if (!isHttpUrl(body)) {
      spans.pop();
      continue;
    }
    previews.push({
      id: makeId("url", previews.length, body),
      kind: "url",
      url: body,
      title: undefined,
      raw: urlMatch[0],
    });
  }

  MVP_TAG_PATTERN.lastIndex = 0;
  let mvpMatch: RegExpExecArray | null;
  while ((mvpMatch = MVP_TAG_PATTERN.exec(source)) !== null) {
    const attrs = parseAttrs(mvpMatch[1] ?? "");
    const body = tidy(mvpMatch[2] ?? "");
    const thumb = attrs.thumb || attrs.thumbnail || attrs.image || "";
    const link = attrs.url || (isHttpUrl(body) ? body : "");
    // 既没有缩略图也没有可打开的地址 —— 摘掉标签会变成空卡片, 故保留原文
    if (!thumb && !link) continue;

    spans.push({ start: mvpMatch.index, end: mvpMatch.index + mvpMatch[0].length });
    previews.push({
      id: makeId("mvp", previews.length, thumb || link),
      kind: "mvp",
      url: link || undefined,
      imageUrl: thumb || undefined,
      title: attrs.title || undefined,
      meta: parseMeta(attrs.meta),
      raw: mvpMatch[0],
    });
  }

  const seen = new Set<string>();
  const unique = previews.filter((p) => {
    const key = `${p.kind}:${p.url ?? ""}:${p.imageUrl ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (spans.length === 0) {
    return { cleanText: tidy(source), previews: [] };
  }

  spans.sort((a, b) => a.start - b.start);
  let cleanText = "";
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    cleanText += source.slice(cursor, span.start);
    cursor = span.end;
  }
  cleanText += source.slice(cursor);

  return { cleanText: tidy(cleanText), previews: unique };
}

/** 文本里是否可能存在预览标签 (渲染层廉价短路, 避免每条气泡都跑正则) */
export function hasInlinePreviewTag(text: string): boolean {
  return typeof text === "string" && /<preview-(url|mvp)\b/i.test(text);
}
