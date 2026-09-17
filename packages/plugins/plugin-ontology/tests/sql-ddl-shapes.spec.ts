/**
 * DDL statement shapes.
 *
 * Both cases here imported *silently* wrong, which is why they are worth a file
 * of their own: nothing errored, nothing was reported, and the table simply
 * arrived with a fraction of its columns.
 *
 *   - the column regex was anchored to the start of a line (`^…/gm`), so any
 *     `create table` written on one line yielded exactly one column;
 *   - the statement itself had to end in `;`, so a dump whose last statement has
 *     no terminator lost that table altogether.
 *
 * The column list is now split on commas at paren depth 0, and the table body is
 * found by matching its closing parenthesis.
 */
import { describe, expect, it } from "vitest";
import { parseSqlDdl } from "@paperclipai/ontology-core/cognition/AstExtractor.js";

const cols = (sql: string): string[] => {
  const [entity] = parseSqlDdl(sql, "schema.sql").entities;
  return (entity?.properties ?? []).map((p) => p.name);
};

describe("parseSqlDdl — statement shapes", () => {
  it("reads every column of a single-line create table", () => {
    expect(cols("create table t (a bigint, b varchar(64));")).toEqual(["a", "b"]);
  });

  it("reads a single-line table of simple types too", () => {
    // The bug was not about the types: it read one column whatever they were.
    expect(cols("create table t (a bigint, b text, c int);")).toEqual(["a", "b", "c"]);
  });

  it("does not split a column on a comma inside its type", () => {
    // `decimal(10,2)` holds a comma that does not separate columns.
    expect(cols("create table t (a decimal(10,2), b bigint);")).toEqual(["a", "b"]);
    expect(cols("create table t (\n  a decimal(10,2),\n  b bigint\n);")).toEqual(["a", "b"]);
  });

  it("reads the columns on the same line as the table name", () => {
    expect(cols("create table t (a bigint, b bigint\n);")).toEqual(["a", "b"]);
  });

  it("reads the last statement when the file ends without a semicolon", () => {
    expect(cols("create table t (\n  a bigint,\n  b bigint\n)")).toEqual(["a", "b"]);
  });

  it("reads a table whose first column has a parenthesised type", () => {
    // The body used to end at the first `)` in it, which is this one.
    expect(cols("create table t (a varchar(64), b bigint);")).toEqual(["a", "b"]);
  });

  it("still skips table-level constraints and keeps the foreign key", () => {
    const [entity] = parseSqlDdl(
      `create table orders (id bigint, dept_id bigint, constraint fk_dept foreign key (dept_id) references sys_dept (id));`,
      "schema.sql",
    ).entities;
    expect((entity?.properties ?? []).map((p) => p.name)).toEqual(["id", "dept_id"]);
    const [rel] = parseSqlDdl(
      `create table orders (id bigint, dept_id bigint, foreign key (dept_id) references sys_dept (id));`,
      "schema.sql",
    ).relations;
    expect(rel).toMatchObject({ sourceType: "orders", targetType: "sys_dept", relationType: "references" });
  });

  it("keeps the column comment when a later column follows it", () => {
    // A trailing comment sits between the comma and the newline, so the next
    // column's part begins with it.
    const byName = Object.fromEntries(
      (parseSqlDdl(
        `CREATE TABLE orders (\n  total decimal(10,2) NOT NULL,  -- 订单总额\n  status varchar(16)             -- 订单状态\n);`,
        "schema.sql",
      ).entities[0]!.properties ?? []).map((p) => [p.name, p.description]),
    );
    expect(byName).toEqual({ total: "订单总额", status: "订单状态" });
  });
});
