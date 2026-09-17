/**
 * The sample seed against a real Postgres.
 *
 * This exists because of a pattern in this plugin: five separate "written but
 * never read back" defects survived the unit suite, including the one this file
 * was written for — `RELATION_TYPE_COLS` omitted `metadata`, so every
 * relation type's endpoints vanished on read and the structure view drew no
 * type-level line, with no error anywhere. Unit tests do not execute SQL, so
 * they cannot see that class of bug at all.
 *
 * It runs only when you point it at a database:
 *
 *   ONTOLOGY_DATABASE_URL=postgres://user:pass@host:5432/db \
 *     npx vitest run --config ./vitest.config.ts tests/seed-real-postgres.spec.ts
 *
 * It creates its own schema and drops it afterwards, so it never touches data it
 * did not make. Without the env var it skips rather than passing quietly — a
 * green run that did nothing is worse than a skip.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresGraphStore } from "@paperclipai/ontology-core/graph/GraphStore.js";
import { applyMigrations, preflight, type MigrationFile } from "@paperclipai/ontology-core/migrate/runner.js";
import { documentFromRows } from "@paperclipai/ontology-core/document/OntologyDocument.js";
import { lintDocument } from "@paperclipai/ontology-core/document/lintDocument.js";
import { createPgSqlClient } from "../src/sqlClient.js";
import { seedSampleDomains } from "../../plugins/plugin-ontology/src/samples/seed.js";

const DATABASE_URL = process.env.ONTOLOGY_DATABASE_URL;
const MIGRATIONS = resolve(__dirname, "../../plugins/plugin-ontology/migrations");

describe.skipIf(!DATABASE_URL)("the sample seed against a real Postgres", () => {
  const schema = `ontology_verify_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const companyId = randomUUID();
  let pool: Pool;
  let sql: ReturnType<typeof createPgSqlClient>;
  let store: PostgresGraphStore;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    sql = createPgSqlClient({ pool, namespace: schema });

    // The same gate the standalone migrator uses: no host company table means
    // this is a standalone database and the anchor gets created for us.
    const gate = await preflight(sql);
    expect(typeof gate.hostTenantTablePresent).toBe("boolean");

    const files: MigrationFile[] = readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), "utf8") }));
    const result = await applyMigrations(sql, files, { namespace: schema });
    expect(result.applied.length).toBeGreaterThan(0);

    await sql.execute(`INSERT INTO public.companies (id, name) VALUES ($1, $2)`, [companyId, "real-pg-verify"]);
    store = new PostgresGraphStore(sql);
  }, 120_000);

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    await pool.end();
  });

  it("creates every sample domain", async () => {
    const report = await seedSampleDomains(companyId, store as never);
    expect(report.failed).toBe(0);
    expect(report.created).toBeGreaterThanOrEqual(7);
    expect(report.domains.filter((domain) => domain.status === "failed")).toEqual([]);
  });

  it("reads every relation type's endpoints back out of the jsonb column", async () => {
    // The assertion the structure view depends on, and the one no unit test can make.
    const domains = await store.listDomains(companyId);
    let relations = 0;
    let withEndpoints = 0;

    for (const domain of domains) {
      for (const relation of await store.listRelationTypes(companyId, domain.id)) {
        relations += 1;
        const metadata = (relation.metadata ?? {}) as Record<string, unknown>;
        if (typeof metadata.sourceNodeTypeKey === "string" && typeof metadata.targetNodeTypeKey === "string") {
          withEndpoints += 1;
        }
      }
    }

    expect(relations).toBe(49);
    expect(withEndpoints).toBe(relations);
  });

  it("points every endpoint at an object type in the same domain", async () => {
    const domains = await store.listDomains(companyId);
    const dangling: string[] = [];

    for (const domain of domains) {
      const types = new Set((await store.listNodeTypes(companyId, domain.id)).map((type) => type.key));
      for (const relation of await store.listRelationTypes(companyId, domain.id)) {
        const metadata = (relation.metadata ?? {}) as Record<string, unknown>;
        for (const role of ["sourceNodeTypeKey", "targetNodeTypeKey"] as const) {
          const endpoint = metadata[role];
          if (typeof endpoint !== "string" || !types.has(endpoint)) {
            dangling.push(`${domain.slug}.${relation.key} ${role}=${String(endpoint)}`);
          }
        }
      }
    }

    expect(dangling).toEqual([]);
  });

  it("exports a seeded domain as a document that validates and lints clean", async () => {
    const domains = await store.listDomains(companyId);
    const target = domains.find((domain) => domain.slug === "cosmic-coffee") ?? domains[0];

    const { document, problems } = documentFromRows({
      domain: {
        slug: target.slug,
        displayName: target.displayName,
        description: target.description,
        version: target.schemaVersion,
      },
      nodeTypes: await store.listNodeTypes(companyId, target.id),
      relationTypes: await store.listRelationTypes(companyId, target.id),
    });

    expect(problems).toEqual([]);
    expect(document.objectTypes.length).toBeGreaterThan(0);
    // jsonb cannot tell us the source's field order, and the document says so
    // rather than presenting the map's order as if it were.
    expect(document.objectTypes[0].orderSource).toBe("sorted");
    expect(lintDocument(document)).toEqual([]);
  });

  it("is idempotent: a second run skips rather than duplicating", async () => {
    const report = await seedSampleDomains(companyId, store as never);
    expect(report.created).toBe(0);
    expect(report.skipped).toBeGreaterThanOrEqual(7);
  });
});
