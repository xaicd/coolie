-- NPC factory plugin — role templates, workflow runs, artifact registry
-- (DigitalStaff npc-factory: NpcTemplate / NpcWorkflowRun / ArtifactRegistry parity).
-- Role templates define an NPC role (by job family / layer) with a capability
-- vector, an SOP, and triggers. Workflow runs execute templates with a
-- human-in-the-loop state machine. The artifact registry tracks 5-dimension
-- artifacts (code/doc/database/design/test) with drift governance.
-- Namespace: plugin_npc_factory_c5a77ca580 (host-derived).
-- NOTE: no apostrophes in comments (migration validator string stripper).

CREATE TABLE plugin_npc_factory_c5a77ca580.npc_templates (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  name text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'robot',
  role_type text NOT NULL DEFAULT 'code-maintainer',
  job_family text,
  microservice_layer text,
  artifact_type text NOT NULL DEFAULT 'code',
  capabilities jsonb NOT NULL DEFAULT '{"codeGen":0,"codeReview":0,"apiDesign":0,"deploy":0,"monitor":0,"dataModel":0,"governance":0}'::jsonb,
  sop jsonb NOT NULL DEFAULT '[]'::jsonb,
  triggers jsonb NOT NULL DEFAULT '[]'::jsonb,
  adapter_type text NOT NULL DEFAULT '',
  system_prompt text NOT NULL DEFAULT '',
  is_built_in boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
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
  UNIQUE (company_id, template_key)
);

CREATE INDEX npc_templates_family_active_idx
  ON plugin_npc_factory_c5a77ca580.npc_templates (company_id, job_family, is_active);

CREATE TABLE plugin_npc_factory_c5a77ca580.npc_workflow_runs (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_key text NOT NULL,
  npc_id text NOT NULL DEFAULT '',
  template_id uuid REFERENCES plugin_npc_factory_c5a77ca580.npc_templates(id) ON DELETE SET NULL,
  job_family text,
  issue_ref text,
  session_ref text,
  ontology_domain_ref text,
  status text NOT NULL DEFAULT 'running',
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  total_duration_ms integer NOT NULL DEFAULT 0,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, run_key)
);

CREATE INDEX npc_workflow_runs_status_idx
  ON plugin_npc_factory_c5a77ca580.npc_workflow_runs (company_id, status);

CREATE INDEX npc_workflow_runs_template_idx
  ON plugin_npc_factory_c5a77ca580.npc_workflow_runs (company_id, template_id);

CREATE TABLE plugin_npc_factory_c5a77ca580.npc_artifact_registry (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  artifact_key text NOT NULL,
  artifact_type text NOT NULL DEFAULT 'code',
  path text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  npc_owner_ref text,
  business_system_ref text,
  sub_project_ref text,
  ontology_domain_ref text,
  drift_status text NOT NULL DEFAULT 'unknown',
  drift_reason text NOT NULL DEFAULT '',
  last_synced_at timestamptz,
  last_checked_at timestamptz,
  artifacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  stats jsonb NOT NULL DEFAULT '{"total":0,"synced":0,"drifted":0,"pending":0,"byType":{"code":0,"doc":0,"database":0,"design":0,"test":0}}'::jsonb,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, artifact_key)
);

CREATE INDEX npc_artifact_registry_drift_idx
  ON plugin_npc_factory_c5a77ca580.npc_artifact_registry (company_id, drift_status);

CREATE INDEX npc_artifact_registry_type_idx
  ON plugin_npc_factory_c5a77ca580.npc_artifact_registry (company_id, artifact_type);
