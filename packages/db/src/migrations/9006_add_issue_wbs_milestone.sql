-- Coolie fork — wave140: CMMI WBS 拆解 + 里程碑主线任务.
--
-- `issues` gains WBS/milestone semantics:
--   wbs_code    hierarchical number ("1", "1.1", "1.1.2") — ordering + rollup key.
--   wbs_type    "phase" | "work_package" | "task".
--   is_milestone true marks a 里程碑/主线 task — the flag the "只看主线" filter and
--                the mainline view read. Default false so ordinary tasks are unaffected.
--   milestone   jsonb: gate/status/planned+completed dates/approver/evidence/exemption.
--                Only ever non-null together with is_milestone = true.
--
-- `projects` gains a WBS draft slot:
--   wbs_draft   jsonb: the auto-generated WBS draft awaiting 采纳/忽略. Never
--                silently materialised into issues — the project head adopts it.
--
-- Hand-written rather than generated: `drizzle-kit generate` cannot run on this
-- fork (pre-existing snapshot collision between 0280/9000 and 9002/9003), which is
-- why the 9000-range exists for fork migrations. Every additive is nullable or
-- carries a literal default (PG 11+ stores a constant default without a table
-- rewrite), so this is safe on the live `issues` / `projects` tables.
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "wbs_code" text;
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "wbs_type" text;
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "is_milestone" boolean NOT NULL DEFAULT false;
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "milestone" jsonb;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "wbs_draft" jsonb;
