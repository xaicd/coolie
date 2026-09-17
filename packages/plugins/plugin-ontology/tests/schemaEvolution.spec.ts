/**
 * What a schema edit does to the data underneath it.
 *
 * Renaming a key in `properties_schema` used to move nothing: every existing
 * instance kept the old key, so the instances silently stopped matching their own
 * type. Nothing renamed, coerced or even reported it.
 */
import { describe, expect, it } from "vitest";
import {
  describeOrphans,
  diffPropertySchemas,
  planPropertyRenames,
} from "@paperclipai/ontology-core/schemaEvolution.js";

const schema = (...keys: string[]) =>
  Object.fromEntries(keys.map((key) => [key, { type: "string" }]));

describe("diffPropertySchemas", () => {
  it("reports a rename as a removal and an addition", () => {
    // A rename is indistinguishable from a delete plus an add — which is exactly
    // why the author has to declare the mapping.
    const diff = diffPropertySchemas(schema("orderCode", "total"), schema("orderNo", "total"));
    expect(diff.removed).toEqual(["orderCode"]);
    expect(diff.added).toEqual(["orderNo"]);
  });

  it("reports a pure addition with nothing removed", () => {
    const diff = diffPropertySchemas(schema("id"), schema("id", "email"));
    expect(diff).toEqual({ removed: [], added: ["email"] });
  });

  it("reports a pure removal with nothing added", () => {
    const diff = diffPropertySchemas(schema("id", "legacy"), schema("id"));
    expect(diff).toEqual({ removed: ["legacy"], added: [] });
  });

  it("orders additions by the new schema, which is what a reader sees", () => {
    const diff = diffPropertySchemas(schema("id"), schema("id", "b", "a"));
    expect(diff.added).toEqual(["b", "a"]);
  });

  it("treats a missing or malformed schema as empty rather than throwing", () => {
    expect(diffPropertySchemas(null, schema("a"))).toEqual({ removed: [], added: ["a"] });
    expect(diffPropertySchemas(schema("a"), undefined)).toEqual({ removed: ["a"], added: [] });
    expect(diffPropertySchemas("nonsense" as never, schema("a"))).toEqual({ removed: [], added: ["a"] });
  });
});

describe("planPropertyRenames", () => {
  const diff = diffPropertySchemas(schema("orderCode", "total"), schema("orderNo", "total"));

  it("applies a declared rename the diff supports at both ends", () => {
    const plan = planPropertyRenames(diff, { orderCode: "orderNo" });
    expect(plan.applied).toEqual([{ from: "orderCode", to: "orderNo" }]);
    expect(plan.orphaned).toEqual([]);
  });

  it("reports a removal with no declared destination as orphaned", () => {
    const plan = planPropertyRenames(diff, {});
    expect(plan.orphaned).toEqual(["orderCode"]);
    expect(plan.applied).toEqual([]);
  });

  it("ignores a rename whose destination was not added", () => {
    // Honouring it would move data out from under a field the caller believes is
    // intact.
    const plan = planPropertyRenames(diff, { orderCode: "somethingElse" });
    expect(plan.applied).toEqual([]);
    expect(plan.ignored).toEqual([{ from: "orderCode", to: "somethingElse" }]);
    expect(plan.orphaned).toEqual(["orderCode"]);
  });

  it("ignores a rename whose source was not removed", () => {
    const plan = planPropertyRenames(diff, { total: "orderNo" });
    expect(plan.applied).toEqual([]);
    expect(plan.ignored).toEqual([{ from: "total", to: "orderNo" }]);
  });

  it("ignores a rename to itself and an empty destination", () => {
    const plan = planPropertyRenames(diff, { orderCode: "orderCode", total: "" });
    expect(plan.applied).toEqual([]);
    expect(plan.ignored).toHaveLength(2);
  });

  it("leaves a declared-but-unused rename out of the orphan list", () => {
    const wider = diffPropertySchemas(
      schema("a", "b"),
      schema("aNew", "bNew"),
    );
    const plan = planPropertyRenames(wider, { a: "aNew" });
    expect(plan.applied).toEqual([{ from: "a", to: "aNew" }]);
    expect(plan.orphaned).toEqual(["b"]);
  });

  it("handles an edit that changed nothing", () => {
    const plan = planPropertyRenames(diffPropertySchemas(schema("id"), schema("id")), {});
    expect(plan).toEqual({ applied: [], orphaned: [], ignored: [] });
  });
});

describe("describeOrphans", () => {
  it("says nothing when nothing was orphaned", () => {
    expect(describeOrphans([], 5)).toBeUndefined();
  });

  it("names the fields and the blast radius", () => {
    expect(describeOrphans(["orderCode"], 3)).toContain("orderCode");
    expect(describeOrphans(["orderCode"], 3)).toContain("3 个实例");
  });

  it("distinguishes an empty domain from a damaging edit", () => {
    // No instances means nothing was lost; saying otherwise would be alarming.
    expect(describeOrphans(["orderCode"], 0)).toContain("尚无实例数据受影响");
  });
});
