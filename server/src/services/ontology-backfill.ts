import { sql, eq, type SQL } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { entityRelations } from "@paperclipai/db";
import type {
  EntityRelationKind,
  OntologyBackfillBucket,
  OntologyBackfillResponse,
} from "@paperclipai/shared";

/**
 * Ontology backfill (wave155) — derive the link rows a company's existing data
 * already implies.
 *
 * wave154 wrote these same inferences once, inside migration 9010, so a database
 * caught at that point is already linked. This service exists for everything the
 * migration could not cover: rows created *after* it ran (before the runtime
 * hooks were wired), and a re-run after a repair. It is the same inference, made
 * callable.
 *
 * Idempotent by construction: every statement is an `INSERT ... SELECT ... ON
 * CONFLICT DO NOTHING` against `entity_relations_edge_uq`, so running it twice
 * inserts nothing the second time and the report shows zeros rather than
 * duplicate edges. `RETURNING id` is what makes the count honest — it counts
 * rows the database actually accepted, not rows it scanned.
 *
 * Company-scoped at the source: each `SELECT` filters on `i.company_id =
 * ${companyId}`, and every projected `company_id` is that same column, so a
 * backfill can never copy a row into another company's graph.
 */

interface BackfillStep {
  relation: EntityRelationKind;
  statement: (companyId: string) => SQL;
}

const STEPS: BackfillStep[] = [
  {
    // issue → project (containment; strongest link).
    relation: "belongs_to",
    statement: (companyId) => sql`
      INSERT INTO entity_relations (company_id, src_type, src_id, relation, target_type, target_id, weight)
      SELECT i.company_id, 'issue', i.id, 'belongs_to', 'project', i.project_id, 3
      FROM issues i
      WHERE i.company_id = ${companyId} AND i.project_id IS NOT NULL
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
  },
  {
    // spec → project. A spec-bearing issue (spec_kind not null) is also a spec
    // node, and that node belongs to the same project as its issue.
    relation: "belongs_to",
    statement: (companyId) => sql`
      INSERT INTO entity_relations (company_id, src_type, src_id, relation, target_type, target_id, weight)
      SELECT i.company_id, 'spec', i.id, 'belongs_to', 'project', i.project_id, 2
      FROM issues i
      WHERE i.company_id = ${companyId} AND i.spec_kind IS NOT NULL AND i.project_id IS NOT NULL
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
  },
  {
    // spec → spec (the development chain: a task's spec.parentSpecId names its
    // design issue, the design's names the requirement/bugfix it answers).
    relation: "derived_from",
    statement: (companyId) => sql`
      INSERT INTO entity_relations (company_id, src_type, src_id, relation, target_type, target_id, weight)
      SELECT i.company_id, 'spec', i.id, 'derived_from', 'spec', (i.spec->>'parentSpecId')::uuid, 2
      FROM issues i
      WHERE i.company_id = ${companyId}
        AND i.spec_kind IS NOT NULL
        AND i.spec IS NOT NULL
        AND NULLIF(i.spec->>'parentSpecId', '') IS NOT NULL
        AND (i.spec->>'parentSpecId') ~ '^[0-9a-fA-F-]{36}$'
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
  },
  {
    // work_product → issue.
    relation: "attached_to",
    statement: (companyId) => sql`
      INSERT INTO entity_relations (company_id, src_type, src_id, relation, target_type, target_id, weight)
      SELECT w.company_id, 'work_product', w.id, 'attached_to', 'issue', w.issue_id, 2
      FROM issue_work_products w
      WHERE w.company_id = ${companyId}
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
  },
  {
    // attachment → issue.
    relation: "attached_to",
    statement: (companyId) => sql`
      INSERT INTO entity_relations (company_id, src_type, src_id, relation, target_type, target_id, weight)
      SELECT a.company_id, 'attachment', a.id, 'attached_to', 'issue', a.issue_id, 2
      FROM issue_attachments a
      WHERE a.company_id = ${companyId}
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
  },
  {
    // conversation → project (when the conversation carries a project context).
    relation: "belongs_to",
    statement: (companyId) => sql`
      INSERT INTO entity_relations (company_id, src_type, src_id, relation, target_type, target_id, weight)
      SELECT c.company_id, 'conversation', c.id, 'belongs_to', 'project', c.project_id, 2
      FROM board_conversations c
      WHERE c.company_id = ${companyId} AND c.project_id IS NOT NULL
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
  },
  {
    // issue → conversation: a conversation is anchored on an issue, so that
    // issue was discussed in it.
    relation: "discussed_in",
    statement: (companyId) => sql`
      INSERT INTO entity_relations (company_id, src_type, src_id, relation, target_type, target_id, weight)
      SELECT c.company_id, 'issue', c.issue_id, 'discussed_in', 'conversation', c.id, 1
      FROM board_conversations c
      WHERE c.company_id = ${companyId} AND c.issue_id IS NOT NULL
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
  },
  {
    // issue → agent (ownership). This is the edge the `agent_dashboard` view
    // walks; it was absent in wave154 because nothing named an agent node yet.
    relation: "assigned_to",
    statement: (companyId) => sql`
      INSERT INTO entity_relations (company_id, src_type, src_id, relation, target_type, target_id, weight)
      SELECT i.company_id, 'issue', i.id, 'assigned_to', 'agent', i.assignee_agent_id, 2
      FROM issues i
      WHERE i.company_id = ${companyId} AND i.assignee_agent_id IS NOT NULL
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
  },
];

export function ontologyBackfillService(db: Db) {
  async function totalRelations(companyId: string): Promise<number> {
    const rows = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(entityRelations)
      .where(eq(entityRelations.companyId, companyId));
    return rows[0]?.value ?? 0;
  }

  /**
   * Run every inference for one company. Returns per-relation inserted counts so
   * the caller can see how much of an existing company was not yet a graph.
   */
  async function backfill(companyId: string): Promise<OntologyBackfillResponse> {
    const buckets: OntologyBackfillBucket[] = [];
    for (const step of STEPS) {
      const result = await db.execute(step.statement(companyId));
      const inserted = Array.from(result).length;
      const existing = buckets.find((bucket) => bucket.relation === step.relation);
      if (existing) existing.inserted += inserted;
      else buckets.push({ relation: step.relation, inserted });
    }

    return {
      companyId,
      buckets,
      totalInserted: buckets.reduce((sum, bucket) => sum + bucket.inserted, 0),
      totalRelations: await totalRelations(companyId),
    };
  }

  return { backfill };
}

export type OntologyBackfillService = ReturnType<typeof ontologyBackfillService>;
