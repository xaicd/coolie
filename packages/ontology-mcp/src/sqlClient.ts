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

/** The slice of a `pg` pool this module uses. */
export interface PgQueryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
  end(): Promise<void>;
}

export interface PgSqlClientOptions {
  /** A `pg` Pool (or anything shaped like one). */
  pool: PgQueryable;
  /** Schema the ontology tables live in. Defaults to `public`. */
  namespace?: string;
}

export function createPgSqlClient(options: PgSqlClientOptions): SqlClient & { close(): Promise<void> } {
  const namespace = options.namespace ?? "public";
  return {
    namespace,
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const result = await options.pool.query(sql, params);
      return result.rows as T[];
    },
    async execute(sql: string, params: unknown[] = []): Promise<{ rowCount: number }> {
      const result = await options.pool.query(sql, params);
      return { rowCount: result.rowCount ?? 0 };
    },
    close: () => options.pool.end(),
  };
}
