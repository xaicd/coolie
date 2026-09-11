import { randomUUID } from "node:crypto";
import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";

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
import { isValidDomainTransition } from "../enums.js";
import type {
  AuditEventType,
  BootstrapSource,
  DomainLifecycleState,
  FunctionStatus,
  FunctionType,
  LinkCardinality,
  NodeLifecycleState,
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
  seed_schema_version: number;
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
  metadata?: Record<string, unknown>;
}

export interface OntologyNodeTypeUpdate {
  displayName?: string;
  description?: string | null;
  propertiesSchema?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface OntologyNodeTypeRow {
  id: string;
  company_id: string;
  domain_id: string;
  key: string;
  display_name: string;
  description: string | null;
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

export interface GraphSnapshot {
  domainId: string;
  counts: {
    nodeTypes: number;
    relationTypes: number;
    nodes: number;
    edges: number;
  };
  nodes: Array<{ id: string; key: string; label: string; nodeTypeId: string | null }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    relationKey: string | null;
    weight: number;
  }>;
}

export interface GraphStore {
  // O0 — instance graph + traversal
  createDomain(input: OntologyDomainInput): Promise<OntologyDomainRow>;
  createNode(input: OntologyNodeInput): Promise<OntologyNodeRow>;
  createEdge(input: OntologyEdgeInput): Promise<OntologyEdgeRow>;
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
  updateDomain(
    companyId: string,
    domainId: string,
    update: OntologyDomainUpdate,
  ): Promise<OntologyDomainRow | null>;

  createNodeType(input: OntologyNodeTypeInput): Promise<OntologyNodeTypeRow>;
  listNodeTypes(companyId: string, domainId: string): Promise<OntologyNodeTypeRow[]>;
  updateNodeType(
    companyId: string,
    nodeTypeId: string,
    update: OntologyNodeTypeUpdate,
  ): Promise<OntologyNodeTypeRow | null>;

  createRelationType(input: OntologyRelationTypeInput): Promise<OntologyRelationTypeRow>;
  listRelationTypes(companyId: string, domainId: string): Promise<OntologyRelationTypeRow[]>;
  updateRelationType(
    companyId: string,
    relationTypeId: string,
    update: OntologyRelationTypeUpdate,
  ): Promise<OntologyRelationTypeRow | null>;

  getGraphSnapshot(companyId: string, domainId: string, nodeLimit?: number): Promise<GraphSnapshot>;

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

  writeAuditLog(input: OntologyAuditLogInput): Promise<OntologyAuditLogRow>;
  listAuditLogs(companyId: string, domainId: string, limit?: number): Promise<OntologyAuditLogRow[]>;
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
  private readonly db: PluginDatabaseClient;
  private readonly ns: string;

  constructor(db: PluginDatabaseClient) {
    this.db = db;
    this.ns = db.namespace;
  }

  private table(name: string): string {
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
      `SELECT id, company_id, domain_id, source_node_id, target_node_id, relation_key, weight
         FROM ${this.table("ontology_edges")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
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
    "is_built_in, forked_from, lifecycle_state, bootstrap_source, seed_schema_version";

  private static readonly NODE_COLS =
    "id, company_id, domain_id, node_type_id, key, label, lifecycle_state, version";

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
    "id, company_id, domain_id, key, display_name, description";

  async createNodeType(input: OntologyNodeTypeInput): Promise<OntologyNodeTypeRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_node_types")}
         (id, company_id, domain_id, key, display_name, description, properties_schema, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.key,
        input.displayName,
        input.description ?? null,
        JSON.stringify(input.propertiesSchema ?? {}),
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyNodeTypeRow>(
      `SELECT ${PostgresGraphStore.NODE_TYPE_COLS}
         FROM ${this.table("ontology_node_types")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
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
    const res = await this.db.execute(
      `UPDATE ${this.table("ontology_node_types")}
          SET display_name      = COALESCE($3, display_name),
              description        = CASE WHEN $4::boolean THEN $5 ELSE description END,
              properties_schema  = CASE WHEN $6::boolean THEN $7::jsonb ELSE properties_schema END,
              metadata           = CASE WHEN $8::boolean THEN $9::jsonb ELSE metadata END,
              updated_at         = now()
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
      ],
    );
    if (res.rowCount === 0) return null;
    const rows = await this.db.query<OntologyNodeTypeRow>(
      `SELECT ${PostgresGraphStore.NODE_TYPE_COLS}
         FROM ${this.table("ontology_node_types")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, nodeTypeId],
    );
    return rows[0] ?? null;
  }

  private static readonly RELATION_TYPE_COLS =
    "id, company_id, domain_id, key, display_name, description, directed, cardinality";

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
    return rows[0] ?? null;
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
    }>(
      `SELECT id, key, label, node_type_id
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
    }>(
      `SELECT id, source_node_id, target_node_id, relation_key, weight
         FROM ${this.table("ontology_edges")}
        WHERE company_id = $1 AND domain_id = $2
        ORDER BY created_at ASC
        LIMIT $3`,
      [companyId, domainId, limit],
    );

    return {
      domainId,
      counts: {
        nodeTypes: Number(counts.node_types),
        relationTypes: Number(counts.relation_types),
        nodes: Number(counts.nodes),
        edges: Number(counts.edges),
      },
      nodes: nodeRows.map((n) => ({ id: n.id, key: n.key, label: n.label, nodeTypeId: n.node_type_id })),
      edges: edgeRows.map((e) => ({
        id: e.id,
        sourceNodeId: e.source_node_id,
        targetNodeId: e.target_node_id,
        relationKey: e.relation_key,
        weight: Number(e.weight),
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
    return this.db.query<OntologyAuditLogRow>(
      `SELECT id, company_id, domain_id, event_type, entity_id, actor, event_at
         FROM ${this.table("ontology_audit_logs")}
        WHERE company_id = $1 AND domain_id = $2
        ORDER BY event_at DESC
        LIMIT $3`,
      [companyId, domainId, capped],
    );
  }
}
