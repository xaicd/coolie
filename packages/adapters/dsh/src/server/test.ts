import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { parseObject } from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_DSH_MODEL, isValidDshModelId } from "../index.js";
import { ontologyMcpTools } from "./mcp.js";
import { resolveDshApiKey, resolveDshMcpEndpoint } from "./execute.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * DSH is an API-key vendor, so this is a configuration check rather than a
 * network probe: a missing key is an error, a missing MCP endpoint is a warning
 * (the agent still answers, just without ontology tools).
 */
export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);

  const apiKey = resolveDshApiKey(config);
  if (apiKey) {
    checks.push({
      code: "dsh_api_key_present",
      level: "info",
      message: "A DeepSeek API key is configured.",
    });
  } else {
    checks.push({
      code: "dsh_api_key_missing",
      level: "error",
      message: "No DeepSeek API key found.",
      hint: "Set adapterConfig.apiKey or export DEEPSEEK_API_KEY.",
    });
  }

  const model = nonEmpty(config.model) ?? DEFAULT_DSH_MODEL;
  if (isValidDshModelId(model)) {
    checks.push({ code: "dsh_model_valid", level: "info", message: `Model: ${model}` });
  } else {
    checks.push({
      code: "dsh_model_invalid",
      level: "error",
      message: `Invalid model id: ${String(config.model)}`,
      hint: "Use deepseek-chat or deepseek-reasoner.",
    });
  }

  const baseUrl = nonEmpty(config.baseUrl);
  if (baseUrl) {
    try {
      new URL(baseUrl);
      checks.push({ code: "dsh_base_url_valid", level: "info", message: `API base URL: ${baseUrl}` });
    } catch {
      checks.push({
        code: "dsh_base_url_invalid",
        level: "error",
        message: `Invalid base URL: ${baseUrl}`,
      });
    }
  }

  const mcpEndpoint = resolveDshMcpEndpoint(config);
  let toolCount = 0;
  try {
    toolCount = ontologyMcpTools().length;
  } catch (error) {
    checks.push({
      code: "dsh_mcp_catalogue_unavailable",
      level: "error",
      message: "The ontology MCP tool catalogue could not be loaded.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  if (mcpEndpoint) {
    checks.push({
      code: "dsh_mcp_endpoint_configured",
      level: "info",
      message: `MCP endpoint: ${mcpEndpoint}`,
      detail: `${toolCount} ontology tools available to the agent.`,
    });
  } else {
    checks.push({
      code: "dsh_mcp_endpoint_missing",
      level: "warn",
      message: "No MCP endpoint configured; the agent will answer without ontology tools.",
      hint: "Set adapterConfig.mcpUrl to the ontology MCP endpoint.",
    });
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
