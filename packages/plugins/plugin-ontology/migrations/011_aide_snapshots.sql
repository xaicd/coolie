-- Ontology plugin — O11 驾驶舱 (Cockpit) edit-mode snapshots.
-- Every successful edit-mode apply captures a pre-edit snapshot of the
-- full ontology schema (nodeTypes + relationTypes + actionTypes) so the
-- user can browse version history and restore any prior version.
--
-- Snapshots are immutable once written. The snapshot row also stores the
-- operation summary (intent + summary + op count) for at-a-glance display
-- in the snapshot drawer; the full schema data lives in `schema_snapshot`
-- as JSONB so we never have to join against the live ontology tables.
--
-- Trigger: EditCard's "Apply" success path calls aide-create-snapshot
-- immediately before dispatching the mutations. The same snapshot row
-- therefore represents the *pre-edit* state, and restoring it means
-- computing the inverse mutation set against the live schema.
-- Namespace schema: plugin_ontology_b62f8af3e9 (host-derived; see 001_ontology.sql).
-- NOTE: no apostrophes in comments (migration validator string stripper).

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_aide_snapshots (
  id              bigserial PRIMARY KEY,
  company_id      text                        NOT NULL,
  domain_id       text                        NOT NULL,
  version         integer                     NOT NULL,
  label           text                        NOT NULL,
  intent          text                        NOT NULL,
  summary         text                        NOT NULL,
  op_count        integer                     NOT NULL,
  schema_snapshot jsonb                       NOT NULL,
  created_at      timestamptz                 NOT NULL DEFAULT now(),
  created_by      text                        NOT NULL,
  UNIQUE (company_id, domain_id, version)
);

CREATE INDEX ontology_aide_snapshots_domain_idx
  ON plugin_ontology_b62f8af3e9.ontology_aide_snapshots (company_id, domain_id, version DESC);
