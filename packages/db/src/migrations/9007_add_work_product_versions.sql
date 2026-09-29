-- Coolie fork — wave141: deliverable version chain (交付物版本管理).
--
-- `issue_work_products` gains a linear version chain so a logical deliverable
-- (same issue + same title, e.g. the same prototype HTML file re-uploaded)
-- keeps every revision instead of silently accumulating unrelated rows:
--   version_group_id  groups the versions of one logical deliverable. NULL on
--                     pre-wave141 rows, which are read as a single latest version.
--   version_number    1, 2, 3 … per group. Default 1 keeps legacy rows valid.
--   is_latest         exactly one true row per group; the artifacts list and the
--                     prototype sandbox default to it. Rollback flips this flag.
--   content_sha256    sha256 of the stored bytes — idempotent dedupe key (a
--                     re-upload of identical bytes produces no new version).
--   version_note      optional change note recorded with the version.
--
-- Hand-written rather than generated: `drizzle-kit generate` cannot run on this
-- fork (pre-existing snapshot collision between 0280/9000 and 9002/9003), which
-- is why the 9000-range exists for fork migrations. Every column is nullable or
-- carries a constant default (PG 11+ stores a constant default without a table
-- rewrite), so this is safe on the live `issue_work_products` table.
ALTER TABLE "issue_work_products" ADD COLUMN IF NOT EXISTS "version_group_id" uuid;
ALTER TABLE "issue_work_products" ADD COLUMN IF NOT EXISTS "version_number" integer NOT NULL DEFAULT 1;
ALTER TABLE "issue_work_products" ADD COLUMN IF NOT EXISTS "is_latest" boolean NOT NULL DEFAULT true;
ALTER TABLE "issue_work_products" ADD COLUMN IF NOT EXISTS "content_sha256" text;
ALTER TABLE "issue_work_products" ADD COLUMN IF NOT EXISTS "version_note" text;
CREATE INDEX IF NOT EXISTS "issue_work_products_company_version_group_idx"
  ON "issue_work_products" ("company_id", "version_group_id");
