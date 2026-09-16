/**
 * Description matching between a legacy source and an existing domain.
 *
 * The interesting behaviour is the degradation path: an exact type+field hit,
 * then a unique-field-name hit marked weak, then nothing. Getting the weak tier
 * too cheap would silently mislabel fields, so it is deliberately narrow.
 */
import { describe, expect, it } from "vitest";
import {
  buildSourceIndex,
  matchDescriptions,
  normalizeName,
  type SourceEntity,
} from "../src/legacy/descriptionMatcher.js";

const DDL_ENTITIES: SourceEntity[] = [
  {
    typeName: "t_order",
    description: "订单主表",
    properties: [
      { name: "order_id", description: "订单号" },
      { name: "total_amount", description: "订单总额" },
      { name: "status", description: "订单状态" },
    ],
  },
  {
    typeName: "customer",
    properties: [{ name: "cust_nm", description: "客户姓名" }],
  },
];

describe("normalizeName", () => {
  it("folds separators and case", () => {
    expect(normalizeName("Order_ID")).toBe("orderid");
    expect(normalizeName("custNm")).toBe("custnm");
    expect(normalizeName("cust-nm")).toBe("custnm");
  });

  it("peels conventional table affixes", () => {
    expect(normalizeName("t_order")).toBe("order");
    expect(normalizeName("tbl_customer")).toBe("customer");
    expect(normalizeName("orders_tb")).toBe("orders");
  });

  it("does not strip when nothing meaningful would remain", () => {
    expect(normalizeName("t_ab")).toBe("tab");
    expect(normalizeName("sys")).toBe("sys");
  });
});

describe("matchDescriptions", () => {
  it("matches on a normalised type name, which is the common case", () => {
    const index = buildSourceIndex(DDL_ENTITIES, "ddl");
    const result = matchDescriptions({
      nodeTypes: [{ key: "order", fields: ["order_id", "totalAmount", "status"] }],
      index,
    });
    expect(result.matched.get("order.totalAmount")).toEqual({
      description: "订单总额",
      from: "ddl",
      weak: false,
    });
    expect(result.matched.get("order.status")?.description).toBe("订单状态");
    expect(result.unmatched).toEqual([]);
  });

  it("picks up the entity-level description for the target type", () => {
    const index = buildSourceIndex(DDL_ENTITIES, "ddl");
    const result = matchDescriptions({ nodeTypes: [{ key: "order", fields: [] }], index });
    expect(result.typeDescriptions.get("order")).toBe("订单主表");
  });

  it("falls back to a globally unique field name and marks it weak", () => {
    const index = buildSourceIndex(DDL_ENTITIES, "ddl");
    const result = matchDescriptions({
      // `buyer` does not line up with the `customer` table, but `cust_nm` is
      // unambiguous across the whole source.
      nodeTypes: [{ key: "buyer", fields: ["custNm"] }],
      index,
    });
    expect(result.matched.get("buyer.custNm")?.weak).toBe(true);
    expect(result.matched.get("buyer.custNm")?.description).toBe("客户姓名");
  });

  it("does not weak-match an ambiguous field name", () => {
    const entities: SourceEntity[] = [
      { typeName: "a", properties: [{ name: "status", description: "订单状态" }] },
      { typeName: "b", properties: [{ name: "status", description: "客户状态" }] },
    ];
    const index = buildSourceIndex(entities, "ddl");
    const result = matchDescriptions({ nodeTypes: [{ key: "c", fields: ["status"] }], index });
    expect(result.matched.size).toBe(0);
    expect(result.unmatched).toEqual([{ typeKey: "c", field: "status" }]);
  });

  it("reports unmatched fields so the caller can ask the model", () => {
    const index = buildSourceIndex(DDL_ENTITIES, "ddl");
    const result = matchDescriptions({
      nodeTypes: [{ key: "order", fields: ["order_id", "unknown_field"] }],
      index,
    });
    expect(result.matched.has("order.order_id")).toBe(true);
    expect(result.unmatched).toEqual([{ typeKey: "order", field: "unknown_field" }]);
  });

  it("ignores source entries without a description", () => {
    const index = buildSourceIndex(
      [{ typeName: "order", properties: [{ name: "a" }, { name: "b", description: " " }] }],
      "ddl",
    );
    const result = matchDescriptions({ nodeTypes: [{ key: "order", fields: ["a", "b"] }], index });
    expect(result.matched.size).toBe(0);
    expect(result.unmatched).toHaveLength(2);
  });

  it("works for the openapi kind too", () => {
    const index = buildSourceIndex(
      [{ typeName: "Order", properties: [{ name: "totalAmount", description: "订单总额" }] }],
      "openapi",
    );
    const result = matchDescriptions({ nodeTypes: [{ key: "order", fields: ["totalAmount"] }], index });
    expect(result.matched.get("order.totalAmount")?.from).toBe("openapi");
  });
});
