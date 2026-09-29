-- Coolie fork — wave147: spec-driven development chain (需求/缺陷 → 设计 → 任务).
--
-- `issues` gains a spec slot. CMMI (G1–G5) stays the project-governance layer;
-- this is the lighter development layer every code change rides on:
--   spec_kind  "requirement" | "bugfix" | "design" | "task" — which stage this
--              issue carries. NULL on issues that are ordinary tasks.
--   spec       jsonb: the stage payload for that kind (requirement body +
--              acceptanceCriteria; bugfix repro/expected/actual; design
--              approach/tradeoffs/apiSurface; task files/steps). Always present
--              together with spec_kind.
-- The chain is linked by the existing `parent_id` semantics at the spec level —
-- a task's spec.parentSpecId names the design issue, the design's names the
-- requirement/bugfix issue — so no extra table is needed.
--
-- Hand-written rather than generated: `drizzle-kit generate` cannot run on this
-- fork (pre-existing snapshot collision between 0280/9000 and 9002/9003), which
-- is why the 9000-range exists for fork migrations. Both columns are nullable
-- (no default, no table rewrite), so this is safe on the live `issues` table.
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "spec_kind" text;
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "spec" jsonb;
CREATE INDEX IF NOT EXISTS "issues_company_spec_kind_idx"
  ON "issues" ("company_id", "spec_kind");
