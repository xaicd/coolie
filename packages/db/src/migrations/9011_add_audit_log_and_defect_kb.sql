-- Coolie fork — wave152: audit trail (A) + defect knowledge base (D).
--
-- Two new, independent tables added together because both are pure additions
-- with no backfill and no change to any existing table:
--
--   1. audit_log    — the governance record (who/what/before/after), distinct
--                     from the activity feed.
--   2. defect_kb    — aggregates repeated defects by fingerprint so the third
--                     occurrence of the same defect can prompt a playbook.
--
-- No historical backfill: `defect_kb` fills as defects close. A SQL backfill
-- would need SHA1 (the service's fingerprint), and this instance has no
-- pgcrypto extension, so a matching SQL hash is not available. Populating at
-- runtime keeps the fingerprint in one place (services/defect-kb.ts).
--
-- Hand-written rather than generated: `drizzle-kit generate` cannot run on this
-- fork (pre-existing snapshot collision between 0280/9000 and 9002/9003), which
-- is why the 9000-range exists for fork migrations.

-- ── audit_log ───────────────────────────────────────────────────────────────
-- `activity_log` records *that* something happened and is read as an in-app
-- timeline. This table is the governance record: who changed which governed
-- object, from what (before), to what (after).
--
-- There is deliberately NO foreign key on `actor_agent_id`: an audit row must
-- keep naming the actor even after that agent is deleted. The company FK does
-- cascade, because company-scoped data goes away with its company.
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "actor_user_id" text,
  "actor_agent_id" uuid,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "before" jsonb,
  "after" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_company_target_idx"
  ON "audit_log" ("company_id", "target_type", "target_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_company_action_created_idx"
  ON "audit_log" ("company_id", "action", "created_at" DESC);
--> statement-breakpoint
-- Idempotent add: `ALTER TABLE ... ADD CONSTRAINT` has no IF NOT EXISTS, and a
-- live dev instance may have applied an earlier revision of this migration, so
-- the duplicate is swallowed rather than aborting the whole migration.
DO $$ BEGIN
  ALTER TABLE "audit_log"
    ADD CONSTRAINT "audit_log_company_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ── defect_kb ───────────────────────────────────────────────────────────────
-- One row per (company, fingerprint). `fingerprint` is the SHA1 of a
-- normalized defect title plus its taxonomy tags (see services/defect-kb.ts),
-- so "登录超时" and "登录 超时!" collapse to the same defect. `count` is how many
-- times that defect has been closed; at 3 the runtime suggests a playbook.
--
-- `sample_issue_id` / `playbook_task_id` carry no FK: they are provenance for a
-- human reading the page, and a deleted issue must not erase the KB row.
CREATE TABLE IF NOT EXISTS "defect_kb" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "fingerprint" text NOT NULL,
  "count" integer NOT NULL DEFAULT 1,
  "first_seen" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen" timestamp with time zone DEFAULT now() NOT NULL,
  "sample_issue_id" uuid,
  "suggested_playbook" text,
  "playbook_task_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "defect_kb_company_fingerprint_uq"
  ON "defect_kb" ("company_id", "fingerprint");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "defect_kb_company_last_seen_idx"
  ON "defect_kb" ("company_id", "last_seen" DESC);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "defect_kb"
    ADD CONSTRAINT "defect_kb_company_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
