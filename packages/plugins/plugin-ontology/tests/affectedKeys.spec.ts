/**
 * affectedKeys / affectedCounts tests. Pure functions — no DB, no React.
 * These power the schema preview pane's diff coloring: for each row in
 * the live ontology, the pane looks up its kind from the affectedKeys
 * output and paints add / update / remove.
 */
import { describe, expect, it } from "vitest";
import {
  affectedCounts,
  affectedKeys,
  type EditOperation,
} from "../src/aide/editOps.js";

describe("affectedKeys — node-type ops", () => {
  it("addNodeType → one nodeType:add row", () => {
    const out = affectedKeys([
      { op: "addNodeType", typeKey: "invoice", displayName: "发票" },
    ]);
    expect(out).toEqual([{ kind: "add", target: "nodeType", typeKey: "invoice" }]);
  });

  it("updateNodeType → nodeType:update", () => {
    const out = affectedKeys([{ op: "updateNodeType", typeKey: "customer" }]);
    expect(out).toEqual([{ kind: "update", target: "nodeType", typeKey: "customer" }]);
  });

  it("removeNodeType → nodeType:remove", () => {
    const out = affectedKeys([{ op: "removeNodeType", typeKey: "legacy" }]);
    expect(out).toEqual([{ kind: "remove", target: "nodeType", typeKey: "legacy" }]);
  });
});

describe("affectedKeys — relation-type ops", () => {
  it("addRelationType → relationType:add", () => {
    const out = affectedKeys([
      { op: "addRelationType", typeKey: "refunded", displayName: "退款" },
    ]);
    expect(out).toEqual([
      { kind: "add", target: "relationType", typeKey: "refunded" },
    ]);
  });

  it("updateRelationType / removeRelationType pass through", () => {
    const out = affectedKeys([
      { op: "updateRelationType", typeKey: "placed" },
      { op: "removeRelationType", typeKey: "cancelled" },
    ]);
    expect(out).toEqual([
      { kind: "update", target: "relationType", typeKey: "placed" },
      { kind: "remove", target: "relationType", typeKey: "cancelled" },
    ]);
  });
});

describe("affectedKeys — property ops tag both row + property", () => {
  it("addProperty → nodeType update + property add", () => {
    const out = affectedKeys([
      {
        op: "addProperty",
        typeKey: "customer",
        property: { name: "email", type: "string" },
      },
    ]);
    expect(out).toEqual([
      { kind: "update", target: "nodeType", typeKey: "customer" },
      { kind: "add", target: "property", typeKey: "customer", propertyName: "email" },
    ]);
  });

  it("removeProperty → nodeType update + property remove", () => {
    const out = affectedKeys([
      { op: "removeProperty", typeKey: "customer", propertyName: "tier" },
    ]);
    expect(out).toEqual([
      { kind: "update", target: "nodeType", typeKey: "customer" },
      { kind: "remove", target: "property", typeKey: "customer", propertyName: "tier" },
    ]);
  });

  it("updateProperty → nodeType update + property update", () => {
    const out = affectedKeys([
      { op: "updateProperty", typeKey: "customer", propertyName: "tier" },
    ]);
    expect(out).toEqual([
      { kind: "update", target: "nodeType", typeKey: "customer" },
      { kind: "update", target: "property", typeKey: "customer", propertyName: "tier" },
    ]);
  });
});

describe("affectedKeys — aggregation", () => {
  it("multiple property ops for the same nodeType collapse into one nodeType row", () => {
    const ops: EditOperation[] = [
      {
        op: "addProperty",
        typeKey: "customer",
        property: { name: "email", type: "string" },
      },
      { op: "removeProperty", typeKey: "customer", propertyName: "tier" },
      {
        op: "updateProperty",
        typeKey: "customer",
        propertyName: "name",
      },
    ];
    const out = affectedKeys(ops);
    // Only one nodeType entry, even though three property ops target it.
    const nodeTypeRows = out.filter((k) => k.target === "nodeType");
    expect(nodeTypeRows).toHaveLength(1);
    expect(nodeTypeRows[0]?.kind).toBe("update");
    // Three property entries.
    const propRows = out.filter((k) => k.target === "property");
    expect(propRows).toHaveLength(3);
  });

  it("later op wins when the same row is touched by two ops of different kinds", () => {
    // addNodeType + removeNodeType for the same key: not realistic (you
    // wouldn't remove something you just added in the same reply) but
    // the function should still produce a single row with the later kind.
    const ops: EditOperation[] = [
      { op: "addNodeType", typeKey: "x", displayName: "X" },
      { op: "removeNodeType", typeKey: "x" },
    ];
    const out = affectedKeys(ops);
    expect(out).toEqual([{ kind: "remove", target: "nodeType", typeKey: "x" }]);
  });
});

describe("affectedCounts — mirrors DS's +N / ~N / −N counter", () => {
  it("sums each kind across the full affected list", () => {
    const ops: EditOperation[] = [
      { op: "addNodeType", typeKey: "invoice", displayName: "发票" },
      { op: "removeNodeType", typeKey: "legacy" },
      { op: "updateRelationType", typeKey: "placed" },
      {
        op: "addProperty",
        typeKey: "customer",
        property: { name: "email", type: "string" },
      },
      { op: "removeProperty", typeKey: "customer", propertyName: "tier" },
    ];
    // addNodeType(invoice) → add
    // removeNodeType(legacy) → remove
    // updateRelationType(placed) → update
    // addProperty(customer, email) → nodeType update + property add
    // removeProperty(customer, tier) → nodeType update (merged with above) + property remove
    // Final tally: add = 2 (invoice, email), update = 2 (placed, customer),
    // remove = 2 (legacy, tier).
    expect(affectedCounts(ops)).toEqual({ add: 2, update: 2, remove: 2 });
  });

  it("zero on an empty op list", () => {
    expect(affectedCounts([])).toEqual({ add: 0, update: 0, remove: 0 });
  });
});