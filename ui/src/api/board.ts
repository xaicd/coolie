import type { BoardConversation } from "@paperclipai/shared";
import { api } from "./client";

/**
 * wave148: workshop conversations (工坊对话).
 *
 * The board-chat surface used to hold exactly one thread per company (a shared
 * "Board Operations" issue). These endpoints let the boss create, switch,
 * rename and archive named conversations, each with its own history.
 */
function conversationsPath(companyId: string): string {
  return `/companies/${encodeURIComponent(companyId)}/board/conversations`;
}

export const boardApi = {
  listConversations: (companyId: string, opts?: { includeArchived?: boolean }) =>
    api.get<BoardConversation[]>(
      `${conversationsPath(companyId)}${opts?.includeArchived ? "?includeArchived=1" : ""}`,
    ),
  createConversation: (
    companyId: string,
    input: { title: string; projectId?: string | null },
  ) =>
    api.post<BoardConversation>(conversationsPath(companyId), {
      title: input.title,
      projectId: input.projectId ?? null,
    }),
  updateConversation: (
    companyId: string,
    conversationId: string,
    input: { title?: string; archived?: boolean },
  ) =>
    api.patch<BoardConversation>(
      `${conversationsPath(companyId)}/${encodeURIComponent(conversationId)}`,
      input,
    ),
  /** Soft delete: archives the conversation (history is kept). */
  archiveConversation: (companyId: string, conversationId: string) =>
    api.delete<{ ok: boolean }>(
      `${conversationsPath(companyId)}/${encodeURIComponent(conversationId)}`,
    ),
};
