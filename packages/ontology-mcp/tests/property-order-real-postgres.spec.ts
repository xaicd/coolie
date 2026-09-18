/**
 * Property order against a real Postgres.
 *
 * The defect: `properties_schema` is `jsonb`, and jsonb does not preserve the
 * order of the keys of an object — it stores them in its own order — so the field
 * order a source declared was replaced by whatever the database returned, and the
 * Schema page showed that. `property_order` is a jsonb **array**, and jsonb does
 * keep the element order of an array, which is the whole reason the order can live
 * there when it cannot live in the schema map.
 *
 * A unit test cannot show any of this. A fake db returns whatever it was handed,
 * so it "preserves" order trivially and would pass whether or not the column
 * works. Only a real jsonb column can show that a declared order comes back.
 *
 * It runs on a disposable embedded PostgreSQL, on its own database, so it is a
 * real round trip and touches nothing else. If embedded Postgres cannot start on
 * this machine the suite skips rather than passing quietly.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresGraphStore } from "@paperclipai/ontology-core/graph/GraphStore.js";
import { applyMigrations, preflight, type MigrationFile } from "@paperclipai/ontology-core/migrate/runner.js";
import { documentFromRows } from "@paperclipai/ontology-core/document/OntologyDocument.js";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../db/src/test-embedded-postgres.js";
import { createPgSqlClient } from "../src/sqlClient.js";

const support = await getEmbeddedPostgresTestSupport();
const describePostgres = support.supported ? describe : describe.skip;

const MIGRATIONS = resolve(__dirname, "../../plugins/plugin-ontology/migrations");

describePostgres("property order against a real Postgres", () => {
  const schema = `ontology_order_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const companyId = randomUUID();
  let admin: Pool;
  let pool: Pool;
  let store: PostgresGraphStore;
  let domainId: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const database = await startEmbeddedPostgresTestDatabase("ontology-order-");
    cleanup = database.cleanup;

    // Its own database, with only the ontology migrations applied — the
    // standalone path, where the runner creates the tenant anchor the ontology
    // tables point at. The harness database itself carries the host schema and is
    // left alone.
    const url = new URL(database.connectionString);
    const databaseName = `order_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    admin = new Pool({ connectionString: database.connectionString });
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    url.pathname = `/${databaseName}`;
    pool = new Pool({ connectionString: url.toString() });

    const sql = createPgSqlClient({ pool, namespace: schema });
    const gate = await preflight(sql);
    expect(gate.hostTenantTablePresent).toBe(false);

    const files: MigrationFile[] = readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), "utf8") }));
    const result = await applyMigrations(sql, files, { namespace: schema });
    expect(result.applied.length).toBeGreaterThan(0);

    await sql.execute(`INSERT INTO public.companies (id, name) VALUES ($1, $2)`, [companyId, "order-verify"]);
    store = new PostgresGraphStore(sql);
    const domain = await store.createDomain({ companyId, slug: "order", displayName: "Order" });
    domainId = domain.id;
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => {});
    await admin?.end().catch(() => {});
    await cleanup?.();
  });

  it("returns the order the caller declared, not the order jsonb chose", async () => {
    // The schema map is written in a deliberately different sequence from the
    // declared order, so echoing insertion order would fail this.
    await store.createNodeType({
      companyId,
      domainId,
      key: "customer",
      displayName: "Customer",
      propertiesSchema: {
        alpha: { type: "string" },
        middle: { type: "number" },
        zeta: { type: "boolean" },
      },
      propertyOrder: ["zeta", "alpha", "middle"],
    });

    const described = await store.describeDomain(companyId, domainId);
    const customer = described.nodeTypes.find((type) => type.key === "customer")!;
    expect(customer.propertyOrder).toEqual(["zeta", "alpha", "middle"]);

    // And the export says the order was told to us rather than invented.
    const { document } = documentFromRows({
      domain: { slug: "order", displayName: "Order", version: 1 },
      nodeTypes: await store.listNodeTypes(companyId, domainId),
      relationTypes: [],
    });
    const exported = document.objectTypes.find((type) => type.key === "customer")!;
    expect(exported.orderSource).toBe("declared");
    expect(exported.properties.map((p) => p.name)).toEqual(["zeta", "alpha", "middle"]);
  });

  it("reads a type with no declared order as unknown rather than as map order", async () => {
    await store.createNodeType({
      companyId,
      domainId,
      key: "unrecorded",
      displayName: "Unrecorded",
      propertiesSchema: { zeta: { type: "string" }, alpha: { type: "string" } },
    });

    const described = await store.describeDomain(companyId, domainId);
    const unrecorded = described.nodeTypes.find((type) => type.key === "unrecorded")!;
    expect(unrecorded.propertyOrder).toEqual([]);

    const { document } = documentFromRows({
      domain: { slug: "order", displayName: "Order", version: 1 },
      nodeTypes: await store.listNodeTypes(companyId, domainId),
      relationTypes: [],
    });
    const exported = document.objectTypes.find((type) => type.key === "unrecorded")!;
    expect(exported.orderSource).toBe("sorted");
    expect(exported.properties.map((p) => p.name)).toEqual(["alpha", "zeta"]);
  });

  it("refuses to store an order naming a property the schema does not have", async () => {
    await store.createNodeType({
      companyId,
      domainId,
      key: "pruned",
      displayName: "Pruned",
      propertiesSchema: { a: { type: "string" }, b: { type: "string" } },
      propertyOrder: ["a", "ghost", "b"],
    });

    const described = await store.describeDomain(companyId, domainId);
    expect(described.nodeTypes.find((type) => type.key === "pruned")!.propertyOrder).toEqual(["a", "b"]);
  });

  it("moves the order with a rename and drops a removed property", async () => {
    const created = await store.createNodeType({
      companyId,
      domainId,
      key: "renamed",
      displayName: "Renamed",
      propertiesSchema: { old: { type: "string" }, keep: { type: "string" }, gone: { type: "string" } },
      propertyOrder: ["old", "keep", "gone"],
    });

    await store.updateNodeType(companyId, created.id, {
      propertiesSchema: { renamed: { type: "string" }, keep: { type: "string" } },
      propertyRenames: { old: "renamed" },
      allowOrphaned: true,
    });

    const described = await store.describeDomain(companyId, domainId);
    const row = described.nodeTypes.find((type) => type.key === "renamed")!;
    // The renamed field keeps the position it had; the removed one leaves no ghost.
    expect(row.propertyOrder).toEqual(["renamed", "keep"]);
  });
});
