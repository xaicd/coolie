/**
 * Coolie fork — wave148: a workshop conversation (工坊对话) the boss can create,
 * name, switch between, rename, archive and delete.
 *
 * Before this, every board-chat turn in a company landed on one shared standing
 * issue, so several unrelated topics shared one history and one prompt context.
 * A `BoardConversation` is that separation made explicit: each conversation owns
 * its own issue (`issueId`) and therefore its own comment stream.
 */
export interface BoardConversation {
  id: string;
  companyId: string;
  /** Optional project context for build-mode CMMI integration. */
  projectId: string | null;
  /**
   * The issue anchoring this conversation's comment stream. `null` until the
   * first turn lazily creates it.
   */
  issueId: string | null;
  title: string;
  createdByUserId: string | null;
  /** ISO timestamp of the last turn; the list is ordered by this, newest first. */
  lastMessageAt: string;
  /** ISO timestamp when archived (soft-deleted), else `null`. */
  archivedAt: string | null;
  createdAt: string;
}
