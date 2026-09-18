/**
 * Property-schema rows: the read/write pair behind both the schema modal and
 * the schema tab's inline editor.
 *
 * The regression these lock down: the old pair rebuilt each field as
 * `{ type }`, so saving from the UI silently dropped `enum`, `format`,
 * `required` and descriptions.
 */
import { describe, expect, it } from "vitest";
import {
  propertyOrderFromRows,
  rowsFromSchema,
  schemaFromRows,
  schemasEqual,
  typeOptionsFor,
} from "../src/ui/schemaRows.js";

describe("rowsFromSchema", () => {
  it("reads a JSON-Schema document", () => {
    const rows = rowsFromSchema({
      type: "object",
      properties: {
        name: { type: "string", description: "显示名" },
        tier: { type: "string", enum: ["gold", "silver"] },
      },
    });
    expect(rows.map((r) => r.key)).toEqual(["name", "tier"]);
    expect(rows[0]).toMatchObject({ type: "string", description: "显示名" });
  });

  it("keeps everything it did not edit in `rest`", () => {
    const rows = rowsFromSchema({
      properties: {
        tier: { type: "string", enum: ["gold"], required: true, format: "code" },
      },
    });
    expect(rows[0]!.rest).toEqual({ enum: ["gold"], required: true, format: "code" });
  });

  it("reads a flat map, inferring primitive types", () => {
    const rows = rowsFromSchema({ name: "alice", age: 30, active: true });
    // With no declared order the rows come back sorted, not in map order: the
    // schema arrives from a jsonb column, whose key order is nobody's.
    expect(rows.map((r) => [r.key, r.type])).toEqual([
      ["active", "boolean"],
      ["age", "number"],
      ["name", "string"],
    ]);
  });

  it("follows the declared order and sorts only what it does not cover", () => {
    const rows = rowsFromSchema({ name: "alice", age: 30, active: true }, ["name"]);
    expect(rows.map((r) => r.key)).toEqual(["name", "active", "age"]);
  });

  it("returns [] for anything that is not a schema", () => {
    expect(rowsFromSchema(null)).toEqual([]);
    expect(rowsFromSchema("nope")).toEqual([]);
    expect(rowsFromSchema([1, 2])).toEqual([]);
  });
});

describe("schemaFromRows", () => {
  it("writes the canonical flat shape and keeps enum / required / format / description", () => {
    // Stored as a JSON-Schema document, but the plugin's canonical shape is a
    // flat map — a save normalises it rather than changing the shape.
    const stored = {
      type: "object",
      properties: {
        tier: { type: "string", enum: ["gold", "silver"], required: true },
        email: { type: "string", format: "email", description: "联系邮箱" },
      },
    };
    expect(schemaFromRows(rowsFromSchema(stored))).toEqual({
      tier: { type: "string", enum: ["gold", "silver"], required: true },
      email: { type: "string", format: "email", description: "联系邮箱" },
    });
  });

  it("keeps a flat schema flat", () => {
    const stored = { name: { type: "string" } };
    expect(schemaFromRows(rowsFromSchema(stored))).toEqual(stored);
  });

  it("drops blank keys and blank descriptions", () => {
    const schema = schemaFromRows([
      { key: "  ", type: "string", description: "", rest: {} },
      { key: " name ", type: "string", description: "   ", rest: {} },
    ]);
    expect(schema).toEqual({ name: { type: "string" } });
  });

  it("applies an edited type without losing the rest of the descriptor", () => {
    const rows = rowsFromSchema({ tier: { type: "string", enum: ["gold"] } });
    rows[0]!.type = "number";
    expect(schemaFromRows(rows)).toEqual({ tier: { enum: ["gold"], type: "number" } });
  });

  it("adds and removes fields", () => {
    const rows = rowsFromSchema({ a: { type: "string" }, b: { type: "string" } });
    rows.splice(0, 1);
    rows.push({ key: "c", type: "boolean", description: "", rest: {} });
    expect(schemaFromRows(rows)).toEqual({ b: { type: "string" }, c: { type: "boolean" } });
  });
});

describe("propertyOrderFromRows", () => {
  it("declares the order the rows are shown in, trimmed like the map's keys", () => {
    // The map and the order have to be derived the same way, or a save writes a
    // key the order does not name and the row silently drops to the sorted tail.
    expect(
      propertyOrderFromRows([
        { key: " name ", type: "string", description: "", rest: {} },
        { key: "   ", type: "string", description: "", rest: {} },
        { key: "tier", type: "string", description: "", rest: {} },
      ]),
    ).toEqual(["name", "tier"]);
  });

  it("round-trips a declared order through a save", () => {
    const rows = rowsFromSchema({ a: { type: "string" }, b: { type: "string" } }, ["b", "a"]);
    const saved = rowsFromSchema(schemaFromRows(rows), propertyOrderFromRows(rows));
    expect(saved.map((r) => r.key)).toEqual(["b", "a"]);
  });
});

describe("schemasEqual", () => {
  it("ignores whitespace-only edits", () => {
    const rows = rowsFromSchema({ properties: { name: { type: "string" } } });
    const edited = rows.map((r) => ({ ...r, key: ` ${r.key} ` }));
    expect(schemasEqual(rows, edited)).toBe(true);
  });

  it("detects a real change", () => {
    const rows = rowsFromSchema({ properties: { name: { type: "string" } } });
    const edited = rows.map((r) => ({ ...r, type: "number" }));
    expect(schemasEqual(rows, edited)).toBe(false);
  });
});

describe("typeOptionsFor", () => {
  it("offers the standard types", () => {
    expect(typeOptionsFor("string")).toContain("object");
  });

  it("keeps a stored type that is not standard instead of rewriting it", () => {
    expect(typeOptionsFor("datetime")[0]).toBe("datetime");
    expect(typeOptionsFor("enum")[0]).toBe("enum");
  });
});
