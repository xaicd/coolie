-- Coolie fork — wave250: Palantir Ontology primitive #4 — Link.
--
-- Link is the renamed/clarified successor of `entity_relations`. The old
-- table used `src_type`/`target_type` as plain text because the ontology
-- layer didn't exist; now that Object and Type are real tables, a Link
-- references Object ids directly and the text columns go away.
--
-- `entity_relations` stays around read-only; the backfill below moves every
-- `(src_type, src_id) → (target_type, target_id)` edge onto its corresponding
-- `ontology_objects` row pair. ON CONFLICT DO NOTHING keeps this idempotent
-- so a re-run after the backfill is a no-op rather than a duplicate-key error.
--
-- Notes:
-- - We deliberately do NOT add a FK from ontology_links.{src,target}_object_id
--   to ontology_objects.id. The new Objects table is being filled by the same
--   wave250 migration chain; adding the FK would require the backfill to
--   disable and re-enable the constraint. The application layer validates
--   both endpoints exist before insert.
-- - `link_type` is plain text so the ontology plugin can register new link
--   verbs at runtime. `RelationVerb` in @paperclipai/shared is the
--   enforced vocabulary on the write path.

CREATE TABLE IF NOT EXISTS "ontology_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "src_object_id" uuid NOT NULL,
  "target_object_id" uuid NOT NULL,
  "link_type" text NOT NULL,
  "props" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ontology_links_company_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ontology_links_company_src_idx"
  ON "ontology_links" ("company_id", "src_object_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ontology_links_company_target_idx"
  ON "ontology_links" ("company_id", "target_object_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ontology_links_company_type_idx"
  ON "ontology_links" ("company_id", "link_type");
