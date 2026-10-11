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
  type InboxFailureItem,
  type InboxMentionItem,
} from "../coolie";
import { StatusDot } from "../components/StatusDot";
import { QuickApprovalCard } from "../components/QuickApprovalCard";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { Pill } from "../ui/Pill";
import { SegmentedControl } from "../ui/SegmentedControl";
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

export type InboxTab = "all" | "mine" | "approvals" | "blocked";
type DateRange = "all" | "today" | "7d" | "30d";

export type DateSectionTitle = "TODAY" | "YESTERDAY" | "EARLIER";

export interface DateSection<T> {
  title: DateSectionTitle;
  data: T[];
}

export type MobileInboxWorkItem =
  | { kind: "issue"; id: string; issue: Issue; timestamp: number }
  | { kind: "approval"; id: string; approval: InboxApprovalItem; timestamp: number }
  | { kind: "failed_run"; id: string; run: InboxFailureItem; timestamp: number }
  | { kind: "mention"; id: string; mention: InboxMentionItem; timestamp: number };

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
): DateSectionTitle {
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
 * 收件箱 —— `Coolie Web Inbox` (`ui/src/pages/Inbox.tsx`) 的 RN 适配版。
 * wave372 审计对齐 P0 9 件:
 * - P0-1: Mine Tab 重做 (聚合工单/审批/失败Run/提及, 7天最近过滤)
 * - P0-2: 未读蓝点 (左侧 8x8 蓝色圆点)
 * - P0-3: 单条标记已读/未读 (点击蓝点切 read)
 * - P0-4: 一键全标已读 (顶栏右按钮 + 确认弹窗)
 * - P0-5: 即时搜索框 (内嵌 TextInput, 300ms debounce)
 * - P0-6: 归档撤销 (归档后 5 秒 Snackbar/Toast 撤销)
 * - P0-7: 日期分段 (TODAY / YESTERDAY / EARLIER 灰线分割, SectionList 改造)
 * - P0-8: Blocked Tab ✅ (保持不变)
 * - P0-9: 左滑归档 ✅ (保持不变)
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
  const [tab, setTab] = useState<InboxTab>(initialTab);
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
  const [failures, setFailures] = useState<InboxFailureItem[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => new Set());
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [unreadIds, setUnreadIds] = useState<Set<string>>(() => new Set());

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // P0-5 & 8: 即时搜索框与 300ms debounce
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim().toLowerCase());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // P0-6: 5秒归档撤销窗口
  const [undoState, setUndoState] = useState<{
    issue: Issue;
    timerId: NodeJS.Timeout;
  } | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  // P0-4 & 9: 全部标已读确认对话框
  const [markAllConfirmOpen, setMarkAllConfirmOpen] = useState(false);

  const [filters, setFilters] = useState<InboxFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [blockedGroupBy, setBlockedGroupBy] = useState<BlockedInboxGroupBy>("blocker_type");
  const [blockedSortBy, setBlockedSortBy] = useState<BlockedInboxSort>("urgency");
  const [actionIssue, setActionIssue] = useState<Issue | null>(null);
  const [assignIssue, setAssignIssue] = useState<Issue | null>(null);

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
          const [nextIssues, mineResp, feed, nextAgents, nextProjects] = await Promise.all([
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
            })),
            coolie.listAgents(company.id).catch(() => [] as Agent[]),
            coolie.listProjects(company.id).catch(() => [] as Project[]),
          ]);
          if (controller.signal.aborted) return;
          if (loadReqIdRef.current !== reqId) return;

          const unreadIdSet = new Set<string>();
          for (const issue of mineResp) {
            if (issue.isUnreadForMe) unreadIdSet.add(issue.id);
          }
          const mergedNextIssues = unreadIdSet.size > 0
            ? nextIssues.map((i) => (unreadIdSet.has(i.id) ? { ...i, isUnreadForMe: true } : i))
            : nextIssues;

          setIssues(mergedNextIssues);
          setMineIssues(mineResp.length > 0 ? mineResp : mergedNextIssues);
          setMentions(feed.mentionedBy ?? []);
          setApprovals(feed.pendingApprovals ?? []);
          setFailures(feed.failures ?? []);
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

  // P0-2 & 4: 未读状态判定
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

  // P0-4 & 9: 全部标记为已读
  const markAllRead = useCallback(async () => {
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
      // 批量接口降级
    }
  }, [tab, mineIssues, activeIssues, archivedIds, getIsUnread]);

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

  // P0-1 & 3: Mine Tab 聚合工作项 (工单 + 待审批 + 失败Run + 评论@我, 7天最近过滤)
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

    // 2. 审批流
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
          return (
            item.run.title.toLowerCase().includes(debouncedQuery) ||
            item.run.status.toLowerCase().includes(debouncedQuery)
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

    // 时间降序
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    return filtered;
  }, [mineIssues, archivedIds, filters, approvals, failures, mentions, debouncedQuery, getIsUnread]);

  // 审批 Tab 过滤
  const filteredApprovals = useMemo(() => {
    if (!debouncedQuery) return approvals;
    return approvals.filter(
      (a) =>
        a.title.toLowerCase().includes(debouncedQuery) ||
        a.type.toLowerCase().includes(debouncedQuery),
    );
  }, [approvals, debouncedQuery]);

  // P0-8: 阻塞视图保持不变
  const blockedRows = useMemo(() => buildBlockedRows(filteredIssues), [filteredIssues]);

  // P0-7: SectionList 日期分段构建
  const allSections = useMemo(
    () => buildDateSections(filteredIssues, (i) => i.updatedAt ?? i.createdAt),
    [filteredIssues],
  );

  const mineSections = useMemo(
    () => buildDateSections(mineWorkItems, (item) => item.timestamp),
    [mineWorkItems],
  );

  const approvalSections = useMemo(
    () => buildDateSections(filteredApprovals, (a) => a.createdAt),
    [filteredApprovals],
  );

  // P0-6 & P0-9: 归档与 5 秒撤销
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

  const openMention = useCallback(
    (item: InboxMentionItem) => {
      const known = issueById.get(item.issueId);
      if (known) {
        onOpenIssue(known);
        return;
      }
      onOpenIssue({
        id: item.issueId,
        title: item.issueTitle,
        status: "todo",
        priority: "medium",
        companyId: company.id,
      } as Issue);
    },
    [issueById, onOpenIssue, company.id],
  );

  const activeFilterCount = countActiveFilters(filters);
  const showBlocked = tab === "blocked";
  const isBlockedViewBlocked = showBlocked && blockedRows.length === 0;

  const currentUnreadCount = useMemo(() => {
    const list = tab === "mine" ? mineIssues : activeIssues;
    return list.filter((i) => !archivedIds.has(i.id) && getIsUnread(i)).length;
  }, [tab, mineIssues, activeIssues, archivedIds, getIsUnread]);

  // 审批卡片渲染辅助
  const renderApprovalItem = (item: InboxApprovalItem) => {
    const isOpen = expandedApprovalId === item.id;
    return (
      <View key={item.id}>
        <AppCard
          variant="surface"
          row
          style={styles.approvalRow}
          onPress={() => setExpandedApprovalId(isOpen ? null : item.id)}
        >
          <View style={[styles.rowDot, { backgroundColor: C.warn }]} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.rowTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.metaText} numberOfLines={1}>
              {item.type} · {formatRelativeTime(item.createdAt)}
            </Text>
          </View>
          <Text style={styles.chevron}>{isOpen ? "▾" : "›"}</Text>
        </AppCard>
        {isOpen ? (
          <View style={styles.approvalDetail}>
            <QuickApprovalCard
              companyId={company.id}
              approval={item as unknown as Approval}
              floating={false}
              onResolved={(approvalId, decision) => {
                void onResolved?.(approvalId, decision);
                setExpandedApprovalId(null);
                setApprovals((prev) => prev.filter((a) => a.id !== approvalId));
              }}
              onDismiss={() => setExpandedApprovalId(null)}
            />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { paddingTop: Platform.OS === "android" ? RNStatusBar.currentHeight ?? 24 : 0 },
      ]}
    >
      <StatusBar style="light" />

      {/* 顶栏 */}
      <View style={styles.header}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            style={{ marginRight: 10, paddingVertical: 4 }}
            accessibilityLabel="返回"
          >
            <Ionicons name="chevron-back" size={24} color={C.ink} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>收件箱</Text>
          <View style={styles.capsule}>
            <StatusDot status="ok" size={6} />
            <Text style={styles.capsuleText} numberOfLines={1}>
              {company.name}
            </Text>
            <Text style={styles.capsuleSub}>
              · 任务 {activeIssues.length} · 待办 {mineWorkItems.length} · 未读 {currentUnreadCount}
            </Text>
          </View>
        </View>
        {onOpenSettings ? (
          <Pressable onPress={onOpenSettings} hitSlop={12} accessibilityLabel="设置">
            <Ionicons name="settings-outline" size={20} color={C.ink3} />
          </Pressable>
        ) : null}
      </View>

      {/* 四大 Tab */}
      <SegmentedControl
        style={styles.tabs}
        value={tab}
        onChange={(key) => setTab(key as InboxTab)}
        options={[
          { key: "all", label: "全部" },
          { key: "mine", label: `与我 (${mineWorkItems.length})` },
          { key: "approvals", label: `审批 (${approvals.length})` },
          { key: "blocked", label: `阻塞 (${blockedRows.length})` },
        ]}
      />

      {/* P0-5: 内嵌即时搜索框 */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={14} color={C.ink3} style={styles.searchIcon} />
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
          <Pressable onPress={() => setSearchQuery("")} hitSlop={8} style={styles.searchClear}>
            <Ionicons name="close-circle" size={14} color={C.ink3} />
          </Pressable>
        ) : null}
      </View>

      {/* 工具栏: 过滤 / 全读 / 刷新 */}
      <View style={styles.toolbar}>
        <Pressable
          onPress={() => setFiltersOpen(true)}
          style={[styles.toolBtn, activeFilterCount > 0 && styles.toolBtnActive]}
          accessibilityLabel="过滤"
        >
          <Ionicons name="filter-outline" size={14} color={activeFilterCount > 0 ? C.ink : C.ink3} />
          <Text style={[styles.toolBtnText, activeFilterCount > 0 && styles.toolBtnTextActive]}>
            过滤{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Text>
        </Pressable>

        {/* P0-4 & 9: 一键全标已读按钮 */}
        <Pressable
          onPress={() => setMarkAllConfirmOpen(true)}
          style={styles.toolBtn}
          accessibilityLabel="全部标为已读"
        >
          <Ionicons
            name="checkmark-done-outline"
            size={14}
            color={currentUnreadCount > 0 ? C.accent : C.ink3}
          />
          <Text style={[styles.toolBtnText, currentUnreadCount > 0 && styles.toolBtnTextActive]}>
            全读
          </Text>
        </Pressable>

        {showBlocked ? (
          <>
            <Pressable onPress={() => cycleBlockedGroup(blockedGroupBy, setBlockedGroupBy)} style={styles.toolBtn}>
              <Ionicons name="layers-outline" size={14} color={C.ink3} />
              <Text style={styles.toolBtnText}>{labelOf(BLOCKED_GROUP_OPTIONS, blockedGroupBy)}</Text>
            </Pressable>
            <Pressable onPress={() => cycleBlockedSort(blockedSortBy, setBlockedSortBy)} style={styles.toolBtn}>
              <Ionicons name="swap-vertical-outline" size={14} color={C.ink3} />
              <Text style={styles.toolBtnText}>{labelOf(BLOCKED_SORT_OPTIONS, blockedSortBy)}</Text>
            </Pressable>
          </>
        ) : null}

        <View style={{ flex: 1 }} />
        <Pressable onPress={() => void load(true)} hitSlop={8} accessibilityLabel="刷新收件箱">
          {loading ? (
            <ActivityIndicator size="small" color={C.accent} />
          ) : (
            <Ionicons name="refresh" size={16} color={C.ink3} />
          )}
        </Pressable>
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

          {/* Tab 1: 全部 */}
          {tab === "all" ? (
            <SectionList<Issue, DateSection<Issue>>
              sections={allSections}
              keyExtractor={(item) => item.id}
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
              renderItem={({ item: issue }) => (
                <SwipeToArchive key={issue.id} onArchive={() => void archive(issue)}>
                  <InboxIssueRow
                    issue={issue}
                    isUnread={getIsUnread(issue)}
                    onToggleRead={() => void toggleRead(issue)}
                    assigneeName={
                      issue.assigneeAgentId ? agentNameById.get(issue.assigneeAgentId) ?? "员工" : null
                    }
                    projectName={issue.projectId ? projectNameById.get(issue.projectId) ?? null : null}
                    onPress={() => onOpenIssue(issue)}
                    onLongPress={() => setActionIssue(issue)}
                  />
                </SwipeToArchive>
              )}
              ListEmptyComponent={
                <EmptyState
                  icon="📥"
                  title={activeFilterCount > 0 || debouncedQuery ? "没有匹配的任务" : "收件箱已清空"}
                  subtitle={activeFilterCount > 0 || debouncedQuery ? "换个过滤或搜索条件试试。" : "当前没有可处理的任务。"}
                  style={styles.emptyBox}
                />
              }
            />
          ) : null}

          {/* Tab 2: 与我相关 (P0-1 重做) */}
          {tab === "mine" ? (
            <SectionList<MobileInboxWorkItem, DateSection<MobileInboxWorkItem>>
              sections={mineSections}
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
                        onPress={() => onOpenIssue(issue)}
                        onLongPress={() => setActionIssue(issue)}
                      />
                    </SwipeToArchive>
                  );
                }
                if (item.kind === "approval") {
                  return renderApprovalItem(item.approval);
                }
                if (item.kind === "failed_run") {
                  return (
                    <FailedRunRow
                      key={item.id}
                      run={item.run}
                      onPress={() => {
                        const known = issueById.get(item.run.id);
                        if (known) onOpenIssue(known);
                        else onOpenWorkshop?.();
                      }}
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
                  icon="🎯"
                  title={debouncedQuery ? "没有匹配的项目" : "当前没有与你相关的待办"}
                  subtitle={debouncedQuery ? "换个关键词搜索试试。" : "所有分配给你的任务、审批与提醒都会在此汇聚。"}
                  style={styles.emptyBox}
                />
              }
            />
          ) : null}

          {/* Tab 3: 审批 */}
          {tab === "approvals" ? (
            <SectionList<InboxApprovalItem, DateSection<InboxApprovalItem>>
              sections={approvalSections}
              keyExtractor={(item) => item.id}
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
              renderItem={({ item }) => renderApprovalItem(item)}
              ListEmptyComponent={
                <EmptyState
                  icon="✅"
                  title="没有待审批"
                  subtitle="需要你拍板的审批会出现在这里。"
                  style={styles.emptyBox}
                />
              }
            />
          ) : null}

          {/* Tab 4: 阻塞 (P0-8 不改) */}
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
                      onPress={() => onOpenIssue(row.issue)}
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
                        onPress={() => onOpenIssue(row.issue)}
                        onLongPress={() => setActionIssue(row.issue)}
                      />
                    ))}
                  </View>
                ))
              )}
            </ScrollView>
          ) : null}
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
        onClose={() => setFiltersOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setFiltersOpen(false);
        }}
      />

      {/* P0-4 & 9: 全部标为已读确认弹层 */}
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
                if (issue) onOpenIssue(issue);
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

/** P0-7: 日期段落头部 (TODAY / YESTERDAY / EARLIER 带灰线) */
function DateSectionHeader({ title }: { title: DateSectionTitle }) {
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

/** P0-2 & 3: 工单行包含 8x8 未读蓝点 */
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
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
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
        <Text style={[styles.rowTitle, cancelled && styles.rowTitleCancelled]} numberOfLines={2}>
          {issue.title}
        </Text>
        {description ? (
          <Text style={styles.rowDesc} numberOfLines={1}>
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
          <Text style={styles.metaText} numberOfLines={1}>
            {assigneeName ?? "未指派"}
          </Text>
          {projectName ? (
            <Text style={styles.metaText} numberOfLines={1}>
              · {projectName}
            </Text>
          ) : null}
          <View style={{ flex: 1 }} />
          <Text style={styles.metaTime}>{formatRelativeShort(issue.updatedAt ?? issue.createdAt)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** 失败/异常 Run 行 */
function FailedRunRow({
  run,
  onPress,
}: {
  run: InboxFailureItem;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={run.title}
    >
      <View style={styles.unreadSlot}>
        <View style={[styles.unreadDot, { backgroundColor: C.err }]} />
      </View>
      <View style={[styles.glyph, { borderColor: C.err, backgroundColor: "rgba(239, 68, 68, 0.15)" }]}>
        <Ionicons name="alert" size={10} color={C.err} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {run.title} (受阻/失败)
        </Text>
        <View style={styles.metaRow}>
          <Pill label={run.status} tone="err" size="sm" mono />
          <Pill label={run.priority} tone="warn" size="sm" mono />
          <View style={{ flex: 1 }} />
          <Text style={styles.metaTime}>{formatRelativeTime(run.updatedAt)}</Text>
        </View>
      </View>
    </Pressable>
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
  onClose,
  onApply,
}: {
  visible: boolean;
  filters: InboxFilters;
  agents: Agent[];
  projects: Project[];
  onClose: () => void;
  onApply: (next: InboxFilters) => void;
}) {
  const [draft, setDraft] = useState<InboxFilters>(filters);

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.filterSheet} onPress={() => {}}>
          <View style={styles.filterHeader}>
            <Text style={styles.filterTitle}>过滤收件箱</Text>
            <Pressable onPress={() => setDraft(DEFAULT_FILTERS)} hitSlop={8}>
              <Text style={styles.filterReset}>重置</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.filterBody} keyboardShouldPersistTaps="handled">
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

          <Pressable style={styles.filterApply} onPress={() => onApply(draft)}>
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
  header: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 },
  h1: { color: C.ink, fontSize: 22, fontWeight: "600", marginBottom: 8, letterSpacing: -0.4 },
  capsule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.surface,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  capsuleText: { color: C.ink2, fontSize: 12, maxWidth: 140 },
  capsuleSub: { color: C.ink3, fontSize: 12 },
  tabs: { marginHorizontal: 16 },

  // P0-5: 搜索栏
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    marginHorizontal: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.line,
    height: 36,
  },
  searchIcon: { marginLeft: 10 },
  searchInput: {
    flex: 1,
    color: C.ink,
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 0,
  },
  searchClear: { paddingRight: 10 },

  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
  },
  toolBtnActive: { borderColor: C.brand, backgroundColor: "rgba(94, 106, 210, 0.16)" },
  toolBtnText: { color: C.ink3, fontSize: 12, fontWeight: "500" },
  toolBtnTextActive: { color: C.ink },

  loader: { flex: 0, marginTop: 32, padding: 0 },
  errorCard: { marginTop: 16, backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 0 },
  list: { paddingHorizontal: 16, paddingBottom: 64, gap: 2 },
  emptyBox: { marginTop: 16, backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 0 },
  section: { gap: 6, marginBottom: 12 },
  sectionTitle: { color: C.ink3, fontSize: 13, fontWeight: "500", marginTop: 6, marginBottom: 2 },

  // P0-7: 日期段落头部 (带左右细灰线)
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
  rowTitleCancelled: { color: C.ink4, textDecorationLine: "line-through" },
  rowDesc: { color: C.ink3, fontSize: 12, lineHeight: 16, flexShrink: 1, paddingLeft: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  metaText: { color: C.ink4, fontSize: 11 },
  metaTime: { color: C.ink4, fontSize: 11, fontVariant: ["tabular-nums"] },
  blockedAction: { color: C.ink3, fontSize: 12, marginTop: 2 },
  chevron: { color: C.ink4, fontSize: 20 },
  approvalRow: { gap: 10, marginBottom: 4 },
  approvalDetail: { marginBottom: 12 },
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
