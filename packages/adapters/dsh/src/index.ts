export const type = "dsh";
export const label = "DSH (DeepSeek Harness)";

export const DSH_ADAPTER_TYPE = type;

/** DeepSeek's OpenAI-compatible API root. */
export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export const DEFAULT_DSH_MODEL = "deepseek-chat";

export const models: Array<{ id: string; label: string }> = [
  { id: "deepseek-chat", label: "DeepSeek Chat" },
  { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
];

export function isValidDshModelId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export const agentConfigurationDoc = `# dsh agent configuration

Adapter: dsh

DSH (DeepSeek Harness) is the DeepSeek-backed MCP gateway. It runs a
tool-calling loop against DeepSeek and exposes the ontology MCP tool
catalogue (packages/ontology-core/src/mcp) as the agent's tools, so a
"business agent" can read and propose ontology changes conversationally.

Use when:
- You want a DeepSeek-hosted agent on this company (deepseek-chat / deepseek-reasoner)
- You want the agent to work through the ontology MCP tools rather than shell/file tools

Don't use when:
- You need a local coding CLI with a workspace (use claude_local / codex_local / opencode_local)
- You have no DeepSeek API key and no MCP endpoint configured

Core fields:
- apiKey (string, optional): DeepSeek API key; falls back to DEEPSEEK_API_KEY / DSH_API_KEY
- model (string, required): deepseek-chat (default) or deepseek-reasoner
- baseUrl (string, optional): API root (default ${DEFAULT_DEEPSEEK_BASE_URL})
- mcpUrl (string, optional): ontology MCP HTTP endpoint; falls back to the run's runtime MCP endpoint
- mcpBearerToken (string, optional): bearer token for the MCP endpoint
- mcpHeaders (object, optional): extra headers for the MCP endpoint
- systemPrompt (string, optional): system message; a sensible default is used otherwise
- prompt (string, optional): user message; otherwise built from the run context
- maxSteps (number, optional): tool-calling loop cap (default 12)
- timeoutSec (number, optional): per-request timeout in seconds (default 120)

Notes:
- Tools are only advertised when an MCP endpoint is resolvable; without one the
  agent answers without tools instead of failing.
- No interactive login: authenticating with the vendor is an API key, not a
  device flow.
`;
