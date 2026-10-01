-- Coolie fork — wave239: ontology type properties (屏 3 属性编辑).
--
-- Schema-editor 屏 (wave239 屏 3) needs to persist custom property
-- definitions per (company_id, type_id). The existing `entity_relations`
-- migration (9010) only models links, not type-level field definitions,
-- so we add a fresh table.
--
-- Design notes (wave239):
-- * `type_id` is the same UUID that the ontology plugin uses for a type row
--   (its `ontology_node_types.id`). We don't FK it because the plugin keeps
--   its own tables and we don't want a hard cross-schema coupling for a
--   soft contract. The PATCH endpoint validates type_id exists in the
--   company's snapshot before writing.
-- * `properties` is jsonb so each property can carry its own shape:
--     [{ key: "displayName", type: "String", sample: "业务本体中文名" }, ...]
--   This matches the agy 草图's key/type/sample field shape.
-- * `schema_version` bumps on every write, so a board listener can replay
--   changes without diffing the whole blob.
-- * `updated_at` is informational (auditing happens through activity log).

CREATE TABLE IF NOT EXISTS "ontology_properties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "type_id" uuid NOT NULL,
  "properties" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "schema_version" integer NOT NULL DEFAULT 1,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ontology_properties_company_type_unique" UNIQUE ("company_id", "type_id")
);
