import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Coolie fork — wave250: Palantir Ontology primitive #4 — Link.
 *
 * One row is one directed relationship between two `ontology_objects` rows.
 * This is the renamed/clarified successor of `entity_relations` (the old table
 * had `src_type`/`target_type` as plain text because it predated the
 * ontology layer; now that Object and Type are real tables, those columns
 * disappear and a Link references Object ids directly).
 *
 * Notes:
 * - `linkType` is plain text (no enum) so the ontology plugin can register new
 *   link kinds at runtime without a schema migration. `RelationVerb` in
 *   `@paperclipai/shared` enforces the vocabulary on the write path.
 * - `props` is the link's own property bag (think "since when" / "role" /
 *   "weight"). The legacy `entity_relations.metadata`/`weight` columns roll
 *   into this bag.
 * - The deprecated `entity_relations` table stays read-only; the backfill in
 *   9017 maps every `(src_type, src_id) → (target_type, target_id)` pair onto
 *   the new `ontology_objects` rows.
 */
export const ontologyLinks = pgTable(
  "ontology_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    srcObjectId: uuid("src_object_id").notNull(),
    targetObjectId: uuid("target_object_id").notNull(),
    linkType: text("link_type").notNull(),
    props: jsonb("props").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ontology_links_company_src_idx").on(table.companyId, table.srcObjectId),
    index("ontology_links_company_target_idx").on(table.companyId, table.targetObjectId),
    index("ontology_links_company_type_idx").on(table.companyId, table.linkType),
  ],
);

export type OntologyLinkRow = typeof ontologyLinks.$inferSelect;
export type OntologyLinkInsert = typeof ontologyLinks.$inferInsert;
