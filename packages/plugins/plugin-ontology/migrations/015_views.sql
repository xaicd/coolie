-- Ontology plugin — saved views.
--
-- "针对不同角色用户 可以显示 不同视图" was a stated requirement, and a perspective
-- could only ever be computed: a user who arranged a view could not name it,
-- return to it, or show it to anyone. This is where one is kept.
--
-- A view is the *arrangement*, not the model: which perspective, what it focuses
-- on, how it groups. It holds no facts of its own, so deleting one loses a
-- reading of the ontology and never a fact.
--
-- kind is the perspective it opens (product | runtime | deployment | instances);
-- config holds that settings of the perspective (focus keys, filters), which the
-- resolver validates rather than trusting.
--
-- Visibility:
--   visibility = shared      every actor may open it (roles is then ignored)
--   visibility = restricted  only the listed roles may open it
-- roles is a list of role names (modeler | reviewer | viewer | agent). Empty with
-- restricted means nobody but the creator — a view that is easy to lock by
-- accident is worse than one that is easy to share.
--
-- Namespace schema: plugin_ontology_b62f8af3e9 (host-derived; see 001_ontology.sql).
-- NOTE: no apostrophes in comments (migration validator string stripper).

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_views (
  id           uuid PRIMARY KEY,
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id    uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  key          text NOT NULL,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  kind         text NOT NULL DEFAULT 'runtime',
  config       jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility   text NOT NULL DEFAULT 'shared',
  roles        jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by   text NOT NULL DEFAULT 'system',
  updated_by   text NOT NULL DEFAULT 'system',
  is_deleted   boolean NOT NULL DEFAULT false,
  deleted_at   timestamptz,
  deleted_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, domain_id, key)
);

-- Listing the views of a domain is the hot path: the workbench does it on every open.
CREATE INDEX ontology_views_domain_idx
  ON plugin_ontology_b62f8af3e9.ontology_views (company_id, domain_id, is_deleted);
