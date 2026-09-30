import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Coolie fork — wave154: the Ontology link layer.
 *
 * One row is one directed link between two objects in the workshop. Before this
 * table a relationship existed only as a foreign-key column on one side (an
 * issue's `project_id`, a work product's `issue_id`), so answering "what is
 * connected to this object" meant hard-coding every join. As rows, links can be
 * traversed generically: the graph API walks them, the board's Workshop view
 * draws them.
 *
 * `src_type`/`target_type` are plain text rather than enums on purpose — adding
 * a new object kind must not need a migration. The TypeScript union in
 * `@paperclipai/shared` (`EntityType`) is the enforced vocabulary on the write
 * path; the column stays permissive so old rows never break a read.
 *
 * Node identity is the PAIR `(type, id)`, never the id alone: a spec node reuses
 * its issue's id (a spec IS the issue's `spec_kind`/`spec` payload), so two
 * different nodes can share a uuid and are only distinguished by their type.
 */
export const entityRelations = pgTable(
  "entity_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    srcType: text("src_type").notNull(),
    srcId: uuid("src_id").notNull(),
    relation: text("relation").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    /** Strong links (containment) are higher; weak links (references) lower. */
    weight: integer("weight").default(1).notNull(),
    createdByUserId: text("created_by_user_id"),
    createdByAgentId: uuid("created_by_agent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("entity_relations_company_src_idx").on(table.companyId, table.srcType, table.srcId),
    index("entity_relations_company_target_idx").on(table.companyId, table.targetType, table.targetId),
    index("entity_relations_company_relation_idx").on(table.companyId, table.relation),
    // One edge per (direction, verb, pair): backfill and the comment hook can
    // both run repeatedly without duplicating a link.
    uniqueIndex("entity_relations_edge_uq").on(
      table.companyId,
      table.srcType,
      table.srcId,
      table.relation,
      table.targetType,
      table.targetId,
    ),
  ],
);
