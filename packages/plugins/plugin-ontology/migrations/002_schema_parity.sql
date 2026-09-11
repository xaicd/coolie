-- Ontology plugin — O1.5 schema parity with DigitalStaff (source system).
-- Adds the shared audit base columns (createBaseSchema 8-field base), domain
-- lifecycle/governance/versioning fields, node lifecycle+version, relation-type
-- cardinality, and three new tables: functions, audit logs, domain snapshots.
-- Namespace schema: plugin_ontology_b62f8af3e9 (host-derived).

-- --- Audit base columns (mirrors DigitalStaff createBaseSchema) ---
-- created_by / updated_by / is_deleted / deleted_at / deleted_by / remark.
-- (company_id + metadata + created_at + updated_at already exist from 001.)
ALTER TABLE plugin_ontology_b62f8af3e9.ontology_domains
  ADD COLUMN created_by text NOT NULL DEFAULT 'system',
  ADD COLUMN updated_by text NOT NULL DEFAULT 'system',
  ADD COLUMN is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by text,
  ADD COLUMN remark text NOT NULL DEFAULT '';

ALTER TABLE plugin_ontology_b62f8af3e9.ontology_node_types
  ADD COLUMN created_by text NOT NULL DEFAULT 'system',
  ADD COLUMN updated_by text NOT NULL DEFAULT 'system',
  ADD COLUMN is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by text,
  ADD COLUMN remark text NOT NULL DEFAULT '';

ALTER TABLE plugin_ontology_b62f8af3e9.ontology_relation_types
  ADD COLUMN created_by text NOT NULL DEFAULT 'system',
  ADD COLUMN updated_by text NOT NULL DEFAULT 'system',
  ADD COLUMN is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by text,
  ADD COLUMN remark text NOT NULL DEFAULT '';

ALTER TABLE plugin_ontology_b62f8af3e9.ontology_nodes
  ADD COLUMN created_by text NOT NULL DEFAULT 'system',
  ADD COLUMN updated_by text NOT NULL DEFAULT 'system',
  ADD COLUMN is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by text,
  ADD COLUMN remark text NOT NULL DEFAULT '';

ALTER TABLE plugin_ontology_b62f8af3e9.ontology_edges
  ADD COLUMN created_by text NOT NULL DEFAULT 'system',
  ADD COLUMN updated_by text NOT NULL DEFAULT 'system',
  ADD COLUMN is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by text,
  ADD COLUMN remark text NOT NULL DEFAULT '';

-- --- Domain: lifecycle / governance / bootstrap / stats / versioning ---
-- lifecycle_state: draft -> active -> deprecated -> archived (DigitalStaff DomainLifecycleState).
-- bootstrap_source: manual | natural-language | migration | system-seed.
ALTER TABLE plugin_ontology_b62f8af3e9.ontology_domains
  ADD COLUMN icon text NOT NULL DEFAULT '📦',
  ADD COLUMN category text NOT NULL DEFAULT 'other',
  ADD COLUMN is_built_in boolean NOT NULL DEFAULT false,
  ADD COLUMN forked_from text,
  ADD COLUMN lifecycle_state text NOT NULL DEFAULT 'draft',
  ADD COLUMN governance_policy jsonb NOT NULL DEFAULT '{"staleDays":90,"archiveDays":180,"schemaChangeApproval":true,"crossDomainApproval":true}'::jsonb,
  ADD COLUMN bootstrap_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN bootstrap_description text NOT NULL DEFAULT '',
  ADD COLUMN stats jsonb NOT NULL DEFAULT '{"nodeCount":0,"relationCount":0,"crossDomainRelationCount":0}'::jsonb,
  ADD COLUMN seed_schema_version integer NOT NULL DEFAULT 0;

-- --- Node instances: lifecycle + optimistic-lock version ---
-- lifecycle_state: active -> stale -> deprecated -> archived (DigitalStaff NodeLifecycleState).
ALTER TABLE plugin_ontology_b62f8af3e9.ontology_nodes
  ADD COLUMN lifecycle_state text NOT NULL DEFAULT 'active',
  ADD COLUMN version integer NOT NULL DEFAULT 1;

-- --- Relation types: cardinality (DigitalStaff LinkCardinality) ---
-- one_to_one | one_to_many | many_to_one | many_to_many.
ALTER TABLE plugin_ontology_b62f8af3e9.ontology_relation_types
  ADD COLUMN cardinality text NOT NULL DEFAULT 'many_to_many';

-- --- Edges: cross-domain support (DigitalStaff OntologyRelation) ---
-- source/target domain ids let an edge cross domains; is_cross_domain flags it.
ALTER TABLE plugin_ontology_b62f8af3e9.ontology_edges
  ADD COLUMN source_domain_id uuid REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  ADD COLUMN target_domain_id uuid REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  ADD COLUMN is_cross_domain boolean NOT NULL DEFAULT false;

-- --- New table: ontology_functions (DigitalStaff OntologyFunction) ---
-- Domain-scoped, versioned, typed functions (query | action | webhook).
CREATE TABLE plugin_ontology_b62f8af3e9.ontology_functions (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'query',
  version text NOT NULL DEFAULT '1.0.0',
  description text NOT NULL DEFAULT '',
  input_schema jsonb NOT NULL DEFAULT '{"type":"object","properties":{}}'::jsonb,
  output_schema jsonb NOT NULL DEFAULT '{"type":"object","properties":{}}'::jsonb,
  implementation jsonb NOT NULL DEFAULT '{"runtime":"javascript","code":"","entrypoint":"handler"}'::jsonb,
  permissions jsonb NOT NULL DEFAULT '{"allowedRoles":[],"rateLimit":{"maxCalls":100,"windowMs":60000}}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  execution_stats jsonb NOT NULL DEFAULT '{"totalCalls":0,"avgDurationMs":0,"lastCalledAt":null,"errorRate":0}'::jsonb,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, domain_id, name, version)
);

CREATE INDEX ontology_functions_domain_idx
  ON plugin_ontology_b62f8af3e9.ontology_functions (company_id, domain_id);

CREATE INDEX ontology_functions_type_status_idx
  ON plugin_ontology_b62f8af3e9.ontology_functions (type, status);

-- --- New table: ontology_domain_snapshots (DigitalStaff Domain.snapshots) ---
-- Immutable schema snapshots for version audit / rollback.
CREATE TABLE plugin_ontology_b62f8af3e9.ontology_domain_snapshots (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, domain_id, version)
);

CREATE INDEX ontology_domain_snapshots_domain_idx
  ON plugin_ontology_b62f8af3e9.ontology_domain_snapshots (company_id, domain_id);

-- --- New table: ontology_audit_logs (DigitalStaff OntologyAuditLog) ---
-- Domain/node/relation/governance change events with before/after state.
CREATE TABLE plugin_ontology_b62f8af3e9.ontology_audit_logs (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  entity_id text NOT NULL DEFAULT '',
  actor text NOT NULL DEFAULT 'system',
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ontology_audit_logs_domain_event_idx
  ON plugin_ontology_b62f8af3e9.ontology_audit_logs (company_id, domain_id, event_type);

CREATE INDEX ontology_audit_logs_event_at_idx
  ON plugin_ontology_b62f8af3e9.ontology_audit_logs (company_id, event_at);
