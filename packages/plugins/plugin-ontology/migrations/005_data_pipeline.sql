-- Ontology plugin — O4 data pipeline (DigitalStaff Dataset/Connector/Transform/PackageInstall parity).
-- Foundry-style data integration: Datasets (typed data assets, versioned),
-- Connectors (external source ingestion), Transforms (SQL/Python DAG steps),
-- and PackageInstall (ontology package marketplace install records).
-- These are the ontology data-asset first-class citizens per DigitalStaff.
-- Namespace schema: plugin_ontology_b62f8af3e9 (host-derived).
-- NOTE: no apostrophes in comments (migration validator string stripper).

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_datasets (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  format text NOT NULL DEFAULT 'json',
  data_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_version integer NOT NULL DEFAULT 1,
  storage_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  sync_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  lifecycle_state text NOT NULL DEFAULT 'active',
  stats jsonb NOT NULL DEFAULT '{"totalRows":0,"totalSizeBytes":0,"lastSyncAt":null,"lastQueryAt":null}'::jsonb,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, domain_id, key)
);

CREATE INDEX ontology_datasets_domain_idx
  ON plugin_ontology_b62f8af3e9.ontology_datasets (company_id, domain_id);

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_connectors (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  connector_type text NOT NULL,
  dataset_id uuid REFERENCES plugin_ontology_b62f8af3e9.ontology_datasets(id) ON DELETE SET NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  sync_schedule text,
  sync_strategy text,
  status text NOT NULL DEFAULT 'disconnected',
  sync_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at timestamptz,
  last_error text,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, domain_id, key)
);

CREATE INDEX ontology_connectors_domain_idx
  ON plugin_ontology_b62f8af3e9.ontology_connectors (company_id, domain_id);

CREATE INDEX ontology_connectors_dataset_idx
  ON plugin_ontology_b62f8af3e9.ontology_connectors (company_id, dataset_id);

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_transforms (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  transform_type text NOT NULL DEFAULT 'sql',
  input_dataset_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  output_dataset_id uuid REFERENCES plugin_ontology_b62f8af3e9.ontology_datasets(id) ON DELETE SET NULL,
  code text NOT NULL DEFAULT '',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  last_executed_at timestamptz,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, domain_id, key)
);

CREATE INDEX ontology_transforms_domain_idx
  ON plugin_ontology_b62f8af3e9.ontology_transforms (company_id, domain_id);

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_package_installs (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  package_id text NOT NULL,
  version text NOT NULL DEFAULT '1.0.0',
  installed_by text NOT NULL DEFAULT '',
  result jsonb NOT NULL DEFAULT '{"nodeTypesAdded":0,"relationsAdded":0,"schemaPatched":false}'::jsonb,
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

CREATE INDEX ontology_package_installs_domain_idx
  ON plugin_ontology_b62f8af3e9.ontology_package_installs (company_id, domain_id, package_id);
