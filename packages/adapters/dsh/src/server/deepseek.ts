/**
 * DeepSeek chat-completions client.
 *
 * DSH is a DeepSeek harness, so its provider call is a plain
 * OpenAI-compatible `/chat/completions` request. The transport lives in one
 * small module so the harness can be tested without a network: tests inject
 * `fetchImpl`.
 */

export interface DeepSeekToolFunction {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
}

export interface DeepSeekTool {
  type: "function";
  function: DeepSeekToolFunction;
}

export type DeepSeekMessageRole = "system" | "user" | "assistant" | "tool";

export interface DeepSeekToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface DeepSeekMessage {
  role: DeepSeekMessageRole;
  content?: string | null;
  tool_calls?: DeepSeekToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface DeepSeekUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface DeepSeekChoice {
  message?: DeepSeekMessage;
  finish_reason?: string;
}

export interface DeepSeekChatResponse {
  choices?: DeepSeekChoice[];
  usage?: DeepSeekUsage;
}

export interface DeepSeekClientOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export class DeepSeekRequestError extends Error {
  readonly status: number | null;
  readonly body: string;

  constructor(message: string, status: number | null, body: string) {
    super(message);
    this.name = "DeepSeekRequestError";
    this.status = status;
    this.body = body;
  }
}

/** The slice of the client the harness depends on, so tests can fake it. */
export interface DshChatClient {
  readonly model: string;
  chat(input: {
    messages: DeepSeekMessage[];
    tools?: DeepSeekTool[];
    temperature?: number;
  }): Promise<DeepSeekChatResponse>;
}

export class DeepSeekClient implements DshChatClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  readonly model: string;

  constructor(options: DeepSeekClientOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async chat(input: {
    messages: DeepSeekMessage[];
    tools?: DeepSeekTool[];
    temperature?: number;
  }): Promise<DeepSeekChatResponse> {
    const controller = new AbortController();
    const timer = this.timeoutMs > 0 ? setTimeout(() => controller.abort(), this.timeoutMs) : null;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: input.messages,
          ...(input.tools && input.tools.length > 0
            ? { tools: input.tools, tool_choice: "auto" }
            : {}),
          ...(typeof input.temperature === "number" ? { temperature: input.temperature } : {}),
          stream: false,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new DeepSeekRequestError(
          `DeepSeek request timed out after ${this.timeoutMs}ms`,
          null,
          "",
        );
      }
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }

    const text = await response.text();
    if (!response.ok) {
      throw new DeepSeekRequestError(
        `DeepSeek request failed (HTTP ${response.status})`,
        response.status,
        text.slice(0, 2_000),
      );
    }

    try {
      return JSON.parse(text) as DeepSeekChatResponse;
    } catch {
      throw new DeepSeekRequestError(
        "DeepSeek returned a non-JSON response",
        response.status,
        text.slice(0, 2_000),
      );
    }
  }
}
