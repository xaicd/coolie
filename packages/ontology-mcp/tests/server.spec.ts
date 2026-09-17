/**
 * The MCP surface, driven through a real MCP client.
 *
 * Not a unit test of the callbacks: a client connects over a transport, lists
 * tools and calls one, which is what an agent harness does. If the tool list is
 * wrong here it is wrong for every client.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { GraphStore } from "@paperclipai/ontology-core/graph/GraphStore.js";
import { ONTOLOGY_TOOLS } from "@paperclipai/ontology-core/mcp/tools.js";
import { describe, expect, it } from "vitest";
import { createOntologyMcpServer } from "../src/server.js";

const COMPANY = "c-server";

/** A store double, so this file tests the transport rather than the database. */
function fakeStore(seen: string[] = []): GraphStore {
  return {
    listDomains: async (companyId: string) => {
      seen.push(companyId);
      return [{ id: "d1", slug: "orders", display_name: "订单域" }];
    },
    getDomainBySlug: async (_c: string, slug: string) => (slug === "orders" ? { id: "d1" } : null),
    getDomain: async () => ({ id: "d1", slug: "orders", schema_version: 4 }),
  } as unknown as GraphStore;
}

async function connect(store: GraphStore) {
  const { server } = createOntologyMcpServer({ store, companyId: COMPANY });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("listing tools over MCP", () => {
  it("offers the whole catalogue, with schemas a client can render", async () => {
    const client = await connect(fakeStore());
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      ONTOLOGY_TOOLS.map((tool) => tool.name).sort(),
    );
    for (const tool of tools) {
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.inputSchema.type, tool.name).toBe("object");
    }
  });

  it("describes tools the model can choose between, not just name", async () => {
    const client = await connect(fakeStore());
    const { tools } = await client.listTools();
    // A tool list where every description is a restatement of the name is a tool
    // list a model picks from at random.
    const vague = tools.filter((tool) => (tool.description ?? "").length < 40);
    expect(vague.map((t) => t.name)).toEqual([]);
  });
});

describe("calling a tool over MCP", () => {
  it("returns text plus structured content", async () => {
    const client = await connect(fakeStore());
    const result = await client.callTool({ name: "ontology_list_domains", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(result.structuredContent).toBeTruthy();
  });

  it("answers for the server's company, whatever the arguments say", async () => {
    // An agent must not be able to reach another tenant by asking nicely.
    const seen: string[] = [];
    const client = await connect(fakeStore(seen));
    await client.callTool({
      name: "ontology_list_domains",
      arguments: { companyId: "another-company" },
    });
    expect(new Set(seen)).toEqual(new Set([COMPANY]));
  });

  it("reports a miss as an error the model can read, not an empty result", async () => {
    const client = await connect(fakeStore());
    const result = await client.callTool({
      name: "ontology_get_domain",
      arguments: { domainSlug: "nope" },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("No such domain");
  });

  it("rejects an unknown tool without dropping the session", async () => {
    const client = await connect(fakeStore());
    const result = await client.callTool({ name: "ontology_nope", arguments: {} });
    expect(result.isError).toBe(true);
    // The connection still works: a bad call must not take the session down.
    const after = await client.listTools();
    expect(after.tools.length).toBeGreaterThan(0);
  });
});
