/**
 * Applying the ontology's migrations, and knowing that you did.
 *
 * The migrations existed but were applied *by the host*: a plugin declares a
 * directory and Paperclip runs it. A deployment without Paperclip has nothing to
 * run them, nothing to record that it did, and — because the files name the
 * plugin's schema verbatim — no way to put the tables anywhere else.
 *
 * Three things this adds, each of which a product needs and a plugin can borrow:
 *
 *   - **a ledger.** `ontology_schema_migrations` records what was applied, when,
 *     and the checksum of the file that was applied. Without it "is this database
 *     up to date" is unanswerable, and a migration that quietly changed after
 *     being applied is invisible until it corrupts something.
 *   - **a schema that is a parameter.** The files carry the plugin's schema name
 *     because the host applies them as written; here it is substituted, so the
 *     same files install into `public` on a database the ontology owns.
 *   - **a preflight.** The older tables reference the host's tenant table. Rather
 *     than failing halfway through a foreign key, the runner says so before it
 *     starts.
 *
 * Ordering is lexicographic by filename, which is why the files are numbered.
 */

import { createHash } from "node:crypto";
import type { SqlClient } from "../graph/SqlClient.js";

/** The schema name the migration files carry, written by the host's loader. */
export const SCHEMA_TOKEN = "plugin_ontology_b62f8af3e9";

export interface MigrationFile {
  name: string;
  sql: string;
}

export interface MigrationResult {
  applied: string[];
  /** Already in the ledger, with a matching checksum. */
  skipped: string[];
  /** Files whose checksum differs from what was applied. Never silently re-run. */
  changed: Array<{ name: string; applied: string; current: string }>;
  /** The schema the tables were installed into. */
  namespace: string;
  /** False when the client cannot give the runner a real transaction. */
  transactional: boolean;
}

/**
 * A client that can also hand out a dedicated connection.
 *
 * Migrations are the one place where a half-applied file is worse than a failed
 * one, so the runner uses this when it is offered. Without it the work still
 * happens — but `transactional: false` says so rather than implying a guarantee
 * the client cannot provide.
 */
export interface TransactionalSqlClient extends SqlClient {
  withTransaction<T>(fn: (client: SqlClient) => Promise<T>): Promise<T>;
}

function isTransactional(client: SqlClient): client is TransactionalSqlClient {
  return typeof (client as Partial<TransactionalSqlClient>).withTransaction === "function";
}

export function checksum(sql: string): string {
  // The checksum is over the file *as written*, before substitution: it exists to
  // detect an edited migration, and the substitution is ours, not the author's.
  return createHash("sha256").update(sql).digest("hex").slice(0, 16);
}

/**
 * Point a migration at a schema.
 *
 * A literal replacement of the one token, not a regex over schema-like words: a
 * migration that mentions a business schema in a comment must not be rewritten.
 */
export function withNamespace(sql: string, namespace: string): string {
  return sql.split(SCHEMA_TOKEN).join(namespace);
}

/** Split a migration into statements, respecting dollar-quoted bodies. */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let dollarTag: string | null = null;
  for (let i = 0; i < sql.length; i += 1) {
    const rest = sql.slice(i);
    const tag = /^\$([A-Za-z_]*)\$/.exec(rest);
    if (tag) {
      const full = tag[0]!;
      if (dollarTag === null) dollarTag = full;
      else if (dollarTag === full) dollarTag = null;
      current += full;
      i += full.length - 1;
      continue;
    }
    if (dollarTag === null) {
      if (rest.startsWith("--")) {
        const newline = sql.indexOf("\n", i);
        i = newline === -1 ? sql.length : newline - 1;
        continue;
      }
      if (rest.startsWith("/*")) {
        const end = sql.indexOf("*/", i + 2);
        i = end === -1 ? sql.length : end + 1;
        continue;
      }
    }
    if (sql[i] === ";" && dollarTag === null) {
      statements.push(current.trim());
      current = "";
      continue;
    }
    current += sql[i];
  }
  if (current.trim() !== "") statements.push(current.trim());
  return statements.filter((statement) => statement !== "");
}

/** The ledger, created before the first migration because it has to precede it. */
async function ensureLedger(client: SqlClient, namespace: string): Promise<void> {
  await client.execute(`CREATE SCHEMA IF NOT EXISTS "${namespace}"`);
  await client.execute(
    `CREATE TABLE IF NOT EXISTS "${namespace}".ontology_schema_migrations (
       name        text PRIMARY KEY,
       checksum    text NOT NULL,
       applied_at  timestamptz NOT NULL DEFAULT now()
     )`,
  );
}

/**
 * What the ledger says has been applied.
 *
 * Exported because a caller that wants to *report* pending work must read the
 * ledger, not infer it from an empty apply — which returns nothing skipped and
 * therefore makes everything look pending.
 */
export async function appliedMigrations(
  client: SqlClient,
  namespace = client.namespace,
): Promise<Array<{ name: string; checksum: string; applied_at?: string }>> {
  await ensureLedger(client, namespace);
  return client.query(
    `SELECT name, checksum, applied_at FROM "${namespace}".ontology_schema_migrations ORDER BY name`,
  );
}

export interface MigrationPreflight {
  /**
   * Whether the isolation anchor is already here.
   *
   * False means a deployment with no host: applyMigrations will create the table
   * the object model points at. It is reported rather than acted on so an
   * operator can see which of the two situations they are in.
   */
  hostTenantTablePresent: boolean;
}

/**
 * Whether the database has what the migrations need before they run.
 *
 * This used to be a hard stop, and it was right to be one: the object model keys
 * its rows to an anchor table named companies, so a deployment without a host
 * could not create its schema at all. The runner now creates that table when it
 * is missing, so there is nothing to refuse. What is left answers the question an
 * operator actually has: is this a hosted database or a standalone one.
 */
export async function preflight(client: SqlClient): Promise<MigrationPreflight> {
  const rows = await client.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'companies'
     ) AS present`,
  );
  return { hostTenantTablePresent: rows[0]?.present === true };
}

/**
 * Create the isolation anchor the object model points at, when there is no host.
 *
 * Every table in the ontology carries a company_id, and declares it as a foreign
 * key into public.companies. Inside Paperclip that is the host's company table
 * and the key is what keeps a company's ontology to itself. A deployment with no
 * host has no such table, and the migrations are frozen (the host checksums
 * them), so the deployment is given one with the same shape.
 *
 * The name is the host's, and that is deliberate. The ontology needs a table of
 * isolation anchors and nothing more; calling it tenants would mean a second
 * identity to keep in step with the first, in a system where the company already
 * is the boundary.
 *
 * IF NOT EXISTS, so a hosted deployment keeps its real table and this is a no-op.
 */
async function ensureHostTenantStub(client: SqlClient): Promise<void> {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS public.companies (id uuid PRIMARY KEY, name text)",
  );
}

export async function applyMigrations(
  client: SqlClient,
  migrations: MigrationFile[],
  options: { namespace?: string } = {},
): Promise<MigrationResult> {
  const namespace = options.namespace ?? client.namespace;
  await ensureLedger(client, namespace);
  await ensureHostTenantStub(client);

  const ledger = await client.query<{ name: string; checksum: string }>(
    `SELECT name, checksum FROM "${namespace}".ontology_schema_migrations`,
  );
  const applied = new Map(ledger.map((row) => [row.name, row.checksum]));

  const ordered = [...migrations].sort((a, b) => a.name.localeCompare(b.name));
  const result: MigrationResult = {
    applied: [],
    skipped: [],
    changed: [],
    namespace,
    transactional: isTransactional(client),
  };

  for (const migration of ordered) {
    const sum = checksum(migration.sql);
    const prior = applied.get(migration.name);
    if (prior !== undefined) {
      if (prior === sum) result.skipped.push(migration.name);
      // Re-running an edited migration would apply a change nobody reviewed, and
      // pretending it is fine would make the ledger a lie.
      else result.changed.push({ name: migration.name, applied: prior, current: sum });
      continue;
    }

    const statements = splitStatements(withNamespace(migration.sql, namespace));
    const run = async (target: SqlClient): Promise<void> => {
      for (const statement of statements) await target.execute(statement);
      await target.execute(
        `INSERT INTO "${namespace}".ontology_schema_migrations (name, checksum) VALUES ($1, $2)`,
        [migration.name, sum],
      );
    };

    if (isTransactional(client)) await client.withTransaction(run);
    else await run(client);
    result.applied.push(migration.name);
  }

  return result;
}
