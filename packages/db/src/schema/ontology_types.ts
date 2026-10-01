import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { plugins } from "./plugins.js";

/**
 * Coolie fork — wave250: Palantir Ontology primitive #2 — Type.
 *
 * A `Type` is the schema definition for a category of Object (think class /
 * entity). The ontology plugin (`ontology_node_types`) already keeps type
 * rows in its own database; this table is the control plane's mirror so the
 * graph API can answer "list all types" without holding a second connection
 * pool to the plugin. Plugin DB remains the source of truth; this table is a
 * cache that the plugin keeps fresh via its entity sync API.
 *
 * Notes:
 * - `typeKey` is the stable, human-meaningful identifier (e.g. `issue`,
 *   `work_product`, `linear_issue`). Together with `company_id` it forms the
 *   dedupe key.
 * - `schemaRef` points at `ontology_properties.id` for the property list of
 *   this type. Soft reference because the property list lives in its own
 *   table (it can be edited independently of the type).
 * - `pluginId`/`source` describe where the row came from. `source` is free
 *   text on purpose: "internal" / "plugin:<id>" / "imported" — there is no
 *   fixed enumeration of sources yet.
 */
export const ontologyTypes = pgTable(
  "ontology_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    typeKey: text("type_key").notNull(),
    displayName: text("display_name").notNull(),
    schemaRef: uuid("schema_ref"),
    pluginId: uuid("plugin_id").references(() => plugins.id, { onDelete: "set null" }),
    source: text("source").notNull().default("internal"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ontology_types_company_idx").on(table.companyId),
    uniqueIndex("ontology_types_company_key_uq").on(table.companyId, table.typeKey),
  ],
);

export type OntologyTypeRow = typeof ontologyTypes.$inferSelect;
export type OntologyTypeInsert = typeof ontologyTypes.$inferInsert;
