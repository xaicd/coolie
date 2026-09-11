/**
 * AI gateway enumerations, aligned with the DigitalStaff aigw / BrainProvider
 * model. Values are functional identifiers (clean-room), not copied code.
 */

/**
 * Upstream provider family. OpenAI-compatible covers most LLM vendors that
 * expose a /chat/completions endpoint (DeepSeek, GLM, MiniMax, Qwen, etc.);
 * anthropic covers the Anthropic-compatible endpoint family.
 */
export const CHANNEL_PROVIDERS = [
  "openai-compatible",
  "openai",
  "anthropic",
  "deepseek",
  "glm",
  "minimax",
  "qwen",
  "custom",
] as const;
export type ChannelProvider = (typeof CHANNEL_PROVIDERS)[number];

/** Channel health status (DS BrainProvider.healthStatus.status). */
export const CHANNEL_HEALTH_STATUSES = ["healthy", "unhealthy", "unknown"] as const;
export type ChannelHealthStatus = (typeof CHANNEL_HEALTH_STATUSES)[number];
