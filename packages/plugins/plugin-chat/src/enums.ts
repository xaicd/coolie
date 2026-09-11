/**
 * Chat enumerations, aligned with the DigitalStaff ai-studio / orchestration
 * conversation models (CodingMode / IDESession status / UserConversationContext).
 * Values are functional identifiers (clean-room), not copied code.
 */

/** Conversation mode (DS CodingMode). */
export const CHAT_MODES = ["chat", "mvp", "vibe", "build", "office"] as const;
export type ChatMode = (typeof CHAT_MODES)[number];

/** Conversation lifecycle status (DS IDESession status). */
export const CONVERSATION_STATUSES = ["active", "idle", "suspended", "archived"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

/** Legal conversation status transitions. */
export const CONVERSATION_TRANSITIONS: Record<ConversationStatus, ConversationStatus[]> = {
  active: ["idle", "suspended", "archived"],
  idle: ["active", "suspended", "archived"],
  suspended: ["active", "archived"],
  archived: [],
};

/** Message role (DS UserConversationContext message.role, plus system/tool). */
export const MESSAGE_ROLES = ["user", "assistant", "system", "tool"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** Return true when `to` is a legal conversation status transition from `from`. */
export function isValidConversationTransition(
  from: ConversationStatus,
  to: ConversationStatus,
): boolean {
  return CONVERSATION_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Cheap token estimate (~4 chars/token) used for context-window budgeting. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
