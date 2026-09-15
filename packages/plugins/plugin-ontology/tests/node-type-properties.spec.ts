/**
 * Object-type properties must survive the trip from the UI to the store.
 *
 * Two failures made every object type persist as a bare shell, so the cockpit
 * rendered "尚未配置属性" on all of them:
 *
 *   1. the `create-node-type` action read only key/displayName/description and
 *      silently dropped `propertiesSchema`;
 *   2. the cockpit dispatches mutations as `{ params, body }` while the action
 *      handlers read a flat params object, so even registered keys could not
 *      see their payload.
 *
 * These tests drive the registered actions through the SDK test harness and
 * assert on the SQL the store actually emitted, so they fail if either
 * convention regresses.
 */
import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin, { SAMPLE_NODE_DEFS, SAMPLE_NODE_TYPE_DEFS } from "../src/worker.js";

const COMPANY_ID = "company-1";
const DOMAIN_ID = "domain-1";

const CUSTOMER_SCHEMA = {
  name: { type: "string" },
  email: { type: "string", format: "email" },
};

type Harness = ReturnType<typeof createTestHarness>;

async function boot(): Promise<Harness> {
  const harness = createTestHarness({ manifest });
  await plugin.definition.setup(harness.ctx);
  return harness;
}

function nodeTypeInserts(harness: Harness) {
  return harness.dbExecutes.filter(
    (entry) => entry.sql.includes("INSERT INTO") && entry.sql.includes("ontology_node_types"),
  );
}

function nodeInserts(harness: Harness) {
  return harness.dbExecutes.filter(
    (entry) => entry.sql.includes("INSERT INTO") && entry.sql.includes("ontology_nodes"),
  );
}

function nodeTypeUpdates(harness: Harness) {
  return harness.dbExecutes.filter(
    (entry) => entry.sql.includes("UPDATE") && entry.sql.includes("ontology_node_types"),
  );
}

/** The INSERT binds `properties_schema` as $7 → params index 6. */
function insertedPropertiesSchema(harness: Harness): unknown {
  const [insert] = nodeTypeInserts(harness);
  expect(insert, "expected the action to INSERT a node type").toBeTruthy();
  return insert!.params![6];
}

/**
 * The UPDATE binds `properties_schema` as `CASE WHEN $6 THEN $7` — i.e. guard
 * at params[5], value at params[6]. `$1`/`$2` are company/id and `$3` is the
 * display name.
 */
const UPDATE_COMPANY = 0;
const UPDATE_NODE_TYPE_ID = 1;
const UPDATE_DISPLAY_NAME = 2;
const UPDATE_SCHEMA_GUARD = 5;
const UPDATE_SCHEMA_VALUE = 6;

function updatedPropertiesSchema(harness: Harness): unknown {
  const [update] = nodeTypeUpdates(harness);
  expect(update, "expected the action to UPDATE a node type").toBeTruthy();
  return update!.params![UPDATE_SCHEMA_VALUE];
}

describe("create-node-type keeps propertiesSchema", () => {
  it("forwards propertiesSchema from the flat params shape", async () => {
    const harness = await boot();

    await harness.performAction(
      "create-node-type",
      {
        companyId: COMPANY_ID,
        domainId: DOMAIN_ID,
        key: "customer",
        displayName: "Customer",
        propertiesSchema: CUSTOMER_SCHEMA,
      },
      { companyId: COMPANY_ID },
    );

    expect(insertedPropertiesSchema(harness)).toBe(JSON.stringify(CUSTOMER_SCHEMA));
  });

  it("forwards propertiesSchema from the nested { body } shape the cockpit dispatches", async () => {
    const harness = await boot();

    await harness.performAction(
      "create-node-type",
      { body: { domainId: DOMAIN_ID, key: "customer", displayName: "Customer", propertiesSchema: CUSTOMER_SCHEMA } },
      { companyId: COMPANY_ID },
    );

    expect(insertedPropertiesSchema(harness)).toBe(JSON.stringify(CUSTOMER_SCHEMA));
  });

  it("defaults to an empty schema when none is supplied", async () => {
    const harness = await boot();

    await harness.performAction(
      "create-node-type",
      { domainId: DOMAIN_ID, key: "customer", displayName: "Customer" },
      { companyId: COMPANY_ID },
    );

    expect(insertedPropertiesSchema(harness)).toBe("{}");
  });

  it("rejects a non-object propertiesSchema instead of dropping it", async () => {
    const harness = await boot();

    await expect(
      harness.performAction(
        "create-node-type",
        { domainId: DOMAIN_ID, key: "customer", displayName: "Customer", propertiesSchema: "email:string" },
        { companyId: COMPANY_ID },
      ),
    ).rejects.toThrow(/propertiesSchema must be a JSON object/);

    expect(nodeTypeInserts(harness)).toHaveLength(0);
  });
});

describe("update-node-type accepts both call shapes", () => {
  it("writes the merged schema when called as { params, body }", async () => {
    const harness = await boot();

    await expect(
      harness.performAction(
        "update-node-type",
        { params: { nodeTypeId: "nt-1" }, body: { propertiesSchema: CUSTOMER_SCHEMA } },
        { companyId: COMPANY_ID },
      ),
      // The harness's fake db reports rowCount 0, so the handler reports a miss.
      // The UPDATE it issued is what we assert on.
    ).rejects.toThrow(/Node type not found/);

    const [update] = nodeTypeUpdates(harness);
    expect(update!.params![UPDATE_NODE_TYPE_ID]).toBe("nt-1");
    expect(update!.params![UPDATE_SCHEMA_GUARD]).toBe(true);
    expect(updatedPropertiesSchema(harness)).toBe(JSON.stringify(CUSTOMER_SCHEMA));
  });

  it("writes the merged schema when called with flat params", async () => {
    const harness = await boot();

    await expect(
      harness.performAction(
        "update-node-type",
        { nodeTypeId: "nt-2", propertiesSchema: CUSTOMER_SCHEMA },
        { companyId: COMPANY_ID },
      ),
    ).rejects.toThrow(/Node type not found/);

    expect(updatedPropertiesSchema(harness)).toBe(JSON.stringify(CUSTOMER_SCHEMA));
  });

  it("leaves properties_schema untouched when the body omits it", async () => {
    const harness = await boot();

    await expect(
      harness.performAction(
        "update-node-type",
        { params: { nodeTypeId: "nt-3" }, body: { displayName: "Renamed" } },
        { companyId: COMPANY_ID },
      ),
    ).rejects.toThrow(/Node type not found/);

    const [update] = nodeTypeUpdates(harness);
    expect(update!.params![UPDATE_SCHEMA_GUARD]).toBe(false);
    expect(update!.params![UPDATE_DISPLAY_NAME]).toBe("Renamed");
  });
});

describe("domain-detail exposes propertiesSchema for the workbench", () => {
  it("maps the store's properties_schema onto propertiesSchema", async () => {
    const harness = await boot();

    // `listNodeTypes` returns the raw row; the workbench reads the camelCase
    // field. A rename regression here makes every object type look empty in the
    // UI even though the data is stored.
    harness.ctx.db.query = (async (sql: string) => {
      if (sql.includes("ontology_node_types")) {
        return [
          {
            id: "nt-1",
            key: "customer",
            display_name: "Customer",
            properties_schema: CUSTOMER_SCHEMA,
          },
        ];
      }
      return [];
    }) as typeof harness.ctx.db.query;

    const detail = await harness.getData<{ nodeTypes: Array<Record<string, unknown>> }>(
      "domain-detail",
      { companyId: COMPANY_ID, domainId: DOMAIN_ID },
    );

    expect(detail.nodeTypes[0]!.propertiesSchema).toEqual(CUSTOMER_SCHEMA);
  });
});

describe("seed-samples ships object types with real attributes", () => {
  it("declares a non-empty propertiesSchema for every sample type", () => {
    expect(SAMPLE_NODE_TYPE_DEFS.length).toBeGreaterThan(0);
    for (const def of SAMPLE_NODE_TYPE_DEFS) {
      expect(
        Object.keys(def.propertiesSchema).length,
        `${def.key} must ship attributes`,
      ).toBeGreaterThan(0);
    }
  });

  it("declares instance values for every sample node", () => {
    expect(SAMPLE_NODE_DEFS.length).toBeGreaterThan(0);
    for (const def of SAMPLE_NODE_DEFS) {
      expect(
        Object.keys(def.properties).length,
        `${def.key} must ship instance properties`,
      ).toBeGreaterThan(0);
    }
  });

  it("passes each schema to the store when seeding an empty domain", async () => {
    const harness = await boot();

    // The harness's fake db returns no rows, and the seed reads every insert
    // back (createNodeType/createNode/...). Hand it a synthetic row so the seed
    // runs to completion; we assert on the INSERTs it issued.
    harness.ctx.db.query = (async () => [{ id: "synthetic-id" }]) as typeof harness.ctx.db.query;

    await harness.performAction("seed-samples", { domainId: DOMAIN_ID }, { companyId: COMPANY_ID });

    const schemaByKey = new Map(
      nodeTypeInserts(harness).map((entry) => [entry.params![3], entry.params![6]]),
    );
    expect(schemaByKey.size).toBe(SAMPLE_NODE_TYPE_DEFS.length);
    for (const def of SAMPLE_NODE_TYPE_DEFS) {
      expect(
        schemaByKey.get(def.key),
        `${def.key} was seeded without its propertiesSchema`,
      ).toBe(JSON.stringify(def.propertiesSchema));
    }

    // The node INSERT binds `properties` as $7 → params index 6, and `key` as $5.
    const propsByKey = new Map(
      nodeInserts(harness).map((entry) => [entry.params![4], entry.params![6]]),
    );
    expect(propsByKey.size).toBe(SAMPLE_NODE_DEFS.length);
    for (const def of SAMPLE_NODE_DEFS) {
      expect(
        propsByKey.get(def.key),
        `${def.key} was seeded without instance properties`,
      ).toBe(JSON.stringify(def.properties));
    }
  });
});
