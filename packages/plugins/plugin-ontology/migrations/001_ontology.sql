-- Ontology plugin — O0 skeleton schema.
-- Namespace schema name is host-derived as plugin_<slug>_<sha256(pluginId)[:10]>.
-- For pluginId "paperclipai.plugin-ontology" and namespaceSlug "ontology" this
-- resolves to plugin_ontology_b62f8af3e9. Migration statements must reference the
-- fully-qualified namespace schema (host validator enforces this).

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_domains (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  slug text NOT NULL,
  display_name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, slug)
);

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_node_types (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  key text NOT NULL,
  display_name text NOT NULL,
  description text,
  properties_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, domain_id, key)
);

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_relation_types (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  key text NOT NULL,
  display_name text NOT NULL,
  description text,
  directed boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, domain_id, key)
);

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_nodes (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  node_type_id uuid REFERENCES plugin_ontology_b62f8af3e9.ontology_node_types(id) ON DELETE SET NULL,
  key text NOT NULL,
  label text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, domain_id, key)
);

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_edges (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  relation_type_id uuid REFERENCES plugin_ontology_b62f8af3e9.ontology_relation_types(id) ON DELETE SET NULL,
  relation_key text,
  source_node_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_nodes(id) ON DELETE CASCADE,
  weight double precision NOT NULL DEFAULT 1,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ontology_nodes_domain_idx
  ON plugin_ontology_b62f8af3e9.ontology_nodes (company_id, domain_id);

CREATE INDEX ontology_edges_source_idx
  ON plugin_ontology_b62f8af3e9.ontology_edges (company_id, source_node_id);

CREATE INDEX ontology_edges_target_idx
  ON plugin_ontology_b62f8af3e9.ontology_edges (company_id, target_node_id);
