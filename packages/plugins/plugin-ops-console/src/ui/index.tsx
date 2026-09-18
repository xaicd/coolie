/**
 * The ops console page: every client on this instance, on one screen.
 *
 * It is an operator surface, not a client surface. The data request carries no
 * `companyId`, which is what makes the host require an instance admin
 * (`assertPluginBridgeScope`), so a client member who somehow reaches this route
 * gets a refusal from the host rather than other clients' numbers. The page says
 * so out loud instead of pretending the scoping is its own doing.
 */
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import {
  DataTable,
  MetricCard,
  StatusBadge,
  useHostNavigation,
  usePluginAction,
  type DataTableColumn,
  type PluginPageProps,
  type PluginSidebarProps,
  type StatusBadgeVariant,
} from "@paperclipai/plugin-sdk/ui";
import { PLUGIN_ID } from "../manifest.js";

interface ClientSummary {
  id: string;
  name: string;
  status: string;
  agents: number;
  openIssues: number;
  runningRuns: number;
  monthCostCents: number;
  budgetCents: number;
  spentCents: number;
  pendingApprovals: number;
  lastActivityAt: string | null;
  note: string;
}

interface CockpitData {
  clients: ClientSummary[];
  generatedAt: string;
}

/** Shared sidebar-row styling matching the host SidebarNavItem pill. */
const SIDEBAR_ROW_CLASS =
  "flex items-center gap-2.5 mx-2 rounded-lg px-2 py-1.5 pointer-coarse:py-1 " +
  "text-(length:--text-compact) font-medium transition-colors no-underline " +
  "text-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export function SidebarLink(_props: PluginSidebarProps): ReactElement {
  const nav = useHostNavigation();
  return (
    <a {...nav.linkProps("/ops")} className={SIDEBAR_ROW_CLASS}>
      <span data-slot="sidebar-nav-icon" className="relative shrink-0" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 truncate">Ops</span>
    </a>
  );
}

function statusVariant(status: string): StatusBadgeVariant {
  if (status === "archived") return "error";
  if (status === "paused") return "warning";
  if (status === "active") return "ok";
  return "info";
}

/** Cents, raw. The billing currency is the deployment's business, not ours to guess. */
function cents(value: number): string {
  return (value / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function ago(iso: string | null): string {
  if (!iso) return "—";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "—";
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function NoteCell({ companyId, note, onSaved }: { companyId: string; note: string; onSaved?: () => void }): ReactElement {
  const setNote = usePluginAction("set-client-note");
  const [draft, setDraft] = useState(note);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const dirty = draft !== note;

  return (
    <div className="flex items-center gap-1.5">
      <input
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setState("idle");
        }}
        placeholder="note"
        className="w-full min-w-32 rounded border border-border bg-transparent px-1.5 py-1 text-(length:--text-nano)"
      />
      {(dirty || state === "saving") && (
        <button
          type="button"
          disabled={state === "saving"}
          onClick={async () => {
            setState("saving");
            try {
              await setNote({ companyId, note: draft });
              setState("saved");
              onSaved?.();
            } catch {
              setState("error");
            }
          }}
          className="rounded bg-primary px-1.5 py-1 text-(length:--text-nano) font-medium text-primary-foreground disabled:opacity-50"
        >
          {state === "saving" ? "…" : "Save"}
        </button>
      )}
      {state === "saved" && !dirty && <span className="text-(length:--text-nano) text-emerald-600">saved</span>}
      {state === "error" && <span className="text-(length:--text-nano) text-destructive">failed</span>}
    </div>
  );
}

type CockpitState = { data: CockpitData | null; loading: boolean; error: Error | null };

/**
 * Read the cockpit straight from the plugin data route, without the SDK's
 * `usePluginData` wrapper.
 *
 * That wrapper attaches the host's active company to the request, and this read
 * must not carry one: the host gates a company-less request on *instance admin*
 * (`assertPluginBridgeScope`), while a request with a company is only authorised
 * for that single company — and the worker refuses that case outright, because
 * answering with every company would be a leak wearing a filter. Observed on the
 * running instance: via `usePluginData` the page received a 502 carrying exactly
 * that refusal.
 */
function useCockpit(): CockpitState & { reload: () => void } {
  const [state, setState] = useState<CockpitState>({ data: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    void (async () => {
      try {
        const response = await fetch(`/api/plugins/${PLUGIN_ID}/data/cockpit`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ params: {} }),
        });
        const body = (await response.json()) as { data?: CockpitData; message?: string };
        if (cancelled) return;
        if (!response.ok) throw new Error(body?.message ?? `Request failed (${response.status})`);
        setState({ data: body.data ?? null, loading: false, error: null });
      } catch (error) {
        if (!cancelled) setState({ data: null, loading: false, error: error as Error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { ...state, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

export function OpsConsolePage(_props: PluginPageProps): ReactElement {
  const { data, loading, error, reload } = useCockpit();

  const clients = data?.clients ?? [];
  const totals = useMemo(
    () =>
      clients.reduce(
        (acc, client) => ({
          runningRuns: acc.runningRuns + client.runningRuns,
          pendingApprovals: acc.pendingApprovals + client.pendingApprovals,
          openIssues: acc.openIssues + client.openIssues,
          monthCostCents: acc.monthCostCents + client.monthCostCents,
        }),
        { runningRuns: 0, pendingApprovals: 0, openIssues: 0, monthCostCents: 0 },
      ),
    [clients],
  );

  const columns: DataTableColumn<ClientSummary>[] = [
    { key: "name", header: "Client", sortable: true },
    {
      key: "status",
      header: "Status",
      width: "110px",
      render: (value) => <StatusBadge label={String(value)} status={statusVariant(String(value))} />,
    },
    { key: "agents", header: "Agents", width: "80px", sortable: true },
    { key: "runningRuns", header: "Running", width: "90px", sortable: true },
    { key: "openIssues", header: "Open", width: "80px", sortable: true },
    { key: "pendingApprovals", header: "Approvals", width: "100px", sortable: true },
    {
      key: "monthCostCents",
      header: "Cost (MTD)",
      width: "110px",
      sortable: true,
      render: (value) => cents(Number(value)),
    },
    {
      key: "budgetCents",
      header: "Budget / spent",
      width: "150px",
      render: (_value, row) => `${cents(row.budgetCents)} / ${cents(row.spentCents)}`,
    },
    {
      key: "lastActivityAt",
      header: "Last activity",
      width: "110px",
      sortable: true,
      render: (value) => ago(value ? String(value) : null),
    },
    {
      key: "note",
      header: "Note",
      render: (_value, row) => <NoteCell companyId={row.id} note={row.note} onSaved={reload} />,
    },
  ];

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="max-w-lg space-y-2">
          <div className="font-semibold text-foreground">Ops console unavailable</div>
          <div className="text-(length:--text-compact) text-muted-foreground">{error.message}</div>
          <div className="text-(length:--text-nano) text-muted-foreground">
            This page reads every company on the instance, so the host only serves it to an
            instance admin.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-(length:--text-title) font-semibold">Ops console</h1>
        <span className="text-(length:--text-nano) text-muted-foreground">
          every client on this instance
          {data?.generatedAt ? ` · read at ${new Date(data.generatedAt).toLocaleTimeString()}` : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Clients" value={clients.length} />
        <MetricCard label="Running runs" value={totals.runningRuns} />
        <MetricCard label="Open issues" value={totals.openIssues} />
        <MetricCard label="Cost MTD (cents)" value={cents(totals.monthCostCents)} />
      </div>

      {/*
        `DataTable` is built with `createSdkUiComponent<DataTableProps>`, which
        instantiates the prop type at its default and erases the row generic — so
        the typed rows have to be asserted back here rather than threaded
        through. Confirmed in the SDK, not a guess (sdk/src/ui/components.ts:482).
      */}
      <DataTable
        columns={columns as unknown as DataTableColumn[]}
        rows={clients as unknown as Record<string, unknown>[]}
        loading={loading}
        emptyMessage="No companies on this instance yet."
        pageSize={50}
      />

      <p className="text-(length:--text-nano) text-muted-foreground">
        Cost and budget are shown in cents, unconverted, because the billing currency belongs to
        the deployment. Last activity is derived from agent heartbeats, runs and cost events — this
        instance records no activity log, so it is a lower bound rather than a log line.
      </p>
    </div>
  );
}
