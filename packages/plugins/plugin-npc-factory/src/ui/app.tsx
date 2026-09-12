import {
  DataTable,
  MetricCard,
  StatusBadge,
  useHostNavigation,
  usePluginAction,
  usePluginData,
  type PluginPageProps,
  type PluginSidebarProps,
} from "@paperclipai/plugin-sdk/ui";
import { useCallback, useState, type CSSProperties, type ReactElement } from "react";

const tokens = {
  border: "var(--border, oklch(0.269 0 0))",
  card: "var(--card, oklch(0.205 0 0))",
  bg: "var(--background, oklch(0.145 0 0))",
  fg: "var(--foreground, oklch(0.985 0 0))",
  muted: "var(--muted-foreground, oklch(0.708 0 0))",
  primary: "var(--primary, oklch(0.985 0 0))",
  primaryFg: "var(--primary-foreground, oklch(0.205 0 0))",
};

const JOB_FAMILIES = ["F1", "F2", "F3", "F4", "F5"] as const;
type JobFamily = (typeof JOB_FAMILIES)[number];
const ROLE_TYPES = [
  "code-maintainer",
  "service-governance",
  "api-designer",
  "ops-monitor",
  "devops",
  "doc-maintainer",
  "db-maintainer",
  "design-maintainer",
  "test-maintainer",
] as const;
type RoleType = (typeof ROLE_TYPES)[number];
const ARTIFACT_TYPES = ["code", "doc", "database", "design", "test"] as const;
type ArtifactType = (typeof ARTIFACT_TYPES)[number];
type RunStatus = "running" | "waiting_human" | "completed" | "failed" | "cancelled";
const DRIFT_STATUSES = ["synced", "drifted", "unknown", "pending"] as const;
type DriftStatus = (typeof DRIFT_STATUSES)[number];

interface NpcTemplate {
  id: string;
  template_key: string;
  name: string;
  role_type: RoleType;
  job_family: JobFamily | null;
  artifact_type: ArtifactType;
  is_active: boolean;
  version: number;
}
interface NpcRun {
  id: string;
  run_key: string;
  job_family: JobFamily | null;
  status: RunStatus;
}
interface NpcArtifact {
  id: string;
  artifact_key: string;
  artifact_type: ArtifactType;
  path: string;
  drift_status: DriftStatus;
}

const page: CSSProperties = { padding: "1.5rem", background: tokens.bg, color: tokens.fg, minHeight: "100%" };
const cardStyle: CSSProperties = {
  border: `1px solid ${tokens.border}`,
  background: tokens.card,
  borderRadius: "0.75rem",
  padding: "1rem",
  marginBottom: "0.75rem",
};
const inputStyle: CSSProperties = {
  border: `1px solid ${tokens.border}`,
  background: tokens.bg,
  color: tokens.fg,
  borderRadius: "0.5rem",
  padding: "0.4rem 0.6rem",
  marginRight: "0.5rem",
};
const btnStyle: CSSProperties = {
  border: "none",
  background: tokens.primary,
  color: tokens.primaryFg,
  borderRadius: "0.5rem",
  padding: "0.4rem 0.9rem",
  cursor: "pointer",
};
const ghostBtn: CSSProperties = { ...btnStyle, background: "transparent", color: tokens.primary, padding: 0 };

function runStatusKind(s: RunStatus): "ok" | "pending" | "error" | "warning" | "info" {
  if (s === "completed") return "ok";
  if (s === "failed" || s === "cancelled") return "error";
  if (s === "running") return "info";
  if (s === "waiting_human") return "warning";
  return "pending";
}
function driftKind(s: DriftStatus): "ok" | "pending" | "error" | "info" {
  if (s === "synced") return "ok";
  if (s === "drifted") return "error";
  if (s === "pending") return "pending";
  return "info";
}

const SIDEBAR_ROW_CLASS =
  "flex items-center gap-2.5 mx-2 rounded-lg px-2 py-1.5 pointer-coarse:py-1 " +
  "text-(length:--text-compact) font-medium transition-colors no-underline " +
  "text-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export function SidebarLink(_props: PluginSidebarProps): ReactElement {
  const nav = useHostNavigation();
  return (
    <a {...nav.linkProps("/npc-factory")} className={SIDEBAR_ROW_CLASS}>
      <span data-slot="sidebar-nav-icon" className="relative shrink-0" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="8" width="14" height="10" rx="2" />
          <path d="M12 8V5M9 13h.01M15 13h.01M9 3.5h6" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 truncate">NPC Factory</span>
    </a>
  );
}

export function NpcFactoryPage({ context }: PluginPageProps): ReactElement {
  const companyId = context.companyId ?? undefined;
  const [tab, setTab] = useState<"templates" | "runs" | "artifacts">("templates");

  if (!companyId) {
    return (
      <div style={page}>
        <p style={{ color: tokens.muted }}>Select a company to manage NPCs.</p>
      </div>
    );
  }

  const tabBtn = (id: typeof tab, label: string): ReactElement => (
    <button
      style={{ ...btnStyle, background: tab === id ? tokens.primary : "transparent", color: tab === id ? tokens.primaryFg : tokens.primary }}
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  );

  return (
    <div style={page}>
      <h1 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>NPC Factory</h1>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {tabBtn("templates", "Templates")}
        {tabBtn("runs", "Runs")}
        {tabBtn("artifacts", "Artifacts")}
      </div>
      {tab === "templates" && <TemplatesTab companyId={companyId} />}
      {tab === "runs" && <RunsTab companyId={companyId} />}
      {tab === "artifacts" && <ArtifactsTab companyId={companyId} />}
    </div>
  );
}

function TemplatesTab({ companyId }: { companyId: string }): ReactElement {
  const { data, loading, error, refresh } = usePluginData<{ templates: NpcTemplate[] }>("list-templates", {
    companyId,
  });
  const createTemplate = usePluginAction("create-template");
  const [name, setName] = useState("");
  const [roleType, setRoleType] = useState<RoleType>("code-maintainer");
  const [jobFamily, setJobFamily] = useState<JobFamily>("F1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      await createTemplate({ companyId, name, roleType, jobFamily });
      setName("");
      refresh();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, name, roleType, jobFamily, createTemplate, refresh]);

  return (
    <>
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>New template</div>
        <input style={inputStyle} placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
        <select style={inputStyle} value={roleType} onChange={(e) => setRoleType(e.target.value as RoleType)}>
          {ROLE_TYPES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select style={inputStyle} value={jobFamily} onChange={(e) => setJobFamily(e.target.value as JobFamily)}>
          {JOB_FAMILIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button style={btnStyle} disabled={busy || !name} onClick={submit}>
          {busy ? "…" : "Create"}
        </button>
        {err && <div style={{ color: tokens.muted, marginTop: "0.5rem" }}>{err}</div>}
      </div>

      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : "No NPC templates yet."}
        rows={(data?.templates ?? []) as unknown as Record<string, unknown>[]}
        columns={[
          { key: "name", header: "Template" },
          { key: "role_type", header: "Role" },
          { key: "job_family", header: "Family", width: "90px" },
          { key: "artifact_type", header: "Artifact", width: "100px" },
          {
            key: "is_active",
            header: "Active",
            width: "90px",
            render: (v) => <StatusBadge label={v ? "active" : "inactive"} status={v ? "ok" : "pending"} />,
          },
        ]}
      />
    </>
  );
}

function RunsTab({ companyId }: { companyId: string }): ReactElement {
  const { data, loading, error, refresh } = usePluginData<{ runs: NpcRun[] }>("list-runs", { companyId });
  const createRun = usePluginAction("create-run");
  const transitionRun = usePluginAction("transition-run");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const startRun = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      await createRun({ companyId });
      refresh();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, createRun, refresh]);

  const doTransition = useCallback(
    async (runId: string, to: RunStatus) => {
      setErr(null);
      try {
        await transitionRun({ companyId, runId, to });
        refresh();
      } catch (e) {
        setErr(String((e as Error)?.message ?? e));
      }
    },
    [companyId, transitionRun, refresh],
  );

  const rows = data?.runs ?? [];

  return (
    <>
      <div style={cardStyle}>
        <button style={btnStyle} disabled={busy} onClick={startRun}>
          {busy ? "…" : "New run"}
        </button>
        {err && <span style={{ color: tokens.muted, marginLeft: "0.5rem" }}>{err}</span>}
      </div>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <MetricCard label="Total" value={rows.length} />
        <MetricCard label="Running" value={rows.filter((r) => r.status === "running").length} />
        <MetricCard label="Waiting human" value={rows.filter((r) => r.status === "waiting_human").length} />
        <MetricCard label="Completed" value={rows.filter((r) => r.status === "completed").length} />
      </div>

      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : "No runs yet."}
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          { key: "run_key", header: "Run" },
          { key: "job_family", header: "Family", width: "90px" },
          {
            key: "status",
            header: "Status",
            width: "130px",
            render: (_v, row) => {
              const s = (row as unknown as NpcRun).status;
              return <StatusBadge label={s} status={runStatusKind(s)} />;
            },
          },
          {
            key: "id",
            header: "Actions",
            width: "240px",
            render: (_v, row) => {
              const r = row as unknown as NpcRun;
              const terminal = r.status === "completed" || r.status === "cancelled";
              if (terminal) return <span style={{ color: tokens.muted }}>—</span>;
              return (
                <span style={{ display: "flex", gap: "0.6rem", whiteSpace: "nowrap" }}>
                  {r.status === "waiting_human" && (
                    <button style={ghostBtn} onClick={() => doTransition(r.id, "running")}>
                      Resume
                    </button>
                  )}
                  {r.status === "running" && (
                    <button style={ghostBtn} onClick={() => doTransition(r.id, "waiting_human")}>
                      Hold
                    </button>
                  )}
                  <button style={ghostBtn} onClick={() => doTransition(r.id, "completed")}>
                    Complete
                  </button>
                  <button style={ghostBtn} onClick={() => doTransition(r.id, "cancelled")}>
                    Cancel
                  </button>
                </span>
              );
            },
          },
        ]}
      />
    </>
  );
}

function ArtifactsTab({ companyId }: { companyId: string }): ReactElement {
  const [filter, setFilter] = useState<"" | DriftStatus>("");
  const { data, loading, error, refresh } = usePluginData<{ artifacts: NpcArtifact[] }>("list-artifacts", {
    companyId,
    driftStatus: filter,
  });
  const setDrift = usePluginAction("set-artifact-drift");
  const [err, setErr] = useState<string | null>(null);

  const mark = useCallback(
    async (artifactId: string, driftStatus: DriftStatus) => {
      setErr(null);
      try {
        await setDrift({ companyId, artifactId, driftStatus });
        refresh();
      } catch (e) {
        setErr(String((e as Error)?.message ?? e));
      }
    },
    [companyId, setDrift, refresh],
  );

  const rows = data?.artifacts ?? [];

  return (
    <>
      <div style={{ marginBottom: "0.5rem" }}>
        <span style={{ color: tokens.muted, marginRight: "0.5rem" }}>Drift</span>
        <select style={inputStyle} value={filter} onChange={(e) => setFilter(e.target.value as "" | DriftStatus)}>
          <option value="">all</option>
          {DRIFT_STATUSES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        {err && <span style={{ color: tokens.muted, marginLeft: "0.5rem" }}>{err}</span>}
      </div>

      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : "No artifacts registered yet."}
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          { key: "artifact_key", header: "Artifact" },
          { key: "artifact_type", header: "Type", width: "100px" },
          { key: "path", header: "Path" },
          {
            key: "drift_status",
            header: "Drift",
            width: "110px",
            render: (_v, row) => {
              const s = (row as unknown as NpcArtifact).drift_status;
              return <StatusBadge label={s} status={driftKind(s)} />;
            },
          },
          {
            key: "id",
            header: "Actions",
            width: "180px",
            render: (_v, row) => {
              const a = row as unknown as NpcArtifact;
              return (
                <span style={{ display: "flex", gap: "0.6rem", whiteSpace: "nowrap" }}>
                  {a.drift_status !== "synced" && (
                    <button style={ghostBtn} onClick={() => mark(a.id, "synced")}>
                      Synced
                    </button>
                  )}
                  {a.drift_status !== "drifted" && (
                    <button style={ghostBtn} onClick={() => mark(a.id, "drifted")}>
                      Drifted
                    </button>
                  )}
                </span>
              );
            },
          },
        ]}
      />
    </>
  );
}
