/**
 * Native 编码引擎的抽象接口(seam)。
 *
 * P2 骨架阶段用 `StubNativeEngine`(确定性、无外部依赖)跑通 coolie 的调度闭环;
 * 后续把 DigitalStaff 的原生 ReAct 引擎(clean-room 重写)实现成同一个接口替换即可,
 * adapter 契约与 coolie 侧代码都无需改动。
 */

export interface NativeEngineTask {
  /** 运行 id(来自 coolie 的 AdapterExecutionContext.runId)。 */
  runId: string;
  /** 任务上下文(来自 ctx.context):目标、issue 信息等。 */
  context: Record<string, unknown>;
  /** agent 的 adapter 配置(来自 ctx.config)。 */
  config: Record<string, unknown>;
}

export interface NativeEngineCallbacks {
  /** 输出一行日志(映射到 ctx.onLog)。 */
  log: (line: string) => void | Promise<void>;
  /** 报告一次进度(0..1 或阶段名),由 adapter 决定如何转成 coolie 事件。 */
  progress?: (note: string) => void | Promise<void>;
  /** 取消信号:引擎应周期性检查并尽快 settle。 */
  isCancelled: () => boolean;
}

export interface NativeEngineResult {
  /** 是否成功完成。 */
  ok: boolean;
  /** 人类可读的结果摘要(映射到 AdapterExecutionResult.summary)。 */
  summary: string;
  /** 结构化结果(映射到 resultJson)。 */
  resultJson?: Record<string, unknown>;
  /** token 用量(映射到 usage);骨架阶段用估算。 */
  inputTokens: number;
  outputTokens: number;
  /** 会话续存参数(映射到 sessionParams),支持下一轮继续。 */
  sessionParams?: Record<string, unknown>;
}

export interface NativeEngine {
  readonly name: string;
  run(task: NativeEngineTask, cb: NativeEngineCallbacks): Promise<NativeEngineResult>;
  /** 环境自检:引擎依赖是否就绪。 */
  health(): Promise<{ ok: boolean; detail: string }>;
}

/**
 * 骨架实现:不调用真实 LLM/沙箱,只做确定性的"读上下文 → 报进度 → 产出摘要"。
 * 目的是验证 coolie 能识别、调度此 adapter 并拿到结构化结果与用量。
 */
export class StubNativeEngine implements NativeEngine {
  readonly name = "coolie-native-stub";

  async health(): Promise<{ ok: boolean; detail: string }> {
    return { ok: true, detail: "Stub native engine ready (no external dependencies)." };
  }

  async run(task: NativeEngineTask, cb: NativeEngineCallbacks): Promise<NativeEngineResult> {
    const goal = typeof task.context.goal === "string" ? task.context.goal : "(no goal provided)";
    const steps = [
      "Thought: understand the task",
      "Action: inspect provided context",
      "Observation: context captured",
      "Reflection: compose result",
    ];

    await cb.log(`[coolie-native] run ${task.runId} started`);
    await cb.log(`[coolie-native] goal: ${goal}`);

    let outputChars = 0;
    for (const step of steps) {
      if (cb.isCancelled()) {
        await cb.log("[coolie-native] cancelled by operator");
        return {
          ok: false,
          summary: "Run cancelled before completion.",
          inputTokens: estimateTokens(goal),
          outputTokens: estimateTokens(String(outputChars)),
        };
      }
      await cb.progress?.(step);
      await cb.log(`[coolie-native] ${step}`);
      outputChars += step.length;
    }

    const summary = `Native engine (stub) processed goal: "${goal}". This is a P2 skeleton run — no code was changed.`;
    await cb.log("[coolie-native] run complete");

    return {
      ok: true,
      summary,
      resultJson: {
        engine: this.name,
        goal,
        stepsExecuted: steps.length,
        note: "skeleton run; replace StubNativeEngine with real ReAct engine to do actual work",
      },
      inputTokens: estimateTokens(goal),
      outputTokens: estimateTokens(summary),
      sessionParams: { lastRunId: task.runId, turns: 1 },
    };
  }
}

/** 粗略 token 估算(bytes/4 口径,和 rtk 一致),仅骨架用。 */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
