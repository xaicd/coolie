import type { IssuePriority } from "@paperclipai/shared";

/**
 * 派单优先级裁决 (COOA-525)。
 *
 * 掌柜工坊直驱派单 (server/src/routes/board-chat.ts) 与后续的派单路径共用这一份
 * 词表裁决: 限时 (time-box) 探针升级为 `high`，其余常规派单走 `medium`。
 *
 * The return value MUST always be a member of `ISSUE_PRIORITIES`
 * ("critical" | "high" | "medium" | "low"). Before COOA-525 the board-chat path
 * returned the non-member literal `"normal"` — `issues.priority` is a text
 * column, so the insert succeeded and every priority label / colour / sort /
 * rollup silently fell back to a default.
 */
export function resolveDispatchIssuePriority(
  timeboxMinutes?: number | null,
): IssuePriority {
  return timeboxMinutes ? "high" : "medium";
}
