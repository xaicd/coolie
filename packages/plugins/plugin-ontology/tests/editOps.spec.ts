/**
 * Edit-ops parser + apply tests. Pure functions, no DB.
 *
 * Covers:
 *   - JSON fence stripping (3 variants: ```json, ```, raw)
 *   - Validation of all 9 ops (happy + error path)
 *   - propertiesSchemaFor merging (add/remove/update)
 *   - applyOperations key→id resolution + skipped output
 */
import { describe, expect, it } from "vitest";
import {
  applyOperations,
  parseEditResponse,
  propertiesSchemaFor,
  type EditOperation,
} from "../src/aide/editOps.js";
import type { DescribeDomainResult } from "../src/graph/GraphStore.js";

const SAMPLE_DOMAIN: DescribeDomainResult = {
  domain: {
      id: "d1",
      company_id: "c1",
      slug: "acme",
      display_name: "ACME",
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
      schema_version: 0,
    },
  nodeTypes: [
    {
      id: "nt-customer",
      key: "customer",
      displayName: "客户",
      description: "已签约的客户",
      layer: "aggregate_root",
      propertiesSchema: { name: { type: "string" }, tier: { type: "string", enum: ["gold", "silver"] } },
      instanceCount: 12,
    },
    {
      id: "nt-order",
      key: "order",
      displayName: "订单",
      description: null,
      layer: "aggregate_root",
      propertiesSchema: null,
      instanceCount: 0,
    },
  ],
  relationTypes: [
    {
      id: "rt-placed",
      key: "placed",
      displayName: "下单",
      description: null,
      directed: true,
      cardinality: "one_to_many",
      instanceCount: 8,
    },
  ],
  recentNodes: [],
  counts: { totalNodes: 12, totalEdges: 8, businessSystems: 0, subProjects: 0, actionTypes: 0 },
  businessSystems: [],
  subProjects: [],
  actionTypes: [],
} as DescribeDomainResult;

/* ------------------------------------------------------------------ */
/*  parseEditResponse — fence stripping                                */
/* ------------------------------------------------------------------ */

describe("parseEditResponse — fence stripping", () => {
  it("parses ```json fenced JSON", () => {
    const raw = '```json\n{"intent":"x","operations":[],"summary":"y","confidence":0.9,"warnings":[]}\n```';
    const r = parseEditResponse(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.intent).toBe("x");
      expect(r.result.operations).toHaveLength(0);
      expect(r.result.confidence).toBeCloseTo(0.9);
    }
  });

  it("parses ``` fenced JSON without language tag", () => {
    const raw = "```\n{\"intent\":\"x\",\"operations\":[],\"summary\":\"y\",\"confidence\":0.5}\n```";
    const r = parseEditResponse(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result.confidence).toBeCloseTo(0.5);
  });

  it("parses raw JSON without a fence", () => {
    const raw = '{"intent":"x","operations":[],"summary":"y","confidence":1}';
    const r = parseEditResponse(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result.confidence).toBe(1);
  });

  it("returns ok:false on empty input", () => {
    const r = parseEditResponse("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/为空/);
  });

  it("returns ok:false when inner JSON is broken", () => {
    const r = parseEditResponse("```json\n{not json}\n```");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/JSON/);
  });
});

/* ------------------------------------------------------------------ */
/*  parseEditResponse — shape validation                               */
/* ------------------------------------------------------------------ */

describe("parseEditResponse — shape validation", () => {
  const valid = JSON.stringify({
    intent: "调整 customer",
    operations: [
      {
        op: "updateNodeType",
        typeKey: "customer",
        displayName: "客户 (VIP)",
      },
    ],
    summary: "改一个字段",
    confidence: 0.8,
    warnings: ["注意描述会变"],
  });

  it("accepts a valid result", () => {
    const r = parseEditResponse(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.warnings).toEqual(["注意描述会变"]);
      expect(r.result.operations).toHaveLength(1);
    }
  });

  it("rejects a missing intent", () => {
    const r = parseEditResponse(
      JSON.stringify({ operations: [], summary: "s", confidence: 0.5 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/intent/);
  });

  it("rejects an out-of-range confidence", () => {
    const r = parseEditResponse(
      JSON.stringify({ intent: "x", operations: [], summary: "y", confidence: 1.5 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/confidence/);
  });

  it("rejects an operation with an unknown op", () => {
    const r = parseEditResponse(
      JSON.stringify({
        intent: "x",
        operations: [{ op: "frobnicate", typeKey: "y" }],
        summary: "s",
        confidence: 0.5,
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/frobnicate/);
  });

  it("rejects an addNodeType missing displayName", () => {
    const r = parseEditResponse(
      JSON.stringify({
        intent: "x",
        operations: [{ op: "addNodeType", typeKey: "y" }],
        summary: "s",
        confidence: 0.5,
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/displayName/);
  });
});

/* ------------------------------------------------------------------ */
/*  propertiesSchemaFor — pure merging                                */
/* ------------------------------------------------------------------ */

describe("propertiesSchemaFor", () => {
  it("adds a new property to an existing schema", () => {
    const next = propertiesSchemaFor(
      [
        {
          op: "addProperty",
          typeKey: "customer",
          property: { name: "email", type: "string" },
        },
      ],
      { name: { type: "string" } },
    );
    expect(next).toEqual({
      name: { type: "string" },
      email: { type: "string" },
    });
  });

  it("removes a property by name", () => {
    const next = propertiesSchemaFor(
      [{ op: "removeProperty", typeKey: "customer", propertyName: "tier" }],
      { name: { type: "string" }, tier: { type: "string" } },
    );
    expect(next).toEqual({ name: { type: "string" } });
  });

  it("updates an existing property definition without losing unrelated fields", () => {
    const next = propertiesSchemaFor(
      [
        {
          op: "updateProperty",
          typeKey: "customer",
          propertyName: "tier",
          description: "客户等级",
        },
      ],
      { tier: { type: "string", enum: ["gold", "silver"] } },
    );
    expect(next).toEqual({
      tier: { type: "string", enum: ["gold", "silver"], description: "客户等级" },
    });
  });

  it("applies ops in order — remove then add same name becomes a replace", () => {
    const next = propertiesSchemaFor(
      [
        { op: "removeProperty", typeKey: "x", propertyName: "foo" },
        {
          op: "addProperty",
          typeKey: "x",
          property: { name: "foo", type: "integer" },
        },
      ],
      { foo: { type: "string" } },
    );
    expect(next).toEqual({ foo: { type: "integer" } });
  });

  it("starts from an empty schema when current is null", () => {
    const next = propertiesSchemaFor(
      [
        {
          op: "addProperty",
          typeKey: "x",
          property: { name: "a", type: "boolean" },
        },
      ],
      null,
    );
    expect(next).toEqual({ a: { type: "boolean" } });
  });
});

/* ------------------------------------------------------------------ */
/*  applyOperations — key → id resolution                              */
/* ------------------------------------------------------------------ */

describe("applyOperations", () => {
  it("addNodeType → create-node-type with domainId", () => {
    const out = applyOperations(
      [
        {
          op: "addNodeType",
          typeKey: "invoice",
          displayName: "发票",
        },
      ],
      SAMPLE_DOMAIN,
      "d1",
    );
    expect(out.skipped).toHaveLength(0);
    expect(out.calls).toEqual([
      {
        action: "create-node-type",
        body: { domainId: "d1", key: "invoice", displayName: "发票", description: null, propertiesSchema: {} },
      },
    ]);
  });

  it("addNodeType that already exists is skipped", () => {
    const out = applyOperations(
      [
        { op: "addNodeType", typeKey: "customer", displayName: "客户 v2" },
      ],
      SAMPLE_DOMAIN,
      "d1",
    );
    expect(out.calls).toHaveLength(0);
    expect(out.skipped).toHaveLength(1);
    expect(out.skipped[0]?.reason).toMatch(/已存在/);
  });

  it("updateNodeType resolves typeKey → id", () => {
    const out = applyOperations(
      [
        { op: "updateNodeType", typeKey: "order", displayName: "订单记录" },
      ],
      SAMPLE_DOMAIN,
      "d1",
    );
    expect(out.calls).toEqual([
      {
        action: "update-node-type",
        params: { nodeTypeId: "nt-order" },
        body: { displayName: "订单记录" },
      },
    ]);
  });

  it("updateNodeType for unknown key is skipped", () => {
    const out = applyOperations(
      [{ op: "updateNodeType", typeKey: "ghost" }],
      SAMPLE_DOMAIN,
      "d1",
    );
    expect(out.calls).toHaveLength(0);
    expect(out.skipped).toHaveLength(1);
  });

  it("property ops collapse into a single update-node-type with merged schema", () => {
    const out = applyOperations(
      [
        { op: "addProperty", typeKey: "customer", property: { name: "email", type: "string" } },
        { op: "removeProperty", typeKey: "customer", propertyName: "tier" },
      ],
      SAMPLE_DOMAIN,
      "d1",
    );
    expect(out.calls).toHaveLength(1);
    const call = out.calls[0];
    expect(call?.action).toBe("update-node-type");
    if (call?.action === "update-node-type") {
      expect(call.params).toEqual({ nodeTypeId: "nt-customer" });
      const schema = call.body.propertiesSchema as Record<string, unknown>;
      expect(schema).toEqual({ name: { type: "string" }, email: { type: "string" } });
      expect("tier" in schema).toBe(false);
    }
  });

  it("relation-type ops go through create / update / delete", () => {
    const out = applyOperations(
      [
        { op: "addRelationType", typeKey: "refunded", displayName: "退款", directed: true },
        { op: "updateRelationType", typeKey: "placed", displayName: "下单 (新)" },
        { op: "removeRelationType", typeKey: "nonexistent" },
      ],
      SAMPLE_DOMAIN,
      "d1",
    );
    expect(out.skipped).toHaveLength(1);
    expect(out.calls.map((c) => c.action)).toEqual([
      "create-relation-type",
      "update-relation-type",
    ]);
    const update = out.calls[1];
    if (update?.action === "update-relation-type") {
      expect(update.params).toEqual({ relationTypeId: "rt-placed" });
      expect(update.body).toEqual({ displayName: "下单 (新)" });
    }
  });
});

/* ------------------------------------------------------------------ */
/*  EditOperation discriminated-union sanity                           */
/* ------------------------------------------------------------------ */

describe("EditOperation discriminated union", () => {
  it("every op carries the expected discriminator", () => {
    const ops: EditOperation[] = [
      { op: "addNodeType", typeKey: "x", displayName: "X" },
      { op: "updateNodeType", typeKey: "x" },
      { op: "removeNodeType", typeKey: "x" },
      { op: "addRelationType", typeKey: "y", displayName: "Y" },
      { op: "updateRelationType", typeKey: "y" },
      { op: "removeRelationType", typeKey: "y" },
      { op: "addProperty", typeKey: "x", property: { name: "a", type: "string" } },
      { op: "removeProperty", typeKey: "x", propertyName: "a" },
      { op: "updateProperty", typeKey: "x", propertyName: "a" },
    ];
    const discriminators = new Set(ops.map((o) => o.op));
    expect(discriminators.size).toBe(9);
  });
});