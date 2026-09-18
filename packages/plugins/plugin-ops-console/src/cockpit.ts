/**
 * What the ops console reads, and the pure arithmetic that turns it into rows.
 *
 * Split from the worker so the folding is testable without a database, and so
 * the queries are ordinary exported strings a test can inspect: the guard that
 * matters for this plugin is not "does it compute the right number" but "is the
 * scope of this read what we said it is".
 *
 * Scope, stated once: these reads span every company on the instance. They are
 * cross-company on purpose, and the gate that makes that acceptable is the
 * host's — a plugin data request without a `companyId` requires an instance
 * admin (`assertPluginBridgeScope`, server/src/routes/plugins.ts:728-732).
 * Nothing here should ever be reached with `companyId` supplied but ignored:
 * if this console is ever opened up to non-admins, the read must be rewritten to
 * be per-company, not merely filtered afterwards.
 */

/** The four statuses we can be sure about, from ISSUE_STATUSES. */
const CLOSED_ISSUE_STATUSES = ["done", "cancelled"] as const;

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface CompanyRow {
  id: string;
  name: string;
  status: string;
}

export interface AgentAggregateRow {
  company_id: string;
  agent_count: number | string;
  budget_cents: number | string;
  spent_cents: number | string;
  last_heartbeat_at: string | null;
}

export interface IssueStatusRow {
  company_id: string;
  status: string;
  count: number | string;
}

export interface RunAggregateRow {
  company_id: string;
  running: number | string;
  last_started_at: string | null;
}

export interface CostAggregateRow {
  company_id: string;
  cents: number | string;
  last_occurred_at: string | null;
}

export interface ApprovalAggregateRow {
  company_id: string;
  pending: number | string;
}

export interface NoteRow {
  company_id: string;
  note: string;
}

export interface ClientSummary {
  id: string;
  name: string;
  status: string;
  agents: number;
  openIssues: number;
  runningRuns: number;
  monthCostCents: number;
  budgetCents: number;
  spentCents: number;
  pendingApprovals: number;
  /** Derived — see the note on `QUERIES`: there is no activity log to read. */
  lastActivityAt: string | null;
  note: string;
}

/**
 * One query per fact, each grouped by company, so a whole instance is one round
 * of round-trips rather than one per client. Deliberately not a single giant
 * statement: a scalar per table is easy to read and easy to check.
 */
export const QUERIES = {
  companies: `SELECT id, name, status FROM companies ORDER BY name ASC`,
  agents: `SELECT company_id,
                  COUNT(*)::int AS agent_count,
                  COALESCE(SUM(budget_monthly_cents), 0)::int AS budget_cents,
                  COALESCE(SUM(spent_monthly_cents), 0)::int AS spent_cents,
                  MAX(last_heartbeat_at) AS last_heartbeat_at
             FROM agents
            GROUP BY company_id`,
  issueStatuses: `SELECT company_id, status, COUNT(*)::int AS count
                    FROM issues
                   GROUP BY company_id, status`,
  runs: `SELECT company_id,
                COUNT(*) FILTER (WHERE finished_at IS NULL)::int AS running,
                MAX(started_at) AS last_started_at
           FROM heartbeat_runs
          GROUP BY company_id`,
  cost: `SELECT company_id,
                COALESCE(SUM(cost_cents), 0)::int AS cents,
                MAX(occurred_at) AS last_occurred_at
           FROM cost_events
          WHERE occurred_at >= $1
          GROUP BY company_id`,
  approvals: `SELECT company_id, COUNT(*)::int AS pending
                FROM approvals
               WHERE status = 'pending'
               GROUP BY company_id`,
} as const;

/** The one read that lives in our own namespace. */
export function noteQuery(namespace: string): string {
  return `SELECT company_id, note FROM ${namespace}.ops_client_flags`;
}

/** The one write. Namespaced, parameterised, and idempotent by primary key. */
export function upsertNoteSql(namespace: string): string {
  return `INSERT INTO ${namespace}.ops_client_flags (company_id, note, updated_at)
          VALUES ($1, $2, now())
          ON CONFLICT (company_id) DO UPDATE
                SET note = EXCLUDED.note, updated_at = now()`;
}

function asNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Open means "not closed": an unknown status is open, not silently dropped. */
export function countOpenIssues(rows: IssueStatusRow[], companyId: string): number {
  let open = 0;
  for (const row of rows) {
    if (row.company_id !== companyId) continue;
    if ((CLOSED_ISSUE_STATUSES as readonly string[]).includes(row.status)) continue;
    open += asNumber(row.count);
  }
  return open;
}

/** The most recent of whatever timestamps we happen to have. Null when none. */
export function latestTimestamp(values: Array<string | null | undefined>): string | null {
  let best: number | null = null;
  let bestIso: string | null = null;
  for (const value of values) {
    if (!value) continue;
    const at = Date.parse(value);
    if (Number.isNaN(at)) continue;
    if (best === null || at > best) {
      best = at;
      bestIso = value;
    }
  }
  return bestIso;
}

export interface RawReads {
  companies: CompanyRow[];
  agents: AgentAggregateRow[];
  issueStatuses: IssueStatusRow[];
  runs: RunAggregateRow[];
  cost: CostAggregateRow[];
  approvals: ApprovalAggregateRow[];
  notes: NoteRow[];
}

/**
 * A company with no rows at all still gets a line, with zeroes — a client that
 * has gone quiet is exactly what an operator needs to see, and dropping it from
 * a table of clients would hide it.
 */
export function foldSummaries(raw: RawReads): ClientSummary[] {
  const byCompany = <T extends { company_id: string }>(rows: T[], id: string): T | undefined =>
    rows.find((row) => row.company_id === id);

  const notes = new Map(raw.notes.map((row) => [row.company_id, row.note]));

  return raw.companies.map((company) => {
    const agents = byCompany(raw.agents, company.id);
    const runs = byCompany(raw.runs, company.id);
    const cost = byCompany(raw.cost, company.id);
    const approvals = byCompany(raw.approvals, company.id);

    return {
      id: company.id,
      name: company.name,
      status: company.status,
      agents: asNumber(agents?.agent_count),
      openIssues: countOpenIssues(raw.issueStatuses, company.id),
      runningRuns: asNumber(runs?.running),
      monthCostCents: asNumber(cost?.cents),
      budgetCents: asNumber(agents?.budget_cents),
      spentCents: asNumber(agents?.spent_cents),
      pendingApprovals: asNumber(approvals?.pending),
      lastActivityAt: latestTimestamp([
        agents?.last_heartbeat_at,
        runs?.last_started_at,
        cost?.last_occurred_at,
      ]),
      note: notes.get(company.id) ?? "",
    };
  });
}

/** Start of the current UTC month, as the ISO string the cost query compares against. */
export function monthStartIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function readCockpit(
  db: Queryable,
  namespace: string,
  now: Date,
): Promise<ClientSummary[]> {
  const [companies, agents, issueStatuses, runs, cost, approvals, notes] = await Promise.all([
    db.query<CompanyRow>(QUERIES.companies),
    db.query<AgentAggregateRow>(QUERIES.agents),
    db.query<IssueStatusRow>(QUERIES.issueStatuses),
    db.query<RunAggregateRow>(QUERIES.runs),
    db.query<CostAggregateRow>(QUERIES.cost, [monthStartIso(now)]),
    db.query<ApprovalAggregateRow>(QUERIES.approvals),
    db.query<NoteRow>(noteQuery(namespace)),
  ]);

  return foldSummaries({ companies, agents, issueStatuses, runs, cost, approvals, notes });
}
