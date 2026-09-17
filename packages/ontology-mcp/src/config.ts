/**
 * Configuration for a standalone ontology MCP server.
 *
 * Read from the environment because this process is started by an agent harness
 * (DSH, Cursor, Claude Code), not by a person with a config file in hand.
 *
 * The tenant is **not** configuration any more. It used to be
 * `ONTOLOGY_COMPANY_ID` — a value the operator typed, which meant a typo served
 * the wrong company's model and nothing could tell. It now comes from the API
 * key: the credential names its tenant, and the server has nothing to guess.
 */

export interface OntologyMcpConfig {
  databaseUrl: string;
  /** Schema the ontology tables live in. A standalone deployment owns the database. */
  namespace: string;
  /** The bearer credential. Its tenant and roles are resolved from the database. */
  apiKey: string;
  /** Server-side pepper the key hashes were salted with. */
  keyPepper: string;
}

export function readOntologyMcpConfig(env: NodeJS.ProcessEnv = process.env): OntologyMcpConfig {
  const databaseUrl = env.ONTOLOGY_DATABASE_URL ?? env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "Set ONTOLOGY_DATABASE_URL (or DATABASE_URL) to the PostgreSQL this ontology lives in.",
    );
  }
  const apiKey = env.ONTOLOGY_API_KEY;
  if (!apiKey) {
    // Without a credential the server would have to serve *something*, and
    // serving an unnamed tenant is how one customer reads another's model.
    throw new Error(
      "Set ONTOLOGY_API_KEY to an ontology API key. The key names the tenant and its roles.",
    );
  }
  const keyPepper = env.ONTOLOGY_KEY_PEPPER;
  if (!keyPepper) {
    throw new Error(
      "Set ONTOLOGY_KEY_PEPPER to the pepper the key hashes were salted with.",
    );
  }
  return {
    databaseUrl,
    namespace: env.ONTOLOGY_SCHEMA ?? "public",
    apiKey,
    keyPepper,
  };
}
