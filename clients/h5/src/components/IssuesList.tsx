/**
 * 任务列表 (IssuesList, h5) —— Coolie工坊 App 任务页的 Web 镜像。
 *
 * 与 expo 端 `clients/expo/src/components/IssuesList.tsx` 同一套行为:
 * 6 视图切换 (列表/看板/分列/漏斗/排序/分层), 列表视图按 TODAY / YESTERDAY /
 * EARLIER 分组, 每行是"状态圆圈 + 标题 + 相对时间"。
 *
 * 数据源: `coolie.listIssues(companyId)` → GET /api/companies/:id/issues
 * (h5 dev server 把 /api 代理到实例, 见 vite.config.ts)。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { Issue } from "@coolie/api-client";
import { coolie } from "../coolie";

const C = {
  bg: "#08090A",
  panel: "#0F1011",
  surface: "#191A1B",
  ink: "#F7F8F8",
  ink2: "#D0D6E0",
  ink3: "#8A8F98",
  ink4: "#62666D",
  accent: "#7170FF",
  brand: "#5E6AD2",
  ok: "#27A644",
  warn: "#F59E0B",
  err: "#EF4444",
  violet: "#8B5CF6",
  line: "rgba(255,255,255,0.08)",
  lineSubtle: "rgba(255,255,255,0.05)",
} as const;

export type IssuesViewMode = "list" | "board" | "columns" | "funnel" | "sort" | "layers";

const VIEWS: { key: IssuesViewMode; label: string; icon: string }[] = [
  { key: "list", label: "列表", icon: "☰" },
  { key: "board", label: "看板", icon: "▦" },
  { key: "columns", label: "分列", icon: "▤" },
  { key: "funnel", label: "漏斗", icon: "▽" },
  { key: "sort", label: "排序", icon: "⇅" },
  { key: "layers", label: "分层", icon: "≣" },
];

export const ISSUE_STATUS_ORDER = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
  "cancelled",
] as const;

export const ISSUE_STATUS_LABEL: Record<string, string> = {
  backlog: "待办池",
  todo: "待处理",
  in_progress: "进行中",
  in_review: "评审中",
  blocked: "受阻",
  done: "已完成",
  cancelled: "已取消",
};

export const ISSUE_STATUS_COLOR: Record<string, string> = {
  backlog: C.ink3,
  todo: C.warn,
  in_progress: C.accent,
  in_review: C.violet,
  done: C.ok,
  blocked: C.err,
  cancelled: C.ink4,
};

export const ISSUE_PRIORITIES = ["critical", "high", "medium", "low"] as const;

export const PRIORITY_LABEL: Record<string, string> = {
  critical: "紧急",
  high: "高",
  medium: "中",
  low: "低",
};

export const PRIORITY_COLOR: Record<string, string> = {
  critical: C.err,
  high: C.warn,
  medium: C.ink3,
  low: C.ink4,
};

type DateBucket = "TODAY" | "YESTERDAY" | "EARLIER";
const DATE_BUCKET_ORDER: DateBucket[] = ["TODAY", "YESTERDAY", "EARLIER"];
const DAY_MS = 24 * 60 * 60 * 1000;

function dateBucket(input: string | Date | undefined | null): DateBucket {
  if (!input) return "EARLIER";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "EARLIER";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = date.getTime();
  if (time >= startOfToday) return "TODAY";
  if (time >= startOfToday - DAY_MS) return "YESTERDAY";
  return "EARLIER";
}

export function formatRelativeShort(iso?: string | Date | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / DAY_MS)}d ago`;
}

function issueTimestamp(issue: Issue): string | Date | undefined {
  return issue.createdAt ?? issue.updatedAt;
}

export interface IssuesListProps {
  companyId: string;
  onIssuePress: (issue: Issue) => void;
  defaultView?: IssuesViewMode;
  search?: string;
  refreshSignal?: number;
  style?: CSSProperties;
}

export function IssuesList({
  companyId,
  onIssuePress,
  defaultView = "list",
  search = "",
  refreshSignal = 0,
  style,
}: IssuesListProps) {
  const [view, setView] = useState<IssuesViewMode>(defaultView);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setIssues(await coolie.listIssues(companyId, { limit: 200 }));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const needle = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      issues.filter(
        (issue) =>
          !needle ||
          issue.title.toLowerCase().includes(needle) ||
          (issue.identifier ?? "").toLowerCase().includes(needle),
      ),
    [issues, needle],
  );

  const dateGroups = useMemo(() => {
    const groups = new Map<DateBucket, Issue[]>();
    for (const issue of filtered) {
      const bucket = dateBucket(issueTimestamp(issue));
      const list = groups.get(bucket);
      if (list) list.push(issue);
      else groups.set(bucket, [issue]);
    }
    return DATE_BUCKET_ORDER.filter((bucket) => groups.has(bucket)).map((bucket) => ({
      key: bucket,
      label: bucket,
      items: groups.get(bucket)!,
    }));
  }, [filtered]);

  const statusGroups = useMemo(
    () =>
      ISSUE_STATUS_ORDER.filter((status) => filtered.some((i) => i.status === status)).map((status) => ({
        key: status,
        label: ISSUE_STATUS_LABEL[status],
        color: ISSUE_STATUS_COLOR[status],
        items: filtered.filter((i) => i.status === status),
      })),
    [filtered],
  );

  const priorityGroups = useMemo(
    () =>
      ISSUE_PRIORITIES.filter((priority) => filtered.some((i) => i.priority === priority)).map((priority) => ({
        key: priority,
        label: PRIORITY_LABEL[priority],
        color: PRIORITY_COLOR[priority],
        items: filtered.filter((i) => i.priority === priority),
      })),
    [filtered],
  );

  const assigneeGroups = useMemo(() => {
    const groups = new Map<string, Issue[]>();
    for (const issue of filtered) {
      const key = issue.assigneeAgentId ?? "__unassigned";
      const list = groups.get(key);
      if (list) list.push(issue);
      else groups.set(key, [issue]);
    }
    const rows = [...groups.entries()]
      .filter(([key]) => key !== "__unassigned")
      .map(([key, items]) => ({ key, label: `员工 ${key.slice(0, 6)}`, items }));
    const unassigned = groups.get("__unassigned");
    if (unassigned) rows.push({ key: "__unassigned", label: "未指派", items: unassigned });
    return rows;
  }, [filtered]);

  const sorted = useMemo(
    () =>
      [...filtered].sort(
        (a, b) =>
          new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() -
          new Date(a.updatedAt ?? a.createdAt ?? 0).getTime(),
      ),
    [filtered],
  );

  return (
    <div style={{ ...styles.wrap, ...style }}>
      <div style={styles.switcherRow}>
        <div style={styles.switcher}>
          {VIEWS.map((option) => {
            const active = option.key === view;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                style={{ ...styles.viewChip, ...(active ? styles.viewChipActive : null) }}
                onClick={() => setView(option.key)}
              >
                <span aria-hidden style={styles.viewIcon}>{option.icon}</span>
                <span style={{ ...styles.viewChipText, ...(active ? styles.viewChipTextActive : null) }}>
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" style={styles.refresh} onClick={() => void load()} aria-label="刷新任务">
          {loading ? "…" : "⟳"}
        </button>
      </div>

      {error ? (
        <div style={styles.errorBox}>
          <span>任务加载失败: {error}</span>
          <button type="button" style={styles.retryBtn} onClick={() => void load()}>
            重试
          </button>
        </div>
      ) : loading && issues.length === 0 ? (
        <div style={styles.empty}>正在加载任务…</div>
      ) : filtered.length === 0 ? (
        <div style={styles.empty}>{needle ? "没有匹配的任务" : "还没有任务 —— 点 [+ 新建任务] 创建第一个。"}</div>
      ) : view === "board" ? (
        <BoardView issues={filtered} onIssuePress={onIssuePress} />
      ) : view === "list" ? (
        <GroupedView groups={dateGroups} onIssuePress={onIssuePress} separator />
      ) : view === "columns" ? (
        <GroupedView groups={statusGroups} onIssuePress={onIssuePress} showDot />
      ) : view === "funnel" ? (
        <FunnelView groups={priorityGroups} total={filtered.length} onIssuePress={onIssuePress} />
      ) : view === "sort" ? (
        <GroupedView groups={[{ key: "__sorted", label: "按更新时间", items: sorted }]} onIssuePress={onIssuePress} />
      ) : (
        <GroupedView groups={assigneeGroups} onIssuePress={onIssuePress} />
      )}
    </div>
  );
}

function Row({ issue, onIssuePress }: { issue: Issue; onIssuePress: (issue: Issue) => void }) {
  const color = ISSUE_STATUS_COLOR[issue.status] ?? C.ink3;
  const done = issue.status === "done";
  const cancelled = issue.status === "cancelled";
  const time = formatRelativeShort(issueTimestamp(issue));
  return (
    <button type="button" style={styles.row} onClick={() => onIssuePress(issue)}>
      <span
        aria-hidden
        style={{
          ...styles.glyph,
          borderColor: cancelled ? C.ink4 : color,
          background: done ? color : "transparent",
        }}
      >
        {done ? "✓" : ""}
      </span>
      <span style={{ ...styles.title, ...(cancelled ? styles.titleCancelled : null) }}>{issue.title}</span>
      <span style={styles.time}>{time}</span>
    </button>
  );
}

function GroupedView({
  groups,
  onIssuePress,
  separator = false,
  showDot = false,
}: {
  groups: { key: string; label: string; color?: string; items: Issue[] }[];
  onIssuePress: (issue: Issue) => void;
  separator?: boolean;
  showDot?: boolean;
}) {
  return (
    <div>
      {groups.map((group) => (
        <div key={group.key}>
          {separator ? (
            <div style={styles.separator}>
              <span style={styles.separatorRule} />
              <span style={styles.separatorLabel}>{group.label}</span>
              <span style={styles.separatorRule} />
            </div>
          ) : (
            <div style={styles.groupHeader}>
              {showDot ? <span style={{ ...styles.dot, background: group.color ?? C.ink3 }} /> : null}
              <span style={styles.groupHeaderText}>{group.label}</span>
              <span style={styles.groupCount}>{group.items.length}</span>
            </div>
          )}
          {group.items.map((issue) => (
            <Row key={issue.id} issue={issue} onIssuePress={onIssuePress} />
          ))}
        </div>
      ))}
    </div>
  );
}

function FunnelView({
  groups,
  total,
  onIssuePress,
}: {
  groups: { key: string; label: string; color: string; items: Issue[] }[];
  total: number;
  onIssuePress: (issue: Issue) => void;
}) {
  return (
    <div style={styles.funnel}>
      {groups.map((group) => (
        <div key={group.key} style={styles.funnelCard}>
          <div style={styles.groupHeader}>
            <span style={{ ...styles.dot, background: group.color }} />
            <span style={styles.groupHeaderText}>{group.label}</span>
            <span style={styles.groupCount}>
              {group.items.length} / {total}
            </span>
          </div>
          <div style={styles.funnelTrack}>
            <div
              style={{
                ...styles.funnelFill,
                background: group.color,
                width: `${(group.items.length / total) * 100}%`,
              }}
            />
          </div>
          {group.items.map((issue) => (
            <Row key={issue.id} issue={issue} onIssuePress={onIssuePress} />
          ))}
        </div>
      ))}
    </div>
  );
}

function BoardView({
  issues,
  onIssuePress,
}: {
  issues: Issue[];
  onIssuePress: (issue: Issue) => void;
}) {
  return (
    <div style={styles.board}>
      {ISSUE_STATUS_ORDER.map((status) => {
        const items = issues.filter((issue) => issue.status === status);
        if (items.length === 0) return null;
        return (
          <div key={status} style={styles.boardColumn}>
            <div style={styles.groupHeader}>
              <span style={{ ...styles.dot, background: ISSUE_STATUS_COLOR[status] }} />
              <span style={styles.groupHeaderText}>{ISSUE_STATUS_LABEL[status]}</span>
              <span style={styles.groupCount}>{items.length}</span>
            </div>
            {items.map((issue) => (
              <button
                key={issue.id}
                type="button"
                style={styles.boardCard}
                onClick={() => onIssuePress(issue)}
              >
                <span style={styles.boardCardTitle}>{issue.title}</span>
                <span style={styles.boardCardMeta}>
                  <span style={{ ...styles.dot, background: PRIORITY_COLOR[issue.priority] }} />
                  <span style={styles.boardCardPriority}>{PRIORITY_LABEL[issue.priority]}</span>
                </span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 8 },
  switcherRow: { display: "flex", alignItems: "center", gap: 8 },
  switcher: { display: "flex", gap: 6, flexWrap: "wrap", flex: 1 },
  viewChip: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "6px 10px",
    borderRadius: 8,
    border: `1px solid ${C.line}`,
    background: "rgba(255,255,255,0.02)",
    cursor: "pointer",
    color: C.ink3,
  },
  viewChipActive: { borderColor: C.brand, background: "rgba(94,106,210,0.16)" },
  viewIcon: { fontSize: 11, color: "inherit" },
  viewChipText: { color: C.ink3, fontSize: 12, fontWeight: 500 },
  viewChipTextActive: { color: C.ink },
  refresh: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: `1px solid ${C.line}`,
    background: "rgba(255,255,255,0.02)",
    color: C.ink3,
    cursor: "pointer",
  },
  errorBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid rgba(239,68,68,0.25)",
    background: "rgba(239,68,68,0.1)",
    color: C.err,
    fontSize: 12,
  },
  retryBtn: {
    padding: "3px 10px",
    borderRadius: 6,
    border: "none",
    background: "rgba(239,68,68,0.2)",
    color: C.err,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  },
  empty: { padding: "28px 0", textAlign: "center", color: C.ink4, fontSize: 13 },
  separator: { display: "flex", alignItems: "center", gap: 12, padding: "8px 0" },
  separatorRule: { flex: 1, height: 1, background: C.line },
  separatorLabel: { color: C.ink4, fontSize: 10, fontWeight: 600, letterSpacing: 1 },
  groupHeader: { display: "flex", alignItems: "center", gap: 6, padding: "8px 4px" },
  groupHeaderText: { color: C.ink2, fontSize: 12, fontWeight: 600, flex: 1 },
  groupCount: { color: C.ink4, fontSize: 11, fontVariantNumeric: "tabular-nums" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "11px 12px",
    borderRadius: 8,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
  },
  glyph: {
    width: 16,
    height: 16,
    borderRadius: 999,
    border: "1.5px solid",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10,
    color: C.bg,
    flex: "0 0 auto",
  },
  title: { flex: 1, color: C.ink, fontSize: 14, lineHeight: "19px" },
  titleCancelled: { color: C.ink4, textDecoration: "line-through" },
  time: { color: C.ink4, fontSize: 12, fontVariantNumeric: "tabular-nums" },
  funnel: { display: "flex", flexDirection: "column", gap: 12 },
  funnelCard: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    border: `1px solid ${C.line}`,
    borderRadius: 12,
    background: "rgba(255,255,255,0.02)",
    padding: 8,
  },
  funnelTrack: { height: 4, borderRadius: 999, background: "rgba(255,255,255,0.04)", overflow: "hidden", margin: "0 4px" },
  funnelFill: { height: 4, borderRadius: 999 },
  board: { display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12 },
  boardColumn: { width: 180, flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 8 },
  boardCard: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    border: `1px solid ${C.line}`,
    background: C.surface,
    cursor: "pointer",
    textAlign: "left",
  },
  boardCardTitle: { color: C.ink, fontSize: 13, lineHeight: "18px" },
  boardCardMeta: { display: "flex", alignItems: "center", gap: 5 },
  boardCardPriority: { color: C.ink4, fontSize: 11 },
};
