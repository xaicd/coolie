/**
 * A PostgreSQL client for the ontology, with no application in front of it.
 *
 * This is the piece that makes "the core runs on its own" more than a claim:
 * `GraphStore` talks to `SqlClient`, and until now the only implementation of
 * that port belonged to the Paperclip host. This one is a `pg` pool, so the
 * ontology can be served from a database that has never heard of Paperclip.
 *
 * `namespace` is the schema the tables live in. The plugin puts them in a
 * host-derived schema (`plugin_ontology_…`); a standalone deployment owns the
 * database and uses `public`.
 *
 * The pool is typed structurally rather than through `@types/pg`: this module
 * needs two methods, and depending on a types package to describe them would be
 * more coupling than the code it describes.
 */

import type { SqlClient } from "@paperclipai/ontology-core/graph/SqlClient.js";
import type { TransactionalSqlClient } from "@paperclipai/ontology-core/migrate/runner.js";

/** The slice of a `pg` pool this module uses. */
export interface PgQueryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
  end(): Promise<void>;
  /**
   * A dedicated connection, for the one caller that needs one: `pg` checks out a
   * connection per query, so `BEGIN` through the pool would land on a different
   * connection than the statements it is meant to wrap.
   */
  connect?(): Promise<PgConnection>;
}

export interface PgConnection {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
  release(): void;
}

export interface PgSqlClientOptions {
  /** A `pg` Pool (or anything shaped like one). */
  pool: PgQueryable;
  /** Schema the ontology tables live in. Defaults to `public`. */
  namespace?: string;
}

export function createPgSqlClient(
  options: PgSqlClientOptions,
): TransactionalSqlClient & { close(): Promise<void> } {
  const namespace = options.namespace ?? "public";
  const on = (target: PgQueryable | PgConnection): SqlClient => ({
    namespace,
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const result = await target.query(sql, params);
      return result.rows as T[];
    },
    async execute(sql: string, params: unknown[] = []): Promise<{ rowCount: number }> {
      const result = await target.query(sql, params);
      return { rowCount: result.rowCount ?? 0 };
    },
  });

  return {
    ...on(options.pool),
    /**
     * Run `fn` on one connection inside a transaction.
     *
     * Migrations are the caller: a half-applied file is worse than a failed one,
     * and a pool hands each statement its own connection unless asked not to.
     */
    async withTransaction<T>(fn: (client: SqlClient) => Promise<T>): Promise<T> {
      if (!options.pool.connect) return fn(on(options.pool));
      const connection = await options.pool.connect();
      try {
        await connection.query("BEGIN");
        const result = await fn(on(connection));
        await connection.query("COMMIT");
        return result;
      } catch (error) {
        await connection.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        connection.release();
      }
    },
    close: () => options.pool.end(),
  };
}
