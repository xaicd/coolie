-- Workflow center plugin — configs + executions (DigitalStaff workflow: WorkflowConfig / WorkflowExecution parity).
-- A workflow config is a node-DAG definition (nodes + edges + execution mode).
-- A workflow execution runs a config with a run state machine and per-node status.
-- Namespace schema is host-derived as plugin_<slug>_<sha256(pluginId)[:10]>.
-- For pluginId paperclipai.plugin-workflow with slug workflow this is plugin_workflow_c5d6ea8f5d.
-- NOTE: no apostrophes in comments (migration validator string stripper treats a
-- single quote as opening a SQL string literal).

CREATE TABLE plugin_workflow_c5d6ea8f5d.workflow_configs (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  config_key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'custom',
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  execution jsonb NOT NULL DEFAULT '{"mode":"sequential","timeoutSec":600,"continueOnError":false,"trackProgress":true}'::jsonb,
  execution_mode text NOT NULL DEFAULT 'hybrid',
  triggers jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  is_template boolean NOT NULL DEFAULT false,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, config_key)
);

CREATE INDEX workflow_configs_status_idx
  ON plugin_workflow_c5d6ea8f5d.workflow_configs (company_id, status);

CREATE INDEX workflow_configs_category_idx
  ON plugin_workflow_c5d6ea8f5d.workflow_configs (company_id, category);

CREATE TABLE plugin_workflow_c5d6ea8f5d.workflow_executions (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  execution_key text NOT NULL,
  workflow_id uuid REFERENCES plugin_workflow_c5d6ea8f5d.workflow_configs(id) ON DELETE SET NULL,
  workflow_name text NOT NULL DEFAULT '',
  workflow_version text NOT NULL DEFAULT '1.0.0',
  status text NOT NULL DEFAULT 'pending',
  trigger_type text NOT NULL DEFAULT 'manual',
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  outputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  node_executions jsonb NOT NULL DEFAULT '[]'::jsonb,
  session_ref text,
  issue_ref text,
  error text NOT NULL DEFAULT '',
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz,
  execution_time_ms integer NOT NULL DEFAULT 0,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, execution_key)
);

CREATE INDEX workflow_executions_status_idx
  ON plugin_workflow_c5d6ea8f5d.workflow_executions (company_id, status);

CREATE INDEX workflow_executions_workflow_idx
  ON plugin_workflow_c5d6ea8f5d.workflow_executions (company_id, workflow_id);
