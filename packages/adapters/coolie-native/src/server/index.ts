import type {
  ServerAdapterModule,
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { StubNativeEngine, type NativeEngine } from "../engine.js";
import { OpenAiCompatibleEngine } from "../openai-compatible-engine.js";

export const COOLIE_NATIVE_ADAPTER_TYPE = "coolie_native";

/**
 * 引擎选择:
 *  - 默认 StubNativeEngine(确定性、无外部依赖,验证调度闭环)。
 *  - 当配置了 API key(env COOLIE_NATIVE_API_KEY / OPENAI_API_KEY,或 agent adapterConfig.apiKey)
 *    时,用 OpenAiCompatibleEngine 直接调 OpenAI 兼容端点(支持 DeepSeek/Qwen/Kimi 等国内模型)。
 * 将来真实 native ReAct 引擎实现同一 NativeEngine 接口替换即可,adapter 契约不变。
 */
function selectDefaultEngine(): NativeEngine {
  const hasKey =
    typeof process.env.COOLIE_NATIVE_API_KEY === "string" && process.env.COOLIE_NATIVE_API_KEY.trim() !== "";
  const hasOpenAiKey =
    typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.trim() !== "";
  return hasKey || hasOpenAiKey ? new OpenAiCompatibleEngine() : new StubNativeEngine();
}

let engine: NativeEngine = selectDefaultEngine();

/** 供后续替换真实引擎(或测试注入)。 */
export function setNativeEngine(next: NativeEngine): void {
  engine = next;
}

async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  // 允许在开始 provider 工作前 opt-in 取消
  await ctx.onCancellationReady?.();
  // 无本地进程:立即报告已越过 dispatch 边界(契约要求)
  ctx.onDispatch?.();

  try {
    const result = await engine.run(
      { runId: ctx.runId, context: ctx.context ?? {}, config: ctx.config ?? {} },
      {
        log: (line) => ctx.onLog("stdout", line.endsWith("\n") ? line : `${line}\n`),
        progress: async (note) => {
          await ctx.onEvent?.({
            eventType: "coolie_native.progress",
            stream: "system",
            level: "info",
            message: note,
          });
        },
        isCancelled: () => ctx.signal?.aborted === true,
      },
    );

    const aborted = ctx.signal?.aborted === true;
    return {
      exitCode: result.ok ? 0 : 1,
      signal: aborted ? "SIGTERM" : null,
      timedOut: false,
      usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      usageBasis: "per_run",
      summary: result.summary,
      resultJson: result.resultJson ?? null,
      sessionParams: result.sessionParams ?? null,
      provider: "coolie-native",
      model: engine.name,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.onLog("stderr", `[coolie-native] error: ${message}\n`);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: message,
      usage: { inputTokens: 0, outputTokens: 0 },
      usageBasis: "per_run",
    };
  }
}

async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const health = await engine.health();
  return {
    adapterType: ctx.adapterType,
    status: health.ok ? "pass" : "fail",
    checks: [
      {
        code: "coolie_native_engine",
        level: health.ok ? "info" : "error",
        message: health.ok ? "Coolie native engine is ready." : "Coolie native engine is unavailable.",
        detail: health.detail,
      },
    ],
    testedAt: new Date().toISOString(),
  };
}

/**
 * coolie_native adapter —— 把 Coolie 原生编码引擎接入 Paperclip 的 adapter 契约。
 * 目前的 P2 骨架用 StubNativeEngine 跑通调度闭环。
 */
export const coolieNativeAdapter: ServerAdapterModule = {
  type: COOLIE_NATIVE_ADAPTER_TYPE,
  runtimeToolDelivery: "invocation_context",
  execute,
  testEnvironment,
  models: [],
  agentConfigurationDoc: `# coolie_native agent configuration

Adapter: coolie_native

Runs the Coolie in-house coding engine as a Paperclip adapter.
P2 skeleton: uses a deterministic stub engine (no LLM/sandbox calls yet).

Config fields (skeleton):
- (none required)

Task context (ctx.context) may include:
- goal (string): the objective for this run
`,
};

export default coolieNativeAdapter;
