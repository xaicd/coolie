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
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { Pool } from "pg";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { PostgresGraphStore } from "@paperclipai/ontology-core/graph/GraphStore.js";
import { generateApiKey, verifyApiKey } from "@paperclipai/ontology-core/auth/credentials.js";
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
 * A tenant table, because every ontology table has a foreign key to one.
 *
 * A standalone database has no such table, so this creates a minimal one. The
 * embedded test database, however, is created from a template that already has
 * the host schema — so when the table is already there this fills in whatever
 * else it requires rather than assuming the shape.
 */
const TENANTS_DDL = `
  CREATE TABLE IF NOT EXISTS public.companies (
    id uuid PRIMARY KEY,
    name text NOT NULL
  );
`;

async function insertCompany(pool: Pool, id: string, name: string): Promise<void> {
  const columns = await pool.query<{
    column_name: string;
    is_nullable: string;
    column_default: string | null;
    character_maximum_length: number | null;
  }>(
    `SELECT column_name, is_nullable, column_default, character_maximum_length
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'companies'`,
  );
  const required = columns.rows.filter(
    (column) =>
      !["id", "name"].includes(column.column_name) &&
      // A unique column needs a distinct value even when it has a default: the
      // second tenant would otherwise collide on the default alone. The host's
      // `issue_prefix` is exactly that.
      (column.column_name === "issue_prefix" ||
        (column.is_nullable === "NO" && column.column_default === null)),
  );
  const names = ["id", "name", ...required.map((column) => column.column_name)];
  const values: unknown[] = [id, name];
  for (const column of required) {
    // A unique value for whatever else the host table insists on, trimmed to the
    // column's own limit: a short column (a 4-character issue prefix) would
    // otherwise truncate two tenants to the same value and collide.
    const unique = randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
    values.push(column.character_maximum_length === null ? unique : unique.slice(0, column.character_maximum_length));
  }
  const placeholders = names.map((_, index) => `$${index + 1}`).join(", ");
  await pool.query(
    `INSERT INTO public.companies (${names.join(", ")}) VALUES (${placeholders})`,
    values,
  );
}

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

      // The core, over a plain `pg` pool. No plugin host, no Paperclip process.
      const sql = createPgSqlClient({ pool, namespace: ONTOLOGY_SCHEMA });
      const store = new PostgresGraphStore(sql);

      // The ontology owns its tenancy and its credentials now. `companyId` in
      // this deployment IS the tenant id, which is why the same value is used
      // for both.
      const tenant = await store.createTenant({ slug: "standalone-co", name: "Standalone Co" });
      const companyId = tenant.id;
      // The host table still satisfies the foreign keys of the older tables.
      await insertCompany(pool, companyId, "Standalone Co");

      const PEPPER = "test-pepper";
      const minted = generateApiKey({ pepper: PEPPER });
      await store.createApiKey({
        tenantId: tenant.id,
        prefix: minted.prefix,
        keyHash: minted.hash,
        scope: "board",
        roles: [],
        label: "standalone",
      });
      const caller = verifyApiKey(minted.secret, await store.findApiKeyByPrefix(minted.prefix), PEPPER);
      expect(caller, "the key authenticates").toBeTruthy();

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
      const { server } = createOntologyMcpServer({
        store,
        companyId: caller!.tenantId,
        identity: { scope: caller!.scope, roles: caller!.roles },
      });
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

  it("does not serve one tenant's model to another tenant's key", async () => {
    // The whole point of owning tenancy: a credential names one tenant, and a
    // second tenant sees nothing of the first.
    const database = await startEmbeddedPostgresTestDatabase("ontology-isolation-");
    const pool = new Pool({ connectionString: database.connectionString });
    try {
      await pool.query(TENANTS_DDL);
      await applyMigrations(pool);
      const sql = createPgSqlClient({ pool, namespace: ONTOLOGY_SCHEMA });
      const store = new PostgresGraphStore(sql);
      const PEPPER = "test-pepper";

      const mintFor = async (slug: string) => {
        const tenant = await store.createTenant({ slug, name: slug });
        await insertCompany(pool, tenant.id, slug);
        return tenant;
      };
      const alpha = await mintFor("alpha");
      const beta = await mintFor("beta");

      await store.createDomain({
        companyId: alpha.id,
        slug: "alpha-model",
        displayName: "Alpha 的模型",
      });

      const betaKey = generateApiKey({ pepper: PEPPER });
      await store.createApiKey({
        tenantId: beta.id,
        prefix: betaKey.prefix,
        keyHash: betaKey.hash,
        scope: "board",
      });
      const betaCaller = verifyApiKey(
        betaKey.secret,
        await store.findApiKeyByPrefix(betaKey.prefix),
        PEPPER,
      )!;

      const { server } = createOntologyMcpServer({
        store,
        companyId: betaCaller.tenantId,
        identity: { scope: betaCaller.scope, roles: betaCaller.roles },
      });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "beta", version: "0.0.0" });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const domains = await client.callTool({ name: "ontology_list_domains", arguments: {} });
      expect(JSON.stringify(domains.structuredContent)).not.toContain("alpha-model");
      // And a direct attempt to name the other domain fails rather than leaking.
      const peek = await client.callTool({
        name: "ontology_get_domain",
        arguments: { domainSlug: "alpha-model" },
      });
      expect(peek.isError).toBe(true);

      await client.close();
    } finally {
      await pool.end();
      await database.cleanup();
    }
  }, 120_000);
});
