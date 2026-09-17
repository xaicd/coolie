/**
 * DDL comment parsing.
 *
 * Comments were dropped entirely before this — the column regex only captured
 * name + type — so imported legacy schemas arrived with no field documentation,
 * and the description-enrichment pass had nothing to match against. Each real
 * DDL dialect writes comments differently, so the cases are grouped by form.
 */
import { describe, expect, it } from "vitest";
import { parseSqlDdl } from "@paperclipai/ontology-core/cognition/AstExtractor.js";

const props = (sql: string) => {
  const [entity] = parseSqlDdl(sql, "schema.sql").entities;
  return {
    entity,
    byName: Object.fromEntries((entity?.properties ?? []).map((p) => [p.name, p.description])),
  };
};

describe("parseSqlDdl — comments", () => {
  it("reads a trailing -- comment", () => {
    const { byName } = props(`
      CREATE TABLE orders (
        id bigint NOT NULL,
        total decimal(10,2) NOT NULL,  -- 订单总额
        status varchar(16)             -- 订单状态
      );
    `);
    expect(byName.total).toBe("订单总额");
    expect(byName.status).toBe("订单状态");
    expect(byName.id).toBeUndefined();
  });

  it("reads a trailing # comment (MySQL)", () => {
    const { byName } = props(`
      CREATE TABLE t (
        a int, # 甲
        b int  # 乙
      );
    `);
    expect(byName.a).toBe("甲");
    expect(byName.b).toBe("乙");
  });

  it("reads an inline COMMENT clause", () => {
    const { byName } = props(`
      CREATE TABLE orders (
        \`total\` decimal(10,2) NOT NULL COMMENT '订单总额',
        \`status\` varchar(16) NOT NULL COMMENT '订单状态'
      ) COMMENT='订单主表';
    `);
    expect(byName.total).toBe("订单总额");
    expect(byName.status).toBe("订单状态");
  });

  it("reads standalone COMMENT ON statements (PostgreSQL / Oracle)", () => {
    const { entity, byName } = props(`
      CREATE TABLE orders (
        total decimal(10,2) NOT NULL,
        status varchar(16) NOT NULL
      );
      COMMENT ON TABLE orders IS '订单主表';
      COMMENT ON COLUMN orders.total IS '订单总额';
      COMMENT ON COLUMN orders.status IS '订单状态';
    `);
    expect(byName.total).toBe("订单总额");
    expect(byName.status).toBe("订单状态");
    expect(entity?.description).toBe("订单主表");
  });

  it("handles schema-qualified COMMENT ON COLUMN targets", () => {
    const { byName } = props(`
      CREATE TABLE orders (total decimal(10,2));
      COMMENT ON COLUMN public.orders.total IS '订单总额';
    `);
    expect(byName.total).toBe("订单总额");
  });

  it("prefers the column's own clause over a standalone statement", () => {
    const { byName } = props(`
      CREATE TABLE orders (
        total decimal(10,2) COMMENT '行内'
      );
      COMMENT ON COLUMN orders.total IS '语句式';
    `);
    expect(byName.total).toBe("行内");
  });

  it("unescapes doubled quotes", () => {
    const { byName } = props(`
      CREATE TABLE orders (
        a int COMMENT 'it''s fine'
      );
    `);
    expect(byName.a).toBe("it's fine");
  });

  it("leaves descriptions absent when the DDL has none", () => {
    const { byName, entity } = props(`
      CREATE TABLE orders (
        id bigint NOT NULL,
        total decimal(10,2)
      );
    `);
    expect(byName).toEqual({ id: undefined, total: undefined });
    expect(entity?.description).toBeUndefined();
    expect(entity?.properties?.map((p) => p.name)).toEqual(["id", "total"]);
  });

  it("still skips table constraint lines and keeps FK relations", () => {
    const result = parseSqlDdl(
      `
      CREATE TABLE orders (
        id bigint PRIMARY KEY,
        customer_id bigint, -- 客户
        CONSTRAINT fk_c FOREIGN KEY (customer_id) REFERENCES customers(id)
      );`,
      "schema.sql",
    );
    const names = result.entities[0]?.properties?.map((p) => p.name);
    expect(names).toEqual(["id", "customer_id"]);
    expect(result.entities[0]?.properties?.[1]?.description).toBe("客户");
    expect(result.relations.map((r) => r.targetType)).toContain("customers");
  });
});
