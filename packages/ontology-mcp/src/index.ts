/**
 * `@paperclipai/ontology-mcp` — the ontology served over MCP, on its own.
 *
 * The tools come from `@paperclipai/ontology-core`, derived from the API
 * contract, so this package is a transport and nothing else:
 *
 *   ontology-core   the services (schema, facts, mapping, query) over a SqlClient
 *   ontology-mcp    this: those services as MCP tools over stdio
 *
 * It talks to a database directly. That is the whole point — an agent should get
 * the business map even when the task system is down or mid-upgrade.
 */

export { createOntologyMcpServer } from "./server.js";
export type { OntologyMcpOptions, OntologyMcpServer } from "./server.js";
export { createPgSqlClient } from "./sqlClient.js";
export type { PgQueryable, PgSqlClientOptions } from "./sqlClient.js";
export { readOntologyMcpConfig } from "./config.js";
export type { OntologyMcpConfig } from "./config.js";
