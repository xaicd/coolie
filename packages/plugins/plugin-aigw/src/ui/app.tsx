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

const PROVIDERS = [
  "openai-compatible",
  "openai",
  "anthropic",
  "deepseek",
  "glm",
  "minimax",
  "qwen",
  "custom",
] as const;
type Provider = (typeof PROVIDERS)[number];

interface AigwChannel {
  id: string;
  name: string;
  provider: Provider;
  api_url: string;
  model: string;
  enabled: boolean;
  is_default: boolean;
  priority: number;
  weight: number;
}
interface AigwUsage {
  id: string;
  channel_id: string | null;
  model: string;
  total_tokens: number;
  latency_ms: number;
  status: string;
  event_at: string;
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

export function SidebarLink(_props: PluginSidebarProps): ReactElement {
  return <span>AI Gateway</span>;
}

export function AigwPage({ context }: PluginPageProps): ReactElement {
  const companyId = context.companyId ?? undefined;
  const [tab, setTab] = useState<"channels" | "usage">("channels");

  if (!companyId) {
    return (
      <div style={page}>
        <p style={{ color: tokens.muted }}>Select a company to manage AI gateway channels.</p>
      </div>
    );
  }

  return (
    <div style={page}>
      <h1 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>AI Gateway</h1>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button
          style={{ ...btnStyle, background: tab === "channels" ? tokens.primary : "transparent", color: tab === "channels" ? tokens.primaryFg : tokens.primary }}
          onClick={() => setTab("channels")}
        >
          Channels
        </button>
        <button
          style={{ ...btnStyle, background: tab === "usage" ? tokens.primary : "transparent", color: tab === "usage" ? tokens.primaryFg : tokens.primary }}
          onClick={() => setTab("usage")}
        >
          Usage
        </button>
      </div>
      {tab === "channels" ? <ChannelsTab companyId={companyId} /> : <UsageTab companyId={companyId} />}
    </div>
  );
}

function ChannelsTab({ companyId }: { companyId: string }): ReactElement {
  const { data, loading, error, refresh } = usePluginData<{ channels: AigwChannel[] }>("list-channels", {
    companyId,
  });
  const createChannel = usePluginAction("create-channel");
  const toggleChannel = usePluginAction("toggle-channel");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<Provider>("openai-compatible");
  const [apiUrl, setApiUrl] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      await createChannel({ companyId, name, provider, apiUrl, model: model || undefined });
      setName("");
      setApiUrl("");
      setModel("");
      refresh();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, name, provider, apiUrl, model, createChannel, refresh]);

  const toggle = useCallback(
    async (channelId: string, enabled: boolean) => {
      setErr(null);
      try {
        await toggleChannel({ companyId, channelId, enabled });
        refresh();
      } catch (e) {
        setErr(String((e as Error)?.message ?? e));
      }
    },
    [companyId, toggleChannel, refresh],
  );

  const rows = data?.channels ?? [];

  return (
    <>
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>New channel</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 0", alignItems: "center" }}>
          <input style={inputStyle} placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
          <select style={inputStyle} value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input style={inputStyle} placeholder="api url" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
          <input style={inputStyle} placeholder="model (optional)" value={model} onChange={(e) => setModel(e.target.value)} />
          <button style={btnStyle} disabled={busy || !name || !apiUrl} onClick={submit}>
            {busy ? "…" : "Create"}
          </button>
        </div>
        <div style={{ color: tokens.muted, fontSize: "0.8rem", marginTop: "0.5rem" }}>
          API keys are stored as secret refs by the backend, never as raw values here.
        </div>
        {err && <div style={{ color: tokens.muted, marginTop: "0.5rem" }}>{err}</div>}
      </div>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <MetricCard label="Channels" value={rows.length} />
        <MetricCard label="Enabled" value={rows.filter((c) => c.enabled).length} />
      </div>

      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : "No channels yet."}
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          {
            key: "name",
            header: "Channel",
            render: (_v, row) => {
              const c = row as unknown as AigwChannel;
              return (
                <span>
                  {c.name}
                  {c.is_default && <span style={{ color: tokens.muted, fontSize: "0.75rem" }}> · default</span>}
                </span>
              );
            },
          },
          { key: "provider", header: "Provider", width: "150px" },
          { key: "model", header: "Model" },
          { key: "priority", header: "Prio", width: "70px" },
          {
            key: "enabled",
            header: "Enabled",
            width: "100px",
            render: (v) => <StatusBadge label={v ? "on" : "off"} status={v ? "ok" : "pending"} />,
          },
          {
            key: "id",
            header: "Actions",
            width: "120px",
            render: (_v, row) => {
              const c = row as unknown as AigwChannel;
              return (
                <button style={ghostBtn} onClick={() => toggle(c.id, !c.enabled)}>
                  {c.enabled ? "Disable" : "Enable"}
                </button>
              );
            },
          },
        ]}
      />
    </>
  );
}

function UsageTab({ companyId }: { companyId: string }): ReactElement {
  const { data, loading, error } = usePluginData<{ usage: AigwUsage[] }>("list-usage", { companyId });
  const rows = data?.usage ?? [];
  const totalTokens = rows.reduce((sum, u) => sum + (Number(u.total_tokens) || 0), 0);
  const avgLatency =
    rows.length > 0 ? Math.round(rows.reduce((s, u) => s + (Number(u.latency_ms) || 0), 0) / rows.length) : 0;

  return (
    <>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <MetricCard label="Recent calls" value={rows.length} />
        <MetricCard label="Total tokens" value={totalTokens} />
        <MetricCard label="Avg latency (ms)" value={avgLatency} />
      </div>

      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : "No usage recorded yet."}
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          { key: "model", header: "Model" },
          { key: "total_tokens", header: "Tokens", width: "100px" },
          { key: "latency_ms", header: "Latency ms", width: "110px" },
          {
            key: "status",
            header: "Status",
            width: "110px",
            render: (v) => <StatusBadge label={String(v)} status={v === "success" ? "ok" : "error"} />,
          },
          {
            key: "event_at",
            header: "When",
            render: (v) => {
              const d = new Date(String(v));
              return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
            },
          },
        ]}
      />
    </>
  );
}
