#!/usr/bin/env node
/**
 * The standalone entry point.
 *
 *   ONTOLOGY_DATABASE_URL=postgres://… \
 *   ONTOLOGY_KEY_PEPPER=<pepper> \
 *   ONTOLOGY_API_KEY=oc_… \
 *   ontology-mcp
 *
 * No Paperclip, no plugin host, no HTTP layer in between: an agent harness starts
 * this process, presents a key, and the ontology answers from its own database
 * for the tenant that key names.
 */
import { Pool } from "pg";
import { PostgresGraphStore } from "@paperclipai/ontology-core/graph/GraphStore.js";
import { apiKeyPrefix, verifyApiKey } from "@paperclipai/ontology-core/auth/credentials.js";
import { createMemberStore } from "@paperclipai/ontology-core/auth/memberStore.js";
import { resolveIdentity } from "@paperclipai/ontology-core/auth/members.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readOntologyMcpConfig } from "./config.js";
import { createOntologyMcpServer } from "./server.js";
import { createPgSqlClient } from "./sqlClient.js";

async function main(): Promise<void> {
  const config = readOntologyMcpConfig();
  const pool = new Pool({ connectionString: config.databaseUrl });
  const client = createPgSqlClient({ pool, namespace: config.namespace });
  const store = new PostgresGraphStore(client);

  // Probe before serving: the pool connects lazily, so without this a wrong URL
  // surfaces as a broken tool call while the agent is asking a business question.
  await pool.query("SELECT 1");

  // The credential decides the tenant. A key that does not resolve is fatal at
  // startup — not a tool error the model might try to work around.
  const prefix = apiKeyPrefix(config.apiKey);
  const record = prefix ? await store.findApiKeyByPrefix(prefix) : null;
  const caller = verifyApiKey(config.apiKey, record, config.keyPepper);
  if (!caller) {
    throw new Error("The ontology API key is not valid: unknown, revoked, or the wrong pepper.");
  }
  await store.touchApiKey(caller.prefix);

  // The key may name the person it belongs to, in which case the person owns the
  // roles. Resolved here rather than per request because a long-lived session
  // must not keep acting on a role somebody has since taken away.
  if (!record) throw new Error("The ontology API key is not valid: unknown, revoked, or the wrong pepper.");
  const memberStore = createMemberStore(client);
  const member = record.member_id ? await memberStore.getById(caller.tenantId, record.member_id) : null;
  const identity = resolveIdentity(record, member);
  if (!identity) {
    throw new Error("This credential belongs to a member of another tenant and cannot act.");
  }
  if (identity.suspended) {
    // Loud at startup: a suspended member should not get a session that appears
    // to work and refuses every call the model makes.
    throw new Error(
      "The member behind this credential is suspended or removed. Access is stopped until they are reinstated.",
    );
  }

  const { server, tools } = createOntologyMcpServer({
    store,
    companyId: caller.tenantId,
    identity: { scope: identity.scope, roles: identity.roles, suspended: identity.suspended },
  });

  // To stderr: stdout is the MCP channel, and anything written there is protocol
  // noise that breaks the session.
  process.stderr.write(
    `ontology-mcp ready — ${tools.length} tools as ${identity.scope} (${caller.prefix}) ` +
      `${identity.actorRef ? `for ${identity.actorRef} ` : ""}` +
      `roles [${identity.roles.join(", ")}] ` +
      `for tenant ${caller.tenantId}, schema "${config.namespace}"\n`,
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
