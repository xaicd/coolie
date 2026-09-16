-- Ontology plugin — resource links (project / application ↔ ontology domain).
--
-- A domain is the anchor: real-world things reference it rather than containing
-- it, because a project commonly spans several domains and a domain is commonly
-- consumed by several applications. This table is the single place that answers
-- both directions:
--   which projects/applications use this domain, and
--   which domains does this project/application use.
--
-- resource_kind:
--   project            — host entity (Paperclip project), resource_id is its uuid
--   project_workspace  — host entity (a specific repo/workspace of a project)
--   business_system    — our own ontology_business_systems row
--
-- business_system links are MIRRORED here from
-- ontology_business_systems.ontology_domain_id, which stays the source of truth
-- (it carries the governance / copilot / NPC configuration). The mirror is
-- read-only and written from that one write path, so the two cannot disagree.
--
-- role: owner (defines the domain) | consumer (reads it).
-- Namespace schema: plugin_ontology_b62f8af3e9 (host-derived; see 001_ontology.sql).
-- NOTE: no apostrophes in comments (migration validator string stripper).

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_resource_links (
  id             uuid PRIMARY KEY,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id      uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  resource_kind  text NOT NULL,
  resource_id    text NOT NULL,
  resource_label text NOT NULL DEFAULT '',
  role           text NOT NULL DEFAULT 'consumer',
  is_deleted     boolean NOT NULL DEFAULT false,
  deleted_at     timestamptz,
  deleted_by     text,
  remark         text NOT NULL DEFAULT '',
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by     text NOT NULL DEFAULT 'system',
  updated_by     text NOT NULL DEFAULT 'system',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, resource_kind, resource_id, domain_id)
);

-- Domain side: list the resources attached to one domain.
CREATE INDEX ontology_resource_links_domain_idx
  ON plugin_ontology_b62f8af3e9.ontology_resource_links (company_id, domain_id, resource_kind);

-- Resource side: list the domains attached to one project / application.
CREATE INDEX ontology_resource_links_resource_idx
  ON plugin_ontology_b62f8af3e9.ontology_resource_links (company_id, resource_kind, resource_id);
