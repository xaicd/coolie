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
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";

const tokens = {
  border: "var(--border, oklch(0.269 0 0))",
  card: "var(--card, oklch(0.205 0 0))",
  bg: "var(--background, oklch(0.145 0 0))",
  fg: "var(--foreground, oklch(0.985 0 0))",
  muted: "var(--muted-foreground, oklch(0.708 0 0))",
  primary: "var(--primary, oklch(0.985 0 0))",
  primaryFg: "var(--primary-foreground, oklch(0.205 0 0))",
};

interface OntologyDomain {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  status: string;
  version: number;
}

interface OntologyNodeType {
  id: string;
  key: string;
  display_name: string;
  description: string | null;
}

interface OntologyRelationType {
  id: string;
  key: string;
  display_name: string;
  description: string | null;
  directed: boolean;
}

interface GraphNode {
  id: string;
  key: string;
  label: string;
  nodeTypeId: string | null;
}
interface GraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationKey: string | null;
  weight: number;
}
interface GraphSnapshot {
  counts: { nodeTypes: number; relationTypes: number; nodes: number; edges: number };
  nodes?: GraphNode[];
  edges?: GraphEdge[];
}

interface DomainDetail {
  domain: OntologyDomain | null;
  nodeTypes: OntologyNodeType[];
  relationTypes: OntologyRelationType[];
  graph: GraphSnapshot;
}

interface EvalRow {
  id: string;
  key: string;
  name: string;
  eval_type: string;
  status: string;
  score: number | null;
}
interface SimulationRow {
  id: string;
  key: string;
  name: string;
  status: string;
  recommended_strategy: string | null;
}

const EVAL_METRIC_TYPES = ["accuracy", "latency", "token_cost", "user_satisfaction", "custom"] as const;

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

/** Shared sidebar-row styling matching the host SidebarNavItem pill. */
const SIDEBAR_ROW_CLASS =
  "flex items-center gap-2.5 mx-2 rounded-lg px-2 py-1.5 pointer-coarse:py-1 " +
  "text-(length:--text-compact) font-medium transition-colors no-underline " +
  "text-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

/** Sidebar entry: a real host-router link styled like native nav rows, with an icon. */
export function SidebarLink(_props: PluginSidebarProps): ReactElement {
  const nav = useHostNavigation();
  return (
    <a {...nav.linkProps("/ontology")} className={SIDEBAR_ROW_CLASS}>
      <span data-slot="sidebar-nav-icon" className="relative shrink-0" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="2.5" />
          <circle cx="5" cy="19" r="2.5" />
          <circle cx="19" cy="19" r="2.5" />
          <path d="M12 7.5v4M12 11.5 6.5 17M12 11.5 17.5 17" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 truncate">Ontology</span>
    </a>
  );
}

const ghostBtn: CSSProperties = { ...btnStyle, background: "transparent", color: tokens.primary, padding: 0 };

/** Full-page ontology view: Domains modeling + Capabilities acquisition. */
export function OntologyPage({ context }: PluginPageProps): ReactElement {
  const companyId = context.companyId ?? undefined;
  const [tab, setTab] = useState<"domains" | "cognition" | "capabilities">("domains");
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);

  if (!companyId) {
    return (
      <div style={page}>
        <p style={{ color: tokens.muted }}>Select a company to model its ontology.</p>
      </div>
    );
  }

  return (
    <div style={page}>
      <h1 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>Ontology</h1>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button
          style={{ ...btnStyle, background: tab === "domains" ? tokens.primary : "transparent", color: tab === "domains" ? tokens.primaryFg : tokens.primary }}
          onClick={() => setTab("domains")}
        >
          Domains
        </button>
        <button
          style={{ ...btnStyle, background: tab === "cognition" ? tokens.primary : "transparent", color: tab === "cognition" ? tokens.primaryFg : tokens.primary }}
          onClick={() => setTab("cognition")}
        >
          Cognition
        </button>
        <button
          style={{ ...btnStyle, background: tab === "capabilities" ? tokens.primary : "transparent", color: tab === "capabilities" ? tokens.primaryFg : tokens.primary }}
          onClick={() => setTab("capabilities")}
        >
          Capabilities
        </button>
      </div>
      {tab === "domains" &&
        (selectedDomainId ? (
          <DomainDetailView
            companyId={companyId}
            domainId={selectedDomainId}
            onBack={() => setSelectedDomainId(null)}
          />
        ) : (
          <DomainList companyId={companyId} onOpen={setSelectedDomainId} />
        ))}
      {tab === "cognition" && <CognitionTab companyId={companyId} />}
      {tab === "capabilities" && <CapabilitiesTab companyId={companyId} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cognition (AST reverse-engineering): feed code -> auto-draft an ontology.
// ---------------------------------------------------------------------------

interface CognitionJob {
  id: string;
  job_key: string;
  domain_id: string | null;
  root_path: string;
  app_name: string;
  status: string;
  stage_label: string;
  progress_pct: number;
}
interface CognitionCoverage {
  entityCount: number;
  relationCount: number;
  actionCount: number;
  sqlFiles: number;
  apiFiles: number;
}
interface CognitionDraft {
  seedNodeTypes: unknown[];
  seedRelationTypes: unknown[];
  seedActions: unknown[];
}

function cognitionStatusKind(s: string): "ok" | "pending" | "error" | "info" {
  if (s === "completed") return "ok";
  if (s === "failed") return "error";
  if (s === "awaiting_confirm") return "info";
  return "pending";
}

function CognitionTab({ companyId }: { companyId: string }): ReactElement {
  const { data, loading, error, refresh } = usePluginData<{ jobs: CognitionJob[] }>(
    "list-cognition-jobs",
    { companyId },
  );
  const createJob = usePluginAction("create-cognition-job");
  const [appName, setAppName] = useState("");
  const [rootPath, setRootPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openJobId, setOpenJobId] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = (await createJob({ companyId, appName: appName || undefined, rootPath: rootPath || "." })) as {
        job?: CognitionJob;
      };
      setAppName("");
      setRootPath("");
      refresh();
      if (res?.job?.id) setOpenJobId(res.job.id);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, appName, rootPath, createJob, refresh]);

  const jobs = data?.jobs ?? [];

  return (
    <>
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>New cognition job</div>
        <div style={{ color: tokens.muted, fontSize: "0.8rem", marginBottom: "0.5rem" }}>
          Reverse-engineer an ontology draft from source code (TS/JS/Vue/Py/Go/Java/SQL).
        </div>
        <input style={inputStyle} placeholder="app name (optional)" value={appName} onChange={(e) => setAppName(e.target.value)} />
        <input style={inputStyle} placeholder="root path (e.g. .)" value={rootPath} onChange={(e) => setRootPath(e.target.value)} />
        <button style={btnStyle} disabled={busy} onClick={submit}>
          {busy ? "…" : "Create"}
        </button>
        {err && <div style={{ color: tokens.muted, marginTop: "0.5rem" }}>{err}</div>}
      </div>

      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : "No cognition jobs yet."}
        rows={jobs as unknown as Record<string, unknown>[]}
        columns={[
          {
            key: "app_name",
            header: "Job",
            render: (_v, row) => (
              <button style={ghostBtn} onClick={() => setOpenJobId((row as unknown as CognitionJob).id)}>
                {(row as unknown as CognitionJob).app_name || (row as unknown as CognitionJob).job_key}
              </button>
            ),
          },
          { key: "progress_pct", header: "%", width: "70px" },
          {
            key: "status",
            header: "Status",
            width: "140px",
            render: (_v, row) => {
              const s = (row as unknown as CognitionJob).status;
              return <StatusBadge label={s} status={cognitionStatusKind(s)} />;
            },
          },
        ]}
      />

      {openJobId && (
        <CognitionJobDetail
          companyId={companyId}
          jobId={openJobId}
          onClose={() => setOpenJobId(null)}
          onChanged={refresh}
        />
      )}
    </>
  );
}

function CognitionJobDetail({
  companyId,
  jobId,
  onClose,
  onChanged,
}: {
  companyId: string;
  jobId: string;
  onClose: () => void;
  onChanged: () => void;
}): ReactElement {
  const { data, loading, refresh } = usePluginData<{ job: CognitionJob | null; draft: CognitionDraft | null }>(
    "cognition-job",
    { companyId, jobId },
  );
  const ingest = usePluginAction("ingest-cognition-files");
  const publish = usePluginAction("publish-cognition-job");
  const { data: domainsData } = usePluginData<{ domains: OntologyDomain[] }>("list-domains", { companyId });
  const [code, setCode] = useState("");
  const [filePath, setFilePath] = useState("app.ts");
  const [targetDomain, setTargetDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const job = data?.job;
  const draft = data?.draft;

  const runIngest = useCallback(async () => {
    if (!code.trim()) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = (await ingest({ companyId, jobId, files: [{ path: filePath || "app.ts", content: code }] })) as {
        coverage?: CognitionCoverage;
      };
      const c = res?.coverage;
      setMsg(c ? `Extracted ${c.entityCount} entities, ${c.relationCount} relations, ${c.actionCount} actions.` : "Ingested.");
      refresh();
      onChanged();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, jobId, code, filePath, ingest, refresh, onChanged]);

  const runPublish = useCallback(async () => {
    if (!targetDomain) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await publish({ companyId, jobId, domainId: targetDomain });
      setMsg("Published draft to the domain.");
      refresh();
      onChanged();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, jobId, targetDomain, publish, refresh, onChanged]);

  const nt = draft?.seedNodeTypes?.length ?? 0;
  const rt = draft?.seedRelationTypes?.length ?? 0;
  const at = draft?.seedActions?.length ?? 0;

  return (
    <div style={{ ...cardStyle, borderColor: tokens.primary }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600 }}>{job?.app_name || job?.job_key || "Cognition job"}</div>
        <button style={ghostBtn} onClick={onClose}>Close</button>
      </div>
      {loading && <p style={{ color: tokens.muted }}>Loading…</p>}
      {job && (
        <div style={{ color: tokens.muted, fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          {job.status} · {job.stage_label || "—"} · {job.progress_pct}%
        </div>
      )}

      <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.4rem" }}>1 · Ingest code</div>
      <input style={{ ...inputStyle, marginBottom: "0.4rem" }} placeholder="file path (e.g. src/order.ts)" value={filePath} onChange={(e) => setFilePath(e.target.value)} />
      <textarea
        style={{ ...inputStyle, width: "100%", minHeight: "8rem", marginRight: 0, boxSizing: "border-box", resize: "vertical", fontFamily: "monospace", fontSize: "0.8rem" }}
        placeholder="Paste source code to reverse-engineer…"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <div style={{ marginTop: "0.5rem" }}>
        <button style={btnStyle} disabled={busy || !code.trim()} onClick={runIngest}>
          {busy ? "…" : "Extract draft"}
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", margin: "0.75rem 0", flexWrap: "wrap" }}>
        <MetricCard label="Node types" value={nt} />
        <MetricCard label="Relation types" value={rt} />
        <MetricCard label="Action types" value={at} />
      </div>

      <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.4rem" }}>2 · Publish to a domain</div>
      <select style={inputStyle} value={targetDomain} onChange={(e) => setTargetDomain(e.target.value)}>
        <option value="">select target domain…</option>
        {(domainsData?.domains ?? []).map((d) => (
          <option key={d.id} value={d.id}>{d.display_name}</option>
        ))}
      </select>
      <button style={btnStyle} disabled={busy || !targetDomain || nt + rt + at === 0} onClick={runPublish}>
        {busy ? "…" : "Publish draft"}
      </button>

      {msg && <div style={{ color: tokens.fg, fontSize: "0.85rem", marginTop: "0.5rem" }}>✓ {msg}</div>}
      {err && <div style={{ color: tokens.muted, marginTop: "0.5rem" }}>{err}</div>}
    </div>
  );
}

const CAPABILITY_SOURCES = ["cached-mcp", "curated-catalog", "npm-registry", "autonomous-dev"] as const;

interface CapabilityGap {
  id: string;
  gap_key: string;
  title: string;
  description: string;
  status: string;
  domain_id: string | null;
  resolved_function_id: string | null;
  priority: string;
}

interface CapabilityResolution {
  id: string;
  stage: string;
  source: string;
  license_verdict: string;
  error: string;
}

function gapStatusKind(s: string): "ok" | "pending" | "error" | "info" {
  if (s === "resolved") return "ok";
  if (s === "abandoned") return "error";
  if (s === "resolving") return "info";
  return "pending";
}

/** Capability acquisition: gaps list + trigger acquisition + resolution trail. */
function CapabilitiesTab({ companyId }: { companyId: string }): ReactElement {
  const { data, loading, error, refresh } = usePluginData<{ gaps: CapabilityGap[] }>(
    "list-capability-gaps",
    { companyId },
  );
  const createGap = usePluginAction("create-capability-gap");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openGapId, setOpenGapId] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      await createGap({ companyId, title });
      setTitle("");
      refresh();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, title, createGap, refresh]);

  const gaps = data?.gaps ?? [];

  return (
    <>
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>New capability gap</div>
        <input
          style={{ ...inputStyle, minWidth: "20rem" }}
          placeholder="what capability is missing?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button style={btnStyle} disabled={busy || !title.trim()} onClick={submit}>
          {busy ? "…" : "Detect"}
        </button>
        {err && <div style={{ color: tokens.muted, marginTop: "0.5rem" }}>{err}</div>}
      </div>

      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : "No capability gaps yet."}
        rows={gaps as unknown as Record<string, unknown>[]}
        columns={[
          {
            key: "title",
            header: "Capability gap",
            render: (_v, row) => (
              <button style={ghostBtn} onClick={() => setOpenGapId((row as unknown as CapabilityGap).id)}>
                {(row as unknown as CapabilityGap).title}
              </button>
            ),
          },
          { key: "priority", header: "Priority", width: "90px" },
          {
            key: "status",
            header: "Status",
            width: "110px",
            render: (_v, row) => {
              const s = (row as unknown as CapabilityGap).status;
              return <StatusBadge label={s} status={gapStatusKind(s)} />;
            },
          },
        ]}
      />

      {openGapId && (
        <CapabilityGapDetail
          companyId={companyId}
          gap={gaps.find((g) => g.id === openGapId) ?? null}
          onClose={() => setOpenGapId(null)}
          onChanged={refresh}
        />
      )}
    </>
  );
}

function CapabilityGapDetail({
  companyId,
  gap,
  onClose,
  onChanged,
}: {
  companyId: string;
  gap: CapabilityGap | null;
  onClose: () => void;
  onChanged: () => void;
}): ReactElement {
  const { data, loading, refresh } = usePluginData<{ resolutions: CapabilityResolution[] }>(
    "capability-resolutions",
    gap ? { companyId, gapId: gap.id } : undefined,
  );
  const acquire = usePluginAction("acquire-capability");
  const [name, setName] = useState("");
  const [license, setLicense] = useState("MIT");
  const [source, setSource] = useState<(typeof CAPABILITY_SOURCES)[number]>("npm-registry");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const runAcquire = useCallback(async () => {
    if (!gap) return;
    setBusy(true);
    setErr(null);
    try {
      // A UI-driven attempt marks smokeTestPassed true (operator asserts the
      // candidate; the license/size gates still apply server-side).
      await acquire({
        companyId,
        gapId: gap.id,
        candidate: { name, license, source, smokeTestPassed: true },
      });
      setName("");
      refresh();
      onChanged();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, gap, name, license, source, acquire, refresh, onChanged]);

  if (!gap) return <></>;

  return (
    <div style={{ ...cardStyle, borderColor: tokens.primary }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600 }}>{gap.title}</div>
        <button style={ghostBtn} onClick={onClose}>Close</button>
      </div>
      <div style={{ color: tokens.muted, fontSize: "0.8rem", marginBottom: "0.75rem" }}>
        {gap.gap_key} · {gap.status}
        {gap.resolved_function_id ? " · resolved to a function" : ""}
      </div>

      {gap.status !== "resolved" && (
        <div style={{ marginBottom: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <input style={inputStyle} placeholder="candidate name" value={name} onChange={(e) => setName(e.target.value)} />
          <input style={inputStyle} placeholder="license" value={license} onChange={(e) => setLicense(e.target.value)} />
          <select style={inputStyle} value={source} onChange={(e) => setSource(e.target.value as (typeof CAPABILITY_SOURCES)[number])}>
            {CAPABILITY_SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button style={btnStyle} disabled={busy || !name.trim()} onClick={runAcquire}>
            {busy ? "…" : "Acquire"}
          </button>
          {err && <span style={{ color: tokens.muted }}>{err}</span>}
        </div>
      )}

      <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.4rem" }}>Resolution trail</div>
      <DataTable
        loading={loading}
        emptyMessage="No acquisition attempts yet."
        rows={(data?.resolutions ?? []) as unknown as Record<string, unknown>[]}
        columns={[
          { key: "source", header: "Source", width: "140px" },
          {
            key: "stage",
            header: "Stage",
            width: "110px",
            render: (v) => <StatusBadge label={String(v)} status={v === "resolved" ? "ok" : v === "failed" ? "error" : "pending"} />,
          },
          {
            key: "license_verdict",
            header: "License",
            width: "100px",
            render: (v) => <StatusBadge label={String(v)} status={v === "allowed" ? "ok" : v === "warn" ? "warning" : "error"} />,
          },
          {
            key: "error",
            header: "Detail",
            render: (v) => (v ? <span style={{ color: tokens.muted }}>{String(v)}</span> : "—"),
          },
        ]}
      />
    </div>
  );
}

function DomainList({
  companyId,
  onOpen,
}: {
  companyId: string;
  onOpen: (domainId: string) => void;
}): ReactElement {
  const { data, loading, error, refresh } = usePluginData<{ domains: OntologyDomain[] }>(
    "list-domains",
    { companyId },
  );
  const createDomain = usePluginAction("create-domain");
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setFormError(null);
    try {
      await createDomain({ companyId, slug, displayName });
      setSlug("");
      setDisplayName("");
      refresh();
    } catch (err) {
      setFormError(String((err as Error)?.message ?? err));
    } finally {
      setBusy(false);
    }
  }, [companyId, slug, displayName, createDomain, refresh]);

  return (
    <>
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>New domain</div>
        <input style={inputStyle} placeholder="slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
        <input
          style={inputStyle}
          placeholder="display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <button style={btnStyle} disabled={busy || !slug || !displayName} onClick={submit}>
          {busy ? "…" : "Create"}
        </button>
        {formError && <div style={{ color: tokens.muted, marginTop: "0.5rem" }}>{formError}</div>}
      </div>

      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : "No ontology domains yet."}
        rows={(data?.domains ?? []) as unknown as Record<string, unknown>[]}
        columns={[
          {
            key: "display_name",
            header: "Domain",
            render: (_v, row) => (
              <button
                style={{ ...btnStyle, background: "transparent", color: tokens.primary, padding: 0 }}
                onClick={() => onOpen((row as unknown as OntologyDomain).id)}
              >
                {(row as unknown as OntologyDomain).display_name}
              </button>
            ),
          },
          { key: "slug", header: "Slug" },
          { key: "version", header: "Version", width: "90px" },
          {
            key: "status",
            header: "Status",
            width: "110px",
            render: (_v, row) => {
              const status = (row as unknown as OntologyDomain).status;
              return <StatusBadge label={status} status={status === "active" ? "ok" : "pending"} />;
            },
          },
        ]}
      />
    </>
  );
}

/**
 * Interactive force-directed graph view of a domain's instance graph. Pure SVG,
 * no external graph lib. Beyond rendering, it supports drag-to-model:
 *  - drag a node to reposition it,
 *  - click empty canvas to add a node,
 *  - toggle Connect mode, then click two nodes to create an edge.
 * New nodes/edges are persisted through create-node / create-edge actions.
 */
function GraphView({
  companyId,
  domainId,
  nodes,
  edges,
  onChanged,
}: {
  companyId: string;
  domainId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onChanged: () => void;
}): ReactElement {
  const W = 640;
  const H = 380;
  const createNode = usePluginAction("create-node");
  const createEdge = usePluginAction("create-edge");
  const updateNode = usePluginAction("update-node");
  const deleteNode = usePluginAction("delete-node");
  const updateEdge = usePluginAction("update-edge");
  const deleteEdge = usePluginAction("delete-edge");
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Manual position overrides from dragging (id -> {x,y}); layout seeds the rest.
  const [overrides, setOverrides] = useState<Map<string, { x: number; y: number }>>(new Map());
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const layout = useMemo(() => {
    const n = nodes.length;
    if (n === 0) return new Map<string, { x: number; y: number }>();
    // Seed on a circle (deterministic), then relax with repulsion + edge springs.
    const pos = new Map<string, { x: number; y: number }>();
    nodes.forEach((node, i) => {
      const a = (2 * Math.PI * i) / n;
      pos.set(node.id, { x: W / 2 + (Math.cos(a) * W) / 3, y: H / 2 + (Math.sin(a) * H) / 3 });
    });
    const idx = new Map(nodes.map((nd, i) => [nd.id, i]));
    const adj = edges
      .map((e) => [idx.get(e.sourceNodeId), idx.get(e.targetNodeId)] as const)
      .filter((p): p is readonly [number, number] => p[0] !== undefined && p[1] !== undefined);
    const arr = nodes.map((nd) => pos.get(nd.id)!);
    for (let iter = 0; iter < 120; iter++) {
      // Repulsion.
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          let dx = arr[i].x - arr[j].x;
          let dy = arr[i].y - arr[j].y;
          let d2 = dx * dx + dy * dy || 0.01;
          const f = 1400 / d2;
          const d = Math.sqrt(d2);
          dx /= d; dy /= d;
          arr[i].x += dx * f; arr[i].y += dy * f;
          arr[j].x -= dx * f; arr[j].y -= dy * f;
        }
      }
      // Edge springs.
      for (const [a, b] of adj) {
        let dx = arr[b].x - arr[a].x;
        let dy = arr[b].y - arr[a].y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - 90) * 0.02;
        dx /= d; dy /= d;
        arr[a].x += dx * f; arr[a].y += dy * f;
        arr[b].x -= dx * f; arr[b].y -= dy * f;
      }
    }
    // Clamp into the viewbox.
    nodes.forEach((nd, i) => {
      arr[i].x = Math.max(24, Math.min(W - 24, arr[i].x));
      arr[i].y = Math.max(24, Math.min(H - 24, arr[i].y));
      pos.set(nd.id, arr[i]);
    });
    return pos;
  }, [nodes, edges]);

  // Effective positions = layout, with dragged nodes overridden.
  const positions = useMemo(() => {
    const m = new Map(layout);
    for (const [id, p] of overrides) m.set(id, p);
    return m;
  }, [layout, overrides]);

  /** Convert a pointer event to SVG-local coordinates. */
  const toSvgPoint = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const sx = W / rect.width;
    const sy = H / rect.height;
    return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
  }, []);

  const addNodeAt = useCallback(
    async (pt: { x: number; y: number }) => {
      setErr(null);
      const label = typeof window !== "undefined" ? window.prompt("New node label") : null;
      if (!label || !label.trim()) return;
      setBusy(true);
      try {
        const key = `n-${Date.now()}`;
        const res = (await createNode({ companyId, domainId, key, label: label.trim() })) as {
          node?: { id: string };
        };
        // Seed the new node at the click point so it lands where you dropped it.
        if (res?.node?.id) {
          setOverrides((prev) => new Map(prev).set(res.node!.id, pt));
        }
        onChanged();
      } catch (e) {
        setErr(String((e as Error)?.message ?? e));
      } finally {
        setBusy(false);
      }
    },
    [companyId, domainId, createNode, onChanged],
  );

  const connect = useCallback(
    async (fromId: string, toId: string) => {
      setErr(null);
      const relationKey = typeof window !== "undefined" ? window.prompt("Relation key (optional)") ?? "" : "";
      setBusy(true);
      try {
        await createEdge({ companyId, domainId, sourceNodeId: fromId, targetNodeId: toId, relationKey: relationKey.trim() || undefined });
        onChanged();
      } catch (e) {
        setErr(String((e as Error)?.message ?? e));
      } finally {
        setBusy(false);
        setLinkFrom(null);
      }
    },
    [companyId, domainId, createEdge, onChanged],
  );

  // Inline right-click context menu state (game-style).
  const [menu, setMenu] = useState<
    | { kind: "node"; id: string; label: string; x: number; y: number }
    | { kind: "edge"; id: string; label: string; x: number; y: number }
    | null
  >(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const renameNode = useCallback(
    async (id: string, current: string) => {
      const label = typeof window !== "undefined" ? window.prompt("Node label", current) : null;
      if (!label || !label.trim()) return;
      setBusy(true); setErr(null);
      try { await updateNode({ companyId, nodeId: id, label: label.trim() }); onChanged(); }
      catch (e) { setErr(String((e as Error)?.message ?? e)); }
      finally { setBusy(false); }
    },
    [companyId, updateNode, onChanged],
  );
  const removeNode = useCallback(
    async (id: string) => {
      if (typeof window !== "undefined" && !window.confirm("Delete this node and its edges?")) return;
      setBusy(true); setErr(null);
      try { await deleteNode({ companyId, nodeId: id }); onChanged(); }
      catch (e) { setErr(String((e as Error)?.message ?? e)); }
      finally { setBusy(false); }
    },
    [companyId, deleteNode, onChanged],
  );
  const renameEdge = useCallback(
    async (id: string, current: string) => {
      const relationKey = typeof window !== "undefined" ? window.prompt("Relation key", current) ?? "" : "";
      setBusy(true); setErr(null);
      try { await updateEdge({ companyId, edgeId: id, relationKey: relationKey.trim() || null }); onChanged(); }
      catch (e) { setErr(String((e as Error)?.message ?? e)); }
      finally { setBusy(false); }
    },
    [companyId, updateEdge, onChanged],
  );
  const removeEdge = useCallback(
    async (id: string) => {
      if (typeof window !== "undefined" && !window.confirm("Delete this edge?")) return;
      setBusy(true); setErr(null);
      try { await deleteEdge({ companyId, edgeId: id }); onChanged(); }
      catch (e) { setErr(String((e as Error)?.message ?? e)); }
      finally { setBusy(false); }
    },
    [companyId, deleteEdge, onChanged],
  );

  // Left-drag to reposition a node.
  const onNodePointerDown = useCallback((e: ReactPointerEvent, id: string) => {
    if (e.button !== 0) return; // left only; right is the context menu
    e.stopPropagation();
    dragRef.current = { id, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, []);
  const onSvgPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      d.moved = true;
      const pt = toSvgPoint(e.clientX, e.clientY);
      setOverrides((prev) => new Map(prev).set(d.id, { x: Math.max(12, Math.min(W - 12, pt.x)), y: Math.max(12, Math.min(H - 12, pt.y)) }));
    },
    [toSvgPoint],
  );
  const onSvgPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Right-click node: if a connection is in progress, complete it to this node;
  // otherwise open a context menu (rename / delete / connect from here).
  const onNodeContextMenu = useCallback(
    (e: ReactMouseEvent, id: string, label: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (linkFrom && linkFrom !== id) {
        void connect(linkFrom, id);
        return;
      }
      setMenu({ kind: "node", id, label, x: e.clientX, y: e.clientY });
    },
    [linkFrom, connect],
  );

  // Right-click edge: context menu (rename relation / delete).
  const onEdgeContextMenu = useCallback((e: ReactMouseEvent, id: string, label: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ kind: "edge", id, label, x: e.clientX, y: e.clientY });
  }, []);

  // Right-click empty canvas: add a node here.
  const onCanvasContextMenu = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      const pt = toSvgPoint(e.clientX, e.clientY);
      void addNodeAt(pt);
    },
    [toSvgPoint, addNodeAt],
  );

  return (
    <div style={{ ...cardStyle, overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <div style={{ fontWeight: 600 }}>Graph</div>
        <div style={{ color: tokens.muted, fontSize: "0.75rem" }}>
          {linkFrom
            ? "Connecting… right-click a target node to link, or the source to cancel"
            : "Right-click: canvas=add · node=menu · edge=menu · drag=move"}
          {busy ? " · saving…" : ""}
        </div>
      </div>
      {err && <div style={{ color: tokens.muted, marginBottom: "0.5rem" }}>{err}</div>}
      {nodes.length === 0 ? (
        <div
          onContextMenu={onCanvasContextMenu}
          style={{ color: tokens.muted, border: `1px dashed ${tokens.border}`, borderRadius: "0.5rem", padding: "2rem", textAlign: "center" }}
        >
          No nodes yet. Right-click here to add the first node.
        </div>
      ) : (
        <svg
          ref={svgRef}
          width={W}
          height={H}
          style={{ maxWidth: "100%", border: `1px solid ${tokens.border}`, borderRadius: "0.5rem", background: tokens.bg, touchAction: "none" }}
          onContextMenu={onCanvasContextMenu}
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onPointerLeave={onSvgPointerUp}
        >
          {edges.map((e) => {
            const a = positions.get(e.sourceNodeId);
            const b = positions.get(e.targetNodeId);
            if (!a || !b) return null;
            return (
              <g key={e.id} onContextMenu={(ev) => onEdgeContextMenu(ev, e.id, e.relationKey ?? "")} style={{ cursor: "context-menu" }}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={tokens.border} strokeWidth={1.2} />
                {/* Invisible wide hit-line so the edge is easy to right-click. */}
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={10} />
                {e.relationKey && (
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 3} fill={tokens.muted} fontSize={9} textAnchor="middle">
                    {e.relationKey}
                  </text>
                )}
              </g>
            );
          })}
          {nodes.map((nd) => {
            const p = positions.get(nd.id);
            if (!p) return null;
            const isLinkSource = linkFrom === nd.id;
            return (
              <g
                key={nd.id}
                style={{ cursor: "grab" }}
                onPointerDown={(e) => onNodePointerDown(e, nd.id)}
                onContextMenu={(e) => onNodeContextMenu(e, nd.id, nd.label || nd.key)}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isLinkSource ? 9 : 7}
                  fill={isLinkSource ? tokens.fg : tokens.primary}
                  stroke={isLinkSource ? tokens.primary : "none"}
                  strokeWidth={isLinkSource ? 2 : 0}
                />
                <text x={p.x + 10} y={p.y + 3} fill={tokens.fg} fontSize={11}>
                  {nd.label || nd.key}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {menu && (
        <>
          {/* click-catcher to dismiss */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={closeMenu}
            onContextMenu={(e) => { e.preventDefault(); closeMenu(); }}
          />
          <div
            style={{
              position: "fixed",
              left: menu.x,
              top: menu.y,
              zIndex: 41,
              background: tokens.card,
              border: `1px solid ${tokens.border}`,
              borderRadius: "0.5rem",
              padding: "0.25rem",
              minWidth: "9rem",
              boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
            }}
          >
            {menu.kind === "node" ? (
              <>
                <MenuItem label="Rename" onClick={() => { const m = menu; closeMenu(); void renameNode(m.id, m.label); }} />
                <MenuItem label="Connect from here" onClick={() => { setLinkFrom(menu.id); closeMenu(); }} />
                <MenuItem label="Delete" danger onClick={() => { const m = menu; closeMenu(); void removeNode(m.id); }} />
              </>
            ) : (
              <>
                <MenuItem label="Rename relation" onClick={() => { const m = menu; closeMenu(); void renameEdge(m.id, m.label); }} />
                <MenuItem label="Delete" danger onClick={() => { const m = menu; closeMenu(); void removeEdge(m.id); }} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }): ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: "none",
        color: danger ? "var(--destructive, oklch(0.6 0.2 25))" : tokens.fg,
        padding: "0.4rem 0.6rem",
        borderRadius: "0.35rem",
        cursor: "pointer",
        fontSize: "0.85rem",
      }}
    >
      {label}
    </button>
  );
}

/** Evaluation + simulation dashboard for a domain (DS OntologyEval / Simulation). */
function EvaluationSection({ companyId, domainId }: { companyId: string; domainId: string }): ReactElement {
  const { data, loading, error, refresh } = usePluginData<{ evals: EvalRow[]; simulations: SimulationRow[] }>(
    "domain-evaluation",
    { companyId, domainId },
  );
  const createEval = usePluginAction("create-eval");
  const createSim = usePluginAction("create-simulation-scenario");
  const [evalName, setEvalName] = useState("");
  const [evalType, setEvalType] = useState<(typeof EVAL_METRIC_TYPES)[number]>("accuracy");
  const [simName, setSimName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addEval = useCallback(async () => {
    if (!evalName.trim()) return;
    setBusy(true); setErr(null);
    try { await createEval({ companyId, domainId, name: evalName.trim(), evalType }); setEvalName(""); refresh(); }
    catch (e) { setErr(String((e as Error)?.message ?? e)); } finally { setBusy(false); }
  }, [companyId, domainId, evalName, evalType, createEval, refresh]);

  const addSim = useCallback(async () => {
    if (!simName.trim()) return;
    setBusy(true); setErr(null);
    try { await createSim({ companyId, domainId, name: simName.trim() }); setSimName(""); refresh(); }
    catch (e) { setErr(String((e as Error)?.message ?? e)); } finally { setBusy(false); }
  }, [companyId, domainId, simName, createSim, refresh]);

  const evals = data?.evals ?? [];
  const sims = data?.simulations ?? [];
  const passed = evals.filter((e) => e.status === "completed").length;
  const avgScore = evals.filter((e) => e.score != null);
  const avg = avgScore.length ? (avgScore.reduce((s, e) => s + (e.score ?? 0), 0) / avgScore.length).toFixed(2) : "—";

  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Evaluation &amp; simulation</div>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <MetricCard label="Evals" value={evals.length} />
        <MetricCard label="Completed" value={passed} />
        <MetricCard label="Avg score" value={avg} />
        <MetricCard label="Scenarios" value={sims.length} />
      </div>

      <div style={{ marginBottom: "0.5rem" }}>
        <input style={inputStyle} placeholder="new eval name" value={evalName} onChange={(e) => setEvalName(e.target.value)} />
        <select style={inputStyle} value={evalType} onChange={(e) => setEvalType(e.target.value as (typeof EVAL_METRIC_TYPES)[number])}>
          {EVAL_METRIC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button style={btnStyle} disabled={busy || !evalName.trim()} onClick={addEval}>{busy ? "…" : "Add eval"}</button>
      </div>
      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : "No evals yet."}
        rows={evals as unknown as Record<string, unknown>[]}
        columns={[
          { key: "name", header: "Eval" },
          { key: "eval_type", header: "Metric", width: "130px" },
          { key: "score", header: "Score", width: "80px", render: (v) => (v == null ? "—" : String(v)) },
          {
            key: "status",
            header: "Status",
            width: "110px",
            render: (v) => <StatusBadge label={String(v)} status={v === "completed" ? "ok" : v === "failed" ? "error" : v === "running" ? "info" : "pending"} />,
          },
        ]}
      />

      <div style={{ margin: "0.75rem 0 0.5rem" }}>
        <input style={inputStyle} placeholder="new scenario name" value={simName} onChange={(e) => setSimName(e.target.value)} />
        <button style={btnStyle} disabled={busy || !simName.trim()} onClick={addSim}>{busy ? "…" : "Add scenario"}</button>
      </div>
      <DataTable
        loading={loading}
        emptyMessage="No simulation scenarios yet."
        rows={sims as unknown as Record<string, unknown>[]}
        columns={[
          { key: "name", header: "Scenario" },
          { key: "recommended_strategy", header: "Recommended", render: (v) => (v ? String(v) : "—") },
          {
            key: "status",
            header: "Status",
            width: "110px",
            render: (v) => <StatusBadge label={String(v)} status={v === "completed" ? "ok" : v === "failed" ? "error" : v === "running" ? "info" : "pending"} />,
          },
        ]}
      />
      {err && <div style={{ color: tokens.muted, marginTop: "0.5rem" }}>{err}</div>}
    </div>
  );
}

function DomainDetailView({
  companyId,
  domainId,
  onBack,
}: {
  companyId: string;
  domainId: string;
  onBack: () => void;
}): ReactElement {
  const { data, loading, error, refresh } = usePluginData<DomainDetail>("domain-detail", {
    companyId,
    domainId,
  });
  const createNodeType = usePluginAction("create-node-type");
  const createRelationType = usePluginAction("create-relation-type");

  const domain = data?.domain;
  const counts = data?.graph?.counts;

  return (
    <>
      <button style={{ ...btnStyle, background: "transparent", color: tokens.primary, padding: 0, marginBottom: "0.75rem" }} onClick={onBack}>
        ← Back
      </button>

      {loading && <p style={{ color: tokens.muted }}>Loading…</p>}
      {error && <p style={{ color: tokens.muted }}>Failed: {error.message}</p>}

      {domain && (
        <>
          <div style={cardStyle}>
            <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>{domain.display_name}</div>
            <div style={{ color: tokens.muted, fontSize: "0.85rem" }}>
              {domain.slug} · v{domain.version} · {domain.status}
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
            <MetricCard label="Node types" value={counts?.nodeTypes ?? 0} />
            <MetricCard label="Relation types" value={counts?.relationTypes ?? 0} />
            <MetricCard label="Nodes" value={counts?.nodes ?? 0} />
            <MetricCard label="Edges" value={counts?.edges ?? 0} />
          </div>

          <GraphView
            companyId={companyId}
            domainId={domainId}
            nodes={data?.graph?.nodes ?? []}
            edges={data?.graph?.edges ?? []}
            onChanged={refresh}
          />

          <TypeSection
            title="Node types"
            rows={(data?.nodeTypes ?? []) as unknown as Record<string, unknown>[]}
            columns={[
              { key: "key", header: "Key" },
              { key: "display_name", header: "Display name" },
              { key: "description", header: "Description" },
            ]}
            onCreate={async (key, displayName) => {
              await createNodeType({ companyId, domainId, key, displayName });
              refresh();
            }}
          />

          <TypeSection
            title="Relation types"
            rows={(data?.relationTypes ?? []) as unknown as Record<string, unknown>[]}
            columns={[
              { key: "key", header: "Key" },
              { key: "display_name", header: "Display name" },
              {
                key: "directed",
                header: "Directed",
                width: "100px",
                render: (v: unknown) => (v ? "yes" : "no"),
              },
            ]}
            onCreate={async (key, displayName) => {
              await createRelationType({ companyId, domainId, key, displayName });
              refresh();
            }}
          />

          <EvaluationSection companyId={companyId} domainId={domainId} />
        </>
      )}
    </>
  );
}

interface TypeColumn {
  key: string;
  header: string;
  width?: string;
  render?: (value: unknown, row: Record<string, unknown>) => ReactElement | string;
}

function TypeSection({
  title,
  rows,
  columns,
  onCreate,
}: {
  title: string;
  rows: Record<string, unknown>[];
  columns: TypeColumn[];
  onCreate: (key: string, displayName: string) => Promise<void>;
}): ReactElement {
  const [key, setKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      await onCreate(key, displayName);
      setKey("");
      setDisplayName("");
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [key, displayName, onCreate]);

  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{title}</div>
      <div style={{ marginBottom: "0.75rem" }}>
        <input style={inputStyle} placeholder="key" value={key} onChange={(e) => setKey(e.target.value)} />
        <input
          style={inputStyle}
          placeholder="display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <button style={btnStyle} disabled={busy || !key || !displayName} onClick={submit}>
          {busy ? "…" : "Add"}
        </button>
        {err && <div style={{ color: tokens.muted, marginTop: "0.5rem" }}>{err}</div>}
      </div>
      <DataTable rows={rows} columns={columns} emptyMessage="None yet." />
    </div>
  );
}
