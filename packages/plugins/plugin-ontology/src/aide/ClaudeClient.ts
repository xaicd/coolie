import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Thrown by loadClaudeConfig() when ~/.claude/settings.json is missing or its
 * `env` section is incomplete (no ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL /
 * ANTHROPIC_MODEL). The worker treats this as a fatal startup error so the
 * operator sees the problem in the plugin logs immediately. The UI surfaces the
 * reason string via the `describe-domain` data payload's `configured` field.
 */
export class AideConfigError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`数字副手配置失败: ${reason}`);
    this.name = "AideConfigError";
    this.reason = reason;
  }
}

interface ClaudeConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

let cachedConfig: ClaudeConfig | null = null;
let cachedClient: Anthropic | null = null;

/**
 * Resolve the path to the Claude Code settings file. We honour $HOME first
 * because the worker may run inside a container with a remapped HOME; only fall
 * back to os.homedir() if the env var is unset.
 */
export function claudeSettingsPath(): string {
  const home = process.env.HOME ?? os.homedir();
  return path.join(home, ".claude", "settings.json");
}

/**
 * Read ~/.claude/settings.json synchronously and pull the three env fields the
 * Anthropic SDK needs. Throws AideConfigError if the file is missing or the
 * required keys are absent. Per the user's chosen policy the worker calls this
 * exactly once at startup (see worker.onActivate) and caches the result.
 */
export function loadClaudeConfig(): ClaudeConfig {
  if (cachedConfig) return cachedConfig;
  const settingsPath = claudeSettingsPath();
  let raw: string;
  try {
    raw = fs.readFileSync(settingsPath, "utf8");
  } catch (err) {
    const code = (err as { code?: unknown })?.code;
    const reason = err instanceof Error && code === "ENOENT"
      ? `${settingsPath} not found`
      : `${settingsPath} unreadable: ${err instanceof Error ? err.message : String(err)}`;
    throw new AideConfigError(reason);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new AideConfigError(
      `${settingsPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const env = (parsed as { env?: Record<string, unknown> }).env;
  if (!env || typeof env !== "object") {
    throw new AideConfigError(`${settingsPath} is missing the "env" section`);
  }

  const apiKey = pickString(env.ANTHROPIC_AUTH_TOKEN);
  const baseURL = pickString(env.ANTHROPIC_BASE_URL);
  const model = pickString(env.ANTHROPIC_MODEL);

  if (!apiKey) throw new AideConfigError("env.ANTHROPIC_AUTH_TOKEN is missing");
  if (!baseURL) throw new AideConfigError("env.ANTHROPIC_BASE_URL is missing");
  if (!model) throw new AideConfigError("env.ANTHROPIC_MODEL is missing");

  cachedConfig = { apiKey, baseURL, model };
  return cachedConfig;
}

/**
 * Lightweight, non-throwing probe used by `describe-domain` to tell the UI
 * whether the aide is configured. Returns `{ configured: false, reason }` on
 * any failure so the UI can render a setup card without crashing.
 */
export function probeClaudeConfig(): { configured: boolean; reason?: string } {
  try {
    loadClaudeConfig();
    return { configured: true };
  } catch (err) {
    return {
      configured: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Lazy Anthropic client; created on first use so a misconfigured host does
 *  not blow up the worker before probeClaudeConfig() can answer. */
export function getClient(): Anthropic {
  const cfg = loadClaudeConfig();
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
  }
  return cachedClient;
}

export function getModel(): string {
  return loadClaudeConfig().model;
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}