import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  SectionList,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import type { Agent, Approval, Issue, Project } from "@coolie/api-client";
import {
  C,
  coolie,
  type InboxApprovalItem,
  type InboxFailedRunItem,
  type InboxFailureItem,
  type InboxJoinRequestItem,
  type InboxMentionItem,
} from "../coolie";
import { useNotificationsStore } from "../stores/notifications";
import { StatusDot } from "../components/StatusDot";
import { QuickApprovalCard } from "../components/QuickApprovalCard";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { Pill } from "../ui/Pill";
import { ELEVATION, RADIUS, SPACING } from "../ui/tokens";
import { formatRelativeShort, formatRelativeTime } from "../utils/format";
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  ISSUE_STATUS_LABEL,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  issueStatusColor,
} from "../components/issue-status";
import {
  BLOCKED_GROUP_OPTIONS,
  BLOCKED_SORT_OPTIONS,
  buildBlockedRows,
  formatStoppedAge,
  groupBlockedRows,
  sortBlockedRows,
  type BlockedInboxGroupBy,
  type BlockedInboxRow,
  type BlockedInboxSort,
} from "../lib/blockedInbox";

export type InboxTab = "all" | "mine" | "recent" | "unread" | "approvals" | "failed" | "blocked";
export type InboxCategory =
  | "everything"
  | "issues"
  | "approvals"
  | "failed_runs"
  | "alerts"
  | "join_requests";
export type InboxGroupBy = "none" | "status" | "assignee" | "project";
type DateRange = "all" | "today" | "7d" | "30d";

export type DateSectionTitle = "TODAY" | "YESTERDAY" | "EARLIER" | string;

export interface DateSection<T> {
  title: DateSectionTitle;
  data: T[];
}

export type MobileInboxWorkItem =
  | { kind: "issue"; id: string; issue: Issue; timestamp: number }
  | { kind: "approval"; id: string; approval: InboxApprovalItem; timestamp: number }
  | { kind: "failed_run"; id: string; run: InboxFailedRunItem | InboxFailureItem; timestamp: number }
  | { kind: "join_request"; id: string; joinRequest: InboxJoinRequestItem; timestamp: number }
  | { kind: "mention"; id: string; mention: InboxMentionItem; timestamp: number }
  | {
      kind: "alert";
      id: string;
      title: string;
      description: string;
      timestamp: number;
      tone?: "warn" | "err";
    };

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

const UNASSIGNED = "__unassigned";

const DATE_RANGE_OPTIONS: { key: DateRange; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "today", label: "今天" },
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
];

const TAB_OPTIONS: { key: InboxTab; label: string }[] = [
  { key: "mine", label: "与我" },
  { key: "unread", label: "未读" },
  { key: "recent", label: "最近" },
  { key: "blocked", label: "受阻" },
  { key: "all", label: "全部" },
];

const CATEGORY_OPTIONS: { key: InboxCategory; label: string }[] = [
  { key: "everything", label: "全部" },
  { key: "issues", label: "工单" },
  { key: "approvals", label: "审批" },
  { key: "failed_runs", label: "失败" },
  { key: "alerts", label: "警报" },
  { key: "join_requests", label: "加群" },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const MINE_RECENT_DAYS = 7;
const MINE_RECENT_MS = MINE_RECENT_DAYS * DAY_MS;
const INBOX_MINE_STATUS_FILTER = "backlog,todo,in_progress,in_review,blocked,done";

function firstLine(value: string | null | undefined): string | null {
  if (!value) return null;
  const line = value
    .split("\n")
    .map((chunk) => chunk.trim())
    .find(Boolean);
  return line ?? null;
}

function dateRangeCutoff(range: DateRange): number | null {
  const now = new Date();
  if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (range === "7d") return Date.now() - 7 * DAY_MS;
  if (range === "30d") return Date.now() - 30 * DAY_MS;
  return null;
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function countActiveFilters(filters: InboxFilters): number {
  let count = 0;
  if (filters.statuses.length) count += 1;
  if (filters.priorities.length) count += 1;
  if (filters.assignees.length) count += 1;
  if (filters.projects.length) count += 1;
  if (filters.dateRange !== "all") count += 1;
  return count;
}

function resolveDateCategory(
  value: Date | string | number | null | undefined,
  now = new Date(),
): "TODAY" | "YESTERDAY" | "EARLIER" {
  if (!value) return "EARLIER";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "EARLIER";

  const localNowOrdinal = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const localDateOrdinal = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((localNowOrdinal - localDateOrdinal) / (24 * 60 * 60 * 1000));

  if (dayDiff <= 0) return "TODAY";
  if (dayDiff === 1) return "YESTERDAY";
  return "EARLIER";
}

function buildDateSections<T>(
  items: T[],
  getTimestamp: (item: T) => Date | string | number | null | undefined,
): DateSection<T>[] {
  const todayItems: T[] = [];
  const yesterdayItems: T[] = [];
  const earlierItems: T[] = [];
  const now = new Date();

  for (const item of items) {
    const category = resolveDateCategory(getTimestamp(item), now);
    if (category === "TODAY") todayItems.push(item);
    else if (category === "YESTERDAY") yesterdayItems.push(item);
    else earlierItems.push(item);
  }

  const sections: DateSection<T>[] = [];
  if (todayItems.length > 0) sections.push({ title: "TODAY", data: todayItems });
  if (yesterdayItems.length > 0) sections.push({ title: "YESTERDAY", data: yesterdayItems });
  if (earlierItems.length > 0) sections.push({ title: "EARLIER", data: earlierItems });
  return sections;
}

/**
 * P1-4: 远端搜索补全逻辑 (对齐 Web getInboxSearchSupplementIssues 规范)
 */
export function getInboxSearchSupplementIssues({
  query,
  remoteIssues,
  visibleIssueIds,
}: {
  query: string;
  remoteIssues: Issue[];
  visibleIssueIds: ReadonlySet<string>;
}): Issue[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return remoteIssues.filter((issue) => !visibleIssueIds.has(issue.id));
}

/**
 * P1-8: 多维分组纯函数算法 (支持 无 / 状态 / 负责人 / 项目)
 */
export function buildGroupedSections(
  items: MobileInboxWorkItem[],
  groupBy: InboxGroupBy,
  agentNameById: Map<string, string>,
  projectNameById: Map<string, string>,
): DateSection<MobileInboxWorkItem>[] {
  if (groupBy === "none") {
    return buildDateSections(items, (item) => item.timestamp);
  }

  if (groupBy === "status") {
    const map = new Map<string, MobileInboxWorkItem[]>();
    for (const item of items) {
      let label = "其他";
      if (item.kind === "issue") {
        label = ISSUE_STATUS_LABEL[item.issue.status] ?? item.issue.status;
      } else if (item.kind === "approval") {
        label = "待办审批";
      } else if (item.kind === "failed_run") {
        label = "异常运行";
      } else if (item.kind === "join_request") {
        label = "加群申请";
      } else if (item.kind === "alert") {
        label = "系统警报";
      } else if (item.kind === "mention") {
        label = "评论提及";
      }
      const list = map.get(label) ?? [];
      list.push(item);
      map.set(label, list);
    }
    const sections: DateSection<MobileInboxWorkItem>[] = [];
    for (const [title, data] of map.entries()) {
      sections.push({ title, data });
    }
    return sections;
  }

  if (groupBy === "assignee") {
    const map = new Map<string, MobileInboxWorkItem[]>();
    for (const item of items) {
      let label = "未指派";
      if (item.kind === "issue") {
        if (item.issue.assigneeAgentId) {
          label = agentNameById.get(item.issue.assigneeAgentId) ?? "员工";
        } else if (item.issue.assigneeUserId) {
          label = "负责人";
        }
      } else if (item.kind === "failed_run") {
        label = ("agentName" in item.run && item.run.agentName ? item.run.agentName : null) ?? "智能体";
      }
      const list = map.get(label) ?? [];
      list.push(item);
      map.set(label, list);
    }
    const sections: DateSection<MobileInboxWorkItem>[] = [];
    for (const [title, data] of map.entries()) {
      sections.push({ title, data });
    }
    return sections;
  }

  if (groupBy === "project") {
    const map = new Map<string, MobileInboxWorkItem[]>();
    for (const item of items) {
      let label = "无所属项目";
      if (item.kind === "issue" && item.issue.projectId) {
        label = projectNameById.get(item.issue.projectId) ?? "项目";
      }
      const list = map.get(label) ?? [];
      list.push(item);
      map.set(label, list);
    }
    const sections: DateSection<MobileInboxWorkItem>[] = [];
    for (const [title, data] of map.entries()) {
      sections.push({ title, data });
    }
    return sections;
  }

  return buildDateSections(items, (item) => item.timestamp);
}

/**
 * 收件箱 —— Coolie Web Inbox (`ui/src/pages/Inbox.tsx`) 原生移动端全量对齐版。
 * wave372 (P0 9 件) + wave373 (P1 8 件):
 * - P1-1: Unread Tab (看 server 返 isUnreadForMe)
 * - P1-2: Recent Tab (最近 7 天触碰)
 * - P1-3: All 全盘 + 跨实体分类筛选 (everything/issues/approvals/failed_runs/alerts/join_requests)
 * - P1-4: 远端搜索补全 (getInboxSearchSupplementIssues)
 * - P1-5: 行内审批签发 (审批卡片外露 Approve/Reject 两字按钮)
 * - P1-6: 失败运行就地重试 (FailedRunCard 加「重试」两字按钮)
 * - P1-7: 加群申请裁决 (JoinRequestCard 加 Approve/Reject 按钮)
 * - P1-8: 多维分组 (group-by none/status/assignee/project 可切)
 */
export function InboxScreen({
  company,
  initialTab = "all",
  onOpenIssue,
  onOpenApproval,
  onOpenSettings,
  onOpenWorkshop,
  onBack,
  onResolved,
}: {
  company: { id: string; name: string };
  initialTab?: InboxTab;
  onOpenIssue: (issue: Issue) => void;
  onOpenApproval: (approvalId: string) => void;
  onOpenSettings?: () => void;
  onOpenWorkshop?: () => void;
  onBack?: () => void;
  /** 内嵌 QuickApprovalCard 裁决完成后的回调 (审批/驳回后从列表移除) */
  onResolved?: (approvalId: string, decision: "approve" | "reject") => void;
}) {
  const [tab, setTab] = useState<InboxTab>(initialTab ?? "mine");
  const [allCategoryFilter, setAllCategoryFilter] = useState<InboxCategory>("everything");
  const [groupBy, setGroupBy] = useState<InboxGroupBy>("none");
  const [expandedApprovalId, setExpandedApprovalId] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) {
      setTab(initialTab);
    }
  }, [initialTab]);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [mineIssues, setMineIssues] = useState<Issue[]>([]);
  const [mentions, setMentions] = useState<InboxMentionItem[]>([]);
  const [approvals, setApprovals] = useState<InboxApprovalItem[]>([]);
  const [failures, setFailures] = useState<(InboxFailedRunItem | InboxFailureItem)[]>([]);
  const [joinRequests, setJoinRequests] = useState<InboxJoinRequestItem[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => new Set());
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [unreadIds, setUnreadIds] = useState<Set<string>>(() => new Set());

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // P0-5 & P1-4: 即时搜索框与 300ms debounce
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim().toLowerCase());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // P1-4: 远端搜索补全结果
  const [remoteSearchResults, setRemoteSearchResults] = useState<Issue[]>([]);
  useEffect(() => {
    if (!debouncedQuery) {
      setRemoteSearchResults([]);
      return;
    }
    let cancelled = false;
    coolie
      .listIssues(company.id, { q: debouncedQuery, limit: 25 })
      .then((rows) => {
        if (!cancelled) setRemoteSearchResults(rows);
      })
      .catch(() => {
        if (!cancelled) setRemoteSearchResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [company.id, debouncedQuery]);

  // P0-6: 5秒归档撤销窗口
  const [undoState, setUndoState] = useState<{
    issue: Issue;
    timerId: NodeJS.Timeout;
  } | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  // P0-4: 全部标已读确认对话框
  const [markAllConfirmOpen, setMarkAllConfirmOpen] = useState(false);

  const [filters, setFilters] = useState<InboxFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [blockedGroupBy, setBlockedGroupBy] = useState<BlockedInboxGroupBy>("blocker_type");
  const [blockedSortBy, setBlockedSortBy] = useState<BlockedInboxSort>("urgency");
  const [actionIssue, setActionIssue] = useState<Issue | null>(null);
  const [assignIssue, setAssignIssue] = useState<Issue | null>(null);
  const [retryingRunId, setRetryingRunId] = useState<string | null>(null);

  const loadReqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (silent = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const reqId = loadReqIdRef.current + 1;
      loadReqIdRef.current = reqId;
      if (!silent) setLoading(true);
      setError(null);
      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (controller.signal.aborted) return;
        try {
          const [nextIssues, mineResp, feed, nextAgents, nextProjects, nextJoinRequests] =
            await Promise.all([
              coolie.listIssues(company.id, { limit: 200 }),
              coolie
                .listIssues(company.id, {
                  touchedByUserId: "me",
                  inboxArchivedByUserId: "me",
                  status: INBOX_MINE_STATUS_FILTER,
                  limit: 200,
                })
                .catch(() => [] as Issue[]),
              coolie.getInbox(company.id).catch(() => ({
                pendingApprovals: [],
                failures: [],
                mentionedBy: [],
                joinRequests: [],
                failedRuns: [],
              })),
              coolie.listAgents(company.id).catch(() => [] as Agent[]),
              coolie.listProjects(company.id).catch(() => [] as Project[]),
              coolie
                .listJoinRequests(company.id, "pending_approval")
                .catch(() => [] as InboxJoinRequestItem[]),
            ]);
          if (controller.signal.aborted) return;
          if (loadReqIdRef.current !== reqId) return;

          const unreadIdSet = new Set<string>();
          for (const issue of mineResp) {
            if (issue.isUnreadForMe) unreadIdSet.add(issue.id);
          }
          const mergedNextIssues =
            unreadIdSet.size > 0
              ? nextIssues.map((i) => (unreadIdSet.has(i.id) ? { ...i, isUnreadForMe: true } : i))
              : nextIssues;

          setIssues(mergedNextIssues);
          setMineIssues(mineResp.length > 0 ? mineResp : mergedNextIssues);
          setMentions(feed.mentionedBy ?? []);
          setApprovals(feed.pendingApprovals ?? []);
          setFailures(
            feed.failedRuns?.length
              ? feed.failedRuns
              : (feed.failures as unknown as InboxFailureItem[]) ?? [],
          );
          setJoinRequests(feed.joinRequests?.length ? feed.joinRequests : nextJoinRequests);
          setAgents(nextAgents);
          setProjects(nextProjects);
          setError(null);
          break;
        } catch (e) {
          if (controller.signal.aborted || loadReqIdRef.current !== reqId) return;
          const msg = String((e as Error)?.message ?? e);
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
            continue;
          }
          setError(msg);
        }
      }
      if (loadReqIdRef.current === reqId && !controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [company.id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void load(true);
    });
    const interval = setInterval(() => {
      void load(true);
    }, 5 * 60 * 1000);
    return () => {
      sub.remove();
      clearInterval(interval);
      abortRef.current?.abort();
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of agents) map.set(agent.id, agent.name);
    return map;
  }, [agents]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) map.set(project.id, project.name);
    return map;
  }, [projects]);

  const issueById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of issues) map.set(issue.id, issue);
    for (const issue of mineIssues) map.set(issue.id, issue);
    return map;
  }, [issues, mineIssues]);

  const activeIssues = useMemo(
    () => issues.filter((issue) => !archivedIds.has(issue.id)),
    [issues, archivedIds],
  );

  // P0-2: 未读状态判定
  const getIsUnread = useCallback(
    (issue: Issue): boolean => {
      if (readIds.has(issue.id)) return false;
      if (unreadIds.has(issue.id)) return true;
      return Boolean(issue.isUnreadForMe);
    },
    [readIds, unreadIds],
  );

  // P0-3: 单条切换已读/未读
  const toggleRead = useCallback(
    async (issue: Issue) => {
      const currentlyUnread = getIsUnread(issue);
      if (currentlyUnread) {
        setReadIds((prev) => new Set(prev).add(issue.id));
        setUnreadIds((prev) => {
          const next = new Set(prev);
          next.delete(issue.id);
          return next;
        });
        try {
          await coolie.markIssueRead(issue.id);
        } catch {
          // 乐观更新失败不阻断
        }
      } else {
        setUnreadIds((prev) => new Set(prev).add(issue.id));
        setReadIds((prev) => {
          const next = new Set(prev);
          next.delete(issue.id);
          return next;
        });
        try {
          await coolie.markIssueUnread(issue.id);
        } catch {
          // 乐观更新失败不阻断
        }
      }
    },
    [getIsUnread],
  );

  // 全部 Tab 的工单过滤 (支持 filters 与搜索)
  const filteredIssues = useMemo(() => {
    let result = activeIssues;
    if (filters.statuses.length) result = result.filter((i) => filters.statuses.includes(i.status));
    if (filters.priorities.length) result = result.filter((i) => filters.priorities.includes(i.priority));
    if (filters.assignees.length) {
      result = result.filter((issue) =>
        filters.assignees.some((assignee) => {
          if (assignee === UNASSIGNED) return !issue.assigneeAgentId && !issue.assigneeUserId;
          if (assignee === "__me") return false;
          return issue.assigneeAgentId === assignee;
        }),
      );
    }
    if (filters.projects.length) {
      result = result.filter((issue) => issue.projectId != null && filters.projects.includes(issue.projectId));
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
    if (debouncedQuery) {
      result = result.filter((issue) => {
        if (issue.title.toLowerCase().includes(debouncedQuery)) return true;
        if (issue.identifier?.toLowerCase().includes(debouncedQuery)) return true;
        if (issue.description?.toLowerCase().includes(debouncedQuery)) return true;
        if (
          issue.assigneeAgentId &&
          agentNameById.get(issue.assigneeAgentId)?.toLowerCase().includes(debouncedQuery)
        )
          return true;
        if (
          issue.projectId &&
          projectNameById.get(issue.projectId)?.toLowerCase().includes(debouncedQuery)
        )
          return true;
        return false;
      });
    }
    return result;
  }, [activeIssues, filters, debouncedQuery, agentNameById, projectNameById]);

  // P1-5: 行内审批签发
  const handleApproveApproval = useCallback(
    async (approvalId: string, title?: string) => {
      setApprovals((prev) => prev.filter((a) => a.id !== approvalId));
      setToast(`已批准: ${title || "审批单"}`);
      try {
        await coolie.approveApproval(approvalId);
        onResolved?.(approvalId, "approve");
      } catch (e) {
        setToast(`批准失败: ${String((e as Error)?.message ?? e)}`);
        void load(true);
      }
    },
    [onResolved, load],
  );

  const handleRejectApproval = useCallback(
    async (approvalId: string, title?: string) => {
      setApprovals((prev) => prev.filter((a) => a.id !== approvalId));
      setToast(`已驳回: ${title || "审批单"}`);
      try {
        await coolie.rejectApproval(approvalId);
        onResolved?.(approvalId, "reject");
      } catch (e) {
        setToast(`驳回失败: ${String((e as Error)?.message ?? e)}`);
        void load(true);
      }
    },
    [onResolved, load],
  );

  // P1-6: 失败运行就地重试
  const handleRetryRun = useCallback(
    async (run: InboxFailedRunItem | InboxFailureItem) => {
      const agentId = "agentId" in run ? run.agentId : null;
      if (!agentId) {
        setToast("无法重试: 缺少 Agent 信息");
        return;
      }
      setRetryingRunId(run.id);
      try {
        await coolie.retryFailedRun(agentId, run.id, company.id);
        const name = "agentName" in run && run.agentName ? run.agentName : "智能体";
        setToast(`已触发重试: ${name}`);
        setTimeout(() => {
          void load(true);
        }, 1200);
      } catch (e) {
        setToast(`重试失败: ${String((e as Error)?.message ?? e)}`);
      } finally {
        setRetryingRunId(null);
      }
    },
    [company.id, load],
  );

  // P1-7: 加群申请裁决
  const handleApproveJoinRequest = useCallback(
    async (requestId: string) => {
      setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
      setToast("已批准加群申请");
      try {
        await coolie.approveJoinRequest(company.id, requestId);
      } catch (e) {
        setToast(`批准失败: ${String((e as Error)?.message ?? e)}`);
        void load(true);
      }
    },
    [company.id, load],
  );

  const handleRejectJoinRequest = useCallback(
    async (requestId: string) => {
      setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
      setToast("已拒绝加群申请");
      try {
        await coolie.rejectJoinRequest(company.id, requestId);
      } catch (e) {
        setToast(`拒绝失败: ${String((e as Error)?.message ?? e)}`);
        void load(true);
      }
    },
    [company.id, load],
  );

  // P0-1: Mine Tab 聚合工作项
  const mineWorkItems = useMemo((): MobileInboxWorkItem[] => {
    const items: MobileInboxWorkItem[] = [];
    const now = Date.now();

    // 1. 工单流: 7 天 mineRecentDays 过滤 (未读工单强制保留)
    const validMineIssues = mineIssues.filter((issue) => {
      if (archivedIds.has(issue.id)) return false;
      if (filters.statuses.length && !filters.statuses.includes(issue.status)) return false;
      if (filters.priorities.length && !filters.priorities.includes(issue.priority)) return false;
      if (filters.projects.length && (!issue.projectId || !filters.projects.includes(issue.projectId)))
        return false;

      const at = issue.lastActivityAt ?? issue.updatedAt ?? issue.createdAt;
      const ms = at ? new Date(at as string).getTime() : 0;
      const isUnread = getIsUnread(issue);
      if (isUnread) return true;
      return Number.isFinite(ms) && now - ms <= MINE_RECENT_MS;
    });

    for (const issue of validMineIssues) {
      const ts = new Date(issue.lastActivityAt ?? issue.updatedAt ?? issue.createdAt ?? 0).getTime();
      items.push({ kind: "issue", id: issue.id, issue, timestamp: Number.isFinite(ts) ? ts : 0 });
    }

    // 2. 待办审批
    for (const approval of approvals) {
      const ts = new Date(approval.createdAt).getTime();
      items.push({ kind: "approval", id: approval.id, approval, timestamp: Number.isFinite(ts) ? ts : 0 });
    }

    // 3. 失败/阻塞 Run 流
    for (const failure of failures) {
      const ts = new Date(failure.updatedAt).getTime();
      items.push({ kind: "failed_run", id: failure.id, run: failure, timestamp: Number.isFinite(ts) ? ts : 0 });
    }

    // 4. @我 提及流
    for (const mention of mentions) {
      const ts = new Date(mention.createdAt).getTime();
      items.push({ kind: "mention", id: mention.id, mention, timestamp: Number.isFinite(ts) ? ts : 0 });
    }

    // 5. 加群申请
    for (const jr of joinRequests) {
      const ts = new Date(jr.createdAt).getTime();
      items.push({ kind: "join_request", id: jr.id, joinRequest: jr, timestamp: Number.isFinite(ts) ? ts : 0 });
    }

    // 搜索过滤
    let filtered = items;
    if (debouncedQuery) {
      filtered = filtered.filter((item) => {
        if (item.kind === "issue") {
          return (
            item.issue.title.toLowerCase().includes(debouncedQuery) ||
            Boolean(item.issue.identifier?.toLowerCase().includes(debouncedQuery)) ||
            Boolean(item.issue.description?.toLowerCase().includes(debouncedQuery))
          );
        }
        if (item.kind === "approval") {
          return (
            item.approval.title.toLowerCase().includes(debouncedQuery) ||
            item.approval.type.toLowerCase().includes(debouncedQuery)
          );
        }
        if (item.kind === "failed_run") {
          const runTitle = "title" in item.run ? item.run.title : item.run.id;
          return (
            runTitle.toLowerCase().includes(debouncedQuery) ||
            item.run.status.toLowerCase().includes(debouncedQuery)
          );
        }
        if (item.kind === "join_request") {
          return (
            (item.joinRequest.agentName?.toLowerCase().includes(debouncedQuery) ?? false) ||
            (item.joinRequest.requestEmailSnapshot?.toLowerCase().includes(debouncedQuery) ?? false) ||
            item.joinRequest.requestType.toLowerCase().includes(debouncedQuery)
          );
        }
        if (item.kind === "mention") {
          return (
            item.mention.body.toLowerCase().includes(debouncedQuery) ||
            item.mention.issueTitle.toLowerCase().includes(debouncedQuery) ||
            item.mention.authorName.toLowerCase().includes(debouncedQuery)
          );
        }
        return false;
      });
    }

    filtered.sort((a, b) => b.timestamp - a.timestamp);
    return filtered;
  }, [mineIssues, archivedIds, filters, approvals, failures, mentions, joinRequests, debouncedQuery, getIsUnread]);

  // P1-2: Recent Tab (最近 7 天触碰)
  const recentWorkItems = useMemo((): MobileInboxWorkItem[] => {
    const items: MobileInboxWorkItem[] = [];
    const now = Date.now();

    for (const issue of activeIssues) {
      const at = issue.lastActivityAt ?? issue.updatedAt ?? issue.createdAt;
      const ms = at ? new Date(at as string).getTime() : 0;
      if (Number.isFinite(ms) && now - ms <= MINE_RECENT_MS) {
        items.push({ kind: "issue", id: issue.id, issue, timestamp: ms });
      }
    }

    for (const approval of approvals) {
      const ms = new Date(approval.createdAt).getTime();
      if (Number.isFinite(ms) && now - ms <= MINE_RECENT_MS) {
        items.push({ kind: "approval", id: approval.id, approval, timestamp: ms });
      }
    }

    for (const failure of failures) {
      const ms = new Date(failure.updatedAt).getTime();
      if (Number.isFinite(ms) && now - ms <= MINE_RECENT_MS) {
        items.push({ kind: "failed_run", id: failure.id, run: failure, timestamp: ms });
      }
    }

    for (const jr of joinRequests) {
      const ms = new Date(jr.createdAt).getTime();
      if (Number.isFinite(ms) && now - ms <= MINE_RECENT_MS) {
        items.push({ kind: "join_request", id: jr.id, joinRequest: jr, timestamp: ms });
      }
    }

    if (debouncedQuery) {
      return items.filter((item) => {
        if (item.kind === "issue") return item.issue.title.toLowerCase().includes(debouncedQuery);
        if (item.kind === "approval") return item.approval.title.toLowerCase().includes(debouncedQuery);
        return true;
      });
    }

    items.sort((a, b) => b.timestamp - a.timestamp);
    return items;
  }, [activeIssues, approvals, failures, joinRequests, debouncedQuery]);

  // 通知源与顶栏铃铛同源 (useNotificationsStore), 用于让「未读」Tab 与铃铛数字恒等。
  const notifItems = useNotificationsStore((s) => s.items);

  // P1-1: Unread Tab —— 与顶栏铃铛同一通知口径 (buildFeed)。
  // 铃铛 unreadCount = 通知未读条数; 本 Tab 直接按同一份通知逐条渲染, 保证
  // 「铃铛 N = 收件箱未读 N」, 消灭「铃铛 7 / 进去 0」的数据不一致。
  const unreadWorkItems = useMemo((): MobileInboxWorkItem[] => {
    const items: MobileInboxWorkItem[] = [];
    for (const n of notifItems) {
      if (n.read) continue;
      const ts = new Date(n.createdAt).getTime();
      const rawId = n.id.includes(":") ? n.id.split(":").pop()! : n.id;

      if (n.target?.kind === "approval") {
        const approval =
          approvals.find((a) => a.id === n.target!.id) ??
          ({
            id: n.target.id,
            title: n.title,
            type: n.body ?? "approval",
            status: "pending",
            createdAt: n.createdAt,
          } as InboxApprovalItem);
        items.push({ kind: "approval", id: approval.id, approval, timestamp: Number.isFinite(ts) ? ts : 0 });
        continue;
      }

      if (n.type === "failure") {
        const run = failures.find((f) => f.id === rawId);
        if (run) {
          items.push({ kind: "failed_run", id: run.id, run, timestamp: Number.isFinite(ts) ? ts : 0 });
          continue;
        }
        const issue = issueById.get(rawId);
        if (issue) {
          items.push({ kind: "issue", id: issue.id, issue, timestamp: Number.isFinite(ts) ? ts : 0 });
          continue;
        }
        items.push({ kind: "alert", id: n.id, title: n.title, description: n.body ?? "", timestamp: Number.isFinite(ts) ? ts : 0, tone: "err" });
        continue;
      }

      if (n.type === "mention") {
        const mention = mentions.find((m) => m.id === rawId);
        if (mention) {
          items.push({ kind: "mention", id: `mention:${mention.id}`, mention, timestamp: Number.isFinite(ts) ? ts : 0 });
          continue;
        }
      }

      const targetIssueId = n.target?.kind === "issue" ? n.target.id : null;
      const issue = targetIssueId ? issueById.get(targetIssueId) : undefined;
      if (issue) {
        items.push({ kind: "issue", id: issue.id, issue, timestamp: Number.isFinite(ts) ? ts : 0 });
        continue;
      }
      items.push({ kind: "alert", id: n.id, title: n.title, description: n.body ?? "", timestamp: Number.isFinite(ts) ? ts : 0, tone: "warn" });
    }

    const filtered = debouncedQuery
      ? items.filter((item) => {
          if (item.kind === "issue") return item.issue.title.toLowerCase().includes(debouncedQuery);
          if (item.kind === "approval") return item.approval.title.toLowerCase().includes(debouncedQuery);
          if (item.kind === "mention") return item.mention.body.toLowerCase().includes(debouncedQuery);
          if (item.kind === "alert") return item.title.toLowerCase().includes(debouncedQuery);
          return true;
        })
      : items;

    filtered.sort((a, b) => b.timestamp - a.timestamp);
    return filtered;
  }, [notifItems, approvals, failures, mentions, issueById, debouncedQuery]);

  // P1-3: All 全盘跨实体聚合工作项 (根据 allCategoryFilter 过滤)
  const allTabWorkItems = useMemo((): MobileInboxWorkItem[] => {
    const items: MobileInboxWorkItem[] = [];

    const showIssues = allCategoryFilter === "everything" || allCategoryFilter === "issues";
    const showApprovals = allCategoryFilter === "everything" || allCategoryFilter === "approvals";
    const showFailures = allCategoryFilter === "everything" || allCategoryFilter === "failed_runs";
    const showJoinRequests = allCategoryFilter === "everything" || allCategoryFilter === "join_requests";
    const showMentions = allCategoryFilter === "everything";
    const showAlerts = allCategoryFilter === "everything" || allCategoryFilter === "alerts";

    if (showIssues) {
      for (const issue of filteredIssues) {
        const ts = new Date(issue.lastActivityAt ?? issue.updatedAt ?? issue.createdAt ?? 0).getTime();
        items.push({ kind: "issue", id: issue.id, issue, timestamp: Number.isFinite(ts) ? ts : 0 });
      }
    }

    if (showApprovals) {
      for (const approval of approvals) {
        const ts = new Date(approval.createdAt).getTime();
        items.push({ kind: "approval", id: approval.id, approval, timestamp: Number.isFinite(ts) ? ts : 0 });
      }
    }

    if (showFailures) {
      for (const failure of failures) {
        const ts = new Date(failure.updatedAt).getTime();
        items.push({ kind: "failed_run", id: failure.id, run: failure, timestamp: Number.isFinite(ts) ? ts : 0 });
      }
    }

    if (showJoinRequests) {
      for (const jr of joinRequests) {
        const ts = new Date(jr.createdAt).getTime();
        items.push({ kind: "join_request", id: jr.id, joinRequest: jr, timestamp: Number.isFinite(ts) ? ts : 0 });
      }
    }

    if (showMentions) {
      for (const mention of mentions) {
        const ts = new Date(mention.createdAt).getTime();
        items.push({
          kind: "mention",
          id: `mention:${mention.id}`,
          mention,
          timestamp: Number.isFinite(ts) ? ts : 0,
        });
      }
    }

    if (showAlerts && failures.length > 0) {
      items.push({
        kind: "alert",
        id: "alert:failures",
        title: "数字员工集群警报",
        description: `当前有 ${failures.length} 个异常或受阻运行，需及时介入排障。`,
        timestamp: Date.now(),
        tone: "warn",
      });
    }

    items.sort((a, b) => b.timestamp - a.timestamp);
    return items;
  }, [allCategoryFilter, filteredIssues, approvals, failures, joinRequests, mentions]);

  // 审批 Tab 独立工作项
  const approvalWorkItems = useMemo((): MobileInboxWorkItem[] => {
    let list = approvals;
    if (debouncedQuery) {
      list = approvals.filter(
        (a) =>
          a.title.toLowerCase().includes(debouncedQuery) ||
          a.type.toLowerCase().includes(debouncedQuery),
      );
    }
    return list.map((approval) => ({
      kind: "approval",
      id: approval.id,
      approval,
      timestamp: new Date(approval.createdAt).getTime(),
    }));
  }, [approvals, debouncedQuery]);

  // 失败 Tab: 失败/异常运行 (外露「重试」两字按钮)
  const failedWorkItems = useMemo((): MobileInboxWorkItem[] => {
    let list = failures;
    if (debouncedQuery) {
      list = failures.filter((run) => {
        const title = "title" in run && run.title ? run.title : "";
        const name = "agentName" in run && run.agentName ? run.agentName : "";
        return (
          title.toLowerCase().includes(debouncedQuery) ||
          name.toLowerCase().includes(debouncedQuery) ||
          run.status.toLowerCase().includes(debouncedQuery)
        );
      });
    }
    return list.map((run) => ({
      kind: "failed_run",
      id: run.id,
      run,
      timestamp: new Date(run.updatedAt).getTime(),
    }));
  }, [failures, debouncedQuery]);

  // 当前选中 Tab 的基础工作项集合
  const currentTabItems = useMemo((): MobileInboxWorkItem[] => {
    if (tab === "mine") return mineWorkItems;
    if (tab === "recent") return recentWorkItems;
    if (tab === "unread") return unreadWorkItems;
    if (tab === "approvals") return approvalWorkItems;
    if (tab === "failed") return failedWorkItems;
    return allTabWorkItems;
  }, [tab, mineWorkItems, recentWorkItems, unreadWorkItems, approvalWorkItems, failedWorkItems, allTabWorkItems]);

  // P1-4: 远端搜索补全项目
  const supplementIssues = useMemo((): Issue[] => {
    if (!debouncedQuery || remoteSearchResults.length === 0) return [];
    const visibleIds = new Set<string>();
    for (const item of currentTabItems) {
      if (item.kind === "issue") visibleIds.add(item.id);
    }
    for (const id of archivedIds) visibleIds.add(id);
    return getInboxSearchSupplementIssues({
      query: debouncedQuery,
      remoteIssues: remoteSearchResults,
      visibleIssueIds: visibleIds,
    });
  }, [debouncedQuery, remoteSearchResults, currentTabItems, archivedIds]);

  // P1-8: 多维分组聚合 Section 列表
  const currentSections = useMemo((): DateSection<MobileInboxWorkItem>[] => {
    const baseSections = buildGroupedSections(currentTabItems, groupBy, agentNameById, projectNameById);
    if (supplementIssues.length > 0) {
      const suppItems: MobileInboxWorkItem[] = supplementIssues.map((issue) => ({
        kind: "issue",
        id: `supp:${issue.id}`,
        issue,
        timestamp: new Date(issue.updatedAt ?? issue.createdAt ?? 0).getTime(),
      }));
      baseSections.push({
        title: `其他搜索结果 (${supplementIssues.length})`,
        data: suppItems,
      });
    }
    return baseSections;
  }, [currentTabItems, groupBy, agentNameById, projectNameById, supplementIssues]);

  // P0-8: 阻塞视图保持不变
  const blockedRows = useMemo(() => buildBlockedRows(filteredIssues), [filteredIssues]);

  // P0-6: 归档与 5 秒撤销
  const archive = useCallback(async (issue: Issue) => {
    setActionIssue(null);
    setArchivedIds((prev) => new Set(prev).add(issue.id));

    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const timer = setTimeout(() => {
      setUndoState(null);
    }, 5000);
    undoTimerRef.current = timer;
    setUndoState({ issue, timerId: timer });

    try {
      await coolie.archiveIssueFromInbox(issue.id);
    } catch (e) {
      setArchivedIds((prev) => {
        const next = new Set(prev);
        next.delete(issue.id);
        return next;
      });
      setUndoState(null);
      setToast(`归档失败: ${String((e as Error)?.message ?? e)}`);
    }
  }, []);

  const handleUndoArchive = useCallback(async () => {
    if (!undoState) return;
    const { issue, timerId } = undoState;
    clearTimeout(timerId);
    setUndoState(null);
    setArchivedIds((prev) => {
      const next = new Set(prev);
      next.delete(issue.id);
      return next;
    });
    setToast(`已撤销: ${issue.title}`);
    try {
      await coolie.unarchiveIssueFromInbox(issue.id);
    } catch (e) {
      setToast(`撤销失败: ${String((e as Error)?.message ?? e)}`);
    }
  }, [undoState]);

  const assign = useCallback(
    async (issue: Issue, assigneeAgentId: string | null) => {
      setAssignIssue(null);
      const previous = issue.assigneeAgentId ?? null;
      setIssues((prev) =>
        prev.map((row) => (row.id === issue.id ? { ...row, assigneeAgentId } : row)),
      );
      setMineIssues((prev) =>
        prev.map((row) => (row.id === issue.id ? { ...row, assigneeAgentId } : row)),
      );
      try {
        await coolie.setIssueAssignee(issue.id, assigneeAgentId);
        const name = assigneeAgentId ? agentNameById.get(assigneeAgentId) ?? "员工" : "未指派";
        setToast(`已派活给 ${name}`);
      } catch (e) {
        setIssues((prev) =>
          prev.map((row) => (row.id === issue.id ? { ...row, assigneeAgentId: previous } : row)),
        );
        setMineIssues((prev) =>
          prev.map((row) => (row.id === issue.id ? { ...row, assigneeAgentId: previous } : row)),
        );
        setToast(`派活失败: ${String((e as Error)?.message ?? e)}`);
      }
    },
    [agentNameById],
  );

  // 🛡️ 核心修复: 点进工单自动置为已读并递减铃铛红点
  const handleOpenIssueAndMarkRead = useCallback(
    (issue: Issue) => {
      if (getIsUnread(issue)) {
        setReadIds((prev) => new Set(prev).add(issue.id));
        setUnreadIds((prev) => {
          const next = new Set(prev);
          next.delete(issue.id);
          return next;
        });
        void coolie.markIssueRead(issue.id).catch(() => null);
        void useNotificationsStore.getState().markRead(issue.id).catch(() => null);
      }
      onOpenIssue(issue);
    },
    [getIsUnread, onOpenIssue],
  );

  const openMention = useCallback(
    (item: InboxMentionItem) => {
      const known = issueById.get(item.issueId);
      if (known) {
        handleOpenIssueAndMarkRead(known);
        return;
      }
      handleOpenIssueAndMarkRead({
        id: item.issueId,
        title: item.issueTitle,
        status: "todo",
        priority: "medium",
        companyId: company.id,
      } as Issue);
    },
    [issueById, handleOpenIssueAndMarkRead, company.id],
  );

  // P0-4: 全部标记为已读
  const markAllRead = useCallback(async () => {
    // 未读 Tab 与铃铛同源: 全读 = 通知全部标已读 (与铃铛红点同一份数据)。
    if (tab === "unread") {
      const unreadNotif = notifItems.filter((n) => !n.read).length;
      if (unreadNotif === 0) {
        setToast("没有未读项目");
        return;
      }
      setToast(`已全部标为已读 (${unreadNotif} 条)`);
      try {
        await useNotificationsStore.getState().markAllRead();
      } catch {
        // 尽力而为
      }
      return;
    }
    const targetIssues = tab === "mine" ? mineIssues : activeIssues;
    const unreadIssues = targetIssues.filter((i) => !archivedIds.has(i.id) && getIsUnread(i));
    if (unreadIssues.length === 0) {
      setToast("没有未读项目");
      return;
    }
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const issue of unreadIssues) next.add(issue.id);
      return next;
    });
    setUnreadIds((prev) => {
      const next = new Set(prev);
      for (const issue of unreadIssues) next.delete(issue.id);
      return next;
    });
    setToast(`已全部标为已读 (${unreadIssues.length} 条)`);
    try {
      await Promise.all(unreadIssues.map((issue) => coolie.markIssueRead(issue.id).catch(() => null)));
    } catch {
      // 批量降级
    }
  }, [tab, mineIssues, activeIssues, archivedIds, getIsUnread, notifItems]);

  // P1-8: 分组循环切换
  const cycleGroupBy = useCallback(() => {
    setGroupBy((current) => {
      if (current === "none") {
        setToast("已切换分组: 按状态");
        return "status";
      }
      if (current === "status") {
        setToast("已切换分组: 按员工");
        return "assignee";
      }
      if (current === "assignee") {
        setToast("已切换分组: 按项目");
        return "project";
      }
      setToast("已切换分组: 按时间 (无)");
      return "none";
    });
  }, []);

  const activeFilterCount = countActiveFilters(filters);
  const showBlocked = tab === "blocked";
  const isBlockedViewBlocked = showBlocked && blockedRows.length === 0;

  const currentUnreadCount = useMemo(() => {
    return unreadWorkItems.length;
  }, [unreadWorkItems]);

  // 数据一致 (wave373): 收件箱头「未读」与顶栏铃铛共用同一通知未读数
  // (store.unreadCount, 服务端权威), 消除「铃铛通知口径 vs 收件箱未读工单口径」两套数。
  const notificationUnreadCount = useNotificationsStore((s) => s.unreadCount);

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { paddingTop: Platform.OS === "android" ? RNStatusBar.currentHeight ?? 24 : 0 },
      ]}
    >
      <StatusBar style="light" />

      {/* 顶栏: 极简通透 (返回 + 标题 + 公司 + 未读标记) */}
      <View style={styles.header}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            style={styles.backBtn}
            accessibilityLabel="返回"
          >
            <Ionicons name="chevron-back" size={22} color={C.ink} />
            <Text style={styles.backBtnText}>返回</Text>
          </Pressable>
        ) : null}
        <View style={styles.headerTitleCluster}>
          <Text style={styles.h1}>收件箱</Text>
          {notificationUnreadCount > 0 ? (
            <View style={styles.headerUnreadBadge}>
              <Text style={styles.headerUnreadBadgeText}>{notificationUnreadCount}</Text>
            </View>
          ) : null}
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {company.name}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        {onOpenSettings ? (
          <Pressable onPress={onOpenSettings} hitSlop={12} accessibilityLabel="设置">
            <Ionicons name="settings-outline" size={19} color={C.ink3} />
          </Pressable>
        ) : null}
      </View>

      {/* 一级 TabBar: 严格对齐 Web 端标准 5 大 Tab (与我 · 未读 · 最近 · 受阻 · 全部) */}
      <View style={styles.tabBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScrollContent}
        >
          {TAB_OPTIONS.map((opt) => {
            const selected = tab === opt.key;
            let count = 0;
            if (opt.key === "mine") count = mineWorkItems.length;
            if (opt.key === "unread") count = unreadWorkItems.length;
            if (opt.key === "blocked") count = blockedRows.length;
            const badgeText = count > 0 ? ` (${count})` : "";

            return (
              <Pressable
                key={opt.key}
                onPress={() => setTab(opt.key)}
                style={[styles.tabPill, selected && styles.tabPillActive]}
              >
                <Text style={[styles.tabPillText, selected && styles.tabPillTextActive]}>
                  {opt.label}
                  {badgeText}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* 单行极简控制栏: 搜索框 + 分组 + 过滤 + 全读 (有未读时显式) */}
      <View style={styles.controlBarRow}>
        <View style={styles.searchField}>
          <Ionicons name="search-outline" size={14} color={C.ink3} style={{ marginRight: 6 }} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="搜索收件箱…"
            placeholderTextColor={C.ink4}
            style={styles.searchInput}
            clearButtonMode="while-editing"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={14} color={C.ink3} />
            </Pressable>
          ) : null}
        </View>

        {/* 分组按钮 */}
        {!showBlocked ? (
          <Pressable
            onPress={cycleGroupBy}
            style={[styles.iconToolBtn, groupBy !== "none" && styles.iconToolBtnActive]}
            accessibilityLabel="分组"
          >
            <Ionicons
              name="grid-outline"
              size={16}
              color={groupBy !== "none" ? C.accent : C.ink2}
            />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => cycleBlockedGroup(blockedGroupBy, setBlockedGroupBy)}
            style={styles.iconToolBtn}
            accessibilityLabel="分组"
          >
            <Ionicons name="layers-outline" size={16} color={C.ink2} />
          </Pressable>
        )}

        {/* 过滤按钮 */}
        <Pressable
          onPress={() => setFiltersOpen(true)}
          style={[styles.iconToolBtn, activeFilterCount > 0 && styles.iconToolBtnActive]}
          accessibilityLabel="过滤"
        >
          <Ionicons
            name="filter-outline"
            size={16}
            color={activeFilterCount > 0 ? C.accent : C.ink2}
          />
          {activeFilterCount > 0 ? <View style={styles.filterDot} /> : null}
        </Pressable>

        {/* 一键全读 (对齐 Web 端: 仅在有未读项时显式展示) */}
        {currentUnreadCount > 0 ? (
          <Pressable
            onPress={() => setMarkAllConfirmOpen(true)}
            style={styles.markReadBtn}
            accessibilityLabel="全部标为已读"
          >
            <Ionicons name="checkmark-done" size={13} color="#FFFFFF" />
            <Text style={styles.markReadBtnText}>全读</Text>
          </Pressable>
        ) : null}
      </View>

      {/* 列表主体 */}
      {loading && issues.length === 0 && approvals.length === 0 ? (
        <LoadingState mode="spinner" size="small" style={styles.loader} />
      ) : error && issues.length === 0 ? (
        <ErrorRetry
          variant="card"
          title="收件箱加载失败"
          message={error}
          onRetry={() => void load()}
          style={styles.errorCard}
        />
      ) : (
        <View style={{ flex: 1 }}>
          {error ? (
            <ErrorRetry variant="inline" message={`刷新失败: ${error}`} onRetry={() => void load(true)} />
          ) : null}

          {/* 阻塞 Tab 独立渲染 */}
          {tab === "blocked" ? (
            <ScrollView
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    void load(true);
                  }}
                  tintColor={C.accent}
                />
              }
            >
              {isBlockedViewBlocked ? (
                <EmptyState
                  icon="🧱"
                  title="没有阻塞任务"
                  subtitle="当前没有被卡住、等你解救的任务。"
                  style={styles.emptyBox}
                />
              ) : blockedGroupBy === "none" ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>阻塞任务 ({blockedRows.length})</Text>
                   {sortBlockedRows(blockedRows, blockedSortBy).map((row) => (
                    <BlockedRow
                      key={row.issue.id}
                      row={row}
                      onPress={() => handleOpenIssueAndMarkRead(row.issue)}
                      onLongPress={() => setActionIssue(row.issue)}
                    />
                  ))}
                </View>
              ) : (
                groupBlockedRows(blockedRows, blockedSortBy).map((group) => (
                  <View key={group.variant} style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      {group.label} ({group.rows.length})
                    </Text>
                    {group.rows.map((row) => (
                      <BlockedRow
                        key={row.issue.id}
                        row={row}
                        onPress={() => handleOpenIssueAndMarkRead(row.issue)}
                        onLongPress={() => setActionIssue(row.issue)}
                      />
                    ))}
                  </View>
                ))
              )}
            </ScrollView>
          ) : (
            /* 统一 SectionList 渲染 (All / Mine / Recent / Unread / Approvals) */
            <SectionList<MobileInboxWorkItem, DateSection<MobileInboxWorkItem>>
              sections={currentSections}
              keyExtractor={(item) => `${item.kind}:${item.id}`}
              stickySectionHeadersEnabled={false}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    void load(true);
                  }}
                  tintColor={C.accent}
                />
              }
              renderSectionHeader={({ section: { title } }) => <DateSectionHeader title={title} />}
              renderItem={({ item }) => {
                if (item.kind === "issue") {
                  const issue = item.issue;
                  return (
                    <SwipeToArchive key={issue.id} onArchive={() => void archive(issue)}>
                      <InboxIssueRow
                        issue={issue}
                        isUnread={getIsUnread(issue)}
                        onToggleRead={() => void toggleRead(issue)}
                        assigneeName={
                          issue.assigneeAgentId
                            ? agentNameById.get(issue.assigneeAgentId) ?? "员工"
                            : null
                        }
                        projectName={
                          issue.projectId ? projectNameById.get(issue.projectId) ?? null : null
                        }
                        onPress={() => handleOpenIssueAndMarkRead(issue)}
                        onLongPress={() => setActionIssue(issue)}
                      />
                    </SwipeToArchive>
                  );
                }

                if (item.kind === "approval") {
                  const approval = item.approval;
                  const isOpen = expandedApprovalId === approval.id;
                  return (
                    <ApprovalInboxRowItem
                      key={approval.id}
                      item={approval}
                      isOpen={isOpen}
                      onToggleExpand={() =>
                        setExpandedApprovalId(isOpen ? null : approval.id)
                      }
                      onApprove={() =>
                        void handleApproveApproval(approval.id, approval.title)
                      }
                      onReject={() =>
                        void handleRejectApproval(approval.id, approval.title)
                      }
                    >
                      <QuickApprovalCard
                        companyId={company.id}
                        approval={approval as unknown as Approval}
                        floating={false}
                        onResolved={(approvalId, decision) => {
                          void onResolved?.(approvalId, decision);
                          setExpandedApprovalId(null);
                          setApprovals((prev) => prev.filter((a) => a.id !== approvalId));
                        }}
                        onDismiss={() => setExpandedApprovalId(null)}
                      />
                    </ApprovalInboxRowItem>
                  );
                }

                if (item.kind === "failed_run") {
                  return (
                    <FailedRunRow
                      key={item.id}
                      run={item.run}
                      isRetrying={retryingRunId === item.id}
                      onRetry={() => void handleRetryRun(item.run)}
                      onPress={() => {
                        // 优先用运行关联的工单 id 导航; 退回 run.id (受阻任务兜底)。
                        const runIssueId = "issueId" in item.run ? item.run.issueId : null;
                        const known =
                          (runIssueId ? issueById.get(runIssueId) : undefined) ??
                          issueById.get(item.run.id);
                        if (known) handleOpenIssueAndMarkRead(known);
                        else onOpenWorkshop?.();
                      }}
                    />
                  );
                }

                if (item.kind === "join_request") {
                  return (
                    <JoinRequestRow
                      key={item.id}
                      item={item.joinRequest}
                      onApprove={() => void handleApproveJoinRequest(item.id)}
                      onReject={() => void handleRejectJoinRequest(item.id)}
                    />
                  );
                }

                if (item.kind === "alert") {
                  return (
                    <AlertRow
                      key={item.id}
                      title={item.title}
                      description={item.description}
                      tone={item.tone}
                    />
                  );
                }

                if (item.kind === "mention") {
                  return (
                    <AppCard
                      key={item.id}
                      variant="surface"
                      style={styles.mentionCard}
                      onPress={() => openMention(item.mention)}
                    >
                      <View style={styles.mentionHeader}>
                        <Text style={styles.mentionAuthor} numberOfLines={1}>
                          {item.mention.authorName}
                        </Text>
                        <Text style={styles.metaTime}>{formatRelativeTime(item.mention.createdAt)}</Text>
                      </View>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {item.mention.issueTitle}
                      </Text>
                      <Text style={styles.mentionBody} numberOfLines={2}>
                        {item.mention.body}
                      </Text>
                    </AppCard>
                  );
                }

                return null;
              }}
              ListEmptyComponent={
                <EmptyState
                  icon={
                    tab === "unread"
                      ? "✨"
                      : tab === "approvals"
                        ? "✅"
                        : tab === "failed"
                          ? "🧯"
                          : tab === "recent"
                            ? "🕒"
                            : "📥"
                  }
                  title={
                    debouncedQuery
                      ? "没有匹配的项目"
                      : tab === "unread"
                        ? "收件箱已清空 (Inbox Zero)"
                        : tab === "approvals"
                          ? "没有待审批"
                          : tab === "failed"
                            ? "没有失败运行"
                            : tab === "recent"
                              ? "最近 7 天没有新活动"
                              : tab === "mine"
                                ? "当前没有与你相关的待办"
                                : "当前没有可处理的任务"
                  }
                  subtitle={
                    debouncedQuery
                      ? "换个搜索关键词试试。"
                      : tab === "unread"
                        ? "太棒了！所有需要你处理的待办都已完成。"
                        : tab === "approvals"
                          ? "所有申请均已裁决完毕。"
                          : "新的任务、审批或运行异常会在此汇聚。"
                  }
                  style={styles.emptyBox}
                />
              }
            />
          )}
        </View>
      )}

      {/* P0-6: 5 秒归档撤销 Snackbar 与通用 Toast */}
      {undoState ? (
        <View style={styles.undoToast}>
          <Ionicons name="archive-outline" size={15} color={C.ink2} />
          <Text style={styles.undoToastText} numberOfLines={1}>
            已归档: {undoState.issue.title}
          </Text>
          <Pressable
            onPress={() => void handleUndoArchive()}
            style={styles.undoBtn}
            hitSlop={8}
            accessibilityLabel="撤销归档"
          >
            <Text style={styles.undoBtnText}>撤销</Text>
          </Pressable>
        </View>
      ) : toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText} numberOfLines={2}>
            {toast}
          </Text>
        </View>
      ) : null}

      {/* 过滤弹层 */}
      <FilterSheet
        visible={filtersOpen}
        filters={filters}
        agents={agents}
        projects={projects}
        categoryFilter={allCategoryFilter}
        onClose={() => setFiltersOpen(false)}
        onApply={(next, nextCategory) => {
          setFilters(next);
          setAllCategoryFilter(nextCategory);
          setFiltersOpen(false);
        }}
      />

      {/* P0-4: 全部标为已读确认弹层 */}
      <Modal
        transparent
        visible={markAllConfirmOpen}
        animationType="fade"
        onRequestClose={() => setMarkAllConfirmOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setMarkAllConfirmOpen(false)}>
          <Pressable style={styles.confirmCard} onPress={() => {}}>
            <Text style={styles.confirmTitle}>全部标为已读</Text>
            <Text style={styles.confirmSub}>
              {currentUnreadCount > 0
                ? `确认将当前 ${currentUnreadCount} 条未读项全部标记为已读？`
                : "当前视图没有未读项目。"}
            </Text>
            <View style={styles.confirmBtnRow}>
              <Pressable
                style={styles.confirmCancelBtn}
                onPress={() => setMarkAllConfirmOpen(false)}
              >
                <Text style={styles.confirmCancelText}>取消</Text>
              </Pressable>
              {currentUnreadCount > 0 ? (
                <Pressable
                  style={styles.confirmOkBtn}
                  onPress={() => {
                    setMarkAllConfirmOpen(false);
                    void markAllRead();
                  }}
                >
                  <Text style={styles.confirmOkText}>全读</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 工单长按底纸菜单 */}
      <Modal
        transparent
        visible={actionIssue !== null}
        animationType="fade"
        onRequestClose={() => setActionIssue(null)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setActionIssue(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {actionIssue?.title}
            </Text>
            <SheetItem
              icon="open-outline"
              label="打开"
              onPress={() => {
                const issue = actionIssue;
                setActionIssue(null);
                if (issue) handleOpenIssueAndMarkRead(issue);
              }}
            />
            <SheetItem
              icon="archive-outline"
              label="归档"
              onPress={() => {
                if (actionIssue) void archive(actionIssue);
              }}
            />
            <SheetItem
              icon="person-add-outline"
              label="派活"
              onPress={() => {
                const issue = actionIssue;
                setActionIssue(null);
                if (issue) setAssignIssue(issue);
              }}
            />
            <SheetItem
              icon="chatbubbles-outline"
              label="去工坊"
              onPress={() => {
                setActionIssue(null);
                onOpenWorkshop?.();
              }}
            />
            <SheetItem icon="close-outline" label="取消" onPress={() => setActionIssue(null)} />
          </View>
        </Pressable>
      </Modal>

      {/* 派活弹层 */}
      <Modal
        transparent
        visible={assignIssue !== null}
        animationType="fade"
        onRequestClose={() => setAssignIssue(null)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setAssignIssue(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              派活 · {assignIssue?.title}
            </Text>
            <ScrollView style={styles.assignList} keyboardShouldPersistTaps="handled">
              <SheetItem
                icon="remove-circle-outline"
                label="未指派"
                onPress={() => {
                  if (assignIssue) void assign(assignIssue, null);
                }}
              />
              {agents.map((agent) => (
                <SheetItem
                  key={agent.id}
                  icon="person-outline"
                  label={agent.name}
                  onPress={() => {
                    if (assignIssue) void assign(assignIssue, agent.id);
                  }}
                />
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function labelOf<T extends string>(
  options: readonly [T, string][],
  value: T,
): string {
  return options.find(([key]) => key === value)?.[1] ?? value;
}

function cycleBlockedGroup(
  current: BlockedInboxGroupBy,
  set: (next: BlockedInboxGroupBy) => void,
) {
  const index = BLOCKED_GROUP_OPTIONS.findIndex(([key]) => key === current);
  const next = BLOCKED_GROUP_OPTIONS[(index + 1) % BLOCKED_GROUP_OPTIONS.length];
  if (next) set(next[0]);
}

function cycleBlockedSort(current: BlockedInboxSort, set: (next: BlockedInboxSort) => void) {
  const index = BLOCKED_SORT_OPTIONS.findIndex(([key]) => key === current);
  const next = BLOCKED_SORT_OPTIONS[(index + 1) % BLOCKED_SORT_OPTIONS.length];
  if (next) set(next[0]);
}

/** P0-7: 日期与分组段落头部 */
function DateSectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.dateHeaderWrap}>
      <View style={styles.dateHeaderLine} />
      <Text style={styles.dateHeaderText}>{title}</Text>
      <View style={styles.dateHeaderLine} />
    </View>
  );
}

function StatusGlyph({ status }: { status: string }) {
  const color = issueStatusColor(status);
  const done = status === "done";
  const cancelled = status === "cancelled";
  return (
    <View
      style={[
        styles.glyph,
        { borderColor: cancelled ? C.ink4 : color },
        done && { backgroundColor: color, borderColor: color },
      ]}
    >
      {done ? <Ionicons name="checkmark" size={11} color={C.bg} /> : null}
    </View>
  );
}

/** P0-2: 工单行包含 8x8 未读蓝点 */
function InboxIssueRow({
  issue,
  assigneeName,
  projectName,
  isUnread,
  onToggleRead,
  onPress,
  onLongPress,
}: {
  issue: Issue;
  assigneeName: string | null;
  projectName: string | null;
  isUnread?: boolean;
  onToggleRead?: () => void;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const color = issueStatusColor(issue.status);
  const cancelled = issue.status === "cancelled";
  const description = firstLine(issue.description);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={320}
      style={({ pressed }) => [
        styles.row,
        isUnread ? styles.rowUnread : styles.rowRead,
        pressed && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={issue.title}
    >
      <Pressable
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        onPress={(e) => {
          e.stopPropagation();
          onToggleRead?.();
        }}
        style={styles.unreadSlot}
        accessibilityLabel={isUnread ? "标为已读" : "标为未读"}
      >
        <View style={[styles.unreadDot, isUnread ? styles.unreadDotActive : styles.unreadDotInactive]} />
      </Pressable>

      <StatusGlyph status={issue.status} />

      <View style={styles.rowBody}>
        <Text
          style={[
            styles.rowTitle,
            isUnread ? styles.rowTitleUnread : styles.rowTitleRead,
            cancelled && styles.rowTitleCancelled,
          ]}
          numberOfLines={2}
        >
          {issue.title}
        </Text>
        {description ? (
          <Text
            style={[styles.rowDesc, isUnread ? styles.rowDescUnread : styles.rowDescRead]}
            numberOfLines={1}
          >
            {description}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          <Pill label={ISSUE_STATUS_LABEL[issue.status] ?? issue.status} dotColor={color} size="sm" mono />
          <Pill
            label={PRIORITY_LABEL[issue.priority] ?? issue.priority}
            dotColor={PRIORITY_COLOR[issue.priority] ?? C.ink3}
            size="sm"
            mono
          />
          <Text style={[styles.metaText, !isUnread && styles.metaTextRead]} numberOfLines={1}>
            {assigneeName ?? "未指派"}
          </Text>
          {projectName ? (
            <Text style={[styles.metaText, !isUnread && styles.metaTextRead]} numberOfLines={1}>
              · {projectName}
            </Text>
          ) : null}
          <View style={{ flex: 1 }} />
          <Text style={[styles.metaTime, !isUnread && styles.metaTextRead]}>
            {formatRelativeShort(issue.updatedAt ?? issue.createdAt)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** P1-5: 审批行外露「批准」与「驳回」两字按钮 */
function ApprovalInboxRowItem({
  item,
  onApprove,
  onReject,
  onToggleExpand,
  isOpen,
  children,
}: {
  item: InboxApprovalItem;
  onApprove: () => void;
  onReject: () => void;
  onToggleExpand: () => void;
  isOpen: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 6 }}>
      <AppCard variant="surface" style={styles.approvalCard}>
        <Pressable onPress={onToggleExpand} style={styles.approvalCardHeader}>
          <View style={[styles.rowDot, { backgroundColor: C.warn, marginTop: 4 }]} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.rowTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.metaText} numberOfLines={1}>
              {item.type} · {formatRelativeTime(item.createdAt)}
            </Text>
          </View>
          <Text style={styles.chevron}>{isOpen ? "▾" : "›"}</Text>
        </Pressable>
        <View style={styles.inlineActionRow}>
          <Pressable
            style={[styles.miniBtn, styles.miniBtnReject]}
            onPress={onReject}
            hitSlop={6}
            accessibilityLabel="驳回"
          >
            <Text style={styles.miniBtnTextReject}>驳回</Text>
          </Pressable>
          <Pressable
            style={[styles.miniBtn, styles.miniBtnApprove]}
            onPress={onApprove}
            hitSlop={6}
            accessibilityLabel="批准"
          >
            <Text style={styles.miniBtnTextApprove}>批准</Text>
          </Pressable>
        </View>
      </AppCard>
      {isOpen ? <View style={styles.approvalDetail}>{children}</View> : null}
    </View>
  );
}

/** P1-6: 失败/异常运行行包含「重试」两字按钮 */
function FailedRunRow({
  run,
  onRetry,
  onPress,
  isRetrying,
}: {
  run: InboxFailedRunItem | InboxFailureItem;
  onRetry: () => void;
  onPress?: () => void;
  isRetrying?: boolean;
}) {
  const agentName = ("agentName" in run && run.agentName ? run.agentName : null) ?? "智能体";
  const errorText = ("error" in run && run.error ? run.error : null) ?? run.status;
  const title = "title" in run && run.title ? run.title : `${agentName} 执行异常`;

  return (
    <AppCard variant="surface" style={styles.failedRunCard} onPress={onPress}>
      <View style={styles.failedRunHeader}>
        <View style={[styles.glyph, { borderColor: C.err, backgroundColor: "rgba(239, 68, 68, 0.15)" }]}>
          <Ionicons name="alert" size={10} color={C.err} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {title}
          </Text>
          {errorText ? (
            <Text style={styles.failedErrorText} numberOfLines={1}>
              {errorText}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            <Pill label={run.status} tone="err" size="sm" mono />
            <Text style={styles.metaText}>{agentName}</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.metaTime}>{formatRelativeTime(run.updatedAt)}</Text>
          </View>
        </View>
      </View>
      <View style={styles.inlineActionRow}>
        <View style={{ flex: 1 }} />
        <Pressable
          style={[styles.miniBtn, styles.miniBtnRetry]}
          onPress={onRetry}
          disabled={isRetrying}
          hitSlop={6}
          accessibilityLabel="重试"
        >
          {isRetrying ? (
            <ActivityIndicator size="small" color={C.accent} style={{ marginRight: 4 }} />
          ) : (
            <Ionicons name="reload-outline" size={12} color={C.accent} style={{ marginRight: 4 }} />
          )}
          <Text style={styles.miniBtnTextRetry}>{isRetrying ? "重试中" : "重试"}</Text>
        </Pressable>
      </View>
    </AppCard>
  );
}

/** P1-7: 企业加群申请行外露「批准」与「驳回」两字按钮 */
function JoinRequestRow({
  item,
  onApprove,
  onReject,
}: {
  item: InboxJoinRequestItem;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isAgent = item.requestType !== "human";
  const title = isAgent
    ? `智能体加群: ${item.agentName || "未知智能体"}`
    : `成员加群: ${item.requestEmailSnapshot || item.requestingUserId || "新成员"}`;

  return (
    <AppCard variant="surface" style={styles.joinCard}>
      <View style={styles.joinHeader}>
        <View style={[styles.glyph, { borderColor: C.accent, backgroundColor: "rgba(59, 130, 246, 0.12)" }]}>
          <Ionicons name={isAgent ? "hardware-chip-outline" : "person-add-outline"} size={11} color={C.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.metaText} numberOfLines={1}>
            来源 IP: {item.requestIp || "未知"} · {formatRelativeTime(item.createdAt)}
          </Text>
        </View>
      </View>
      <View style={styles.inlineActionRow}>
        <Pressable
          style={[styles.miniBtn, styles.miniBtnReject]}
          onPress={onReject}
          hitSlop={6}
          accessibilityLabel="驳回"
        >
          <Text style={styles.miniBtnTextReject}>驳回</Text>
        </Pressable>
        <Pressable
          style={[styles.miniBtn, styles.miniBtnApprove]}
          onPress={onApprove}
          hitSlop={6}
          accessibilityLabel="批准"
        >
          <Text style={styles.miniBtnTextApprove}>批准</Text>
        </Pressable>
      </View>
    </AppCard>
  );
}

/** P1-3: 系统警报行 */
function AlertRow({
  title,
  description,
  tone = "warn",
}: {
  title: string;
  description: string;
  tone?: "warn" | "err";
}) {
  const isErr = tone === "err";
  return (
    <AppCard
      variant="surface"
      style={[
        styles.alertCard,
        { borderColor: isErr ? "rgba(239, 68, 68, 0.4)" : "rgba(234, 179, 8, 0.4)" },
      ]}
    >
      <View style={styles.alertHeader}>
        <Ionicons name={isErr ? "alert-circle" : "warning"} size={16} color={isErr ? C.err : C.warn} />
        <Text style={styles.alertTitle}>{title}</Text>
      </View>
      <Text style={styles.alertBody}>{description}</Text>
    </AppCard>
  );
}

function BlockedRow({
  row,
  onPress,
  onLongPress,
}: {
  row: BlockedInboxRow;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={320}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={row.issue.title}
    >
      <View style={[styles.rowDot, { backgroundColor: severityColor(row.attention.severity), marginTop: 6 }]} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {row.issue.title}
        </Text>
        <View style={styles.metaRow}>
          <Pill label={row.reasonLabel} tone={severityTone(row.attention.severity)} size="sm" />
          <Pill
            label={ISSUE_STATUS_LABEL[row.issue.status] ?? row.issue.status}
            dotColor={issueStatusColor(row.issue.status)}
            size="sm"
            mono
          />
          <Text style={styles.metaTime}>{formatStoppedAge(row.attention.stoppedSinceAt)}</Text>
        </View>
        {row.attention.action?.label ? (
          <Text style={styles.blockedAction} numberOfLines={1}>
            待办: {row.attention.action.label}
            {row.attention.action.detail ? ` · ${row.attention.action.detail}` : ""}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function severityColor(severity: string): string {
  if (severity === "critical") return C.err;
  if (severity === "high") return C.warn;
  if (severity === "medium") return C.ink3;
  return C.ink4;
}

function severityTone(severity: string): "err" | "warn" | "muted" {
  if (severity === "critical") return "err";
  if (severity === "high") return "warn";
  return "muted";
}

/** P0-9: 左滑归档 —— PanResponder 实现 */
function SwipeToArchive({ children, onArchive }: { children: React.ReactNode; onArchive: () => void }) {
  const tx = useRef(new Animated.Value(0)).current;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderMove: (_event, gesture) => {
          tx.setValue(Math.min(0, Math.max(gesture.dx, -140)));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx <= -100) {
            Animated.timing(tx, { toValue: -500, duration: 160, useNativeDriver: true }).start(() =>
              onArchive(),
            );
          } else {
            Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        },
      }),
    [onArchive, tx],
  );

  return (
    <View style={styles.swipeWrap}>
      <View style={styles.swipeUnderlay}>
        <Ionicons name="archive-outline" size={16} color={C.ink2} />
        <Text style={styles.swipeUnderlayText}>归档</Text>
      </View>
      <Animated.View
        style={[{ backgroundColor: C.bg }, { transform: [{ translateX: tx }] }]}
        {...responder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

function SheetItem({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.sheetItem, pressed && styles.sheetItemPressed]}
    >
      <Ionicons name={icon} size={17} color={C.ink2} />
      <Text style={styles.sheetItemText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function FilterSheet({
  visible,
  filters,
  agents,
  projects,
  categoryFilter,
  onClose,
  onApply,
}: {
  visible: boolean;
  filters: InboxFilters;
  agents: Agent[];
  projects: Project[];
  categoryFilter: InboxCategory;
  onClose: () => void;
  onApply: (next: InboxFilters, nextCategory: InboxCategory) => void;
}) {
  const [draft, setDraft] = useState<InboxFilters>(filters);
  const [draftCategory, setDraftCategory] = useState<InboxCategory>(categoryFilter);

  useEffect(() => {
    if (visible) {
      setDraft(filters);
      setDraftCategory(categoryFilter);
    }
  }, [visible, filters, categoryFilter]);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.filterSheet} onPress={() => {}}>
          <View style={styles.filterHeader}>
            <Text style={styles.filterTitle}>过滤收件箱</Text>
            <Pressable
              onPress={() => {
                setDraft(DEFAULT_FILTERS);
                setDraftCategory("everything");
              }}
              hitSlop={8}
            >
              <Text style={styles.filterReset}>重置</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.filterBody} keyboardShouldPersistTaps="handled">
            <FilterSection title="类型">
              {CATEGORY_OPTIONS.map((cat) => (
                <Chip
                  key={cat.key}
                  label={cat.label}
                  active={draftCategory === cat.key}
                  onPress={() => setDraftCategory(cat.key)}
                />
              ))}
            </FilterSection>

            <FilterSection title="状态">
              {ISSUE_STATUSES.map((status) => (
                <Chip
                  key={status}
                  label={ISSUE_STATUS_LABEL[status]}
                  active={draft.statuses.includes(status)}
                  onPress={() => setDraft((prev) => ({ ...prev, statuses: toggle(prev.statuses, status) }))}
                />
              ))}
            </FilterSection>

            <FilterSection title="优先级">
              {ISSUE_PRIORITIES.map((priority) => (
                <Chip
                  key={priority}
                  label={PRIORITY_LABEL[priority]}
                  active={draft.priorities.includes(priority)}
                  onPress={() =>
                    setDraft((prev) => ({ ...prev, priorities: toggle(prev.priorities, priority) }))
                  }
                />
              ))}
            </FilterSection>

            <FilterSection title="负责人">
              <Chip
                label="未指派"
                active={draft.assignees.includes(UNASSIGNED)}
                onPress={() => setDraft((prev) => ({ ...prev, assignees: toggle(prev.assignees, UNASSIGNED) }))}
              />
              {agents.map((agent) => (
                <Chip
                  key={agent.id}
                  label={agent.name}
                  active={draft.assignees.includes(agent.id)}
                  onPress={() =>
                    setDraft((prev) => ({ ...prev, assignees: toggle(prev.assignees, agent.id) }))
                  }
                />
              ))}
            </FilterSection>

            {projects.length > 0 ? (
              <FilterSection title="项目">
                {projects.map((project) => (
                  <Chip
                    key={project.id}
                    label={project.name}
                    active={draft.projects.includes(project.id)}
                    onPress={() =>
                      setDraft((prev) => ({ ...prev, projects: toggle(prev.projects, project.id) }))
                    }
                  />
                ))}
              </FilterSection>
            ) : null}

            <FilterSection title="时间范围">
              {DATE_RANGE_OPTIONS.map((option) => (
                <Chip
                  key={option.key}
                  label={option.label}
                  active={draft.dateRange === option.key}
                  onPress={() => setDraft((prev) => ({ ...prev, dateRange: option.key }))}
                />
              ))}
            </FilterSection>
          </ScrollView>

          <Pressable style={styles.filterApply} onPress={() => onApply(draft, draftCategory)}>
            <Text style={styles.filterApplyText}>完成</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.filterSection}>
      <Text style={styles.filterSectionTitle}>{title}</Text>
      <View style={styles.chipWrap}>{children}</View>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 6,
  },
  backBtnText: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "500",
  },
  headerTitleCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  h1: {
    color: C.ink,
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  headerUnreadBadge: {
    backgroundColor: C.err,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.pill,
    minWidth: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerUnreadBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  headerSubtitle: {
    color: C.ink3,
    fontSize: 12,
    marginLeft: 2,
  },

  // 一级 5 Tab 水平滑动栏
  tabBarWrap: {
    marginHorizontal: 16,
    marginBottom: 4,
  },
  tabScrollContent: {
    gap: 6,
    paddingVertical: 4,
  },
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: ELEVATION.base,
    borderWidth: 1,
    borderColor: C.line,
  },
  tabPillActive: {
    backgroundColor: ELEVATION.active,
    borderColor: C.brand,
  },
  tabPillText: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  tabPillTextActive: {
    color: C.ink,
    fontWeight: "600",
  },

  // 单行极简控制栏 (对齐 Web 端 Toolbar: 搜索框 + 分组 + 过滤 + 全读)
  controlBarRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
  searchField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    height: 36,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  searchInput: {
    flex: 1,
    color: C.ink,
    fontSize: 13,
    paddingVertical: 0,
  },
  iconToolBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  iconToolBtnActive: {
    borderColor: C.brand,
    backgroundColor: "rgba(94, 106, 210, 0.16)",
  },
  filterDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.brand,
  },
  markReadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.brand,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: RADIUS.md,
  },
  markReadBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },

  loader: { flex: 0, marginTop: 32, padding: 0 },
  errorCard: { marginTop: 16, backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 0 },
  list: { paddingHorizontal: 16, paddingBottom: 64, gap: 2 },
  emptyBox: { marginTop: 16, backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 0 },
  section: { gap: 6, marginBottom: 12 },
  sectionTitle: { color: C.ink3, fontSize: 13, fontWeight: "500", marginTop: 6, marginBottom: 2 },

  // P0-7: 日期段落头部
  dateHeaderWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 12,
    paddingBottom: 6,
  },
  dateHeaderLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.line,
  },
  dateHeaderText: {
    color: C.ink4,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  // 未读: 清晰高对比度, 饱和卡片背景与明晰边框
  rowUnread: {
    opacity: 1,
    backgroundColor: C.surface,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  // 已读: 朦胧退后半透明效果 (对齐 Web 端清晰与朦胧反差)
  rowRead: {
    opacity: 0.52,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderColor: "rgba(255, 255, 255, 0.03)",
  },
  rowPressed: { backgroundColor: ELEVATION.hover },
  rowBody: { flex: 1, gap: 4 },
  rowDot: { width: 8, height: 8, borderRadius: 4 },

  // P0-2: 8x8 未读蓝点卡槽
  unreadSlot: {
    width: 14,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  unreadDotActive: {
    backgroundColor: "#3B82F6",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
    elevation: 2,
  },
  unreadDotInactive: {
    backgroundColor: "transparent",
  },

  glyph: {
    width: 16,
    height: 16,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  rowTitle: { color: C.ink, fontSize: 14, fontWeight: "500", lineHeight: 19 },
  rowTitleUnread: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
    letterSpacing: -0.1,
  },
  rowTitleRead: {
    color: C.ink3,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 19,
  },
  rowTitleCancelled: { color: C.ink4, textDecorationLine: "line-through" },
  rowDesc: { color: C.ink3, fontSize: 12, lineHeight: 16, flexShrink: 1, paddingLeft: 2 },
  rowDescUnread: { color: C.ink2 },
  rowDescRead: { color: C.ink4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  metaText: { color: C.ink4, fontSize: 11 },
  metaTextRead: { color: "rgba(148, 163, 184, 0.65)" },
  metaTime: { color: C.ink4, fontSize: 11, fontVariant: ["tabular-nums"] },
  blockedAction: { color: C.ink3, fontSize: 12, marginTop: 2 },
  chevron: { color: C.ink4, fontSize: 20 },

  // P1-5: 审批卡片
  approvalCard: { gap: 8, padding: 12, borderRadius: RADIUS.md },
  approvalCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  approvalDetail: { marginBottom: 10 },

  // P1-6: 失败运行卡片
  failedRunCard: { gap: 8, padding: 12, borderRadius: RADIUS.md, marginBottom: 4 },
  failedRunHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  failedErrorText: { color: C.err, fontSize: 12, lineHeight: 16 },

  // P1-7: 加群卡片
  joinCard: { gap: 8, padding: 12, borderRadius: RADIUS.md, marginBottom: 4 },
  joinHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },

  // P1-3: 警报卡片
  alertCard: { gap: 6, padding: 12, borderRadius: RADIUS.md, marginBottom: 6, borderWidth: 1 },
  alertHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  alertTitle: { color: C.ink, fontSize: 13, fontWeight: "600" },
  alertBody: { color: C.ink3, fontSize: 12, lineHeight: 16 },

  // P1-5 & 6 & 7: 行内两字按钮样式 (极简两字)
  inlineActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line,
  },
  miniBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
    minWidth: 54,
  },
  miniBtnApprove: {
    backgroundColor: C.ok,
  },
  miniBtnTextApprove: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  miniBtnReject: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.err,
  },
  miniBtnTextReject: {
    color: C.err,
    fontSize: 12,
    fontWeight: "600",
  },
  miniBtnRetry: {
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    borderWidth: 1,
    borderColor: C.accent,
  },
  miniBtnTextRetry: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "600",
  },

  mentionCard: { gap: 6, marginBottom: 8 },
  mentionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  mentionAuthor: { color: C.ok, fontSize: 12, fontWeight: "600", flex: 1 },
  mentionBody: { color: C.ink3, fontSize: 13, lineHeight: 18 },
  swipeWrap: { borderRadius: RADIUS.md, overflow: "hidden" },
  swipeUnderlay: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 120,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(239, 68, 68, 0.16)",
  },
  swipeUnderlayText: { color: C.ink2, fontSize: 13, fontWeight: "500" },

  // 通用 Toast
  toast: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 28,
    backgroundColor: C.surfaceHover,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  toastText: { color: C.ink, fontSize: 13 },

  // P0-6: 5秒归档撤销 Snackbar
  undoToast: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: C.panel,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  undoToastText: {
    color: C.ink,
    fontSize: 13,
    flex: 1,
  },
  undoBtn: {
    backgroundColor: "rgba(94, 106, 210, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: C.brand,
  },
  undoBtnText: {
    color: C.brand,
    fontSize: 12,
    fontWeight: "600",
  },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingTop: SPACING.md,
    paddingBottom: 28,
    paddingHorizontal: SPACING.sm,
    borderTopWidth: 1,
    borderColor: C.line,
  },
  sheetTitle: {
    color: C.ink3,
    fontSize: 12,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 13,
    borderRadius: RADIUS.md,
  },
  sheetItemPressed: { backgroundColor: ELEVATION.hover },
  sheetItemText: { color: C.ink, fontSize: 15 },
  assignList: { maxHeight: 360 },

  // P0-4: 确认弹窗
  confirmCard: {
    backgroundColor: C.panel,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.line,
    marginHorizontal: 32,
    marginBottom: "auto",
    marginTop: "auto",
    padding: 20,
    gap: 12,
  },
  confirmTitle: { color: C.ink, fontSize: 16, fontWeight: "600" },
  confirmSub: { color: C.ink3, fontSize: 13, lineHeight: 18 },
  confirmBtnRow: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  confirmCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
  },
  confirmCancelText: { color: C.ink3, fontSize: 13, fontWeight: "500" },
  confirmOkBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: C.brand,
  },
  confirmOkText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },

  filterSheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth: 1,
    borderColor: C.line,
    paddingTop: SPACING.lg,
    paddingBottom: 28,
    maxHeight: "80%",
  },
  filterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  filterTitle: { color: C.ink, fontSize: 16, fontWeight: "600" },
  filterReset: { color: C.accent, fontSize: 13 },
  filterBody: { paddingHorizontal: SPACING.lg },
  filterSection: { marginTop: SPACING.md, gap: SPACING.sm },
  filterSectionTitle: { color: C.ink3, fontSize: 12, fontWeight: "600" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
  },
  chipActive: { borderColor: C.brand, backgroundColor: "rgba(94, 106, 210, 0.18)" },
  chipText: { color: C.ink3, fontSize: 12, fontWeight: "500" },
  chipTextActive: { color: C.ink },
  filterApply: {
    marginTop: SPACING.lg,
    marginHorizontal: SPACING.lg,
    backgroundColor: C.brand,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  filterApplyText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
});
