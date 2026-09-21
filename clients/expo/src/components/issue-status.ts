import type { IssuePriority, IssueStatus } from "@coolie/api-client";
import { C } from "../theme";

/**
 * 任务状态/优先级的展示单一来源 —— 任务列表、看板列、筛选项共用这一份,
 * 不各处再写一套 label/颜色映射 (旧任务页的 STATUS_LABEL 就漏了 todo/in_review)。
 *
 * 颜色沿用 Coolie Web 的状态色语义 (todo 琥珀 / in_progress 蓝 / in_review 紫 /
 * done 绿 / blocked 红), 但取 App 的 token, 不裸写 hex。
 */

export const ISSUE_STATUSES: IssueStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "blocked",
  "cancelled",
];

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  backlog: "待办池",
  todo: "待处理",
  in_progress: "进行中",
  in_review: "评审中",
  done: "已完成",
  blocked: "受阻",
  cancelled: "已取消",
};

export const ISSUE_STATUS_COLOR: Record<IssueStatus, string> = {
  backlog: C.ink3,
  todo: C.warn,
  in_progress: C.accent,
  in_review: C.violet,
  done: C.ok,
  blocked: C.err,
  cancelled: C.ink4,
};

export function issueStatusLabel(status: string): string {
  return ISSUE_STATUS_LABEL[status as IssueStatus] ?? status;
}

export function issueStatusColor(status: string): string {
  return ISSUE_STATUS_COLOR[status as IssueStatus] ?? C.ink3;
}

/** 看板/分组列的顺序: 从待办到已完成, 取消沉底。 */
export const ISSUE_STATUS_ORDER: IssueStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
  "cancelled",
];

export const ISSUE_PRIORITIES: IssuePriority[] = ["critical", "high", "medium", "low"];

export const PRIORITY_LABEL: Record<IssuePriority, string> = {
  critical: "紧急",
  high: "高",
  medium: "中",
  low: "低",
};

export const PRIORITY_COLOR: Record<IssuePriority, string> = {
  critical: C.err,
  high: C.warn,
  medium: C.ink3,
  low: C.ink4,
};

export function priorityLabel(priority: string): string {
  return PRIORITY_LABEL[priority as IssuePriority] ?? priority;
}
