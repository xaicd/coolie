import { describe, expect, it } from "vitest";
import { createMcpToolInvoker, ontologyMcpTools } from "./mcp.js";

interface FakeResponse {
  body: string;
  contentType?: string;
  status?: number;
}

function makeFetch(responses: FakeResponse[]) {
  let index = 0;
  const calls: Array<Record<string, unknown>> = [];
  const fn = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    const spec = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return new Response(spec.body, {
      status: spec.status ?? 200,
      headers: spec.contentType ? { "content-type": spec.contentType } : {},
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const initializeOk: FakeResponse = {
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } }),
  contentType: "application/json",
};

describe("ontologyMcpTools", () => {
  it("projects the ontology catalogue into DeepSeek function tools", () => {
    const tools = ontologyMcpTools();
    expect(tools.length).toBeGreaterThan(0);
    const domains = tools.find((tool) => tool.function.name === "ontology_list_domains");
    expect(domains).toBeDefined();
    expect(domains?.type).toBe("function");
    expect(typeof domains?.function.description).toBe("string");
    expect(domains?.function.parameters).toMatchObject({ type: "object" });
  });
});

describe("createMcpToolInvoker", () => {
  it("initializes the session then calls the tool over JSON-RPC", async () => {
    const { fn, calls } = makeFetch([
      initializeOk,
      { body: "", status: 202 },
      {
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          result: { content: [{ type: "text", text: JSON.stringify({ domains: ["orders"] }) }] },
        }),
        contentType: "application/json",
      },
    ]);

    const invoker = createMcpToolInvoker({
      endpoint: "https://ontology.test/mcp",
      bearerToken: "secret",
      fetchImpl: fn,
    });

    const value = await invoker.callTool("ontology_list_domains", {});
    expect(value).toEqual({ domains: ["orders"] });
    expect(calls[0].method).toBe("initialize");
    expect(calls[2]).toMatchObject({
      method: "tools/call",
      params: { name: "ontology_list_domains", arguments: {} },
    });
  });

  it("reads a tool result from an SSE response body", async () => {
    const { fn } = makeFetch([
      initializeOk,
      { body: "", status: 202 },
      {
        body: `event: message\ndata: ${JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          result: { content: [{ type: "text", text: "{\"ok\":true}" }] },
        })}\n\n`,
        contentType: "text/event-stream",
      },
    ]);

    const invoker = createMcpToolInvoker({ endpoint: "https://ontology.test/mcp", fetchImpl: fn });
    expect(await invoker.callTool("ontology_list_domains", {})).toEqual({ ok: true });
  });

  it("throws when the tool reports an error the model should see", async () => {
    const { fn } = makeFetch([
      initializeOk,
      { body: "", status: 202 },
      {
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          result: { isError: true, content: [{ type: "text", text: "No such domain: nope" }] },
        }),
        contentType: "application/json",
      },
    ]);

    const invoker = createMcpToolInvoker({ endpoint: "https://ontology.test/mcp", fetchImpl: fn });
    await expect(invoker.callTool("ontology_get_domain", { domainSlug: "nope" })).rejects.toThrow(
      "No such domain: nope",
    );
  });
});
