/**
 * Board-chat message hydration rules (coolie fork, wave115).
 *
 * The concierge room must only ever render *real* turns. Two kinds of row are
 * not real turns and must be dropped wherever a stored conversation is read
 * back:
 *
 *   1. empty content — a cleared conversation used to leave soft-deleted
 *      tombstones whose body is blanked on read; rendered raw they became the
 *      "empty transparent bubbles" the boss saw after 清空对话.
 *   2. status/progress pseudo-messages — the client's transient indicators
 *      ("正在连接会话助手…", "思考中…", tool-progress text). They have no
 *      business being stored (see the server-side persist guard in
 *      server/src/routes/board-chat.ts) and, if one ever lands in history, it
 *      must not render as a bubble.
 *
 * Pure, dependency-free, and shared by every read surface (expo + h5) so the
 * rule cannot drift per client. The server keeps a mirrored copy — the two
 * cannot share code across the workspace boundary, so keep them in sync.
 */

const BOARD_CHAT_STATUS_LINE_PATTERNS: readonly RegExp[] = [
  /^正在连接会话助手[\s.…]*$/,
  /^会话助手正在处理/,
  /^正在生成回复[\s.…]*$/,
  /^思考中[\s.…]*$/,
  /^Connecting[\s.]*$/,
  /^Thinking[\s.]*$/,
];

/** True when `text` is a transient status/progress line, not a real reply. */
export function isBoardChatStatusLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return BOARD_CHAT_STATUS_LINE_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * True when a stored board-chat row should render as a real bubble: it has
 * non-blank content and is not a status/progress pseudo-message.
 */
export function isRenderableBoardMessage(message: {
  text?: string | null;
}): boolean {
  const text = (message.text ?? "").trim();
  return text.length > 0 && !isBoardChatStatusLine(text);
}
