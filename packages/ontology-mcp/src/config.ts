/**
 * Configuration for a standalone ontology MCP server.
 *
 * Read from the environment because this process is started by an agent harness
 * (DSH, Cursor, Claude Code), not by a person with a config file in hand.
 *
 * `ONTOLOGY_COMPANY_ID` is required and has no default on purpose: the server
 * answers for exactly one tenant, and a missing tenant must fail at startup
 * rather than serve the wrong company's model.
 */

export interface OntologyMcpConfig {
  databaseUrl: string;
  /** Schema the ontology tables live in. A standalone deployment owns the database. */
  namespace: string;
  /** The tenant this server answers for. */
  companyId: string;
}

export function readOntologyMcpConfig(env: NodeJS.ProcessEnv = process.env): OntologyMcpConfig {
  const databaseUrl = env.ONTOLOGY_DATABASE_URL ?? env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "Set ONTOLOGY_DATABASE_URL (or DATABASE_URL) to the PostgreSQL this ontology lives in.",
    );
  }
  const companyId = env.ONTOLOGY_COMPANY_ID;
  if (!companyId) {
    // Without it the server would have to guess, and a server that guesses which
    // company to answer for is a data leak waiting for a typo.
    throw new Error("Set ONTOLOGY_COMPANY_ID to the tenant this server answers for.");
  }
  return {
    databaseUrl,
    namespace: env.ONTOLOGY_SCHEMA ?? "public",
    companyId,
  };
}
