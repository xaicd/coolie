/**
 * The DSH agent loop.
 *
 * One turn is: ask DeepSeek, and while it answers with tool calls, run each
 * against the MCP gateway and feed the result back. A tool failure is turned
 * into a tool message the model can read and recover from, rather than
 * aborting the run — the same "an error is a result the model reads" rule the
 * ontology MCP server follows.
 */

import type {
  DeepSeekChatResponse,
  DeepSeekMessage,
  DeepSeekTool,
  DshChatClient,
} from "./deepseek.js";

export interface DshHarnessInput {
  client: DshChatClient;
  messages: DeepSeekMessage[];
  tools?: DeepSeekTool[];
  callTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxSteps: number;
  onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
  isCancelled: () => boolean;
}

export interface DshHarnessResult {
  ok: boolean;
  cancelled: boolean;
  summary: string | null;
  steps: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  transcript: DeepSeekMessage[];
}

const MAX_TOOL_RESULT_CHARS = 100_000;

function parseToolArguments(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export async function runDshHarness(input: DshHarnessInput): Promise<DshHarnessResult> {
  const transcript: DeepSeekMessage[] = [...input.messages];
  let inputTokens = 0;
  let outputTokens = 0;
  let steps = 0;
  let toolCalls = 0;

  const base = () => ({ steps, toolCalls, inputTokens, outputTokens, transcript });

  while (steps < input.maxSteps) {
    if (input.isCancelled()) {
      return {
        ok: false,
        cancelled: true,
        summary: "Run cancelled before completion.",
        ...base(),
      };
    }

    steps += 1;
    let response: DeepSeekChatResponse;
    try {
      response = await input.client.chat({
        messages: transcript,
        ...(input.tools && input.tools.length > 0 ? { tools: input.tools } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await input.onLog("stderr", `[dsh] model request failed: ${message}\n`);
      return { ok: false, cancelled: false, summary: message, ...base() };
    }

    inputTokens += response.usage?.prompt_tokens ?? 0;
    outputTokens += response.usage?.completion_tokens ?? 0;

    const message = response.choices?.[0]?.message;
    if (!message) {
      return {
        ok: false,
        cancelled: false,
        summary: "DeepSeek returned no choices.",
        ...base(),
      };
    }

    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    transcript.push({
      role: "assistant",
      content: message.content ?? "",
      ...(calls.length > 0 ? { tool_calls: calls } : {}),
    });

    if (calls.length === 0) {
      const summary = (message.content ?? "").trim();
      return {
        ok: true,
        cancelled: false,
        summary: summary.length > 0 ? summary : null,
        ...base(),
      };
    }

    for (const call of calls) {
      toolCalls += 1;
      const name = call.function?.name ?? "";
      const rawArgs = call.function?.arguments ?? "{}";
      let resultText: string;
      try {
        if (!name) throw new Error("Tool call is missing a function name");
        if (!input.callTool) {
          throw new Error(`No MCP endpoint configured; cannot call ${name}`);
        }
        const args = parseToolArguments(rawArgs);
        const value = await input.callTool(name, args);
        resultText = JSON.stringify(value ?? null);
        await input.onLog("stdout", `[dsh] tool ${name} -> ok\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        resultText = JSON.stringify({ error: message });
        await input.onLog("stderr", `[dsh] tool ${name} failed: ${message}\n`);
      }
      transcript.push({
        role: "tool",
        tool_call_id: call.id,
        name,
        content: resultText.slice(0, MAX_TOOL_RESULT_CHARS),
      });
    }
  }

  return {
    ok: false,
    cancelled: false,
    summary: `Reached the maximum of ${input.maxSteps} steps without a final answer.`,
    ...base(),
  };
}
