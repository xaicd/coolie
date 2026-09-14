-- Ontology plugin — O10 数字副手 (Digital Aide) chat persistence.
-- One chat session per (company_id, domain_id) — opening the aide tab resumes
-- the previous conversation for that domain. Messages are append-only with a
-- JSONB citations array; the worker parses a `[cite:kind:id,...]` trailer from
-- the assistant's last message and persists it as structured citations.
-- Namespace schema: plugin_ontology_b62f8af3e9 (host-derived; see 001_ontology.sql).
-- NOTE: no apostrophes in comments (migration validator string stripper).

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_aide_sessions (
  company_id    text                        NOT NULL,
  domain_id     text                        NOT NULL,
  created_at    timestamptz                 NOT NULL DEFAULT now(),
  updated_at    timestamptz                 NOT NULL DEFAULT now(),
  message_count integer                     NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, domain_id)
);

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_aide_messages (
  id          bigserial PRIMARY KEY,
  company_id  text                        NOT NULL,
  domain_id   text                        NOT NULL,
  role        text                        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text                        NOT NULL,
  citations   jsonb                       NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz                 NOT NULL DEFAULT now()
);

CREATE INDEX ontology_aide_messages_session_idx
  ON plugin_ontology_b62f8af3e9.ontology_aide_messages (company_id, domain_id, created_at);