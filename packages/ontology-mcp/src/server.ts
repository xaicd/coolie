/**
 * The ontology as an MCP server.
 *
 * The tool catalogue lives in the core and is derived from the API contract, so
 * this file is only the transport: it lists the catalogue and runs the call. The
 * same catalogue backs the plugin's `ctx.tools`, which is the point — an agent
 * talking to a standalone ontology and an agent talking to the plugin see the
 * same operations, described the same way.
 *
 * Two invariants worth stating, because they are the reason this can be exposed
 * to an agent at all:
 *
 *   - **the company is fixed by the server**, never taken from the arguments. An
 *     agent cannot reach another tenant by asking.
 *   - **the only write is a proposal**, which changes nothing until a human or a
 *     rule decides it. Nothing here decides.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { GraphStore } from "@paperclipai/ontology-core/graph/GraphStore.js";
import { rolesOf, type Identity } from "@paperclipai/ontology-core/auth/credentials.js";
import { ONTOLOGY_TOOLS, callOntologyTool, type OntologyTool } from "@paperclipai/ontology-core/mcp/tools.js";

export interface OntologyMcpOptions {
  store: GraphStore;
  /** The tenant this server answers for. Not overridable by a tool call. */
  companyId: string;
  /**
   * Who authenticated, from the credential. The role set decides which saved
   * views the caller may open, so it must come from the key rather than from the
   * server's opinion of the caller.
   */
  identity?: Identity;
  name?: string;
  version?: string;
}

export interface OntologyMcpServer {
  server: Server;
  tools: OntologyTool[];
}

/**
 * Build the server.
 *
 * The low-level `Server` rather than `McpServer`, deliberately: a tool's input
 * schema on the wire *is* JSON Schema, which is what the catalogue already
 * carries. The high-level wrapper wants zod and would mean a second description
 * of every argument — and a converter between two schemas that can disagree.
 */
export function createOntologyMcpServer(options: OntologyMcpOptions): OntologyMcpServer {
  const server = new Server(
    { name: options.name ?? "ontology", version: options.version ?? "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ONTOLOGY_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parametersSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = ONTOLOGY_TOOLS.find((candidate) => candidate.name === request.params.name);
    if (!tool) {
      // MCP wants an error to be a result the model can read, not a transport
      // failure — the model is the one that has to try something else.
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Unknown ontology tool: ${request.params.name}` }],
      };
    }
    try {
      const args = { ...((request.params.arguments ?? {}) as Record<string, unknown>) };
      // The caller's roles come from the credential, and the arguments cannot
      // override them — the same reason the tenant cannot.
      if (options.identity) args.roles = rolesOf(options.identity);
      const data = await callOntologyTool(options.store, options.companyId, tool.name, args);
      return {
        content: [{ type: "text" as const, text: summarise(tool, data) }],
        structuredContent: (data ?? {}) as Record<string, unknown>,
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: String((err as Error)?.message ?? err) }],
      };
    }
  });

  return { server, tools: ONTOLOGY_TOOLS };
}

/** A one-line summary for the transcript; the structured payload carries the rest. */
function summarise(tool: OntologyTool, data: unknown): string {
  if (data && typeof data === "object") {
    const counted = Object.entries(data as Record<string, unknown>)
      .filter(([, value]) => Array.isArray(value))
      .map(([key, value]) => `${key}: ${(value as unknown[]).length}`);
    if (counted.length > 0) return `${tool.displayName} — ${counted.join(", ")}`;
    if ("path" in data) {
      const path = (data as { path: unknown[] | null }).path;
      return path === null ? `${tool.displayName} — 无路径` : `${tool.displayName} — ${path.length} 跳`;
    }
  }
  return tool.displayName;
}
