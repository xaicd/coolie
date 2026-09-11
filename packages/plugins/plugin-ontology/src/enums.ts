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


// ---------------------------------------------------------------------------
// O4 — data pipeline (DigitalStaff Dataset / Connector / Transform parity)
// ---------------------------------------------------------------------------

/** Dataset storage format (DS DatasetFormat). */
export const DATASET_FORMATS = ["csv", "parquet", "json", "database_table"] as const;
export type DatasetFormat = (typeof DATASET_FORMATS)[number];

/** Dataset lifecycle (DS DatasetLifecycleState). */
export const DATASET_LIFECYCLE_STATES = ["draft", "active", "deprecated", "archived"] as const;
export type DatasetLifecycleState = (typeof DATASET_LIFECYCLE_STATES)[number];

/** Data connector source type (DS ConnectorType). */
export const CONNECTOR_TYPES = ["mysql", "postgresql", "mongodb", "rest-api", "s3"] as const;
export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

/** Connector runtime status (DS ConnectorStatus). */
export const CONNECTOR_STATUSES = [
  "connected",
  "disconnected",
  "error",
  "reconnecting",
  "healthy",
  "unhealthy",
] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

/** Incremental sync strategy (DS SyncStrategy). */
export const SYNC_STRATEGIES = ["cdc", "timestamp", "cursor"] as const;
export type SyncStrategy = (typeof SYNC_STRATEGIES)[number];

/** Transform runtime (DS TransformType). */
export const TRANSFORM_TYPES = ["sql", "python"] as const;
export type TransformType = (typeof TRANSFORM_TYPES)[number];

/** Transform lifecycle (DS TransformStatus). */
export const TRANSFORM_STATUSES = ["draft", "active", "deprecated"] as const;
export type TransformStatus = (typeof TRANSFORM_STATUSES)[number];


// ---------------------------------------------------------------------------
// O6 — online application first-class citizens (DigitalStaff BusinessSystem / SubProject)
// ---------------------------------------------------------------------------

/** Business system lifecycle status (DS BusinessSystem.status). */
export const BUSINESS_SYSTEM_STATUSES = [
  "planning",
  "draft",
  "active",
  "maintenance",
  "archived",
  "deprecated",
] as const;
export type BusinessSystemStatus = (typeof BUSINESS_SYSTEM_STATUSES)[number];

/** Business domain / industry (DS BusinessSystem.domain). */
export const BUSINESS_SYSTEM_DOMAINS = [
  "e-commerce",
  "crm",
  "erp",
  "cms",
  "fintech",
  "healthcare",
  "education",
  "social",
  "saas",
  "manufacturing",
  "logistics",
  "iot",
  "ai",
  "gaming",
  "media",
  "government",
  "real-estate",
  "other",
] as const;
export type BusinessSystemDomain = (typeof BUSINESS_SYSTEM_DOMAINS)[number];

/** Ontology sync policy for a bound domain (DS ontologyBinding.syncPolicy). */
export const SYNC_POLICIES = ["auto", "manual", "disabled"] as const;
export type SyncPolicy = (typeof SYNC_POLICIES)[number];

/** Action risk level (DS ontologyBinding.actionPolicies.riskLevel). */
export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Domain governance security level (DS domainGovernance.securityLevel). */
export const SECURITY_LEVELS = ["L1", "L2", "L3", "L4"] as const;
export type SecurityLevel = (typeof SECURITY_LEVELS)[number];

/** Domain governance audit policy (DS domainGovernance.auditPolicy). */
export const AUDIT_POLICIES = ["full", "sampling", "off"] as const;
export type AuditPolicy = (typeof AUDIT_POLICIES)[number];

/** SLA status (DS domainGovernance.slaStatus). */
export const SLA_STATUSES = ["healthy", "warning", "degraded", "down"] as const;
export type SlaStatus = (typeof SLA_STATUSES)[number];

/** Domain copilot memory scope (DS domainCopilotConfig.memoryScope). */
export const MEMORY_SCOPES = ["session", "domain", "tenant"] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

/** Sub-project component type (DS SubProject.type). */
export const SUB_PROJECT_TYPES = [
  "frontend",
  "backend",
  "microservice",
  "library",
  "mobile-ios",
  "mobile-android",
  "mobile-rn",
  "mobile-flutter",
  "devops",
  "docs",
  "other",
] as const;
export type SubProjectType = (typeof SUB_PROJECT_TYPES)[number];

/** Sub-project status (DS SubProject.status). */
export const SUB_PROJECT_STATUSES = [
  "active",
  "development",
  "staging",
  "archived",
  "deprecated",
] as const;
export type SubProjectStatus = (typeof SUB_PROJECT_STATUSES)[number];

/** Microservice layer (DS SubProject.microserviceLayer). */
export const MICROSERVICE_LAYERS = ["L0", "L1", "L2", "L3", "L4"] as const;
export type MicroserviceLayer = (typeof MICROSERVICE_LAYERS)[number];

/** Sub-project dependency type (DS SubProject.dependencies.type). */
export const DEPENDENCY_TYPES = ["api-call", "shared-lib", "db-share", "event-bus", "other"] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

/** API spec HTTP method (DS SubProject.apiSpecs.method). */
export const API_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type ApiMethod = (typeof API_METHODS)[number];


// ---------------------------------------------------------------------------
// O4b — LLM evaluation / simulation (DigitalStaff AIPLogic / Eval / GoldenDataset / etc.)
// ---------------------------------------------------------------------------

/** AIP Logic lifecycle (DS AIPLogicStatus). */
export const AIP_LOGIC_STATUSES = ["draft", "active", "deprecated"] as const;
export type AipLogicStatus = (typeof AIP_LOGIC_STATUSES)[number];

/** AIP Logic step kind (DS LogicStepSchema.type). */
export const AIP_LOGIC_STEP_TYPES = ["llm_call", "transform", "condition", "output"] as const;
export type AipLogicStepType = (typeof AIP_LOGIC_STEP_TYPES)[number];

/** Eval run status (DS EvalStatus). */
export const EVAL_STATUSES = ["pending", "running", "completed", "failed"] as const;
export type EvalStatus = (typeof EVAL_STATUSES)[number];

/** Eval metric type (DS EvalMetricType). */
export const EVAL_METRIC_TYPES = [
  "accuracy",
  "latency",
  "token_cost",
  "user_satisfaction",
  "custom",
] as const;
export type EvalMetricType = (typeof EVAL_METRIC_TYPES)[number];

/** Golden dataset status (DS GoldenDatasetStatus). */
export const GOLDEN_DATASET_STATUSES = ["draft", "active", "archived"] as const;
export type GoldenDatasetStatus = (typeof GOLDEN_DATASET_STATUSES)[number];

/** Simulation scenario status (DS SimulationScenario.status). */
export const SIMULATION_STATUSES = ["draft", "running", "completed", "failed"] as const;
export type SimulationStatus = (typeof SIMULATION_STATUSES)[number];

// ---------------------------------------------------------------------------
// O6b — UModel unified observability graph (DigitalStaff UModel*)
// ---------------------------------------------------------------------------

/** UModel entity type (DS UModelEntity.type). */
export const UMODEL_ENTITY_TYPES = [
  "requirement",
  "task",
  "agent",
  "artifact",
  "codeChange",
  "vulnerability",
  "testCase",
  "knowledge",
  "service",
  "deployment",
  "incident",
  "UserMessage",
  "DevTask",
  "AIAgent",
  "IDEContainer",
  "TaskStage",
] as const;
export type UModelEntityType = (typeof UMODEL_ENTITY_TYPES)[number];

/** UModel entity state (DS UModelEntity.state). */
export const UMODEL_ENTITY_STATES = [
  "active",
  "inactive",
  "pending",
  "completed",
  "failed",
  "archived",
] as const;
export type UModelEntityState = (typeof UMODEL_ENTITY_STATES)[number];

/** UModel link type — 27 relationship kinds (DS UModelLink.type). */
export const UMODEL_LINK_TYPES = [
  "DECOMPOSES_TO",
  "ASSIGNED_TO",
  "EXECUTED_BY",
  "PRODUCES",
  "CONSUMES",
  "IMPLEMENTED_BY",
  "MODIFIES",
  "VERIFIES",
  "COVERS",
  "DETECTS",
  "TRIGGERS",
  "DEPENDS_ON",
  "CALLS",
  "BLOCKS",
  "MENTIONS",
  "REFERENCES",
  "SIMILAR_TO",
  "CONTAINS",
  "BELONGS_TO",
  "RELATED_TO",
  "INITIATES",
  "PROGRESSES_TO",
  "HAS_STAGE",
  "RUNS_ON",
  "CLONES_FROM",
  "RETRIES",
  "FAILS_AT",
] as const;
export type UModelLinkType = (typeof UMODEL_LINK_TYPES)[number];

/** UModel link direction (DS UModelLink.direction). */
export const UMODEL_LINK_DIRECTIONS = ["forward", "backward", "bidirectional"] as const;
export type UModelLinkDirection = (typeof UMODEL_LINK_DIRECTIONS)[number];

/** How a UModel link was discovered (DS UModelLink.discoveredFrom). */
export const UMODEL_DISCOVERED_FROM = [
  "manual",
  "telemetry",
  "code_analysis",
  "ai_inference",
] as const;
export type UModelDiscoveredFrom = (typeof UMODEL_DISCOVERED_FROM)[number];

/** UModel telemetry binding type (DS UModelTelemetry.type). */
export const UMODEL_TELEMETRY_TYPES = ["log", "trace", "event", "metric"] as const;
export type UModelTelemetryType = (typeof UMODEL_TELEMETRY_TYPES)[number];

/** UModel entity-set layer (DS UModelEntitySet.layer). */
export const UMODEL_ENTITY_SET_LAYERS = [
  "infrastructure",
  "platform",
  "application",
  "business",
] as const;
export type UModelEntitySetLayer = (typeof UMODEL_ENTITY_SET_LAYERS)[number];
