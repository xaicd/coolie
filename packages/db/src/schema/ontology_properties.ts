import { integer, jsonb, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Coolie fork — wave239: ontology type-level property definitions.
 *
 * The schema-editor screen (屏 3) lets a user add/remove fields on a
 * ontology type. The plugin's own `ontology_node_types.properties` column
 * lives in the plugin's database, but the App does not talk to that
 * database directly — it goes through the control plane. This table is
 * the control plane's mirror: one row per (company, type), holding the
 * property list as a jsonb array.
 *
 * Migration: `9013_add_ontology_properties.sql`.
 *
 * Design notes:
 * - `typeId` matches the UUID the ontology plugin uses for its type row
 *   (the plugin's `ontology_node_types.id`). We don't FK it because the
 *   plugin keeps its own tables and a hard cross-schema coupling is too
 *   much rope for a soft contract.
 * - `properties` is `[{ key, type, sample? }]` — matches the agy 草图's
 *   field shape (see `docs-coolie/prototypes/2026-10-01-app-ontology-5-screens.md` 屏 3).
 * - `schemaVersion` bumps on every write so a listener can replay changes
 *   without diffing the whole blob.
 */
export const ontologyProperties = pgTable(
  "ontology_properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    typeId: uuid("type_id").notNull(),
    properties: jsonb("properties").$type<OntologyPropertyEntry[]>().default([]).notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ontology_properties_company_type_uq").on(table.companyId, table.typeId),
  ],
);

export interface OntologyPropertyEntry {
  /** Field name, e.g. `displayName`, `ownerId`. Must match the regex below. */
  key: string;
  /** Display-only type label, e.g. `String` / `Enum` / `Ref` / `DateTime` / `Array`. */
  type: string;
  /** Optional example value shown to the user; not enforced. */
  sample?: string;
}

export type OntologyPropertyRow = typeof ontologyProperties.$inferSelect;
export type OntologyPropertyInsert = typeof ontologyProperties.$inferInsert;
