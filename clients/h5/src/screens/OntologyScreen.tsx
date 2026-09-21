/**
 * 本体驱动 (OntologyScreen, h5) —— 业务本体域列表
 *
 * wave1 验收 F-11: h5 端没有本体页 (board UI `:3100/COO/ontology` 面有 7 个域)。
 * 本屏补上 web 版: 拉公司列表, 再对每家公司拉本体域并渲染成卡片。
 *
 * 数据源:
 * - `coolie.listCompanies()`                → GET /api/companies
 * - `coolie.listOntologyDomains(companyId)` → GET /api/plugins/paperclipai.plugin-ontology/api/domains?companyId=…
 *
 * 与 board UI 的 7 域 (Fourth Coffee / E-Commerce Platform / Banking & Finance /
 * Healthcare System / Smart Manufacturing / University System / Zava Grove-to-Shelf)
 * 同一后端。接口报错时如实展示 (未登录 / 无权限 ≠ 没有域)。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { Company, OntologyDomain } from "@coolie/api-client";
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
  line: "rgba(255,255,255,0.08)",
  lineSubtle: "rgba(255,255,255,0.05)",
} as const;

const LIFECYCLE_LABEL: Record<string, string> = {
  draft: "草稿",
  active: "启用",
  deprecated: "废弃",
  archived: "归档",
  locked: "锁定",
};

const LIFECYCLE_COLOR: Record<string, string> = {
  draft: C.ink3,
  active: "#6EE7A0",
  deprecated: C.warn,
  archived: C.ink4,
  locked: C.accent,
};

/** 域字段兼容两种命名 (snake_case / camelCase), 与 api-client 的宽松类型一致 */
function domName(d: OntologyDomain): string {
  return d.display_name || d.displayName || d.slug;
}

function domLifecycle(d: OntologyDomain): string | undefined {
  return d.lifecycle_state || d.lifecycleState;
}

function domBuiltIn(d: OntologyDomain): boolean {
  return Boolean(d.is_built_in ?? d.isBuiltIn);
}

interface CompanyDomains {
  company: Company;
  domains: OntologyDomain[];
  error: string | null;
}

export interface OntologyScreenProps {
  style?: CSSProperties;
}

export function OntologyScreen({ style }: OntologyScreenProps) {
  const [rows, setRows] = useState<CompanyDomains[]>([]);
  const [loading, setLoading] = useState(true);
  const [topError, setTopError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setTopError(null);
    try {
      const companies = await coolie.listCompanies();
      const settled = await Promise.all(
        companies.map(async (company): Promise<CompanyDomains> => {
          try {
            const domains = await coolie.listOntologyDomains(company.id);
            return { company, domains, error: null };
          } catch (e) {
            return { company, domains: [], error: String((e as Error)?.message ?? e) };
          }
        }),
      );
      setRows(settled);
    } catch (e) {
      setRows([]);
      setTopError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalDomains = useMemo(
    () => rows.reduce((sum, r) => sum + r.domains.length, 0),
    [rows],
  );

  return (
    <div style={{ ...styles.screen, ...style }}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>本体驱动</div>
          <div style={styles.subtitle}>
            业务本体域 · 共 {totalDomains} 个
          </div>
        </div>
        <button type="button" style={styles.refreshBtn} onClick={() => void load()} disabled={loading}>
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      <div style={styles.body}>
        {topError ? (
          <div style={styles.errorBox}>
            <div style={styles.errorTitle}>无法读取本体域</div>
            <div style={styles.errorMsg}>{topError}</div>
            <button type="button" style={styles.retryBtn} onClick={() => void load()}>
              重试
            </button>
          </div>
        ) : null}

        {loading && rows.length === 0 && !topError ? (
          <div style={styles.hint}>正在读取本体域…</div>
        ) : null}

        {!loading && !topError && rows.length === 0 ? (
          <div style={styles.hint}>当前没有可访问的公司 (登录后可见)</div>
        ) : null}

        {rows.map((row) => (
          <section key={row.company.id} style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>{row.company.name}</span>
              <span style={styles.sectionCount}>{row.domains.length} 个域</span>
            </div>

            {row.error ? (
              <div style={styles.cardError}>{row.error}</div>
            ) : row.domains.length === 0 ? (
              <div style={styles.hint}>该公司暂无本体域</div>
            ) : (
              <div style={styles.grid}>
                {row.domains.map((domain) => (
                  <DomainCard key={domain.id} domain={domain} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function DomainCard({ domain }: { domain: OntologyDomain }) {
  const lifecycle = domLifecycle(domain);
  const lifecycleColor = lifecycle ? LIFECYCLE_COLOR[lifecycle] ?? C.ink3 : C.ink3;
  return (
    <div style={styles.card}>
      <div style={styles.cardTop}>
        <span style={styles.cardIcon} aria-hidden>
          {domain.icon || "🧩"}
        </span>
        <div style={styles.cardTitleStack}>
          <span style={styles.cardName} title={domName(domain)}>
            {domName(domain)}
          </span>
          <span style={styles.cardSlug} title={domain.slug}>
            {domain.slug} · v{domain.version}
          </span>
        </div>
      </div>

      {domain.description ? (
        <p style={styles.cardDesc}>{domain.description}</p>
      ) : null}

      <div style={styles.tagRow}>
        {lifecycle ? (
          <span style={{ ...styles.tag, color: lifecycleColor, borderColor: lifecycleColor }}>
            {LIFECYCLE_LABEL[lifecycle] ?? lifecycle}
          </span>
        ) : null}
        {domain.category ? <span style={styles.tag}>{domain.category}</span> : null}
        {domBuiltIn(domain) ? <span style={styles.tag}>内置</span> : null}
      </div>
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
  body: { flex: 1, minHeight: 0, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 },
  hint: { color: C.ink4, fontSize: 13, padding: "16px 0", textAlign: "center" },
  errorBox: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 16,
    borderRadius: 12,
    border: "1px solid rgba(239,68,68,0.35)",
    background: "rgba(239,68,68,0.08)",
  },
  errorTitle: { color: "#EF4444", fontSize: 13, fontWeight: 600 },
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
  section: { display: "flex", flexDirection: "column", gap: 8 },
  sectionHeader: { display: "flex", alignItems: "baseline", justifyContent: "space-between" },
  sectionTitle: { color: C.ink2, fontSize: 13, fontWeight: 600 },
  sectionCount: { color: C.ink4, fontSize: 11 },
  cardError: { color: C.warn, fontSize: 12, wordBreak: "break-word" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 },
  card: {
    padding: 14,
    borderRadius: 12,
    border: `1px solid ${C.line}`,
    background: C.panel,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  cardTop: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
  cardIcon: { fontSize: 20, flex: "0 0 auto" },
  cardTitleStack: { display: "flex", flexDirection: "column", minWidth: 0 },
  cardName: {
    color: C.ink,
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  cardSlug: {
    color: C.ink4,
    fontSize: 11,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  cardDesc: { margin: 0, color: C.ink3, fontSize: 12, lineHeight: "17px" },
  tagRow: { display: "flex", flexWrap: "wrap", gap: 6 },
  tag: {
    fontSize: 11,
    color: C.ink3,
    border: `1px solid ${C.line}`,
    borderRadius: 999,
    padding: "2px 8px",
  },
};

export default OntologyScreen;
