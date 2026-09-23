/**
 * 看额度 (DashboardScreen, h5) —— wave63 精简: 与 expo `DashboardScreen`
 * + web Dashboard.tsx 同款 4 张核心指标 (员工/任务/花费/审批) + 各公司月度预算水位
 *
 * 数据源 (与 expo `DashboardScreen` 同一后端):
 * - `coolie.listCompanies()`          → GET /api/companies
 * - `coolie.getDashboard(companyId)`  → GET /api/companies/:id/dashboard
 *
 * 鉴权: h5 dev server 把 `/api` 代理到实例 (见 vite.config.ts), board 会话
 * cookie 随请求带上。未登录 / agent key 无权限时, 接口返回 401/403 —— 本屏
 * 如实报错并给 [重试], 不静默吞成空列表 (空列表 ≠ 没权限)。
 */

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Company, DashboardSummary } from "@coolie/api-client";
import { coolie } from "../coolie";

const C = {
  bg: "#08090A",
  panel: "#0F1011",
  ink: "#F7F8F8",
  ink2: "#D0D6E0",
  ink3: "#8A8F98",
  ink4: "#62666D",
  accent: "#7170FF",
  brand: "#5E6AD2",
  warn: "#F59E0B",
  bad: "#EF4444",
  line: "rgba(255,255,255,0.08)",
  lineSubtle: "rgba(255,255,255,0.05)",
} as const;

/** 分 → 美元展示 (取整到 2 位) */
function formatCents(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(0)}%`;
}

interface CompanyQuota {
  company: Company;
  dashboard: DashboardSummary | null;
  error: string | null;
}

export interface DashboardScreenProps {
  /** 页面标题右侧的附加动作 (由 App 注入, 可选) */
  style?: CSSProperties;
}

export function DashboardScreen({ style }: DashboardScreenProps) {
  const [rows, setRows] = useState<CompanyQuota[]>([]);
  const [loading, setLoading] = useState(true);
  const [topError, setTopError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setTopError(null);
    try {
      const companies = await coolie.listCompanies();
      const settled = await Promise.all(
        companies.map(async (company): Promise<CompanyQuota> => {
          try {
            const dashboard = await coolie.getDashboard(company.id);
            return { company, dashboard, error: null };
          } catch (e) {
            return { company, dashboard: null, error: String((e as Error)?.message ?? e) };
          }
        }),
      );
      setRows(settled);
    } catch (e) {
      // 拿不到公司列表 (多为 401/403) —— 报错而不是显示空
      setRows([]);
      setTopError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 汇总: 所有公司本月支出合计
  const totals = rows.reduce(
    (acc, r) => {
      const cost = r.dashboard?.costs;
      if (!cost) return acc;
      acc.spend += cost.monthSpendCents ?? 0;
      acc.budget += cost.monthBudgetCents ?? 0;
      return acc;
    },
    { spend: 0, budget: 0 },
  );

  const utilization = totals.budget > 0 ? (totals.spend / totals.budget) * 100 : 0;

  return (
    <div style={{ ...styles.screen, ...style }}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>仪表盘</div>
          <div style={styles.subtitle}>核心统计 · 各公司本月支出</div>
        </div>
        <button type="button" style={styles.refreshBtn} onClick={() => void load()} disabled={loading}>
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      <div style={styles.body}>
        {topError ? (
          <div style={styles.errorBox}>
            <div style={styles.errorTitle}>无法读取公司额度</div>
            <div style={styles.errorMsg}>{topError}</div>
            <button type="button" style={styles.retryBtn} onClick={() => void load()}>
              重试
            </button>
          </div>
        ) : null}

        {loading && rows.length === 0 && !topError ? (
          <div style={styles.hint}>正在读取额度…</div>
        ) : null}

        {!loading && !topError && rows.length === 0 ? (
          <div style={styles.hint}>当前没有可访问的公司 (登录后可见)</div>
        ) : null}

        {rows.length > 0 ? (
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>全部公司 · 本月支出合计</div>
            <div style={styles.summaryValue}>{formatCents(totals.spend)}</div>
            <div style={styles.summaryBarTrack}>
              <div
                style={{
                  ...styles.summaryBarFill,
                  width: `${Math.min(100, utilization)}%`,
                }}
              />
            </div>
            <div style={styles.summaryMeta}>
              预算 {formatCents(totals.budget)} · 已用 {formatPercent(utilization)}
            </div>
          </div>
        ) : null}

        <div style={styles.grid}>
          {rows.map((row) => (
            <QuotaCard key={row.company.id} row={row} />
          ))}
        </div>
      </div>
    </div>
  );
}

function QuotaCard({ row }: { row: CompanyQuota }) {
  const { company, dashboard, error } = row;
  const cost = dashboard?.costs;
  const quota = dashboard?.quota;

  const spend = cost?.monthSpendCents ?? quota?.spentMonthlyCents ?? null;
  const budget = cost?.monthBudgetCents ?? quota?.budgetMonthlyCents ?? null;
  const used = cost?.monthUtilizationPercent ?? quota?.utilizationPercent ?? null;
  const overBudget = typeof used === "number" && used > 100;

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.companyName} title={company.name}>
          {company.name}
        </span>
        {typeof used === "number" ? (
          <span style={{ ...styles.pill, ...(overBudget ? styles.pillBad : styles.pillOk) }}>
            {formatPercent(used)}
          </span>
        ) : null}
      </div>

      {error ? (
        <div style={styles.cardError}>{error}</div>
      ) : (
        <>
          <div style={styles.spendValue}>{formatCents(spend)}</div>
          <div style={styles.spendLabel}>本月支出</div>

          <div style={styles.barTrack}>
            <div
              style={{
                ...styles.barFill,
                width: `${Math.min(100, typeof used === "number" ? used : 0)}%`,
                backgroundColor: overBudget ? C.bad : C.brand,
              }}
            />
          </div>

          {/* 4 张核心 MetricTile (与 web Dashboard.tsx 同源同算) */}
          <div style={styles.metricGrid}>
            <MetricTile
              label="已启用员工"
              value={String(
                (dashboard?.agents.active ?? 0) +
                  (dashboard?.agents.running ?? 0) +
                  (dashboard?.agents.paused ?? 0) +
                  (dashboard?.agents.error ?? 0),
              )}
            />
            <MetricTile
              label="执行中任务"
              value={String(dashboard?.tasks.inProgress ?? 0)}
            />
            <MetricTile
              label="本月花费"
              value={dashboard ? formatCents(dashboard.costs.monthSpendCents) : "—"}
            />
            <MetricTile
              label="待审批"
              value={dashboard
                ? String(
                    (dashboard.pendingApprovals ?? 0) +
                      (dashboard.budgets?.pendingApprovals ?? 0),
                  )
                : "—"}
            />
          </div>
        </>
      )}
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.metricTile}>
      <div style={styles.metricTileValue}>{value}</div>
      <div style={styles.metricTileLabel}>{label}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: { display: "flex", flexDirection: "column", height: "100%", backgroundColor: C.bg, color: C.ink },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: `1px solid ${C.lineSubtle}`,
  },
  title: { color: C.ink, fontSize: 17, fontWeight: 600, letterSpacing: "-0.2px" },
  subtitle: { color: C.ink4, fontSize: 11, marginTop: 1 },
  refreshBtn: {
    background: "rgba(255,255,255,0.02)",
    border: `1px solid ${C.line}`,
    borderRadius: 8,
    padding: "7px 12px",
    color: C.ink2,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },
  body: { flex: 1, minHeight: 0, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 },
  hint: { color: C.ink4, fontSize: 13, padding: "24px 0", textAlign: "center" },
  errorBox: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 16,
    borderRadius: 12,
    border: "1px solid rgba(239,68,68,0.35)",
    background: "rgba(239,68,68,0.08)",
  },
  errorTitle: { color: C.bad, fontSize: 13, fontWeight: 600 },
  errorMsg: { color: C.ink2, fontSize: 12, wordBreak: "break-word" },
  retryBtn: {
    alignSelf: "flex-start",
    background: "rgba(94,106,210,0.16)",
    border: `1px solid ${C.brand}`,
    borderRadius: 8,
    padding: "6px 12px",
    color: C.accent,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },
  summaryCard: {
    padding: 16,
    borderRadius: 12,
    border: `1px solid ${C.line}`,
    background: C.panel,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  summaryLabel: { color: C.ink4, fontSize: 11 },
  summaryValue: { color: C.ink, fontSize: 28, fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  summaryBarTrack: { height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginTop: 4 },
  summaryBarFill: { height: "100%", borderRadius: 3, background: C.brand },
  summaryMeta: { color: C.ink3, fontSize: 11 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 },
  card: {
    padding: 14,
    borderRadius: 12,
    border: `1px solid ${C.line}`,
    background: C.panel,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  companyName: { color: C.ink, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  pill: { flex: "0 0 auto", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999 },
  pillOk: { color: C.accent, background: "rgba(94,106,210,0.14)", border: `1px solid ${C.brand}` },
  pillBad: { color: C.bad, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)" },
  spendValue: { color: C.ink, fontSize: 24, fontWeight: 600, fontVariantNumeric: "tabular-nums", marginTop: 4 },
  spendLabel: { color: C.ink4, fontSize: 11 },
  cardError: { color: C.warn, fontSize: 12, marginTop: 4, wordBreak: "break-word" },
  barTrack: { height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginTop: 6 },
  barFill: { height: "100%", borderRadius: 3 },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
    marginTop: 6,
  },
  metricTile: {
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${C.lineSubtle}`,
    background: "rgba(255,255,255,0.02)",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  metricTileValue: {
    color: C.ink,
    fontSize: 18,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
  },
  metricTileLabel: { color: C.ink3, fontSize: 11, fontWeight: 500 },
};

export default DashboardScreen;
