-- Ontology plugin — the domain's schema version.
--
-- A governed semantic layer has to answer "which version of the ontology did I
-- just read?". Without it nothing downstream is reproducible: an agent cannot
-- say which model its answer came from, a cache has nothing to key on, and a
-- consumer cannot tell whether the model changed underneath it.
--
-- The column exists because the version was never recorded anywhere.
-- `seed_schema_version` (002) is a different thing — it says which *seeded
-- template* a domain came from — and it is never written, so it is 0 forever.
--
-- The version is a plain counter on the domain, bumped by every accepted schema
-- change to the object model: object types and relation types. Renaming a domain or
-- editing its description is not a model change and does not bump it. Snapshots
-- in `ontology_aide_snapshots` remain named, user-visible milestones: writing a
-- full schema snapshot on every edit would flood that drawer, so the counter is
-- what tracks change and a snapshot is what captures content.
--
-- Backfill is deliberately 0: no version has ever been recorded, so claiming one
-- would be inventing history.
--
-- Namespace schema: plugin_ontology_b62f8af3e9 (host-derived; see 001_ontology.sql).
-- NOTE: no apostrophes in comments (migration validator string stripper).

ALTER TABLE plugin_ontology_b62f8af3e9.ontology_domains
  ADD COLUMN schema_version integer NOT NULL DEFAULT 0;

-- Locating "domains whose model changed since I read it" has to stay cheap.
CREATE INDEX ontology_domains_schema_version_idx
  ON plugin_ontology_b62f8af3e9.ontology_domains (company_id, schema_version DESC);
