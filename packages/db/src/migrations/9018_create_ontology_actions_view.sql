-- Coolie fork — wave250: Palantir Ontology primitive #5 — Action (view).
--
-- Action is the union of everything the system did, is doing, or has been
-- asked to do. There is no single table — actions are scattered across the
-- schema based on which subsystem owns the lifecycle. This view UNIONs them
-- into the one shape the ontology expects:
--
--   { id, action_type, actor_id, subject_id, status, props, company_id, created_at }
--
-- Sources (must match `OntologyActionRow` in `ontology_actions_view.ts`):
--
--   * `issues` (action_type = 'issue') — the act of authoring/raising an
--     issue. `actor_id` is the authoring agent or user; `subject_id` is the
--     issue itself; `props` carries `{ title, projectId, kind }`.
--
--   * `issue_recovery_actions` (action_type = 'recovery') — an autonomous
--     repair the agent issued on a failing issue. `actor_id` is the owner
--     agent; `subject_id` is the source issue; `props` carries
--     `{ kind, cause, fingerprint, nextAction }`.
--
--   * `tool_action_deliveries` (action_type = 'tool_action') — a tool call
--     that needed approval and was delivered to a thread. `actor_id` is the
--     deciding agent or user (resolved from the linked tool_action_request
--     when needed); `subject_id` is the issue; `props` carries
--     `{ interactionId, actionRequestId, deliveredAt }`.
--
-- The view is read-only by design — Action is the audit-layer projection.
-- Drizzle's `pgView` types the columns; writes still go to the source
-- tables. `CREATE OR REPLACE VIEW` makes the migration idempotent: a re-run
-- against a database that already has the view is a no-op rather than a
-- "view already exists" error.

CREATE OR REPLACE VIEW "ontology_actions_view" AS
SELECT
  i."id"::text AS "id",
  'issue'::text AS "action_type",
  COALESCE(i."created_by_agent_id"::text, i."created_by_user_id") AS "actor_id",
  i."id"::text AS "subject_id",
  i."status" AS "status",
  jsonb_build_object(
    'title', i."title",
    'projectId', i."project_id",
    'kind', i."kind"
  ) AS "props",
  i."company_id" AS "company_id",
  i."created_at" AS "created_at"
FROM "issues" i
UNION ALL
SELECT
  r."id"::text AS "id",
  'recovery'::text AS "action_type",
  r."owner_agent_id"::text AS "actor_id",
  r."source_issue_id"::text AS "subject_id",
  r."status" AS "status",
  jsonb_build_object(
    'kind', r."kind",
    'cause', r."cause",
    'fingerprint', r."fingerprint",
    'nextAction', r."next_action",
    'attemptCount', r."attempt_count"
  ) AS "props",
  r."company_id" AS "company_id",
  r."created_at" AS "created_at"
FROM "issue_recovery_actions" r
UNION ALL
SELECT
  d."action_request_id"::text AS "id",
  'tool_action'::text AS "action_type",
  NULL::text AS "actor_id",
  d."issue_id"::text AS "subject_id",
  CASE WHEN d."delivered_at" IS NULL THEN 'pending'::text ELSE 'delivered'::text END AS "status",
  jsonb_build_object(
    'interactionId', d."interaction_id",
    'actionRequestId', d."action_request_id",
    'deliveredAt', d."delivered_at",
    'createdAt', d."created_at"
  ) AS "props",
  d."company_id" AS "company_id",
  d."created_at" AS "created_at"
FROM "tool_action_deliveries" d;
