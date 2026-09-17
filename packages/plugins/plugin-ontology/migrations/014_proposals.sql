-- Ontology plugin — proposals.
--
-- The architecture says an agent may propose and a human or a rule publishes.
-- Until this table existed there was no path for that: every write was board-only
-- and the UI was the only proposer, so "AI 是提案者" was a rule with nothing
-- behind it.
--
-- A proposal is a reviewable unit of change. It carries the operations to apply
-- and, separately, what applying them would touch — computed when the proposal
-- is created, so a reviewer sees the blast radius before deciding rather than
-- discovering it afterwards.
--
-- kind:
--   schema_change — a change to the object model (create/edit/delete a type,
--                   including the property renames that move instance data).
--   The column exists so a fact proposal (an instance or relation to publish)
--   can be added without a new table; only schema_change is implemented.
--
-- status: proposed -> approved -> applied, or proposed -> rejected.
--   `applied` is terminal and records the schema version it produced, which is
--   what ties a change to the model version it created.
--
-- Namespace schema: plugin_ontology_b62f8af3e9 (host-derived; see 001_ontology.sql).
-- NOTE: no apostrophes in comments (migration validator string stripper).

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_proposals (
  id             uuid PRIMARY KEY,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id      uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  kind           text NOT NULL DEFAULT 'schema_change',
  status         text NOT NULL DEFAULT 'proposed',
  title          text NOT NULL,
  summary        text NOT NULL DEFAULT '',
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  blast_radius   jsonb NOT NULL DEFAULT '{}'::jsonb,
  author         text NOT NULL DEFAULT 'system',
  author_kind    text NOT NULL DEFAULT 'human',
  reviewed_by    text,
  reviewed_at    timestamptz,
  review_note    text NOT NULL DEFAULT '',
  applied_at     timestamptz,
  schema_version integer,
  is_deleted     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- The review queue reads by domain, newest first.
CREATE INDEX ontology_proposals_domain_status_idx
  ON plugin_ontology_b62f8af3e9.ontology_proposals (company_id, domain_id, status, created_at DESC);
