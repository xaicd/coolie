-- Coolie fork — wave250: Palantir Ontology primitive #2 — Type.
--
-- A Type is the schema definition for a category of Object. The ontology
-- plugin already keeps type rows in its own database (`ontology_node_types`);
-- this table is the control plane's mirror so the App, the graph API, and
-- wave245's Palantir view can iterate types without holding a second
-- connection pool to the plugin.
--
-- Design notes:
-- - `type_key` is the stable, human-meaningful identifier (e.g. `issue`,
--   `work_product`, `linear_issue`). Unique per company.
-- - `schema_ref` points at `ontology_properties.id` for the type's property
--   list. NULL means the type has no custom schema (the default Object
--   shape is enough).
-- - `source` is plain text (`internal` / `plugin:<uuid>` / `imported`) — no
--   enum so plugin authors can register new sources without a migration.
-- - `plugin_id` is the ontology plugin that owns this row. NULL means the
--   row was defined by the control plane itself.

CREATE TABLE IF NOT EXISTS "ontology_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "type_key" text NOT NULL,
  "display_name" text NOT NULL,
  "schema_ref" uuid,
  "plugin_id" uuid,
  "source" text DEFAULT 'internal' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ontology_types_company_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade,
  CONSTRAINT "ontology_types_plugin_fk"
    FOREIGN KEY ("plugin_id") REFERENCES "plugins"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ontology_types_company_idx"
  ON "ontology_types" ("company_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ontology_types_company_key_uq"
  ON "ontology_types" ("company_id", "type_key");
