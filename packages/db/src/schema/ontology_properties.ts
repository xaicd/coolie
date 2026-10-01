import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Coolie fork — wave239 / wave250: ontology type-level property definitions.
 *
 * The schema-editor screen (屏 3) lets a user add/remove fields on an
 * ontology type. The plugin's own `ontology_node_types.properties` column
 * lives in the plugin's database, but the App does not talk to that
 * database directly — it goes through the control plane. This table is
 * the control plane's mirror: one row per (company, type), holding the
 * property list as a jsonb array.
 *
 * Wave250: the Palantir Property primitive is now first-class on this
 * schema — `typeRef`, `sampleValue`, and `required` join the existing
 * `key`/`type`/`sample` pair so a property entry carries enough context
 * to drive both the schema editor (屏 3) and any future validation hook
 * without reading the plugin's database.
 *
 * Migration:
 * - `9013_add_ontology_properties.sql` created the original 5 columns.
 * - `9016_extend_ontology_properties.sql` (wave250) records the Property
 *   alignment on the README but does not change this schema's columns —
 *   the new fields are properties on each entry inside the jsonb array,
 *   not new top-level columns. The downstream change is at the entry-shape
 *   level (`OntologyPropertyEntry` below) and on the JSON column default.
 *
 * Design notes:
 * - `typeId` matches the UUID the ontology plugin uses for its type row
 *   (the plugin's `ontology_node_types.id`). We don't FK it because the
 *   plugin keeps its own tables and a hard cross-schema coupling is too
 *   much rope for a soft contract.
 * - `properties` is `[{ key, type, typeRef?, sampleValue?, sample?, required? }]`
 *   — see `OntologyPropertyEntry`. Existing rows read with `typeRef`/`required`
 *   absent (the jsonb column is forward-compatible).
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
  /**
   * Palantir-style reference to another Type (e.g. when the property's value
   * is a foreign id into another ontology type). Optional — most primitives
   * have no ref. Stores the referenced type's `type_key` for readability.
   */
  typeRef?: string;
  /**
   * Palantir `Property.sampleValue` — an example value the editor uses to
   * hint at the shape a property takes. Separate from the older `sample`
   * (which was a free-form string) so we can keep the JSON-typed preview
   * that the wave245 调研 recommended.
   */
  sampleValue?: unknown;
  /** Legacy sample-as-string. Kept for back-compat with rows written pre-wave250. */
  sample?: string;
  /** Whether the property must be set on every object of this type. */
  required?: boolean;
}

export type OntologyPropertyRow = typeof ontologyProperties.$inferSelect;
export type OntologyPropertyInsert = typeof ontologyProperties.$inferInsert;
