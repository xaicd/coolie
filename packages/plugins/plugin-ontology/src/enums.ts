/**
 * Ontology enumerations, aligned with the DigitalStaff source system so the
 * migration keeps the same lifecycle/type vocabulary. Values are functional
 * identifiers (clean-room), not copied implementation.
 */

// Domain lifecycle: draft -> active -> deprecated -> archived (single direction).
export const DOMAIN_LIFECYCLE_STATES = ["draft", "active", "deprecated", "archived"] as const;
export type DomainLifecycleState = (typeof DOMAIN_LIFECYCLE_STATES)[number];

export const DOMAIN_STATE_TRANSITIONS: Record<DomainLifecycleState, DomainLifecycleState[]> = {
  draft: ["active", "archived"],
  active: ["deprecated", "archived"],
  deprecated: ["archived"],
  archived: [],
};

// Node lifecycle: active -> stale -> deprecated -> archived (single direction).
export const NODE_LIFECYCLE_STATES = ["active", "stale", "deprecated", "archived"] as const;
export type NodeLifecycleState = (typeof NODE_LIFECYCLE_STATES)[number];

export const NODE_STATE_TRANSITIONS: Record<NodeLifecycleState, NodeLifecycleState[]> = {
  active: ["stale", "deprecated", "archived"],
  stale: ["active", "deprecated", "archived"],
  deprecated: ["archived"],
  archived: [],
};

// How a domain was bootstrapped.
export const BOOTSTRAP_SOURCES = ["manual", "natural-language", "migration", "system-seed"] as const;
export type BootstrapSource = (typeof BOOTSTRAP_SOURCES)[number];

// Function type / status / runtime (DigitalStaff OntologyFunction).
export const FUNCTION_TYPES = ["query", "action", "webhook"] as const;
export type FunctionType = (typeof FUNCTION_TYPES)[number];

export const FUNCTION_STATUSES = ["draft", "active", "deprecated"] as const;
export type FunctionStatus = (typeof FUNCTION_STATUSES)[number];

export const FUNCTION_RUNTIMES = ["javascript", "python"] as const;
export type FunctionRuntime = (typeof FUNCTION_RUNTIMES)[number];

// Relation-type cardinality (DigitalStaff LinkCardinality).
export const LINK_CARDINALITIES = [
  "one_to_one",
  "one_to_many",
  "many_to_one",
  "many_to_many",
] as const;
export type LinkCardinality = (typeof LINK_CARDINALITIES)[number];

// Audit event types (DigitalStaff OntologyAuditLog AuditEventType — full set).
export const AUDIT_EVENT_TYPES = [
  "domain_registered",
  "domain_state_changed",
  "domain_unregistered",
  "schema_migrated",
  "node_created",
  "node_updated",
  "node_deleted",
  "node_state_changed",
  "relation_created",
  "relation_deleted",
  "cross_domain_relation_created",
  "governance_decision",
  "governance_policy_changed",
  "bootstrap_initiated",
  "bootstrap_confirmed",
  "app_deployed",
  "app_teardown",
  "k8s_operation",
  "dataset_created",
  "dataset_updated",
  "dataset_schema_evolved",
  "dataset_transaction_written",
  "dataset_deleted",
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

/** Return true when `to` is a legal domain lifecycle transition from `from`. */
export function isValidDomainTransition(from: DomainLifecycleState, to: DomainLifecycleState): boolean {
  return DOMAIN_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Return true when `to` is a legal node lifecycle transition from `from`. */
export function isValidNodeTransition(from: NodeLifecycleState, to: NodeLifecycleState): boolean {
  return NODE_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}
