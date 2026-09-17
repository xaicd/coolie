#!/usr/bin/env node
/**
 * The standalone entry point.
 *
 *   ONTOLOGY_DATABASE_URL=postgres://… ONTOLOGY_COMPANY_ID=<uuid> ontology-mcp
 *
 * No Paperclip, no plugin host, no HTTP layer in between: an agent harness starts
 * this process, and the ontology answers from its own database.
 */
import { Pool } from "pg";
import { PostgresGraphStore } from "@paperclipai/ontology-core/graph/GraphStore.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readOntologyMcpConfig } from "./config.js";
import { createOntologyMcpServer } from "./server.js";
import { createPgSqlClient } from "./sqlClient.js";

async function main(): Promise<void> {
  const config = readOntologyMcpConfig();
  const pool = new Pool({ connectionString: config.databaseUrl });
  const client = createPgSqlClient({ pool, namespace: config.namespace });
  const store = new PostgresGraphStore(client);
  // Probe the database before serving. The pool connects lazily, so without
  // this a wrong URL is reported as a broken *tool call* — an agent gets "cannot
  // connect" while asking a business question, which reads as the ontology being
  // empty rather than the server being misconfigured.
  await pool.query("SELECT 1");

  const { server, tools } = createOntologyMcpServer({ store, companyId: config.companyId });

  // To stderr: stdout is the MCP channel, and anything written there is protocol
  // noise that breaks the session.
  process.stderr.write(
    `ontology-mcp ready — ${tools.length} tools, schema "${config.namespace}", company ${config.companyId}\n`,
  );

  const shutdown = async () => {
    await client.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  await server.connect(new StdioServerTransport());
}

void main().catch((error) => {
  process.stderr.write(`ontology-mcp failed to start: ${String((error as Error)?.message ?? error)}\n`);
  process.exit(1);
});
