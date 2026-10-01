import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Coolie fork — wave250: Palantir Ontology primitive #7 — Branch.
 *
 * A `Branch` is a fork of one Type into a child Type under a named strategy
 * (think "Issue → SandboxIssue (strategy=sandbox)"). The primary agent picks
 * a Branch when dispatching work so a request lands on the right sibling
 * type — `dev` runs on the live issue, `sandbox` runs on a copy, `prod` runs
 * the promotion.
 *
 * Notes:
 * - `branchingStrategy` is plain text rather than an enum because plugin
 *   authors will add strategies (sandbox, ephemeral, replay, canary, ...)
 *   over time and we don't want a schema migration per addition.
 * - `parentType`/`childType` name Types by their `type_key` (the column from
 *   `ontology_types`). The strings stay readable to operators inspecting
 *   rows by hand; the migration ensures both resolve at insert time via a
 *   NOT VALID FK check that the API layer re-validates on every read.
 * - `metadata` carries per-branch knobs (TTL, copy-verb, replica count) as
 *   free-form jsonb; the schema is intentionally permissive because branch
 *   strategies grow new knobs faster than we can keep migrations current.
 */
export const ontologyBranches = pgTable(
  "ontology_branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    parentType: text("parent_type").notNull(),
    childType: text("child_type").notNull(),
    branchingStrategy: text("branching_strategy").notNull(),
    parentObjectId: uuid("parent_object_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ontology_branches_company_parent_idx").on(table.companyId, table.parentType),
    index("ontology_branches_company_strategy_idx").on(
      table.companyId,
      table.branchingStrategy,
    ),
  ],
);

export type OntologyBranchRow = typeof ontologyBranches.$inferSelect;
export type OntologyBranchInsert = typeof ontologyBranches.$inferInsert;
