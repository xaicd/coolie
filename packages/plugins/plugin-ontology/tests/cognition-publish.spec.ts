/**
 * Regression guard for the two places the import pipeline collected material and
 * then threw it away:
 *
 *   1. `extractRepoDraft` folded entities down to name/displayName/layer and
 *      dropped the columns and comments `parseSqlDdl` had just extracted.
 *   2. `publishCognitionDraft` then called `createNodeType` without a
 *      `propertiesSchema`, so even if the draft had carried fields they would
 *      not have reached the table.
 *
 * A table imported this way used to arrive with no fields at all.
 */
import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { extractRepoDraft, type SourceFile } from "@paperclipai/ontology-core/cognition/AstExtractor.js";

const DDL: SourceFile = {
  path: "schema/orders.sql",
  content: `
    CREATE TABLE t_order (
      order_id     bigint        NOT NULL, -- 订单号
      total_amount decimal(10,2) NOT NULL, -- 订单总额
      status       varchar(16)   NOT NULL  -- 订单状态
    ) COMMENT='订单主表';
  `,
};

describe("extractRepoDraft carries fields and comments", () => {
  it("keeps each column and its comment on the seed node type", () => {
    const draft = extractRepoDraft([DDL]);
    const order = draft.seedNodeTypes.find((nt) => nt.typeName === "t_order");
    expect(order).toBeTruthy();
    expect(order!.properties).toEqual({
      order_id: { type: "bigint", description: "订单号" },
      total_amount: { type: "decimal", description: "订单总额" },
      status: { type: "varchar", description: "订单状态" },
    });
  });

  it("keeps the table comment as the type description", () => {
    const draft = extractRepoDraft([DDL]);
    const order = draft.seedNodeTypes.find((nt) => nt.typeName === "t_order");
    expect(order!.description).toBe("订单主表");
  });

  it("still folds entities without fields", () => {
    const draft = extractRepoDraft([{ path: "svc/OrderService.ts", content: "export class OrderService {}" }]);
    const svc = draft.seedNodeTypes.find((nt) => nt.typeName === "OrderService");
    expect(svc).toBeTruthy();
    expect(svc!.properties).toBeUndefined();
  });
});

describe("publishCognitionJob forwards propertiesSchema", () => {
  async function publish(draftNodeType: Record<string, unknown>) {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    // The store validates every cognition transition, and the publish path makes
    // two (awaiting_confirm -> publishing -> completed). Track the status so the
    // stub behaves like a real row rather than returning one frozen value.
    let jobStatus = "awaiting_confirm";
    const originalExecute = harness.ctx.db.execute.bind(harness.ctx.db);

    harness.ctx.db.query = (async (sql: string) => {
      if (sql.includes("ontology_cognition_jobs") && sql.includes("seed_node_types")) {
        return [{
          seed_node_types: [draftNodeType],
          seed_relation_types: [],
          seed_actions: [],
          result: {},
        }];
      }
      if (sql.includes("ontology_cognition_jobs")) {
        return [{ status: jobStatus }];
      }
      if (sql.includes("ontology_domains")) {
        return [{ id: "dom-1", company_id: "co-1", slug: "ecom", display_name: "Ecom", version: 1, status: "active" }];
      }
      return [];
    }) as typeof harness.ctx.db.query;

    harness.ctx.db.execute = (async (sql: string, params?: unknown[]) => {
      if (sql.includes("ontology_cognition_jobs") && /SET\s+status/i.test(sql)) {
        jobStatus = String(params?.[2] ?? jobStatus);
      }
      // Keep the harness's own recording behaviour for the assertions below.
      return originalExecute(sql, params as never);
    }) as typeof harness.ctx.db.execute;

    await harness.performAction("publish-cognition-job", {
      companyId: "co-1",
      jobId: "job-1",
      domainId: "dom-1",
    });

    const insert = harness.dbExecutes.find(
      (entry) => entry.sql.includes("INSERT INTO") && entry.sql.includes("ontology_node_types"),
    );
    return insert;
  }

  it("writes the extracted schema into the node type row", async () => {
    const insert = await publish({
      typeName: "t_order",
      displayName: "t_order",
      layer: "aggregate_root",
      properties: { order_id: { type: "bigint", description: "订单号" } },
      description: "订单主表",
    });

    expect(insert, "expected an INSERT into ontology_node_types").toBeTruthy();
    // createNodeType binds: 0 id, 1 company, 2 domain, 3 key, 4 display_name,
    // 5 description, 6 properties_schema, 7 interfaces, 8 layer.
    expect(insert!.params![3]).toBe("t_order");
    expect(insert!.params![5]).toBe("订单主表");
    expect(JSON.parse(String(insert!.params![6]))).toEqual({
      order_id: { type: "bigint", description: "订单号" },
    });
    expect(insert!.params![8]).toBe("aggregate_root");
  });

  it("accepts the propertiesSchema key too", async () => {
    const insert = await publish({
      typeName: "t_order",
      displayName: "t_order",
      propertiesSchema: { total: { type: "number" } },
    });
    expect(JSON.parse(String(insert!.params![6]))).toEqual({ total: { type: "number" } });
  });

  it("falls back to an empty schema when the draft has no fields", async () => {
    const insert = await publish({ typeName: "OrderService", displayName: "OrderService" });
    expect(JSON.parse(String(insert!.params![6]))).toEqual({});
  });
});
