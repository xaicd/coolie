/**
 * The database port the ontology core is written against.
 *
 * This exists to keep the core liftable. `GraphStore` — the schema, fact,
 * mapping and query services over the ontology tables — is meant to become a
 * standalone service later without a rewrite ("现在写的 Core 就是未来独立服务的
 * 代码"). It was taking the host's `PluginDatabaseClient` directly, which made
 * the core depend on Paperclip for one type that only ever exposed three
 * members: the namespace, `query` and `execute`.
 *
 * Depending on this port instead means:
 *
 *   - nothing in the core imports the plugin SDK, so the core has no opinion
 *     about Paperclip at all;
 *   - any PostgreSQL client satisfies it structurally — the host's client, a
 *     `pg` pool in a standalone deployment, PGlite in tests;
 *   - the tenant is the only thing a caller threads in (`companyId` on every
 *     call), which is the other half of the rule: the ontology belongs to a
 *     tenant, never to a job, a role or a session.
 *
 * `namespace` is the schema the tables live in. A standalone deployment would
 * pass `public` and stay a drop-in.
 */
export interface SqlClient {
  /** Host-derived PostgreSQL schema name for the plugin's tables. */
  namespace: string;
  /** A restricted SELECT (the host whitelists its namespace and core tables). */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** A restricted INSERT, UPDATE or DELETE. */
  execute(sql: string, params?: unknown[]): Promise<{ rowCount: number }>;
}
