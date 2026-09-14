import { describe, expect, it } from "vitest";
import {
  buildBootstrapSystemPrompt,
  parseBootstrapDraft,
  type BootstrapDraft,
} from "../src/aide/bootstrap.js";

describe("parseBootstrapDraft", () => {
  it("extracts a fenced ```json``` block and returns the typed draft", () => {
    const text = [
      "Here's the bootstrap I drafted:",
      "```json",
      JSON.stringify({
        nodeTypes: [
          { key: "customer", displayName: "Customer", description: "End buyer" },
        ],
        relationTypes: [
          { key: "owns", displayName: "Owns", directed: true },
        ],
        nodes: [
          { key: "customer-1", label: "Alice", nodeTypeKey: "customer" },
        ],
        edges: [
          { sourceKey: "customer-1", targetKey: "customer-1", relationKey: "owns" },
        ],
      }),
      "```",
      "",
    ].join("\n");
    const out = parseBootstrapDraft(text);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.draft.nodeTypes[0]?.key).toBe("customer");
    expect(out.draft.relationTypes[0]?.key).toBe("owns");
    expect(out.draft.nodes[0]?.key).toBe("customer-1");
    expect(out.draft.edges).toHaveLength(1);
    expect(out.draft.edges[0]).toEqual({
      sourceKey: "customer-1",
      targetKey: "customer-1",
      relationKey: "owns",
    });
  });

  it("returns a structured error when there is no fenced block", () => {
    const out = parseBootstrapDraft("just plain text without any code fence");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/```json``` 块/);
  });

  it("returns a structured error when the fenced block is not valid JSON", () => {
    const out = parseBootstrapDraft("```json\n{ this is not json }\n```");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/解析失败/);
  });

  it("returns a structured error when the JSON is not an object", () => {
    const out = parseBootstrapDraft("```json\n[1, 2, 3]\n```");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/顶层必须是 JSON object/);
  });

  it("drops nodes that reference an unknown nodeTypeKey when types are present", () => {
    const text = [
      "```json",
      JSON.stringify({
        nodeTypes: [{ key: "customer", displayName: "Customer" }],
        relationTypes: [],
        nodes: [
          { key: "alice", label: "Alice", nodeTypeKey: "customer" },
          { key: "bob", label: "Bob", nodeTypeKey: "ghost" },
        ],
        edges: [],
      }),
      "```",
    ].join("\n");
    const out = parseBootstrapDraft(text);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.draft.nodes.map((n) => n.key)).toEqual(["alice"]);
  });

  it("drops edges that reference an unknown relation key or node key", () => {
    const text = [
      "```json",
      JSON.stringify({
        nodeTypes: [{ key: "customer", displayName: "Customer" }],
        relationTypes: [{ key: "owns", displayName: "Owns" }],
        nodes: [{ key: "alice", label: "Alice", nodeTypeKey: "customer" }],
        edges: [
          { sourceKey: "alice", targetKey: "alice", relationKey: "owns" }, // valid
          { sourceKey: "alice", targetKey: "bob", relationKey: "owns" }, // unknown target
          { sourceKey: "alice", targetKey: "alice", relationKey: "ghost" }, // unknown rel
        ],
      }),
      "```",
    ].join("\n");
    const out = parseBootstrapDraft(text);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.draft.edges).toHaveLength(1);
    expect(out.draft.edges[0]).toEqual({
      sourceKey: "alice",
      targetKey: "alice",
      relationKey: "owns",
    });
  });

  it("accepts ``` (no language) fences too", () => {
    const text = "```\n{\"nodeTypes\":[],\"relationTypes\":[],\"nodes\":[{\"key\":\"a\",\"label\":\"A\",\"nodeTypeKey\":\"\"}],\"edges\":[]}\n```";
    const out = parseBootstrapDraft(text);
    expect(out.ok).toBe(true);
  });

  it("normalises loose key fields (typeName, name, from, to, relation)", () => {
    const text = [
      "```json",
      JSON.stringify({
        nodeTypes: [
          { typeName: "Customer", displayName: "Customer" }, // typeName -> key
        ],
        relationTypes: [
          { name: "owns", displayName: "Owns" }, // name -> key
        ],
        nodes: [
          { name: "alice", label: "Alice", type: "Customer" }, // type -> nodeTypeKey
        ],
        edges: [
          { from: "alice", to: "alice", relation: "owns" },
        ],
      }),
      "```",
    ].join("\n");
    const out = parseBootstrapDraft(text);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.draft.nodeTypes[0]?.key).toBe("customer");
    expect(out.draft.relationTypes[0]?.key).toBe("owns");
    expect(out.draft.nodes[0]?.key).toBe("alice");
    expect(out.draft.nodes[0]?.nodeTypeKey).toBe("customer");
    expect(out.draft.edges[0]).toEqual({
      sourceKey: "alice",
      targetKey: "alice",
      relationKey: "owns",
    });
  });

  it("rejects a fully empty draft (no types / nodes / edges)", () => {
    const out = parseBootstrapDraft("```json\n{\"nodeTypes\":[],\"relationTypes\":[],\"nodes\":[],\"edges\":[]}\n```");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/模型输出为空/);
  });
});

describe("buildBootstrapSystemPrompt", () => {
  it("includes the user's domain description in the prompt", () => {
    const prompt = buildBootstrapSystemPrompt({
      domain: stubDescribe(),
      description: "本域建模我们的银行核心系统",
    });
    expect(prompt).toContain("银行核心系统");
  });

  it("emits the bootstrap schema hints when no focal node is set", () => {
    const prompt = buildBootstrapSystemPrompt({
      domain: stubDescribe(),
      description: "test",
    });
    expect(prompt).toMatch(/对象类型 ≤/);
    expect(prompt).toMatch(/关系类型 ≤/);
    expect(prompt).toMatch(/节点 ≤/);
    expect(prompt).toMatch(/边 ≤/);
  });

  it("switches to extend mode and lists focal node relations", () => {
    const prompt = buildBootstrapSystemPrompt({
      domain: stubDescribe(),
      description: null,
      focalNode: {
        key: "alice",
        label: "Alice",
        nodeTypeKey: "person",
        outgoingRelationKeys: ["owns"],
        incomingRelationKeys: ["member_of"],
      },
    });
    expect(prompt).toContain("以节点 alice");
    expect(prompt).toContain("owns");
    expect(prompt).toContain("member_of");
    expect(prompt).toContain("不要新建对象类型");
  });
});

function stubDescribe() {
  return {
    domain: {
      id: "d1",
      company_id: "c1",
      slug: "test",
      display_name: "Test",
      description: null,
      status: "active",
      version: 1,
      icon: "",
      category: "generic",
      is_built_in: false,
      forked_from: null,
      lifecycle_state: "active" as const,
      bootstrap_source: "manual" as const,
      seed_schema_version: 1,
    },
    nodeTypes: [],
    relationTypes: [],
    recentNodes: [],
    counts: { totalNodes: 0, totalEdges: 0, businessSystems: 0, subProjects: 0, actionTypes: 0 },
    businessSystems: [],
    subProjects: [],
    actionTypes: [],
    configured: true,
  };
}
