/**
 * 工坊对话智能指令路由 (wave19) — h5 镜像.
 *
 * 与 `clients/expo/src/components/commandRouter.ts` 保持同一套触发词与判定顺序,
 * 让两端对话流对同一句话分发到同一个编排能力。
 *
 *   build    「build xxx / 开发 xxx / 做 xxx」→ 构建五步链 (server build-orchestrator)
 *   domain   「建域 xxx / 建模 xxx / domain xxx」→ 本体规范预览
 *   pipeline 「建 pipeline xxx / 创建 pipeline xxx」→ 建 pipeline 后跳编辑器
 *   plan     「plan xxx / 规划 xxx / 设计 xxx」→ 建 plan 任务后跳详情
 *   pr       「开 pr xxx / 提交 pr xxx」→ 建带 pr-workflow 意图的任务
 *   chat     其余 → 普通总办问答
 *
 * h5 端没有 expo 端的卡片组件, 所以 build/domain 的触发词在这里本地定义一份,
 * 与 server/src/services/build-orchestrator.ts 的正则同形。
 */

/** 「build xxx」/「开发 xxx」/「做 xxx」 */
export const BUILD_TRIGGER_PATTERN = /^(?:build|开发|做)\s+/i;
/** 「建域 xxx」/「建模 xxx」/「domain xxx」 */
export const DOMAIN_TRIGGER_PATTERN = /^(?:建域|建模|domain)\s+/i;
/** 「建 pipeline xxx」/「创建 pipeline xxx」/「新建 pipeline xxx」 */
export const PIPELINE_TRIGGER_PATTERN = /^(?:建|创建|新建)\s*pipeline\s+(.+)$/i;
/** 「plan xxx」/「规划 xxx」/「设计 xxx」 */
export const PLAN_TRIGGER_PATTERN = /^(?:plan|规划|设计)\s+(.+)$/i;
/** 「开 pr xxx」/「提交 pr xxx」/「建 pr xxx」 */
export const PR_TRIGGER_PATTERN = /^(?:开|提交|建)\s*pr\s+(.+)$/i;

/** wave19 指令分发回执文案. 英文 key 对齐 i18n 约定, 值即界面展示的中文。 */
export const COMMAND_MESSAGES: Record<string, string> = {
  "Build mode started": "Build 模式已启动",
  "Pipeline created": "Pipeline 已创建",
  "Plan created": "Plan 已创建",
  "PR workflow triggered": "PR workflow 已触发",
  "Unknown command": "未知指令, 请用 build/pipeline/plan 开头",
};

/** 取指令回执文案 (缺 key 时原样返回, 便于排查) */
export function tCommand(key: string): string {
  return COMMAND_MESSAGES[key] ?? key;
}

export type CommandKind = "domain" | "build" | "pipeline" | "plan" | "pr" | "chat";

export interface ParsedCommand {
  kind: CommandKind;
  /** 去掉触发词后的主体: "build 登录页" -> "登录页" */
  subject: string;
}

/** 把一条用户输入判成编排意图, 任一命中即返回。 */
export function parseCommand(rawText: string): ParsedCommand {
  const text = rawText.trim();

  const pipeline = PIPELINE_TRIGGER_PATTERN.exec(text);
  if (pipeline) return { kind: "pipeline", subject: (pipeline[1] ?? "").trim() };

  const plan = PLAN_TRIGGER_PATTERN.exec(text);
  if (plan) return { kind: "plan", subject: (plan[1] ?? "").trim() };

  const pr = PR_TRIGGER_PATTERN.exec(text);
  if (pr) return { kind: "pr", subject: (pr[1] ?? "").trim() };

  if (DOMAIN_TRIGGER_PATTERN.test(text)) {
    return { kind: "domain", subject: text.replace(DOMAIN_TRIGGER_PATTERN, "").trim() };
  }
  if (BUILD_TRIGGER_PATTERN.test(text)) {
    return { kind: "build", subject: text.replace(BUILD_TRIGGER_PATTERN, "").trim() };
  }

  return { kind: "chat", subject: text };
}

/** pipeline 的 key: 服务端要求唯一且非空, 中文主体退化成 `pipeline-<随机>`。 */
export function pipelineKeyFromName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const suffix = Math.random().toString(36).slice(2, 6);
  return (base ? `${base}-${suffix}` : `pipeline-${suffix}`).slice(0, 120);
}
