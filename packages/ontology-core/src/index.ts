/**
 * `@paperclipai/ontology-core` — the ontology's own services.
 *
 * Schema, facts, mapping and query, over the ontology tables, with no dependency
 * on the host. The Paperclip plugin is one *client* of this package: it supplies
 * a `SqlClient`, renders the UI, and exposes the routes. Nothing here imports the
 * plugin SDK, React, or the plugin's worker — `tests/layering.spec.ts` in the
 * plugin asserts it, and the package boundary now enforces it too.
 *
 * The split that matters: this package is what a standalone deployment would run.
 * Anything reaching for the host belongs on the other side of the boundary.
 *
 * Consumers can import the barrel (`@paperclipai/ontology-core`) or a specific
 * module (`@paperclipai/ontology-core/graph/GraphStore.js`); both are declared in
 * `exports`, and the `.js`-suffixed form keeps this package's own NodeNext-style
 * specifiers working unchanged.
 */

export type { SqlClient } from "./graph/SqlClient.js";
export { PostgresGraphStore, SchemaChangeNeedsReview } from "./graph/GraphStore.js";
export type {
  GraphStore,
  OntologyAuditLogInput,
  OntologyAuditLogRow,
  OntologyDomainInput,
  OntologyDomainRow,
  OntologyDomainUpdate,
  OntologyEdgeInput,
  OntologyEdgeRow,
  OntologyNodeInput,
  OntologyNodeRow,
  OntologyNodeTypeInput,
  OntologyNodeTypeRow,
  OntologyNodeTypeUpdate,
  OntologyProposalInput,
  OntologyProposalRow,
  OntologyRelationTypeInput,
  OntologyRelationTypeRow,
  OntologyRelationTypeUpdate,
  OntologySubProjectInput,
  OntologySubProjectRow,
  OntologySubProjectUpdate,
  OntologyTenantInput,
  OntologyTenantRow,
  OntologyApiKeyInput,
  OntologyApiKeyRow,
  LinkedDomainRow,
  SchemaEditOutcome,
} from "./graph/GraphStore.js";

export { RECOMMEND_THRESHOLD, scoreDomain, scoreDomainCandidates } from "./graph/linkSuggestions.js";
export type { DomainCandidateInput, ScoredDomain } from "./graph/linkSuggestions.js";

export {
  analyzeArchitecture,
  applyLimits,
  MAX_BYTES,
  MAX_FILES,
} from "./architecture/index.js";
export type {
  ArchitectureAnalysis,
  DetectedDependency,
  LayerVerdict,
  ServiceArchitecture,
  SourceFile,
} from "./architecture/index.js";
export { subProjectsFromArchitecture } from "./architecture/subProjectMapping.js";
export type { SubProjectDraft } from "./architecture/subProjectMapping.js";
export {
  detectServices,
  MANIFEST_FILES,
  parseSpringAppName,
  readSpringAppName,
  SERVICE_ROOT_SEGMENTS,
} from "./architecture/serviceDetector.js";
export type { DetectedService } from "./architecture/serviceDetector.js";
export { composeBlockFor, detectStack } from "./architecture/stackDetector.js";
export type { DeployInfo, DetectedStack, StackInfo } from "./architecture/stackDetector.js";

export { extractFile, extractRepoDraft, parseSourceFile, parseSqlDdl } from "./cognition/AstExtractor.js";
export type { RepoDraft, RepoDraftCoverage } from "./cognition/AstExtractor.js";
export {
  javaTypeToSchemaType,
  moduleFromJavaPackage,
  parseJavaFile,
  stripJavaComments,
} from "./cognition/javaParser.js";
export { parseProtoFile, protoTypeToSchemaType, serviceFromProtoPackage } from "./cognition/protoParser.js";
export { parseMyBatisMapper } from "./cognition/mybatisParser.js";
export { PARSED_EXTENSIONS, IGNORED_EXTENSIONS, scanProject } from "./cognition/projectScanner.js";
export type { ProjectScanResult, ScannedService } from "./cognition/projectScanner.js";
export type {
  ExtractedAction,
  ExtractedEntity,
  ExtractedOrigin,
  ExtractedProperty,
  ExtractedRelation,
  ExtractionKind,
  FileExtraction,
  SourceStereotype,
} from "./cognition/extractionTypes.js";
export { dropOrgPrefix, firstQuoted, joinPaths } from "./cognition/extractionText.js";

export { buildRelationMetadata, relationEndpoints, ENDPOINT_KEYS } from "./relationEndpoints.js";
export type { RelationEndpoints } from "./relationEndpoints.js";
export {
  buildTypeProvenance,
  describeProvenance,
  MAX_SOURCE_FILES,
  readOrigin,
  readSourceFiles,
  readTypeProvenance,
} from "./provenance.js";
export type { TypeProvenance } from "./provenance.js";
export {
  describeOrphans,
  diffPropertySchemas,
  planPropertyRenames,
} from "./schemaEvolution.js";
export type { PropertySchemaDiff, RenamePlan } from "./schemaEvolution.js";
export {
  CORE_API,
  CORE_API_VERSION,
  agentApiRoutes,
  coreApiRoute,
  describeCoreApi,
} from "./api/contract.js";
export type { CoreApiDoc, CoreApiGroup, CoreApiRoute } from "./api/contract.js";
export { ONTOLOGY_TOOLS, callOntologyTool, ontologyToolByName } from "./mcp/tools.js";
export {
  SCHEMA_TOKEN,
  appliedMigrations,
  applyMigrations,
  checksum,
  preflight,
  splitStatements,
  withNamespace,
} from "./migrate/runner.js";
export type {
  MigrationFile,
  MigrationPreflight,
  MigrationResult,
  TransactionalSqlClient,
} from "./migrate/runner.js";

export {
  MEMBER_STATUSES,
  isValidScope,
  isValidStatus,
  knownRoles,
  resolveIdentity,
  rolesFromMember,
} from "./auth/members.js";
export type { MemberRecord, MemberStatus, ResolvedIdentity } from "./auth/members.js";
export { createMemberStore } from "./auth/memberStore.js";
export type { MemberStore } from "./auth/memberStore.js";

export {
  API_KEY_ROLES,
  API_KEY_SCOPES,
  apiKeyPrefix,
  canDecide,
  canWrite,
  generateApiKey,
  hashApiKey,
  rolesOf,
  verifyApiKey,
} from "./auth/credentials.js";
export type {
  ApiKeyRecord,
  ApiKeyRole,
  ApiKeyScope,
  AuthenticatedCaller,
  GeneratedApiKey,
  Identity,
} from "./auth/credentials.js";

export {
  VIEW_KINDS,
  VIEW_ROLES,
  VIEW_VISIBILITIES,
  canOpenView,
  normaliseView,
  validateView,
  visibleViews,
  withheldViews,
} from "./views.js";
export type {
  ViewAudience,
  ViewKind,
  ViewRecord,
  ViewRole,
  ViewValidation,
  ViewVisibility,
} from "./views.js";
export type { OntologyTool } from "./mcp/tools.js";

export {
  ARCHIFY_CARD_DOTS,
  architectureToArchifyIr,
} from "./export/archify.js";
export type {
  ArchifyComponentType,
  ArchifyIr,
  ArchifyIrOptions,
  ArchifyServiceInput,
  ArchifyVariant,
} from "./export/archify.js";
export { runTransform } from "./transform/TransformRunner.js";
export type { TransformRunResult } from "./transform/TransformRunner.js";

/**
 * The ontology document — the unit of exchange, plus its validator and lint.
 *
 * Exported from the barrel (rather than only reachable by deep subpath) because
 * the document is the package's public contract: a host that plans a model
 * needs to validate it before it is written, and a plugin that receives one
 * needs to validate it again at the boundary. Both are clients of this.
 */
export {
  DOCUMENT_FORMAT,
  DOCUMENT_PROPERTY_TYPES,
  canonicalize,
  documentFromRows,
  documentToWritePlan,
  fingerprintDocument,
  parseDocument,
  serializeDocument,
  validateDocument,
} from "./document/OntologyDocument.js";
export type {
  DocumentObjectType,
  DocumentProblem,
  DocumentProperty,
  DocumentPropertyType,
  DocumentRelationAttribute,
  DocumentRelationType,
  DocumentSourceRows,
  DocumentWritePlan,
  OntologyDocument,
  OntologyDocumentSource,
  ParseResult,
  RowsResult,
} from "./document/OntologyDocument.js";
export { lintDocument } from "./document/lintDocument.js";
export type { LintFinding } from "./document/lintDocument.js";

export {
  projectApiToMcpTool,
  synthesizeMockResponse,
  generateCodeStub,
} from "./api/lifecycle.js";
export type {
  ApiProtocol,
  ApiLifecycleStage,
  ApiFieldContract,
  ApiErrorContract,
  ApiContractDefinition,
} from "./api/lifecycle.js";
