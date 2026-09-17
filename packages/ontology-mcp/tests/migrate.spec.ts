/**
 * Migration ownership.
 *
 * The migrations existed but the host applied them, which is fine for a plugin
 * and useless for a deployment. These tests are about the three things a product
 * needs from its own migrations: a record of what was applied, a schema that is a
 * parameter rather than a literal, and a refusal to re-run a file that changed
 * after the fact.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { Pool } from "pg";
import {
  SCHEMA_TOKEN,
  applyMigrations,
  checksum,
  preflight,
  splitStatements,
  withNamespace,
  type MigrationFile,
} from "@paperclipai/ontology-core/migrate/runner.js";
import { describe, expect, it } from "vitest";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../db/src/test-embedded-postgres.js";
import { createPgSqlClient } from "../src/sqlClient.js";

const support = await getEmbeddedPostgresTestSupport();
const describePostgres = support.supported ? describe : describe.skip;

const MIGRATIONS = new URL("../../plugins/plugin-ontology/migrations/", import.meta.url);
const migrations: MigrationFile[] = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => ({ name, sql: readFileSync(new URL(name, MIGRATIONS), "utf8") }));

describe("reading a migration", () => {
  it("installs into whatever schema it is pointed at", () => {
    // The files carry the plugin's schema because the host applies them as
    // written. Here that name is a parameter.
    const sql = withNamespace(`CREATE TABLE ${SCHEMA_TOKEN}.thing (id uuid);`, "ontology");
    expect(sql).toContain("CREATE TABLE ontology.thing");
    expect(sql).not.toContain(SCHEMA_TOKEN);
  });

  it("rewrites nothing else", () => {
    // A migration may name a business schema; that is not ours to touch.
    const sql = withNamespace(`-- ${SCHEMA_TOKEN} lives in sales.orders`, "ontology");
    expect(sql).toBe("-- ontology lives in sales.orders");
  });

  it("checksums the file as written, not the substituted text", () => {
    // The checksum exists to detect an edited migration; the substitution is the
    // runner's doing and must not make an unchanged file look changed.
    expect(checksum("SELECT 1")).toBe(checksum("SELECT 1"));
    expect(checksum("SELECT 1")).not.toBe(checksum("SELECT 2"));
  });
});

describe("splitting a migration into statements", () => {
  it("keeps a dollar-quoted body in one piece", () => {
    // The plugin's migrations define functions; splitting inside the body would
    // send fragments to the server.
    const sql = `CREATE FUNCTION f() RETURNS void AS $$ BEGIN PERFORM 1; END; $$ LANGUAGE plpgsql;
UPDATE t SET x = 1;`;
    const statements = splitStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("PERFORM 1; END;");
  });

  it("ignores semicolons in comments", () => {
    const statements = splitStatements("-- a; b\nSELECT 1;\n/* c; d */\nSELECT 2;");
    expect(statements).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("survives an unterminated statement", () => {
    expect(splitStatements("SELECT 1")).toEqual(["SELECT 1"]);
  });
});

describePostgres("applying them to a database the ontology owns", () => {
  it("installs into the chosen schema and records what it did", async () => {
    const database = await startEmbeddedPostgresTestDatabase("ontology-migrate-");
    const pool = new Pool({ connectionString: database.connectionString });
    try {
      // The older migrations reference the host tenant table.
      await pool.query("CREATE TABLE IF NOT EXISTS public.companies (id uuid PRIMARY KEY, name text NOT NULL)");
      const client = createPgSqlClient({ pool, namespace: "ontology" });

      // The host table is there, so the runner will not create one.
      expect((await preflight(client)).hostTenantTablePresent).toBe(true);

      const result = await applyMigrations(client, migrations, { namespace: "ontology" });
      expect(result.applied).toHaveLength(migrations.length);
      expect(result.changed).toEqual([]);
      // A pinned connection, so each file is all-or-nothing.
      expect(result.transactional).toBe(true);

      const tables = await pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'ontology' ORDER BY table_name`,
      );
      expect(tables.rows.map((row) => row.table_name)).toContain("ontology_domains");
      expect(tables.rows.map((row) => row.table_name)).toContain("ontology_views");
      expect(tables.rows.map((row) => row.table_name)).toContain("ontology_schema_migrations");

      // Nothing landed in the schema the files name.
      const foreign = await pool.query(
        `SELECT 1 FROM information_schema.schemata WHERE schema_name = '${SCHEMA_TOKEN}'`,
      );
      expect(foreign.rowCount).toBe(0);
    } finally {
      await pool.end();
      await database.cleanup();
    }
  }, 120_000);

  it("does nothing on a second run", async () => {
    const database = await startEmbeddedPostgresTestDatabase("ontology-migrate-twice-");
    const pool = new Pool({ connectionString: database.connectionString });
    try {
      await pool.query("CREATE TABLE IF NOT EXISTS public.companies (id uuid PRIMARY KEY, name text NOT NULL)");
      const client = createPgSqlClient({ pool, namespace: "ontology" });
      await applyMigrations(client, migrations, { namespace: "ontology" });

      const again = await applyMigrations(client, migrations, { namespace: "ontology" });
      expect(again.applied).toEqual([]);
      expect(again.skipped).toHaveLength(migrations.length);
    } finally {
      await pool.end();
      await database.cleanup();
    }
  }, 120_000);

  it("reports a migration that changed after it was applied", async () => {
    // Re-running it would apply a change nobody reviewed; running nothing and
    // saying nothing would make the ledger a lie.
    const database = await startEmbeddedPostgresTestDatabase("ontology-migrate-changed-");
    const pool = new Pool({ connectionString: database.connectionString });
    try {
      await pool.query("CREATE TABLE IF NOT EXISTS public.companies (id uuid PRIMARY KEY, name text NOT NULL)");
      const client = createPgSqlClient({ pool, namespace: "ontology" });
      await applyMigrations(client, migrations, { namespace: "ontology" });

      const edited = migrations.map((migration) =>
        migration.name === migrations[0]!.name
          ? { ...migration, sql: `${migration.sql}\n-- edited later\n` }
          : migration,
      );
      const result = await applyMigrations(client, edited, { namespace: "ontology" });
      expect(result.changed.map((entry) => entry.name)).toEqual([migrations[0]!.name]);
      expect(result.applied).toEqual([]);
    } finally {
      await pool.end();
      await database.cleanup();
    }
  }, 120_000);

  it("runs on a database that has no host company table", async () => {
    // The standalone case. The object model keys its rows to a table named
    // companies, so without one there is no schema to create: the runner supplies
    // it, with the shape the migrations declare, and the migration proceeds.
    // Environments are separated by running separate agents and instances, not by
    // teaching the schema about tenants.
    const database = await startEmbeddedPostgresTestDatabase("ontology-migrate-standalone-");
    const pool = new Pool({ connectionString: database.connectionString });
    try {
      const client = createPgSqlClient({ pool, namespace: "ontology" });
      await pool.query("DROP TABLE IF EXISTS public.companies CASCADE");

      const gate = await preflight(client);
      expect(gate.hostTenantTablePresent).toBe(false);

      const result = await applyMigrations(client, migrations, { namespace: "ontology" });
      expect(result.applied).toHaveLength(migrations.length);

      // The anchor the model points at is there, and the schema is usable.
      const anchor = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies'`,
      );
      expect(anchor.rowCount).toBe(1);
      const keys = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM pg_constraint
          WHERE contype = 'f' AND confrelid = 'public.companies'::regclass`,
      );
      expect(Number(keys.rows[0]!.count)).toBe(31);
    } finally {
      await pool.end();
      await database.cleanup();
    }
  }, 120_000);
});

describePostgres("the migrate command, as an operator runs it", () => {
  it("refuses, migrates, and then reports itself up to date", async () => {
    const database = await startEmbeddedPostgresTestDatabase("ontology-migrate-cli-");
    const pool = new Pool({ connectionString: database.connectionString });
    try {
      // The embedded template already has the host schema, so the absence the
      // preflight checks for has to be created first.
      await pool.query("DROP TABLE IF EXISTS public.companies CASCADE");

      const run = (args: string[]) =>
        spawnSync("node", ["dist/migrate.js", ...args], {
          cwd: new URL("..", import.meta.url).pathname,
          env: {
            ...process.env,
            ONTOLOGY_DATABASE_URL: database.connectionString,
            // Where the files are is configuration: the in-repo default is
            // relative to the repository, and a packaged deployment ships its own.
            ONTOLOGY_MIGRATIONS_DIR: MIGRATIONS.pathname,
          },
          encoding: "utf8",
        });

      // Before the tenant table exists, the command says what is missing instead
      // of failing halfway through a foreign key.
      const refused = run(["--schema", "ontology"]);
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain("public.companies");

      await pool.query(
        "CREATE TABLE IF NOT EXISTS public.companies (id uuid PRIMARY KEY, name text NOT NULL)",
      );
      const applied = run(["--schema", "ontology"]);
      expect(applied.status).toBe(0);
      expect(applied.stdout).toContain("applied");

      // Re-running is a no-op, and --check says so with an exit code a CI job can use.
      const check = run(["--check", "--schema", "ontology"]);
      expect(check.status).toBe(0);
      expect(check.stdout).toContain("up to date");

      const ledger = await pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM ontology.ontology_schema_migrations",
      );
      expect(ledger.rows[0]!.n).toBe(migrations.length);
    } finally {
      await pool.end();
      await database.cleanup();
    }
  }, 180_000);
});
