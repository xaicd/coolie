import { randomUUID } from "node:crypto";
import { relationEndpoints } from "../relationEndpoints.js";
import { prunePropertyOrder, readPropertyOrder, renameInPropertyOrder } from "../propertyOrder.js";
import {
  diffPropertySchemas,
  planPropertyRenames,
  type RenamePlan,
} from "../schemaEvolution.js";
import type { ProposalAuthorKind, ProposalKind, ProposalStatus } from "../enums.js";
import type { ViewKind, ViewRole, ViewVisibility } from "../views.js";
import type { ApiKeyRole, ApiKeyScope } from "../auth/credentials.js";
import type { SqlClient } from "./SqlClient.js";

/**
 * GraphStore isolates all ontology graph persistence and traversal behind one
 * interface. The V1 implementation is a pure Postgres backend that uses
 * `WITH RECURSIVE` for path and impact traversal. Keeping the traversal behind
 * this interface leaves a clean escape hatch for a future graph-native backend
 * (e.g. Neo4j) without touching worker/API code.
 *
 * Runtime SQL constraints enforced by the plugin host:
 *  - `db.query`   accepts a single SELECT or WITH (recursive CTE) statement.
 *  - `db.execute` accepts a single INSERT / UPDATE / DELETE statement.
 * Every object reference must be schema-qualified with `db.namespace`.
 */
import {
  COGNITION_PROGRESS_BY_STATUS,
  isValidCognitionTransition,
  isValidDomainTransition,
  classifyLicense,
  MAX_PACKAGE_SIZE_BYTES,
} from "../enums.js";
import type {
  CapabilityGapStatus,
  ResolutionStage,
  ResolutionSource,
  LicenseVerdict,
  ActionKind,
  ActionTypeStatus,
  AuditEventType,
  BootstrapSource,
  CognitionJobStatus,
  CognitionScale,
  CognitionShardStatus,
  AipLogicStatus,
  BusinessSystemDomain,
  BusinessSystemStatus,
  ConnectorStatus,
  ConnectorType,
  DatasetFormat,
  DatasetLifecycleState,
  DomainLifecycleState,
  EvalMetricType,
  EvalStatus,
  GoldenDatasetStatus,
  MicroserviceLayer,
  SimulationStatus,
  SubProjectStatus,
  SubProjectType,
  UModelDiscoveredFrom,
  UModelEntitySetLayer,
  UModelEntityState,
  UModelEntityType,
  UModelLinkDirection,
  UModelLinkType,
  UModelTelemetryType,
  FunctionStatus,
  FunctionType,
  LinkCardinality,
  NodeLayer,
  NodeLifecycleState,
  SyncStrategy,
  TransformStatus,
  TransformType,
} from "../enums.js";

export interface OntologyDomainInput {
  companyId: string;
  slug: string;
  displayName: string;
  description?: string | null;
  icon?: string;
  category?: string;
  isBuiltIn?: boolean;
  forkedFrom?: string | null;
  bootstrapSource?: BootstrapSource;
  bootstrapDescription?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

export interface OntologyDomainRow {
  id: string;
  company_id: string;
  slug: string;
  display_name: string;
  description: string | null;
  status: string;
  version: number;
  icon: string;
  category: string;
  is_built_in: boolean;
  forked_from: string | null;
  lifecycle_state: DomainLifecycleState;
  bootstrap_source: BootstrapSource;
  /** The seeded template this domain came from. Never written; see `schema_version`. */
  seed_schema_version: number;
  /**
   * Which version of the ontology this is.
   *
   * Bumped by every accepted schema change, so a caller can tell that the model
   * moved under it and an answer can name the model it came from. `0` means no
   * change has been recorded yet.
   */
  schema_version: number;
}

export interface OntologyNodeInput {
  companyId: string;
  domainId: string;
  key: string;
  label: string;
  nodeTypeId?: string | null;
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface OntologyNodeRow {
  id: string;
  company_id: string;
  domain_id: string;
  node_type_id: string | null;
  key: string;
  label: string;
  lifecycle_state: NodeLifecycleState;
  version: number;
  /** Selected by NODE_COLS; the per-instance attribute bag. */
  properties?: Record<string, unknown> | null;
}

export interface OntologyEdgeInput {
  companyId: string;
  domainId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationTypeId?: string | null;
  relationKey?: string | null;
  weight?: number;
  /** Optional cross-domain endpoints; default to domainId when omitted. */
  sourceDomainId?: string;
  targetDomainId?: string;
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface OntologyEdgeRow {
  id: string;
  company_id: string;
  domain_id: string;
  source_node_id: string;
  target_node_id: string;
  relation_key: string | null;
  weight: number;
  source_domain_id: string | null;
  target_domain_id: string | null;
  is_cross_domain: boolean;
}

export interface PathHop {
  nodeId: string;
  depth: number;
}

export interface ImpactedNode {
  nodeId: string;
  label: string;
  depth: number;
}

export type ImpactDirection = "downstream" | "upstream";

// ---------------------------------------------------------------------------
// O1 modeling types (domain / node-type / relation-type management + versions)
// ---------------------------------------------------------------------------

export interface OntologyDomainUpdate {
  displayName?: string;
  description?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface OntologyNodeTypeInput {
  companyId: string;
  domainId: string;
  key: string;
  displayName: string;
  description?: string | null;
  propertiesSchema?: Record<string, unknown>;
  /**
   * The order the source declared its fields in.
   *
   * `properties_schema` is jsonb, which re-sorts an object's keys, so the order
   * cannot live in it. Names not present in `propertiesSchema` are dropped, and
   * an absent or empty order means "unknown" — readers report that as sorted
   * rather than presenting the map's arbitrary order as the source's.
   */
  propertyOrder?: string[];
  /** Foundry interface polymorphism: interface keys this object type implements. */
  implementsInterfaces?: string[];
  /** DigitalStaff living-ontology layer classification. */
  layer?: NodeLayer;
  layerSpec?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface OntologyNodeTypeUpdate {
  displayName?: string;
  description?: string | null;
  propertiesSchema?: Record<string, unknown>;
  /**
   * The new declared order, when the caller has one.
   *
   * Optional: a schema edit maintains the stored order by itself (following a
   * rename and dropping removed names), so a caller that only changes the schema
   * cannot leave the order naming a property that no longer exists.
   */
  propertyOrder?: string[];
  implementsInterfaces?: string[];
  layer?: NodeLayer;
  layerSpec?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /**
   * Accept the loss of values for removed properties.
   *
   * Without it, an edit that would orphan instance values is refused: the
   * values are not deleted, they simply stop being reachable through the type,
   * which is the kind of damage that goes unnoticed for months. Declaring the
   * renames moves the values instead; a proposal takes it through review.
   */
  allowOrphaned?: boolean;
  /**
   * `oldKey -> newKey`, for a schema edit that renames a property.
   *
   * A diff cannot tell a rename from a delete plus an add, so the author has to
   * say which it is. Declaring it is what makes the existing instances follow:
   * without it their values keep the old key and the instances quietly stop
   * matching the type they belong to.
   */
  propertyRenames?: Record<string, string>;
}

/**
 * A schema edit that would leave instance values unreachable, and that nobody
 * has accepted.
 *
 * Thrown rather than returned because the caller must decide what kind of change
 * this is: `allowOrphaned` states that the loss is intended, and a proposal is
 * the path for one that needs review. Proceeding by default is what made the
 * divergence silent in the first place.
 */
export class SchemaChangeNeedsReview extends Error {
  constructor(readonly outcome: SchemaEditOutcome) {
    super(
      `Removing ${outcome.orphaned.join(", ")} would leave values on ` +
        `${outcome.orphanedInstances} instance(s); pass allowOrphaned to accept, ` +
        `declare propertyRenames to move them, or raise a proposal`,
    );
    this.name = "SchemaChangeNeedsReview";
  }
}

/**
 * Whether a schema edit touched the data at all.
 *
 * An edit that only adds a field has no data consequences, and recording an
 * empty outcome for it would bury the edits that do under a field nobody can
 * tell apart from noise.
 */
export function schemaEditHasEffect(outcome: SchemaEditOutcome): boolean {
  return (
    outcome.migrated.length > 0 ||
    outcome.orphaned.length > 0 ||
    outcome.ignoredRenames.length > 0
  );
}

/** What a schema edit did to the data underneath it. */
export interface SchemaEditOutcome {
  /** Renames applied to instance values. */
  migrated: Array<{ from: string; to: string }>;
  /** Instances whose values were moved. */
  migratedInstances: number;
  /** Removed keys with no declared destination: their values are now unreachable. */
  orphaned: string[];
  /** Instances still holding those keys. */
  orphanedInstances: number;
  /** Declared renames the schema diff did not support. A caller bug. */
  ignoredRenames: Array<{ from: string; to: string }>;
}

export interface OntologyNodeTypeRow {
  id: string;
  company_id: string;
  domain_id: string;
  key: string;
  display_name: string;
  description: string | null;
  layer: NodeLayer;
  properties_schema: Record<string, unknown> | null;
  /**
   * The declared field order, or `[]` when it was never recorded.
   *
   * A jsonb **array**, deliberately: jsonb reorders an object's keys but keeps
   * an array's element order, which is the whole reason the order can live here
   * when it cannot live in `properties_schema`.
   */
  property_order: string[] | null;
  /**
   * Free-form, and the only place an importer can record where a type came
   * from — the table has no provenance columns. Importers write
   * `{ origin, sourceFiles }` here; see `src/provenance.ts`.
   */
  metadata?: Record<string, unknown> | null;
}

export interface OntologyRelationTypeInput {
  companyId: string;
  domainId: string;
  key: string;
  displayName: string;
  description?: string | null;
  directed?: boolean;
  cardinality?: LinkCardinality;
  metadata?: Record<string, unknown>;
}

export interface OntologyRelationTypeUpdate {
  displayName?: string;
  description?: string | null;
  directed?: boolean;
  cardinality?: LinkCardinality;
  metadata?: Record<string, unknown>;
}

export interface OntologyRelationTypeRow {
  id: string;
  company_id: string;
  domain_id: string;
  key: string;
  display_name: string;
  description: string | null;
  directed: boolean;
  cardinality: LinkCardinality;
  /** Carries the endpoints an importer derived; see `relationEndpoints`. */
  metadata?: Record<string, unknown> | null;
}

// --- O1.5: functions / audit / snapshots (DigitalStaff parity) ---

export interface OntologyFunctionInput {
  companyId: string;
  domainId: string;
  name: string;
  type?: FunctionType;
  version?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  implementation?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface OntologyFunctionUpdate {
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  implementation?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  status?: FunctionStatus;
  metadata?: Record<string, unknown>;
}

export interface OntologyFunctionRow {
  id: string;
  company_id: string;
  domain_id: string;
  name: string;
  type: FunctionType;
  version: string;
  description: string;
  status: FunctionStatus;
}

// --- capability acquisition (DS orchestration/capability parity) ---

export interface CapabilityGapInput {
  companyId: string;
  domainId?: string | null;
  gapKey: string;
  title: string;
  description?: string;
  detectedFrom?: string;
  intentRef?: string | null;
  priority?: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface CapabilityGapRow {
  id: string;
  company_id: string;
  domain_id: string | null;
  gap_key: string;
  title: string;
  description: string;
  detected_from: string;
  intent_ref: string | null;
  status: CapabilityGapStatus;
  resolved_function_id: string | null;
  priority: string;
}

export interface CapabilityResolutionRow {
  id: string;
  company_id: string;
  gap_id: string;
  resolution_key: string;
  stage: ResolutionStage;
  source: ResolutionSource;
  candidate: Record<string, unknown>;
  verification: Record<string, unknown>;
  license_verdict: LicenseVerdict;
  error: string;
}

/** A discovered candidate an acquisition attempt evaluates. */
export interface CapabilityCandidate {
  name: string;
  version?: string;
  repoUrl?: string;
  license?: string;
  sizeBytes?: number;
  source: ResolutionSource;
  smokeTestPassed?: boolean;
}

/** Outcome of one acquireCapability attempt. */
export interface CapabilityAcquisitionResult {
  gap: CapabilityGapRow;
  resolution: CapabilityResolutionRow;
  functionId: string | null;
  acquired: boolean;
}

export interface OntologyAuditLogInput {
  companyId: string;
  domainId?: string | null;
  eventType: AuditEventType;
  entityId?: string;
  actor?: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface OntologyAuditLogRow {
  id: string;
  company_id: string;
  domain_id: string | null;
  event_type: AuditEventType;
  entity_id: string;
  actor: string;
  event_at: string;
  /**
   * Context for the event. A schema change puts `migrated` / `orphaned` /
   * `orphanedInstances` here, which is how a caller sees that an edit left
   * instance values unreachable.
   */
  metadata?: Record<string, unknown> | null;
}

export interface OntologyDomainSnapshotRow {
  id: string;
  company_id: string;
  domain_id: string;
  version: number;
  description: string;
  created_by: string;
  created_at: string;
}

// --- O2: Palantir Foundry core — interfaces + action types ---

export interface OntologyInterfaceInput {
  companyId: string;
  domainId: string;
  key: string;
  displayName: string;
  description?: string | null;
  propertiesSchema?: Record<string, unknown>;
  extendsInterfaces?: string[];
  metadata?: Record<string, unknown>;
}

export interface OntologyInterfaceUpdate {
  displayName?: string;
  description?: string | null;
  propertiesSchema?: Record<string, unknown>;
  extendsInterfaces?: string[];
  metadata?: Record<string, unknown>;
}

export interface OntologyInterfaceRow {
  id: string;
  company_id: string;
  domain_id: string;
  key: string;
  display_name: string;
  description: string | null;
}

export interface OntologyActionTypeInput {
  companyId: string;
  domainId: string;
  key: string;
  displayName: string;
  description?: string;
  kind?: ActionKind;
  appliesToNodeTypeId?: string | null;
  apiContract?: Record<string, unknown>;
  stateTransitions?: unknown[];
  emitsEvents?: unknown[];
  requiredPermissions?: unknown[];
  idempotent?: boolean;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

export interface OntologyActionTypeUpdate {
  displayName?: string;
  description?: string;
  kind?: ActionKind;
  appliesToNodeTypeId?: string | null;
  apiContract?: Record<string, unknown>;
  stateTransitions?: unknown[];
  emitsEvents?: unknown[];
  requiredPermissions?: unknown[];
  idempotent?: boolean;
  status?: ActionTypeStatus;
  metadata?: Record<string, unknown>;
}

export interface OntologyActionTypeRow {
  id: string;
  company_id: string;
  domain_id: string;
  key: string;
  display_name: string;
  description: string;
  kind: ActionKind;
  applies_to_node_type_id: string | null;
  idempotent: boolean;
  status: ActionTypeStatus;
}

// --- O3: legacy repository cognition (DigitalStaff RepoCognitionJob parity) ---

export interface CognitionShard {
  shardId: string;
  rel?: string;
  kind?: string;
  status?: CognitionShardStatus;
  fileCount?: number;
  loc?: number;
  error?: string | null;
  [key: string]: unknown;
}

export interface CognitionCoverage {
  entityCount: number;
  relationCount: number;
  actionCount: number;
  termCount: number;
  sqlFiles: number;
  apiFiles: number;
  docFiles: number;
  officeDocFiles: number;
}

export interface OntologyCognitionJobInput {
  companyId: string;
  jobKey: string;
  rootPath: string;
  domainId?: string | null;
  appName?: string;
  displayName?: string;
  description?: string;
  targetRole?: string;
  category?: string;
  scale?: CognitionScale;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface OntologyCognitionJobRow {
  id: string;
  company_id: string;
  job_key: string;
  domain_id: string | null;
  root_path: string;
  app_name: string;
  scale: CognitionScale;
  status: CognitionJobStatus;
  stage_label: string;
  shard_total: number;
  shard_done: number;
  progress_pct: number;
}

// --- O4: data pipeline (DigitalStaff Dataset / Connector / Transform / PackageInstall) ---

export interface OntologyDatasetInput {
  companyId: string;
  domainId: string;
  key: string;
  name: string;
  description?: string;
  format?: DatasetFormat;
  dataSchema?: Record<string, unknown>;
  storageConfig?: Record<string, unknown>;
  syncConfig?: Record<string, unknown>;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface OntologyDatasetUpdate {
  name?: string;
  description?: string;
  format?: DatasetFormat;
  dataSchema?: Record<string, unknown>;
  storageConfig?: Record<string, unknown>;
  syncConfig?: Record<string, unknown>;
  lifecycleState?: DatasetLifecycleState;
  metadata?: Record<string, unknown>;
}

export interface OntologyDatasetRow {
  id: string;
  company_id: string;
  domain_id: string;
  key: string;
  name: string;
  format: DatasetFormat;
  current_version: number;
  lifecycle_state: DatasetLifecycleState;
}

export interface OntologyConnectorInput {
  companyId: string;
  domainId: string;
  key: string;
  name: string;
  connectorType: ConnectorType;
  datasetId?: string | null;
  config?: Record<string, unknown>;
  syncSchedule?: string | null;
  syncStrategy?: SyncStrategy | null;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface OntologyConnectorUpdate {
  name?: string;
  datasetId?: string | null;
  config?: Record<string, unknown>;
  syncSchedule?: string | null;
  syncStrategy?: SyncStrategy | null;
  status?: ConnectorStatus;
  syncState?: Record<string, unknown>;
  lastError?: string | null;
  metadata?: Record<string, unknown>;
}

export interface OntologyConnectorRow {
  id: string;
  company_id: string;
  domain_id: string;
  key: string;
  name: string;
  connector_type: ConnectorType;
  dataset_id: string | null;
  status: ConnectorStatus;
}

export interface OntologyTransformInput {
  companyId: string;
  domainId: string;
  key: string;
  name: string;
  description?: string;
  transformType?: TransformType;
  inputDatasetIds?: string[];
  outputDatasetId?: string | null;
  code?: string;
  config?: Record<string, unknown>;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface OntologyTransformUpdate {
  name?: string;
  description?: string;
  transformType?: TransformType;
  inputDatasetIds?: string[];
  outputDatasetId?: string | null;
  code?: string;
  config?: Record<string, unknown>;
  status?: TransformStatus;
  markExecuted?: boolean;
  metadata?: Record<string, unknown>;
}

export interface OntologyTransformRow {
  id: string;
  company_id: string;
  domain_id: string;
  key: string;
  name: string;
  transform_type: TransformType;
  output_dataset_id: string | null;
  status: TransformStatus;
  version: number;
}

export interface OntologyPackageInstallInput {
  companyId: string;
  domainId: string;
  packageId: string;
  version?: string;
  installedBy?: string;
  result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface OntologyPackageInstallRow {
  id: string;
  company_id: string;
  domain_id: string;
  package_id: string;
  version: string;
  installed_by: string;
}

// --- O6: online application first-class citizens (DS BusinessSystem / SubProject) ---

export interface OntologyBusinessSystemInput {
  companyId: string;
  code: string;
  name: string;
  description?: string;
  domain?: BusinessSystemDomain;
  tags?: string[];
  ontologyDomainId?: string | null;
  ownerRef?: string | null;
  targetRole?: string;
  repos?: unknown[];
  ontologyBinding?: Record<string, unknown>;
  domainCopilotConfig?: Record<string, unknown>;
  domainGovernance?: Record<string, unknown>;
  npcTeamConfig?: Record<string, unknown>;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface OntologyBusinessSystemUpdate {
  name?: string;
  description?: string;
  domain?: BusinessSystemDomain;
  status?: BusinessSystemStatus;
  tags?: string[];
  ontologyDomainId?: string | null;
  targetRole?: string;
  repos?: unknown[];
  serviceMap?: Record<string, unknown>;
  npcTeamConfig?: Record<string, unknown>;
  ontologyBinding?: Record<string, unknown>;
  domainCopilotConfig?: Record<string, unknown>;
  domainGovernance?: Record<string, unknown>;
  runtimeStats?: Record<string, unknown>;
  isTemplateSystem?: boolean;
  metadata?: Record<string, unknown>;
}

export interface OntologyBusinessSystemRow {
  id: string;
  company_id: string;
  code: string;
  name: string;
  description?: string;
  domain: BusinessSystemDomain;
  status: BusinessSystemStatus;
  ontology_domain_id: string | null;
  is_template_system: boolean;
  ontology_binding?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * What an ontology domain can be attached to.
 *   project           — host entity (Paperclip project)
 *   project_workspace — host entity (one repo/workspace of a project)
 *   business_system   — our own ontology_business_systems row
 */
export type OntologyResourceKind = "project" | "project_workspace" | "business_system";

/** owner defines the domain; consumer reads it. */
export type OntologyResourceRole = "owner" | "consumer";

export interface OntologyResourceLinkRow {
  id: string;
  company_id: string;
  domain_id: string;
  resource_kind: OntologyResourceKind;
  resource_id: string;
  resource_label: string;
  role: OntologyResourceRole;
  is_deleted: boolean;
}

export interface OntologyResourceLinkInput {
  companyId: string;
  domainId: string;
  resourceKind: OntologyResourceKind;
  resourceId: string;
  resourceLabel?: string;
  role?: OntologyResourceRole;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

/** A domain as seen from a project/application. */
export interface LinkedDomainRow {
  linkId: string;
  role: OntologyResourceRole;
  resource_kind: OntologyResourceKind;
  domain_id: string;
  slug: string;
  display_name: string;
  version: number;
  status: string;
}

export interface OntologySubProjectInput {
  companyId: string;
  businessSystemId: string;
  name: string;
  code: string;
  type?: SubProjectType;
  techStack?: string[];
  framework?: Record<string, unknown>;
  gitRepo?: Record<string, unknown>;
  apiSpecs?: unknown[];
  dependencies?: unknown[];
  buildConfig?: Record<string, unknown>;
  microserviceLayer?: MicroserviceLayer | null;
  ontologyNodeRef?: Record<string, unknown>;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface OntologySubProjectUpdate {
  name?: string;
  type?: SubProjectType;
  techStack?: string[];
  framework?: Record<string, unknown>;
  gitRepo?: Record<string, unknown>;
  apiSpecs?: unknown[];
  dependencies?: unknown[];
  buildConfig?: Record<string, unknown>;
  status?: SubProjectStatus;
  microserviceLayer?: MicroserviceLayer | null;
  ontologyNodeRef?: Record<string, unknown>;
  markActivity?: boolean;
  metadata?: Record<string, unknown>;
}

export interface OntologyTenantInput {
  slug: string;
  name: string;
  createdBy?: string;
}

export interface OntologyTenantRow {
  id: string;
  slug: string;
  name: string;
  created_at?: string;
}

export interface OntologyApiKeyInput {
  tenantId: string;
  prefix: string;
  /** The salted hash. The secret itself is never passed here. */
  keyHash: string;
  label?: string;
  scope?: ApiKeyScope;
  roles?: ApiKeyRole[];
  /** Bind the credential to a member, so the member owns the roles. */
  memberId?: string | null;
  createdBy?: string;
}

export interface OntologyApiKeyRow {
  id: string;
  tenant_id: string;
  prefix: string;
  key_hash: string;
  label: string;
  scope: ApiKeyScope;
  roles: ApiKeyRole[];
  /** The member that owns the roles, when the key belongs to one. */
  member_id: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
}

export interface OntologyViewInput {
  companyId: string;
  domainId: string;
  key: string;
  name: string;
  description?: string;
  /** The perspective the view opens. */
  kind?: ViewKind;
  /** That perspective's own settings (focus keys, filters). */
  config?: Record<string, unknown>;
  visibility?: ViewVisibility;
  roles?: ViewRole[];
  createdBy?: string;
}

export interface OntologyViewUpdate {
  name?: string;
  description?: string;
  kind?: ViewKind;
  config?: Record<string, unknown>;
  visibility?: ViewVisibility;
  roles?: ViewRole[];
}

export interface OntologyViewRow {
  id: string;
  company_id: string;
  domain_id: string;
  key: string;
  name: string;
  description: string;
  kind: ViewKind;
  config: Record<string, unknown>;
  visibility: ViewVisibility;
  roles: ViewRole[];
  created_by: string;
  created_at?: string;
  updated_at?: string;
}

export interface OntologyProposalInput {
  companyId: string;
  domainId: string;
  kind?: ProposalKind;
  title: string;
  summary?: string;
  /** What applying this proposal would do, in the shape the applier expects. */
  payload: Record<string, unknown>;
  /** What it would touch — computed at creation so a reviewer sees it first. */
  blastRadius?: Record<string, unknown>;
  author?: string;
  authorKind?: ProposalAuthorKind;
}

export interface OntologyProposalRow {
  id: string;
  company_id: string;
  domain_id: string;
  kind: ProposalKind;
  status: ProposalStatus;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  blast_radius: Record<string, unknown>;
  author: string;
  author_kind: ProposalAuthorKind;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string;
  applied_at: string | null;
  /** The schema version the apply produced; null until applied. */
  schema_version: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface OntologySubProjectRow {
  id: string;
  company_id: string;
  business_system_id: string;
  name: string;
  code: string;
  type: SubProjectType;
  status: SubProjectStatus;
  microservice_layer: MicroserviceLayer | null;
  /** Architecture material an import recorded. */
  tech_stack: string[] | null;
  framework: Record<string, unknown> | null;
  git_repo: Record<string, unknown> | null;
  api_specs: unknown[] | null;
  /** Outgoing edges: `{ toServiceKey, targetHint, type, evidence }`. */
  dependencies: unknown[] | null;
  /** `build_config` plus an importer-added `deploy` block. */
  build_config: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

// --- O4b: LLM evaluation / simulation (DS AIPLogic / Eval / GoldenDataset / PromptTemplate / SimulationScenario) ---

export interface OntologyPromptTemplateInput {
  companyId: string;
  domainId: string;
  key: string;
  name: string;
  description?: string;
  template?: string;
  parameters?: unknown[];
  createdBy?: string;
  metadata?: Record<string, unknown>;
}
export interface OntologyPromptTemplateRow {
  id: string;
  company_id: string;
  domain_id: string;
  key: string;
  name: string;
  version: number;
}

export interface OntologyGoldenDatasetInput {
  companyId: string;
  domainId: string;
  key: string;
  name: string;
  description?: string;
  entries?: unknown[];
  createdBy?: string;
  metadata?: Record<string, unknown>;
}
export interface OntologyGoldenDatasetRow {
  id: string;
  company_id: string;
  domain_id: string;
  key: string;
  name: string;
  status: GoldenDatasetStatus;
  version: number;
}

export interface OntologyAipLogicInput {
  companyId: string;
  domainId: string;
  key: string;
  name: string;
  description?: string;
  steps?: unknown[];
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  contextConfig?: Record<string, unknown>;
  promptTemplateId?: string | null;
  modelConfig?: Record<string, unknown>;
  tags?: string[];
  createdBy?: string;
  metadata?: Record<string, unknown>;
}
export interface OntologyAipLogicUpdate {
  name?: string;
  description?: string;
  status?: AipLogicStatus;
  steps?: unknown[];
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  contextConfig?: Record<string, unknown>;
  modelConfig?: Record<string, unknown>;
  tags?: string[];
  metadata?: Record<string, unknown>;
}
export interface OntologyAipLogicRow {
  id: string;
  company_id: string;
  domain_id: string;
  key: string;
  name: string;
  status: AipLogicStatus;
  version: string;
}

export interface OntologyEvalInput {
  companyId: string;
  domainId: string;
  key: string;
  name: string;
  description?: string;
  evalType?: EvalMetricType;
  inputData?: Record<string, unknown> | null;
  expectedOutput?: Record<string, unknown> | null;
  modelId?: string;
  promptTemplateId?: string | null;
  goldenDatasetId?: string | null;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}
export interface OntologyEvalUpdate {
  status?: EvalStatus;
  actualOutput?: Record<string, unknown> | null;
  score?: number | null;
  metrics?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
export interface OntologyEvalRow {
  id: string;
  company_id: string;
  domain_id: string;
  key: string;
  name: string;
  eval_type: EvalMetricType;
  status: EvalStatus;
  score: number | null;
}

export interface OntologySimulationScenarioInput {
  companyId: string;
  domainId: string;
  key: string;
  name: string;
  description?: string;
  initialContext?: Record<string, unknown>;
  strategies?: unknown[];
  createdBy?: string;
  metadata?: Record<string, unknown>;
}
export interface OntologySimulationScenarioUpdate {
  status?: SimulationStatus;
  results?: Record<string, unknown>;
  recommendedStrategy?: string | null;
  recommendationReason?: string;
  metadata?: Record<string, unknown>;
}
export interface OntologySimulationScenarioRow {
  id: string;
  company_id: string;
  domain_id: string;
  key: string;
  name: string;
  status: SimulationStatus;
  recommended_strategy: string | null;
}

// --- O6b: UModel unified observability graph ---

export interface OntologyUModelEntitySetInput {
  companyId: string;
  key: string;
  name: string;
  description?: string;
  layer?: UModelEntitySetLayer;
  parentId?: string | null;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}
export interface OntologyUModelEntitySetRow {
  id: string;
  company_id: string;
  key: string;
  name: string;
  layer: UModelEntitySetLayer;
  parent_id: string | null;
}

export interface OntologyUModelEntityInput {
  companyId: string;
  key: string;
  type: UModelEntityType;
  name: string;
  displayName?: string;
  description?: string;
  state?: UModelEntityState;
  attributes?: Record<string, unknown>;
  telemetryBindings?: unknown[];
  semanticTags?: string[];
  agentDescription?: Record<string, unknown>;
  entitySetId?: string | null;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}
export interface OntologyUModelEntityUpdate {
  name?: string;
  displayName?: string;
  description?: string;
  state?: UModelEntityState;
  attributes?: Record<string, unknown>;
  semanticTags?: string[];
  entitySetId?: string | null;
  metadata?: Record<string, unknown>;
}
export interface OntologyUModelEntityRow {
  id: string;
  company_id: string;
  key: string;
  type: UModelEntityType;
  name: string;
  state: UModelEntityState;
  entity_set_id: string | null;
}

export interface OntologyUModelLinkInput {
  companyId: string;
  fromEntityId: string;
  toEntityId: string;
  type: UModelLinkType;
  direction?: UModelLinkDirection;
  strength?: number;
  properties?: Record<string, unknown>;
  discoveredFrom?: UModelDiscoveredFrom;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}
export interface OntologyUModelLinkRow {
  id: string;
  company_id: string;
  from_entity_id: string;
  to_entity_id: string;
  type: UModelLinkType;
  direction: UModelLinkDirection;
  strength: number;
}

export interface OntologyUModelTelemetryInput {
  companyId: string;
  entityId: string;
  type: UModelTelemetryType;
  payload?: Record<string, unknown>;
  labels?: Record<string, unknown>;
  source?: string;
}
export interface OntologyUModelTelemetryRow {
  id: string;
  company_id: string;
  entity_id: string;
  type: UModelTelemetryType;
  event_at: string;
}

export interface GraphSnapshot {
  domainId: string;
  counts: {
    nodeTypes: number;
    relationTypes: number;
    nodes: number;
    edges: number;
    /** Per-node-type node count. Key is nodeTypeId; the empty string groups nodes whose type is null. */
    byNodeType: Record<string, number>;
    /** Edges whose endpoints cross domain boundaries (one or both endpoints live in another domain). */
    crossDomainEdges: number;
  };
  nodes: Array<{
    id: string;
    key: string;
    label: string;
    nodeTypeId: string | null;
    lifecycleState: NodeLifecycleState;
    properties: Record<string, unknown> | null;
  }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    relationKey: string | null;
    weight: number;
    sourceDomainId: string | null;
    targetDomainId: string | null;
    isCrossDomain: boolean;
  }>;
}

export interface GraphStore {
  /** Resolve a logical table name to its prefixed physical name. Public
   *  so TransformRunner (Phase 4) can issue single-row queries against
   *  ontology_transforms without re-implementing the prefix logic. */
  table(name: string): string;
  // O0 — instance graph + traversal
  createDomain(input: OntologyDomainInput): Promise<OntologyDomainRow>;
  /**
   * Record that the domain's model changed, and return the new version.
   *
   * A single atomic increment, because two concurrent schema edits must not land
   * on the same version — the counter is what tells consumers the model moved.
   */
  bumpSchemaVersion(companyId: string, domainId: string): Promise<number>;
  createNode(input: OntologyNodeInput): Promise<OntologyNodeRow>;
  createEdge(input: OntologyEdgeInput): Promise<OntologyEdgeRow>;
  updateNode(
    companyId: string,
    nodeId: string,
    update: {
      label?: string;
      /** Replace the whole properties blob (empty object clears it). Undefined leaves the column alone. */
      properties?: Record<string, unknown>;
    },
  ): Promise<OntologyNodeRow | null>;
  deleteNode(companyId: string, nodeId: string): Promise<boolean>;
  updateEdge(companyId: string, edgeId: string, update: { relationKey?: string | null }): Promise<OntologyEdgeRow | null>;
  deleteEdge(companyId: string, edgeId: string): Promise<boolean>;
  findPath(params: {
    companyId: string;
    sourceNodeId: string;
    targetNodeId: string;
    maxDepth?: number;
  }): Promise<PathHop[] | null>;
  findImpact(params: {
    companyId: string;
    rootNodeId: string;
    direction?: ImpactDirection;
    maxDepth?: number;
  }): Promise<ImpactedNode[]>;

  // O1 — modeling core (domains / node-types / relation-types + versions)
  listDomains(companyId: string): Promise<OntologyDomainRow[]>;
  getDomain(companyId: string, domainId: string): Promise<OntologyDomainRow | null>;
  deleteDomain(companyId: string, domainId: string): Promise<boolean>;
  updateDomain(
    companyId: string,
    domainId: string,
    update: OntologyDomainUpdate,
  ): Promise<OntologyDomainRow | null>;

  createNodeType(input: OntologyNodeTypeInput): Promise<OntologyNodeTypeRow>;
  listNodeTypes(companyId: string, domainId: string): Promise<OntologyNodeTypeRow[]>;
  /**
   * Rewrite a type's schema, migrating the instance data the edit implies.
   *
   * `update.propertyRenames` is applied to existing instances in the same call,
   * so a rename cannot land without its data following. Removals the caller did
   * not account for are counted and written into the change record rather than
   * blocked: dropping a field on purpose is legitimate, and the review gate for
   * destructive changes belongs to proposals, which do not exist yet.
   */
  updateNodeType(
    companyId: string,
    nodeTypeId: string,
    update: OntologyNodeTypeUpdate,
  ): Promise<OntologyNodeTypeRow | null>;
  /**
   * Hard-delete a node type. The migration's `node_type_id ... ON DELETE
   * SET NULL` reference means nodes that pointed at this type will lose
   * their classification but stay alive. We use hard-delete (rather than
   * the soft-delete we use for action/function/interface) because the UI
   * surfaces a confirmation dialog warning the user about this side effect.
   */
  deleteNodeType(companyId: string, nodeTypeId: string): Promise<boolean>;

  createRelationType(input: OntologyRelationTypeInput): Promise<OntologyRelationTypeRow>;
  listRelationTypes(companyId: string, domainId: string): Promise<OntologyRelationTypeRow[]>;
  updateRelationType(
    companyId: string,
    relationTypeId: string,
    update: OntologyRelationTypeUpdate,
  ): Promise<OntologyRelationTypeRow | null>;
  /**
   * Hard-delete a relation type. Same ON DELETE SET NULL story as
   * deleteNodeType: ontology_edges.relation_type_id resolves to NULL on
   * referencing edges so the graph stays connected, just untyped.
   */
  deleteRelationType(companyId: string, relationTypeId: string): Promise<boolean>;

  getGraphSnapshot(companyId: string, domainId: string, nodeLimit?: number): Promise<GraphSnapshot>;

  // O10 — 数字副手 context aggregation
  describeDomain(companyId: string, domainId: string): Promise<DescribeDomainResult>;

  // O5 — consumption reads (backing agent tools)
  getDomainBySlug(companyId: string, slug: string): Promise<OntologyDomainRow | null>;
  getNodeByKey(companyId: string, domainId: string, key: string): Promise<OntologyNodeRow | null>;
  listNodes(companyId: string, domainId: string, limit?: number): Promise<OntologyNodeRow[]>;

  // O1.5 — lifecycle, versioning snapshots, functions, audit log
  transitionDomainLifecycle(
    companyId: string,
    domainId: string,
    to: DomainLifecycleState,
    actor?: string,
  ): Promise<OntologyDomainRow | null>;
  snapshotDomain(
    companyId: string,
    domainId: string,
    description?: string,
    createdBy?: string,
  ): Promise<OntologyDomainSnapshotRow | null>;
  listDomainSnapshots(companyId: string, domainId: string): Promise<OntologyDomainSnapshotRow[]>;

  createFunction(input: OntologyFunctionInput): Promise<OntologyFunctionRow>;
  listFunctions(companyId: string, domainId: string): Promise<OntologyFunctionRow[]>;
  updateFunction(
    companyId: string,
    functionId: string,
    update: OntologyFunctionUpdate,
  ): Promise<OntologyFunctionRow | null>;
  deleteFunction(companyId: string, functionId: string): Promise<boolean>;

  // capability acquisition
  detectCapabilityGap(input: CapabilityGapInput): Promise<CapabilityGapRow>;
  getCapabilityGap(companyId: string, gapId: string): Promise<CapabilityGapRow | null>;
  listCapabilityGaps(
    companyId: string,
    status?: string,
    limit?: number,
  ): Promise<CapabilityGapRow[]>;
  listCapabilityResolutions(companyId: string, gapId: string): Promise<CapabilityResolutionRow[]>;
  acquireCapability(
    companyId: string,
    gapId: string,
    candidate: CapabilityCandidate,
  ): Promise<CapabilityAcquisitionResult | null>;

  writeAuditLog(input: OntologyAuditLogInput): Promise<OntologyAuditLogRow>;
  listAuditLogs(companyId: string, domainId: string, limit?: number): Promise<OntologyAuditLogRow[]>;

  // O2 — Palantir core: interfaces (polymorphism) + action types (governed transactions)
  createInterface(input: OntologyInterfaceInput): Promise<OntologyInterfaceRow>;
  listInterfaces(companyId: string, domainId: string): Promise<OntologyInterfaceRow[]>;
  updateInterface(
    companyId: string,
    interfaceId: string,
    update: OntologyInterfaceUpdate,
  ): Promise<OntologyInterfaceRow | null>;
  /**
   * Soft-delete an interface. Mirrors deleteActionType / deleteFunction:
   * the row stays for audit, subsequent list calls skip it. Returns true
   * iff a row was actually marked deleted in this company.
   */
  deleteInterface(companyId: string, interfaceId: string): Promise<boolean>;

  createActionType(input: OntologyActionTypeInput): Promise<OntologyActionTypeRow>;
  listActionTypes(companyId: string, domainId: string): Promise<OntologyActionTypeRow[]>;
  updateActionType(
    companyId: string,
    actionTypeId: string,
    update: OntologyActionTypeUpdate,
  ): Promise<OntologyActionTypeRow | null>;
  deleteActionType(companyId: string, actionTypeId: string): Promise<boolean>;

  // O3 — legacy repository cognition (resumable reverse-engineering pipeline)
  createCognitionJob(input: OntologyCognitionJobInput): Promise<OntologyCognitionJobRow>;
  getCognitionJob(companyId: string, jobId: string): Promise<OntologyCognitionJobRow | null>;
  listCognitionJobs(companyId: string, limit?: number): Promise<OntologyCognitionJobRow[]>;
  transitionCognitionStatus(
    companyId: string,
    jobId: string,
    to: CognitionJobStatus,
    patch?: { stageLabel?: string; error?: string | null; actor?: string },
  ): Promise<OntologyCognitionJobRow | null>;
  updateCognitionShards(
    companyId: string,
    jobId: string,
    shards: CognitionShard[],
  ): Promise<OntologyCognitionJobRow | null>;
  recordCognitionCoverage(
    companyId: string,
    jobId: string,
    coverage: Partial<CognitionCoverage>,
  ): Promise<OntologyCognitionJobRow | null>;
  setCognitionDraft(
    companyId: string,
    jobId: string,
    draft: {
      draftPreview?: Record<string, unknown>;
      seedNodeTypes?: unknown[];
      seedRelationTypes?: unknown[];
      seedActions?: unknown[];
    },
  ): Promise<OntologyCognitionJobRow | null>;
  getCognitionDraft(
    companyId: string,
    jobId: string,
  ): Promise<{
    seedNodeTypes: unknown[];
    seedRelationTypes: unknown[];
    seedActions: unknown[];
    result: Record<string, unknown>;
  } | null>;
  setCognitionResult(
    companyId: string,
    jobId: string,
    result: Record<string, unknown>,
  ): Promise<OntologyCognitionJobRow | null>;

  // O4 — data pipeline
  createDataset(input: OntologyDatasetInput): Promise<OntologyDatasetRow>;
  listDatasets(companyId: string, domainId: string): Promise<OntologyDatasetRow[]>;
  updateDataset(
    companyId: string,
    datasetId: string,
    update: OntologyDatasetUpdate,
  ): Promise<OntologyDatasetRow | null>;

  createConnector(input: OntologyConnectorInput): Promise<OntologyConnectorRow>;
  listConnectors(companyId: string, domainId: string): Promise<OntologyConnectorRow[]>;
  updateConnector(
    companyId: string,
    connectorId: string,
    update: OntologyConnectorUpdate,
  ): Promise<OntologyConnectorRow | null>;

  createTransform(input: OntologyTransformInput): Promise<OntologyTransformRow>;
  listTransforms(companyId: string, domainId: string): Promise<OntologyTransformRow[]>;
  updateTransform(
    companyId: string,
    transformId: string,
    update: OntologyTransformUpdate,
  ): Promise<OntologyTransformRow | null>;

  createPackageInstall(input: OntologyPackageInstallInput): Promise<OntologyPackageInstallRow>;
  listPackageInstalls(companyId: string, domainId: string): Promise<OntologyPackageInstallRow[]>;

  // O6 — online application first-class citizens
  createBusinessSystem(input: OntologyBusinessSystemInput): Promise<OntologyBusinessSystemRow>;
  getBusinessSystem(companyId: string, systemId: string): Promise<OntologyBusinessSystemRow | null>;
  listBusinessSystems(companyId: string, limit?: number): Promise<OntologyBusinessSystemRow[]>;
  updateBusinessSystem(
    companyId: string,
    systemId: string,
    update: OntologyBusinessSystemUpdate,
  ): Promise<OntologyBusinessSystemRow | null>;

  // Resource links — what a domain is attached to (project / application).
  // Idempotent on (company, kind, resourceId, domain): linking twice updates
  // the label/role instead of failing, so re-running a link is safe.
  linkResource(input: OntologyResourceLinkInput): Promise<OntologyResourceLinkRow>;
  unlinkResource(
    companyId: string,
    resourceKind: OntologyResourceKind,
    resourceId: string,
    domainId: string,
  ): Promise<boolean>;
  /** Everything attached to one domain. */
  listLinksForDomain(companyId: string, domainId: string): Promise<OntologyResourceLinkRow[]>;
  /** Everything one resource is attached to. */
  listLinksForResource(
    companyId: string,
    resourceKind: OntologyResourceKind,
    resourceId: string,
  ): Promise<OntologyResourceLinkRow[]>;
  /** The domains one resource is attached to, with display fields joined in. */
  listDomainsForResource(
    companyId: string,
    resourceKind: OntologyResourceKind,
    resourceId: string,
  ): Promise<LinkedDomainRow[]>;

  /**
   * Saved views: the arrangements of the model, and who may open them.
   *
   * A view holds no facts — it records a reading (which perspective, what it
   * focuses on) — so these are ordinary CRUD with one rule on top, which lives
   * in `views.ts` and is applied by the caller that knows the actor.
   */
  /**
   * Tenancy and credentials the ontology owns.
   *
   * Until now both were borrowed: the tables referenced the host tenant table and
   * the host decided who the caller was. These are the two rows a deployment
   * without Paperclip cannot do without.
   */
  createTenant(input: OntologyTenantInput): Promise<OntologyTenantRow>;
  getTenant(tenantId: string): Promise<OntologyTenantRow | null>;
  getTenantBySlug(slug: string): Promise<OntologyTenantRow | null>;
  /** Look a key up by the half that is safe to store in an index. */
  findApiKeyByPrefix(prefix: string): Promise<OntologyApiKeyRow | null>;
  createApiKey(input: OntologyApiKeyInput): Promise<OntologyApiKeyRow>;
  listApiKeys(tenantId: string): Promise<OntologyApiKeyRow[]>;
  listTenants(): Promise<OntologyTenantRow[]>;
  revokeApiKey(tenantId: string, prefix: string, revokedBy?: string): Promise<boolean>;
  /** Record that a key was used, so a credential can be inventoried and withdrawn. */
  touchApiKey(prefix: string): Promise<void>;

  createView(input: OntologyViewInput): Promise<OntologyViewRow>;
  getView(companyId: string, viewId: string): Promise<OntologyViewRow | null>;
  listViews(companyId: string, domainId: string): Promise<OntologyViewRow[]>;
  updateView(
    companyId: string,
    viewId: string,
    update: OntologyViewUpdate,
  ): Promise<OntologyViewRow | null>;
  deleteView(companyId: string, viewId: string): Promise<boolean>;

  createProposal(input: OntologyProposalInput): Promise<OntologyProposalRow>;
  getProposal(companyId: string, proposalId: string): Promise<OntologyProposalRow | null>;
  listProposals(
    companyId: string,
    domainId: string,
    status?: ProposalStatus,
  ): Promise<OntologyProposalRow[]>;
  /**
   * Move a proposal through review. `applied` is not reachable this way —
   * applying is a separate call that also performs the change, so a proposal
   * cannot be marked done without anything having happened.
   */
  reviewProposal(
    companyId: string,
    proposalId: string,
    decision: "approved" | "rejected",
    reviewedBy: string,
    note?: string,
  ): Promise<OntologyProposalRow | null>;
  /** Record that an approved proposal was carried out, and the version it made. */
  markProposalApplied(
    companyId: string,
    proposalId: string,
    schemaVersion: number,
  ): Promise<OntologyProposalRow | null>;

  createSubProject(input: OntologySubProjectInput): Promise<OntologySubProjectRow>;
  listSubProjects(companyId: string, businessSystemId: string): Promise<OntologySubProjectRow[]>;
  /** Every service bound to a domain, across its business systems. */
  listDomainSubProjects(companyId: string, domainId: string): Promise<OntologySubProjectRow[]>;
  updateSubProject(
    companyId: string,
    subProjectId: string,
    update: OntologySubProjectUpdate,
  ): Promise<OntologySubProjectRow | null>;

  // O4b — LLM evaluation / simulation
  createPromptTemplate(input: OntologyPromptTemplateInput): Promise<OntologyPromptTemplateRow>;
  listPromptTemplates(companyId: string, domainId: string): Promise<OntologyPromptTemplateRow[]>;

  createGoldenDataset(input: OntologyGoldenDatasetInput): Promise<OntologyGoldenDatasetRow>;
  listGoldenDatasets(companyId: string, domainId: string): Promise<OntologyGoldenDatasetRow[]>;

  createAipLogic(input: OntologyAipLogicInput): Promise<OntologyAipLogicRow>;
  listAipLogics(companyId: string, domainId: string): Promise<OntologyAipLogicRow[]>;
  updateAipLogic(
    companyId: string,
    logicId: string,
    update: OntologyAipLogicUpdate,
  ): Promise<OntologyAipLogicRow | null>;

  createEval(input: OntologyEvalInput): Promise<OntologyEvalRow>;
  listEvals(companyId: string, domainId: string): Promise<OntologyEvalRow[]>;
  updateEval(
    companyId: string,
    evalId: string,
    update: OntologyEvalUpdate,
  ): Promise<OntologyEvalRow | null>;

  createSimulationScenario(
    input: OntologySimulationScenarioInput,
  ): Promise<OntologySimulationScenarioRow>;
  listSimulationScenarios(
    companyId: string,
    domainId: string,
  ): Promise<OntologySimulationScenarioRow[]>;
  updateSimulationScenario(
    companyId: string,
    scenarioId: string,
    update: OntologySimulationScenarioUpdate,
  ): Promise<OntologySimulationScenarioRow | null>;

  // O6b — UModel unified observability graph
  createUModelEntitySet(input: OntologyUModelEntitySetInput): Promise<OntologyUModelEntitySetRow>;
  listUModelEntitySets(companyId: string): Promise<OntologyUModelEntitySetRow[]>;

  createUModelEntity(input: OntologyUModelEntityInput): Promise<OntologyUModelEntityRow>;
  listUModelEntities(companyId: string, limit?: number): Promise<OntologyUModelEntityRow[]>;
  updateUModelEntity(
    companyId: string,
    entityId: string,
    update: OntologyUModelEntityUpdate,
  ): Promise<OntologyUModelEntityRow | null>;

  createUModelLink(input: OntologyUModelLinkInput): Promise<OntologyUModelLinkRow>;
  listUModelLinks(companyId: string, entityId?: string): Promise<OntologyUModelLinkRow[]>;

  recordUModelTelemetry(
    input: OntologyUModelTelemetryInput,
  ): Promise<OntologyUModelTelemetryRow>;
  listUModelTelemetry(
    companyId: string,
    entityId: string,
    limit?: number,
  ): Promise<OntologyUModelTelemetryRow[]>;
}

const DEFAULT_MAX_DEPTH = 12;

/** Clamp a caller-supplied traversal depth to a safe positive integer. */
function clampDepth(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined) return fallback;
  const rounded = Math.floor(value);
  if (rounded < 1) return 1;
  if (rounded > 64) return 64;
  return rounded;
}

/**
 * Pure Postgres GraphStore. Table references are built once from the host-derived
 * namespace so every statement stays inside the plugin's own schema.
 */
export class PostgresGraphStore implements GraphStore {
  private readonly db: SqlClient;
  private readonly ns: string;

  constructor(db: SqlClient) {
    this.db = db;
    this.ns = db.namespace;
  }

  /** Resolve a logical table name to the prefixed physical name.
   *  Public so TransformRunner (Phase 4) can issue single-row queries
   *  against ontology_transforms without re-implementing the prefix
   *  logic. Read-only callers — don't mutate through this. */
  table(name: string): string {
    // namespace is host-derived and identifier-validated; name is a fixed literal.
    return `"${this.ns}".${name}`;
  }

  async createDomain(input: OntologyDomainInput): Promise<OntologyDomainRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_domains")}
         (id, company_id, slug, display_name, description, icon, category,
          is_built_in, forked_from, bootstrap_source, bootstrap_description,
          created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13::jsonb)`,
      [
        id,
        input.companyId,
        input.slug,
        input.displayName,
        input.description ?? null,
        input.icon ?? "📦",
        input.category ?? "other",
        input.isBuiltIn ?? false,
        input.forkedFrom ?? null,
        input.bootstrapSource ?? "manual",
        input.bootstrapDescription ?? "",
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyDomainRow>(
      `SELECT ${PostgresGraphStore.DOMAIN_COLS}
         FROM ${this.table("ontology_domains")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  /**
   * The model changed: move the version and record what it was before and after.
   *
   * Both jobs live here, in the store, for two reasons. A caller that could bump
   * the version without recording the change would eventually do exactly that.
   * And the record goes to the plugin's *own* audit table, not the host's
   * activity feed — the host feed is an integration that disappears when the
   * core is deployed on its own, while this history is the ontology's.
   */
  private async markModelChanged(input: {
    companyId: string;
    domainId: string;
    eventType: Extract<
      AuditEventType,
      "schema_type_created" | "schema_type_updated" | "schema_type_deleted"
    >;
    entityId: string;
    entityKind: "node_type" | "relation_type";
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    /** Recorded alongside the change; e.g. what the data migration did. */
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.bumpSchemaVersion(input.companyId, input.domainId);
    await this.writeAuditLog({
      companyId: input.companyId,
      domainId: input.domainId,
      eventType: input.eventType,
      entityId: input.entityId,
      beforeState: input.before ?? null,
      afterState: input.after ?? null,
      metadata: { entityKind: input.entityKind, ...(input.metadata ?? {}) },
    });
  }

  /**
   * Move existing instance values when a schema edit renames a property.
   *
   * Runs before the schema is written, while the old key is still the one the
   * data uses. Declared renames are applied; removals the caller did not account
   * for are counted, so the change record can say that N instances are holding
   * values nothing can reach any more.
   */
  private async migratePropertyRenames(
    companyId: string,
    nodeTypeId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown>,
    renames: Record<string, string> | undefined,
  ): Promise<SchemaEditOutcome> {
    const diff = diffPropertySchemas(before, after);
    if (diff.removed.length === 0) {
      return {
        migrated: [],
        migratedInstances: 0,
        orphaned: [],
        orphanedInstances: 0,
        ignoredRenames: [],
      };
    }

    const plan: RenamePlan = planPropertyRenames(diff, renames);
    let migratedInstances = 0;
    for (const rename of plan.applied) {
      // `- old || new: old` moves the value, and the `?` guard keeps the
      // statement to the instances that actually have it.
      const result = await this.db.execute(
        `UPDATE ${this.table("ontology_nodes")}
            SET properties = (properties - $3::text) || jsonb_build_object($4::text, properties -> $3::text),
                updated_at = now()
          WHERE company_id = $1 AND node_type_id = $2 AND properties ? $3::text`,
        [companyId, nodeTypeId, rename.from, rename.to],
      );
      migratedInstances += result.rowCount;
    }

    // One `?` per key with a scalar parameter, rather than jsonb's `?|` with an
    // array: the host binds parameters as scalars, so an array never reaches
    // PostgreSQL as a `text[]` and the statement fails at runtime. A fake db in a
    // unit test does not parse the SQL, so only a real instance caught this.
    const orphanClause = plan.orphaned
      .map((_key, index) => `properties ? $${index + 3}::text`)
      .join(" OR ");
    const orphanedInstances =
      plan.orphaned.length === 0
        ? 0
        : Number(
            (
              await this.db.query<{ count: string }>(
                `SELECT COUNT(*) AS count FROM ${this.table("ontology_nodes")}
                  WHERE company_id = $1 AND node_type_id = $2 AND (${orphanClause})`,
                [companyId, nodeTypeId, ...plan.orphaned],
              )
            )[0]?.count ?? 0,
          );

    return {
      migrated: plan.applied,
      migratedInstances,
      orphaned: plan.orphaned,
      orphanedInstances,
      ignoredRenames: plan.ignored,
    };
  }

  async bumpSchemaVersion(companyId: string, domainId: string): Promise<number> {
    // Two statements, because the host's client does not allow it any other way:
    // `query` is SELECT-only and rejects mutation keywords, while `execute` takes
    // the UPDATE but drops RETURNING rows. The increment is atomic regardless;
    // only reading the resulting number back is a second round trip.
    await this.db.execute(
      `UPDATE ${this.table("ontology_domains")}
          SET schema_version = schema_version + 1, updated_at = now()
        WHERE company_id = $1 AND id = $2`,
      [companyId, domainId],
    );
    const rows = await this.db.query<{ schema_version: number }>(
      `SELECT schema_version FROM ${this.table("ontology_domains")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, domainId],
    );
    return Number(rows[0]?.schema_version ?? 0);
  }

  async createNode(input: OntologyNodeInput): Promise<OntologyNodeRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_nodes")}
         (id, company_id, domain_id, node_type_id, key, label, properties, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.nodeTypeId ?? null,
        input.key,
        input.label,
        JSON.stringify(input.properties ?? {}),
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyNodeRow>(
      `SELECT ${PostgresGraphStore.NODE_COLS}
         FROM ${this.table("ontology_nodes")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async createEdge(input: OntologyEdgeInput): Promise<OntologyEdgeRow> {
    const id = randomUUID();
    const sourceDomainId = input.sourceDomainId ?? input.domainId;
    const targetDomainId = input.targetDomainId ?? input.domainId;
    const isCrossDomain = sourceDomainId !== targetDomainId;
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_edges")}
         (id, company_id, domain_id, relation_type_id, relation_key,
          source_node_id, target_node_id, weight,
          source_domain_id, target_domain_id, is_cross_domain,
          properties, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.relationTypeId ?? null,
        input.relationKey ?? null,
        input.sourceNodeId,
        input.targetNodeId,
        input.weight ?? 1,
        sourceDomainId,
        targetDomainId,
        isCrossDomain,
        JSON.stringify(input.properties ?? {}),
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyEdgeRow>(
      `SELECT ${PostgresGraphStore.EDGE_COLS} FROM ${this.table("ontology_edges")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  /** Rename a graph node (label) and/or replace its properties blob. Returns the updated row, or null if missing. */
  async updateNode(
    companyId: string,
    nodeId: string,
    update: {
      label?: string;
      properties?: Record<string, unknown>;
    },
  ): Promise<OntologyNodeRow | null> {
    const propertiesProvided = update.properties !== undefined;
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_nodes")}
          SET label       = COALESCE($3, label),
              properties  = CASE WHEN $4::boolean THEN $5::jsonb ELSE properties END,
              updated_at  = now()
        WHERE company_id = $1 AND id = $2`,
      [
        companyId,
        nodeId,
        update.label ?? null,
        propertiesProvided,
        JSON.stringify(update.properties ?? {}),
      ],
    );
    if (res.rowCount === 0) return null;
    const rows = await this.db.query<OntologyNodeRow>(
      `SELECT ${PostgresGraphStore.NODE_COLS} FROM ${this.table("ontology_nodes")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, nodeId],
    );
    return rows[0] ?? null;
  }

  /** Delete a graph node. Its edges cascade (edge FKs are ON DELETE CASCADE). */
  async deleteNode(companyId: string, nodeId: string): Promise<boolean> {
    const res = await this.db.execute(
      `DELETE FROM ${this.table("ontology_nodes")} WHERE company_id = $1 AND id = $2`,
      [companyId, nodeId],
    );
    return res.rowCount > 0;
  }

  /** Change an edge relation key. Returns the updated row, or null if missing. */
  async updateEdge(
    companyId: string,
    edgeId: string,
    update: { relationKey?: string | null },
  ): Promise<OntologyEdgeRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_edges")}
          SET relation_key = $3, updated_at = now()
        WHERE company_id = $1 AND id = $2`,
      [companyId, edgeId, update.relationKey ?? null],
    );
    if (res.rowCount === 0) return null;
    const rows = await this.db.query<OntologyEdgeRow>(
      `SELECT ${PostgresGraphStore.EDGE_COLS} FROM ${this.table("ontology_edges")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, edgeId],
    );
    return rows[0] ?? null;
  }

  /** Delete a single edge. */
  async deleteEdge(companyId: string, edgeId: string): Promise<boolean> {
    const res = await this.db.execute(
      `DELETE FROM ${this.table("ontology_edges")} WHERE company_id = $1 AND id = $2`,
      [companyId, edgeId],
    );
    return res.rowCount > 0;
  }

  /**
   * Shortest hop path from source to target using a recursive CTE. Directed
   * edges are followed source -> target. Returns the ordered hop list, or null
   * when no path within maxDepth exists.
   */
  async findPath(params: {
    companyId: string;
    sourceNodeId: string;
    targetNodeId: string;
    maxDepth?: number;
  }): Promise<PathHop[] | null> {
    const maxDepth = clampDepth(params.maxDepth, DEFAULT_MAX_DEPTH);
    const rows = await this.db.query<{ node_id: string; depth: number; path: string[] }>(
      `WITH RECURSIVE walk AS (
         SELECT n.id AS node_id,
                0 AS depth,
                ARRAY[n.id] AS path
           FROM ${this.table("ontology_nodes")} n
          WHERE n.company_id = $1 AND n.id = $2
         UNION ALL
         SELECT e.target_node_id AS node_id,
                w.depth + 1 AS depth,
                w.path || e.target_node_id AS path
           FROM walk w
           JOIN ${this.table("ontology_edges")} e
             ON e.company_id = $1 AND e.source_node_id = w.node_id
          WHERE w.depth < $4
            AND NOT (e.target_node_id = ANY(w.path))
       )
       SELECT node_id, depth, path
         FROM walk
        WHERE node_id = $3
        ORDER BY depth ASC
        LIMIT 1`,
      [params.companyId, params.sourceNodeId, params.targetNodeId, maxDepth],
    );
    const best = rows[0];
    if (!best) return null;
    return best.path.map((nodeId, index) => ({ nodeId, depth: index }));
  }

  /**
   * Impact radius from a root node. downstream follows source -> target,
   * upstream follows target -> source. Returns reachable nodes with the minimal
   * depth at which each is first reached.
   */
  async findImpact(params: {
    companyId: string;
    rootNodeId: string;
    direction?: ImpactDirection;
    maxDepth?: number;
  }): Promise<ImpactedNode[]> {
    const maxDepth = clampDepth(params.maxDepth, DEFAULT_MAX_DEPTH);
    const upstream = params.direction === "upstream";
    const joinFrom = upstream ? "e.target_node_id" : "e.source_node_id";
    const joinTo = upstream ? "e.source_node_id" : "e.target_node_id";
    const rows = await this.db.query<{ node_id: string; label: string; depth: number }>(
      `WITH RECURSIVE walk AS (
         SELECT n.id AS node_id,
                0 AS depth,
                ARRAY[n.id] AS path
           FROM ${this.table("ontology_nodes")} n
          WHERE n.company_id = $1 AND n.id = $2
         UNION ALL
         SELECT ${joinTo} AS node_id,
                w.depth + 1 AS depth,
                w.path || ${joinTo} AS path
           FROM walk w
           JOIN ${this.table("ontology_edges")} e
             ON e.company_id = $1 AND ${joinFrom} = w.node_id
          WHERE w.depth < $3
            AND NOT (${joinTo} = ANY(w.path))
       )
       SELECT w.node_id, MIN(w.depth) AS depth, n.label AS label
         FROM walk w
         JOIN ${this.table("ontology_nodes")} n
           ON n.company_id = $1 AND n.id = w.node_id
        WHERE w.depth > 0
        GROUP BY w.node_id, n.label
        ORDER BY depth ASC, w.node_id ASC`,
      [params.companyId, params.rootNodeId, maxDepth],
    );
    return rows.map((row) => ({ nodeId: row.node_id, label: row.label, depth: Number(row.depth) }));
  }

  // -------------------------------------------------------------------------
  // O1 — modeling core
  // -------------------------------------------------------------------------

  private static readonly DOMAIN_COLS =
    "id, company_id, slug, display_name, description, status, version, icon, category, " +
    "is_built_in, forked_from, lifecycle_state, bootstrap_source, seed_schema_version, " +
    "schema_version";

  private static readonly NODE_COLS =
    "id, company_id, domain_id, node_type_id, key, label, lifecycle_state, version, properties";

  private static readonly EDGE_COLS =
    "id, company_id, source_domain_id, target_domain_id, source_node_id, target_node_id, " +
    "relation_type_id, relation_key, weight, is_cross_domain";

  async listDomains(companyId: string): Promise<OntologyDomainRow[]> {
    return this.db.query<OntologyDomainRow>(
      `SELECT ${PostgresGraphStore.DOMAIN_COLS}
         FROM ${this.table("ontology_domains")}
        WHERE company_id = $1 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId],
    );
  }

  async getDomain(companyId: string, domainId: string): Promise<OntologyDomainRow | null> {
    const rows = await this.db.query<OntologyDomainRow>(
      `SELECT ${PostgresGraphStore.DOMAIN_COLS}
         FROM ${this.table("ontology_domains")}
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, domainId],
    );
    return rows[0] ?? null;
  }

  /**
   * Retire a domain. Soft-delete, like every other entity here: the row stays so
   * the audit trail and anything pointing at it still resolves, and
   * `listDomains` skips it from then on.
   *
   * This was the one entity in the model with no removal path at all. The parts
   * were all present and unwired: `is_deleted` has 82 readers in this file,
   * `domain_unregistered` was already in the event vocabulary, and
   * `deleteActionType`/`deleteFunction` established the shape. So a domain could
   * be created and never removed, which is exactly the state a seeder that plants
   * seven sample domains walks you into.
   *
   * Archiving is not a substitute: `listDomains` filters `is_deleted`, not
   * `status`, so an archived domain still appears in the picker. Retirement and
   * lifecycle are different axes and this is the one that removes it.
   *
   * No schema-version bump: the version is a property of the domain, and there is
   * no longer a live domain for it to describe. The audit entry carries the
   * before-state instead.
   *
   * Returns false when no live row matched, so a second call reports that nothing
   * happened rather than claiming success.
   */
  async deleteDomain(companyId: string, domainId: string): Promise<boolean> {
    // Read first: the host's client drops RETURNING, and the audit entry needs
    // what the domain looked like at the moment it was retired.
    const prior = await this.db.query<OntologyDomainRow>(
      `SELECT ${PostgresGraphStore.DOMAIN_COLS}
         FROM ${this.table("ontology_domains")}
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, domainId],
    );
    if (!prior[0]) return false;

    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_domains")}
          SET is_deleted = true, deleted_at = now(), updated_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, domainId],
    );
    if (res.rowCount === 0) return false;

    await this.writeAuditLog({
      companyId,
      domainId,
      eventType: "domain_unregistered",
      entityId: domainId,
      beforeState: prior[0] as unknown as Record<string, unknown>,
      afterState: null,
      metadata: { entityKind: "domain" },
    });
    return true;
  }

  /**
   * Update mutable domain fields and bump its schema version. Only provided
   * fields change; version always increments so consumers can detect edits.
   */
  async updateDomain(
    companyId: string,
    domainId: string,
    update: OntologyDomainUpdate,
  ): Promise<OntologyDomainRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_domains")}
          SET display_name = COALESCE($3, display_name),
              description   = CASE WHEN $4::boolean THEN $5 ELSE description END,
              status        = COALESCE($6, status),
              metadata      = CASE WHEN $7::boolean THEN $8::jsonb ELSE metadata END,
              version       = version + 1,
              updated_at    = now()
        WHERE company_id = $1 AND id = $2`,
      [
        companyId,
        domainId,
        update.displayName ?? null,
        update.description !== undefined,
        update.description ?? null,
        update.status ?? null,
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
      ],
    );
    if (res.rowCount === 0) return null;
    return this.getDomain(companyId, domainId);
  }

  private static readonly NODE_TYPE_COLS =
    "id, company_id, domain_id, key, display_name, description, layer, properties_schema, property_order, metadata";

  /**
   * The same list qualified with the `nt` alias.
   *
   * `ontology_nodes` also has a `metadata` column, so the unqualified list is
   * ambiguous in any query that joins the two — and `describeDomain` does.
   */
  private static readonly NODE_TYPE_COLS_NT =
    "nt.id, nt.company_id, nt.domain_id, nt.key, nt.display_name, nt.description, nt.layer, nt.properties_schema, nt.property_order, nt.metadata";

  async createNodeType(input: OntologyNodeTypeInput): Promise<OntologyNodeTypeRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_node_types")}
         (id, company_id, domain_id, key, display_name, description, properties_schema,
          property_order, implements_interfaces, layer, layer_spec, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11::jsonb, $12::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.key,
        input.displayName,
        input.description ?? null,
        JSON.stringify(input.propertiesSchema ?? {}),
        // Pruned on the way in so the order can never name a property the schema
        // does not have, whatever an importer hands us.
        JSON.stringify(prunePropertyOrder(input.propertyOrder ?? [], input.propertiesSchema ?? {})),
        JSON.stringify(input.implementsInterfaces ?? []),
        input.layer ?? "generic",
        JSON.stringify(input.layerSpec ?? {}),
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyNodeTypeRow>(
      `SELECT ${PostgresGraphStore.NODE_TYPE_COLS}
         FROM ${this.table("ontology_node_types")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    await this.markModelChanged({
      companyId: input.companyId,
      domainId: input.domainId,
      eventType: "schema_type_created",
      entityId: id,
      entityKind: "node_type",
      after: rows[0] as unknown as Record<string, unknown>,
    });
    return rows[0]!;
  }

  async listNodeTypes(companyId: string, domainId: string): Promise<OntologyNodeTypeRow[]> {
    return this.db.query<OntologyNodeTypeRow>(
      `SELECT ${PostgresGraphStore.NODE_TYPE_COLS}
         FROM ${this.table("ontology_node_types")}
        WHERE company_id = $1 AND domain_id = $2
        ORDER BY created_at ASC`,
      [companyId, domainId],
    );
  }

  async updateNodeType(
    companyId: string,
    nodeTypeId: string,
    update: OntologyNodeTypeUpdate,
  ): Promise<OntologyNodeTypeRow | null> {
    // The before-state is what makes this a change history rather than a list of
    // timestamps, and schema edits are rare enough to afford the read.
    const prior = await this.db.query<OntologyNodeTypeRow>(
      `SELECT ${PostgresGraphStore.NODE_TYPE_COLS}
         FROM ${this.table("ontology_node_types")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, nodeTypeId],
    );
    const migration =
      update.propertiesSchema === undefined
        ? null
        : await this.migratePropertyRenames(
            companyId,
            nodeTypeId,
            prior[0]?.properties_schema ?? null,
            update.propertiesSchema,
            update.propertyRenames,
          );
    // Refuse before writing anything: an edit that orphans values is either
    // declared (renames), accepted (allowOrphaned), or reviewed (a proposal).
    if (migration && migration.orphanedInstances > 0 && update.allowOrphaned !== true) {
      throw new SchemaChangeNeedsReview(migration);
    }
    // The order has to follow a rename and can never name a property the schema
    // no longer has, so a schema edit maintains it even when the caller sent no
    // order. A caller that does send one is authoritative for the *sequence*, but
    // not for whether its names exist — hence prune either way.
    const schemaAfter = update.propertiesSchema ?? prior[0]?.properties_schema ?? {};
    const maintainsOrder =
      update.propertyOrder !== undefined || update.propertiesSchema !== undefined;
    const nextOrder = maintainsOrder
      ? prunePropertyOrder(
          renameInPropertyOrder(
            update.propertyOrder ?? readPropertyOrder(prior[0] ?? null),
            update.propertyRenames,
          ),
          schemaAfter,
        )
      : null;
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_node_types")}
          SET display_name          = COALESCE($3, display_name),
              description            = CASE WHEN $4::boolean THEN $5 ELSE description END,
              properties_schema      = CASE WHEN $6::boolean THEN $7::jsonb ELSE properties_schema END,
              metadata               = CASE WHEN $8::boolean THEN $9::jsonb ELSE metadata END,
              implements_interfaces  = CASE WHEN $10::boolean THEN $11::jsonb ELSE implements_interfaces END,
              layer                  = COALESCE($12, layer),
              layer_spec             = CASE WHEN $13::boolean THEN $14::jsonb ELSE layer_spec END,
              property_order         = CASE WHEN $15::boolean THEN $16::jsonb ELSE property_order END,
              updated_at             = now()
        WHERE company_id = $1 AND id = $2`,
      [
        companyId,
        nodeTypeId,
        update.displayName ?? null,
        update.description !== undefined,
        update.description ?? null,
        update.propertiesSchema !== undefined,
        JSON.stringify(update.propertiesSchema ?? {}),
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
        update.implementsInterfaces !== undefined,
        JSON.stringify(update.implementsInterfaces ?? []),
        update.layer ?? null,
        update.layerSpec !== undefined,
        JSON.stringify(update.layerSpec ?? {}),
        nextOrder !== null,
        JSON.stringify(nextOrder ?? []),
      ],
    );
    if (res.rowCount === 0) return null;
    const rows = await this.db.query<OntologyNodeTypeRow>(
      `SELECT ${PostgresGraphStore.NODE_TYPE_COLS}
         FROM ${this.table("ontology_node_types")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, nodeTypeId],
    );
    const row = rows[0];
    if (!row) return null;
    await this.markModelChanged({
      companyId,
      domainId: row.domain_id,
      eventType: "schema_type_updated",
      entityId: row.id,
      entityKind: "node_type",
      before: (prior[0] ?? null) as unknown as Record<string, unknown> | null,
      after: row as unknown as Record<string, unknown>,
      // The change history has to carry what happened to the data, not just to
      // the schema — an orphaned value is invisible everywhere else.
      ...(migration && schemaEditHasEffect(migration) ? { metadata: { ...migration } } : {}),
    });
    return row;
  }

  /**
   * Hard-delete a node type. ON DELETE SET NULL on ontology_nodes.node_type_id
   * means referencing nodes survive but lose their classification. Returns
   * true iff a row was actually deleted in this company.
   */
  async deleteNodeType(companyId: string, nodeTypeId: string): Promise<boolean> {
    // Read the row first: the delete cannot hand it back (the host's client drops
    // RETURNING) and both the version bump and the audit entry need it.
    const prior = await this.db.query<OntologyNodeTypeRow>(
      `SELECT ${PostgresGraphStore.NODE_TYPE_COLS}
         FROM ${this.table("ontology_node_types")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, nodeTypeId],
    );
    const res = await this.db.execute(
      `DELETE FROM ${this.table("ontology_node_types")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, nodeTypeId],
    );
    if (res.rowCount > 0 && prior[0]?.domain_id) {
      await this.markModelChanged({
        companyId,
        domainId: prior[0].domain_id,
        eventType: "schema_type_deleted",
        entityId: nodeTypeId,
        entityKind: "node_type",
        before: prior[0] as unknown as Record<string, unknown>,
      });
    }
    return res.rowCount > 0;
  }

  /**
   * `metadata` carries the endpoints an importer derived
   * (`sourceNodeTypeKey` / `targetNodeTypeKey`). Without it a type-level
   * structure graph cannot be drawn: relation *types* have no endpoint columns,
   * so their edges exist only in this bag — which was being written and never
   * read back.
   */
  private static readonly RELATION_TYPE_COLS =
    "id, company_id, domain_id, key, display_name, description, directed, cardinality, metadata";

  /** The same list qualified with the `rt` alias (see `NODE_TYPE_COLS_NT`). */
  private static readonly RELATION_TYPE_COLS_RT =
    "rt.id, rt.company_id, rt.domain_id, rt.key, rt.display_name, rt.description, rt.directed, rt.cardinality, rt.metadata";

  async createRelationType(input: OntologyRelationTypeInput): Promise<OntologyRelationTypeRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_relation_types")}
         (id, company_id, domain_id, key, display_name, description, directed, cardinality, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.key,
        input.displayName,
        input.description ?? null,
        input.directed ?? true,
        input.cardinality ?? "many_to_many",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyRelationTypeRow>(
      `SELECT ${PostgresGraphStore.RELATION_TYPE_COLS}
         FROM ${this.table("ontology_relation_types")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    await this.markModelChanged({
      companyId: input.companyId,
      domainId: input.domainId,
      eventType: "schema_type_created",
      entityId: id,
      entityKind: "relation_type",
      after: rows[0] as unknown as Record<string, unknown>,
    });
    return rows[0]!;
  }

  async listRelationTypes(companyId: string, domainId: string): Promise<OntologyRelationTypeRow[]> {
    return this.db.query<OntologyRelationTypeRow>(
      `SELECT ${PostgresGraphStore.RELATION_TYPE_COLS}
         FROM ${this.table("ontology_relation_types")}
        WHERE company_id = $1 AND domain_id = $2
        ORDER BY created_at ASC`,
      [companyId, domainId],
    );
  }

  async updateRelationType(
    companyId: string,
    relationTypeId: string,
    update: OntologyRelationTypeUpdate,
  ): Promise<OntologyRelationTypeRow | null> {
    const prior = await this.db.query<OntologyRelationTypeRow>(
      `SELECT ${PostgresGraphStore.RELATION_TYPE_COLS}
         FROM ${this.table("ontology_relation_types")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, relationTypeId],
    );
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_relation_types")}
          SET display_name = COALESCE($3, display_name),
              description   = CASE WHEN $4::boolean THEN $5 ELSE description END,
              directed      = COALESCE($6, directed),
              cardinality   = COALESCE($9, cardinality),
              metadata      = CASE WHEN $7::boolean THEN $8::jsonb ELSE metadata END,
              updated_at    = now()
        WHERE company_id = $1 AND id = $2`,
      [
        companyId,
        relationTypeId,
        update.displayName ?? null,
        update.description !== undefined,
        update.description ?? null,
        typeof update.directed === "boolean" ? update.directed : null,
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
        update.cardinality ?? null,
      ],
    );
    if (res.rowCount === 0) return null;
    const rows = await this.db.query<OntologyRelationTypeRow>(
      `SELECT ${PostgresGraphStore.RELATION_TYPE_COLS}
         FROM ${this.table("ontology_relation_types")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, relationTypeId],
    );
    const row = rows[0];
    if (!row) return null;
    await this.markModelChanged({
      companyId,
      domainId: row.domain_id,
      eventType: "schema_type_updated",
      entityId: row.id,
      entityKind: "relation_type",
      before: (prior[0] ?? null) as unknown as Record<string, unknown> | null,
      after: row as unknown as Record<string, unknown>,
    });
    return row;
  }

  /**
   * Hard-delete a relation type. See deleteNodeType for the rationale
   * (ON DELETE SET NULL on ontology_edges.relation_type_id keeps edges
   * alive but untyped). Returns true iff a row was actually deleted.
   */
  async deleteRelationType(companyId: string, relationTypeId: string): Promise<boolean> {
    // Row first, for the same reason as deleteNodeType.
    const prior = await this.db.query<OntologyRelationTypeRow>(
      `SELECT ${PostgresGraphStore.RELATION_TYPE_COLS}
         FROM ${this.table("ontology_relation_types")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, relationTypeId],
    );
    const res = await this.db.execute(
      `DELETE FROM ${this.table("ontology_relation_types")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, relationTypeId],
    );
    if (res.rowCount > 0 && prior[0]?.domain_id) {
      await this.markModelChanged({
        companyId,
        domainId: prior[0].domain_id,
        eventType: "schema_type_deleted",
        entityId: relationTypeId,
        entityKind: "relation_type",
        before: prior[0] as unknown as Record<string, unknown>,
      });
    }
    return res.rowCount > 0;
  }

  /**
   * Read a bounded graph snapshot for one domain: aggregate counts plus a
   * capped list of nodes/edges for a lightweight visualization. Counts come
   * from a single grouped query; node/edge lists are separately capped.
   */
  async getGraphSnapshot(
    companyId: string,
    domainId: string,
    nodeLimit = 500,
  ): Promise<GraphSnapshot> {
    const limit = Number.isFinite(nodeLimit) ? Math.max(1, Math.min(Math.floor(nodeLimit), 2000)) : 500;

    const countRows = await this.db.query<{
      node_types: number;
      relation_types: number;
      nodes: number;
      edges: number;
    }>(
      `SELECT
         (SELECT count(*) FROM ${this.table("ontology_node_types")} WHERE company_id = $1 AND domain_id = $2) AS node_types,
         (SELECT count(*) FROM ${this.table("ontology_relation_types")} WHERE company_id = $1 AND domain_id = $2) AS relation_types,
         (SELECT count(*) FROM ${this.table("ontology_nodes")} WHERE company_id = $1 AND domain_id = $2) AS nodes,
         (SELECT count(*) FROM ${this.table("ontology_edges")} WHERE company_id = $1 AND domain_id = $2) AS edges`,
      [companyId, domainId],
    );
    const counts = countRows[0] ?? { node_types: 0, relation_types: 0, nodes: 0, edges: 0 };

    const nodeRows = await this.db.query<{
      id: string;
      key: string;
      label: string;
      node_type_id: string | null;
      lifecycle_state: NodeLifecycleState;
      properties: Record<string, unknown> | null;
    }>(
      `SELECT id, key, label, node_type_id, lifecycle_state, properties
         FROM ${this.table("ontology_nodes")}
        WHERE company_id = $1 AND domain_id = $2
        ORDER BY created_at ASC
        LIMIT $3`,
      [companyId, domainId, limit],
    );

    const edgeRows = await this.db.query<{
      id: string;
      source_node_id: string;
      target_node_id: string;
      relation_key: string | null;
      weight: number;
      source_domain_id: string | null;
      target_domain_id: string | null;
      is_cross_domain: boolean;
    }>(
      `SELECT id, source_node_id, target_node_id, relation_key, weight,
              source_domain_id, target_domain_id, is_cross_domain
         FROM ${this.table("ontology_edges")}
        WHERE company_id = $1 AND domain_id = $2
        ORDER BY created_at ASC
        LIMIT $3`,
      [companyId, domainId, limit],
    );

    // Per-node-type counts are aggregated against the whole domain (not the
    // bounded nodeRows slice) so they stay accurate regardless of the
    // nodeLimit the snapshot was taken at.
    const byNodeTypeRows = await this.db.query<{
      node_type_id: string | null;
      c: number;
    }>(
      `SELECT node_type_id, COUNT(*) AS c
         FROM ${this.table("ontology_nodes")}
        WHERE company_id = $1 AND domain_id = $2
        GROUP BY node_type_id`,
      [companyId, domainId],
    );
    const byNodeType: Record<string, number> = {};
    for (const row of byNodeTypeRows) {
      byNodeType[row.node_type_id ?? ""] = Number(row.c);
    }

    // Cross-domain edges are counted from the full edge set so the number
    // matches what getGraphSnapshot already returned for total edges.
    const crossDomainEdges = edgeRows.filter((e) => e.is_cross_domain).length;

    return {
      domainId,
      counts: {
        nodeTypes: Number(counts.node_types),
        relationTypes: Number(counts.relation_types),
        nodes: Number(counts.nodes),
        edges: Number(counts.edges),
        byNodeType,
        crossDomainEdges,
      },
      nodes: nodeRows.map((n) => ({
        id: n.id,
        key: n.key,
        label: n.label,
        nodeTypeId: n.node_type_id,
        lifecycleState: n.lifecycle_state,
        properties: n.properties,
      })),
      edges: edgeRows.map((e) => ({
        id: e.id,
        sourceNodeId: e.source_node_id,
        targetNodeId: e.target_node_id,
        relationKey: e.relation_key,
        weight: Number(e.weight),
        sourceDomainId: e.source_domain_id,
        targetDomainId: e.target_domain_id,
        isCrossDomain: e.is_cross_domain,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // O5 — consumption reads (backing agent tools)
  // -------------------------------------------------------------------------

  async getDomainBySlug(companyId: string, slug: string): Promise<OntologyDomainRow | null> {
    const rows = await this.db.query<OntologyDomainRow>(
      `SELECT ${PostgresGraphStore.DOMAIN_COLS}
         FROM ${this.table("ontology_domains")}
        WHERE company_id = $1 AND slug = $2 AND is_deleted = false`,
      [companyId, slug],
    );
    return rows[0] ?? null;
  }

  async getNodeByKey(
    companyId: string,
    domainId: string,
    key: string,
  ): Promise<OntologyNodeRow | null> {
    const rows = await this.db.query<OntologyNodeRow>(
      `SELECT ${PostgresGraphStore.NODE_COLS}
         FROM ${this.table("ontology_nodes")}
        WHERE company_id = $1 AND domain_id = $2 AND key = $3 AND is_deleted = false`,
      [companyId, domainId, key],
    );
    return rows[0] ?? null;
  }

  async listNodes(companyId: string, domainId: string, limit = 100): Promise<OntologyNodeRow[]> {
    const capped = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 1000)) : 100;
    return this.db.query<OntologyNodeRow>(
      `SELECT ${PostgresGraphStore.NODE_COLS}
         FROM ${this.table("ontology_nodes")}
        WHERE company_id = $1 AND domain_id = $2 AND is_deleted = false
        ORDER BY created_at ASC
        LIMIT $3`,
      [companyId, domainId, capped],
    );
  }

  // -------------------------------------------------------------------------
  // O1.5 — lifecycle, versioning snapshots, functions, audit log
  // -------------------------------------------------------------------------

  /** Move a domain to a new lifecycle state, enforcing the transition table. */
  async transitionDomainLifecycle(
    companyId: string,
    domainId: string,
    to: DomainLifecycleState,
    actor = "system",
  ): Promise<OntologyDomainRow | null> {
    const current = await this.getDomain(companyId, domainId);
    if (!current) return null;
    if (!isValidDomainTransition(current.lifecycle_state, to)) {
      throw new Error(
        `Illegal domain lifecycle transition: ${current.lifecycle_state} -> ${to}`,
      );
    }
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_domains")}
          SET lifecycle_state = $3, updated_by = $4, updated_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, domainId, to, actor],
    );
    if (res.rowCount === 0) return null;
    await this.writeAuditLog({
      companyId,
      domainId,
      eventType: "domain_state_changed",
      entityId: domainId,
      actor,
      beforeState: { lifecycle_state: current.lifecycle_state },
      afterState: { lifecycle_state: to },
    });
    return this.getDomain(companyId, domainId);
  }

  /**
   * Capture an immutable schema snapshot of a domain at its current version.
   * The snapshot payload records the domain's current node/relation types.
   */
  async snapshotDomain(
    companyId: string,
    domainId: string,
    description = "",
    createdBy = "system",
  ): Promise<OntologyDomainSnapshotRow | null> {
    const domain = await this.getDomain(companyId, domainId);
    if (!domain) return null;
    const [nodeTypes, relationTypes] = await Promise.all([
      this.listNodeTypes(companyId, domainId),
      this.listRelationTypes(companyId, domainId),
    ]);
    const snapshot = {
      slug: domain.slug,
      displayName: domain.display_name,
      lifecycleState: domain.lifecycle_state,
      nodeTypes,
      relationTypes,
    };
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_domain_snapshots")}
         (id, company_id, domain_id, version, snapshot, description, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [id, companyId, domainId, domain.version, JSON.stringify(snapshot), description, createdBy],
    );
    await this.writeAuditLog({
      companyId,
      domainId,
      eventType: "schema_migrated",
      entityId: domainId,
      actor: createdBy,
      afterState: { version: domain.version },
    });
    const rows = await this.db.query<OntologyDomainSnapshotRow>(
      `SELECT id, company_id, domain_id, version, description, created_by, created_at
         FROM ${this.table("ontology_domain_snapshots")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, id],
    );
    return rows[0] ?? null;
  }

  async listDomainSnapshots(
    companyId: string,
    domainId: string,
  ): Promise<OntologyDomainSnapshotRow[]> {
    return this.db.query<OntologyDomainSnapshotRow>(
      `SELECT id, company_id, domain_id, version, description, created_by, created_at
         FROM ${this.table("ontology_domain_snapshots")}
        WHERE company_id = $1 AND domain_id = $2
        ORDER BY version DESC`,
      [companyId, domainId],
    );
  }

  private static readonly FUNCTION_COLS =
    "id, company_id, domain_id, name, type, version, description, status";

  async createFunction(input: OntologyFunctionInput): Promise<OntologyFunctionRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_functions")}
         (id, company_id, domain_id, name, type, version, description,
          input_schema, output_schema, implementation, permissions, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12, $12, $13::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.name,
        input.type ?? "query",
        input.version ?? "1.0.0",
        input.description ?? "",
        JSON.stringify(input.inputSchema ?? { type: "object", properties: {} }),
        JSON.stringify(input.outputSchema ?? { type: "object", properties: {} }),
        JSON.stringify(
          input.implementation ?? { runtime: "javascript", code: "", entrypoint: "handler" },
        ),
        JSON.stringify(
          input.permissions ?? { allowedRoles: [], rateLimit: { maxCalls: 100, windowMs: 60000 } },
        ),
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyFunctionRow>(
      `SELECT ${PostgresGraphStore.FUNCTION_COLS}
         FROM ${this.table("ontology_functions")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listFunctions(companyId: string, domainId: string): Promise<OntologyFunctionRow[]> {
    return this.db.query<OntologyFunctionRow>(
      `SELECT ${PostgresGraphStore.FUNCTION_COLS}
         FROM ${this.table("ontology_functions")}
        WHERE company_id = $1 AND domain_id = $2 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId, domainId],
    );
  }

  async updateFunction(
    companyId: string,
    functionId: string,
    update: OntologyFunctionUpdate,
  ): Promise<OntologyFunctionRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_functions")}
          SET description    = COALESCE($3, description),
              input_schema   = CASE WHEN $4::boolean THEN $5::jsonb ELSE input_schema END,
              output_schema  = CASE WHEN $6::boolean THEN $7::jsonb ELSE output_schema END,
              implementation = CASE WHEN $8::boolean THEN $9::jsonb ELSE implementation END,
              permissions    = CASE WHEN $10::boolean THEN $11::jsonb ELSE permissions END,
              status         = COALESCE($12, status),
              metadata       = CASE WHEN $13::boolean THEN $14::jsonb ELSE metadata END,
              updated_at     = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        functionId,
        update.description ?? null,
        update.inputSchema !== undefined,
        JSON.stringify(update.inputSchema ?? {}),
        update.outputSchema !== undefined,
        JSON.stringify(update.outputSchema ?? {}),
        update.implementation !== undefined,
        JSON.stringify(update.implementation ?? {}),
        update.permissions !== undefined,
        JSON.stringify(update.permissions ?? {}),
        update.status ?? null,
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
      ],
    );
    if (res.rowCount === 0) return null;
    const rows = await this.db.query<OntologyFunctionRow>(
      `SELECT ${PostgresGraphStore.FUNCTION_COLS}
         FROM ${this.table("ontology_functions")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, functionId],
    );
    return rows[0] ?? null;
  }

  /**
   * Soft-delete a function. Mirrors deleteActionType: row stays for audit,
   * subsequent list calls skip it. Returns true iff a row was actually
   * marked deleted in this company.
   */
  async deleteFunction(companyId: string, functionId: string): Promise<boolean> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_functions")}
          SET is_deleted = true, deleted_at = now(), updated_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, functionId],
    );
    return res.rowCount > 0;
  }

  async writeAuditLog(input: OntologyAuditLogInput): Promise<OntologyAuditLogRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_audit_logs")}
         (id, company_id, domain_id, event_type, entity_id, actor, before_state, after_state, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId ?? null,
        input.eventType,
        input.entityId ?? "",
        input.actor ?? "system",
        input.beforeState === undefined || input.beforeState === null
          ? null
          : JSON.stringify(input.beforeState),
        input.afterState === undefined || input.afterState === null
          ? null
          : JSON.stringify(input.afterState),
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyAuditLogRow>(
      `SELECT id, company_id, domain_id, event_type, entity_id, actor, event_at
         FROM ${this.table("ontology_audit_logs")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listAuditLogs(
    companyId: string,
    domainId: string,
    limit = 100,
  ): Promise<OntologyAuditLogRow[]> {
    const capped = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 1000)) : 100;
    // `metadata` is selected because it is where a schema change records what
    // happened to the data (renames applied, values orphaned). Writing it and
    // not reading it would leave the migration outcome unreachable — the same
    // mistake in a smaller place. `before_state`/`after_state` stay out: they are
    // whole rows, and a list endpoint should not carry them by default.
    return this.db.query<OntologyAuditLogRow>(
      `SELECT id, company_id, domain_id, event_type, entity_id, actor, event_at, metadata
         FROM ${this.table("ontology_audit_logs")}
        WHERE company_id = $1 AND domain_id = $2
        ORDER BY event_at DESC
        LIMIT $3`,
      [companyId, domainId, capped],
    );
  }

  // -------------------------------------------------------------------------
  // O2 — Palantir core: interfaces (polymorphism) + action types
  // -------------------------------------------------------------------------

  private static readonly INTERFACE_COLS =
    "id, company_id, domain_id, key, display_name, description";

  async createInterface(input: OntologyInterfaceInput): Promise<OntologyInterfaceRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_interfaces")}
         (id, company_id, domain_id, key, display_name, description,
          properties_schema, extends_interfaces, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.key,
        input.displayName,
        input.description ?? null,
        JSON.stringify(input.propertiesSchema ?? {}),
        JSON.stringify(input.extendsInterfaces ?? []),
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyInterfaceRow>(
      `SELECT ${PostgresGraphStore.INTERFACE_COLS}
         FROM ${this.table("ontology_interfaces")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listInterfaces(companyId: string, domainId: string): Promise<OntologyInterfaceRow[]> {
    return this.db.query<OntologyInterfaceRow>(
      `SELECT ${PostgresGraphStore.INTERFACE_COLS}
         FROM ${this.table("ontology_interfaces")}
        WHERE company_id = $1 AND domain_id = $2 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId, domainId],
    );
  }

  async updateInterface(
    companyId: string,
    interfaceId: string,
    update: OntologyInterfaceUpdate,
  ): Promise<OntologyInterfaceRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_interfaces")}
          SET display_name       = COALESCE($3, display_name),
              description         = CASE WHEN $4::boolean THEN $5 ELSE description END,
              properties_schema   = CASE WHEN $6::boolean THEN $7::jsonb ELSE properties_schema END,
              extends_interfaces  = CASE WHEN $8::boolean THEN $9::jsonb ELSE extends_interfaces END,
              metadata            = CASE WHEN $10::boolean THEN $11::jsonb ELSE metadata END,
              updated_at          = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        interfaceId,
        update.displayName ?? null,
        update.description !== undefined,
        update.description ?? null,
        update.propertiesSchema !== undefined,
        JSON.stringify(update.propertiesSchema ?? {}),
        update.extendsInterfaces !== undefined,
        JSON.stringify(update.extendsInterfaces ?? []),
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
      ],
    );
    if (res.rowCount === 0) return null;
    const rows = await this.db.query<OntologyInterfaceRow>(
      `SELECT ${PostgresGraphStore.INTERFACE_COLS}
         FROM ${this.table("ontology_interfaces")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, interfaceId],
    );
    return rows[0] ?? null;
  }

  /**
   * Soft-delete an interface. See deleteActionType for the rationale
   * (audit trail + lineagability). Returns true iff a row was actually
   * marked deleted.
   */
  async deleteInterface(companyId: string, interfaceId: string): Promise<boolean> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_interfaces")}
          SET is_deleted = true, deleted_at = now(), updated_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, interfaceId],
    );
    return res.rowCount > 0;
  }

  private static readonly ACTION_TYPE_COLS =
    "id, company_id, domain_id, key, display_name, description, kind, " +
    "applies_to_node_type_id, idempotent, status";

  async createActionType(input: OntologyActionTypeInput): Promise<OntologyActionTypeRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_action_types")}
         (id, company_id, domain_id, key, display_name, description, kind,
          applies_to_node_type_id, api_contract, state_transitions, emits_events,
          required_permissions, idempotent, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $14, $15::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.key,
        input.displayName,
        input.description ?? "",
        input.kind ?? "modify",
        input.appliesToNodeTypeId ?? null,
        JSON.stringify(input.apiContract ?? {}),
        JSON.stringify(input.stateTransitions ?? []),
        JSON.stringify(input.emitsEvents ?? []),
        JSON.stringify(input.requiredPermissions ?? []),
        input.idempotent ?? false,
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyActionTypeRow>(
      `SELECT ${PostgresGraphStore.ACTION_TYPE_COLS}
         FROM ${this.table("ontology_action_types")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listActionTypes(companyId: string, domainId: string): Promise<OntologyActionTypeRow[]> {
    return this.db.query<OntologyActionTypeRow>(
      `SELECT ${PostgresGraphStore.ACTION_TYPE_COLS}
         FROM ${this.table("ontology_action_types")}
        WHERE company_id = $1 AND domain_id = $2 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId, domainId],
    );
  }

  async updateActionType(
    companyId: string,
    actionTypeId: string,
    update: OntologyActionTypeUpdate,
  ): Promise<OntologyActionTypeRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_action_types")}
          SET display_name            = COALESCE($3, display_name),
              description              = COALESCE($4, description),
              kind                     = COALESCE($5, kind),
              applies_to_node_type_id  = CASE WHEN $6::boolean THEN $7::uuid ELSE applies_to_node_type_id END,
              api_contract             = CASE WHEN $8::boolean THEN $9::jsonb ELSE api_contract END,
              state_transitions        = CASE WHEN $10::boolean THEN $11::jsonb ELSE state_transitions END,
              emits_events             = CASE WHEN $12::boolean THEN $13::jsonb ELSE emits_events END,
              required_permissions     = CASE WHEN $14::boolean THEN $15::jsonb ELSE required_permissions END,
              idempotent               = COALESCE($16, idempotent),
              status                   = COALESCE($17, status),
              metadata                 = CASE WHEN $18::boolean THEN $19::jsonb ELSE metadata END,
              updated_at               = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        actionTypeId,
        update.displayName ?? null,
        update.description ?? null,
        update.kind ?? null,
        update.appliesToNodeTypeId !== undefined,
        update.appliesToNodeTypeId ?? null,
        update.apiContract !== undefined,
        JSON.stringify(update.apiContract ?? {}),
        update.stateTransitions !== undefined,
        JSON.stringify(update.stateTransitions ?? []),
        update.emitsEvents !== undefined,
        JSON.stringify(update.emitsEvents ?? []),
        update.requiredPermissions !== undefined,
        JSON.stringify(update.requiredPermissions ?? []),
        typeof update.idempotent === "boolean" ? update.idempotent : null,
        update.status ?? null,
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
      ],
    );
    if (res.rowCount === 0) return null;
    const rows = await this.db.query<OntologyActionTypeRow>(
      `SELECT ${PostgresGraphStore.ACTION_TYPE_COLS}
         FROM ${this.table("ontology_action_types")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, actionTypeId],
    );
    return rows[0] ?? null;
  }

  /**
   * Soft-delete an action type. The row stays in the table with
   * `is_deleted = true` + `deleted_at = now()` so audit/lineage still
   * resolves. Subsequent `listActionTypes` calls skip it. Returns true if
   * a row was actually marked deleted (i.e. existed and wasn't already
   * deleted), false if the id wasn't found in this company.
   */
  async deleteActionType(companyId: string, actionTypeId: string): Promise<boolean> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_action_types")}
          SET is_deleted = true, deleted_at = now(), updated_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, actionTypeId],
    );
    return res.rowCount > 0;
  }

  // -------------------------------------------------------------------------
  // O3 — legacy repository cognition
  // -------------------------------------------------------------------------

  private static readonly COGNITION_COLS =
    "id, company_id, job_key, domain_id, root_path, app_name, scale, status, " +
    "stage_label, shard_total, shard_done, progress_pct";

  async createCognitionJob(input: OntologyCognitionJobInput): Promise<OntologyCognitionJobRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_cognition_jobs")}
         (id, company_id, job_key, domain_id, root_path, app_name, display_name,
          description, target_role, category, scale, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13::jsonb)`,
      [
        id,
        input.companyId,
        input.jobKey,
        input.domainId ?? null,
        input.rootPath,
        input.appName ?? "",
        input.displayName ?? "",
        input.description ?? "",
        input.targetRole ?? "",
        input.category ?? "other",
        input.scale ?? "s",
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return (await this.getCognitionJob(input.companyId, id))!;
  }

  async getCognitionJob(companyId: string, jobId: string): Promise<OntologyCognitionJobRow | null> {
    const rows = await this.db.query<OntologyCognitionJobRow>(
      `SELECT ${PostgresGraphStore.COGNITION_COLS}
         FROM ${this.table("ontology_cognition_jobs")}
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, jobId],
    );
    return rows[0] ?? null;
  }

  async listCognitionJobs(companyId: string, limit = 100): Promise<OntologyCognitionJobRow[]> {
    const capped = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 100;
    return this.db.query<OntologyCognitionJobRow>(
      `SELECT ${PostgresGraphStore.COGNITION_COLS}
         FROM ${this.table("ontology_cognition_jobs")}
        WHERE company_id = $1 AND is_deleted = false
        ORDER BY created_at DESC
        LIMIT $2`,
      [companyId, capped],
    );
  }

  /** Advance a cognition job, enforcing the status transition table. */
  async transitionCognitionStatus(
    companyId: string,
    jobId: string,
    to: CognitionJobStatus,
    patch: { stageLabel?: string; error?: string | null; actor?: string } = {},
  ): Promise<OntologyCognitionJobRow | null> {
    const current = await this.getCognitionJob(companyId, jobId);
    if (!current) return null;
    if (!isValidCognitionTransition(current.status, to)) {
      throw new Error(`Illegal cognition transition: ${current.status} -> ${to}`);
    }
    const progress = COGNITION_PROGRESS_BY_STATUS[to];
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_cognition_jobs")}
          SET status       = $3,
              stage_label  = COALESCE($4, stage_label),
              error        = CASE WHEN $5::boolean THEN $6 ELSE error END,
              progress_pct = $7,
              updated_by   = $8,
              updated_at   = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        jobId,
        to,
        patch.stageLabel ?? null,
        patch.error !== undefined,
        patch.error ?? null,
        progress,
        patch.actor ?? "system",
      ],
    );
    if (res.rowCount === 0) return null;
    return this.getCognitionJob(companyId, jobId);
  }

  /**
   * Replace the shard set (resumable checkpoint). Recomputes shard_total /
   * shard_done from the provided shards; when ingesting, interpolates progress.
   */
  async updateCognitionShards(
    companyId: string,
    jobId: string,
    shards: CognitionShard[],
  ): Promise<OntologyCognitionJobRow | null> {
    const total = shards.length;
    const done = shards.filter((s) => s.status === "done").length;
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_cognition_jobs")}
          SET shards       = $3::jsonb,
              shard_total  = $4,
              shard_done   = $5,
              progress_pct = CASE
                WHEN status = 'ingesting' AND $4 > 0
                  THEN LEAST(76, 18 + ($5 * 54 / $4))
                ELSE progress_pct END,
              updated_at   = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, jobId, JSON.stringify(shards), total, done],
    );
    if (res.rowCount === 0) return null;
    return this.getCognitionJob(companyId, jobId);
  }

  async recordCognitionCoverage(
    companyId: string,
    jobId: string,
    coverage: Partial<CognitionCoverage>,
  ): Promise<OntologyCognitionJobRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_cognition_jobs")}
          SET coverage = coverage || $3::jsonb, updated_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, jobId, JSON.stringify(coverage)],
    );
    if (res.rowCount === 0) return null;
    return this.getCognitionJob(companyId, jobId);
  }

  async setCognitionDraft(
    companyId: string,
    jobId: string,
    draft: {
      draftPreview?: Record<string, unknown>;
      seedNodeTypes?: unknown[];
      seedRelationTypes?: unknown[];
      seedActions?: unknown[];
    },
  ): Promise<OntologyCognitionJobRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_cognition_jobs")}
          SET draft_preview       = CASE WHEN $3::boolean THEN $4::jsonb ELSE draft_preview END,
              seed_node_types     = CASE WHEN $5::boolean THEN $6::jsonb ELSE seed_node_types END,
              seed_relation_types = CASE WHEN $7::boolean THEN $8::jsonb ELSE seed_relation_types END,
              seed_actions        = CASE WHEN $9::boolean THEN $10::jsonb ELSE seed_actions END,
              updated_at          = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        jobId,
        draft.draftPreview !== undefined,
        JSON.stringify(draft.draftPreview ?? {}),
        draft.seedNodeTypes !== undefined,
        JSON.stringify(draft.seedNodeTypes ?? []),
        draft.seedRelationTypes !== undefined,
        JSON.stringify(draft.seedRelationTypes ?? []),
        draft.seedActions !== undefined,
        JSON.stringify(draft.seedActions ?? []),
      ],
    );
    if (res.rowCount === 0) return null;
    return this.getCognitionJob(companyId, jobId);
  }

  async getCognitionDraft(
    companyId: string,
    jobId: string,
  ): Promise<{
    seedNodeTypes: unknown[];
    seedRelationTypes: unknown[];
    seedActions: unknown[];
    result: Record<string, unknown>;
  } | null> {
    const rows = await this.db.query<{
      seed_node_types: unknown[];
      seed_relation_types: unknown[];
      seed_actions: unknown[];
      result: Record<string, unknown>;
    }>(
      `SELECT seed_node_types, seed_relation_types, seed_actions, result
         FROM ${this.table("ontology_cognition_jobs")}
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, jobId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      seedNodeTypes: Array.isArray(row.seed_node_types) ? row.seed_node_types : [],
      seedRelationTypes: Array.isArray(row.seed_relation_types) ? row.seed_relation_types : [],
      seedActions: Array.isArray(row.seed_actions) ? row.seed_actions : [],
      result: (row.result as Record<string, unknown>) ?? {},
    };
  }

  async setCognitionResult(
    companyId: string,
    jobId: string,
    result: Record<string, unknown>,
  ): Promise<OntologyCognitionJobRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_cognition_jobs")}
          SET result = $3::jsonb, updated_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, jobId, JSON.stringify(result)],
    );
    if (res.rowCount === 0) return null;
    return this.getCognitionJob(companyId, jobId);
  }

  // -------------------------------------------------------------------------
  // O4 — data pipeline
  // -------------------------------------------------------------------------

  private static readonly DATASET_COLS =
    "id, company_id, domain_id, key, name, format, current_version, lifecycle_state";

  async createDataset(input: OntologyDatasetInput): Promise<OntologyDatasetRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_datasets")}
         (id, company_id, domain_id, key, name, description, format, data_schema,
          storage_config, sync_config, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $11, $12::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.key,
        input.name,
        input.description ?? "",
        input.format ?? "json",
        JSON.stringify(input.dataSchema ?? {}),
        JSON.stringify(input.storageConfig ?? {}),
        JSON.stringify(input.syncConfig ?? {}),
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyDatasetRow>(
      `SELECT ${PostgresGraphStore.DATASET_COLS}
         FROM ${this.table("ontology_datasets")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listDatasets(companyId: string, domainId: string): Promise<OntologyDatasetRow[]> {
    return this.db.query<OntologyDatasetRow>(
      `SELECT ${PostgresGraphStore.DATASET_COLS}
         FROM ${this.table("ontology_datasets")}
        WHERE company_id = $1 AND domain_id = $2 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId, domainId],
    );
  }

  async updateDataset(
    companyId: string,
    datasetId: string,
    update: OntologyDatasetUpdate,
  ): Promise<OntologyDatasetRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_datasets")}
          SET name            = COALESCE($3, name),
              description      = COALESCE($4, description),
              format          = COALESCE($5, format),
              data_schema     = CASE WHEN $6::boolean THEN $7::jsonb ELSE data_schema END,
              storage_config  = CASE WHEN $8::boolean THEN $9::jsonb ELSE storage_config END,
              sync_config     = CASE WHEN $10::boolean THEN $11::jsonb ELSE sync_config END,
              lifecycle_state = COALESCE($12, lifecycle_state),
              metadata        = CASE WHEN $13::boolean THEN $14::jsonb ELSE metadata END,
              updated_at      = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        datasetId,
        update.name ?? null,
        update.description ?? null,
        update.format ?? null,
        update.dataSchema !== undefined,
        JSON.stringify(update.dataSchema ?? {}),
        update.storageConfig !== undefined,
        JSON.stringify(update.storageConfig ?? {}),
        update.syncConfig !== undefined,
        JSON.stringify(update.syncConfig ?? {}),
        update.lifecycleState ?? null,
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
      ],
    );
    if (res.rowCount === 0) return null;
    const rows = await this.db.query<OntologyDatasetRow>(
      `SELECT ${PostgresGraphStore.DATASET_COLS}
         FROM ${this.table("ontology_datasets")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, datasetId],
    );
    return rows[0] ?? null;
  }

  private static readonly CONNECTOR_COLS =
    "id, company_id, domain_id, key, name, connector_type, dataset_id, status";

  async createConnector(input: OntologyConnectorInput): Promise<OntologyConnectorRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_connectors")}
         (id, company_id, domain_id, key, name, connector_type, dataset_id, config,
          sync_schedule, sync_strategy, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $11, $12::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.key,
        input.name,
        input.connectorType,
        input.datasetId ?? null,
        JSON.stringify(input.config ?? {}),
        input.syncSchedule ?? null,
        input.syncStrategy ?? null,
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyConnectorRow>(
      `SELECT ${PostgresGraphStore.CONNECTOR_COLS}
         FROM ${this.table("ontology_connectors")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listConnectors(companyId: string, domainId: string): Promise<OntologyConnectorRow[]> {
    return this.db.query<OntologyConnectorRow>(
      `SELECT ${PostgresGraphStore.CONNECTOR_COLS}
         FROM ${this.table("ontology_connectors")}
        WHERE company_id = $1 AND domain_id = $2 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId, domainId],
    );
  }

  async updateConnector(
    companyId: string,
    connectorId: string,
    update: OntologyConnectorUpdate,
  ): Promise<OntologyConnectorRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_connectors")}
          SET name          = COALESCE($3, name),
              dataset_id     = CASE WHEN $4::boolean THEN $5::uuid ELSE dataset_id END,
              config         = CASE WHEN $6::boolean THEN $7::jsonb ELSE config END,
              sync_schedule  = CASE WHEN $8::boolean THEN $9 ELSE sync_schedule END,
              sync_strategy  = CASE WHEN $10::boolean THEN $11 ELSE sync_strategy END,
              status         = COALESCE($12, status),
              sync_state     = CASE WHEN $13::boolean THEN $14::jsonb ELSE sync_state END,
              last_error     = CASE WHEN $15::boolean THEN $16 ELSE last_error END,
              metadata       = CASE WHEN $17::boolean THEN $18::jsonb ELSE metadata END,
              updated_at     = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        connectorId,
        update.name ?? null,
        update.datasetId !== undefined,
        update.datasetId ?? null,
        update.config !== undefined,
        JSON.stringify(update.config ?? {}),
        update.syncSchedule !== undefined,
        update.syncSchedule ?? null,
        update.syncStrategy !== undefined,
        update.syncStrategy ?? null,
        update.status ?? null,
        update.syncState !== undefined,
        JSON.stringify(update.syncState ?? {}),
        update.lastError !== undefined,
        update.lastError ?? null,
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
      ],
    );
    if (res.rowCount === 0) return null;
    const rows = await this.db.query<OntologyConnectorRow>(
      `SELECT ${PostgresGraphStore.CONNECTOR_COLS}
         FROM ${this.table("ontology_connectors")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, connectorId],
    );
    return rows[0] ?? null;
  }

  private static readonly TRANSFORM_COLS =
    "id, company_id, domain_id, key, name, transform_type, output_dataset_id, status, version";

  async createTransform(input: OntologyTransformInput): Promise<OntologyTransformRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_transforms")}
         (id, company_id, domain_id, key, name, description, transform_type,
          input_dataset_ids, output_dataset_id, code, config, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11::jsonb, $12, $12, $13::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.key,
        input.name,
        input.description ?? "",
        input.transformType ?? "sql",
        JSON.stringify(input.inputDatasetIds ?? []),
        input.outputDatasetId ?? null,
        input.code ?? "",
        JSON.stringify(input.config ?? {}),
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyTransformRow>(
      `SELECT ${PostgresGraphStore.TRANSFORM_COLS}
         FROM ${this.table("ontology_transforms")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listTransforms(companyId: string, domainId: string): Promise<OntologyTransformRow[]> {
    return this.db.query<OntologyTransformRow>(
      `SELECT ${PostgresGraphStore.TRANSFORM_COLS}
         FROM ${this.table("ontology_transforms")}
        WHERE company_id = $1 AND domain_id = $2 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId, domainId],
    );
  }

  async updateTransform(
    companyId: string,
    transformId: string,
    update: OntologyTransformUpdate,
  ): Promise<OntologyTransformRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_transforms")}
          SET name              = COALESCE($3, name),
              description        = COALESCE($4, description),
              transform_type     = COALESCE($5, transform_type),
              input_dataset_ids  = CASE WHEN $6::boolean THEN $7::jsonb ELSE input_dataset_ids END,
              output_dataset_id  = CASE WHEN $8::boolean THEN $9::uuid ELSE output_dataset_id END,
              code               = COALESCE($10, code),
              config             = CASE WHEN $11::boolean THEN $12::jsonb ELSE config END,
              status             = COALESCE($13, status),
              last_executed_at   = CASE WHEN $14::boolean THEN now() ELSE last_executed_at END,
              metadata           = CASE WHEN $15::boolean THEN $16::jsonb ELSE metadata END,
              updated_at         = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        transformId,
        update.name ?? null,
        update.description ?? null,
        update.transformType ?? null,
        update.inputDatasetIds !== undefined,
        JSON.stringify(update.inputDatasetIds ?? []),
        update.outputDatasetId !== undefined,
        update.outputDatasetId ?? null,
        update.code ?? null,
        update.config !== undefined,
        JSON.stringify(update.config ?? {}),
        update.status ?? null,
        update.markExecuted === true,
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
      ],
    );
    if (res.rowCount === 0) return null;
    const rows = await this.db.query<OntologyTransformRow>(
      `SELECT ${PostgresGraphStore.TRANSFORM_COLS}
         FROM ${this.table("ontology_transforms")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, transformId],
    );
    return rows[0] ?? null;
  }

  private static readonly PACKAGE_INSTALL_COLS =
    "id, company_id, domain_id, package_id, version, installed_by";

  async createPackageInstall(
    input: OntologyPackageInstallInput,
  ): Promise<OntologyPackageInstallRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_package_installs")}
         (id, company_id, domain_id, package_id, version, installed_by, result, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.packageId,
        input.version ?? "1.0.0",
        input.installedBy ?? "",
        JSON.stringify(
          input.result ?? { nodeTypesAdded: 0, relationsAdded: 0, schemaPatched: false },
        ),
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyPackageInstallRow>(
      `SELECT ${PostgresGraphStore.PACKAGE_INSTALL_COLS}
         FROM ${this.table("ontology_package_installs")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listPackageInstalls(
    companyId: string,
    domainId: string,
  ): Promise<OntologyPackageInstallRow[]> {
    return this.db.query<OntologyPackageInstallRow>(
      `SELECT ${PostgresGraphStore.PACKAGE_INSTALL_COLS}
         FROM ${this.table("ontology_package_installs")}
        WHERE company_id = $1 AND domain_id = $2 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId, domainId],
    );
  }

  // -------------------------------------------------------------------------
  // O6 — online application first-class citizens
  // -------------------------------------------------------------------------

  private static readonly BUSINESS_SYSTEM_COLS =
    "id, company_id, code, name, description, domain, status, ontology_domain_id, is_template_system, ontology_binding, metadata";

  async createBusinessSystem(
    input: OntologyBusinessSystemInput,
  ): Promise<OntologyBusinessSystemRow> {
    const id = randomUUID();
    const systemId = `sys_${Date.now().toString(36)}`;
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_business_systems")}
         (id, company_id, code, name, description, domain, tags, system_id, owner_ref,
          target_role, ontology_domain_id, repos, ontology_binding, domain_copilot_config,
          domain_governance, npc_team_config, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12::jsonb, $13::jsonb,
               $14::jsonb, $15::jsonb, $16::jsonb, $17, $17, $18::jsonb)`,
      [
        id,
        input.companyId,
        input.code,
        input.name,
        input.description ?? "",
        input.domain ?? "other",
        JSON.stringify(input.tags ?? []),
        systemId,
        input.ownerRef ?? null,
        input.targetRole ?? "",
        input.ontologyDomainId ?? null,
        JSON.stringify(input.repos ?? []),
        JSON.stringify(
          input.ontologyBinding ?? {
            syncPolicy: "manual",
            allowedActionIds: [],
            actionPolicies: [],
            subscribedEventTypes: [],
          },
        ),
        JSON.stringify(
          input.domainCopilotConfig ?? {
            systemPrompt: "",
            knowledgeBaseIds: [],
            memoryScope: "domain",
            temperature: 0.3,
          },
        ),
        JSON.stringify(
          input.domainGovernance ?? {
            securityLevel: "L2",
            auditPolicy: "full",
            slaStatus: "healthy",
            telemetrySnapshot: { qps: 0, errorRatePercent: 0, p95LatencyMs: 0 },
          },
        ),
        JSON.stringify(input.npcTeamConfig ?? {}),
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const created = (await this.getBusinessSystem(input.companyId, id))!;
    await this.syncBusinessSystemLink(created);
    return created;
  }

  /**
   * Keep `ontology_resource_links` in step with
   * `ontology_business_systems.ontology_domain_id`.
   *
   * That column stays the source of truth — it carries the governance, copilot
   * and NPC configuration — and the link row is a read-only mirror written only
   * from here, so the two cannot disagree. Having the mirror is what lets one
   * query answer "which domains does this application use" without a second
   * pass over the business-system table.
   */
  private async syncBusinessSystemLink(system: OntologyBusinessSystemRow): Promise<void> {
    const existing = await this.listLinksForResource(system.company_id, "business_system", system.id);
    for (const link of existing) {
      if (link.domain_id === system.ontology_domain_id) continue;
      await this.unlinkResource(system.company_id, "business_system", system.id, link.domain_id);
    }
    if (!system.ontology_domain_id) return;
    await this.linkResource({
      companyId: system.company_id,
      domainId: system.ontology_domain_id,
      resourceKind: "business_system",
      resourceId: system.id,
      resourceLabel: system.name,
      role: "consumer",
      createdBy: "system",
    });
  }

  async getBusinessSystem(
    companyId: string,
    systemId: string,
  ): Promise<OntologyBusinessSystemRow | null> {
    const rows = await this.db.query<OntologyBusinessSystemRow>(
      `SELECT ${PostgresGraphStore.BUSINESS_SYSTEM_COLS}
         FROM ${this.table("ontology_business_systems")}
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, systemId],
    );
    return rows[0] ?? null;
  }

  async listBusinessSystems(
    companyId: string,
    limit = 200,
  ): Promise<OntologyBusinessSystemRow[]> {
    const capped = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 1000)) : 200;
    return this.db.query<OntologyBusinessSystemRow>(
      `SELECT ${PostgresGraphStore.BUSINESS_SYSTEM_COLS}
         FROM ${this.table("ontology_business_systems")}
        WHERE company_id = $1 AND is_deleted = false
        ORDER BY created_at ASC
        LIMIT $2`,
      [companyId, capped],
    );
  }

  async updateBusinessSystem(
    companyId: string,
    systemId: string,
    update: OntologyBusinessSystemUpdate,
  ): Promise<OntologyBusinessSystemRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_business_systems")}
          SET name                  = COALESCE($3, name),
              description            = COALESCE($4, description),
              domain                 = COALESCE($5, domain),
              status                 = COALESCE($6, status),
              target_role            = COALESCE($7, target_role),
              ontology_domain_id     = CASE WHEN $8::boolean THEN $9::uuid ELSE ontology_domain_id END,
              tags                   = CASE WHEN $10::boolean THEN $11::jsonb ELSE tags END,
              repos                  = CASE WHEN $12::boolean THEN $13::jsonb ELSE repos END,
              service_map            = CASE WHEN $14::boolean THEN $15::jsonb ELSE service_map END,
              npc_team_config        = CASE WHEN $16::boolean THEN $17::jsonb ELSE npc_team_config END,
              ontology_binding       = CASE WHEN $18::boolean THEN $19::jsonb ELSE ontology_binding END,
              domain_copilot_config  = CASE WHEN $20::boolean THEN $21::jsonb ELSE domain_copilot_config END,
              domain_governance      = CASE WHEN $22::boolean THEN $23::jsonb ELSE domain_governance END,
              runtime_stats          = CASE WHEN $24::boolean THEN $25::jsonb ELSE runtime_stats END,
              is_template_system     = COALESCE($26, is_template_system),
              metadata               = CASE WHEN $27::boolean THEN $28::jsonb ELSE metadata END,
              updated_at             = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        systemId,
        update.name ?? null,
        update.description ?? null,
        update.domain ?? null,
        update.status ?? null,
        update.targetRole ?? null,
        update.ontologyDomainId !== undefined,
        update.ontologyDomainId ?? null,
        update.tags !== undefined,
        JSON.stringify(update.tags ?? []),
        update.repos !== undefined,
        JSON.stringify(update.repos ?? []),
        update.serviceMap !== undefined,
        JSON.stringify(update.serviceMap ?? {}),
        update.npcTeamConfig !== undefined,
        JSON.stringify(update.npcTeamConfig ?? {}),
        update.ontologyBinding !== undefined,
        JSON.stringify(update.ontologyBinding ?? {}),
        update.domainCopilotConfig !== undefined,
        JSON.stringify(update.domainCopilotConfig ?? {}),
        update.domainGovernance !== undefined,
        JSON.stringify(update.domainGovernance ?? {}),
        update.runtimeStats !== undefined,
        JSON.stringify(update.runtimeStats ?? {}),
        typeof update.isTemplateSystem === "boolean" ? update.isTemplateSystem : null,
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
      ],
    );
    if (res.rowCount === 0) return null;
    const updated = await this.getBusinessSystem(companyId, systemId);
    if (updated) await this.syncBusinessSystemLink(updated);
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Resource links (project / application ↔ ontology domain)
  // ---------------------------------------------------------------------------

  private static readonly RESOURCE_LINK_COLS =
    "id, company_id, domain_id, resource_kind, resource_id, resource_label, role, is_deleted";

  /**
   * Attach a resource to a domain. Idempotent: re-linking the same
   * (company, kind, resourceId, domain) updates the label/role and un-deletes
   * the row rather than failing on the unique constraint, so a repeated import
   * is safe.
   */
  async linkResource(input: OntologyResourceLinkInput): Promise<OntologyResourceLinkRow> {
    const existing = await this.db.query<{ id: string }>(
      `SELECT id FROM ${this.table("ontology_resource_links")}
        WHERE company_id = $1 AND resource_kind = $2 AND resource_id = $3 AND domain_id = $4`,
      [input.companyId, input.resourceKind, input.resourceId, input.domainId],
    );

    if (existing[0]) {
      await this.db.execute(
        `UPDATE ${this.table("ontology_resource_links")}
            SET resource_label = $2, role = $3, is_deleted = false, deleted_at = NULL,
                updated_by = $4, updated_at = now()
          WHERE company_id = $5 AND id = $1`,
        [
          existing[0].id,
          input.resourceLabel ?? "",
          input.role ?? "consumer",
          input.createdBy ?? "system",
          input.companyId,
        ],
      );
      const rows = await this.db.query<OntologyResourceLinkRow>(
        `SELECT ${PostgresGraphStore.RESOURCE_LINK_COLS}
           FROM ${this.table("ontology_resource_links")}
          WHERE company_id = $1 AND id = $2`,
        [input.companyId, existing[0].id],
      );
      return rows[0]!;
    }

    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_resource_links")}
         (id, company_id, domain_id, resource_kind, resource_id, resource_label, role,
          created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.resourceKind,
        input.resourceId,
        input.resourceLabel ?? "",
        input.role ?? "consumer",
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyResourceLinkRow>(
      `SELECT ${PostgresGraphStore.RESOURCE_LINK_COLS}
         FROM ${this.table("ontology_resource_links")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  /** Detach a resource from a domain. Soft-delete; safe to call when absent. */
  async unlinkResource(
    companyId: string,
    resourceKind: OntologyResourceKind,
    resourceId: string,
    domainId: string,
  ): Promise<boolean> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_resource_links")}
          SET is_deleted = true, deleted_at = now(), updated_at = now()
        WHERE company_id = $1 AND resource_kind = $2 AND resource_id = $3
          AND domain_id = $4 AND is_deleted = false`,
      [companyId, resourceKind, resourceId, domainId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Everything attached to one domain. */
  async listLinksForDomain(companyId: string, domainId: string): Promise<OntologyResourceLinkRow[]> {
    return this.db.query<OntologyResourceLinkRow>(
      `SELECT ${PostgresGraphStore.RESOURCE_LINK_COLS}
         FROM ${this.table("ontology_resource_links")}
        WHERE company_id = $1 AND domain_id = $2 AND is_deleted = false
        ORDER BY resource_kind ASC, resource_label ASC`,
      [companyId, domainId],
    );
  }

  /** Everything one resource is attached to. */
  async listLinksForResource(
    companyId: string,
    resourceKind: OntologyResourceKind,
    resourceId: string,
  ): Promise<OntologyResourceLinkRow[]> {
    return this.db.query<OntologyResourceLinkRow>(
      `SELECT ${PostgresGraphStore.RESOURCE_LINK_COLS}
         FROM ${this.table("ontology_resource_links")}
        WHERE company_id = $1 AND resource_kind = $2 AND resource_id = $3 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId, resourceKind, resourceId],
    );
  }

  /** The domains one resource is attached to, with display fields joined in. */
  async listDomainsForResource(
    companyId: string,
    resourceKind: OntologyResourceKind,
    resourceId: string,
  ): Promise<LinkedDomainRow[]> {
    return this.db.query<LinkedDomainRow>(
      `SELECT l.id            AS "linkId",
              l.role          AS "role",
              l.resource_kind AS "resource_kind",
              d.id            AS "domain_id",
              d.slug          AS "slug",
              d.display_name  AS "display_name",
              d.version       AS "version",
              d.status        AS "status"
         FROM ${this.table("ontology_resource_links")} l
         JOIN ${this.table("ontology_domains")} d
           ON d.id = l.domain_id AND d.company_id = l.company_id
        WHERE l.company_id = $1 AND l.resource_kind = $2 AND l.resource_id = $3
          AND l.is_deleted = false
        ORDER BY d.display_name ASC`,
      [companyId, resourceKind, resourceId],
    );
  }

  /**
   * All three uses are single-table, so these need no alias qualification.
   *
   * The stack, deployment config, dependency edges and metadata are what the
   * architecture views render — selecting only the identity columns wrote them
   * to the database and then reported a service with nothing in it.
   */
  private static readonly SUB_PROJECT_COLS =
    "id, company_id, business_system_id, name, code, type, status, microservice_layer, " +
    "tech_stack, framework, git_repo, api_specs, dependencies, build_config, metadata, " +
    "created_at, updated_at";

  private static readonly TENANT_COLS = "id, slug, name, created_at";
  private static readonly API_KEY_COLS =
    "id, tenant_id, prefix, key_hash, label, scope, roles, member_id, revoked_at, last_used_at";

  async createTenant(input: OntologyTenantInput): Promise<OntologyTenantRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_tenants")} (id, slug, name, created_by)
       VALUES ($1, $2, $3, $4)`,
      [id, input.slug, input.name, input.createdBy ?? "system"],
    );
    const rows = await this.db.query<OntologyTenantRow>(
      `SELECT ${PostgresGraphStore.TENANT_COLS}
         FROM ${this.table("ontology_tenants")}
        WHERE id = $1`,
      [id],
    );
    return rows[0]!;
  }

  async getTenant(tenantId: string): Promise<OntologyTenantRow | null> {
    const rows = await this.db.query<OntologyTenantRow>(
      `SELECT ${PostgresGraphStore.TENANT_COLS}
         FROM ${this.table("ontology_tenants")}
        WHERE id = $1 AND is_deleted = false`,
      [tenantId],
    );
    return rows[0] ?? null;
  }

  async getTenantBySlug(slug: string): Promise<OntologyTenantRow | null> {
    const rows = await this.db.query<OntologyTenantRow>(
      `SELECT ${PostgresGraphStore.TENANT_COLS}
         FROM ${this.table("ontology_tenants")}
        WHERE slug = $1 AND is_deleted = false`,
      [slug],
    );
    return rows[0] ?? null;
  }

  async listTenants(): Promise<OntologyTenantRow[]> {
    return this.db.query<OntologyTenantRow>(
      `SELECT ${PostgresGraphStore.TENANT_COLS} FROM ${this.table("ontology_tenants")} ORDER BY slug`,
    );
  }

  async listApiKeys(tenantId: string): Promise<OntologyApiKeyRow[]> {
    // Revoked keys stay listed: a credential you can no longer see is one you
    // cannot prove you withdrew.
    return this.db.query<OntologyApiKeyRow>(
      `SELECT ${PostgresGraphStore.API_KEY_COLS}
         FROM ${this.table("ontology_api_keys")}
        WHERE tenant_id = $1
        ORDER BY revoked_at NULLS FIRST, prefix`,
      [tenantId],
    );
  }

  async findApiKeyByPrefix(prefix: string): Promise<OntologyApiKeyRow | null> {
    const rows = await this.db.query<OntologyApiKeyRow>(
      `SELECT ${PostgresGraphStore.API_KEY_COLS}
         FROM ${this.table("ontology_api_keys")}
        WHERE prefix = $1`,
      [prefix],
    );
    return rows[0] ?? null;
  }

  async createApiKey(input: OntologyApiKeyInput): Promise<OntologyApiKeyRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_api_keys")}
         (id, tenant_id, prefix, key_hash, label, scope, roles, member_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
      [
        id,
        input.tenantId,
        input.prefix,
        input.keyHash,
        input.label ?? "",
        input.scope ?? "agent",
        JSON.stringify(input.roles ?? []),
        input.memberId ?? null,
        input.createdBy ?? "system",
      ],
    );
    const rows = await this.db.query<OntologyApiKeyRow>(
      `SELECT ${PostgresGraphStore.API_KEY_COLS}
         FROM ${this.table("ontology_api_keys")}
        WHERE id = $1`,
      [id],
    );
    return rows[0]!;
  }

  async revokeApiKey(tenantId: string, prefix: string, revokedBy = "system"): Promise<boolean> {
    // Withdrawal, not deletion: a revoked key has to stay visible in the list,
    // or nobody can tell whether it was ever issued.
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_api_keys")}
          SET revoked_at = now(), revoked_by = $3
        WHERE tenant_id = $1 AND prefix = $2 AND revoked_at IS NULL`,
      [tenantId, prefix, revokedBy],
    );
    return res.rowCount > 0;
  }

  async touchApiKey(prefix: string): Promise<void> {
    await this.db.execute(
      `UPDATE ${this.table("ontology_api_keys")} SET last_used_at = now() WHERE prefix = $1`,
      [prefix],
    );
  }

  private static readonly VIEW_COLS =
    "id, company_id, domain_id, key, name, description, kind, config, visibility, roles, " +
    "created_by, created_at, updated_at";

  async createView(input: OntologyViewInput): Promise<OntologyViewRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_views")}
         (id, company_id, domain_id, key, name, description, kind, config, visibility, roles, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.key,
        input.name,
        input.description ?? "",
        input.kind ?? "runtime",
        JSON.stringify(input.config ?? {}),
        input.visibility ?? "shared",
        JSON.stringify(input.roles ?? []),
        input.createdBy ?? "system",
      ],
    );
    const rows = await this.db.query<OntologyViewRow>(
      `SELECT ${PostgresGraphStore.VIEW_COLS}
         FROM ${this.table("ontology_views")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async getView(companyId: string, viewId: string): Promise<OntologyViewRow | null> {
    const rows = await this.db.query<OntologyViewRow>(
      `SELECT ${PostgresGraphStore.VIEW_COLS}
         FROM ${this.table("ontology_views")}
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, viewId],
    );
    return rows[0] ?? null;
  }

  async listViews(companyId: string, domainId: string): Promise<OntologyViewRow[]> {
    return this.db.query<OntologyViewRow>(
      `SELECT ${PostgresGraphStore.VIEW_COLS}
         FROM ${this.table("ontology_views")}
        WHERE company_id = $1 AND domain_id = $2 AND is_deleted = false
        ORDER BY name ASC`,
      [companyId, domainId],
    );
  }

  async updateView(
    companyId: string,
    viewId: string,
    update: OntologyViewUpdate,
  ): Promise<OntologyViewRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_views")}
          SET name = COALESCE($3, name),
              description = COALESCE($4, description),
              kind = COALESCE($5, kind),
              config = CASE WHEN $6 THEN $7::jsonb ELSE config END,
              visibility = COALESCE($8, visibility),
              roles = CASE WHEN $9 THEN $10::jsonb ELSE roles END,
              updated_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        viewId,
        update.name ?? null,
        update.description ?? null,
        update.kind ?? null,
        update.config !== undefined,
        JSON.stringify(update.config ?? {}),
        update.visibility ?? null,
        update.roles !== undefined,
        JSON.stringify(update.roles ?? []),
      ],
    );
    if (res.rowCount === 0) return null;
    return this.getView(companyId, viewId);
  }

  async deleteView(companyId: string, viewId: string): Promise<boolean> {
    // Soft delete: a view is cheap to restore and its absence is not a fact about
    // the model, so losing one by accident should not be permanent.
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_views")}
          SET is_deleted = true, deleted_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, viewId],
    );
    return res.rowCount > 0;
  }

  private static readonly PROPOSAL_COLS =
    "id, company_id, domain_id, kind, status, title, summary, payload, blast_radius, author, " +
    "author_kind, reviewed_by, reviewed_at, review_note, applied_at, schema_version, " +
    "created_at, updated_at";

  async createProposal(input: OntologyProposalInput): Promise<OntologyProposalRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_proposals")}
         (id, company_id, domain_id, kind, status, title, summary, payload, blast_radius,
          author, author_kind)
       VALUES ($1, $2, $3, $4, 'proposed', $5, $6, $7::jsonb, $8::jsonb, $9, $10)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.kind ?? "schema_change",
        input.title,
        input.summary ?? "",
        JSON.stringify(input.payload ?? {}),
        JSON.stringify(input.blastRadius ?? {}),
        input.author ?? "system",
        input.authorKind ?? "human",
      ],
    );
    const rows = await this.db.query<OntologyProposalRow>(
      `SELECT ${PostgresGraphStore.PROPOSAL_COLS}
         FROM ${this.table("ontology_proposals")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async getProposal(companyId: string, proposalId: string): Promise<OntologyProposalRow | null> {
    const rows = await this.db.query<OntologyProposalRow>(
      `SELECT ${PostgresGraphStore.PROPOSAL_COLS}
         FROM ${this.table("ontology_proposals")}
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, proposalId],
    );
    return rows[0] ?? null;
  }

  async listProposals(
    companyId: string,
    domainId: string,
    status?: ProposalStatus,
  ): Promise<OntologyProposalRow[]> {
    return this.db.query<OntologyProposalRow>(
      `SELECT ${PostgresGraphStore.PROPOSAL_COLS}
         FROM ${this.table("ontology_proposals")}
        WHERE company_id = $1 AND domain_id = $2 AND is_deleted = false
          ${status ? "AND status = $3" : ""}
        ORDER BY created_at DESC`,
      status ? [companyId, domainId, status] : [companyId, domainId],
    );
  }

  async reviewProposal(
    companyId: string,
    proposalId: string,
    decision: "approved" | "rejected",
    reviewedBy: string,
    note = "",
  ): Promise<OntologyProposalRow | null> {
    // Only a `proposed` row can be decided: re-deciding an applied proposal
    // would silently rewrite the history of a change that already happened.
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_proposals")}
          SET status = $3, reviewed_by = $4, reviewed_at = now(), review_note = $5,
              updated_at = now()
        WHERE company_id = $1 AND id = $2 AND status = 'proposed'`,
      [companyId, proposalId, decision, reviewedBy, note],
    );
    if (res.rowCount === 0) return null;
    return this.getProposal(companyId, proposalId);
  }

  async markProposalApplied(
    companyId: string,
    proposalId: string,
    schemaVersion: number,
  ): Promise<OntologyProposalRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_proposals")}
          SET status = 'applied', applied_at = now(), schema_version = $3, updated_at = now()
        WHERE company_id = $1 AND id = $2 AND status = 'approved'`,
      [companyId, proposalId, schemaVersion],
    );
    if (res.rowCount === 0) return null;
    return this.getProposal(companyId, proposalId);
  }

  async createSubProject(input: OntologySubProjectInput): Promise<OntologySubProjectRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_sub_projects")}
         (id, company_id, business_system_id, name, code, type, tech_stack, framework,
          git_repo, api_specs, dependencies, build_config, microservice_layer,
          ontology_node_ref, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb,
               $11::jsonb, $12::jsonb, $13, $14::jsonb, $15, $15, $16::jsonb)`,
      [
        id,
        input.companyId,
        input.businessSystemId,
        input.name,
        input.code,
        input.type ?? "other",
        JSON.stringify(input.techStack ?? []),
        JSON.stringify(input.framework ?? {}),
        JSON.stringify(input.gitRepo ?? {}),
        JSON.stringify(input.apiSpecs ?? []),
        JSON.stringify(input.dependencies ?? []),
        JSON.stringify(
          input.buildConfig ?? {
            testCommand: "npm test",
            buildCommand: "npm run build",
            startCommand: "",
            previewPort: 3000,
            envType: "node22",
          },
        ),
        input.microserviceLayer ?? null,
        JSON.stringify(input.ontologyNodeRef ?? {}),
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologySubProjectRow>(
      `SELECT ${PostgresGraphStore.SUB_PROJECT_COLS}
         FROM ${this.table("ontology_sub_projects")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  /**
   * Every service bound to a domain, across however many business systems are
   * attached to it. The workbench's graph needs them to draw the runtime and
   * deployment perspectives.
   */
  async listDomainSubProjects(
    companyId: string,
    domainId: string,
  ): Promise<OntologySubProjectRow[]> {
    return this.db.query<OntologySubProjectRow>(
      `SELECT sp.id, sp.company_id, sp.business_system_id, sp.name, sp.code, sp.type, sp.status,
              sp.microservice_layer, sp.tech_stack, sp.framework, sp.git_repo, sp.api_specs,
              sp.dependencies, sp.build_config, sp.metadata, sp.created_at, sp.updated_at
         FROM ${this.table("ontology_sub_projects")} sp
         JOIN ${this.table("ontology_business_systems")} bs
           ON bs.company_id = sp.company_id AND bs.id = sp.business_system_id
        WHERE sp.company_id = $1
          AND bs.ontology_domain_id = $2
          AND sp.is_deleted = false
        ORDER BY sp.name ASC`,
      [companyId, domainId],
    );
  }

  async listSubProjects(
    companyId: string,
    businessSystemId: string,
  ): Promise<OntologySubProjectRow[]> {
    return this.db.query<OntologySubProjectRow>(
      `SELECT ${PostgresGraphStore.SUB_PROJECT_COLS}
         FROM ${this.table("ontology_sub_projects")}
        WHERE company_id = $1 AND business_system_id = $2 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId, businessSystemId],
    );
  }

  async updateSubProject(
    companyId: string,
    subProjectId: string,
    update: OntologySubProjectUpdate,
  ): Promise<OntologySubProjectRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_sub_projects")}
          SET name                = COALESCE($3, name),
              type                = COALESCE($4, type),
              tech_stack          = CASE WHEN $5::boolean THEN $6::jsonb ELSE tech_stack END,
              framework           = CASE WHEN $7::boolean THEN $8::jsonb ELSE framework END,
              git_repo            = CASE WHEN $9::boolean THEN $10::jsonb ELSE git_repo END,
              api_specs           = CASE WHEN $11::boolean THEN $12::jsonb ELSE api_specs END,
              dependencies        = CASE WHEN $13::boolean THEN $14::jsonb ELSE dependencies END,
              build_config        = CASE WHEN $15::boolean THEN $16::jsonb ELSE build_config END,
              status              = COALESCE($17, status),
              microservice_layer  = CASE WHEN $18::boolean THEN $19 ELSE microservice_layer END,
              ontology_node_ref   = CASE WHEN $20::boolean THEN $21::jsonb ELSE ontology_node_ref END,
              last_activity_at    = CASE WHEN $22::boolean THEN now() ELSE last_activity_at END,
              metadata            = CASE WHEN $23::boolean THEN $24::jsonb ELSE metadata END,
              updated_at          = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        subProjectId,
        update.name ?? null,
        update.type ?? null,
        update.techStack !== undefined,
        JSON.stringify(update.techStack ?? []),
        update.framework !== undefined,
        JSON.stringify(update.framework ?? {}),
        update.gitRepo !== undefined,
        JSON.stringify(update.gitRepo ?? {}),
        update.apiSpecs !== undefined,
        JSON.stringify(update.apiSpecs ?? []),
        update.dependencies !== undefined,
        JSON.stringify(update.dependencies ?? []),
        update.buildConfig !== undefined,
        JSON.stringify(update.buildConfig ?? {}),
        update.status ?? null,
        update.microserviceLayer !== undefined,
        update.microserviceLayer ?? null,
        update.ontologyNodeRef !== undefined,
        JSON.stringify(update.ontologyNodeRef ?? {}),
        update.markActivity === true,
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
      ],
    );
    if (res.rowCount === 0) return null;
    const rows = await this.db.query<OntologySubProjectRow>(
      `SELECT ${PostgresGraphStore.SUB_PROJECT_COLS}
         FROM ${this.table("ontology_sub_projects")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, subProjectId],
    );
    return rows[0] ?? null;
  }

  // -------------------------------------------------------------------------
  // O4b — LLM evaluation / simulation
  // -------------------------------------------------------------------------

  async createPromptTemplate(
    input: OntologyPromptTemplateInput,
  ): Promise<OntologyPromptTemplateRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_prompt_templates")}
         (id, company_id, domain_id, key, name, description, template, parameters, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $9, $10::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.key,
        input.name,
        input.description ?? "",
        input.template ?? "",
        JSON.stringify(input.parameters ?? []),
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyPromptTemplateRow>(
      `SELECT id, company_id, domain_id, key, name, version
         FROM ${this.table("ontology_prompt_templates")} WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listPromptTemplates(
    companyId: string,
    domainId: string,
  ): Promise<OntologyPromptTemplateRow[]> {
    return this.db.query<OntologyPromptTemplateRow>(
      `SELECT id, company_id, domain_id, key, name, version
         FROM ${this.table("ontology_prompt_templates")}
        WHERE company_id = $1 AND domain_id = $2 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId, domainId],
    );
  }

  async createGoldenDataset(
    input: OntologyGoldenDatasetInput,
  ): Promise<OntologyGoldenDatasetRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_golden_datasets")}
         (id, company_id, domain_id, key, name, description, entries, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8, $9::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.key,
        input.name,
        input.description ?? "",
        JSON.stringify(input.entries ?? []),
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyGoldenDatasetRow>(
      `SELECT id, company_id, domain_id, key, name, status, version
         FROM ${this.table("ontology_golden_datasets")} WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listGoldenDatasets(
    companyId: string,
    domainId: string,
  ): Promise<OntologyGoldenDatasetRow[]> {
    return this.db.query<OntologyGoldenDatasetRow>(
      `SELECT id, company_id, domain_id, key, name, status, version
         FROM ${this.table("ontology_golden_datasets")}
        WHERE company_id = $1 AND domain_id = $2 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId, domainId],
    );
  }

  private static readonly AIP_LOGIC_COLS =
    "id, company_id, domain_id, key, name, status, version";

  async createAipLogic(input: OntologyAipLogicInput): Promise<OntologyAipLogicRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_aip_logics")}
         (id, company_id, domain_id, key, name, description, steps, input_schema,
          output_schema, context_config, prompt_template_id, model_config, tags,
          created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb,
               $11, $12::jsonb, $13::jsonb, $14, $14, $15::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.key,
        input.name,
        input.description ?? "",
        JSON.stringify(input.steps ?? []),
        JSON.stringify(input.inputSchema ?? {}),
        JSON.stringify(input.outputSchema ?? {}),
        JSON.stringify(input.contextConfig ?? {}),
        input.promptTemplateId ?? null,
        JSON.stringify(input.modelConfig ?? { modelId: "", temperature: 0.7, maxTokens: 4096 }),
        JSON.stringify(input.tags ?? []),
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyAipLogicRow>(
      `SELECT ${PostgresGraphStore.AIP_LOGIC_COLS}
         FROM ${this.table("ontology_aip_logics")} WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listAipLogics(companyId: string, domainId: string): Promise<OntologyAipLogicRow[]> {
    return this.db.query<OntologyAipLogicRow>(
      `SELECT ${PostgresGraphStore.AIP_LOGIC_COLS}
         FROM ${this.table("ontology_aip_logics")}
        WHERE company_id = $1 AND domain_id = $2 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId, domainId],
    );
  }

  async updateAipLogic(
    companyId: string,
    logicId: string,
    update: OntologyAipLogicUpdate,
  ): Promise<OntologyAipLogicRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_aip_logics")}
          SET name           = COALESCE($3, name),
              description     = COALESCE($4, description),
              status          = COALESCE($5, status),
              steps           = CASE WHEN $6::boolean THEN $7::jsonb ELSE steps END,
              input_schema    = CASE WHEN $8::boolean THEN $9::jsonb ELSE input_schema END,
              output_schema   = CASE WHEN $10::boolean THEN $11::jsonb ELSE output_schema END,
              context_config  = CASE WHEN $12::boolean THEN $13::jsonb ELSE context_config END,
              model_config    = CASE WHEN $14::boolean THEN $15::jsonb ELSE model_config END,
              tags            = CASE WHEN $16::boolean THEN $17::jsonb ELSE tags END,
              metadata        = CASE WHEN $18::boolean THEN $19::jsonb ELSE metadata END,
              updated_at      = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        logicId,
        update.name ?? null,
        update.description ?? null,
        update.status ?? null,
        update.steps !== undefined,
        JSON.stringify(update.steps ?? []),
        update.inputSchema !== undefined,
        JSON.stringify(update.inputSchema ?? {}),
        update.outputSchema !== undefined,
        JSON.stringify(update.outputSchema ?? {}),
        update.contextConfig !== undefined,
        JSON.stringify(update.contextConfig ?? {}),
        update.modelConfig !== undefined,
        JSON.stringify(update.modelConfig ?? {}),
        update.tags !== undefined,
        JSON.stringify(update.tags ?? []),
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
      ],
    );
    if (res.rowCount === 0) return null;
    const rows = await this.db.query<OntologyAipLogicRow>(
      `SELECT ${PostgresGraphStore.AIP_LOGIC_COLS}
         FROM ${this.table("ontology_aip_logics")} WHERE company_id = $1 AND id = $2`,
      [companyId, logicId],
    );
    return rows[0] ?? null;
  }

  private static readonly EVAL_COLS =
    "id, company_id, domain_id, key, name, eval_type, status, score";

  async createEval(input: OntologyEvalInput): Promise<OntologyEvalRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_evals")}
         (id, company_id, domain_id, key, name, description, eval_type, input_data,
          expected_output, model_id, prompt_template_id, golden_dataset_id, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $13, $14::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.key,
        input.name,
        input.description ?? "",
        input.evalType ?? "accuracy",
        input.inputData === undefined || input.inputData === null ? null : JSON.stringify(input.inputData),
        input.expectedOutput === undefined || input.expectedOutput === null ? null : JSON.stringify(input.expectedOutput),
        input.modelId ?? "",
        input.promptTemplateId ?? null,
        input.goldenDatasetId ?? null,
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyEvalRow>(
      `SELECT ${PostgresGraphStore.EVAL_COLS}
         FROM ${this.table("ontology_evals")} WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listEvals(companyId: string, domainId: string): Promise<OntologyEvalRow[]> {
    return this.db.query<OntologyEvalRow>(
      `SELECT ${PostgresGraphStore.EVAL_COLS}
         FROM ${this.table("ontology_evals")}
        WHERE company_id = $1 AND domain_id = $2 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId, domainId],
    );
  }

  async updateEval(
    companyId: string,
    evalId: string,
    update: OntologyEvalUpdate,
  ): Promise<OntologyEvalRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_evals")}
          SET status         = COALESCE($3, status),
              actual_output  = CASE WHEN $4::boolean THEN $5::jsonb ELSE actual_output END,
              score          = CASE WHEN $6::boolean THEN $7 ELSE score END,
              metrics        = CASE WHEN $8::boolean THEN $9::jsonb ELSE metrics END,
              metadata       = CASE WHEN $10::boolean THEN $11::jsonb ELSE metadata END,
              updated_at     = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        evalId,
        update.status ?? null,
        update.actualOutput !== undefined,
        update.actualOutput === null || update.actualOutput === undefined ? null : JSON.stringify(update.actualOutput),
        update.score !== undefined,
        update.score ?? null,
        update.metrics !== undefined,
        JSON.stringify(update.metrics ?? {}),
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
      ],
    );
    if (res.rowCount === 0) return null;
    const rows = await this.db.query<OntologyEvalRow>(
      `SELECT ${PostgresGraphStore.EVAL_COLS}
         FROM ${this.table("ontology_evals")} WHERE company_id = $1 AND id = $2`,
      [companyId, evalId],
    );
    return rows[0] ?? null;
  }

  private static readonly SIMULATION_COLS =
    "id, company_id, domain_id, key, name, status, recommended_strategy";

  async createSimulationScenario(
    input: OntologySimulationScenarioInput,
  ): Promise<OntologySimulationScenarioRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_simulation_scenarios")}
         (id, company_id, domain_id, key, name, description, initial_context, strategies, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $9, $10::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.key,
        input.name,
        input.description ?? "",
        JSON.stringify(input.initialContext ?? {}),
        JSON.stringify(input.strategies ?? []),
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologySimulationScenarioRow>(
      `SELECT ${PostgresGraphStore.SIMULATION_COLS}
         FROM ${this.table("ontology_simulation_scenarios")} WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listSimulationScenarios(
    companyId: string,
    domainId: string,
  ): Promise<OntologySimulationScenarioRow[]> {
    return this.db.query<OntologySimulationScenarioRow>(
      `SELECT ${PostgresGraphStore.SIMULATION_COLS}
         FROM ${this.table("ontology_simulation_scenarios")}
        WHERE company_id = $1 AND domain_id = $2 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId, domainId],
    );
  }

  async updateSimulationScenario(
    companyId: string,
    scenarioId: string,
    update: OntologySimulationScenarioUpdate,
  ): Promise<OntologySimulationScenarioRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_simulation_scenarios")}
          SET status                 = COALESCE($3, status),
              results                = CASE WHEN $4::boolean THEN $5::jsonb ELSE results END,
              recommended_strategy   = CASE WHEN $6::boolean THEN $7 ELSE recommended_strategy END,
              recommendation_reason  = COALESCE($8, recommendation_reason),
              metadata               = CASE WHEN $9::boolean THEN $10::jsonb ELSE metadata END,
              updated_at             = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        scenarioId,
        update.status ?? null,
        update.results !== undefined,
        JSON.stringify(update.results ?? {}),
        update.recommendedStrategy !== undefined,
        update.recommendedStrategy ?? null,
        update.recommendationReason ?? null,
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
      ],
    );
    if (res.rowCount === 0) return null;
    const rows = await this.db.query<OntologySimulationScenarioRow>(
      `SELECT ${PostgresGraphStore.SIMULATION_COLS}
         FROM ${this.table("ontology_simulation_scenarios")} WHERE company_id = $1 AND id = $2`,
      [companyId, scenarioId],
    );
    return rows[0] ?? null;
  }

  // -------------------------------------------------------------------------
  // O6b — UModel unified observability graph
  // -------------------------------------------------------------------------

  async createUModelEntitySet(
    input: OntologyUModelEntitySetInput,
  ): Promise<OntologyUModelEntitySetRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_umodel_entity_sets")}
         (id, company_id, key, name, description, layer, parent_id, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9::jsonb)`,
      [
        id,
        input.companyId,
        input.key,
        input.name,
        input.description ?? "",
        input.layer ?? "application",
        input.parentId ?? null,
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyUModelEntitySetRow>(
      `SELECT id, company_id, key, name, layer, parent_id
         FROM ${this.table("ontology_umodel_entity_sets")} WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listUModelEntitySets(companyId: string): Promise<OntologyUModelEntitySetRow[]> {
    return this.db.query<OntologyUModelEntitySetRow>(
      `SELECT id, company_id, key, name, layer, parent_id
         FROM ${this.table("ontology_umodel_entity_sets")}
        WHERE company_id = $1 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId],
    );
  }

  private static readonly UMODEL_ENTITY_COLS =
    "id, company_id, key, type, name, state, entity_set_id";

  async createUModelEntity(
    input: OntologyUModelEntityInput,
  ): Promise<OntologyUModelEntityRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_umodel_entities")}
         (id, company_id, key, type, name, display_name, description, state, attributes,
          telemetry_bindings, semantic_tags, agent_description, entity_set_id, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $14, $15::jsonb)`,
      [
        id,
        input.companyId,
        input.key,
        input.type,
        input.name,
        input.displayName ?? "",
        input.description ?? "",
        input.state ?? "active",
        JSON.stringify(input.attributes ?? {}),
        JSON.stringify(input.telemetryBindings ?? []),
        JSON.stringify(input.semanticTags ?? []),
        JSON.stringify(input.agentDescription ?? {}),
        input.entitySetId ?? null,
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyUModelEntityRow>(
      `SELECT ${PostgresGraphStore.UMODEL_ENTITY_COLS}
         FROM ${this.table("ontology_umodel_entities")} WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listUModelEntities(companyId: string, limit = 500): Promise<OntologyUModelEntityRow[]> {
    const capped = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 2000)) : 500;
    return this.db.query<OntologyUModelEntityRow>(
      `SELECT ${PostgresGraphStore.UMODEL_ENTITY_COLS}
         FROM ${this.table("ontology_umodel_entities")}
        WHERE company_id = $1 AND is_deleted = false
        ORDER BY created_at ASC
        LIMIT $2`,
      [companyId, capped],
    );
  }

  async updateUModelEntity(
    companyId: string,
    entityId: string,
    update: OntologyUModelEntityUpdate,
  ): Promise<OntologyUModelEntityRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_umodel_entities")}
          SET name          = COALESCE($3, name),
              display_name   = COALESCE($4, display_name),
              description     = COALESCE($5, description),
              state           = COALESCE($6, state),
              attributes      = CASE WHEN $7::boolean THEN $8::jsonb ELSE attributes END,
              semantic_tags   = CASE WHEN $9::boolean THEN $10::jsonb ELSE semantic_tags END,
              entity_set_id   = CASE WHEN $11::boolean THEN $12::uuid ELSE entity_set_id END,
              metadata        = CASE WHEN $13::boolean THEN $14::jsonb ELSE metadata END,
              updated_at      = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        entityId,
        update.name ?? null,
        update.displayName ?? null,
        update.description ?? null,
        update.state ?? null,
        update.attributes !== undefined,
        JSON.stringify(update.attributes ?? {}),
        update.semanticTags !== undefined,
        JSON.stringify(update.semanticTags ?? []),
        update.entitySetId !== undefined,
        update.entitySetId ?? null,
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
      ],
    );
    if (res.rowCount === 0) return null;
    const rows = await this.db.query<OntologyUModelEntityRow>(
      `SELECT ${PostgresGraphStore.UMODEL_ENTITY_COLS}
         FROM ${this.table("ontology_umodel_entities")} WHERE company_id = $1 AND id = $2`,
      [companyId, entityId],
    );
    return rows[0] ?? null;
  }

  async createUModelLink(input: OntologyUModelLinkInput): Promise<OntologyUModelLinkRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_umodel_links")}
         (id, company_id, from_entity_id, to_entity_id, type, direction, strength,
          properties, discovered_from, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $10, $11::jsonb)`,
      [
        id,
        input.companyId,
        input.fromEntityId,
        input.toEntityId,
        input.type,
        input.direction ?? "forward",
        input.strength ?? 0.5,
        JSON.stringify(input.properties ?? {}),
        input.discoveredFrom ?? "manual",
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyUModelLinkRow>(
      `SELECT id, company_id, from_entity_id, to_entity_id, type, direction, strength
         FROM ${this.table("ontology_umodel_links")} WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listUModelLinks(companyId: string, entityId?: string): Promise<OntologyUModelLinkRow[]> {
    if (entityId) {
      return this.db.query<OntologyUModelLinkRow>(
        `SELECT id, company_id, from_entity_id, to_entity_id, type, direction, strength
           FROM ${this.table("ontology_umodel_links")}
          WHERE company_id = $1 AND is_deleted = false
            AND (from_entity_id = $2 OR to_entity_id = $2)
          ORDER BY created_at ASC`,
        [companyId, entityId],
      );
    }
    return this.db.query<OntologyUModelLinkRow>(
      `SELECT id, company_id, from_entity_id, to_entity_id, type, direction, strength
         FROM ${this.table("ontology_umodel_links")}
        WHERE company_id = $1 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId],
    );
  }

  async recordUModelTelemetry(
    input: OntologyUModelTelemetryInput,
  ): Promise<OntologyUModelTelemetryRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_umodel_telemetry")}
         (id, company_id, entity_id, type, payload, labels, source)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
      [
        id,
        input.companyId,
        input.entityId,
        input.type,
        JSON.stringify(input.payload ?? {}),
        JSON.stringify(input.labels ?? {}),
        input.source ?? "",
      ],
    );
    const rows = await this.db.query<OntologyUModelTelemetryRow>(
      `SELECT id, company_id, entity_id, type, event_at
         FROM ${this.table("ontology_umodel_telemetry")} WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listUModelTelemetry(
    companyId: string,
    entityId: string,
    limit = 100,
  ): Promise<OntologyUModelTelemetryRow[]> {
    const capped = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 1000)) : 100;
    return this.db.query<OntologyUModelTelemetryRow>(
      `SELECT id, company_id, entity_id, type, event_at
         FROM ${this.table("ontology_umodel_telemetry")}
        WHERE company_id = $1 AND entity_id = $2
        ORDER BY event_at DESC
        LIMIT $3`,
      [companyId, entityId, capped],
    );
  }

  // --- capability acquisition -----------------------------------------------

  private static readonly GAP_COLS =
    "id, company_id, domain_id, gap_key, title, description, detected_from, intent_ref, status, resolved_function_id, priority";

  private static readonly RESOLUTION_COLS =
    "id, company_id, gap_id, resolution_key, stage, source, candidate, verification, license_verdict, error";

  async detectCapabilityGap(input: CapabilityGapInput): Promise<CapabilityGapRow> {
    const id = randomUUID();
    // Idempotent by (company_id, gap_key): a repeated detect updates the
    // description/priority but never creates a duplicate gap.
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_capability_gaps")}
         (id, company_id, domain_id, gap_key, title, description, detected_from,
          intent_ref, priority, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11::jsonb)
       ON CONFLICT (company_id, gap_key) DO UPDATE
          SET description = EXCLUDED.description,
              priority    = EXCLUDED.priority,
              updated_at  = now()`,
      [
        id,
        input.companyId,
        input.domainId ?? null,
        input.gapKey,
        input.title,
        input.description ?? "",
        input.detectedFrom ?? "manual",
        input.intentRef ?? null,
        input.priority ?? "medium",
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<CapabilityGapRow>(
      `SELECT ${PostgresGraphStore.GAP_COLS}
         FROM ${this.table("ontology_capability_gaps")}
        WHERE company_id = $1 AND gap_key = $2 AND is_deleted = false`,
      [input.companyId, input.gapKey],
    );
    return rows[0]!;
  }

  async getCapabilityGap(companyId: string, gapId: string): Promise<CapabilityGapRow | null> {
    const rows = await this.db.query<CapabilityGapRow>(
      `SELECT ${PostgresGraphStore.GAP_COLS}
         FROM ${this.table("ontology_capability_gaps")}
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, gapId],
    );
    return rows[0] ?? null;
  }

  async listCapabilityGaps(
    companyId: string,
    status?: string,
    limit = 200,
  ): Promise<CapabilityGapRow[]> {
    const capped = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 1000)) : 200;
    if (status) {
      return this.db.query<CapabilityGapRow>(
        `SELECT ${PostgresGraphStore.GAP_COLS}
           FROM ${this.table("ontology_capability_gaps")}
          WHERE company_id = $1 AND is_deleted = false AND status = $2
          ORDER BY created_at DESC
          LIMIT $3`,
        [companyId, status, capped],
      );
    }
    return this.db.query<CapabilityGapRow>(
      `SELECT ${PostgresGraphStore.GAP_COLS}
         FROM ${this.table("ontology_capability_gaps")}
        WHERE company_id = $1 AND is_deleted = false
        ORDER BY created_at DESC
        LIMIT $2`,
      [companyId, capped],
    );
  }

  async listCapabilityResolutions(
    companyId: string,
    gapId: string,
  ): Promise<CapabilityResolutionRow[]> {
    return this.db.query<CapabilityResolutionRow>(
      `SELECT ${PostgresGraphStore.RESOLUTION_COLS}
         FROM ${this.table("ontology_capability_resolutions")}
        WHERE company_id = $1 AND gap_id = $2 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId, gapId],
    );
  }

  private async setGapStatus(
    companyId: string,
    gapId: string,
    to: CapabilityGapStatus,
    resolvedFunctionId?: string | null,
  ): Promise<void> {
    await this.db.execute(
      `UPDATE ${this.table("ontology_capability_gaps")}
          SET status = $3,
              resolved_function_id = COALESCE($4, resolved_function_id),
              updated_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, gapId, to, resolvedFunctionId ?? null],
    );
  }

  /**
   * Run one acquisition attempt for a gap given an already-discovered candidate.
   * Online discovery and sandbox smoke tests happen in the worker (http.outbound
   * / host ctx.execution); the store owns the resolution state machine, the
   * license/size gates, and — on success — registering the capability as an
   * active ontology_function and closing the gap.
   *
   * Returns null when the gap does not exist.
   */
  async acquireCapability(
    companyId: string,
    gapId: string,
    candidate: CapabilityCandidate,
  ): Promise<CapabilityAcquisitionResult | null> {
    const gap = await this.getCapabilityGap(companyId, gapId);
    if (!gap) return null;

    await this.setGapStatus(companyId, gapId, "resolving");

    const resolutionId = randomUUID();
    const resolutionKey = `${gap.gap_key}:${resolutionId.slice(0, 8)}`;
    const now = new Date().toISOString();
    const history: Array<{ stage: ResolutionStage; at: string; message: string }> = [
      { stage: "detected", at: now, message: "candidate discovered" },
      { stage: "searching_online", at: now, message: `source ${candidate.source}` },
    ];

    // License + size gates.
    const licenseVerdict = classifyLicense(candidate.license);
    const sizeOk =
      candidate.sizeBytes === undefined || candidate.sizeBytes <= MAX_PACKAGE_SIZE_BYTES;
    const smokeOk = candidate.smokeTestPassed === true;

    let stage: ResolutionStage;
    let error = "";
    let functionId: string | null = null;
    let acquired = false;

    if (licenseVerdict === "rejected" || licenseVerdict === "unknown") {
      stage = "failed";
      error = `license not registrable: ${candidate.license ?? "unknown"}`;
    } else if (!sizeOk) {
      stage = "failed";
      error = `package exceeds size ceiling (${candidate.sizeBytes} bytes)`;
    } else if (!smokeOk) {
      stage = "failed";
      error = "smoke test did not pass";
    } else {
      // Passed gates: register the capability as an active ontology_function.
      if (!gap.domain_id) {
        stage = "failed";
        error = "gap has no target domain to register the capability in";
      } else {
        history.push({ stage: "installing", at: now, message: candidate.name });
        const fn = await this.createFunction({
          companyId,
          domainId: gap.domain_id,
          name: candidate.name,
          type: "action",
          version: candidate.version ?? "1.0.0",
          description: `Acquired capability for gap ${gap.gap_key}`,
          implementation: {
            runtime: "external",
            source: candidate.source,
            repoUrl: candidate.repoUrl ?? "",
          },
          metadata: { acquiredFromGap: gap.gap_key, license: candidate.license ?? "" },
        });
        await this.updateFunction(companyId, fn.id, { status: "active" });
        functionId = fn.id;
        acquired = true;
        stage = "resolved";
      }
    }

    history.push({ stage, at: new Date().toISOString(), message: error || "ok" });

    await this.db.execute(
      `INSERT INTO ${this.table("ontology_capability_resolutions")}
         (id, company_id, gap_id, resolution_key, stage, source, candidate,
          verification, license_verdict, error, stage_history, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11::jsonb, $12, $12)`,
      [
        resolutionId,
        companyId,
        gapId,
        resolutionKey,
        stage,
        candidate.source,
        JSON.stringify(candidate),
        JSON.stringify({ smokeTestPassed: smokeOk, licenseVerdict, sizeOk }),
        licenseVerdict,
        error,
        JSON.stringify(history),
        "system",
      ],
    );

    // Close or reopen the gap.
    if (acquired) {
      await this.setGapStatus(companyId, gapId, "resolved", functionId);
    } else {
      await this.setGapStatus(companyId, gapId, "open");
    }

    const gapAfter = (await this.getCapabilityGap(companyId, gapId))!;
    const resolutionRows = await this.db.query<CapabilityResolutionRow>(
      `SELECT ${PostgresGraphStore.RESOLUTION_COLS}
         FROM ${this.table("ontology_capability_resolutions")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, resolutionId],
    );

    return { gap: gapAfter, resolution: resolutionRows[0]!, functionId, acquired };
  }

  // -------------------------------------------------------------------------
  // O10 — 数字副手 (Digital Aide) context aggregation
  // -------------------------------------------------------------------------

  /**
   * Aggregate everything a domain-aware LLM would need to ground its answers
   * for the 数字副手: the domain row, every node/relation type with its current
   * instance count, the most recently mutated nodes, the business systems +
   * sub-projects + action types bound to this domain, and aggregate counts.
   *
   * Kept inside PostgresGraphStore so all SQL stays namespaced and
   * restricted-statement compliant with the host validator. UI consumes this
   * via `usePluginData("describe-domain", { companyId, domainId })`.
   */
  async describeDomain(companyId: string, domainId: string): Promise<DescribeDomainResult> {
    const [domain, nodeTypes, relationTypes, recentNodes, aggregate] = await Promise.all([
      this.getDomain(companyId, domainId),
      this.db.query<OntologyNodeTypeRow & { instance_count: string }>(
        `SELECT ${PostgresGraphStore.NODE_TYPE_COLS_NT},
                (SELECT COUNT(*) FROM ${this.table("ontology_nodes")} n
                  WHERE n.company_id = $1 AND n.domain_id = $2 AND n.node_type_id = nt.id) AS instance_count
           FROM ${this.table("ontology_node_types")} nt
          WHERE nt.company_id = $1 AND nt.domain_id = $2
          ORDER BY nt.display_name ASC`,
        [companyId, domainId],
      ),
      this.db.query<OntologyRelationTypeRow & { instance_count: string }>(
        `SELECT ${PostgresGraphStore.RELATION_TYPE_COLS_RT},
                (SELECT COUNT(*) FROM ${this.table("ontology_edges")} e
                  WHERE e.company_id = $1 AND e.domain_id = $2 AND e.relation_type_id = rt.id) AS instance_count
           FROM ${this.table("ontology_relation_types")} rt
          WHERE rt.company_id = $1 AND rt.domain_id = $2
          ORDER BY rt.display_name ASC`,
        [companyId, domainId],
      ),
      this.db.query<OntologyNodeRow & { node_type_key: string | null }>(
        `SELECT n.id, n.company_id, n.domain_id, n.node_type_id, n.key, n.label,
                n.lifecycle_state, n.version,
                nt.key AS node_type_key
           FROM ${this.table("ontology_nodes")} n
           LEFT JOIN ${this.table("ontology_node_types")} nt
             ON nt.company_id = n.company_id AND nt.id = n.node_type_id
          WHERE n.company_id = $1 AND n.domain_id = $2
          ORDER BY n.updated_at DESC, n.created_at DESC
          LIMIT 20`,
        [companyId, domainId],
      ),
      this.db.query<{
        total_nodes: string;
        total_edges: string;
        business_systems: string;
        sub_projects: string;
        action_types: string;
      }>(
        `SELECT
           (SELECT COUNT(*) FROM ${this.table("ontology_nodes")} n
             WHERE n.company_id = $1 AND n.domain_id = $2) AS total_nodes,
           (SELECT COUNT(*) FROM ${this.table("ontology_edges")} e
             WHERE e.company_id = $1 AND e.domain_id = $2) AS total_edges,
           (SELECT COUNT(*) FROM ${this.table("ontology_business_systems")} bs
             WHERE bs.company_id = $1 AND bs.ontology_domain_id = $2 AND bs.is_deleted = false) AS business_systems,
           (SELECT COUNT(*) FROM ${this.table("ontology_sub_projects")} sp
             JOIN ${this.table("ontology_business_systems")} bs
               ON bs.company_id = sp.company_id AND bs.id = sp.business_system_id
            WHERE sp.company_id = $1 AND bs.ontology_domain_id = $2 AND sp.is_deleted = false) AS sub_projects,
           (SELECT COUNT(*) FROM ${this.table("ontology_action_types")} at
             WHERE at.company_id = $1 AND at.domain_id = $2 AND at.is_deleted = false) AS action_types`,
        [companyId, domainId],
      ),
    ]);

    if (!domain) {
      throw new Error(`Domain not found: company=${companyId} domain=${domainId}`);
    }

    const businessSystems = await this.db.query<{
      id: string;
      code: string;
      name: string;
      status: string;
      description: string | null;
      target_role: string | null;
      ontology_binding: Record<string, unknown> | null;
    }>(
      `SELECT id, code, name, status, description, target_role, ontology_binding
         FROM ${this.table("ontology_business_systems")}
        WHERE company_id = $1 AND ontology_domain_id = $2 AND is_deleted = false
        ORDER BY name ASC`,
      [companyId, domainId],
    );

    const subProjects = businessSystems.length
      ? await this.db.query<{
          id: string;
          business_system_id: string;
          code: string;
          name: string;
          status: string;
          type: string;
          description: string | null;
          microservice_layer: MicroserviceLayer | null;
        }>(
          // `ontology_sub_projects` has no `description` column — it has `remark`
          // (the `description` in migration 006 belongs to the business-systems
          // table next to it). Selecting `sp.description` made this a guaranteed
          // SQL error for every domain with a business system, which took out
          // `describeDomain` entirely: the assistant's context, the governance
          // panel and the sub-project list all read from it.
          `SELECT sp.id, sp.business_system_id, sp.code, sp.name, sp.status, sp.type,
                  sp.remark AS description, sp.microservice_layer
             FROM ${this.table("ontology_sub_projects")} sp
             JOIN ${this.table("ontology_business_systems")} bs
               ON bs.company_id = sp.company_id AND bs.id = sp.business_system_id
            WHERE sp.company_id = $1
              AND bs.ontology_domain_id = $2
              AND sp.is_deleted = false
            ORDER BY bs.name ASC, sp.name ASC`,
          [companyId, domainId],
        )
      : [];

    const actionTypes = await this.db.query<{
      id: string;
      key: string;
      display_name: string;
      kind: string;
      status: string;
    }>(
      `SELECT id, key, display_name, kind, status
         FROM ${this.table("ontology_action_types")}
        WHERE company_id = $1 AND domain_id = $2 AND is_deleted = false
        ORDER BY display_name ASC`,
      [companyId, domainId],
    );

    const agg = aggregate[0] ?? {
      total_nodes: "0",
      total_edges: "0",
      business_systems: "0",
      sub_projects: "0",
      action_types: "0",
    };

    return {
      domain,
      nodeTypes: nodeTypes.map((row) => ({
        id: row.id,
        key: row.key,
        displayName: row.display_name,
        description: row.description,
        layer: row.layer,
        propertiesSchema: row.properties_schema,
        // The declared order, beside the map rather than inside it — jsonb keeps
        // an array's element order but re-sorts an object's keys.
        propertyOrder: readPropertyOrder(row),
        instanceCount: Number(row.instance_count),
      })),
      relationTypes: relationTypes.map((row) => ({
        id: row.id,
        key: row.key,
        displayName: row.display_name,
        description: row.description,
        directed: row.directed,
        cardinality: row.cardinality,
        instanceCount: Number(row.instance_count),
        // Where the edge runs, for a type-level structure view. Relation types
        // have no endpoint columns; importers put them in `metadata`.
        ...relationEndpoints(row.metadata),
      })),
      recentNodes: recentNodes.map((row) => ({
        id: row.id,
        key: row.key,
        label: row.label,
        nodeTypeKey: row.node_type_key,
      })),
      counts: {
        totalNodes: Number(agg.total_nodes),
        totalEdges: Number(agg.total_edges),
        businessSystems: Number(agg.business_systems),
        subProjects: Number(agg.sub_projects),
        actionTypes: Number(agg.action_types),
      },
      businessSystems: businessSystems.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        status: row.status,
        description: row.description,
        targetRole: row.target_role,
        domainVersion: (row.ontology_binding as { domainVersion?: number } | null)?.domainVersion ?? null,
      })),
      subProjects: subProjects.map((row) => ({
        id: row.id,
        businessSystemId: row.business_system_id,
        code: row.code,
        name: row.name,
        status: row.status,
        type: row.type,
        description: row.description,
        microserviceLayer: row.microservice_layer,
      })),
      actionTypes: actionTypes.map((row) => ({
        id: row.id,
        key: row.key,
        displayName: row.display_name,
        kind: row.kind,
        status: row.status,
      })),
    };
  }
}

// ---------------------------------------------------------------------------
// O10 — describeDomain() result shape
// ---------------------------------------------------------------------------

export interface DescribeDomainNodeType {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  layer: NodeLayer;
  propertiesSchema: Record<string, unknown> | null;
  /** Declared property order; `[]` when storage never recorded one. */
  propertyOrder: string[];
  instanceCount: number;
}

export interface DescribeDomainRelationType {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  directed: boolean;
  cardinality: LinkCardinality;
  instanceCount: number;
}

export interface DescribeDomainRecentNode {
  id: string;
  key: string;
  label: string;
  nodeTypeKey: string | null;
}

export interface DescribeDomainBusinessSystem {
  id: string;
  code: string;
  name: string;
  status: string;
  description: string | null;
  targetRole: string | null;
  domainVersion?: number | null;
}

export interface DescribeDomainSubProject {
  id: string;
  businessSystemId: string;
  code: string;
  name: string;
  status: string;
  type: string;
  /** The row's `remark`; sub-projects have no `description` column. */
  description: string | null;
  microserviceLayer: MicroserviceLayer | null;
}

export interface DescribeDomainActionType {
  id: string;
  key: string;
  displayName: string;
  kind: string;
  status: string;
}

export interface DescribeDomainResult {
  domain: OntologyDomainRow;
  nodeTypes: DescribeDomainNodeType[];
  relationTypes: DescribeDomainRelationType[];
  recentNodes: DescribeDomainRecentNode[];
  counts: {
    totalNodes: number;
    totalEdges: number;
    businessSystems: number;
    subProjects: number;
    actionTypes: number;
  };
  businessSystems: DescribeDomainBusinessSystem[];
  subProjects: DescribeDomainSubProject[];
  actionTypes: DescribeDomainActionType[];
}
