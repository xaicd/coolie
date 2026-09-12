-- Ontology plugin — capability acquisition (DigitalStaff orchestration/capability parity).
-- Self-evolution loop: detect a capability gap, discover a candidate online,
-- verify it (smoke test via host execution + license/size gates), and register
-- it as an ontology_function. Two new tables carry the gap and the acquisition
-- audit trail; the acquired capability itself reuses the existing
-- ontology_functions table (no new capability table).
-- Namespace: plugin_ontology_b62f8af3e9.
-- NOTE: no apostrophes in comments (migration validator string stripper).

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_capability_gaps (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE SET NULL,
  gap_key text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  detected_from text NOT NULL DEFAULT 'manual',
  intent_ref text,
  status text NOT NULL DEFAULT 'open',
  resolved_function_id uuid REFERENCES plugin_ontology_b62f8af3e9.ontology_functions(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'medium',
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, gap_key)
);

CREATE INDEX ontology_capability_gaps_status_idx
  ON plugin_ontology_b62f8af3e9.ontology_capability_gaps (company_id, status);

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_capability_resolutions (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  gap_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_capability_gaps(id) ON DELETE CASCADE,
  resolution_key text NOT NULL,
  stage text NOT NULL DEFAULT 'detected',
  source text NOT NULL DEFAULT 'none',
  candidate jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification jsonb NOT NULL DEFAULT '{}'::jsonb,
  license_verdict text NOT NULL DEFAULT 'unknown',
  error text NOT NULL DEFAULT '',
  stage_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, resolution_key)
);

CREATE INDEX ontology_capability_resolutions_gap_idx
  ON plugin_ontology_b62f8af3e9.ontology_capability_resolutions (company_id, gap_id);
