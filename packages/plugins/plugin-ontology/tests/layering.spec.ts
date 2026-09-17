/**
 * The two red lines from the architecture, as executable checks.
 *
 * The ontology is being incubated inside a Paperclip plugin, on the explicit
 * condition that the core stays liftable: "现在写的 Core 就是未来独立服务的代码,
 * 没有浪费". That promise decays the moment the core reaches for the host, so it
 * is checked rather than trusted — the same way the action parity and schema
 * column guards work.
 *
 * Checked here:
 *
 *   1. **Dependency direction.** Nothing in the core may import the plugin SDK,
 *      React, or the outer layers (the worker, the manifest, the UI). The core
 *      talks to the database through `SqlClient`, a port any PostgreSQL client
 *      satisfies.
 *
 *   2. **The ontology belongs to a tenant, never to a job.**
 *      "本体属于租户,不属于工单,不要把实体、关系挂在Job、Role上." Threading a
 *      work item through the schema is the one mistake that would make the
 *      ontology a by-product of the task system, and it is undetectable by
 *      reading a single migration — so it is asserted across all of them: the
 *      only host table any ontology table may reference is `public.companies`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The host-free core, now its own package. */
const SRC = new URL("../../../ontology-core/src/", import.meta.url);
/** The plugin's own sources — the assistant layer and the UI still live here. */
const PLUGIN_SRC = new URL("../src/", import.meta.url);
const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);

/**
 * Directories and files that make up the liftable core. Everything else
 * (`worker.ts`, `manifest.ts`, `ui/`) is an outer layer and may import the SDK.
 */
const CORE_TREES = ["graph", "architecture", "cognition", "transform"];
const CORE_FILES = ["provenance.ts", "relationEndpoints.ts", "enums.ts"];

/**
 * The assistant layer sits above the core: it needs the host's model config and
 * a database handle, so it may import the SDK. What it must not do is reach into
 * the view layer — it used to import the describe contract from a UI file, which
 * meant a UI file owned a cross-layer type.
 */
const ASSISTANT_TREES = ["aide"];

/** A package the core must not depend on, and why. */
const FORBIDDEN_IMPORTS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /@paperclipai\/plugin-sdk/,
    reason: "the core must not depend on the host — inject a SqlClient instead",
  },
  { pattern: /^react/, reason: "the core is not a UI layer" },
  {
    pattern: /(^|\/)(worker|manifest)\.js$/,
    reason: "the worker and the manifest are outer layers built on the core, not the reverse",
  },
  { pattern: /(^|\/)\.\.\/ui\//, reason: "the core must not reach into the UI layer" },
];

function collect(dir: URL, into: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const child = new URL(entry, dir);
    if (statSync(child).isDirectory()) collect(child, into);
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) into.push(child.pathname);
  }
  return into;
}

function filesIn(trees: string[], names: string[] = []): string[] {
  const files = trees.flatMap((tree) => collect(new URL(`${tree}/`, SRC)));
  for (const name of names) files.push(new URL(name, SRC).pathname);
  return files;
}

const coreFiles = (): string[] => filesIn(CORE_TREES, CORE_FILES);
const assistantFiles = (): string[] =>
  ASSISTANT_TREES.flatMap((tree) => collect(new URL(`${tree}/`, PLUGIN_SRC)));

/** Every module specifier an import statement names. */
function importsOf(path: string): string[] {
  const source = readFileSync(path, "utf8");
  const specifiers: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;
  for (let m; (m = re.exec(source)); ) specifiers.push(m[1]!);
  for (const m of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    specifiers.push(m[1]!);
  }
  return specifiers;
}

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => ({ name, sql: readFileSync(new URL(name, MIGRATIONS_DIR), "utf8") }));

describe("dependency direction", () => {
  const files = coreFiles();

  it("finds the core modules", () => {
    // A guard that silently checks nothing is worse than no guard.
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith("GraphStore.ts"))).toBe(true);
  });

  it("keeps the core free of host, UI and outer-layer imports", () => {
    const violations: string[] = [];
    for (const file of files) {
      for (const specifier of importsOf(file)) {
        for (const rule of FORBIDDEN_IMPORTS) {
          if (rule.pattern.test(specifier)) {
            violations.push(
              `  ${file.replace(/.*\/src\//, "src/")} imports "${specifier}" — ${rule.reason}`,
            );
          }
        }
      }
    }
    expect(violations, `layering violations:\n${violations.join("\n")}`).toEqual([]);
  });

  it("reaches the database through the SqlClient port, not the host type", () => {
    const store = readFileSync(new URL("graph/GraphStore.ts", SRC), "utf8");
    expect(store).toContain('from "./SqlClient.js"');
    expect(store).not.toContain("PluginDatabaseClient");
  });

  it("keeps the assistant layer out of the view layer", () => {
    const violations: string[] = [];
    for (const file of assistantFiles()) {
      for (const specifier of importsOf(file)) {
        if (/(^|\/)\.\.\/ui\//.test(specifier)) {
          violations.push(`  ${file.replace(/.*\/src\//, "src/")} imports "${specifier}"`);
        }
      }
    }
    expect(
      violations,
      `the assistant layer must take contracts from the core, not the UI:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("detects a violation when one is introduced", () => {
    // The rules are the test; prove they actually fire.
    const specifier = "@paperclipai/plugin-sdk";
    expect(FORBIDDEN_IMPORTS.some((rule) => rule.pattern.test(specifier))).toBe(true);
    expect(FORBIDDEN_IMPORTS.some((rule) => rule.pattern.test("react"))).toBe(true);
    expect(FORBIDDEN_IMPORTS.some((rule) => rule.pattern.test("../ui/app.js"))).toBe(true);
  });
});

describe("the ontology belongs to a tenant, not to a work item", () => {
  /** Host tables an ontology table is allowed to reference. */
  const ALLOWED_HOST_REFERENCES = new Set(["public.companies"]);

  const hostReferences = (): string[] => {
    const found = new Set<string>();
    for (const file of migrationFiles) {
      for (const m of file.sql.matchAll(/REFERENCES\s+(public\.[\w.]+)/gi)) found.add(m[1]!);
    }
    return [...found].sort();
  };

  it("references only the tenant table on the host side", () => {
    const references = hostReferences();
    const illegal = references.filter((r) => !ALLOWED_HOST_REFERENCES.has(r));
    expect(
      illegal,
      `ontology tables reference host tables beyond the tenant: ${illegal.join(", ")}`,
    ).toEqual([]);
    expect(references).toEqual(["public.companies"]);
  });

  it("scopes the object model to the tenant, never to a work item", () => {
    // "不要把实体、关系挂在Job、Role上". The check is on the entity and relation
    // tables specifically: the plugin's own scan jobs and chat message roles are
    // internal concepts of this system, not a coupling to the task system.
    const OBJECT_MODEL = [
      "ontology_node_types",
      "ontology_relation_types",
      "ontology_nodes",
      "ontology_edges",
    ];
    const forbidden = /\b(issue|task|assignment|session|employee|job)_?(id|ref|key)\b/i;

    const violations: string[] = [];
    for (const file of migrationFiles) {
      let current: string | null = null;
      for (const rawLine of file.sql.split("\n")) {
        const line = rawLine.replace(/--.*$/, "");
        const created = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."`[\]]+)/i.exec(line);
        if (created) current = created[1]!.split(".").pop()!.replace(/["`\[\]]/g, "");
        if (current && OBJECT_MODEL.includes(current) && forbidden.test(line)) {
          violations.push(`  ${file.name}: ${current} — ${line.trim()}`);
        }
      }
    }
    expect(
      violations,
      `the object model is coupled to a work item:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  /**
   * The tenant registry is the one table that does not carry a tenant column: it
   * *is* the tenant. Named rather than pattern-matched, so a new table has to be
   * added here on purpose to escape the check.
   */
  const TENANT_REGISTRY = ["ontology_tenants"];

  it("scopes every table that holds domain data to the tenant", () => {
    // Every ontology table carries `company_id`; a table without one could not
    // be isolated per customer.
    const missing: string[] = [];
    for (const file of migrationFiles) {
      for (const m of file.sql.matchAll(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."`[\]]+)\s*\(([\s\S]*?)\n\s*\);/gi,
      )) {
        const table = m[1]!.split(".").pop()!.replace(/["`\[\]]/g, "");
        if (TENANT_REGISTRY.includes(table)) continue;
        // Scoped to a tenant, however the tenant is named: the existing tables
        // reference the host table (`company_id`) and the ones the ontology now
        // owns reference `ontology_tenants` (`tenant_id`). A table with neither
        // is the failure this looks for.
        const body = m[2] ?? "";
        if (!/\b(company_id|tenant_id)\b/.test(body)) missing.push(m[1]!);
      }
    }
    expect(missing, `tables without a tenant column: ${missing.join(", ")}`).toEqual([]);
  });
});
