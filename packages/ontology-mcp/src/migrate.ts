#!/usr/bin/env node
/**
 * Apply the ontology's migrations.
 *
 *   ONTOLOGY_DATABASE_URL=postgres://… ontology-migrate [--schema public]
 *
 * The host applies the plugin's migrations for the plugin. This is the same work
 * for a deployment that has no host: it records what it applied, refuses to
 * re-run a migration whose file changed, and reports what is pending.
 *
 *   --schema <name>   install into this schema (default $ONTOLOGY_SCHEMA or public)
 *   --check           report what would happen and exit non-zero if anything is pending
 *   --migrations <d>  where the migration files are (default $ONTOLOGY_MIGRATIONS_DIR)
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Pool } from "pg";
import {
  appliedMigrations,
  applyMigrations,
  preflight,
  type MigrationFile,
} from "@paperclipai/ontology-core/migrate/runner.js";
import { createPgSqlClient } from "./sqlClient.js";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function readMigrations(directory: string): MigrationFile[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(directory, name), "utf8") }));
}

async function main(): Promise<void> {
  const databaseUrl = process.env.ONTOLOGY_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Set ONTOLOGY_DATABASE_URL (or DATABASE_URL).");

  const namespace = flag("--schema") ?? process.env.ONTOLOGY_SCHEMA ?? "public";
  // Default to the in-repo directory so the command works from a checkout; a
  // packaged deployment points this at the migrations it ships.
  const directory = resolve(
    flag("--migrations") ?? process.env.ONTOLOGY_MIGRATIONS_DIR ?? "packages/plugins/plugin-ontology/migrations",
  );
  const checkOnly = process.argv.includes("--check");

  const pool = new Pool({ connectionString: databaseUrl });
  const client = createPgSqlClient({ pool, namespace });
  try {
    const gate = await preflight(client);
    if (!gate.ok) {
      for (const problem of gate.problems) process.stderr.write(`${problem}\n`);
      process.exitCode = 1;
      return;
    }

    if (checkOnly) {
      // A dry run reports pending work without touching anything: the ledger is
      // the only thing read, and a missing ledger means everything is pending.
      const applied = new Set((await appliedMigrations(client, namespace)).map((row) => row.name));
      const pending = readMigrations(directory).filter((migration) => !applied.has(migration.name));
      process.stdout.write(
        pending.length === 0
          ? `Ontology schema "${namespace}" is up to date (${applied.size} applied).\n`
          : `Ontology schema "${namespace}" has ${pending.length} pending: ${pending.map((m) => m.name).join(", ")}\n`,
      );
      if (pending.length > 0) process.exitCode = 1;
      return;
    }

    const result = await applyMigrations(client, readMigrations(directory), { namespace });
    process.stdout.write(
      `Ontology schema "${namespace}": ${result.applied.length} applied, ` +
        `${result.skipped.length} already present` +
        `${result.transactional ? "" : " (no transaction: this client cannot pin a connection)"}\n`,
    );
    for (const change of result.changed) {
      // Loud: an applied migration that changed underneath is a review problem,
      // not an upgrade.
      process.stderr.write(
        `Changed after being applied: ${change.name} (applied ${change.applied}, now ${change.current})\n`,
      );
    }
  } finally {
    await client.close();
  }
}

void main().catch((error) => {
  process.stderr.write(`ontology-migrate failed: ${String((error as Error)?.message ?? error)}\n`);
  process.exit(1);
});
