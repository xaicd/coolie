/**
 * DSH's MCP side.
 *
 * DSH is an MCP *gateway*: it takes the ontology's agent-facing tool catalogue —
 * the same `ONTOLOGY_TOOLS` the ontology MCP server serves, derived from the
 * contract rather than maintained beside it — and presents it to DeepSeek as
 * function-calling tools. Calls are dispatched back over MCP JSON-RPC, so the
 * adapter reuses the ontology protocol instead of inventing a second one.
 */

import { ONTOLOGY_TOOLS } from "@paperclipai/ontology-core/mcp/tools.js";
import {
  projectApiToMcpTool,
  synthesizeMockResponse,
  type ApiContractDefinition,
} from "@paperclipai/ontology-core/api/lifecycle.js";
import type { DeepSeekTool } from "./deepseek.js";

export const DSH_MCP_PROTOCOL_VERSION = "2025-06-18";
export const DSH_MCP_CLIENT_NAME = "dsh-paperclip";
export const DSH_MCP_CLIENT_VERSION = "0.1.0";

/** The ontology tool catalogue, in the shape DeepSeek's function calling expects. */
export function ontologyMcpTools(): DeepSeekTool[] {
  return ONTOLOGY_TOOLS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parametersSchema,
    },
  }));
}

/**
 * Projects dynamic project business API contracts into DeepSeek function tools.
 */
export function projectApiMcpTools(apis: ApiContractDefinition[]): DeepSeekTool[] {
  return apis
    .filter((api) => api.mcpExposed)
    .map((api) => {
      const projected = projectApiToMcpTool(api);
      return {
        type: "function" as const,
        function: {
          name: projected.name,
          description: projected.description,
          parameters: projected.parameters,
        },
      };
    });
}

/**
 * Combined tool catalogue exposing both ontology schema tools and business API tools to DSH.
 */
export function dshCombinedTools(dynamicApis?: ApiContractDefinition[]): DeepSeekTool[] {
  const baseTools = ontologyMcpTools();
  if (!dynamicApis || dynamicApis.length === 0) return baseTools;
  return [...baseTools, ...projectApiMcpTools(dynamicApis)];
}

export interface McpToolInvokerOptions {
  /** Streamable-HTTP MCP endpoint, e.g. https://host/mcp or /mcp/gateways/gw_... */
  endpoint: string;
  bearerToken?: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Optional project API contracts registered in DSH. */
  registeredApis?: ApiContractDefinition[];
}

export interface McpToolInvoker {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * A streamable-HTTP MCP response is either a JSON body or an SSE stream whose
 * `data:` lines carry the JSON-RPC frame. Take the last frame either way.
 */
function parseMcpBody(body: string, contentType: string): unknown {
  const trimmed = body.trim();
  if (!trimmed) return null;
  if (contentType.includes("text/event-stream")) {
    const frames = trimmed
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .filter(Boolean);
    const last = frames[frames.length - 1];
    return last ? (JSON.parse(last) as unknown) : null;
  }
  return JSON.parse(trimmed) as unknown;
}

function summarizeMcpContent(result: Record<string, unknown>): string {
  const content = Array.isArray(result.content) ? result.content : [];
  const texts = content
    .map((entry) => {
      const record = asRecord(entry);
      return record && typeof record.text === "string" ? record.text : null;
    })
    .filter((entry): entry is string => Boolean(entry));
  return texts.join("\n");
}

/** Unwrap MCP content envelopes; fall back to the raw JSON-RPC result. */
function normalizeMcpResult(result: Record<string, unknown>): unknown {
  const text = summarizeMcpContent(result);
  if (!text) return result;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function createMcpToolInvoker(options: McpToolInvokerOptions): McpToolInvoker {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const baseHeaders: Record<string, string> = { ...(options.headers ?? {}) };

  let sessionId: string | null = null;
  let initialized: Promise<void> | null = null;

  async function post(payload: unknown): Promise<{ status: number; body: string; contentType: string }> {
    const controller = new AbortController();
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...baseHeaders,
      };
      if (options.bearerToken) headers.authorization = `Bearer ${options.bearerToken}`;
      if (sessionId) headers["mcp-session-id"] = sessionId;

      const response = await fetchImpl(options.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = await response.text();
      const headerSession = response.headers.get("mcp-session-id");
      if (headerSession) sessionId = headerSession;
      return {
        status: response.status,
        body,
        contentType: response.headers.get("content-type") ?? "",
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function initialize(): Promise<void> {
    await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: DSH_MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: DSH_MCP_CLIENT_NAME, version: DSH_MCP_CLIENT_VERSION },
      },
    });
    // Notification: no id, no response expected.
    await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  return {
    async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
      if (options.registeredApis && options.registeredApis.length > 0) {
        const matchedApi = options.registeredApis.find(
          (a) =>
            a.mcpToolName === name ||
            `call_${a.apiKey.replace(/[^a-zA-Z0-9_]/g, "_")}` === name,
        );
        if (matchedApi) {
          if (matchedApi.stage === "mocking" || !options.endpoint) {
            return synthesizeMockResponse(matchedApi);
          }
        }
      }

      if (!initialized) initialized = initialize();
      await initialized;

      const response = await post({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name, arguments: args },
      });
      if (response.status >= 400) {
        throw new Error(`MCP endpoint returned HTTP ${response.status} for ${name}`);
      }

      let parsed: unknown;
      try {
        parsed = parseMcpBody(response.body, response.contentType);
      } catch {
        throw new Error(`MCP endpoint returned an unparseable body for ${name}`);
      }

      const frame = asRecord(parsed);
      if (frame?.error) {
        throw new Error(`MCP tool ${name} failed: ${JSON.stringify(frame.error).slice(0, 500)}`);
      }
      const result = asRecord(frame?.result) ?? frame;
      if (!result) throw new Error(`MCP tool ${name} returned no result`);
      if (result.isError === true) {
        throw new Error(summarizeMcpContent(result) || `MCP tool ${name} reported an error`);
      }
      return normalizeMcpResult(result);
    },
  };
}
