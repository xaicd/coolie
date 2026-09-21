/**
 * Pipeline 列表 (h5) —— Coolie工坊 App 的 PipelinesScreen 的 Web 镜像。
 *
 * 只读: 列公司的 pipeline (GET /api/companies/:id/pipelines, paperclip 上游路由)。
 * 新建与编辑仍在 Coolie Web 的 PipelineEditor (/pipelines/new, /pipelines/:id),
 * 这里点 [+] / 点某条即开新窗口进入对应 Web 页, 不重发明编辑器。
 *
 * 公司取 `coolie.listCompanies()` 的第一家 (h5 暂无公司选择器, 与 TasksScreen /
 * DashboardScreen 同一取法)。接口报错时如实展示, 不静默吞成空列表。
 */

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Company } from "@coolie/api-client";
import { coolie } from "../coolie";

const C = {
  bg: "#08090A",
  surface: "#191A1B",
  ink: "#F7F8F8",
  ink2: "#D0D6E0",
  ink3: "#8A8F98",
  ink4: "#62666D",
  accent: "#7170FF",
  ok: "#27A644",
  warn: "#F59E0B",
  line: "rgba(255,255,255,0.08)",
} as const;

/** 一条 pipeline 列表行 (只取列表要展示的字段) */
interface PipelineListRow {
  id: string;
  name: string;
  archivedAt?: string | null;
  stageCount: number;
  openCaseCount?: number;
  inMotionCount?: number;
}

function pipelineStatus(row: PipelineListRow): { label: string; color: string } {
  if (row.archivedAt) return { label: "Archived", color: C.ink4 };
  if (row.stageCount === 0) return { label: "Draft", color: C.warn };
  return { label: "Active", color: C.ok };
}

export function PipelinesScreen({ style }: { style?: CSSProperties }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [rows, setRows] = useState<PipelineListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const load = useCallback(async (companyId: string) => {
    setLoading(true);
    setError(null);
    try {
      setRows(
        await coolie.request<PipelineListRow[]>(
          "GET",
          `/api/companies/${encodeURIComponent(companyId)}/pipelines`,
        ),
      );
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (company) void load(company.id);
  }, [company, load]);

  return (
    <div style={{ ...styles.screen, ...style }}>
      <div style={styles.header}>
        <h1 style={styles.h1}>Pipeline</h1>
        <button
          type="button"
          style={styles.primaryBtn}
          onClick={() => window.open("/pipelines/new", "_blank", "noopener")}
        >
          + 新建
        </button>
      </div>

      {error ? (
        <div style={styles.empty}>加载失败: {error}</div>
      ) : loading ? (
        <div style={styles.empty}>正在加载…</div>
      ) : rows.length === 0 ? (
        <div style={styles.empty}>暂无 pipeline — 点右上角 [+ 新建] 去 Pipeline 编辑器创建。</div>
      ) : (
        <div style={styles.list}>
          {rows.map((row) => {
            const status = pipelineStatus(row);
            return (
              <button
                key={row.id}
                type="button"
                style={styles.card}
                onClick={() =>
                  window.open(`/pipelines/${encodeURIComponent(row.id)}`, "_blank", "noopener")
                }
              >
                <div style={styles.cardTop}>
                  <span style={styles.name} title={row.name}>
                    {row.name}
                  </span>
                  <span style={{ ...styles.pill, color: status.color, borderColor: status.color }}>
                    {status.label}
                  </span>
                </div>
                <span style={styles.meta}>
                  {row.stageCount} 阶段 · {row.openCaseCount ?? 0} 进行中 case
                  {row.inMotionCount ? ` · ${row.inMotionCount} 在跑` : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: { padding: 20, display: "flex", flexDirection: "column", gap: 16, minHeight: 0, overflowY: "auto" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  h1: { margin: 0, color: C.ink, fontSize: 20, fontWeight: 600, letterSpacing: "-0.4px" },
  primaryBtn: {
    padding: "9px 16px",
    borderRadius: 8,
    border: "none",
    background: "#5E6AD2",
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    textAlign: "left",
    padding: 14,
    borderRadius: 12,
    border: `1px solid ${C.line}`,
    background: "rgba(255,255,255,0.02)",
    cursor: "pointer",
  },
  cardTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { color: C.ink, fontSize: 15, fontWeight: 500 },
  pill: {
    border: "1px solid",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 600,
  },
  meta: { color: C.ink3, fontSize: 12 },
  empty: { padding: "28px 0", textAlign: "center", color: C.ink4, fontSize: 13 },
};
