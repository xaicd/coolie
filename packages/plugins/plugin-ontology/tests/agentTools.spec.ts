/**
 * The aide's read-only lookup tools.
 *
 * These are the reason the副手 can answer a data question at all: before them
 * it only had the schema catalog and answered everything with a recital of it.
 * The tests pin the projections (what the model actually sees), the search
 * filters, and the "never throw" contract that lets the model recover from a
 * bad argument instead of failing the turn.
 */
import { describe, expect, it, vi } from "vitest";
import type { DescribeDomainResult, GraphStore } from "@paperclipai/ontology-core/graph/GraphStore.js";
import { AIDE_TOOL_SPECS, executeAideTool } from "../src/aide/agentTools.js";

const COMPANY = "company-1";
const DOMAIN = "domain-1";

function describeFixture(): DescribeDomainResult {
  return {
    domain: {
      id: DOMAIN,
      slug: "saa",
      display_name: "SAA",
      version: 1,
      status: "active",
    },
    nodeTypes: [
      {
        id: "nt-team",
        key: "team",
        displayName: "Team",
        description: "A delivery team",
        layer: "aggregate_root",
        propertiesSchema: {
          name: { type: "string" },
          headcount: { type: "number" },
        },
        instanceCount: 2,
      },
      {
        id: "nt-person",
        key: "person",
        displayName: "Person",
        description: null,
        layer: "aggregate_root",
        propertiesSchema: { name: { type: "string" }, role: { type: "string", enum: ["lead", "ic"] } },
        instanceCount: 1,
      },
    ],
    relationTypes: [
      { id: "rt-member", key: "member_of", displayName: "Member of", directed: true, instanceCount: 3 },
    ],
    recentNodes: [],
    counts: { totalNodes: 3, totalEdges: 3, businessSystems: 0, subProjects: 0, actionTypes: 0 },
    businessSystems: [],
    subProjects: [],
    actionTypes: [],
  } as unknown as DescribeDomainResult;
}

function nodeRows() {
  return [
    {
      id: "n-1",
      key: "team-platform",
      label: "Platform Team",
      node_type_id: "nt-team",
      lifecycle_state: "active",
      version: 1,
      properties: { name: "Platform Team", headcount: 12 },
    },
    {
      id: "n-2",
      key: "person-alice",
      label: "Alice (Lead)",
      node_type_id: "nt-person",
      lifecycle_state: "active",
      version: 1,
      properties: { name: "Alice Chen", role: "lead" },
    },
  ];
}

function graphSnapshot() {
  return {
    nodes: nodeRows().map((n) => ({ ...n, nodeTypeId: n.node_type_id })),
    edges: [
      {
        id: "e-1",
        sourceNodeId: "n-2",
        targetNodeId: "n-1",
        relationKey: "member_of",
        weight: 1,
        sourceDomainId: DOMAIN,
        targetDomainId: DOMAIN,
      },
    ],
    counts: { nodeTypes: 2, relationTypes: 1, nodes: 2, edges: 1, crossDomainEdges: 0 },
  };
}

function stubStore(overrides: Partial<Record<keyof GraphStore, unknown>>): GraphStore {
  return {
    describeDomain: async () => describeFixture(),
    listNodes: async () => nodeRows(),
    listRelationTypes: async () => [],
    getNodeByKey: async (_c: string, _d: string, key: string) =>
      nodeRows().find((n) => n.key === key) ?? null,
    getGraphSnapshot: async () => graphSnapshot(),
    findPath: async () => [{ nodeId: "n-2", depth: 0 }, { nodeId: "n-1", depth: 1 }],
    findImpact: async () => [{ nodeId: "n-1", label: "Platform Team", depth: 1 }],
    ...overrides,
  } as unknown as GraphStore;
}

describe("AIDE_TOOL_SPECS", () => {
  it("exposes the read-only lookup surface with schema-valid shapes", () => {
    const names = AIDE_TOOL_SPECS.map((spec) => spec.name);
    expect(names).toEqual([
      "domain_overview",
      "list_object_types",
      "get_object_type",
      "list_instances",
      "get_instance",
      "list_relation_types",
      "find_path",
      "find_impact",
    ]);
    for (const spec of AIDE_TOOL_SPECS) {
      expect(spec.description.length).toBeGreaterThan(0);
      expect(spec.input_schema.type).toBe("object");
    }
  });
});

describe("domain_overview / list_object_types", () => {
  it("reports counts and per-type property counts", async () => {
    const store = stubStore({});
    const overview = (await executeAideTool(store, COMPANY, DOMAIN, "domain_overview", {})) as Record<string, unknown>;
    expect(overview.domain).toMatchObject({ slug: "saa", version: 1 });
    expect(overview.counts).toMatchObject({ totalNodes: 3 });

    const types = overview.objectTypes as Array<Record<string, unknown>>;
    expect(types.map((t) => t.key)).toEqual(["team", "person"]);
    expect(types[0]).toMatchObject({ propertyCount: 2, instanceCount: 2 });
  });
});

describe("get_object_type", () => {
  it("returns the full property schema for a known key", async () => {
    const result = (await executeAideTool(stubStore({}), COMPANY, DOMAIN, "get_object_type", {
      typeKey: "person",
    })) as Record<string, unknown>;
    expect(result.key).toBe("person");
    expect(result.properties).toMatchObject({ role: { type: "string" } });
  });

  it("reports an unknown key with the available ones instead of throwing", async () => {
    const result = (await executeAideTool(stubStore({}), COMPANY, DOMAIN, "get_object_type", {
      typeKey: "ghost",
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("ghost");
    expect(result.availableKeys).toEqual(["team", "person"]);
  });

  it("requires typeKey", async () => {
    const result = (await executeAideTool(stubStore({}), COMPANY, DOMAIN, "get_object_type", {})) as Record<string, unknown>;
    expect(result.error).toBe("typeKey is required");
  });
});

describe("list_instances", () => {
  it("filters by object type key", async () => {
    const result = (await executeAideTool(stubStore({}), COMPANY, DOMAIN, "list_instances", {
      typeKey: "person",
    })) as { total: number; instances: Array<Record<string, unknown>> };
    expect(result.total).toBe(1);
    expect(result.instances[0]).toMatchObject({ key: "person-alice", typeKey: "person" });
    expect(result.instances[0]!.properties).toMatchObject({ role: "lead" });
  });

  it("searches across key, label and property values", async () => {
    const result = (await executeAideTool(stubStore({}), COMPANY, DOMAIN, "list_instances", {
      query: "alice",
    })) as { total: number; instances: Array<Record<string, unknown>> };
    expect(result.total).toBe(1);
    expect(result.instances[0]!.key).toBe("person-alice");

    const byProp = (await executeAideTool(stubStore({}), COMPANY, DOMAIN, "list_instances", {
      query: "12",
    })) as { instances: Array<Record<string, unknown>> };
    expect(byProp.instances.map((i) => i.key)).toEqual(["team-platform"]);
  });

  it("caps the returned rows at the requested limit", async () => {
    const result = (await executeAideTool(stubStore({}), COMPANY, DOMAIN, "list_instances", {
      limit: 1,
    })) as { total: number; returned: number; instances: unknown[] };
    expect(result.total).toBe(2);
    expect(result.returned).toBe(1);
    expect(result.instances).toHaveLength(1);
  });

  it("truncates oversized property values", async () => {
    const long = "x".repeat(1000);
    const store = stubStore({
      listNodes: async () =>
        [
          {
            id: "n-1",
            key: "blob",
            label: "Blob",
            node_type_id: "nt-team",
            lifecycle_state: "active",
            version: 1,
            properties: { note: long },
          },
        ] as never,
    });
    const result = (await executeAideTool(store, COMPANY, DOMAIN, "list_instances", {})) as {
      instances: Array<{ properties: Record<string, unknown> }>;
    };
    const note = String(result.instances[0]!.properties.note);
    expect(note.length).toBeLessThan(long.length);
    expect(note.endsWith("…")).toBe(true);
  });
});

describe("get_instance", () => {
  it("returns property values plus directed relations", async () => {
    const result = (await executeAideTool(stubStore({}), COMPANY, DOMAIN, "get_instance", {
      key: "person-alice",
    })) as Record<string, unknown>;
    expect(result.properties).toMatchObject({ name: "Alice Chen" });
    expect(result.relations).toEqual([
      { relation: "member_of", direction: "out", nodeKey: "team-platform", nodeLabel: "Platform Team" },
    ]);
  });

  it("reports a missing instance instead of throwing", async () => {
    const result = (await executeAideTool(stubStore({}), COMPANY, DOMAIN, "get_instance", {
      key: "nope",
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("nope");
  });
});

describe("find_path / find_impact", () => {
  it("resolves keys to ids and maps the path back to keys", async () => {
    const findPath = vi.fn(async () => [{ nodeId: "n-2", depth: 0 }, { nodeId: "n-1", depth: 1 }]);
    const result = (await executeAideTool(
      stubStore({ findPath } as never),
      COMPANY,
      DOMAIN,
      "find_path",
      { fromKey: "person-alice", toKey: "team-platform" },
    )) as { found: boolean; path: Array<{ key: string }> };

    expect(findPath).toHaveBeenCalledWith(
      expect.objectContaining({ sourceNodeId: "n-2", targetNodeId: "n-1" }),
    );
    expect(result.found).toBe(true);
    expect(result.path.map((hop) => hop.key)).toEqual(["person-alice", "team-platform"]);
  });

  it("defaults impact to downstream", async () => {
    const findImpact = vi.fn(async () => [{ nodeId: "n-1", label: "Platform Team", depth: 1 }]);
    const result = (await executeAideTool(
      stubStore({ findImpact } as never),
      COMPANY,
      DOMAIN,
      "find_impact",
      { nodeKey: "person-alice" },
    )) as { direction: string; impacted: unknown[] };

    expect(result.direction).toBe("downstream");
    expect(result.impacted).toHaveLength(1);
  });
});

describe("failure containment", () => {
  it("returns an error object for an unknown tool", async () => {
    const result = (await executeAideTool(stubStore({}), COMPANY, DOMAIN, "drop_table", {})) as Record<string, unknown>;
    expect(String(result.error)).toContain("drop_table");
    expect(Array.isArray(result.availableTools)).toBe(true);
  });

  it("never throws when the store blows up", async () => {
    const store = stubStore({
      describeDomain: async () => {
        throw new Error("db is down");
      },
    });
    const result = (await executeAideTool(store, COMPANY, DOMAIN, "domain_overview", {})) as Record<string, unknown>;
    expect(result.error).toBe("db is down");
  });
});
