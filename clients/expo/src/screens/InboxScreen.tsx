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
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import type { Agent, Issue, Project } from "@coolie/api-client";
import { C, coolie, type InboxApprovalItem, type InboxMentionItem } from "../coolie";
import { StatusDot } from "../components/StatusDot";
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

type InboxTab = "all" | "mine" | "approvals" | "blocked";
type DateRange = "all" | "today" | "7d" | "30d";

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

/**
 * 收件箱 —— `Coolie Web Inbox` (`ui/src/pages/Inbox.tsx`) 的 RN 适配版。
 *
 * 与 Web 同源的信息架构 (不逐字拷 React-DOM JSX, RN 跑不了):
 * - 4 个 tab: 全部 / @我 / 审批 / 阻塞 (对应 Web 的 all / mine-mentions / approvals / blocked)
 * - 过滤弹层: 状态 / 优先级 / 负责人 / 项目 / 时间范围 (语义抄 `ui/src/lib/issue-filters.ts`)
 * - 富信息行: 状态圈 + 标题 + 描述 + 状态徽章 + 优先级 + 负责人 + 相对时间
 * - 阻塞视图: 分组 (阻塞类型) + 排序 (最紧急/最近/停滞最久) + reason 文案
 *   (纯函数移植 `ui/src/lib/blockedInbox.ts`)
 * - 快捷动作: 打开 / 归档 / 派活 / 去工坊 (左滑或长按)
 *
 * 归档打的是 Web 同款端点 `POST /issues/:id/inbox-archive` (per-user 收件箱状态, 不删任务);
 * 数据源: `listIssues` (任务) + `getInbox` (待审批/@我) + `listAgents` + `listProjects`。
 */
export function InboxScreen({
  company,
  onOpenIssue,
  onOpenApproval,
  onOpenSettings,
  onOpenWorkshop,
}: {
  company: { id: string; name: string };
  onOpenIssue: (issue: Issue) => void;
  onOpenApproval: (approvalId: string) => void;
  onOpenSettings?: () => void;
  onOpenWorkshop?: () => void;
}) {
  const [tab, setTab] = useState<InboxTab>("all");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [mentions, setMentions] = useState<InboxMentionItem[]>([]);
  const [approvals, setApprovals] = useState<InboxApprovalItem[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [filters, setFilters] = useState<InboxFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [blockedGroupBy, setBlockedGroupBy] = useState<BlockedInboxGroupBy>("blocker_type");
  const [blockedSortBy, setBlockedSortBy] = useState<BlockedInboxSort>("urgency");
  const [actionIssue, setActionIssue] = useState<Issue | null>(null);
  const [assignIssue, setAssignIssue] = useState<Issue | null>(null);
  // wave65 — 防止旧公司/旧 tab 的请求回调 setState 覆盖新数据
  const loadReqIdRef = useRef(0);

  // wave65 — 重试 / 旧公司 / 竞态守卫
  // 收件箱反反复复真因之一: tab/公司切换瞬间旧请求 setState 覆盖新数据。
  // 解决: reqId 自增, 只接受最新一次请求的返回值; 失败自动退避重试。
  // wave69 — 补客户端 state 修正:
  //   1) 失败时不清空 issues/mentions/approvals, 保留旧值配合错误提示,
  //      而不是闪一下变空让用户以为被清了;
  //   2) 前后台切换 (AppState) 触发一次 silent refresh,
  //      修复"切回 app 收件箱不更新"的常见反反复复场景;
  //   3) AbortController: tab 切换/公司切换时取消老请求, 避免 Promise
  //      解析后 setState 已卸载组件的 React 警告。
  const abortRef = useRef<AbortController | null>(null);
  const load = useCallback(
    async (silent = false) => {
      // 取消进行中的旧请求, 避免 Promise 还在挂起时组件已切走
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
          const [nextIssues, feed, nextAgents, nextProjects] = await Promise.all([
            coolie.listIssues(company.id, { limit: 200 }),
            coolie.getInbox(company.id),
            coolie.listAgents(company.id).catch(() => [] as Agent[]),
            coolie.listProjects(company.id).catch(() => [] as Project[]),
          ]);
          if (controller.signal.aborted) return;
          // 旧请求/旧公司 — 直接丢弃返回值
          if (loadReqIdRef.current !== reqId) return;
          setIssues(nextIssues);
          setMentions(feed.mentionedBy);
          setApprovals(feed.pendingApprovals);
          setAgents(nextAgents);
          setProjects(nextProjects);
          setError(null);
          break;
        } catch (e) {
          if (controller.signal.aborted || loadReqIdRef.current !== reqId) return;
          const msg = String((e as Error)?.message ?? e);
          if (attempt < maxRetries) {
            // 退避重试: 600ms / 1200ms
            await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
            continue;
          }
          // wave69 — 失败只更新 error, 不清空已有数据.
          // 保留旧 issues/mentions 配合上方的 ErrorRetry/空态分支,
          // 避免闪一下变空让用户以为数据被清掉了。
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

  // wave69 — 后台切回时静默重拉, 修"切回 app 收件箱不更新"反反复复场景。
  // wave70 — 加 5 min 静默 refresh, 避免长时挂起收件箱数据陈旧; 同时在
  //   mount/unmount 处 abort 进行中的请求, 防止 setState 已卸载组件警告。
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
    return map;
  }, [issues]);

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
    return result;
  }, [activeIssues, filters]);

  const blockedRows = useMemo(() => buildBlockedRows(filteredIssues), [filteredIssues]);

  const archive = useCallback(
    async (issue: Issue) => {
      setActionIssue(null);
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
    },
    [],
  );

  const assign = useCallback(
    async (issue: Issue, assigneeAgentId: string | null) => {
      setAssignIssue(null);
      const previous = issue.assigneeAgentId ?? null;
      setIssues((prev) =>
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

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { paddingTop: Platform.OS === "android" ? RNStatusBar.currentHeight ?? 24 : 0 },
      ]}
    >
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>收件箱</Text>
          <View style={styles.capsule}>
            <StatusDot status="ok" size={6} />
            <Text style={styles.capsuleText} numberOfLines={1}>
              {company.name}
            </Text>
            <Text style={styles.capsuleSub}>
              · 任务 {activeIssues.length} · 审批 {approvals.length} · @我 {mentions.length}
            </Text>
          </View>
        </View>
        {onOpenSettings ? (
          <Pressable onPress={onOpenSettings} hitSlop={12} accessibilityLabel="设置">
            <Ionicons name="settings-outline" size={20} color={C.ink3} />
          </Pressable>
        ) : null}
      </View>

      <SegmentedControl
        style={styles.tabs}
        value={tab}
        onChange={(key) => setTab(key as InboxTab)}
        options={[
          { key: "all", label: "全部" },
          { key: "mine", label: `@我 (${mentions.length})` },
          { key: "approvals", label: `审批 (${approvals.length})` },
          { key: "blocked", label: `阻塞 (${blockedRows.length})` },
        ]}
      />

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
          {error ? (
            <ErrorRetry variant="inline" message={`刷新失败: ${error}`} onRetry={() => void load(true)} />
          ) : null}

          {tab === "all" ? (
            filteredIssues.length === 0 ? (
              <EmptyState
                icon="📥"
                title={activeFilterCount > 0 ? "没有匹配的任务" : "收件箱已清空"}
                subtitle={activeFilterCount > 0 ? "换个过滤条件，或清空过滤。" : "当前没有可处理的任务。"}
                style={styles.emptyBox}
              />
            ) : (
              filteredIssues.map((issue) => (
                <SwipeToArchive key={issue.id} onArchive={() => void archive(issue)}>
                  <InboxIssueRow
                    issue={issue}
                    assigneeName={
                      issue.assigneeAgentId ? agentNameById.get(issue.assigneeAgentId) ?? "员工" : null
                    }
                    projectName={issue.projectId ? projectNameById.get(issue.projectId) ?? null : null}
                    onPress={() => onOpenIssue(issue)}
                    onLongPress={() => setActionIssue(issue)}
                  />
                </SwipeToArchive>
              ))
            )
          ) : null}

          {tab === "mine" ? (
            mentions.length === 0 ? (
              <EmptyState
                icon="📣"
                title="没有 @你的消息"
                subtitle="同事在任务评论里 @你时，会出现在这里。"
                style={styles.emptyBox}
              />
            ) : (
              mentions.map((item) => (
                <AppCard
                  key={item.id}
                  variant="surface"
                  style={styles.mentionCard}
                  onPress={() => openMention(item)}
                >
                  <View style={styles.mentionHeader}>
                    <Text style={styles.mentionAuthor} numberOfLines={1}>
                      {item.authorName}
                    </Text>
                    <Text style={styles.metaTime}>{formatRelativeTime(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.issueTitle}
                  </Text>
                  <Text style={styles.mentionBody} numberOfLines={2}>
                    {item.body}
                  </Text>
                </AppCard>
              ))
            )
          ) : null}

          {tab === "approvals" ? (
            approvals.length === 0 ? (
              <EmptyState
                icon="✅"
                title="没有待审批"
                subtitle="需要你拍板的审批会出现在这里。"
                style={styles.emptyBox}
              />
            ) : (
              approvals.map((item) => (
                <AppCard
                  key={item.id}
                  variant="surface"
                  row
                  style={styles.approvalRow}
                  onPress={() => onOpenApproval(item.id)}
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
                  <Text style={styles.chevron}>›</Text>
                </AppCard>
              ))
            )
          ) : null}

          {tab === "blocked" ? (
            isBlockedViewBlocked ? (
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
            )
          ) : null}
        </ScrollView>
      )}

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText} numberOfLines={2}>
            {toast}
          </Text>
        </View>
      ) : null}

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

function InboxIssueRow({
  issue,
  assigneeName,
  projectName,
  onPress,
  onLongPress,
}: {
  issue: Issue;
  assigneeName: string | null;
  projectName: string | null;
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

/** 左滑归档 —— Web `SwipeToArchive` 的 RN 版 (无 gesture-handler 依赖, 用 PanResponder) */
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
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 2 },
  emptyBox: { marginTop: 8, backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 0 },
  section: { gap: 6, marginBottom: 12 },
  sectionTitle: { color: C.ink3, fontSize: 13, fontWeight: "500", marginTop: 6, marginBottom: 2 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
    paddingVertical: 11,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  rowPressed: { backgroundColor: ELEVATION.hover },
  rowBody: { flex: 1, gap: 4 },
  rowDot: { width: 8, height: 8, borderRadius: 4 },
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
  rowDesc: { color: C.ink3, fontSize: 12, lineHeight: 16 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  metaText: { color: C.ink4, fontSize: 11 },
  metaTime: { color: C.ink4, fontSize: 11, fontVariant: ["tabular-nums"] },
  blockedAction: { color: C.ink3, fontSize: 12, marginTop: 2 },
  chevron: { color: C.ink4, fontSize: 20 },
  approvalRow: { gap: 10, marginBottom: 8 },
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
