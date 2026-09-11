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


// ---------------------------------------------------------------------------
// Palantir Foundry ontology core alignment (O2)
// ---------------------------------------------------------------------------

/**
 * Foundry's five primitive ontology building blocks. Mapping to plugin tables:
 *  - object_type  -> ontology_node_types
 *  - link_type    -> ontology_relation_types
 *  - action_type  -> ontology_action_types
 *  - function     -> ontology_functions
 *  - interface    -> ontology_interfaces
 * (Dynamic security is cross-cutting via required_permissions / permissions.)
 */
export const ONTOLOGY_BUILDING_BLOCKS = [
  "object_type",
  "link_type",
  "action_type",
  "function",
  "interface",
] as const;
export type OntologyBuildingBlock = (typeof ONTOLOGY_BUILDING_BLOCKS)[number];

/**
 * Action type kind — what a governed transaction does (Foundry action types can
 * create/modify/delete objects, run a function, call an external system, or
 * notify). `composite` chains several effects.
 */
export const ACTION_KINDS = [
  "create",
  "modify",
  "delete",
  "function",
  "external",
  "notify",
  "composite",
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const ACTION_TYPE_STATUSES = ["draft", "active", "deprecated"] as const;
export type ActionTypeStatus = (typeof ACTION_TYPE_STATUSES)[number];

/**
 * Object-type layer — the DigitalStaff living-ontology five-layer classification
 * folded onto Foundry object types. aggregate_root / child_entity are the entity
 * mesh; action / state / event capture the kinetic layers when modeled as typed
 * nodes. `generic` is an unclassified object type.
 */
export const NODE_LAYERS = [
  "aggregate_root",
  "child_entity",
  "action",
  "state",
  "event",
  "generic",
] as const;
export type NodeLayer = (typeof NODE_LAYERS)[number];


// ---------------------------------------------------------------------------
// O3 — legacy repository cognition (DigitalStaff RepoCognitionJob parity)
// ---------------------------------------------------------------------------

/**
 * Cognition job scale tier — drives shard/split thresholds (DS RepoCognitionScale).
 */
export const COGNITION_SCALES = ["s", "m", "l", "xl"] as const;
export type CognitionScale = (typeof COGNITION_SCALES)[number];

/**
 * Cognition job lifecycle (DS RepoCognitionJobStatus): a resumable pipeline that
 * indexes a legacy repo, splits into shards, ingests/learns per shard,
 * synthesizes a draft ontology, waits for human confirmation, then publishes.
 */
export const COGNITION_JOB_STATUSES = [
  "pending",
  "indexing",
  "splitting",
  "ingesting",
  "synthesizing",
  "awaiting_confirm",
  "publishing",
  "completed",
  "failed",
] as const;
export type CognitionJobStatus = (typeof COGNITION_JOB_STATUSES)[number];

/**
 * Allowed cognition status transitions. The happy path is linear; `failed` is
 * reachable from any active state; `awaiting_confirm` can loop back to
 * `ingesting` on rejection/re-run.
 */
export const COGNITION_STATE_TRANSITIONS: Record<CognitionJobStatus, CognitionJobStatus[]> = {
  pending: ["indexing", "failed"],
  indexing: ["splitting", "failed"],
  splitting: ["ingesting", "failed"],
  ingesting: ["synthesizing", "ingesting", "failed"],
  synthesizing: ["awaiting_confirm", "failed"],
  awaiting_confirm: ["publishing", "ingesting", "failed"],
  publishing: ["completed", "failed"],
  completed: [],
  failed: ["pending"],
};

export const COGNITION_SHARD_STATUSES = ["pending", "running", "done", "failed"] as const;
export type CognitionShardStatus = (typeof COGNITION_SHARD_STATUSES)[number];

/** Return true when `to` is a legal cognition-job transition from `from`. */
export function isValidCognitionTransition(
  from: CognitionJobStatus,
  to: CognitionJobStatus,
): boolean {
  return COGNITION_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Progress percent by status (mirrors DS computeProgressPct shape). During
 * `ingesting`, callers should interpolate with shard progress.
 */
export const COGNITION_PROGRESS_BY_STATUS: Record<CognitionJobStatus, number> = {
  pending: 2,
  indexing: 8,
  splitting: 16,
  ingesting: 40,
  synthesizing: 78,
  awaiting_confirm: 90,
  publishing: 96,
  completed: 100,
  failed: 0,
};
