/**
 * 通知 / 评论正文脱敏与摘要适配器 (wave376 P0-1)
 *
 * Paperclip 控制面的心跳唤醒数据包 (`## Paperclip Wake Payload` + 内嵌 ```text
 * 序列化 JSON) 有时会作为 issue comment 落到通知流与工坊时间线。直接渲染会
 * 撑爆 6 寸屏并外泄底层调试载荷。这里统一识别此类载荷, 供 UI 层拦截丢弃,
 * 同时在服务端通知总线 (server/src/routes/notifications.ts) 同口径过滤。
 */

const WAKE_PAYLOAD_HEADER = "## Paperclip Wake Payload";

/** 是否为 Paperclip 心跳唤醒调试载荷 (原始 JSON 数据包)。 */
export function isWakePayloadText(value: string | null | undefined): boolean {
  if (!value) return false;
  // 只检查头部: 正当的业务正文不会在开头出现该调试标题。
  const head = value.slice(0, 512);
  return head.includes(WAKE_PAYLOAD_HEADER) || head.includes("Paperclip Wake Payload");
}

const WAKE_PAYLOAD_RE = /Paperclip\s+Wake\s+Payload/;

/**
 * 正文脱敏: 命中唤醒载荷时返回 null (调用方应整条丢弃), 否则原样返回。
 * 后端与前端共用同一判定口径, 防止 raw JSON 进入渲染树。
 */
export function sanitizeNotificationBody(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isWakePayloadText(value)) return null;
  return value;
}

/** 折叠为单行摘要: 去换行 / markdown 噪声, 超长补省略号。 */
export function summarizeBody(value: string | null | undefined, maxChars = 40): string {
  if (!value) return "";
  const oneLine = value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (oneLine.length <= maxChars) return oneLine;
  return `${oneLine.slice(0, maxChars)}…`;
}

export { WAKE_PAYLOAD_RE };
