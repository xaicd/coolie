import type {
  NativeEngine,
  NativeEngineTask,
  NativeEngineCallbacks,
  NativeEngineResult,
} from "./engine.js";

/**
 * 最小的"真实 LLM 调用"引擎:直接调用 OpenAI 兼容的 /chat/completions 端点。
 *
 * 用途:验证 coolie 调度 → coolie_native adapter → 真实模型 → 结果回写 整条链路,
 * 而无需安装任何本地 CLI 二进制(codex/claude/opencode 那种)。
 *
 * 天然支持国内模型(DeepSeek / 通义千问 Qwen / Kimi / 智谱 等大多提供 OpenAI 兼容 API):
 * 只要配 baseURL + apiKey + model 即可,零额外代码。
 *
 * 配置来源优先级:adapterConfig(agent 配置) > 环境变量。
 *   - baseURL: config.baseURL | env COOLIE_NATIVE_BASE_URL | env OPENAI_BASE_URL (默认 https://api.openai.com/v1)
 *   - apiKey:  config.apiKey  | env COOLIE_NATIVE_API_KEY  | env OPENAI_API_KEY
 *   - model:   config.model   | env COOLIE_NATIVE_MODEL     | env OPENAI_MODEL (默认 gpt-4o-mini)
 *
 * 说明:这是"薄接入",不是完整 ReAct 引擎。真正的 native 引擎(工具循环/沙箱/HITL)
 * 将来实现同一 NativeEngine 接口替换即可,adapter 契约不变。
 */

interface ResolvedConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

function pickString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

function resolveConfig(config: Record<string, unknown>): ResolvedConfig {
  const env = process.env;
  const baseURL =
    pickString(config.baseURL, env.COOLIE_NATIVE_BASE_URL, env.OPENAI_BASE_URL) ??
    "https://api.openai.com/v1";
  const apiKey = pickString(config.apiKey, env.COOLIE_NATIVE_API_KEY, env.OPENAI_API_KEY) ?? "";
  const model =
    pickString(config.model, env.COOLIE_NATIVE_MODEL, env.OPENAI_MODEL) ?? "gpt-4o-mini";
  return { baseURL: baseURL.replace(/\/$/, ""), apiKey, model };
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAiCompatibleEngine implements NativeEngine {
  readonly name = "coolie-native-openai-compatible";

  async health(): Promise<{ ok: boolean; detail: string }> {
    const cfg = resolveConfig({});
    if (!cfg.apiKey) {
      return {
        ok: false,
        detail: "Missing API key. Set adapterConfig.apiKey or COOLIE_NATIVE_API_KEY / OPENAI_API_KEY.",
      };
    }
    return { ok: true, detail: `Ready. endpoint=${cfg.baseURL}, model=${cfg.model}` };
  }

  async run(task: NativeEngineTask, cb: NativeEngineCallbacks): Promise<NativeEngineResult> {
    const cfg = resolveConfig(task.config ?? {});
    const goal = typeof task.context.goal === "string" ? task.context.goal : "";
    const prompt =
      goal ||
      (typeof task.context.prompt === "string" ? (task.context.prompt as string) : "") ||
      "Introduce yourself briefly.";

    if (!cfg.apiKey) {
      await cb.log("[coolie-native] no API key configured; cannot call model");
      return {
        ok: false,
        summary: "No API key configured for coolie_native engine.",
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    await cb.log(`[coolie-native] calling ${cfg.model} @ ${cfg.baseURL}`);
    await cb.progress?.("calling model");

    if (cb.isCancelled()) {
      return { ok: false, summary: "Cancelled before model call.", inputTokens: 0, outputTokens: 0 };
    }

    const res = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: "system", content: "You are Coolie, a concise engineering assistant." },
          { role: "user", content: prompt },
        ],
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      await cb.log(`[coolie-native] model call failed: HTTP ${res.status} ${errText.slice(0, 200)}`);
      return {
        ok: false,
        summary: `Model call failed with HTTP ${res.status}.`,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const answer = data.choices?.[0]?.message?.content?.trim() ?? "(empty response)";
    const inputTokens = data.usage?.prompt_tokens ?? Math.ceil(prompt.length / 4);
    const outputTokens = data.usage?.completion_tokens ?? Math.ceil(answer.length / 4);

    await cb.log("[coolie-native] model responded");
    return {
      ok: true,
      summary: answer,
      resultJson: { engine: this.name, model: cfg.model, endpoint: cfg.baseURL, answer },
      inputTokens,
      outputTokens,
      sessionParams: { lastRunId: task.runId, model: cfg.model },
    };
  }
}
