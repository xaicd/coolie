import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";
import { projects } from "./projects.js";

/**
 * Coolie fork — wave148: workshop multi-conversation.
 *
 * Before this table a company had exactly one workshop thread: every board-chat
 * turn was persisted onto a single standing "Board Operations" issue, so a boss
 * with five questions had one mixed history and one mixed context. A row here is
 * one named conversation; each conversation owns its own issue (`issue_id`) and
 * therefore its own comment stream, so histories and prompts stay separated.
 *
 * `issue_id` is nullable because the issue is created lazily on first use
 * (`ensureBoardConversationIssue`), which also lets the migration backfill the
 * pre-existing "Board Operations" issue without forcing an eager create for a
 * conversation that never gets a second turn.
 */
export const boardConversations = pgTable(
  "board_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** Optional project context for build-mode CMMI integration. */
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    /** The issue that anchors this conversation's comment stream. Set lazily. */
    issueId: uuid("issue_id").references(() => issues.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    createdByUserId: text("created_by_user_id"),
    /** Ordering key for the conversation list (newest first). */
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Soft delete: an archived conversation is hidden from the default list. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("board_conversations_company_last_message_idx").on(
      table.companyId,
      table.lastMessageAt,
    ),
    unique("board_conversations_company_id_uq").on(table.companyId, table.id),
  ],
);
