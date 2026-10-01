-- Coolie fork — wave250: Palantir Ontology primitive #1 — Object.
--
-- The graph API used to answer "list all objects" by UNION-ing across every
-- source table (issues / issue_work_products / issue_attachments / ...). With
-- Palantir's 7-primitive alignment, an Object is its own row keyed on
-- (company_id, type_id, external_id) so the graph can iterate without knowing
-- which subsystem owns the underlying data.
--
-- Design notes:
-- - `type_id` is a soft-FK to `ontology_types.id`. We don't hard-FK because
--   this table is filled by the backfill below, which inserts both sides in
--   a defined order, and tightening later is one ALTER TABLE.
-- - `external_id` is the source-table's primary key in textual form (issue
--   uuid, external object id, ...). Together with `(company_id, type_id)` it
--   forms the unique key — re-ingestion of the same row collapses cleanly.
-- - `props` is the property bag for this object. Schema is on `ontology_types`
--   via `ontology_properties`; this column only holds the values.
-- - `display_label` is what the graph view renders as the object's name.

CREATE TABLE IF NOT EXISTS "ontology_objects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "type_id" uuid NOT NULL,
  "external_id" text NOT NULL,
  "display_label" text,
  "props" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ontology_objects_company_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ontology_objects_company_type_idx"
  ON "ontology_objects" ("company_id", "type_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ontology_objects_company_type_external_uq"
  ON "ontology_objects" ("company_id", "type_id", "external_id");
