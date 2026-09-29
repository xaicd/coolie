import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Coolie fork — wave152 (D): defect knowledge base.
 *
 * One row per (company, fingerprint). `fingerprint` is the SHA1 of a normalized
 * defect title plus its taxonomy tags, so near-identical defects collapse onto
 * one row. When `count` reaches 3 the runtime suggests a playbook (and records
 * the task it opened in `playbookTaskId`).
 *
 * `sampleIssueId` / `playbookTaskId` deliberately carry no foreign key: the KB
 * row must survive the deletion of the issue it references.
 */
export const defectKb = pgTable(
  "defect_kb",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    fingerprint: text("fingerprint").notNull(),
    count: integer("count").notNull().default(1),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
    sampleIssueId: uuid("sample_issue_id"),
    suggestedPlaybook: text("suggested_playbook"),
    playbookTaskId: uuid("playbook_task_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyFingerprintUq: uniqueIndex("defect_kb_company_fingerprint_uq").on(
      table.companyId,
      table.fingerprint,
    ),
    companyLastSeenIdx: index("defect_kb_company_last_seen_idx").on(
      table.companyId,
      table.lastSeen,
    ),
  }),
);
