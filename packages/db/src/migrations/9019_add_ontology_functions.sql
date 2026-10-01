-- Coolie fork — wave250: Palantir Ontology primitive #6 — Function.
--
-- A Function is a side-effecting verb an agent can invoke against the
-- ontology (e.g. "create issue" / "transition status" / "send approval").
-- Until now MCP tools lived only as metadata JSON on the tool catalog;
-- this table gives them a first-class row so the ontology's Function
-- layer is real, and MCP gateways read their callable surface from here
-- instead of from a metadata blob.
--
-- Notes:
-- - `name` is unique per company; it is the function's public handle.
-- - `inputs` / `outputs` are jsonb so each Function declares its own
--   argument and result shapes without a schema migration per addition.
-- - `plugin_id` is the provider that registered the function. NULL means
--   the control plane itself owns the function ("create issue" /
--   "transition issue status" / ...).

CREATE TABLE IF NOT EXISTS "ontology_functions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "outputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "plugin_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ontology_functions_company_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade,
  CONSTRAINT "ontology_functions_plugin_fk"
    FOREIGN KEY ("plugin_id") REFERENCES "plugins"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ontology_functions_company_idx"
  ON "ontology_functions" ("company_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ontology_functions_company_name_uq"
  ON "ontology_functions" ("company_id", "name");
