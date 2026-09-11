-- Ontology plugin — O3 legacy repository cognition (DigitalStaff RepoCognitionJob parity).
-- A resumable pipeline that reverse-engineers a legacy code repository into an
-- ontology-domain draft (entities/relations/actions/terms), then publishes the
-- draft as real Object/Link/Action types. Mirrors the DS RepoCognitionJob model:
-- 9-state machine, scale tier, shard-based resumption, coverage counters, and
-- a seeded draft that becomes building blocks on publish.
-- Namespace schema: plugin_ontology_b62f8af3e9 (host-derived).
-- NOTE: no apostrophes in comments (the migration validator string stripper
-- treats a single quote as opening a SQL string literal).

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_cognition_jobs (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_key text NOT NULL,
  domain_id uuid REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE SET NULL,
  job_type text NOT NULL DEFAULT 'repo-cognition',
  root_path text NOT NULL,
  app_name text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  target_role text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'other',
  scale text NOT NULL DEFAULT 's',
  status text NOT NULL DEFAULT 'pending',
  stage_label text NOT NULL DEFAULT '',
  error text,
  stats jsonb NOT NULL DEFAULT '{"fileCount":0,"sourceFileCount":0,"loc":0,"moduleCount":0,"sqlFileCount":0,"docFileCount":0,"truncated":false}'::jsonb,
  shards jsonb NOT NULL DEFAULT '[]'::jsonb,
  shard_total integer NOT NULL DEFAULT 0,
  shard_done integer NOT NULL DEFAULT 0,
  native_used boolean NOT NULL DEFAULT false,
  native_skipped_reason text,
  coverage jsonb NOT NULL DEFAULT '{"entityCount":0,"relationCount":0,"actionCount":0,"termCount":0,"sqlFiles":0,"apiFiles":0,"docFiles":0,"officeDocFiles":0}'::jsonb,
  progress_pct integer NOT NULL DEFAULT 2,
  draft_preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  seed_node_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  seed_relation_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  seed_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, job_key)
);

CREATE INDEX ontology_cognition_jobs_company_status_idx
  ON plugin_ontology_b62f8af3e9.ontology_cognition_jobs (company_id, status);

CREATE INDEX ontology_cognition_jobs_domain_idx
  ON plugin_ontology_b62f8af3e9.ontology_cognition_jobs (company_id, domain_id);
