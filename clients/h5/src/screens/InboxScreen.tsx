/**
 * 收件箱 (InboxScreen, h5) —— Coolie工坊 App 收件箱的 Web 镜像。
 *
 * 与 expo 端 `clients/expo/src/screens/InboxScreen.tsx` 同一套信息架构, 与
 * Coolie Web `ui/src/pages/Inbox.tsx` 同源:
 * - 4 个 tab: 全部 / @我 / 审批 / 阻塞
 * - 过滤: 状态 / 优先级 / 负责人 / 项目 / 时间范围
 * - 富信息行: 状态圈 + 标题 + 描述 + 状态徽章 + 优先级 + 负责人 + 时间
 * - 阻塞视图: 分组 (阻塞类型) + 排序 (最紧急/最近/停滞最久) + reason
 * - 快捷动作: 打开 / 归档 / 派活 / 去工坊
 *
 * 归档打 Web 同款端点 `POST /issues/:id/inbox-archive` (per-user 收件箱状态)。
 * 公司取 `coolie.listCompanies()` 的第一家 (h5 暂无公司选择器, 与 TasksScreen 同)。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { Agent, Company, Issue, Project } from "@coolie/api-client";
import { coolie } from "../coolie";
import { C } from "../theme";

type InboxTab = "all" | "mine" | "approvals" | "blocked";
type DateRange = "all" | "today" | "7d" | "30d";

const UNASSIGNED = "__unassigned";
const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_LABEL: Record<string, string> = {
  backlog: "待办池",
  todo: "待处理",
  in_progress: "进行中",
  in_review: "评审中",
  blocked: "受阻",
  done: "已完成",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<string, string> = {
  backlog: C.ink3,
  todo: C.warn,
  in_progress: C.accent,
  in_review: C.violet,
  done: C.done,
  blocked: C.err,
  cancelled: C.ink4,
};

const PRIORITY_LABEL: Record<string, string> = {
  critical: "紧急",
  high: "高",
  medium: "中",
  low: "低",
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: C.err,
  high: C.warn,
  medium: C.ink3,
  low: C.ink4,
};

const STATUS_ORDER = ["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"];
const PRIORITY_ORDER = ["critical", "high", "medium", "low"];

const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "today", label: "今天" },
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
];

// ── 阻塞分组/排序 (移植 Coolie Web ui/src/lib/blockedInbox.ts 的语义) ──────────

type BlockedVariant =
  | "needs_decision"
  | "stalled"
  | "needs_attention"
  | "recovery_required"
  | "external_wait"
  | "owner_paused";

type BlockedSort = "urgency" | "most_recent" | "longest_stopped";
type BlockedGroupBy = "blocker_type" | "none";

interface BlockedAttention {
  reason: string;
  severity: string;
  stoppedSinceAt: string | null;
  action?: { label: string; detail: string | null } | null;
}

const VARIANT_BY_REASON: Record<string, BlockedVariant> = {
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

const VARIANT_ORDER: BlockedVariant[] = [
  "needs_decision",
  "stalled",
  "needs_attention",
  "recovery_required",
  "external_wait",
  "owner_paused",
];

const VARIANT_LABEL: Record<BlockedVariant, string> = {
  needs_decision: "待决策",
  stalled: "阻塞链停摆",
  needs_attention: "需关注",
  recovery_required: "需要恢复",
  external_wait: "等外部",
  owner_paused: "负责人停摆",
};

const REASON_LABEL: Record<string, string> = {
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

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const BLOCKED_GROUP_OPTIONS: readonly [BlockedGroupBy, string][] = [
  ["blocker_type", "按阻塞类型"],
  ["none", "不分组"],
];

const BLOCKED_SORT_OPTIONS: readonly [BlockedSort, string][] = [
  ["urgency", "最紧急"],
  ["most_recent", "最近"],
  ["longest_stopped", "停滞最久"],
];

interface BlockedRow {
  issue: Issue;
  attention: BlockedAttention;
  variant: BlockedVariant;
  reasonLabel: string;
  stoppedAtMs: number | null;
}

function attentionOf(issue: Issue): BlockedAttention | null {
  const raw = (issue as unknown as { blockedInboxAttention?: BlockedAttention | null })
    .blockedInboxAttention;
  return raw && typeof raw === "object" ? raw : null;
}

function severityRank(severity: string): number {
  return SEVERITY_RANK[severity] ?? 9;
}

function toMs(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value as string).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function buildBlockedRows(issues: readonly Issue[]): BlockedRow[] {
  const rows: BlockedRow[] = [];
  for (const issue of issues) {
    const attention = attentionOf(issue);
    if (!attention) continue;
    rows.push({
      issue,
      attention,
      variant: VARIANT_BY_REASON[attention.reason] ?? "needs_attention",
      reasonLabel: REASON_LABEL[attention.reason] ?? "已停摆",
      stoppedAtMs: toMs(attention.stoppedSinceAt),
    });
  }
  return rows;
}

function sortBlockedRows(rows: readonly BlockedRow[], sort: BlockedSort): BlockedRow[] {
  const byTitle = (a: BlockedRow, b: BlockedRow) => a.issue.title.localeCompare(b.issue.title);
  const byAttention = (a: BlockedRow, b: BlockedRow) => {
    const sev = severityRank(a.attention.severity) - severityRank(b.attention.severity);
    if (sev !== 0) return sev;
    const aSince = a.stoppedAtMs ?? Number.POSITIVE_INFINITY;
    const bSince = b.stoppedAtMs ?? Number.POSITIVE_INFINITY;
    const diff = aSince - bSince;
    return Number.isFinite(diff) ? diff : 0;
  };
  return [...rows].sort((a, b) => {
    if (sort === "most_recent") {
      const recency = (b.stoppedAtMs ?? 0) - (a.stoppedAtMs ?? 0);
      return recency !== 0 ? recency : byTitle(a, b);
    }
    if (sort === "longest_stopped") {
      const stopped = (a.stoppedAtMs ?? Number.POSITIVE_INFINITY) - (b.stoppedAtMs ?? Number.POSITIVE_INFINITY);
      return stopped !== 0 ? stopped : byTitle(a, b);
    }
    const attention = byAttention(a, b);
    if (attention !== 0) return attention;
    return byTitle(a, b);
  });
}

function groupBlockedRows(rows: readonly BlockedRow[], sort: BlockedSort) {
  const buckets = new Map<BlockedVariant, BlockedRow[]>();
  for (const row of rows) {
    const list = buckets.get(row.variant) ?? [];
    list.push(row);
    buckets.set(row.variant, list);
  }
  return VARIANT_ORDER.flatMap((variant) => {
    const list = buckets.get(variant);
    return list && list.length > 0
      ? [{ variant, label: VARIANT_LABEL[variant], rows: sortBlockedRows(list, sort) }]
      : [];
  });
}

function formatStoppedAge(stoppedSinceAt: string | null, now = Date.now()): string {
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

function severityColor(severity: string): string {
  if (severity === "critical") return C.err;
  if (severity === "high") return C.warn;
  if (severity === "medium") return C.ink3;
  return C.ink4;
}

// ── 展示辅助 ────────────────────────────────────────────────────────────────

function firstLine(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.split("\n").map((chunk) => chunk.trim()).find(Boolean) ?? null;
}

function relativeShort(input: string | Date | undefined | null): string {
  if (!input) return "";
  const ms = new Date(input as string).getTime();
  if (!Number.isFinite(ms)) return "";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function relativeLong(input: string | Date | undefined | null): string {
  if (!input) return "";
  const ms = new Date(input as string).getTime();
  if (!Number.isFinite(ms)) return "";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

function dateRangeCutoff(range: DateRange): number | null {
  const now = new Date();
  if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (range === "7d") return Date.now() - 7 * DAY_MS;
  if (range === "30d") return Date.now() - 30 * DAY_MS;
  return null;
}

interface InboxFilters {
  statuses: string[];
  priorities: string[];
  assignees: string[];
  projects: string[];
  dateRange: DateRange;
}

const DEFAULT_FILTERS: InboxFilters = {
  statuses: [],
  priorities: [],
  assignees: [],
  projects: [],
  dateRange: "all",
};

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function countActiveFilters(filters: InboxFilters): number {
  return (
    (filters.statuses.length ? 1 : 0) +
    (filters.priorities.length ? 1 : 0) +
    (filters.assignees.length ? 1 : 0) +
    (filters.projects.length ? 1 : 0) +
    (filters.dateRange !== "all" ? 1 : 0)
  );
}

export function InboxScreen({
  style,
  onOpenIssue,
  onOpenApproval,
  onOpenWorkshop,
}: {
  style?: CSSProperties;
  onOpenIssue?: (issue: Issue) => void;
  onOpenApproval?: (approvalId: string) => void;
  onOpenWorkshop?: () => void;
}) {
  const [company, setCompany] = useState<Company | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [mentions, setMentions] = useState<
    { id: string; issueId: string; issueTitle: string; body: string; authorName: string; createdAt: string }[]
  >([]);
  const [approvals, setApprovals] = useState<
    { id: string; title: string; type: string; createdAt: string }[]
  >([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<InboxTab>("all");
  const [filters, setFilters] = useState<InboxFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [blockedGroupBy, setBlockedGroupBy] = useState<BlockedGroupBy>("blocker_type");
  const [blockedSortBy, setBlockedSortBy] = useState<BlockedSort>("urgency");

  useEffect(() => {
    void (async () => {
      try {
        const companies = await coolie.listCompanies();
        if (companies.length === 0) {
          setError("这个实例上还没有公司，请先在后台创建。");
          setLoading(false);
          return;
        }
        setCompany(companies[0]);
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
        setLoading(false);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!company) return;
    setError(null);
    try {
      const [nextIssues, feed, nextAgents, nextProjects] = await Promise.all([
        coolie.listIssues(company.id, { limit: 200 }),
        coolie.getInbox(company.id),
        coolie.listAgents(company.id).catch(() => [] as Agent[]),
        coolie.listProjects(company.id).catch(() => [] as Project[]),
      ]);
      setIssues(nextIssues);
      setMentions(feed.mentionedBy);
      setApprovals(feed.pendingApprovals);
      setAgents(nextAgents);
      setProjects(nextProjects);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const agentName = useCallback(
    (id: string | null | undefined) => (id ? agents.find((a) => a.id === id)?.name ?? "员工" : null),
    [agents],
  );
  const projectName = useCallback(
    (id: string | null | undefined) => (id ? projects.find((p) => p.id === id)?.name ?? null : null),
    [projects],
  );

  const activeIssues = useMemo(
    () => issues.filter((issue) => !archivedIds.has(issue.id)),
    [issues, archivedIds],
  );

  const filteredIssues = useMemo(() => {
    let result = activeIssues;
    if (filters.statuses.length) result = result.filter((i) => filters.statuses.includes(i.status));
    if (filters.priorities.length) result = result.filter((i) => filters.priorities.includes(i.priority));
    if (filters.assignees.length) {
      result = result.filter((issue) =>
        filters.assignees.some((assignee) =>
          assignee === UNASSIGNED
            ? !issue.assigneeAgentId && !issue.assigneeUserId
            : issue.assigneeAgentId === assignee,
        ),
      );
    }
    if (filters.projects.length) {
      result = result.filter((i) => i.projectId != null && filters.projects.includes(i.projectId));
    }
    const cutoff = dateRangeCutoff(filters.dateRange);
    if (cutoff !== null) {
      result = result.filter((issue) => {
        const at = issue.updatedAt ?? issue.createdAt;
        if (!at) return false;
        const ms = new Date(at as string).getTime();
        return Number.isFinite(ms) && ms >= cutoff;
      });
    }
    return result;
  }, [activeIssues, filters]);

  const blockedRows = useMemo(() => buildBlockedRows(filteredIssues), [filteredIssues]);

  const archive = useCallback(async (issue: Issue) => {
    setArchivedIds((prev) => new Set(prev).add(issue.id));
    try {
      await coolie.archiveIssueFromInbox(issue.id);
      setToast(`已归档: ${issue.title}`);
    } catch (e) {
      setArchivedIds((prev) => {
        const next = new Set(prev);
        next.delete(issue.id);
        return next;
      });
      setToast(`归档失败: ${String((e as Error)?.message ?? e)}`);
    }
  }, []);

  const assign = useCallback(
    async (issue: Issue, assigneeAgentId: string | null) => {
      const previous = issue.assigneeAgentId ?? null;
      setIssues((prev) => prev.map((row) => (row.id === issue.id ? { ...row, assigneeAgentId } : row)));
      try {
        await coolie.setIssueAssignee(issue.id, assigneeAgentId);
        setToast(`已派活给 ${assigneeAgentId ? agentName(assigneeAgentId) : "未指派"}`);
      } catch (e) {
        setIssues((prev) =>
          prev.map((row) => (row.id === issue.id ? { ...row, assigneeAgentId: previous } : row)),
        );
        setToast(`派活失败: ${String((e as Error)?.message ?? e)}`);
      }
    },
    [agentName],
  );

  const openMention = useCallback(
    (item: { issueId: string; issueTitle: string }) => {
      const known = issues.find((issue) => issue.id === item.issueId);
      onOpenIssue?.(
        known ??
          ({ id: item.issueId, title: item.issueTitle, status: "todo", priority: "medium", companyId: company?.id ?? "" } as Issue),
      );
    },
    [issues, onOpenIssue, company],
  );

  const activeFilterCount = countActiveFilters(filters);

  const tabs: { key: InboxTab; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "mine", label: `@我 (${mentions.length})` },
    { key: "approvals", label: `审批 (${approvals.length})` },
    { key: "blocked", label: `阻塞 (${blockedRows.length})` },
  ];

  return (
    <div style={{ ...styles.screen, ...style }}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>收件箱</h1>
          <p style={styles.sub}>
            {company?.name ?? "…"} · 任务 {activeIssues.length} · 审批 {approvals.length} · @我{" "}
            {mentions.length}
          </p>
        </div>
      </header>

      <div style={styles.tabBar}>
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            style={{ ...styles.tabBtn, ...(tab === item.key ? styles.tabBtnActive : null) }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={styles.toolbar}>
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          style={{ ...styles.toolBtn, ...(activeFilterCount > 0 ? styles.toolBtnActive : null) }}
        >
          过滤{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
        {tab === "blocked" ? (
          <>
            <button
              type="button"
              onClick={() => setBlockedGroupBy(blockedGroupBy === "blocker_type" ? "none" : "blocker_type")}
              style={styles.toolBtn}
            >
              {BLOCKED_GROUP_OPTIONS.find(([key]) => key === blockedGroupBy)?.[1]}
            </button>
            <button
              type="button"
              onClick={() => {
                const index = BLOCKED_SORT_OPTIONS.findIndex(([key]) => key === blockedSortBy);
                setBlockedSortBy(BLOCKED_SORT_OPTIONS[(index + 1) % BLOCKED_SORT_OPTIONS.length][0]);
              }}
              style={styles.toolBtn}
            >
              {BLOCKED_SORT_OPTIONS.find(([key]) => key === blockedSortBy)?.[1]}
            </button>
          </>
        ) : null}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => void load()} style={styles.toolBtn}>
          刷新
        </button>
      </div>

      {filtersOpen ? (
        <div style={styles.filterPanel}>
          <FilterRow title="状态">
            {STATUS_ORDER.map((status) => (
              <Chip
                key={status}
                label={STATUS_LABEL[status]}
                active={filters.statuses.includes(status)}
                onClick={() => setFilters((prev) => ({ ...prev, statuses: toggle(prev.statuses, status) }))}
              />
            ))}
          </FilterRow>
          <FilterRow title="优先级">
            {PRIORITY_ORDER.map((priority) => (
              <Chip
                key={priority}
                label={PRIORITY_LABEL[priority]}
                active={filters.priorities.includes(priority)}
                onClick={() =>
                  setFilters((prev) => ({ ...prev, priorities: toggle(prev.priorities, priority) }))
                }
              />
            ))}
          </FilterRow>
          <FilterRow title="负责人">
            <Chip
              label="未指派"
              active={filters.assignees.includes(UNASSIGNED)}
              onClick={() => setFilters((prev) => ({ ...prev, assignees: toggle(prev.assignees, UNASSIGNED) }))}
            />
            {agents.map((agent) => (
              <Chip
                key={agent.id}
                label={agent.name}
                active={filters.assignees.includes(agent.id)}
                onClick={() =>
                  setFilters((prev) => ({ ...prev, assignees: toggle(prev.assignees, agent.id) }))
                }
              />
            ))}
          </FilterRow>
          {projects.length > 0 ? (
            <FilterRow title="项目">
              {projects.map((project) => (
                <Chip
                  key={project.id}
                  label={project.name}
                  active={filters.projects.includes(project.id)}
                  onClick={() =>
                    setFilters((prev) => ({ ...prev, projects: toggle(prev.projects, project.id) }))
                  }
                />
              ))}
            </FilterRow>
          ) : null}
          <FilterRow title="时间范围">
            {DATE_RANGES.map((range) => (
              <Chip
                key={range.key}
                label={range.label}
                active={filters.dateRange === range.key}
                onClick={() => setFilters((prev) => ({ ...prev, dateRange: range.key }))}
              />
            ))}
          </FilterRow>
          <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} style={styles.toolBtn}>
            重置
          </button>
        </div>
      ) : null}

      <div style={styles.listWrap}>
        {error ? <p style={styles.errorText}>{error}</p> : null}
        {loading ? <p style={styles.muted}>加载中…</p> : null}

        {!loading && tab === "all" ? (
          filteredIssues.length === 0 ? (
            <p style={styles.muted}>{activeFilterCount > 0 ? "没有匹配的任务。" : "收件箱已清空。"}</p>
          ) : (
            filteredIssues.map((issue) => (
              <IssueLine
                key={issue.id}
                issue={issue}
                assigneeName={agentName(issue.assigneeAgentId)}
                projectName={projectName(issue.projectId)}
                onOpen={() => onOpenIssue?.(issue)}
                onArchive={() => void archive(issue)}
                agents={agents}
                onAssign={(agentId) => void assign(issue, agentId)}
                onWorkshop={onOpenWorkshop}
              />
            ))
          )
        ) : null}

        {!loading && tab === "mine" ? (
          mentions.length === 0 ? (
            <p style={styles.muted}>没有 @你的消息。</p>
          ) : (
            mentions.map((item) => (
              <div key={item.id} style={styles.mentionCard}>
                <div style={styles.mentionHeader}>
                  <span style={styles.mentionAuthor}>{item.authorName}</span>
                  <span style={styles.metaTime}>{relativeLong(item.createdAt)}</span>
                </div>
                <div style={styles.rowTitle}>{item.issueTitle}</div>
                <div style={styles.rowDesc}>{item.body}</div>
                <button type="button" onClick={() => openMention(item)} style={styles.linkBtn}>
                  打开任务
                </button>
              </div>
            ))
          )
        ) : null}

        {!loading && tab === "approvals" ? (
          approvals.length === 0 ? (
            <p style={styles.muted}>没有待审批。</p>
          ) : (
            approvals.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenApproval?.(item.id)}
                style={styles.approvalRow}
              >
                <span style={{ ...styles.dot, backgroundColor: C.warn }} />
                <span style={{ flex: 1 }}>
                  <span style={styles.rowTitle}>{item.title}</span>
                  <span style={styles.metaText}>
                    {item.type} · {relativeLong(item.createdAt)}
                  </span>
                </span>
                <span style={styles.chevron}>›</span>
              </button>
            ))
          )
        ) : null}

        {!loading && tab === "blocked" ? (
          blockedRows.length === 0 ? (
            <p style={styles.muted}>没有阻塞任务。</p>
          ) : blockedGroupBy === "none" ? (
            <div>
              <div style={styles.sectionTitle}>阻塞任务 ({blockedRows.length})</div>
              {sortBlockedRows(blockedRows, blockedSortBy).map((row) => (
                <BlockedLine
                  key={row.issue.id}
                  row={row}
                  onOpen={() => onOpenIssue?.(row.issue)}
                  onArchive={() => void archive(row.issue)}
                />
              ))}
            </div>
          ) : (
            groupBlockedRows(blockedRows, blockedSortBy).map((group) => (
              <div key={group.variant}>
                <div style={styles.sectionTitle}>
                  {group.label} ({group.rows.length})
                </div>
                {group.rows.map((row) => (
                  <BlockedLine
                    key={row.issue.id}
                    row={row}
                    onOpen={() => onOpenIssue?.(row.issue)}
                    onArchive={() => void archive(row.issue)}
                  />
                ))}
              </div>
            ))
          )
        ) : null}
      </div>

      {toast ? <div style={styles.toast}>{toast}</div> : null}
    </div>
  );
}

function FilterRow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.filterRow}>
      <span style={styles.filterRowTitle}>{title}</span>
      <div style={styles.chipWrap}>{children}</div>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...styles.chip, ...(active ? styles.chipActive : null) }}
    >
      {label}
    </button>
  );
}

function StatusCircle({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? C.ink3;
  const done = status === "done";
  return (
    <span
      style={{
        ...styles.glyph,
        borderColor: status === "cancelled" ? C.ink4 : color,
        ...(done ? { backgroundColor: color } : null),
      }}
    >
      {done ? "✓" : ""}
    </span>
  );
}

function IssueLine({
  issue,
  assigneeName,
  projectName,
  onOpen,
  onArchive,
  agents,
  onAssign,
  onWorkshop,
}: {
  issue: Issue;
  assigneeName: string | null;
  projectName: string | null;
  onOpen: () => void;
  onArchive: () => void;
  agents: Agent[];
  onAssign: (agentId: string | null) => void;
  onWorkshop?: () => void;
}) {
  const description = firstLine(issue.description);
  return (
    <div style={styles.row}>
      <StatusCircle status={issue.status} />
      <div style={styles.rowBody} onClick={onOpen}>
        <div style={styles.rowTitle}>{issue.title}</div>
        {description ? <div style={styles.rowDesc}>{description}</div> : null}
        <div style={styles.metaRow}>
          <span style={{ ...styles.badge, borderColor: STATUS_COLOR[issue.status] ?? C.ink3 }}>
            {STATUS_LABEL[issue.status] ?? issue.status}
          </span>
          <span style={{ ...styles.badge, borderColor: PRIORITY_COLOR[issue.priority] ?? C.ink3 }}>
            {PRIORITY_LABEL[issue.priority] ?? issue.priority}
          </span>
          <span style={styles.metaText}>{assigneeName ?? "未指派"}</span>
          {projectName ? <span style={styles.metaText}>· {projectName}</span> : null}
          <span style={styles.metaTime}>{relativeShort(issue.updatedAt ?? issue.createdAt)}</span>
        </div>
      </div>
      <div style={styles.rowActions}>
        <select
          value={issue.assigneeAgentId ?? ""}
          onChange={(event) => onAssign(event.target.value || null)}
          style={styles.select}
          title="派活"
        >
          <option value="">未指派</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        {onWorkshop ? (
          <button type="button" onClick={onWorkshop} style={styles.linkBtn} title="去工坊">
            工坊
          </button>
        ) : null}
        <button type="button" onClick={onArchive} style={styles.archiveBtn} title="归档">
          归档
        </button>
      </div>
    </div>
  );
}

function BlockedLine({
  row,
  onOpen,
  onArchive,
}: {
  row: BlockedRow;
  onOpen: () => void;
  onArchive: () => void;
}) {
  return (
    <div style={styles.row}>
      <span style={{ ...styles.dot, backgroundColor: severityColor(row.attention.severity) }} />
      <div style={styles.rowBody} onClick={onOpen}>
        <div style={styles.rowTitle}>{row.issue.title}</div>
        <div style={styles.metaRow}>
          <span style={{ ...styles.badge, borderColor: severityColor(row.attention.severity) }}>
            {row.reasonLabel}
          </span>
          <span style={{ ...styles.badge, borderColor: STATUS_COLOR[row.issue.status] ?? C.ink3 }}>
            {STATUS_LABEL[row.issue.status] ?? row.issue.status}
          </span>
          <span style={styles.metaTime}>{formatStoppedAge(row.attention.stoppedSinceAt)}</span>
        </div>
        {row.attention.action?.label ? (
          <div style={styles.rowDesc}>
            待办: {row.attention.action.label}
            {row.attention.action.detail ? ` · ${row.attention.action.detail}` : ""}
          </div>
        ) : null}
      </div>
      <button type="button" onClick={onArchive} style={styles.archiveBtn} title="归档">
        归档
      </button>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: { display: "flex", flexDirection: "column", minHeight: 0, color: C.ink2, padding: "16px 20px" },
  header: { marginBottom: 12 },
  h1: { color: C.ink, fontSize: 22, fontWeight: 600, margin: "0 0 6px", letterSpacing: "-0.4px" },
  sub: { color: C.ink3, fontSize: 12, margin: 0 },
  tabBar: { display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" },
  tabBtn: {
    padding: "6px 12px",
    borderRadius: 8,
    border: `1px solid ${C.line}`,
    background: "rgba(255,255,255,0.02)",
    color: C.ink3,
    fontSize: 13,
    cursor: "pointer",
  },
  tabBtnActive: { borderColor: C.brand, background: "rgba(94,106,210,0.14)", color: C.ink },
  toolbar: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  toolBtn: {
    padding: "5px 10px",
    borderRadius: 8,
    border: `1px solid ${C.line}`,
    background: "rgba(255,255,255,0.02)",
    color: C.ink3,
    fontSize: 12,
    cursor: "pointer",
  },
  toolBtnActive: { borderColor: C.brand, color: C.ink },
  filterPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 12,
    marginBottom: 12,
    border: `1px solid ${C.line}`,
    borderRadius: 12,
    background: "rgba(255,255,255,0.02)",
  },
  filterRow: { display: "flex", alignItems: "flex-start", gap: 10 },
  filterRowTitle: { color: C.ink3, fontSize: 12, fontWeight: 600, width: 56, flex: "0 0 auto", paddingTop: 6 },
  chipWrap: { display: "flex", flexWrap: "wrap", gap: 6 },
  chip: {
    padding: "5px 11px",
    borderRadius: 999,
    border: `1px solid ${C.line}`,
    background: "rgba(255,255,255,0.02)",
    color: C.ink3,
    fontSize: 12,
    cursor: "pointer",
  },
  chipActive: { borderColor: C.brand, background: "rgba(94,106,210,0.18)", color: C.ink },
  listWrap: { display: "flex", flexDirection: "column", gap: 2 },
  sectionTitle: { color: C.ink3, fontSize: 13, fontWeight: 500, margin: "10px 0 4px" },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "11px 8px",
    borderRadius: 8,
  },
  rowBody: { flex: 1, display: "flex", flexDirection: "column", gap: 4, cursor: "pointer", minWidth: 0 },
  rowTitle: { color: C.ink, fontSize: 14, fontWeight: 500, lineHeight: "19px" },
  rowDesc: { color: C.ink3, fontSize: 12, lineHeight: "16px" },
  metaRow: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  metaText: { color: C.ink4, fontSize: 11 },
  metaTime: { color: C.ink4, fontSize: 11 },
  badge: { border: `1px solid ${C.line}`, borderRadius: 999, padding: "1px 8px", fontSize: 11, color: C.ink2 },
  glyph: {
    width: 16,
    height: 16,
    borderRadius: 999,
    border: "1.5px solid",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    color: C.bg,
    marginTop: 1,
    flex: "0 0 auto",
  },
  dot: { width: 8, height: 8, borderRadius: 999, marginTop: 6, flex: "0 0 auto" },
  rowActions: { display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" },
  select: {
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${C.line}`,
    borderRadius: 8,
    color: C.ink2,
    fontSize: 12,
    padding: "4px 6px",
  },
  linkBtn: {
    background: "transparent",
    border: `1px solid ${C.line}`,
    borderRadius: 8,
    color: C.ink3,
    fontSize: 12,
    padding: "4px 10px",
    cursor: "pointer",
  },
  archiveBtn: {
    background: "rgba(239,68,68,0.12)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 8,
    color: C.ink2,
    fontSize: 12,
    padding: "4px 10px",
    cursor: "pointer",
  },
  approvalRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "11px 8px",
    borderRadius: 8,
    border: "none",
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
    color: C.ink2,
  },
  mentionCard: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 12,
    marginBottom: 8,
    borderRadius: 12,
    background: C.surface,
  },
  mentionHeader: { display: "flex", justifyContent: "space-between" },
  mentionAuthor: { color: C.ok, fontSize: 12, fontWeight: 600 },
  chevron: { color: C.ink4, fontSize: 20 },
  muted: { color: C.ink3, fontSize: 13 },
  errorText: { color: C.err, fontSize: 13 },
  toast: {
    position: "fixed",
    left: 24,
    bottom: 24,
    background: C.surfaceHover,
    color: C.ink,
    fontSize: 13,
    padding: "10px 14px",
    borderRadius: 8,
  },
};
