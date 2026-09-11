-- Ontology plugin — O6b UModel unified observability graph
-- (DigitalStaff UModelEntity / UModelLink / UModelEntitySet / UModelTelemetry parity).
-- A second graph (Alibaba UModel style) independent of the ontology metamodel:
-- entities (requirement/task/agent/service/...) linked by 27 relationship types,
-- grouped into layered entity sets, with telemetry bindings.
-- Namespace: plugin_ontology_b62f8af3e9.
-- NOTE: no apostrophes in comments (migration validator string stripper).

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_umodel_entity_sets (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'folder',
  layer text NOT NULL DEFAULT 'application',
  entity_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  parent_id uuid REFERENCES plugin_ontology_b62f8af3e9.ontology_umodel_entity_sets(id) ON DELETE SET NULL,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, key)
);

CREATE INDEX ontology_umodel_entity_sets_company_idx
  ON plugin_ontology_b62f8af3e9.ontology_umodel_entity_sets (company_id, layer);

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_umodel_entities (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key text NOT NULL,
  type text NOT NULL,
  name text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'box',
  state text NOT NULL DEFAULT 'active',
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  telemetry_bindings jsonb NOT NULL DEFAULT '[]'::jsonb,
  semantic_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  agent_description jsonb NOT NULL DEFAULT '{}'::jsonb,
  entity_set_id uuid REFERENCES plugin_ontology_b62f8af3e9.ontology_umodel_entity_sets(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, key)
);

CREATE INDEX ontology_umodel_entities_type_idx
  ON plugin_ontology_b62f8af3e9.ontology_umodel_entities (company_id, type);

CREATE INDEX ontology_umodel_entities_state_idx
  ON plugin_ontology_b62f8af3e9.ontology_umodel_entities (company_id, state);

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_umodel_links (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_entity_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_umodel_entities(id) ON DELETE CASCADE,
  to_entity_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_umodel_entities(id) ON DELETE CASCADE,
  type text NOT NULL,
  direction text NOT NULL DEFAULT 'forward',
  strength double precision NOT NULL DEFAULT 0.5,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  agent_description jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_from text NOT NULL DEFAULT 'manual',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ontology_umodel_links_from_idx
  ON plugin_ontology_b62f8af3e9.ontology_umodel_links (company_id, from_entity_id);

CREATE INDEX ontology_umodel_links_to_idx
  ON plugin_ontology_b62f8af3e9.ontology_umodel_links (company_id, to_entity_id);

CREATE INDEX ontology_umodel_links_type_idx
  ON plugin_ontology_b62f8af3e9.ontology_umodel_links (company_id, type);

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_umodel_telemetry (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_umodel_entities(id) ON DELETE CASCADE,
  type text NOT NULL,
  event_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ontology_umodel_telemetry_entity_idx
  ON plugin_ontology_b62f8af3e9.ontology_umodel_telemetry (company_id, entity_id, event_at);

CREATE INDEX ontology_umodel_telemetry_type_idx
  ON plugin_ontology_b62f8af3e9.ontology_umodel_telemetry (company_id, type, event_at);
