-- Coolie fork — wave148: 工坊对话支持新建多个对话 (workshop multi-conversation).
--
-- Before this table a company had exactly one workshop thread: every board-chat
-- turn landed on a single standing "Board Operations" issue, so the boss's five
-- questions shared one mixed history and one mixed prompt context.
--
-- A `board_conversations` row is one named conversation; `issue_id` points at the
-- per-conversation issue that carries its comment stream (created lazily by
-- `ensureBoardConversationIssue`). Soft delete is `archived_at`, so a removed
-- conversation keeps its history.
--
-- The trailing INSERT upgrades each company's existing "Board Operations" issue
-- into one conversation, so the old shared thread becomes "Board Operations" and
-- its existing comments stay attached — no history is lost and no rebuild needed.
--
-- Hand-written rather than generated: `drizzle-kit generate` cannot run on this
-- fork (pre-existing snapshot collision between 0280/9000 and 9002/9003), which
-- is why the 9000-range exists for fork migrations. A new table with all-nullable
-- optional columns is safe on the live database.
CREATE TABLE IF NOT EXISTS "board_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "project_id" uuid,
  "issue_id" uuid,
  "title" text NOT NULL,
  "created_by_user_id" text,
  "last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_conversations_company_last_message_idx"
  ON "board_conversations" ("company_id", "last_message_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "board_conversations_company_id_uq"
  ON "board_conversations" ("company_id", "id");
--> statement-breakpoint
ALTER TABLE "board_conversations"
  ADD CONSTRAINT "board_conversations_company_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "board_conversations"
  ADD CONSTRAINT "board_conversations_project_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "board_conversations"
  ADD CONSTRAINT "board_conversations_issue_id_fk"
  FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE set null;
--> statement-breakpoint
INSERT INTO "board_conversations" ("company_id", "issue_id", "title", "last_message_at", "created_at")
SELECT DISTINCT ON (i."company_id") i."company_id", i."id", 'Board Operations', i."updated_at", i."created_at"
FROM "issues" i
WHERE i."title" = 'Board Operations'
  AND i."status" NOT IN ('done', 'cancelled')
  AND NOT EXISTS (
    SELECT 1 FROM "board_conversations" c WHERE c."issue_id" = i."id"
  )
ORDER BY i."company_id", i."updated_at" DESC;
