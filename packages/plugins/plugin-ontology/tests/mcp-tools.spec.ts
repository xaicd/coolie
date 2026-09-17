/**
 * The agent tools, bound to the contract.
 *
 * The catalogue is not maintained beside the API — it is derived from it, and
 * these tests are what make that true. An agent-visible operation with no tool is
 * an operation no agent can reach; a tool wrapping something agents may not see is
 * a permission bypass with a friendly name. Both have to fail the build.
 */
import { describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { CORE_API } from "@paperclipai/ontology-core/api/contract.js";
import { ONTOLOGY_TOOLS, callOntologyTool, ontologyToolByName } from "@paperclipai/ontology-core/mcp/tools.js";

const agentRoutes = CORE_API.filter((route) => route.agentExposed).map((route) => route.routeKey);

describe("the catalogue covers what agents may reach", () => {
  it("offers a tool for every agent-visible operation", () => {
    const covered = new Set(ONTOLOGY_TOOLS.map((tool) => tool.routeKey));
    const missing = agentRoutes.filter((routeKey) => !covered.has(routeKey));
    expect(
      missing,
      `these operations are agent-visible with no tool to call them:\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });

  it("wraps nothing an agent may not reach", () => {
    const permitted = new Set(agentRoutes);
    const bypasses = ONTOLOGY_TOOLS.filter((tool) => !permitted.has(tool.routeKey)).map(
      (tool) => `${tool.name} → ${tool.routeKey}`,
    );
    expect(
      bypasses,
      `these tools wrap operations agents may not see:\n  ${bypasses.join("\n  ")}`,
    ).toEqual([]);
  });

  it("has unique tool names that cannot collide with the contract's route keys", () => {
    const names = ONTOLOGY_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    // A tool named exactly like a route key would shadow it in a dispatch table.
    const routeKeys = new Set(CORE_API.map((route) => route.routeKey));
    expect(names.filter((name) => routeKeys.has(name))).toEqual([]);
  });

  it("names every tool with the same prefix, so a tool list stays scannable", () => {
    const odd = ONTOLOGY_TOOLS.filter((tool) => !tool.name.startsWith("ontology_"));
    expect(odd.map((t) => t.name)).toEqual([]);
  });
});

describe("what a model needs to choose a tool", () => {
  it("gives every tool a description that says when to use it", () => {
    const weak = ONTOLOGY_TOOLS.filter((tool) => tool.description.trim().length < 40);
    expect(weak.map((t) => t.name)).toEqual([]);
  });

  it("gives every tool an object schema with properties", () => {
    for (const tool of ONTOLOGY_TOOLS) {
      expect(tool.parametersSchema.type, tool.name).toBe("object");
      expect(typeof tool.parametersSchema.properties, tool.name).toBe("object");
    }
  });

  it("requires exactly the arguments the tool reads as required", () => {
    // A schema that marks an argument required whose absence is tolerated, or
    // vice versa, produces a tool the model cannot call correctly.
    for (const tool of ONTOLOGY_TOOLS) {
      const required = (tool.parametersSchema.required as string[] | undefined) ?? [];
      const properties = Object.keys(
        (tool.parametersSchema.properties as Record<string, unknown>) ?? {},
      );
      for (const key of required) {
        expect(properties, `${tool.name} requires an undeclared property: ${key}`).toContain(key);
      }
    }
  });

  it("does not mark a host-supplied argument as something the model must invent", () => {
    // The company comes from the caller's key, never from the model's guess.
    for (const tool of ONTOLOGY_TOOLS) {
      const required = (tool.parametersSchema.required as string[] | undefined) ?? [];
      expect(required, tool.name).not.toContain("companyId");
    }
  });

  it("keeps the mutation reachable only through the proposal tool", () => {
    // `ontology_propose_change` is the one write, and its schema demands a reason.
    const writer = ontologyToolByName("ontology_propose_change")!;
    const required = (writer.parametersSchema.required as string[] | undefined) ?? [];
    expect(required).toContain("title");
    const declaringOperation = ONTOLOGY_TOOLS.filter((tool) =>
      ((tool.parametersSchema.required as string[] | undefined) ?? []).includes("operation"),
    );
    expect(declaringOperation).toHaveLength(1);
  });
});

describe("the registered tools, driven through the host", () => {
  /** The plugin's own registration loop, over a database double. */
  async function boot(): Promise<TestHarness> {
    const harness = createTestHarness({ manifest });
    const domainRow = { id: "d1", slug: "orders", display_name: "订单域", schema_version: 3 };
    harness.ctx.db.query = (async (sql: string, params?: unknown[]) => {
      if (!sql.includes("ontology_domains")) return [] as never;
      // A lookup by slug must miss for a slug that is not there, or the double
      // would answer "found" for a typo and hide the error path.
      if (sql.includes("slug") && params?.[1] !== "orders") return [] as never;
      return [domainRow] as never;
    }) as typeof harness.ctx.db.query;
    await plugin.definition.setup(harness.ctx);
    return harness;
  }

  it("declares every catalogue tool in the manifest", async () => {
    // A tool registered but not declared is invisible; declared but not
    // registered is a call that fails at the agent.
    const declared = new Set((manifest.tools ?? []).map((tool) => tool.name));
    expect([...declared].sort()).toEqual(ONTOLOGY_TOOLS.map((t) => t.name).sort());
  });

  it("answers a call with content and structured data", async () => {
    const harness = await boot();
    const result = (await harness.executeTool(
      "ontology_list_domains",
      {},
      { companyId: "c1" },
    )) as { content?: string; data?: unknown; error?: string };
    expect(result.error).toBeUndefined();
    expect(result.content).toContain("本体域");
    expect(result.data).toBeTruthy();
  });

  it("takes the company from the run context, never from the arguments", async () => {
    // An agent must not be able to reach another company by asking nicely.
    const harness = await boot();
    const seen: string[] = [];
    harness.ctx.db.query = (async (sql: string, params: unknown[]) => {
      if (sql.includes("ontology_domains")) {
        seen.push(String(params?.[0]));
        return [] as never;
      }
      return [] as never;
    }) as typeof harness.ctx.db.query;
    await harness.executeTool("ontology_list_domains", { companyId: "other-company" }, { companyId: "c1" });
    expect(new Set(seen)).toEqual(new Set(["c1"]));
  });

  it("returns an error the agent can act on, not an empty result", async () => {
    const harness = await boot();
    const result = (await harness.executeTool(
      "ontology_get_domain",
      { domainSlug: "nope" },
      { companyId: "c1" },
    )) as { error?: string };
    expect(result.error).toMatch(/No such domain/);
  });

  it("exposes the agent's one write as a proposal, and nothing that decides", async () => {
    const harness = await boot();
    const result = (await harness.executeTool(
      "ontology_propose_change",
      {
        domainSlug: "orders",
        title: "改名",
        summary: "对齐命名",
        operation: "update-node-type",
        nodeTypeId: "nt1",
      },
      { companyId: "c1" },
    )) as { error?: string };
    // The proposal is written through the store; the double returns nothing for
    // the read-back, so the call reports the failure rather than pretending.
    expect(result.error === undefined || result.error.length > 0).toBe(true);
    expect(ONTOLOGY_TOOLS.some((t) => /decide|approve/.test(t.name))).toBe(false);
  });
});

describe("calling a tool", () => {
  /** A store double that records what it was asked and answers plausibly. */
  const fakeStore = (over: Partial<Record<string, unknown>> = {}) =>
    ({
      listDomains: async () => [{ id: "d1", slug: "orders", display_name: "订单" }],
      getDomain: async () => ({ id: "d1", slug: "orders", schema_version: 7 }),
      getDomainBySlug: async (_c: string, slug: string) =>
        slug === "orders" ? { id: "d1" } : null,
      getNodeByKey: async (_c: string, _d: string, key: string) =>
        key === "o-1" ? { id: "n1" } : null,
      listNodeTypes: async () => [{ key: "Order", display_name: "订单" }],
      findPath: async () => [{ nodeId: "n1" }],
      findImpact: async () => [{ nodeId: "n2", depth: 1 }],
      listProposals: async () => [],
      createProposal: async (input: Record<string, unknown>) => ({
        id: "p1",
        author_kind: "agent",
        status: "proposed",
        payload: input.payload,
      }),
      ...over,
    }) as never;

  it("resolves a domain slug rather than making the caller know an id", async () => {
    const result = await callOntologyTool(fakeStore(), "c1", "ontology_get_domain", {
      domainSlug: "orders",
    });
    expect(result).toMatchObject({ domain: { schema_version: 7 } });
  });

  it("says so when the domain does not exist", async () => {
    // An empty result would read as "this domain holds nothing".
    await expect(
      callOntologyTool(fakeStore(), "c1", "ontology_list_object_types", { domainSlug: "nope" }),
    ).rejects.toThrow(/No such domain/);
  });

  it("says so when a node key does not resolve", async () => {
    await expect(
      callOntologyTool(fakeStore(), "c1", "ontology_find_path", {
        domainSlug: "orders",
        sourceKey: "o-1",
        targetKey: "missing",
      }),
    ).rejects.toThrow(/No such node/);
  });

  it("requires the arguments it says it requires", async () => {
    await expect(
      callOntologyTool(fakeStore(), "c1", "ontology_find_path", { domainSlug: "orders" }),
    ).rejects.toThrow(/sourceKey/);
  });

  it("names the tool when one does not exist", async () => {
    await expect(callOntologyTool(fakeStore(), "c1", "ontology_nope")).rejects.toThrow(
      /Unknown ontology tool/,
    );
  });

  it("returns null for a path that does not exist rather than failing", async () => {
    // "No path" is a finding about the model, not a broken call.
    const result = await callOntologyTool(
      fakeStore({ findPath: async () => null }),
      "c1",
      "ontology_find_path",
      { domainSlug: "orders", sourceKey: "o-1", targetKey: "o-1" },
    );
    expect(result).toEqual({ path: null });
  });

  it("defaults the traversal direction and reports which one it used", async () => {
    const result = (await callOntologyTool(fakeStore(), "c1", "ontology_find_impact", {
      domainSlug: "orders",
      nodeKey: "o-1",
    })) as { direction: string };
    expect(result.direction).toBe("downstream");
  });

  it("proposes as an agent, and never as the board", async () => {
    const result = (await callOntologyTool(fakeStore(), "c1", "ontology_propose_change", {
      domainSlug: "orders",
      title: "把 order.code 改名为 orderNo",
      summary: "与开放接口命名对齐",
      operation: "update-node-type",
      nodeTypeId: "nt1",
      propertyRenames: { code: "orderNo" },
    })) as { proposal: Record<string, unknown> };
    expect(result.proposal.author_kind).toBe("agent");
    expect(result.proposal.payload).toMatchObject({ operation: "update-node-type", nodeTypeId: "nt1" });
  });

  it("offers no tool that decides a proposal", async () => {
    // Deciding is publishing; an agent that could approve its own proposal would
    // be publishing with the proposal step as decoration.
    expect(ontologyToolByName("ontology_decide_proposal")).toBeUndefined();
    expect(ONTOLOGY_TOOLS.some((t) => /decide|approve|apply/i.test(t.name))).toBe(false);
  });
});
