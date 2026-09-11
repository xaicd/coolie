import {
  DataTable,
  MetricCard,
  StatusBadge,
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

const ENGINE_MODES = ["engineering", "ide", "hybrid", "auto"] as const;
type EngineMode = (typeof ENGINE_MODES)[number];
type ConfigStatus = "draft" | "active" | "archived";
type ExecutionStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

interface WorkflowConfig {
  id: string;
  config_key: string;
  name: string;
  category: string;
  execution_mode: EngineMode;
  status: ConfigStatus;
  version: number;
  enabled: boolean;
}

interface WorkflowExecution {
  id: string;
  execution_key: string;
  workflow_id: string | null;
  workflow_name: string;
  status: ExecutionStatus;
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

function configStatusKind(s: ConfigStatus): "ok" | "pending" | "error" {
  if (s === "active") return "ok";
  if (s === "archived") return "error";
  return "pending";
}
function execStatusKind(s: ExecutionStatus): "ok" | "pending" | "error" | "info" {
  if (s === "completed") return "ok";
  if (s === "failed" || s === "cancelled") return "error";
  if (s === "running") return "info";
  return "pending";
}

export function SidebarLink(_props: PluginSidebarProps): ReactElement {
  return <span>Workflow</span>;
}

export function WorkflowPage({ context }: PluginPageProps): ReactElement {
  const companyId = context.companyId ?? undefined;
  const [tab, setTab] = useState<"configs" | "executions">("configs");

  if (!companyId) {
    return (
      <div style={page}>
        <p style={{ color: tokens.muted }}>Select a company to manage workflows.</p>
      </div>
    );
  }

  return (
    <div style={page}>
      <h1 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>Workflow</h1>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button
          style={{ ...btnStyle, background: tab === "configs" ? tokens.primary : "transparent", color: tab === "configs" ? tokens.primaryFg : tokens.primary }}
          onClick={() => setTab("configs")}
        >
          Configs
        </button>
        <button
          style={{ ...btnStyle, background: tab === "executions" ? tokens.primary : "transparent", color: tab === "executions" ? tokens.primaryFg : tokens.primary }}
          onClick={() => setTab("executions")}
        >
          Executions
        </button>
      </div>
      {tab === "configs" ? <ConfigsTab companyId={companyId} /> : <ExecutionsTab companyId={companyId} />}
    </div>
  );
}

function ConfigsTab({ companyId }: { companyId: string }): ReactElement {
  const { data, loading, error, refresh } = usePluginData<{ configs: WorkflowConfig[] }>("list-configs", {
    companyId,
  });
  const createConfig = usePluginAction("create-config");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<EngineMode>("engineering");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setFormError(null);
    try {
      await createConfig({ companyId, name, executionMode: mode });
      setName("");
      refresh();
    } catch (err) {
      setFormError(String((err as Error)?.message ?? err));
    } finally {
      setBusy(false);
    }
  }, [companyId, name, mode, createConfig, refresh]);

  return (
    <>
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>New config</div>
        <input style={inputStyle} placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
        <select style={inputStyle} value={mode} onChange={(e) => setMode(e.target.value as EngineMode)}>
          {ENGINE_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button style={btnStyle} disabled={busy || !name} onClick={submit}>
          {busy ? "…" : "Create"}
        </button>
        {formError && <div style={{ color: tokens.muted, marginTop: "0.5rem" }}>{formError}</div>}
      </div>

      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : "No workflow configs yet."}
        rows={(data?.configs ?? []) as unknown as Record<string, unknown>[]}
        columns={[
          { key: "name", header: "Config" },
          { key: "config_key", header: "Key" },
          { key: "execution_mode", header: "Mode", width: "120px" },
          { key: "version", header: "Ver", width: "70px" },
          {
            key: "status",
            header: "Status",
            width: "110px",
            render: (_v, row) => {
              const s = (row as unknown as WorkflowConfig).status;
              return <StatusBadge label={s} status={configStatusKind(s)} />;
            },
          },
        ]}
      />
    </>
  );
}

function ExecutionsTab({ companyId }: { companyId: string }): ReactElement {
  const { data, loading, error, refresh } = usePluginData<{ executions: WorkflowExecution[] }>(
    "list-executions",
    { companyId },
  );
  const createExecution = usePluginAction("create-execution");
  const transition = usePluginAction("transition-execution");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const startOne = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      await createExecution({ companyId, workflowName: name || "manual run" });
      setName("");
      refresh();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, name, createExecution, refresh]);

  const doTransition = useCallback(
    async (executionId: string, to: ExecutionStatus) => {
      setErr(null);
      try {
        await transition({ companyId, executionId, to });
        refresh();
      } catch (e) {
        setErr(String((e as Error)?.message ?? e));
      }
    },
    [companyId, transition, refresh],
  );

  const rows = data?.executions ?? [];
  const running = rows.filter((e) => e.status === "running").length;
  const completed = rows.filter((e) => e.status === "completed").length;

  return (
    <>
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>New execution</div>
        <input style={inputStyle} placeholder="workflow name" value={name} onChange={(e) => setName(e.target.value)} />
        <button style={btnStyle} disabled={busy} onClick={startOne}>
          {busy ? "…" : "Start"}
        </button>
        {err && <div style={{ color: tokens.muted, marginTop: "0.5rem" }}>{err}</div>}
      </div>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <MetricCard label="Total" value={rows.length} />
        <MetricCard label="Running" value={running} />
        <MetricCard label="Completed" value={completed} />
      </div>

      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : "No executions yet."}
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          { key: "workflow_name", header: "Workflow" },
          { key: "execution_key", header: "Key" },
          {
            key: "status",
            header: "Status",
            width: "130px",
            render: (_v, row) => {
              const s = (row as unknown as WorkflowExecution).status;
              return <StatusBadge label={s} status={execStatusKind(s)} />;
            },
          },
          {
            key: "id",
            header: "Actions",
            width: "220px",
            render: (_v, row) => {
              const e = row as unknown as WorkflowExecution;
              return (
                <span style={{ display: "flex", gap: "0.6rem", whiteSpace: "nowrap" }}>
                  {(e.status === "pending" || e.status === "running") && (
                    <button style={ghostBtn} onClick={() => doTransition(e.id, "running")}>
                      Run
                    </button>
                  )}
                  {e.status === "running" && (
                    <button style={ghostBtn} onClick={() => doTransition(e.id, "completed")}>
                      Complete
                    </button>
                  )}
                  {e.status !== "completed" && e.status !== "cancelled" && e.status !== "failed" && (
                    <button style={ghostBtn} onClick={() => doTransition(e.id, "cancelled")}>
                      Cancel
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
