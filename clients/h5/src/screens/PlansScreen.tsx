/**
 * Plan 列表 (h5) —— Coolie工坊 App 的 PlansScreen 的 Web 镜像。
 *
 * 服务端没有 plans 端点: wave19 起 plan 以 `Plan: xxx` 的任务承载, 所以这里列的是
 * 这类任务 (与 App 端 listPlanIssues 同一约定)。真状态下没有 Approved/Pending/
 * Rejected 评审字段, 因此如实展示承载任务的状态, 不假装有评审结论。
 */

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Company, Issue } from "@coolie/api-client";
import { coolie } from "../coolie";

const C = {
  bg: "#08090A",
  surface: "#191A1B",
  ink: "#F7F8F8",
  ink2: "#D0D6E0",
  ink3: "#8A8F98",
  ink4: "#62666D",
  accent: "#7170FF",
  line: "rgba(255,255,255,0.08)",
} as const;

/** 任务状态 → 中文标签 (与 App 端 issue-status 同一套语义) */
const STATUS_LABEL: Record<string, string> = {
  backlog: "待办池",
  todo: "待处理",
  in_progress: "进行中",
  in_review: "评审中",
  done: "已完成",
  blocked: "受阻",
  cancelled: "已取消",
};

export function PlansScreen({ style }: { style?: CSSProperties }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [plans, setPlans] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
      const issues = await coolie.listIssues(companyId, { limit: 200 });
      setPlans(issues.filter((issue) => /^plan[:\s]/i.test(issue.title.trim())));
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
        <h1 style={styles.h1}>Plan</h1>
      </div>

      {error ? (
        <div style={styles.empty}>加载失败: {error}</div>
      ) : loading ? (
        <div style={styles.empty}>正在加载…</div>
      ) : plans.length === 0 ? (
        <div style={styles.empty}>暂无计划 — 在工坊对话里说一句「plan 要做的事」即可创建。</div>
      ) : (
        <div style={styles.list}>
          {plans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              style={styles.card}
              onClick={() => setToast(`已选计划: ${plan.title}（h5 详情页待后续波次）`)}
            >
              <div style={styles.cardTop}>
                <span style={styles.name} title={plan.title}>
                  {plan.title}
                </span>
                <span style={styles.pill}>{STATUS_LABEL[plan.status] ?? plan.status}</span>
              </div>
              <span style={styles.meta}>#{plan.id.slice(0, 8)}</span>
            </button>
          ))}
        </div>
      )}

      {toast ? (
        <div style={styles.toast} onClick={() => setToast(null)}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: { padding: 20, display: "flex", flexDirection: "column", gap: 16, minHeight: 0, overflowY: "auto" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  h1: { margin: 0, color: C.ink, fontSize: 20, fontWeight: 600, letterSpacing: "-0.4px" },
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
    border: `1px solid ${C.line}`,
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 600,
    color: C.accent,
    whiteSpace: "nowrap",
  },
  meta: { color: C.ink4, fontSize: 11 },
  empty: { padding: "28px 0", textAlign: "center", color: C.ink4, fontSize: 13 },
  toast: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    padding: "10px 18px",
    borderRadius: 8,
    background: C.surface,
    border: `1px solid ${C.line}`,
    color: C.ink,
    fontSize: 13,
    cursor: "pointer",
  },
};
