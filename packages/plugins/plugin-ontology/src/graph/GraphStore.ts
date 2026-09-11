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
export interface OntologyDomainInput {
  companyId: string;
  slug: string;
  displayName: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}

export interface OntologyDomainRow {
  id: string;
  company_id: string;
  slug: string;
  display_name: string;
  description: string | null;
  status: string;
  version: number;
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
}

export interface OntologyEdgeInput {
  companyId: string;
  domainId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationTypeId?: string | null;
  relationKey?: string | null;
  weight?: number;
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
  metadata?: Record<string, unknown>;
}

export interface OntologyRelationTypeUpdate {
  displayName?: string;
  description?: string | null;
  directed?: boolean;
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
         (id, company_id, slug, display_name, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        id,
        input.companyId,
        input.slug,
        input.displayName,
        input.description ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<OntologyDomainRow>(
      `SELECT id, company_id, slug, display_name, description, status, version
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
      `SELECT id, company_id, domain_id, node_type_id, key, label
         FROM ${this.table("ontology_nodes")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async createEdge(input: OntologyEdgeInput): Promise<OntologyEdgeRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_edges")}
         (id, company_id, domain_id, relation_type_id, relation_key,
          source_node_id, target_node_id, weight, properties, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.relationTypeId ?? null,
        input.relationKey ?? null,
        input.sourceNodeId,
        input.targetNodeId,
        input.weight ?? 1,
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
    "id, company_id, slug, display_name, description, status, version";

  async listDomains(companyId: string): Promise<OntologyDomainRow[]> {
    return this.db.query<OntologyDomainRow>(
      `SELECT ${PostgresGraphStore.DOMAIN_COLS}
         FROM ${this.table("ontology_domains")}
        WHERE company_id = $1
        ORDER BY created_at ASC`,
      [companyId],
    );
  }

  async getDomain(companyId: string, domainId: string): Promise<OntologyDomainRow | null> {
    const rows = await this.db.query<OntologyDomainRow>(
      `SELECT ${PostgresGraphStore.DOMAIN_COLS}
         FROM ${this.table("ontology_domains")}
        WHERE company_id = $1 AND id = $2`,
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
    "id, company_id, domain_id, key, display_name, description, directed";

  async createRelationType(input: OntologyRelationTypeInput): Promise<OntologyRelationTypeRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("ontology_relation_types")}
         (id, company_id, domain_id, key, display_name, description, directed, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        id,
        input.companyId,
        input.domainId,
        input.key,
        input.displayName,
        input.description ?? null,
        input.directed ?? true,
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
}
