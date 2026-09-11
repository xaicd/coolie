-- Ontology plugin — O6 online application first-class citizens
-- (DigitalStaff BusinessSystem / SubProject parity).
-- A BusinessSystem is a complete online application bound to an ontology domain,
-- carrying ontology binding, domain governance, a domain copilot config, repos,
-- and NPC team config. A SubProject is a component of a business system
-- (frontend/backend/microservice/...) with API specs, dependencies, build config.
-- Nested DS sub-objects (ontologyBinding, domainGovernance, domainCopilotConfig,
-- runtimeStats, npcTeamConfig, repos, apiSpecs, dependencies, buildConfig) are
-- stored as jsonb. DS ObjectId refs to User/Team/AgentConfig (platform entities)
-- are modeled as optional text external references.
-- Namespace schema: plugin_ontology_b62f8af3e9 (host-derived).
-- NOTE: no apostrophes in comments (migration validator string stripper).

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_business_systems (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  domain text NOT NULL DEFAULT 'other',
  status text NOT NULL DEFAULT 'planning',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  system_id text NOT NULL DEFAULT '',
  owner_ref text,
  team_ref text,
  member_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_agent_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  tech_stack_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_role text NOT NULL DEFAULT '',
  ontology_domain_id uuid REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE SET NULL,
  forked_from_template_id text,
  is_template_system boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  repos jsonb NOT NULL DEFAULT '[]'::jsonb,
  service_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  npc_team_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ontology_binding jsonb NOT NULL DEFAULT '{"syncPolicy":"manual","allowedActionIds":[],"actionPolicies":[],"subscribedEventTypes":[]}'::jsonb,
  domain_copilot_config jsonb NOT NULL DEFAULT '{"systemPrompt":"","knowledgeBaseIds":[],"memoryScope":"domain","temperature":0.3}'::jsonb,
  domain_governance jsonb NOT NULL DEFAULT '{"securityLevel":"L2","auditPolicy":"full","slaStatus":"healthy","telemetrySnapshot":{"qps":0,"errorRatePercent":0,"p95LatencyMs":0}}'::jsonb,
  runtime_stats jsonb NOT NULL DEFAULT '{"nodeCount":0,"relationCount":0,"objectTypeCount":0}'::jsonb,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE INDEX ontology_business_systems_status_idx
  ON plugin_ontology_b62f8af3e9.ontology_business_systems (company_id, status);

CREATE INDEX ontology_business_systems_domain_idx
  ON plugin_ontology_b62f8af3e9.ontology_business_systems (company_id, ontology_domain_id);

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_sub_projects (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  business_system_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_business_systems(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  type text NOT NULL DEFAULT 'other',
  tech_stack jsonb NOT NULL DEFAULT '[]'::jsonb,
  framework jsonb NOT NULL DEFAULT '{}'::jsonb,
  responsible_agent_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_agent_ref text,
  npc_owner_ref text,
  git_repo jsonb NOT NULL DEFAULT '{}'::jsonb,
  api_specs jsonb NOT NULL DEFAULT '[]'::jsonb,
  dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  build_config jsonb NOT NULL DEFAULT '{"testCommand":"npm test","buildCommand":"npm run build","startCommand":"","previewPort":3000,"envType":"node22"}'::jsonb,
  status text NOT NULL DEFAULT 'development',
  microservice_layer text,
  ontology_node_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_activity_at timestamptz,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, business_system_id, code)
);

CREATE INDEX ontology_sub_projects_system_idx
  ON plugin_ontology_b62f8af3e9.ontology_sub_projects (company_id, business_system_id);

CREATE INDEX ontology_sub_projects_status_idx
  ON plugin_ontology_b62f8af3e9.ontology_sub_projects (company_id, status);
