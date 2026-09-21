import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import { asNumber, parseObject } from "@paperclipai/adapter-utils/server-utils";
import {
  DSH_ADAPTER_TYPE,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DSH_MODEL,
  isValidDshModelId,
} from "../index.js";
import { DeepSeekClient, DeepSeekRequestError, type DeepSeekMessage } from "./deepseek.js";
import { createMcpToolInvoker, ontologyMcpTools } from "./mcp.js";
import { runDshHarness } from "./harness.js";

export const DEFAULT_DSH_MAX_STEPS = 12;
export const DEFAULT_DSH_TIMEOUT_SEC = 120;

export const DEFAULT_DSH_SYSTEM_PROMPT = `You are a DSH (DeepSeek Harness) business agent for this company.

You answer questions and take actions through the ontology MCP tools you are given. Rules:
- Call a tool before asserting a fact about the company's model or data. Do not guess domain slugs or node keys.
- The ontology's write path is a proposal: it changes nothing until a human or a rule decides it. State the evidence in a proposal's summary.
- If a tool reports that something does not exist, say so — an empty result is a finding, not a failure.
- When you are done, answer directly and concisely.`;

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** DSH is API-key only; the key may come from config or the environment. */
export function resolveDshApiKey(config: Record<string, unknown>): string | null {
  return (
    nonEmpty(config.apiKey) ??
    nonEmpty(config.deepseekApiKey) ??
    nonEmpty(process.env.DEEPSEEK_API_KEY) ??
    nonEmpty(process.env.DSH_API_KEY)
  );
}

export function resolveDshModel(config: Record<string, unknown>): string {
  const model = nonEmpty(config.model) ?? DEFAULT_DSH_MODEL;
  return isValidDshModelId(model) ? model : DEFAULT_DSH_MODEL;
}

export function resolveDshMcpEndpoint(config: Record<string, unknown>): string | null {
  return nonEmpty(config.mcpUrl) ?? nonEmpty(config.mcpEndpoint) ?? null;
}

/** Build the user turn from the run context when no explicit prompt is set. */
export function buildDshUserPrompt(context: Record<string, unknown>): string {
  const explicit = nonEmpty(context.prompt) ?? nonEmpty(context.goal);
  if (explicit) return explicit;

  const lines: string[] = [];
  const taskId = nonEmpty(context.taskId) ?? nonEmpty(context.issueId);
  if (taskId) lines.push(`Task: ${taskId}`);
  const title = nonEmpty(context.issueTitle) ?? nonEmpty(context.title);
  if (title) lines.push(`Title: ${title}`);
  const taskMarkdown = nonEmpty(context.taskMarkdown);
  if (taskMarkdown) lines.push("", taskMarkdown);

  if (lines.length === 0) {
    const serialized = JSON.stringify(context);
    return serialized.length > 0 && serialized !== "{}"
      ? `Run context:\n\n\`\`\`json\n${serialized.slice(0, 8_000)}\n\`\`\``
      : "No run context was provided. Report what you need to proceed.";
  }
  return lines.join("\n");
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const config = parseObject(ctx.config);

  const apiKey = resolveDshApiKey(config);
  if (!apiKey) {
    const message =
      "DSH adapter is missing a DeepSeek API key. Set adapterConfig.apiKey or DEEPSEEK_API_KEY.";
    await ctx.onLog("stderr", `${message}\n`);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: message,
      errorCode: "dsh_api_key_missing",
    };
  }

  const model = resolveDshModel(config);
  const baseUrl = nonEmpty(config.baseUrl) ?? DEFAULT_DEEPSEEK_BASE_URL;
  const maxSteps = Math.max(1, Math.floor(asNumber(config.maxSteps, DEFAULT_DSH_MAX_STEPS)));
  const timeoutSec = Math.max(0, Math.floor(asNumber(config.timeoutSec, DEFAULT_DSH_TIMEOUT_SEC)));
  const timeoutMs = timeoutSec > 0 ? timeoutSec * 1000 : 0;

  const mcpEndpoint = resolveDshMcpEndpoint(config);
  const tools = mcpEndpoint ? ontologyMcpTools() : undefined;
  const callTool = mcpEndpoint
    ? createMcpToolInvoker({
        endpoint: mcpEndpoint,
        ...(nonEmpty(config.mcpBearerToken) ? { bearerToken: nonEmpty(config.mcpBearerToken)! } : {}),
        headers: Object.fromEntries(
          Object.entries(parseObject(config.mcpHeaders)).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        ),
        timeoutMs: timeoutMs > 0 ? timeoutMs : undefined,
      }).callTool
    : undefined;

  const messages: DeepSeekMessage[] = [
    { role: "system", content: nonEmpty(config.systemPrompt) ?? DEFAULT_DSH_SYSTEM_PROMPT },
    { role: "user", content: buildDshUserPrompt(ctx.context ?? {}) },
  ];

  await ctx.onCancellationReady?.();
  await ctx.onMeta?.({
    adapterType: DSH_ADAPTER_TYPE,
    command: "deepseek",
    commandArgs: ["chat/completions", model],
    context: ctx.context,
  });
  await ctx.onLog(
    "stdout",
    `[dsh] model=${model} tools=${tools ? tools.length : 0} mcp=${mcpEndpoint ?? "(none)"}\n`,
  );

  // No local process: report the dispatch boundary before the first provider call.
  ctx.onDispatch?.();

  try {
    const result = await runDshHarness({
      client: new DeepSeekClient({ apiKey, model, baseUrl, timeoutMs }),
      messages,
      ...(tools ? { tools } : {}),
      ...(callTool ? { callTool } : {}),
      maxSteps,
      onLog: ctx.onLog,
      isCancelled: () => ctx.signal?.aborted === true,
    });

    const aborted = ctx.signal?.aborted === true;
    if (aborted) {
      return {
        exitCode: 1,
        signal: "SIGTERM",
        timedOut: false,
        errorMessage: "Run cancelled by operator.",
        errorCode: "dsh_cancelled",
        usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
        usageBasis: "per_run",
        provider: "deepseek",
        model,
      };
    }

    await ctx.onLog(
      "stdout",
      `[dsh] run ${result.ok ? "completed" : "failed"} steps=${result.steps} toolCalls=${result.toolCalls}\n`,
    );

    return {
      exitCode: result.ok ? 0 : 1,
      signal: null,
      timedOut: false,
      usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      usageBasis: "per_run",
      summary: result.summary,
      resultJson: {
        adapter: DSH_ADAPTER_TYPE,
        model,
        steps: result.steps,
        toolCalls: result.toolCalls,
        tools: tools ? tools.length : 0,
        transcript: result.transcript,
      },
      provider: "deepseek",
      model,
      ...(result.ok
        ? {}
        : { errorMessage: result.summary ?? "DSH run did not complete.", errorCode: "dsh_run_incomplete" }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof DeepSeekRequestError ? "dsh_request_failed" : "dsh_failed";
    await ctx.onLog("stderr", `[dsh] error: ${message}\n`);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: message,
      errorCode: code,
      provider: "deepseek",
      model,
    };
  }
}
