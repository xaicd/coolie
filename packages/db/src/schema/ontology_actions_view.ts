import { sql } from "drizzle-orm";
import { pgView, text, uuid, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Coolie fork — wave250: Palantir Ontology primitive #5 — Action (view).
 *
 * An `Action` is anything the system did, is doing, or has been asked to do.
 * There is no single table — actions are scattered across the schema based on
 * which subsystem owns the lifecycle. This view unions them into the one
 * shape the ontology expects:
 *
 *   { id, action_type, actor_id, subject_id, status, props, company_id, created_at }
 *
 * Sources:
 * - `issues` (action_type = 'issue'): the act of authoring/raising an issue.
 * - `issue_recovery_actions` (action_type = 'recovery'): an autonomous repair
 *   the agent issued on a failing issue.
 * - `tool_action_deliveries` (action_type = 'tool_action'): a tool call that
 *   needed approval and was delivered to a thread.
 *
 * The view is read-only by design — Action is the audit-layer projection,
 * not a destination table. Drizzle's `pgView` types the columns so a query
 * builder sees the union shape, but writes still go to the source tables.
 */
export const ontologyActionsView = pgView("ontology_actions_view", {
  id: text("id").notNull(),
  actionType: text("action_type").notNull(),
  actorId: text("actor_id"),
  subjectId: text("subject_id"),
  status: text("status").notNull(),
  props: jsonb("props"),
  companyId: uuid("company_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}).existing();

export type OntologyActionRow = {
  id: string;
  actionType: string;
  actorId: string | null;
  subjectId: string | null;
  status: string;
  props: unknown;
  companyId: string;
  createdAt: Date;
};
