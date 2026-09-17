/**
 * The standalone proof.
 *
 * Everything else about the split has been a claim about structure: the core is
 * host-free, the API is a contract, the tools are derived from it. This is the
 * test the whole exercise was for — a real PostgreSQL, the ontology's own
 * migrations, the core talking to it through the `SqlClient` port, and an MCP
 * client driving the result. **Paperclip is not running and is not involved.**
 *
 * Two prerequisites it makes visible rather than theoretical:
 *
 *   1. The migrations name the plugin's schema (`plugin_ontology_…`), so a
 *      standalone deployment either keeps that name or the migrations need a
 *      parameter. It works; it is not a decision anyone made on purpose.
 *   2. Every ontology table references `public.companies` — the host's tenant
 *      table. A standalone deployment must ship a tenants table (or the foreign
 *      keys need relaxing). The test creates a minimal one, which is also the
 *      smallest possible statement of what §6.1 of the plan has to build.
 */
import { readFileSync, readdirSync } from "node:fs";
import { Pool } from "pg";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { PostgresGraphStore } from "@paperclipai/ontology-core/graph/GraphStore.js";
import { describe, expect, it } from "vitest";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../db/src/test-embedded-postgres.js";
import { createOntologyMcpServer } from "../src/server.js";
import { createPgSqlClient } from "../src/sqlClient.js";

const support = await getEmbeddedPostgresTestSupport();
const describePostgres = support.supported ? describe : describe.skip;

const MIGRATIONS = new URL("../../plugins/plugin-ontology/migrations/", import.meta.url);
/** The schema the plugin's migrations create their tables in. */
const ONTOLOGY_SCHEMA = "plugin_ontology_b62f8af3e9";

/**
 * A tenant table, because every ontology table has a foreign key to one. This is
 * the host's table standing in — no Paperclip, just the column the schema needs.
 */
const TENANTS_DDL = `
  CREATE TABLE IF NOT EXISTS public.companies (
    id uuid PRIMARY KEY,
    name text NOT NULL
  );
`;

async function applyMigrations(pool: Pool): Promise<void> {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${ONTOLOGY_SCHEMA}`);
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(new URL(file, MIGRATIONS), "utf8");
    await pool.query(sql);
  }
}

describePostgres("the ontology, standalone", () => {
  it("serves its tools over MCP from its own database", async () => {
    const database = await startEmbeddedPostgresTestDatabase("ontology-standalone-");
    const pool = new Pool({ connectionString: database.connectionString });
    try {
      await pool.query(TENANTS_DDL);
      await applyMigrations(pool);

      const companyId = "11111111-1111-4111-8111-111111111111";
      await pool.query("INSERT INTO public.companies (id, name) VALUES ($1, $2)", [
        companyId,
        "Standalone Co",
      ]);

      // The core, over a plain `pg` pool. No plugin host, no Paperclip process.
      const sql = createPgSqlClient({ pool, namespace: ONTOLOGY_SCHEMA });
      const store = new PostgresGraphStore(sql);

      const domain = await store.createDomain({
        companyId,
        slug: "orders",
        displayName: "订单域",
      });
      await store.createNodeType({
        companyId,
        domainId: domain.id,
        key: "Order",
        displayName: "订单",
        propertiesSchema: { code: { type: "string" } },
      });

      // …and the same catalogue an agent sees, from a real MCP client.
      const { server } = createOntologyMcpServer({ store, companyId });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "standalone", version: "0.0.0" });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const listed = await client.listTools();
      expect(listed.tools.length).toBeGreaterThan(15);

      const domains = await client.callTool({ name: "ontology_list_domains", arguments: {} });
      expect(domains.isError).toBeFalsy();
      expect(JSON.stringify(domains.structuredContent)).toContain("订单域");

      const types = await client.callTool({
        name: "ontology_list_object_types",
        arguments: { domainSlug: "orders" },
      });
      const payload = JSON.stringify(types.structuredContent);
      expect(payload).toContain("Order");
      expect(payload).toContain("code");

      // The schema version travels with the model, which is what makes an answer
      // traceable to the model it came from.
      const detail = await client.callTool({
        name: "ontology_get_domain",
        arguments: { domainSlug: "orders" },
      });
      expect(JSON.stringify(detail.structuredContent)).toContain("schema_version");

      await client.close();
    } finally {
      await pool.end();
      await database.cleanup();
    }
  }, 120_000);
});
