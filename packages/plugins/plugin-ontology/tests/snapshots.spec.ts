/**
 * Snapshot helper tests. Pure functions — no DB, no React. These cover
 * serializeDomain round-trip and diffDomain semantics. The DB layer
 * itself is exercised by integration tests in the worker spec.
 */
import { describe, expect, it } from "vitest";
import {
  countDiff,
  diffDomain,
  serializeDomain,
  type SchemaSnapshot,
} from "../src/aide/snapshots.js";
import type { DescribeDomainResult } from "../src/ui/CitationPreview.js";

function buildResult(
  overrides: Partial<DescribeDomainResult> = {},
): DescribeDomainResult {
  return {
    domain: {
      id: "d1",
      company_id: "c1",
      slug: "test",
      display_name: "Test",
      description: null,
      status: "active",
      version: 1,
      icon: "📦",
      category: "other",
      is_built_in: false,
      forked_from: null,
      lifecycle_state: "draft",
      bootstrap_source: "manual",
      seed_schema_version: 0,
    },
    nodeTypes: [],
    relationTypes: [],
    recentNodes: [],
    counts: {
      totalNodes: 0,
      totalEdges: 0,
      businessSystems: 0,
      subProjects: 0,
      actionTypes: 0,
    },
    businessSystems: [],
    subProjects: [],
    actionTypes: [],
    configured: true,
    ...overrides,
  };
}

function nt(key: string, props: Record<string, unknown> = {}): DescribeDomainResult["nodeTypes"][number] {
  return {
    id: `nt-${key}`,
    key,
    displayName: key,
    description: null,
    layer: "aggregate_root",
    propertiesSchema: Object.keys(props).length > 0 ? props : null,
    instanceCount: 0,
  };
}

function rt(
  key: string,
  overrides: Partial<DescribeDomainResult["relationTypes"][number]> = {},
): DescribeDomainResult["relationTypes"][number] {
  return {
    id: `rt-${key}`,
    key,
    displayName: key,
    description: null,
    directed: true,
    cardinality: "one_to_many",
    instanceCount: 0,
    ...overrides,
  };
}

describe("serializeDomain — round trip", () => {
  it("drops the envelope (domain, counts, recentNodes)", () => {
    const result = buildResult({
      domain: {
      id: "d1",
      company_id: "c1",
      slug: "x",
      display_name: "X",
      description: null,
      status: "active",
      version: 9,
      icon: "📦",
      category: "other",
      is_built_in: false,
      forked_from: null,
      lifecycle_state: "draft",
      bootstrap_source: "manual",
      seed_schema_version: 0,
    },
      nodeTypes: [nt("a")],
      relationTypes: [rt("r")],
      actionTypes: [],
      counts: {
        totalNodes: 42,
        totalEdges: 17,
        businessSystems: 3,
        subProjects: 1,
        actionTypes: 0,
      },
    });
    const snap = serializeDomain(result);
    expect(snap).not.toHaveProperty("domain");
    expect(snap).not.toHaveProperty("counts");
    expect(snap.nodeTypes).toHaveLength(1);
    expect(snap.relationTypes).toHaveLength(1);
  });

  it("deep-clones propertiesSchema so the original is not shared", () => {
    const result = buildResult({
      nodeTypes: [nt("a", { name: { type: "string" } })],
    });
    const snap = serializeDomain(result);
    const original = result.nodeTypes[0].propertiesSchema!;
    snap.nodeTypes[0].propertiesSchema!.name = { type: "number" };
    expect(original.name).toEqual({ type: "string" });
  });

  it("normalizes null propertiesSchema to null", () => {
    const result = buildResult({ nodeTypes: [nt("a")] });
    const snap = serializeDomain(result);
    expect(snap.nodeTypes[0].propertiesSchema).toBeNull();
  });
});

describe("diffDomain — node type diffs", () => {
  it("detects added node type", () => {
    const a: SchemaSnapshot = { nodeTypes: [], relationTypes: [], actionTypes: [] };
    const b: SchemaSnapshot = { nodeTypes: [nt("invoice")], relationTypes: [], actionTypes: [] };
    expect(diffDomain(a, b)).toEqual([{ kind: "addNodeType", typeKey: "invoice" }]);
  });

  it("detects removed node type", () => {
    const a: SchemaSnapshot = { nodeTypes: [nt("legacy")], relationTypes: [], actionTypes: [] };
    const b: SchemaSnapshot = { nodeTypes: [], relationTypes: [], actionTypes: [] };
    expect(diffDomain(a, b)).toEqual([{ kind: "removeNodeType", typeKey: "legacy" }]);
  });

  it("detects updated node type with field list", () => {
    const a: SchemaSnapshot = {
      nodeTypes: [nt("a", { name: { type: "string" } })],
      relationTypes: [],
      actionTypes: [],
    };
    const b: SchemaSnapshot = {
      nodeTypes: [
        {
          ...nt("a", { name: { type: "string" } }),
          displayName: "A Renamed",
          layer: "child_entity",
        },
      ],
      relationTypes: [],
      actionTypes: [],
    };
    const out = diffDomain(a, b);
    const updates = out.filter((e) => e.kind === "updateNodeType");
    expect(updates).toEqual([
      { kind: "updateNodeType", typeKey: "a", fields: ["displayName", "layer"] },
    ]);
  });
});

describe("diffDomain — property-level diffs", () => {
  it("adds an addProperty entry when a property is new", () => {
    const a: SchemaSnapshot = { nodeTypes: [nt("customer")], relationTypes: [], actionTypes: [] };
    const b: SchemaSnapshot = {
      nodeTypes: [nt("customer", { email: { type: "string" } })],
      relationTypes: [],
      actionTypes: [],
    };
    const out = diffDomain(a, b);
    expect(out).toContainEqual({
      kind: "addProperty",
      typeKey: "customer",
      propertyName: "email",
    });
    // Parent nodeType should also have an empty-fields update? No — we
    // only emit updateNodeType when the parent itself changed. Property
    // changes flow through addProperty / removeProperty / updateProperty
    // entries directly so the drawer can color them individually.
    expect(out.find((e) => e.kind === "updateNodeType")).toBeUndefined();
  });

  it("emits removeProperty when a property disappears", () => {
    const a: SchemaSnapshot = {
      nodeTypes: [nt("customer", { tier: { type: "string" } })],
      relationTypes: [],
      actionTypes: [],
    };
    const b: SchemaSnapshot = { nodeTypes: [nt("customer")], relationTypes: [], actionTypes: [] };
    expect(diffDomain(a, b)).toContainEqual({
      kind: "removeProperty",
      typeKey: "customer",
      propertyName: "tier",
    });
  });

  it("emits updateProperty when a property value changes", () => {
    const a: SchemaSnapshot = {
      nodeTypes: [nt("customer", { name: { type: "string" } })],
      relationTypes: [],
      actionTypes: [],
    };
    const b: SchemaSnapshot = {
      nodeTypes: [nt("customer", { name: { type: "string", format: "email" } })],
      relationTypes: [],
      actionTypes: [],
    };
    expect(diffDomain(a, b)).toContainEqual({
      kind: "updateProperty",
      typeKey: "customer",
      propertyName: "name",
    });
  });
});

describe("diffDomain — relation type diffs", () => {
  it("detects added relation type", () => {
    const a: SchemaSnapshot = { nodeTypes: [], relationTypes: [], actionTypes: [] };
    const b: SchemaSnapshot = { nodeTypes: [], relationTypes: [rt("placed")], actionTypes: [] };
    expect(diffDomain(a, b)).toEqual([{ kind: "addRelationType", typeKey: "placed" }]);
  });

  it("detects updated relation type with field list", () => {
    const a: SchemaSnapshot = {
      nodeTypes: [],
      relationTypes: [rt("placed", { directed: true })],
      actionTypes: [],
    };
    const b: SchemaSnapshot = {
      nodeTypes: [],
      relationTypes: [rt("placed", { directed: false, cardinality: "many_to_many" })],
      actionTypes: [],
    };
    const out = diffDomain(a, b);
    expect(out).toEqual([
      { kind: "updateRelationType", typeKey: "placed", fields: ["directed", "cardinality"] },
    ]);
  });
});

describe("diffDomain — determinism", () => {
  it("sorts nodeType and property entries deterministically", () => {
    const a: SchemaSnapshot = {
      nodeTypes: [nt("zeta"), nt("alpha", { x: {} }), nt("mike", { a: {}, b: {} })],
      relationTypes: [],
      actionTypes: [],
    };
    const b: SchemaSnapshot = {
      nodeTypes: [
        nt("zeta"),
        nt("alpha", { x: {}, y: {} }),
        nt("mike", { a: {}, b: {} }),
        nt("bravo"),
      ],
      relationTypes: [],
      actionTypes: [],
    };
    const out = diffDomain(a, b);
    const ops = out.map((e) => {
      switch (e.kind) {
        case "addNodeType":
        case "removeNodeType":
          return `${e.kind}:${e.typeKey}`;
        case "addProperty":
        case "removeProperty":
        case "updateProperty":
          return `${e.kind}:${e.typeKey}.${e.propertyName}`;
        case "updateNodeType":
          return `${e.kind}:${e.typeKey}`;
        case "addRelationType":
        case "removeRelationType":
          return `${e.kind}:${e.typeKey}`;
        case "updateRelationType":
          return `${e.kind}:${e.typeKey}`;
      }
    });
    expect(ops).toEqual([
      "addProperty:alpha.y",
      "addNodeType:bravo",
    ]);
  });
});

describe("countDiff — mirrors affectedCounts shape", () => {
  it("sums add / update / remove across entity kinds", () => {
    const entries = [
      { kind: "addNodeType", typeKey: "a" },
      { kind: "removeRelationType", typeKey: "r" },
      { kind: "updateNodeType", typeKey: "b", fields: ["displayName"] },
      { kind: "updateNodeType", typeKey: "c", fields: [] }, // ignored — no real change
      { kind: "addProperty", typeKey: "a", propertyName: "x" },
      { kind: "removeProperty", typeKey: "b", propertyName: "y" },
    ] as const;
    // Tally: add = 2 (addNodeType a, addProperty a.x); update = 1
    // (updateNodeType b.fields=[displayName] only — c.fields=[] skipped);
    // remove = 2 (removeRelationType r, removeProperty b.y).
    expect(countDiff(entries as never)).toEqual({ add: 2, update: 1, remove: 2 });
  });

  it("returns zeros for an empty diff", () => {
    expect(countDiff([])).toEqual({ add: 0, update: 0, remove: 0 });
  });
});
