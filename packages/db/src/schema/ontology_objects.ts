import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Coolie fork — wave250: Palantir Ontology primitive #1 — Object.
 *
 * One row is one concrete instance of an ontology type. The classic example is
 * "issue #abc is an Object of type Issue". The control plane has been treating
 * objects as a foreign-key column on the source row (an `issue` is the issues
 * table, a `work_product` is the work_products table, an `external_object` is
 * the external_objects table); this table gives the same identity a row of its
 * own so the graph API can answer "list all objects" and "what type is this"
 * without a UNION across every source table.
 *
 * Notes:
 * - `typeId` references `ontology_types.id` (soft-FK, see that schema). The
 *   union on (company_id, type_id, external_id) is the dedupe key: an external
 *   connector can import the same object twice and we collapse on re-ingest.
 * - `props` is the free-form property bag the ontology schema editor (屏 3)
 *   defines on the type. Storing it per-row keeps the table generic — the
 *   schema is on `ontology_types`, the values are here.
 * - This table is the destination for the deprecated `external_objects` table
 *   (wave250 backfill); the old table stays read-only behind a `deprecated`
 *   alias on this schema.
 */
export const ontologyObjects = pgTable(
  "ontology_objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    typeId: uuid("type_id").notNull(),
    externalId: text("external_id").notNull(),
    displayLabel: text("display_label"),
    props: jsonb("props").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ontology_objects_company_type_idx").on(table.companyId, table.typeId),
    uniqueIndex("ontology_objects_company_type_external_uq").on(
      table.companyId,
      table.typeId,
      table.externalId,
    ),
  ],
);

export type OntologyObjectRow = typeof ontologyObjects.$inferSelect;
export type OntologyObjectInsert = typeof ontologyObjects.$inferInsert;
