import {
  agents,
  boardConversations,
  companies,
  entityRelations,
  issueAttachments,
  issueComments,
  issueWorkProducts,
  issues,
  ontologyProperties,
  projects,
} from "@paperclipai/db";
import type { Db } from "@paperclipai/db";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  EntityType,
  OntologyInstanceRow,
  OntologyInstancesResponse,
  OntologyPropertyEntry,
  OntologyPropertiesResponse,
  OntologyPropertiesUpdate,
} from "@paperclipai/shared";

/**
 * Coolie fork — wave239: ontology instances + type-property CRUD.
 *
 * The graph service (wave154) models *links* between objects. Wave239's
 * 屏 2 (instance graph) and 屏 3 (schema editor) need two new read shapes
 * on top of it:
 *
 *   1. listInstances(companyId, entityType, ownerId?)
 *      Hydrate one entity-type's rows with a label and (when applicable)
 *      an owner pulled from the `assigned_to` edge. Used by 屏 2.
 *   2. getProperties / updateProperties(companyId, typeId)
 *      Read/write the jsonb property list for a single type. Used by 屏 3.
 *
 * Both share the existing company-isolation rules: every read filters by
 * `companyId`, every write goes through `assertCompanyAccess` in the route
 * (this service is the resolver, not the gate).
 *
 * Out of scope: the actual `ontology_node_types` table lives inside the
 * ontology plugin's database; we mirror its typeId into `ontology_properties`
 * without a hard FK so the plugin can evolve independently.
 */

const ENTITY_TABLE = {
  company: companies,
  project: projects,
  issue: issues,
  // spec shares id with its issue (wave154); the spec editor only sees issues
  // through `getProperties`, not this listing. Surfacing specs as instances
  // would double-count, so 屏 2 does not allow entityType=spec.
  spec: null,
  conversation: boardConversations,
  work_product: issueWorkProducts,
  attachment: issueAttachments,
  comment: issueComments,
  agent: agents,
} as const satisfies Partial<Record<EntityType, unknown>>;

const ENTITY_LABEL_COLUMN = {
  company: "name",
  project: "name",
  issue: "title",
  spec: null,
  conversation: "title",
  work_product: "title",
  attachment: "filename",
  comment: "body",
  agent: "name",
} as const satisfies Partial<Record<EntityType, string | null>>;

/**
 * Resolve one entity-type's rows for a company. `limit` / `offset` are
 * already validated by the route schema (1..200 / 0..10000).
 *
 * The function never 404s: an unknown entityType is rejected by the
 * schema; an entityType with no backing table (e.g. `spec`) returns an
 * empty result rather than crashing the caller.
 */
export function ontologyInstancesService(db: Db) {
  return {
    async listInstances(input: {
      companyId: string;
      entityType: EntityType;
      ownerId?: string;
      limit: number;
      offset: number;
    }): Promise<OntologyInstancesResponse> {
      const table = ENTITY_TABLE[input.entityType] as
        | typeof projects
        | typeof issues
        | typeof agents
        | null;
      const labelColumn = ENTITY_LABEL_COLUMN[input.entityType];

      if (!table || !labelColumn) {
        return {
          companyId: input.companyId,
          entityType: input.entityType,
          totalCount: 0,
          instances: [],
        };
      }

      // Owner filter: pull the `assigned_to` edges first so we know which
      // ids to include. The edge list is bounded by the company's full edge
      // count but already capped by the graph service's MAX_NODES limit.
      //
      // Direction matters: an edge stored as `src=agent, relation=assigned_to,
      // target=project` means "the agent OWNS the project". The App's 屏 2
      // passes `ownerId` to mean "the entity that owns this row" (an agent).
      // For non-agent entityTypes, ownerId is the agent and the rows we want
      // are on the *target* side. For `entityType === "agent"`, ownerId is
      // the agent itself and the rows we want are on the *src* side.
      let ownerFilteredIds: Set<string> | null = null;
      if (input.ownerId) {
        const edges =
          input.entityType === "agent"
            ? await db
                .select({ id: entityRelations.srcId })
                .from(entityRelations)
                .where(
                  and(
                    eq(entityRelations.companyId, input.companyId),
                    eq(entityRelations.targetType, "agent"),
                    eq(entityRelations.targetId, input.ownerId),
                    eq(entityRelations.relation, "assigned_to"),
                  ),
                )
            : await db
                .select({ id: entityRelations.targetId })
                .from(entityRelations)
                .where(
                  and(
                    eq(entityRelations.companyId, input.companyId),
                    eq(entityRelations.targetType, input.entityType),
                    eq(entityRelations.relation, "assigned_to"),
                    sql`${entityRelations.srcId}::text = ${input.ownerId}`,
                  ),
                );
        ownerFilteredIds = new Set(edges.map((e) => e.id));
        if (ownerFilteredIds.size === 0) {
          return {
            companyId: input.companyId,
            entityType: input.entityType,
            totalCount: 0,
            instances: [],
          };
        }
      }

      // Build the row query. Every table in ENTITY_TABLE has a `company_id`
      // column (verified by the FK on entityRelations' `company_id` route
      // already). `desc(id)` gives a stable "newest first" order without
      // adding an `updated_at` dependency that some tables lack.
      const companyIdCol = (table as unknown as { companyId: unknown }).companyId;
      const idCol = (table as unknown as { id: unknown }).id;
      const labelCol = (table as unknown as Record<string, unknown>)[labelColumn];

      const where = and(
        eq(companyIdCol as never, input.companyId),
        ownerFilteredIds
          ? inArray(idCol as never, Array.from(ownerFilteredIds))
          : sql`true`,
      );

      const rows = await db
        .select({ id: idCol as never, label: labelCol as never })
        .from(table as never)
        .where(where)
        .orderBy(desc(idCol as never))
        .limit(input.limit)
        .offset(input.offset);

      const totalRow = await db
        .select({ n: count() })
        .from(table as never)
        .where(where as never);
      const totalCount: number = Number((totalRow[0] as { n?: unknown } | undefined)?.n ?? 0);

      // Hydrate owner labels in one batched query, when at least one row
      // has an assigned_to edge. This is best-effort — rows with no owner
      // simply return null.
      const ownerByTargetId = new Map<string, { ownerId: string; ownerLabel: string }>();
      const targetIds = rows.map((r) => (r as { id: string }).id);
      if (targetIds.length > 0) {
        const ownerEdges = await db
          .select({
            targetId: entityRelations.targetId,
            ownerId: entityRelations.srcId,
            ownerName: agents.name,
          })
          .from(entityRelations)
          .leftJoin(agents, eq(agents.id, entityRelations.srcId))
          .where(
            and(
              eq(entityRelations.companyId, input.companyId),
              eq(entityRelations.targetType, input.entityType),
              eq(entityRelations.relation, "assigned_to"),
              inArray(entityRelations.targetId, targetIds),
            ),
          );
        for (const e of ownerEdges) {
          ownerByTargetId.set(e.targetId, {
            ownerId: e.ownerId,
            ownerLabel: e.ownerName ?? e.ownerId,
          });
        }
      }

      const labelFromRow = (raw: unknown): string => {
        if (typeof raw !== "string" || raw.trim().length === 0) return "(未命名)";
        return raw.length > 80 ? `${raw.slice(0, 80)}…` : raw;
      };

      const instances: OntologyInstanceRow[] = rows.map((r) => {
        const id = (r as { id: string }).id;
        const owner = ownerByTargetId.get(id) ?? null;
        return {
          id,
          label: labelFromRow((r as { label: unknown }).label),
          ownerId: owner?.ownerId ?? null,
          ownerLabel: owner?.ownerLabel ?? null,
          metadata: {},
        };
      });

      return {
        companyId: input.companyId,
        entityType: input.entityType,
        totalCount,
        instances,
      };
    },
  };
}

/**
 * Read/write the per-type property list (wave239 屏 3).
 *
 * The route performs assertBoard + assertCompanyAccess before calling
 * these. PATCH is upsert: when no row exists yet, a new one is inserted
 * with `schemaVersion: 1`. Subsequent updates bump `schemaVersion` so a
 * future listener (board changes feed) can replay without diffing.
 */
export function ontologyPropertiesService(db: Db) {
  return {
    async getProperties(input: { companyId: string; typeId: string }): Promise<OntologyPropertiesResponse> {
      const [row] = await db
        .select()
        .from(ontologyProperties)
        .where(
          and(
            eq(ontologyProperties.companyId, input.companyId),
            eq(ontologyProperties.typeId, input.typeId),
          ),
        )
        .limit(1);
      if (!row) {
        return {
          companyId: input.companyId,
          typeId: input.typeId,
          properties: [],
          schemaVersion: 0,
          updatedAt: new Date(0).toISOString(),
        };
      }
      return {
        companyId: input.companyId,
        typeId: input.typeId,
        properties: row.properties,
        schemaVersion: row.schemaVersion,
        updatedAt: row.updatedAt.toISOString(),
      };
    },

    async updateProperties(input: {
      companyId: string;
      typeId: string;
      update: OntologyPropertiesUpdate;
    }): Promise<OntologyPropertiesResponse> {
      const sanitized: OntologyPropertyEntry[] = dedupeProperties(input.update.properties);

      const [existing] = await db
        .select({ id: ontologyProperties.id, v: ontologyProperties.schemaVersion })
        .from(ontologyProperties)
        .where(
          and(
            eq(ontologyProperties.companyId, input.companyId),
            eq(ontologyProperties.typeId, input.typeId),
          ),
        )
        .limit(1);

      if (existing) {
        const next = await db
          .update(ontologyProperties)
          .set({
            properties: sanitized,
            schemaVersion: existing.v + 1,
            updatedAt: new Date(),
          })
          .where(eq(ontologyProperties.id, existing.id))
          .returning();
        return shapeResponse(input.companyId, input.typeId, next[0]);
      }

      const inserted = await db
        .insert(ontologyProperties)
        .values({
          companyId: input.companyId,
          typeId: input.typeId,
          properties: sanitized,
          schemaVersion: 1,
        })
        .returning();
      return shapeResponse(input.companyId, input.typeId, inserted[0]);
    },
  };
}

function dedupeProperties(entries: OntologyPropertyEntry[]): OntologyPropertyEntry[] {
  const seen = new Map<string, OntologyPropertyEntry>();
  for (const entry of entries) {
    // Last write wins on duplicate keys — the App validates the list in
    // memory before PATCH, so this is purely defensive.
    seen.set(entry.key, entry);
  }
  return Array.from(seen.values());
}

function shapeResponse(
  companyId: string,
  typeId: string,
  row:
    | {
        properties: OntologyPropertyEntry[];
        schemaVersion: number;
        updatedAt: Date;
      }
    | undefined,
): OntologyPropertiesResponse {
  if (!row) {
    return {
      companyId,
      typeId,
      properties: [],
      schemaVersion: 0,
      updatedAt: new Date(0).toISOString(),
    };
  }
  return {
    companyId,
    typeId,
    properties: row.properties,
    schemaVersion: row.schemaVersion,
    updatedAt: row.updatedAt.toISOString(),
  };
}
