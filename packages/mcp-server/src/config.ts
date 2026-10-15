/**
 * Which credential `apiKey` holds, so the client can present it on the right
 * channel. Upstream treats every key as an agent bearer; this fork also has a
 * board channel (`x-paperclip-api-key`) and a loopback board-concierge key, so
 * the config must be able to declare what it was given.
 */
export type PaperclipMcpTokenType = "agent" | "board" | "user";

export interface PaperclipMcpConfig {
  apiUrl: string;
  apiKey: string;
  tokenType: PaperclipMcpTokenType;
  companyId: string | null;
  agentId: string | null;
  runId: string | null;
}

function nonEmpty(value: string | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * `PAPERCLIP_MCP_TOKEN_TYPE` — defaults to `agent` and accepts `board`/`user`.
 * An unrecognized value falls back to `agent` (the upstream default) rather
 * than failing startup, so an old config keeps working.
 */
function parseTokenType(value: string | undefined): PaperclipMcpTokenType {
  const normalized = value?.trim().toLowerCase();
  return normalized === "board" || normalized === "user" ? normalized : "agent";
}

export function normalizeApiUrl(apiUrl: string): string {
  const trimmed = stripTrailingSlash(apiUrl.trim());
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

export function readConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PaperclipMcpConfig {
  const apiUrl = nonEmpty(env.PAPERCLIP_API_URL ?? env.COOLIE_API_URL);
  if (!apiUrl) {
    throw new Error("Missing PAPERCLIP_API_URL or COOLIE_API_URL");
  }
  const apiKey = nonEmpty(
    env.PAPERCLIP_API_KEY ?? env.COOLIE_AGENT_KEY ?? env.COOLIE_API_KEY,
  );
  if (!apiKey) {
    throw new Error("Missing PAPERCLIP_API_KEY or COOLIE_API_KEY");
  }

  return {
    apiUrl: normalizeApiUrl(apiUrl),
    apiKey,
    tokenType: parseTokenType(env.PAPERCLIP_MCP_TOKEN_TYPE),
    companyId: nonEmpty(env.PAPERCLIP_COMPANY_ID ?? env.COOLIE_COMPANY_ID),
    agentId: nonEmpty(env.PAPERCLIP_AGENT_ID ?? env.COOLIE_AGENT_ID),
    runId: nonEmpty(env.PAPERCLIP_RUN_ID ?? env.COOLIE_RUN_ID),
  };
}
