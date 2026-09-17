/**
 * Smoke tests for the Phase 6 legacy parsers + Phase 7 module map.
 * Pure-function tests — no DB, no worker, no React.
 */
import { describe, expect, it } from "vitest";
import { parseOpenAPI } from "../src/legacy/openapiParser.js";
import { parseSourceFile } from "@paperclipai/ontology-core/cognition/AstExtractor.js";
import {
  inferModuleFromText,
  MODULE_PREFIX_COUNT,
} from "../src/legacy/modulePrefixMap.js";

describe("parseOpenAPI", () => {
  it("extracts node types and actions from a minimal Swagger 2.0 doc", () => {
    const doc = {
      swagger: "2.0",
      info: { title: "Orders", version: "1.0" },
      definitions: {
        Order: {
          type: "object",
          properties: {
            id: { type: "integer", format: "int64" },
            userId: { type: "integer" },
          },
          required: ["id"],
        },
        User: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
          },
        },
      },
      paths: {
        "/orders": {
          get: { operationId: "listOrders", summary: "List orders" },
          post: {
            operationId: "createOrder",
            description: "Create a new order",
          },
        },
      },
    };
    const out = parseOpenAPI(doc);
    expect(out.nodeTypes.map((n) => n.key)).toEqual(["Order", "User"]);
    expect(out.nodeTypes[0]!.properties).toMatchObject({
      id: { type: "integer" },
    });
    expect(out.actions.map((a) => a.key)).toEqual(["listOrders", "createOrder"]);
    expect(out.actions[0]!.method).toBe("GET");
    expect(out.actions[0]!.endpoint).toBe("/orders");
  });

  it("throws on invalid input", () => {
    expect(() => parseOpenAPI({})).toThrow();
  });

  it("skips non-object schemas (primitives)", () => {
    const out = parseOpenAPI({
      openapi: "3.0.0",
      components: {
        schemas: {
          Status: { type: "string" },
          Order: { type: "object", properties: { id: { type: "string" } } },
        },
      },
      paths: {},
    });
    expect(out.nodeTypes.map((n) => n.key)).toEqual(["Order"]);
  });
});


describe("parseSourceFile (SQL path)", () => {
  // Smoke coverage for the wizard's "数据" tab — the same surface
  // Phase 1 stubbed with a broken parseSqlDdl dynamic import. Phase 8
  // makes the path verifiable so the regression stays fixed.
  it("extracts a CREATE TABLE and its columns", () => {
    const sql = `
      CREATE TABLE t_order (
        id BIGINT PRIMARY KEY,
        user_id BIGINT REFERENCES t_user(id),
        total DECIMAL
      );
    `;
    const out = parseSourceFile("wizard.sql", sql);
    const order = out.entities.find((e) => e.typeName === "t_order");
    expect(order).toBeDefined();
    expect(order!.properties!.map((p) => p.name)).toEqual(["id", "user_id", "total"]);
  });

  it("extracts REFERENCES relations", () => {
    const sql = `
      CREATE TABLE t_order (id BIGINT);
      CREATE TABLE t_order_item (
        order_id BIGINT REFERENCES t_order(id)
      );
    `;
    const out = parseSourceFile("wizard.sql", sql);
    expect(out.relations.length).toBeGreaterThan(0);
    expect(out.relations.some((r) => r.sourceType === "t_order_item" && r.targetType === "t_order")).toBe(true);
  });
});

describe("inferModuleFromText", () => {
  it("matches Chinese keywords", () => {
    expect(inferModuleFromText("订单表 t_order")).toBe("order");
    expect(inferModuleFromText("库存预警")).toBe("inventory");
    expect(inferModuleFromText("会员等级")).toBe("member");
  });

  it("matches English synonyms", () => {
    expect(inferModuleFromText("payments_v2")).toBe("payment");
    expect(inferModuleFromText("notifications_log")).toBe("notification");
  });

  it("falls back to 'core' when nothing matches", () => {
    expect(inferModuleFromText("xyz_legacy_table")).toBe("core");
  });

  it("ships a meaningful number of module entries", () => {
    // DS ships 75 entries; our port covers the same surface area
    // but collapses some near-duplicate lines (e.g. 促销 / 优惠
    // both → "promotion"). The exact count is informational; the
    // floor protects against an accidental empty-map regression.
    expect(MODULE_PREFIX_COUNT).toBeGreaterThanOrEqual(50);
  });
});