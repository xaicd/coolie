/**
 * The sequencing rule for object-type properties.
 *
 * The regression these lock down: `properties_schema` is `jsonb`, which does not
 * preserve object key order, so the source's field order was silently replaced by
 * whatever order the database returned. The one rule that matters is that a
 * partial declaration is a *prefix* and the remainder is sorted — never left in
 * map order, which would present an arbitrary sequence as if it were the source's.
 */
import { describe, expect, it } from "vitest";
import {
  orderPropertyEntries,
  orderPropertyNames,
  propertyOrderSource,
  prunePropertyOrder,
  readPropertyOrder,
  renameInPropertyOrder,
} from "@paperclipai/ontology-core/propertyOrder.js";

describe("orderPropertyNames", () => {
  it("puts the declared names first and sorts the rest", () => {
    // `totalSpend` was declared first; the other three were never mentioned and
    // must come back sorted, not in whatever order the map handed them over.
    expect(
      orderPropertyNames(
        ["loyaltyTier", "customerId", "joinedAt", "totalSpend"],
        ["totalSpend"],
      ),
    ).toEqual(["totalSpend", "customerId", "joinedAt", "loyaltyTier"]);
  });

  it("does not resurrect a declared name the schema no longer has", () => {
    expect(orderPropertyNames(["b", "a"], ["gone", "b"])).toEqual(["b", "a"]);
  });

  it("sorts deterministically when nothing was declared", () => {
    expect(orderPropertyNames(["c", "a", "b"], [])).toEqual(["a", "b", "c"]);
  });

  it("ignores a name declared twice", () => {
    expect(orderPropertyNames(["a", "b"], ["b", "b"])).toEqual(["b", "a"]);
  });
});

describe("orderPropertyEntries", () => {
  it("keeps each name's descriptor with it", () => {
    const entries = orderPropertyEntries(
      { z: { type: "string" }, a: { type: "number" } },
      ["z"],
    );
    expect(entries).toEqual([
      ["z", { type: "string" }],
      ["a", { type: "number" }],
    ]);
  });
});

describe("propertyOrderSource", () => {
  it("is declared only when we were actually told something", () => {
    expect(propertyOrderSource(["a"])).toBe("declared");
    // An empty vector means nobody knew, even though it is an array.
    expect(propertyOrderSource([])).toBe("sorted");
  });
});

describe("renameInPropertyOrder", () => {
  it("moves the order entry with the rename", () => {
    expect(renameInPropertyOrder(["a", "b", "c"], { b: "renamed" })).toEqual([
      "a",
      "renamed",
      "c",
    ]);
  });

  it("does not leave the new name twice when both existed", () => {
    // The naive map would produce ["a", "a"].
    expect(renameInPropertyOrder(["a", "b"], { b: "a" })).toEqual(["a"]);
  });

  it("passes the order through when no rename was declared", () => {
    expect(renameInPropertyOrder(["a", "b"], undefined)).toEqual(["a", "b"]);
  });
});

describe("prunePropertyOrder", () => {
  it("drops names the schema no longer holds", () => {
    expect(prunePropertyOrder(["a", "gone", "b"], { a: {}, b: {} })).toEqual(["a", "b"]);
  });
});

describe("readPropertyOrder", () => {
  it("reads the column, tolerating a row from before it existed", () => {
    expect(readPropertyOrder({ property_order: ["a", "b"] })).toEqual(["a", "b"]);
    expect(readPropertyOrder({ property_order: null })).toEqual([]);
    expect(readPropertyOrder(null)).toEqual([]);
    expect(readPropertyOrder({})).toEqual([]);
  });

  it("drops anything that is not a usable name", () => {
    expect(readPropertyOrder({ property_order: ["a", "", 7, null, "a"] })).toEqual(["a"]);
    // A driver that hands back a JSON string is not a `text[]`; refuse it rather
    // than pass a lie upstream.
    expect(readPropertyOrder({ property_order: '["a"]' })).toEqual([]);
  });
});
