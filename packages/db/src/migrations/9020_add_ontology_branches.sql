-- Coolie fork — wave250: Palantir Ontology primitive #7 — Branch.
--
-- A Branch is a fork of one Type into a child Type under a named strategy
-- (think "Issue → SandboxIssue (strategy=sandbox)"). The primary agent
-- picks a Branch when dispatching work so a request lands on the right
-- sibling type — `dev` runs on the live issue, `sandbox` runs on a copy,
-- `prod` runs the promotion.
--
-- Notes:
-- - `parent_type` / `child_type` store Type `type_key`s, not Object ids.
--   A Branch describes a Type-level fork, not an instance-level fork.
-- - `branching_strategy` is plain text rather than an enum: plugin
--   authors will add strategies (sandbox / ephemeral / replay / canary /
--   ...) over time and we don't want a schema migration per addition.
-- - `parent_object_id` is the optional Object id that triggered this
--   branch (e.g. the issue a sandbox was forked from). NULL means the
--   branch describes a Type-level fork with no instance anchor yet.
-- - `metadata` carries per-branch knobs (TTL, copy-verb, replica count)
--   as free-form jsonb.

CREATE TABLE IF NOT EXISTS "ontology_branches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "parent_type" text NOT NULL,
  "child_type" text NOT NULL,
  "branching_strategy" text NOT NULL,
  "parent_object_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ontology_branches_company_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ontology_branches_company_parent_idx"
  ON "ontology_branches" ("company_id", "parent_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ontology_branches_company_strategy_idx"
  ON "ontology_branches" ("company_id", "branching_strategy");
