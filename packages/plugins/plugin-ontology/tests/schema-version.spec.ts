/**
 * The domain's schema version.
 *
 * A governed semantic layer has to be able to say which version of the model a
 * caller read. Without it nothing downstream is reproducible: an agent cannot
 * name the model behind its answer, a cache has no key, and a consumer cannot
 * tell that the model moved under it.
 *
 * The version lives on the domain and is bumped by the store's own mutators, so
 * every path that changes the model goes through it — the HTTP surface, the
 * bridge action, and whatever a standalone deployment adds later. These tests
 * drive the actions and assert on what reached the database, because the point
 * is that no caller has to remember to bump it.
 */
import { describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { PostgresGraphStore } from "../src/graph/GraphStore.js";
import type { SqlClient } from "../src/graph/SqlClient.js";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const DOMAIN_ID = "22222222-2222-4222-8222-222222222222";
const NODE_TYPE_ID = "33333333-3333-4333-8333-333333333333";

async function boot(): Promise<TestHarness> {
  const harness = createTestHarness({ manifest });
  // The store reads its rows back after writing, and treats `rowCount: 0` as
  // "no such row" — which the fake db reports for every statement. So the double
  // answers "nothing matched" and the change never completes, for a reason that
  // has nothing to do with the code under test.
  //
  // Wrap rather than replace: the harness's own implementations are what record
  // into `dbQueries` and `dbExecutes`, so replacing them would leave these
  // assertions with nothing to look at.
  const originalQuery = harness.ctx.db.query.bind(harness.ctx.db);
  const originalExecute = harness.ctx.db.execute.bind(harness.ctx.db);
  harness.ctx.db.query = (async (sql: string, params?: unknown[]) => {
    await originalQuery(sql, params);
    return [
      { id: NODE_TYPE_ID, key: "customer", domain_id: DOMAIN_ID, schema_version: 1 },
    ] as never;
  }) as typeof harness.ctx.db.query;
  harness.ctx.db.execute = (async (sql: string, params?: unknown[]) => {
    const result = await originalExecute(sql, params);
    return { rowCount: Math.max(result.rowCount, 1) };
  }) as typeof harness.ctx.db.execute;
  await plugin.definition.setup(harness.ctx);
  return harness;
}

/** Statements that move instance values from one property key to another. */
function renames(harness: TestHarness) {
  return harness.dbExecutes.filter(
    (entry: { sql: string }) =>
      /UPDATE/i.test(entry.sql)
      && entry.sql.includes("ontology_nodes")
      && /properties\s*-/.test(entry.sql),
  );
}

/**
 * The metadata of the audit row written for the last schema change.
 *
 * `before_state` and `after_state` are JSON strings too, so the metadata is the
 * *last* one — taking the first would read the before-state and look like a
 * missing field.
 */
function lastAuditMetadata(harness: TestHarness): Record<string, unknown> {
  const row = auditInserts(harness).at(-1);
  const raw = row?.params
    ?.filter((p): p is string => typeof p === "string" && p.trimStart().startsWith("{"))
    .at(-1);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

/** The version-bump statements the store issued. */
function bumps(harness: TestHarness) {
  return harness.dbExecutes.filter(
    (entry) =>
      /UPDATE/i.test(entry.sql)
      && entry.sql.includes("ontology_domains")
      && entry.sql.includes("schema_version"),
  );
}

describe("a schema change bumps the domain version", () => {
  it("bumps when an object type is created", async () => {
    const harness = await boot();
    await harness.performAction(
      "create-node-type",
      { domainId: DOMAIN_ID, key: "customer", displayName: "Customer" },
      { companyId: COMPANY_ID },
    );
    const issued = bumps(harness);
    expect(issued).toHaveLength(1);
    // The increment happens in SQL, not by reading then writing: two edits
    // landing together must not be handed the same version.
    expect(issued[0]!.sql).toMatch(/schema_version\s*=\s*schema_version\s*\+\s*1/);
    expect(issued[0]!.params).toContain(DOMAIN_ID);
  });

  it("bumps when an object type is edited", async () => {
    const harness = await boot();
    await harness.performAction(
      "update-node-type",
      { nodeTypeId: NODE_TYPE_ID, displayName: "Renamed" },
      { companyId: COMPANY_ID },
    );
    // The domain is taken from the row that came back, so the caller does not
    // have to know it.
    expect(bumps(harness)).toHaveLength(1);
  });

  it("bumps when an object type is deleted", async () => {
    const harness = await boot();
    await harness.performAction("delete-node-type", { nodeTypeId: NODE_TYPE_ID }, { companyId: COMPANY_ID });
    expect(bumps(harness)).toHaveLength(1);
  });

  it("bumps when a relation type is created", async () => {
    const harness = await boot();
    await harness.performAction(
      "create-relation-type",
      { domainId: DOMAIN_ID, key: "references", displayName: "references" },
      { companyId: COMPANY_ID },
    );
    expect(bumps(harness)).toHaveLength(1);
  });

  it("bumps when a relation type is edited and when it is deleted", async () => {
    const harness = await boot();
    await harness.performAction(
      "update-relation-type",
      { relationTypeId: NODE_TYPE_ID, displayName: "renamed" },
      { companyId: COMPANY_ID },
    );
    expect(bumps(harness)).toHaveLength(1);

    const second = await boot();
    await second.performAction(
      "delete-relation-type",
      { relationTypeId: NODE_TYPE_ID },
      { companyId: COMPANY_ID },
    );
    expect(bumps(second)).toHaveLength(1);
  });

  it("does not bump when a domain is merely renamed", async () => {
    // Renaming a domain is not a change to its model, and a version that moves
    // when nothing changed is a version nobody can trust.
    //
    // Driven against the store directly: `update-domain` is an HTTP-surface route
    // with no bridge handler, and this is a statement about the store anyway.
    // The SqlClient port is what makes that possible without a database.
    const issued: string[] = [];
    const db: SqlClient = {
      namespace: "ns",
      query: async (sql) => {
        issued.push(sql);
        return [{ id: DOMAIN_ID, domain_id: DOMAIN_ID }] as never;
      },
      execute: async (sql) => {
        issued.push(sql);
        return { rowCount: 1 };
      },
    };
    const store = new PostgresGraphStore(db);
    await store.updateDomain(COMPANY_ID, DOMAIN_ID, { displayName: "New name" });
    // The increment specifically: the store's own SELECT projection mentions the
    // column, so a looser check would pass for the wrong reason.
    expect(issued.filter((sql) => /schema_version\s*=\s*schema_version/.test(sql))).toEqual([]);
  });
});

describe("the version is readable by a caller", () => {
  it("is part of the domain a caller reads", async () => {
    const harness = await boot();
    await harness.getData("describe-domain", { companyId: COMPANY_ID, domainId: DOMAIN_ID });
    // The column being in the store's projection is what makes it visible to
    // every consumer of `get-domain`, `describe-domain` and `domain-detail` —
    // rather than to whichever ones remembered to select it.
    const read = harness.dbQueries.find(
      (entry) => entry.sql.includes("ontology_domains") && /SELECT/i.test(entry.sql),
    );
    expect(read?.sql).toContain("schema_version");
  });
});

/** INSERTs into the plugin's own audit table. */
function auditInserts(harness: TestHarness) {
  return harness.dbExecutes.filter((entry: { sql: string }) =>
    entry.sql.includes("INSERT INTO") && entry.sql.includes("ontology_audit_logs"),
  );
}

describe("the change is recorded in the ontology's own history", () => {
  it("writes the plugin's audit table, not only the host's activity feed", async () => {
    // The host's activity feed is an integration that disappears when the core is
    // deployed on its own; this table is the ontology's own history, and it is
    // the one a standalone deployment and `list-audit-logs` read.
    const harness = await boot();
    await harness.performAction(
      "update-node-type",
      { nodeTypeId: NODE_TYPE_ID, displayName: "Renamed" },
      { companyId: COMPANY_ID },
    );
    const rows = auditInserts(harness);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.params).toContain("schema_type_updated");
    expect(rows[0]!.params).toContain(DOMAIN_ID);
  });

  it("keeps before and after state, so the history is a diff and not a timestamp", async () => {
    const harness = await boot();
    await harness.performAction(
      "create-node-type",
      { domainId: DOMAIN_ID, key: "customer", displayName: "Customer" },
      { companyId: COMPANY_ID },
    );
    const entry = auditInserts(harness)[0]!;
    // null before (nothing existed), a row after.
    expect(entry.params).toContain(null);
    expect(entry.params!.some((p) => typeof p === "string" && p.includes("customer"))).toBe(true);
  });

  it("distinguishes the kind of type that changed", async () => {
    const harness = await boot();
    await harness.performAction(
      "delete-relation-type",
      { relationTypeId: NODE_TYPE_ID },
      { companyId: COMPANY_ID },
    );
    const entry = auditInserts(harness)[0]!;
    expect(entry.params).toContain("schema_type_deleted");
    expect(entry.params!.some((p) => typeof p === "string" && p.includes("relation_type"))).toBe(true);
  });
});

describe("a renamed property takes its data with it", () => {
  /** The type starts with `code`; the edit renames it to `orderNo`. */
  const bootWithSchema = async (): Promise<TestHarness> => {
    const harness = createTestHarness({ manifest });
    const priorSchema = JSON.stringify({ code: { type: "string" }, total: { type: "number" } });
    const originalQuery = harness.ctx.db.query.bind(harness.ctx.db);
    harness.ctx.db.query = (async (sql: string, params?: unknown[]) => {
      await originalQuery(sql, params);
      if (sql.includes("ontology_node_types") && /SELECT/i.test(sql)) {
        return [
          {
            id: NODE_TYPE_ID,
            key: "order",
            domain_id: DOMAIN_ID,
            properties_schema: JSON.parse(priorSchema),
          },
        ] as never;
      }
      if (sql.includes("COUNT(*)")) return [{ count: "3" }] as never;
      return [] as never;
    }) as typeof harness.ctx.db.query;
    const originalExecute = harness.ctx.db.execute.bind(harness.ctx.db);
    harness.ctx.db.execute = (async (sql: string, params?: unknown[]) => {
      const result = await originalExecute(sql, params);
      return { rowCount: Math.max(result.rowCount, 2) };
    }) as typeof harness.ctx.db.execute;
    await plugin.definition.setup(harness.ctx);
    return harness;
  };

  const edit = (harness: TestHarness, extra: Record<string, unknown>) =>
    harness.performAction(
      "update-node-type",
      {
        nodeTypeId: NODE_TYPE_ID,
        propertiesSchema: { orderNo: { type: "string" }, total: { type: "number" } },
        ...extra,
      },
      { companyId: COMPANY_ID },
    );

  it("moves the values when the rename is declared", async () => {
    const harness = await bootWithSchema();
    await edit(harness, { propertyRenames: { code: "orderNo" } });
    const moved = renames(harness);
    expect(moved).toHaveLength(1);
    // The old key is dropped and the new one receives its value, in one statement.
    expect(moved[0]!.sql).toContain("jsonb_build_object");
    expect(moved[0]!.params).toEqual([COMPANY_ID, NODE_TYPE_ID, "code", "orderNo"]);
  });

  it("records what the migration did in the change history", async () => {
    const harness = await bootWithSchema();
    await edit(harness, { propertyRenames: { code: "orderNo" } });
    const metadata = lastAuditMetadata(harness);
    expect(metadata.migrated).toEqual([{ from: "code", to: "orderNo" }]);
    expect(metadata.orphaned).toEqual([]);
  });

  it("moves nothing when the caller declares no rename", async () => {
    const harness = await bootWithSchema();
    await edit(harness, {});
    expect(renames(harness)).toEqual([]);
  });

  it("counts orphans with scalar parameters, not an array", async () => {
    // The host binds parameters as scalars, so jsonb's `?|` with a text[] never
    // reaches PostgreSQL. Only a real instance caught that; a fake db does not
    // parse SQL, so this asserts the shape the binder can actually send.
    const harness = await bootWithSchema();
    await edit(harness, {});
    const count = harness.dbQueries.find((entry: { sql: string }) => entry.sql.includes("COUNT(*)"));
    expect(count?.sql).not.toContain("?|");
    expect(count?.sql).toContain("properties ? $3::text");
    expect(count?.params).toEqual([COMPANY_ID, NODE_TYPE_ID, "code"]);
  });

  it("counts the instances whose values the edit orphaned", async () => {
    // Dropping a field on purpose is legitimate; doing it silently is not.
    const harness = await bootWithSchema();
    await edit(harness, {});
    const metadata = lastAuditMetadata(harness);
    expect(metadata.orphaned).toEqual(["code"]);
    expect(metadata.orphanedInstances).toBe(3);
  });

  it("ignores a rename the schema diff does not support", async () => {
    const harness = await bootWithSchema();
    await edit(harness, { propertyRenames: { code: "somethingElse" } });
    expect(renames(harness)).toEqual([]);
    const metadata = lastAuditMetadata(harness);
    expect(metadata.ignoredRenames).toEqual([{ from: "code", to: "somethingElse" }]);
    expect(metadata.orphaned).toEqual(["code"]);
  });

  it("stays quiet when the edit removes nothing", async () => {
    const harness = await bootWithSchema();
    await harness.performAction(
      "update-node-type",
      {
        nodeTypeId: NODE_TYPE_ID,
        propertiesSchema: { code: { type: "string" }, total: { type: "number" }, note: { type: "string" } },
      },
      { companyId: COMPANY_ID },
    );
    expect(renames(harness)).toEqual([]);
    expect(lastAuditMetadata(harness).orphaned).toBeUndefined();
  });
});

describe("the change is audited", () => {
  it("records what changed, against the type", async () => {
    const harness = await boot();
    await harness.performAction(
      "update-node-type",
      { nodeTypeId: NODE_TYPE_ID, displayName: "Renamed" },
      { companyId: COMPANY_ID },
    );
    // Without this, a property could be renamed and nothing recorded it.
    expect(harness.activity.map((entry) => entry.message)).toEqual([
      "更新对象类型 customer",
    ]);
    expect(harness.activity[0]!.entityType).toBe("ontology_node_type");
  });

  it("records a creation too", async () => {
    const harness = await boot();
    await harness.performAction(
      "create-node-type",
      { domainId: DOMAIN_ID, key: "customer", displayName: "Customer" },
      { companyId: COMPANY_ID },
    );
    expect(harness.activity.map((entry) => entry.message)).toEqual([
      "新建对象类型 customer",
    ]);
  });

  it("does not fail the change when the audit write fails", async () => {
    const harness = await boot();
    harness.ctx.activity.log = (async () => {
      throw new Error("activity store down");
    }) as typeof harness.ctx.activity.log;
    // The change already happened; losing the log line must not undo it.
    await expect(
      harness.performAction(
        "create-node-type",
        { domainId: DOMAIN_ID, key: "customer", displayName: "Customer" },
        { companyId: COMPANY_ID },
      ),
    ).resolves.toBeTruthy();
    expect(bumps(harness)).toHaveLength(1);
  });
});
