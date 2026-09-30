-- Coolie fork — wave155: 新公司 3 步 onboarding 引导 + 公司级 metadata.
--
-- Two columns on `companies`:
--
--   * `metadata` — free-form company facts (step 1's industry, branding hints).
--     Defaults to '{}' so an existing row reads as "no facts" rather than null.
--   * `onboarding_state` — the board's own 3-step progress ({ step, industry,
--     employees, demoProjectId, demoTaskIds, completedAt }). NULL means the
--     company has never onboarded, which is the gate that routes a first-time
--     company to the wizard.
--
-- Hand-written for the same reason as the other 9000-range migrations:
-- `drizzle-kit generate` cannot run on this fork (pre-existing snapshot
-- collision). Both statements are idempotent (`IF NOT EXISTS`), so a re-run —
-- or a replay against a database that already has the columns — is a no-op.

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "onboarding_state" jsonb;
