-- Ontology plugin — O2 alignment with the Palantir Foundry ontology core.
-- The five primitive building blocks in Foundry are: Object Types, Link Types,
-- Action Types, Functions, and Interfaces (plus cross-cutting dynamic security).
-- Plugin already has Object Types (ontology_node_types), Link Types
-- (ontology_relation_types), and Functions (ontology_functions, from O1.5).
-- This migration adds the two missing primitives — Interfaces and Action Types —
-- and folds the DigitalStaff living-ontology five-layer model (AggregateRoot /
-- ChildEntity / ActionType / StateType / EventType) onto them:
--   * DS AggregateRoot / ChildEntity -> node_types.layer
--   * DS ActionType (API contract)   -> ontology_action_types.api_contract
--   * DS StateType (state machine)   -> ontology_action_types.state_transitions
--   * DS EventType (domain events)   -> ontology_action_types.emits_events
-- Namespace schema: plugin_ontology_b62f8af3e9 (host-derived).

-- --- New primitive: Interfaces (Foundry object-type polymorphism) ---
-- An interface describes the shape (shared properties) and capabilities an
-- object type can implement, enabling polymorphic modeling.
CREATE TABLE plugin_ontology_b62f8af3e9.ontology_interfaces (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  key text NOT NULL,
  display_name text NOT NULL,
  description text,
  properties_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  extends_interfaces jsonb NOT NULL DEFAULT '[]'::jsonb,
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

CREATE INDEX ontology_interfaces_domain_idx
  ON plugin_ontology_b62f8af3e9.ontology_interfaces (company_id, domain_id);

-- --- Object types: interface implementation + DS five-layer classification ---
-- implements_interfaces: array of interface keys this object type implements.
-- layer: which living-ontology layer this object type belongs to
--   (aggregate_root | child_entity | action | state | event | generic).
-- layer_spec: per-layer structured metadata (e.g. guards for a state node).
ALTER TABLE plugin_ontology_b62f8af3e9.ontology_node_types
  ADD COLUMN implements_interfaces jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN layer text NOT NULL DEFAULT 'generic',
  ADD COLUMN layer_spec jsonb NOT NULL DEFAULT '{}'::jsonb;

-- --- New primitive: Action Types (Foundry governed transactions) ---
-- A governed transaction that edits objects/properties/links in one shot,
-- including side effects. Carries the DS ActionType API contract, the DS
-- StateType allowed transitions, and the DS EventType events it emits, plus
-- required permissions (dynamic security).
CREATE TABLE plugin_ontology_b62f8af3e9.ontology_action_types (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_domains(id) ON DELETE CASCADE,
  key text NOT NULL,
  display_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'modify',
  applies_to_node_type_id uuid REFERENCES plugin_ontology_b62f8af3e9.ontology_node_types(id) ON DELETE SET NULL,
  api_contract jsonb NOT NULL DEFAULT '{}'::jsonb,
  state_transitions jsonb NOT NULL DEFAULT '[]'::jsonb,
  emits_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotent boolean NOT NULL DEFAULT false,
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

CREATE INDEX ontology_action_types_domain_idx
  ON plugin_ontology_b62f8af3e9.ontology_action_types (company_id, domain_id);

CREATE INDEX ontology_action_types_applies_to_idx
  ON plugin_ontology_b62f8af3e9.ontology_action_types (company_id, applies_to_node_type_id);
