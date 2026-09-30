-- Coolie fork — wave154: Ontology Graph 雏形 (entity + link layer).
--
-- Before this table the workshop's objects (Company / Project / Issue / Spec /
-- Conversation / WorkProduct / Attachment / Comment) were linked only by
-- foreign-key columns on one side of each pair (an issue's project_id, a work
-- product's issue_id). No query could answer "what is connected to this
-- object" without hard-coding every join. `entity_relations` makes each link a
-- row, so the graph API can traverse generically and the board can draw the
-- picture.
--
-- Node identity is the PAIR (type, id): a `spec` node reuses its issue's id
-- (a spec IS the issue's spec_kind/spec payload), so two nodes may share a uuid
-- and are told apart by their type. That is why the unique edge key includes
-- both types.
--
-- `src_type`/`target_type` are plain text, not enums: adding an object kind in
-- future must not need a migration. `EntityType` in @paperclipai/shared is the
-- enforced vocabulary on the write path.
--
-- NOTE ON A BRIEF DEVIATION: the brief sketched `created_by_user_id uuid`. Every
-- other author column in this schema is text (`issue_comments.author_user_id`,
-- `board_conversations.created_by_user_id`), because `auth_users.id` is text.
-- This column is text to match, or it could not store a real user id.

CREATE TABLE IF NOT EXISTS "entity_relations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "src_type" text NOT NULL,
  "src_id" uuid NOT NULL,
  "relation" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "weight" integer DEFAULT 1 NOT NULL,
  "created_by_user_id" text,
  "created_by_agent_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_relations_company_src_idx"
  ON "entity_relations" ("company_id", "src_type", "src_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_relations_company_target_idx"
  ON "entity_relations" ("company_id", "target_type", "target_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_relations_company_relation_idx"
  ON "entity_relations" ("company_id", "relation");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entity_relations_edge_uq"
  ON "entity_relations" ("company_id", "src_type", "src_id", "relation", "target_type", "target_id");
--> statement-breakpoint
ALTER TABLE "entity_relations"
  ADD CONSTRAINT "entity_relations_company_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade;
--> statement-breakpoint

-- ── Backfill: infer the links the existing rows already imply ────────────────
-- ON CONFLICT DO NOTHING (against entity_relations_edge_uq) makes the whole
-- block idempotent: re-running the migration cannot duplicate an edge.

-- issue → project (containment; strongest link).
INSERT INTO "entity_relations" ("company_id", "src_type", "src_id", "relation", "target_type", "target_id", "weight")
SELECT i."company_id", 'issue', i."id", 'belongs_to', 'project', i."project_id", 3
FROM "issues" i
WHERE i."project_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- spec → project. A spec-bearing issue (spec_kind not null) is also a spec node,
-- and that node belongs to the same project as its issue.
INSERT INTO "entity_relations" ("company_id", "src_type", "src_id", "relation", "target_type", "target_id", "weight")
SELECT i."company_id", 'spec', i."id", 'belongs_to', 'project', i."project_id", 2
FROM "issues" i
WHERE i."spec_kind" IS NOT NULL AND i."project_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- spec → spec (the development chain: a task's spec.parentSpecId names its
-- design issue, the design's names the requirement/bugfix it answers).
INSERT INTO "entity_relations" ("company_id", "src_type", "src_id", "relation", "target_type", "target_id", "weight")
SELECT i."company_id", 'spec', i."id", 'derived_from', 'spec', (i."spec"->>'parentSpecId')::uuid, 2
FROM "issues" i
WHERE i."spec_kind" IS NOT NULL
  AND i."spec" IS NOT NULL
  AND NULLIF(i."spec"->>'parentSpecId', '') IS NOT NULL
  AND (i."spec"->>'parentSpecId') ~ '^[0-9a-fA-F-]{36}$'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- work_product → issue.
INSERT INTO "entity_relations" ("company_id", "src_type", "src_id", "relation", "target_type", "target_id", "weight")
SELECT w."company_id", 'work_product', w."id", 'attached_to', 'issue', w."issue_id", 2
FROM "issue_work_products" w
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- attachment → issue.
INSERT INTO "entity_relations" ("company_id", "src_type", "src_id", "relation", "target_type", "target_id", "weight")
SELECT a."company_id", 'attachment', a."id", 'attached_to', 'issue', a."issue_id", 2
FROM "issue_attachments" a
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- conversation → project (when the conversation carries a project context).
INSERT INTO "entity_relations" ("company_id", "src_type", "src_id", "relation", "target_type", "target_id", "weight")
SELECT c."company_id", 'conversation', c."id", 'belongs_to', 'project', c."project_id", 2
FROM "board_conversations" c
WHERE c."project_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- issue → conversation: a conversation is anchored on an issue, so that issue
-- was discussed in it. This is the link the runtime hook also maintains on each
-- new comment (see ontology-graph service recordCommentRelation).
INSERT INTO "entity_relations" ("company_id", "src_type", "src_id", "relation", "target_type", "target_id", "weight")
SELECT c."company_id", 'issue', c."issue_id", 'discussed_in', 'conversation', c."id", 1
FROM "board_conversations" c
WHERE c."issue_id" IS NOT NULL
ON CONFLICT DO NOTHING;
