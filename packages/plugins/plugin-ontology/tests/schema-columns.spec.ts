/**
 * Schema-drift guard: every column the store references must exist.
 *
 * The plugin's tests are pure — none of them executes SQL — so a query naming a
 * column that does not exist reads as correct code and only fails at runtime,
 * in production, for whoever happens to have that data. That is not
 * hypothetical: `describeDomain` selected `sp.description`, which lives on the
 * business-systems table rather than `ontology_sub_projects`, so the whole
 * domain description threw for any domain that had a business system — taking
 * the assistant's context and the governance panel with it.
 *
 * This test derives the real column set from the migrations and checks the two
 * places the store names columns:
 *
 *   1. `alias.column` references inside a query, where the alias is bound by a
 *      `FROM`/`JOIN` in the same statement;
 *   2. the `*_COLS` projection constants, resolved through their `SELECT`.
 *
 * A narrow projection is the quieter cousin of the same mistake — it writes a
 * column and never reads it back — and is out of scope here.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);
const STORE = new URL("../src/graph/GraphStore.ts", import.meta.url);

/** Clause keywords that lead a CREATE TABLE body line without being columns. */
const NON_COLUMN_KEYWORDS = new Set([
  "primary", "foreign", "unique", "constraint", "check", "exclude",
  "like", "inherits", "partition", "using",
]);

/**
 * `key` and `index` are both clause keywords (`KEY (col)`) *and* ordinary column
 * names — `ontology_node_types.key` is a column. Only the clause reads as a
 * keyword, which is the one followed by a parenthesised list.
 */
function isClauseLine(line: string, token: string): boolean {
  const lower = token.toLowerCase();
  if (NON_COLUMN_KEYWORDS.has(lower)) return true;
  if (lower !== "key" && lower !== "index") return false;
  return line.slice(token.length).trimStart().startsWith("(");
}

function unquote(name: string): string {
  return name.replace(/["`[\]]/g, "");
}

/** table → columns, accumulated over every migration in order. */
export function schemaColumns(files: Array<{ name: string; sql: string }>): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const touch = (table: string): Set<string> => {
    const key = unquote(table).split(".").pop()!.toLowerCase();
    const existing = tables.get(key);
    if (existing) return existing;
    const fresh = new Set<string>();
    tables.set(key, fresh);
    return fresh;
  };

  for (const file of files) {
    const sql = file.sql;
    const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."`[\]]+)\s*\(([\s\S]*?)\n\s*\);/gi;
    for (let m; (m = createRe.exec(sql)); ) {
      const columns = touch(m[1]!);
      for (const rawLine of (m[2] ?? "").split("\n")) {
        const line = rawLine.replace(/--.*$/, "").trim();
        if (line === "" || line.startsWith(")")) continue;
        const token = /^([A-Za-z_][\w$]*)/.exec(line)?.[1];
        if (!token || isClauseLine(line, token)) continue;
        columns.add(token.toLowerCase());
      }
    }

    // One ALTER can add several columns, and only the first `ADD COLUMN` is
    // preceded by `ALTER TABLE` — the rest are comma-continued lines.
    const alterRe = /ALTER\s+TABLE\s+(?:ONLY\s+)?([\w."`[\]]+)([\s\S]*?);/gi;
    for (let m; (m = alterRe.exec(sql)); ) {
      const columns = touch(m[1]!);
      for (const add of m[2]!.matchAll(
        /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][\w$]*)/gi,
      )) {
        columns.add(add[1]!.toLowerCase());
      }
    }

    // A rename or a drop would invalidate the model above; fail loudly instead
    // of silently drifting.
    const destructive = /ALTER\s+TABLE[\s\S]{0,80}?\b(DROP\s+COLUMN|RENAME\s+COLUMN)\b/i.exec(sql);
    if (destructive) {
      throw new Error(
        `${file.name} drops or renames a column; this guard's column model needs updating`,
      );
    }
  }
  return tables;
}

/** `NAME_COLS = "a, b, c"` (the strings may be concatenated over lines). */
export function projectionConstants(store: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = /static\s+readonly\s+(\w*_COLS)\s*=\s*([\s\S]*?);/g;
  for (let m; (m = re.exec(store)); ) {
    const literals = [...m[2]!.matchAll(/"([^"]*)"/g)].map((l) => l[1]!);
    if (literals.length === 0) continue;
    out.set(
      m[1]!,
      literals
        .join(",")
        .split(",")
        .map((c) => c.trim().split(/\s+/).pop()!.toLowerCase())
        .filter((c) => c !== ""),
    );
  }
  return out;
}

/**
 * The table a projection constant belongs to: the first `FROM` that sits
 * outside any parentheses. A correlated subquery has its own `FROM`, and
 * reading that one attributes the outer column list to the wrong table —
 * `SELECT ${RELATION_TYPE_COLS}, (SELECT … FROM ontology_edges e) FROM
 * ontology_relation_types rt` is exactly that shape.
 */
function outerTable(statement: string): string | undefined {
  let depth = 0;
  const re = /[()]|FROM\s+\$\{this\.table\("(\w+)"\)\}/g;
  for (let m; (m = re.exec(statement)); ) {
    if (m[0] === "(") depth += 1;
    else if (m[0] === ")") depth -= 1;
    else if (depth === 0) return m[1];
  }
  return undefined;
}

/** alias → table, for the `FROM`/`JOIN` clauses of one statement. */
function aliasesOf(statement: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const re = /(?:FROM|JOIN)\s+\$\{this\.table\("(\w+)"\)\}\s*(?:AS\s+)?([A-Za-z_]\w*)?/g;
  for (let m; (m = re.exec(statement)); ) {
    const alias = m[2];
    if (alias && !["WHERE", "ORDER", "GROUP", "ON", "LEFT", "INNER", "JOIN", "SET", "VALUES"].includes(alias.toUpperCase())) {
      aliases.set(alias, m[1]!);
    }
  }
  return aliases;
}

interface Violation {
  table: string;
  column: string;
  context: string;
}

export function findUnknownColumns(
  store: string,
  tables: Map<string, Set<string>>,
): Violation[] {
  const constants = projectionConstants(store);
  const violations: Violation[] = [];
  const seen = new Set<string>();

  // Statements are the template literals that mention a table.
  for (const match of store.matchAll(/`([^`]*)/g)) {
    const statement = match[1]!;
    if (!statement.includes("this.table(")) continue;
    const aliases = aliasesOf(statement);
    const context = statement.replace(/\s+/g, " ").trim().slice(0, 70);

    // 1) `alias.column`, where the alias is bound in this statement.
    for (const ref of statement.matchAll(/\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\b/g)) {
      const table = aliases.get(ref[1]!);
      if (!table) continue;
      const column = ref[2]!.toLowerCase();
      const known = tables.get(table.toLowerCase());
      if (!known) continue;
      const key = `${table}.${column}`;
      if (known.has(column) || seen.has(key)) continue;
      seen.add(key);
      violations.push({ table, column, context });
    }

    // 2) The projection constants, resolved through their SELECT.
    const from = outerTable(statement);
    if (!from) continue;
    for (const used of statement.matchAll(/\$\{\w+\.(\w*_COLS)\}/g)) {
      const columns = constants.get(used[1]!);
      if (!columns) continue;
      for (const column of columns) {
        const known = tables.get(from.toLowerCase());
        if (!known || known.has(column)) continue;
        const key = `${from}.${column}`;
        if (seen.has(key)) continue;
        seen.add(key);
        violations.push({ table: from, column, context });
      }
    }
  }
  return violations;
}

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => ({ name, sql: readFileSync(new URL(name, MIGRATIONS_DIR), "utf8") }));
const tables = schemaColumns(migrationFiles);
const store = readFileSync(STORE, "utf8");

describe("schemaColumns", () => {
  it("reads CREATE TABLE columns and later ADD COLUMNs", () => {
    const known = schemaColumns([
      {
        name: "001.sql",
        sql: [
          "CREATE TABLE plugin_x.things (",
          "  id uuid PRIMARY KEY,",
          "  name text NOT NULL,",
          "  created_at timestamptz NOT NULL DEFAULT now(),",
          "  CONSTRAINT things_name_unique UNIQUE (name),",
          "  PRIMARY KEY (id)",
          ");",
          "ALTER TABLE plugin_x.things ADD COLUMN remark text NOT NULL DEFAULT '';",
        ].join("\n"),
      },
    ]);
    expect([...(known.get("things") ?? [])].sort()).toEqual([
      "created_at", "id", "name", "remark",
    ]);
  });

  it("keys on the table name, ignoring the schema prefix", () => {
    expect(tables.has("ontology_sub_projects")).toBe(true);
    expect(tables.has("ontology_node_types")).toBe(true);
  });

  it("knows the real columns of the tables the store queries", () => {
    // The exact column whose absence broke `describeDomain`.
    expect(tables.get("ontology_sub_projects")!.has("description")).toBe(false);
    expect(tables.get("ontology_sub_projects")!.has("remark")).toBe(true);
    expect(tables.get("ontology_business_systems")!.has("description")).toBe(true);
  });
});

describe("projectionConstants", () => {
  it("reads a constant, including one concatenated across lines", () => {
    const constants = projectionConstants(`
      private static readonly A_COLS = "id, name";
      private static readonly B_COLS =
        "id, name, " +
        "other";
    `);
    expect(constants.get("A_COLS")).toEqual(["id", "name"]);
    expect(constants.get("B_COLS")).toEqual(["id", "name", "other"]);
  });

  it("reads the store's own projection constants", () => {
    expect(projectionConstants(store).get("NODE_TYPE_COLS")).toContain("metadata");
  });
});

describe("findUnknownColumns", () => {
  it("catches a qualified column that does not exist", () => {
    const violations = findUnknownColumns(
      "`SELECT sp.id, sp.description FROM ${this.table(\"ontology_sub_projects\")} sp`",
      tables,
    );
    expect(violations.map((v) => `${v.table}.${v.column}`)).toEqual([
      "ontology_sub_projects.description",
    ]);
  });

  it("accepts a column that does exist, aliased or not", () => {
    expect(
      findUnknownColumns(
        "`SELECT sp.id, sp.remark AS description FROM ${this.table(\"ontology_sub_projects\")} sp`",
        tables,
      ),
    ).toEqual([]);
  });

  it("ignores a qualifier that is not a table alias in this statement", () => {
    // `public.companies` is a schema-qualified name, and a stray `foo.bar` is
    // not something this guard can judge.
    expect(
      findUnknownColumns(
        "`SELECT id FROM ${this.table(\"ontology_domains\")} WHERE public.companies.id = foo.bar`",
        tables,
      ),
    ).toEqual([]);
  });

  it("catches a projection constant that names a nonexistent column", () => {
    const violations = findUnknownColumns(
      [
        'static readonly THING_COLS = "id, nope";',
        '`SELECT ${PostgresGraphStore.THING_COLS} FROM ${this.table("ontology_domains")}`',
      ].join("\n"),
      tables,
    );
    expect(violations.map((v) => `${v.table}.${v.column}`)).toEqual(["ontology_domains.nope"]);
  });
});

describe("the store's queries against the real schema", () => {
  it("names only columns that exist", () => {
    const violations = findUnknownColumns(store, tables);
    expect(
      violations,
      `GraphStore references columns the migrations never create:\n` +
        violations.map((v) => `  ${v.table}.${v.column}  —  in: ${v.context}`).join("\n"),
    ).toEqual([]);
  });
});
