/**
 * Coolie fork — wave67 (DS 能力同步): 智能体人格模板文件清单.
 *
 * 同步自 DigitalStaff agent 人格模板 (SOUL.md / IDENTITY.md / USER.md /
 * AGENTS.md / TOOLS.md / HEARTBEAT.md / BOOTSTRAP.md). 模板正文翻译到中文并
 * 替换 'DigitalStaff' 字面, 加 'Coolie 智能体工坊' 上下文, 见
 * `templates/{SOUL,IDENTITY,USER,AGENTS,TOOLS,HEARTBEAT,BOOTSTRAP}.md`.
 *
 * 仿 DS 的 `CrushContextPaths.USER_CONTEXT_FILES` (constants/containerPath.js):
 * 一份单点真相描述智能体启动时要注入的 7 个上下文文件, server / CLI / 未来
 * UI 都从这里读, 不会在三个地方各写一遍漂移掉。
 *
 * 加新文件: 加一行 + 在 `templates/` 同步加 .md 文件. 删除同理. 不要为单个
 * caller 在本地复制一份列表 — 那正是 DS 这条规则要防的事。
 */
export const USER_CONTEXT_FILES = [
  "SOUL.md",          // 人格
  "IDENTITY.md",      // 身份
  "USER.md",          // 用户偏好
  "AGENTS.md",        // 工作区行为规范
  "TOOLS.md",         // 本地环境备注
  "HEARTBEAT.md",     // 心跳检查清单
  "BOOTSTRAP.md",     // 首次引导
] as const;

export type UserContextFile = (typeof USER_CONTEXT_FILES)[number];

/** Resolve one file to its `templates/`-relative path. */
export function getTemplatePath(file: UserContextFile): string {
  return `templates/${file}`;
}

/** All `templates/`-relative paths, in canonical order. */
export const USER_CONTEXT_TEMPLATE_PATHS: readonly string[] =
  USER_CONTEXT_FILES.map(getTemplatePath);