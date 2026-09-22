import type { Issue } from "@coolie/api-client";

/**
 * 收件箱「阻塞」视图的分组/排序 —— 移植自 Coolie Web `ui/src/lib/blockedInbox.ts`。
 *
 * Web 那份消费 `@paperclipai/shared` 的 `IssueBlockedInboxAttention`; App 端
 * api-client 的 `Issue` 是精简子集 (没有该字段的类型), 但 server 的 list 路由
 * **确实**在响应里带了 `blockedInboxAttention` (server/src/routes/issues.ts:
 * `...(issue.blockedInboxAttention !== undefined ? { blockedInboxAttention } : {})`),
 * 所以运行时读得到, 这里只补一个最小结构类型。
 */

export type BlockedReasonVariant =
  | "needs_decision"
  | "stalled"
  | "needs_attention"
  | "recovery_required"
  | "external_wait"
  | "owner_paused";

/** 阻塞注意力 —— server list 响应里携带的最小字段子集 */
export interface BlockedInboxAttention {
  reason: string;
  severity: string;
  stoppedSinceAt: string | null;
  owner?: { label: string | null } | null;
  action?: { label: string; detail: string | null } | null;
}

export type BlockedInboxGroupBy = "blocker_type" | "none";
export type BlockedInboxSort = "urgency" | "most_recent" | "longest_stopped";

export const BLOCKED_GROUP_OPTIONS: readonly [BlockedInboxGroupBy, string][] = [
  ["blocker_type", "按阻塞类型"],
  ["none", "不分组"],
];

export const BLOCKED_SORT_OPTIONS: readonly [BlockedInboxSort, string][] = [
  ["urgency", "最紧急"],
  ["most_recent", "最近"],
  ["longest_stopped", "停滞最久"],
];

const VARIANT_BY_REASON: Record<string, BlockedReasonVariant> = {
  pending_board_decision: "needs_decision",
  pending_user_decision: "needs_decision",
  missing_successful_run_disposition: "needs_decision",
  blocked_chain_stalled: "stalled",
  blocked_by_unassigned_issue: "needs_attention",
  blocked_by_assigned_backlog_issue: "needs_attention",
  blocked_by_cancelled_issue: "needs_attention",
  in_review_without_action_path: "needs_attention",
  invalid_review_participant: "needs_attention",
  open_recovery_issue: "recovery_required",
  external_owner_action: "external_wait",
  blocked_by_uninvokable_assignee: "owner_paused",
};

export const BLOCKED_REASON_VARIANT_ORDER: BlockedReasonVariant[] = [
  "needs_decision",
  "stalled",
  "needs_attention",
  "recovery_required",
  "external_wait",
  "owner_paused",
];

export const BLOCKED_VARIANT_LABELS: Record<BlockedReasonVariant, string> = {
  needs_decision: "待决策",
  stalled: "阻塞链停摆",
  needs_attention: "需关注",
  recovery_required: "需要恢复",
  external_wait: "等外部",
  owner_paused: "负责人停摆",
};

const REASON_LABELS: Record<string, string> = {
  pending_board_decision: "待老板决策",
  pending_user_decision: "待用户决策",
  missing_successful_run_disposition: "缺成功运行处置",
  blocked_chain_stalled: "阻塞链停摆",
  blocked_by_unassigned_issue: "阻塞项未指派",
  blocked_by_assigned_backlog_issue: "阻塞项搁置中",
  blocked_by_cancelled_issue: "阻塞项已取消",
  in_review_without_action_path: "评审无后续路径",
  invalid_review_participant: "评审人无效",
  open_recovery_issue: "恢复进行中",
  external_owner_action: "等外部负责人",
  blocked_by_uninvokable_assignee: "负责人不可唤醒",
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function blockedReasonVariant(reason: string): BlockedReasonVariant {
  return VARIANT_BY_REASON[reason] ?? "needs_attention";
}

export function blockedReasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? "已停摆";
}

function severityRank(severity: string): number {
  return SEVERITY_RANK[severity] ?? 9;
}

/** 从 issue 上读阻塞注意力 (字段不在类型里, 运行时才有) */
export function blockedAttentionOf(issue: Issue): BlockedInboxAttention | null {
  const raw = (issue as unknown as { blockedInboxAttention?: BlockedInboxAttention | null })
    .blockedInboxAttention;
  return raw && typeof raw === "object" ? raw : null;
}

export interface BlockedInboxRow {
  issue: Issue;
  attention: BlockedInboxAttention;
  variant: BlockedReasonVariant;
  reasonLabel: string;
  stoppedAtMs: number | null;
}

export interface BlockedInboxGroup {
  variant: BlockedReasonVariant;
  label: string;
  rows: BlockedInboxRow[];
}

function toMs(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function buildBlockedRows(issues: readonly Issue[]): BlockedInboxRow[] {
  const rows: BlockedInboxRow[] = [];
  for (const issue of issues) {
    const attention = blockedAttentionOf(issue);
    if (!attention) continue;
    rows.push({
      issue,
      attention,
      variant: blockedReasonVariant(attention.reason),
      reasonLabel: blockedReasonLabel(attention.reason),
      stoppedAtMs: toMs(attention.stoppedSinceAt),
    });
  }
  return rows;
}

function recencyMs(row: BlockedInboxRow): number {
  return row.stoppedAtMs ?? toMs(row.issue.updatedAt) ?? 0;
}

function byTitle(a: BlockedInboxRow, b: BlockedInboxRow): number {
  const diff = a.issue.title.localeCompare(b.issue.title);
  return diff !== 0 ? diff : a.issue.id.localeCompare(b.issue.id);
}

function byAttention(a: BlockedInboxRow, b: BlockedInboxRow): number {
  const sev = severityRank(a.attention.severity) - severityRank(b.attention.severity);
  if (sev !== 0) return sev;
  const aSince = a.stoppedAtMs ?? Number.POSITIVE_INFINITY;
  const bSince = b.stoppedAtMs ?? Number.POSITIVE_INFINITY;
  const diff = aSince - bSince;
  return Number.isFinite(diff) ? diff : 0;
}

export function sortBlockedRows(
  rows: readonly BlockedInboxRow[],
  sort: BlockedInboxSort = "urgency",
): BlockedInboxRow[] {
  return [...rows].sort((a, b) => {
    if (sort === "most_recent") {
      const recency = recencyMs(b) - recencyMs(a);
      if (recency !== 0) return recency;
      const attention = byAttention(a, b);
      return attention !== 0 ? attention : byTitle(a, b);
    }
    if (sort === "longest_stopped") {
      const aStopped = a.stoppedAtMs ?? Number.POSITIVE_INFINITY;
      const bStopped = b.stoppedAtMs ?? Number.POSITIVE_INFINITY;
      const stopped = aStopped - bStopped;
      if (stopped !== 0) return stopped;
      const sev = severityRank(a.attention.severity) - severityRank(b.attention.severity);
      return sev !== 0 ? sev : byTitle(a, b);
    }
    const attention = byAttention(a, b);
    if (attention !== 0) return attention;
    const recency = recencyMs(b) - recencyMs(a);
    return recency !== 0 ? recency : byTitle(a, b);
  });
}

export function groupBlockedRows(
  rows: readonly BlockedInboxRow[],
  sort: BlockedInboxSort = "urgency",
): BlockedInboxGroup[] {
  const buckets = new Map<BlockedReasonVariant, BlockedInboxRow[]>();
  for (const row of rows) {
    const list = buckets.get(row.variant) ?? [];
    list.push(row);
    buckets.set(row.variant, list);
  }
  const groups: BlockedInboxGroup[] = [];
  for (const variant of BLOCKED_REASON_VARIANT_ORDER) {
    const list = buckets.get(variant);
    if (!list || list.length === 0) continue;
    groups.push({ variant, label: BLOCKED_VARIANT_LABELS[variant], rows: sortBlockedRows(list, sort) });
  }
  return groups;
}

/** 停摆时长文案: 停摆 3 分钟 / 2 小时 / 5 天 */
export function formatStoppedAge(stoppedSinceAt: string | null, now: number = Date.now()): string {
  if (!stoppedSinceAt) return "已停摆";
  const then = new Date(stoppedSinceAt).getTime();
  if (!Number.isFinite(then)) return "已停摆";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "刚刚停摆";
  if (seconds < 3600) return `停摆 ${Math.floor(seconds / 60)} 分钟`;
  if (seconds < 86400) return `停摆 ${Math.floor(seconds / 3600)} 小时`;
  if (seconds < 86400 * 7) return `停摆 ${Math.floor(seconds / 86400)} 天`;
  return `停摆 ${Math.floor(seconds / (86400 * 7))} 周`;
}
