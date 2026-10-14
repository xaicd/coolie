import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable, pgTable, uuid } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "./schema/index.js";

/**
 * COOA-137 (主线 C · WP3) — machine-checked multi-tenant scope inventory.
 *
 * AGENTS.md §5 rule 1 says every domain entity is company-scoped, with only
 * explicitly named exceptions (instance-wide preferences, instance-level feed
 * metadata). This suite turns that rule into a build gate: it enumerates every
 * Drizzle table in the schema barrel, and any table that is not company-scoped
 * MUST appear in `NON_COMPANY_SCOPED_TABLES` with a reviewed classification.
 *
 * That means a new table cannot silently ship without a tenant boundary — the
 * moment it is added without a `company_id`, this suite fails until someone
 * classifies it. Route-level isolation tests only sample a handful of routes;
 * this covers the whole schema surface.
 *
 * Classification kinds:
 *  - `instance`      — genuinely instance-level (auth identities, instance
 *                      settings, plugin registry, the tenant root itself).
 *  - `parent_scoped` — no direct `company_id`; the tenant boundary is inherited
 *                      through a FK to a parent table named in `parent`.
 */

const COMPANY_SCOPED_COLUMN = "companyId";

type ParentScopedEntry = { scope: "parent_scoped"; parent: string; reason: string };
type InstanceScopedEntry = { scope: "instance"; reason: string };
type NonCompanyScopedEntry = ParentScopedEntry | InstanceScopedEntry;

/**
 * Exactly the tables in the schema barrel that carry no `company_id`. Keys are
 * the physical table names (`getTableName`), which is what the guard compares
 * against. Keep this list sorted by name for reviewability.
 */
const NON_COMPANY_SCOPED_TABLES: Record<string, NonCompanyScopedEntry> = {
  account: { scope: "instance", reason: "Better Auth account/credential; identity-level." },
  announcement_dismissals: {
    scope: "instance",
    reason: "AGENTS.md §5 rule 1 explicit exception: instance-wide user preference keyed by user+announcement.",
  },
  announcement_publications: {
    scope: "instance",
    reason: "Instance-level announcement feed registry; carries no company or user data.",
  },
  board_api_keys: { scope: "instance", reason: "Board API keys bound to an auth user, not a company." },
  cli_auth_challenges: { scope: "instance", reason: "CLI login handshake; identity-level." },
  companies: {
    scope: "instance",
    reason: "The tenant root itself — it owns the company_id every other table points at.",
  },
  company_secret_versions: {
    scope: "parent_scoped",
    parent: "company_secrets",
    reason: "Version rows inherit the company scope of their company_secrets parent.",
  },
  decision_effect_executions: {
    scope: "parent_scoped",
    parent: "decisions",
    reason: "Effect rows inherit the company scope of their decisions parent.",
  },
  environment_custom_image_setup_sessions: {
    scope: "parent_scoped",
    parent: "environments",
    reason: "Setup sessions inherit the (instance-level) scope of their environments parent.",
  },
  environment_custom_image_templates: {
    scope: "parent_scoped",
    parent: "environments",
    reason: "Image templates inherit the (instance-level) scope of their environments parent.",
  },
  environments: {
    scope: "instance",
    reason: "Instance-level environment definitions shared across companies.",
  },
  git_credentials: { scope: "instance", reason: "Per-user encrypted Git credential; identity-level." },
  instance_settings: { scope: "instance", reason: "Single instance-wide settings row." },
  instance_user_roles: { scope: "instance", reason: "Instance-admin role grants; identity-level." },
  pipeline_stages: {
    scope: "parent_scoped",
    parent: "pipelines",
    reason: "Stage rows inherit the company scope of their pipelines parent.",
  },
  pipeline_transitions: {
    scope: "parent_scoped",
    parent: "pipelines",
    reason: "Transition rows inherit the company scope of their pipelines parent.",
  },
  plugin_database_namespaces: {
    scope: "instance",
    reason: "Per-plugin database namespace allocation; instance-level.",
  },
  plugin_jobs: {
    scope: "instance",
    reason: "Plugin-owned scheduled job registration; the company scope, when any, lives on plugin_job_runs.",
  },
  plugin_migrations: { scope: "instance", reason: "Per-plugin migration ledger; instance-level." },
  plugin_state: {
    scope: "instance",
    reason: "Plugin scoped KV; tenant scope is encoded in (scope_kind, scope_id) columns, not a company_id.",
  },
  plugins: { scope: "instance", reason: "Installed-plugin registry; instance-level." },
  session: { scope: "instance", reason: "Better Auth session; instance-level identity." },
  status_card_updates: {
    scope: "parent_scoped",
    parent: "status_cards",
    reason: "Update-history rows inherit the company scope of their status_cards parent.",
  },
  user: { scope: "instance", reason: "Better Auth user principal; instance-level identity." },
  user_sidebar_preferences: { scope: "instance", reason: "Per-user UI preference; instance-level." },
  verification: { scope: "instance", reason: "Better Auth verification token; instance-level identity." },
};

/**
 * Documented floor for the pg-table inventory. Removing a table below this
 * floor is a regression (the platform's "high-cohesion 263-table asset" claim
 * counts views/legacy on top of these pg tables). Adding tables is fine.
 */
const DOCUMENTED_PG_TABLE_BASELINE = 225;

const isDrizzleTable = (value: unknown): value is PgTable =>
  Boolean(value) && typeof value === "object" && is(value as never, PgTable);

function collectTables(module: Record<string, unknown>): Map<string, PgTable> {
  const tables = new Map<string, PgTable>();
  for (const value of Object.values(module)) {
    if (isDrizzleTable(value)) {
      tables.set(getTableName(value), value);
    }
  }
  return tables;
}

const hasCompanyScope = (table: PgTable): boolean =>
  Object.keys(getTableColumns(table)).includes(COMPANY_SCOPED_COLUMN);

type Report = {
  total: number;
  tenantScoped: number;
  missing: string[];
  stale: string[];
  unresolvedParents: string[];
};

function classify(tables: Map<string, PgTable>): Report {
  const names = new Set(tables.keys());
  const tenantScoped = new Set<string>();
  const missing: string[] = [];

  for (const [name, table] of tables) {
    if (hasCompanyScope(table)) {
      tenantScoped.add(name);
    } else if (!(name in NON_COMPANY_SCOPED_TABLES)) {
      missing.push(name);
    }
  }

  const stale = Object.keys(NON_COMPANY_SCOPED_TABLES).filter((name) => !names.has(name));

  const unresolvedParents = Object.entries(NON_COMPANY_SCOPED_TABLES)
    .filter(([, entry]) => entry.scope === "parent_scoped")
    .filter(
      ([, entry]) =>
        !tenantScoped.has((entry as ParentScopedEntry).parent) &&
        !names.has((entry as ParentScopedEntry).parent),
    )
    .map(([name]) => name);

  return {
    total: tables.size,
    tenantScoped: tenantScoped.size,
    missing: missing.sort(),
    stale: stale.sort(),
    unresolvedParents: unresolvedParents.sort(),
  };
}

const tables = collectTables(schema as Record<string, unknown>);
const report = classify(tables);

describe("COOA-137 WP3 — multi-tenant scope inventory", () => {
  it("classifies every schema table as company-scoped or an explicit exception", () => {
    expect(report.missing).toEqual([]);
    expect(report.stale).toEqual([]);
    expect(report.unresolvedParents).toEqual([]);
  });

  it("keeps the pg-table inventory at or above the documented baseline", () => {
    expect(report.total).toBeGreaterThanOrEqual(DOCUMENTED_PG_TABLE_BASELINE);
  });

  it("has unnamed-table coverage and keeps the exception set a small minority", () => {
    const exceptionCount = report.total - report.tenantScoped;
    expect(exceptionCount).toBe(Object.keys(NON_COMPANY_SCOPED_TABLES).length);
    // The exception set is reviewed by hand, so keep it a bounded minority.
    expect(exceptionCount).toBeLessThan(report.tenantScoped);
  });

  it("leaves no duplicate physical table names across the barrel", () => {
    const exported = Object.values(schema as Record<string, unknown>).filter(isDrizzleTable);
    expect(exported.length).toBe(tables.size);
  });

  it("bites: an unclassified company-less table is a violation", () => {
    const leak = pgTable("zzz_fake_tenant_leak", {
      id: uuid("id").primaryKey(),
    });
    const leakReport = classify(new Map([["zzz_fake_tenant_leak", leak]]));
    expect(leakReport.missing).toEqual(["zzz_fake_tenant_leak"]);

    const scoped = pgTable("zzz_fake_scoped", {
      id: uuid("id").primaryKey(),
      companyId: uuid("company_id").notNull(),
    });
    const scopedReport = classify(new Map([["zzz_fake_scoped", scoped]]));
    expect(scopedReport.missing).toEqual([]);
    expect(scopedReport.stale.length).toBe(Object.keys(NON_COMPANY_SCOPED_TABLES).length);
  });
});
