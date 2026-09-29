import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Coolie fork — wave152: governance audit trail.
 *
 * `activity_log` is a feed: it says something happened and is read as an in-app
 * timeline. This table is the governance record — who changed which governed
 * object, from what, to what. `before`/`after` hold only the changed fields.
 *
 * `actorAgentId` intentionally has no foreign key so a row keeps naming the
 * actor after that agent is deleted.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id"),
    actorAgentId: uuid("actor_agent_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyTargetIdx: index("audit_log_company_target_idx").on(
      table.companyId,
      table.targetType,
      table.targetId,
    ),
    companyActionCreatedIdx: index("audit_log_company_action_created_idx").on(
      table.companyId,
      table.action,
      table.createdAt,
    ),
  }),
);
