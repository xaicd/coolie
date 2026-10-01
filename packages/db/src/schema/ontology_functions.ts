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
import { plugins } from "./plugins.js";

/**
 * Coolie fork — wave250: Palantir Ontology primitive #6 — Function.
 *
 * A `Function` is a side-effecting verb an agent can invoke against the
 * ontology (the classic example is "create issue" / "transition status" /
 * "send approval"). Until now, MCP tools lived only as metadata JSON on the
 * tool catalog; this table gives them a first-class row so the ontology's
 * Function layer is real, and MCP gateways read their callable surface from
 * here instead of from a metadata blob.
 *
 * Notes:
 * - `name` is unique per company; it's what shows up as the function handle.
 * - `inputs`/`outputs` are jsonb so a Function can declare its own argument
 *   and result shapes without a schema migration every time a plugin adds one.
 * - `pluginId` is the provider that registered the function. NULL means it is
 *   defined by the control plane itself (e.g. "create issue", "transition
 *   issue status").
 */
export const ontologyFunctions = pgTable(
  "ontology_functions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().default({}).notNull(),
    outputs: jsonb("outputs").$type<Record<string, unknown>>().default({}).notNull(),
    pluginId: uuid("plugin_id").references(() => plugins.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ontology_functions_company_idx").on(table.companyId),
    uniqueIndex("ontology_functions_company_name_uq").on(table.companyId, table.name),
  ],
);

export type OntologyFunctionRow = typeof ontologyFunctions.$inferSelect;
export type OntologyFunctionInsert = typeof ontologyFunctions.$inferInsert;
