-- Ontology plugin — O4b LLM evaluation / simulation
-- (DigitalStaff AIPLogic / Eval / GoldenDataset / PromptTemplate / SimulationScenario parity).
-- Domain-scoped LLM logic pipelines, prompt templates, golden datasets, eval runs,
-- and business simulation scenarios. Namespace: plugin_ontology_b62f8af3e9.
-- NOTE: no apostrophes in comments (migration validator string stripper).

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_prompt_templates (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  template text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  parameters jsonb NOT NULL DEFAULT '[]'::jsonb,
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

CREATE INDEX ontology_prompt_templates_domain_idx
  ON plugin_ontology_b62f8af3e9.ontology_prompt_templates (company_id, domain_id);

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_golden_datasets (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
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

CREATE INDEX ontology_golden_datasets_domain_idx
  ON plugin_ontology_b62f8af3e9.ontology_golden_datasets (company_id, domain_id);

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_aip_logics (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  context_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  prompt_template_id uuid REFERENCES plugin_ontology_b62f8af3e9.ontology_prompt_templates(id) ON DELETE SET NULL,
  model_config jsonb NOT NULL DEFAULT '{"modelId":"","temperature":0.7,"maxTokens":4096}'::jsonb,
  version text NOT NULL DEFAULT '1.0.0',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
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

CREATE INDEX ontology_aip_logics_domain_status_idx
  ON plugin_ontology_b62f8af3e9.ontology_aip_logics (company_id, domain_id, status);

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_evals (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  eval_type text NOT NULL DEFAULT 'accuracy',
  input_data jsonb,
  expected_output jsonb,
  actual_output jsonb,
  score double precision,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_id text NOT NULL DEFAULT '',
  prompt_template_id uuid REFERENCES plugin_ontology_b62f8af3e9.ontology_prompt_templates(id) ON DELETE SET NULL,
  golden_dataset_id uuid REFERENCES plugin_ontology_b62f8af3e9.ontology_golden_datasets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
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

CREATE INDEX ontology_evals_domain_status_idx
  ON plugin_ontology_b62f8af3e9.ontology_evals (company_id, domain_id, status);

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_simulation_scenarios (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  initial_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  strategies jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_strategy text,
  recommendation_reason text NOT NULL DEFAULT '',
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

CREATE INDEX ontology_simulation_scenarios_domain_idx
  ON plugin_ontology_b62f8af3e9.ontology_simulation_scenarios (company_id, domain_id);
