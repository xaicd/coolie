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
  useState,
  type ReactElement,
} from "react";
import { GraphView, type GraphNode, type GraphEdge } from "./graph-view.js";

/**
 * Minimal plugin-side i18n. Plugin UI runs sandboxed and does not receive the
 * host locale through the SDK context, but it shares the browser with the host,
 * which persists the chosen UI language in localStorage under "coolie.locale".
 * We read that and pick Chinese vs English. `zh`, `zh-CN`, `zh-TW` all count as
 * Chinese; everything else falls back to English.
 */
function isZh(): boolean {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem("coolie.locale") : null;
    const lang = (v || (typeof navigator !== "undefined" ? navigator.language : "") || "en").toLowerCase();
    return lang.startsWith("zh");
  } catch {
    return false;
  }
}
/** Pick a localized string: t(chinese, english). Evaluated at render time. */
function t(zh: string, en: string): string {
  return isZh() ? zh : en;
}

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

const DATASET_FORMATS = ["csv", "parquet", "json", "database_table"] as const;
const CONNECTOR_TYPES = ["mysql", "postgresql", "mongodb", "rest-api", "s3"] as const;
const TRANSFORM_TYPES = ["sql", "python"] as const;

interface DatasetRow {
  id: string;
  key: string;
  name: string;
  format: string;
  current_version: number;
  lifecycle_state: string;
}
interface ConnectorRow {
  id: string;
  key: string;
  name: string;
  connector_type: string;
  status: string;
}
interface TransformRow {
  id: string;
  key: string;
  name: string;
  transform_type: string;
  status: string;
}

// Token-class styling (host design system). Kept as string constants so the
// existing components can swap `className={CARD}` -> `className={CARD}` without
// a full rewrite, giving the whole page the host's dark-card look.
const PAGE = "p-6 bg-background text-foreground min-h-full";
const CARD = "mb-3 rounded-xl border border-border bg-card p-4";
const INPUT =
  "mr-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-(length:--text-compact) " +
  "text-foreground outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring";
const BTN =
  "rounded-md bg-primary px-3 py-1.5 text-(length:--text-compact) font-medium text-primary-foreground " +
  "transition-colors hover:opacity-90 disabled:opacity-50";
const GHOST_BTN =
  "rounded-md px-0 py-0 text-(length:--text-compact) font-medium text-primary transition-colors hover:underline";
const TAB_ON = "rounded-md bg-primary px-3 py-1.5 text-(length:--text-compact) font-medium text-primary-foreground";
const TAB_OFF =
  "rounded-md px-3 py-1.5 text-(length:--text-compact) font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50";
const SECTION_TITLE = "mb-2 text-(length:--text-compact) font-semibold";
const MUTED = "text-(length:--text-nano) text-muted-foreground";

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



/** Full-page ontology view: Domains modeling + Capabilities acquisition. */
export function OntologyPage({ context }: PluginPageProps): ReactElement {
  const companyId = context.companyId ?? undefined;
  const [tab, setTab] = useState<"domains" | "cognition" | "capabilities">("domains");
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);

  if (!companyId) {
    return (
      <div className={PAGE}>
        <p className="text-muted-foreground">{t("请选择公司以建模其本体。", "Select a company to model its ontology.")}</p>
      </div>
    );
  }

  return (
    <div className={PAGE}>
      <h1 className="mb-3 text-xl">{t("本体", "Ontology")}</h1>
      <div className="mb-4 flex gap-2">
        <button
          className={tab === "domains" ? TAB_ON : TAB_OFF}
          onClick={() => setTab("domains")}
        >
          {t("域", "Domains")}
        </button>
        <button
          className={tab === "cognition" ? TAB_ON : TAB_OFF}
          onClick={() => setTab("cognition")}
        >
          {t("认知", "Cognition")}
        </button>
        <button
          className={tab === "capabilities" ? TAB_ON : TAB_OFF}
          onClick={() => setTab("capabilities")}
        >
          {t("能力", "Capabilities")}
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
      <div className={CARD}>
        <div className="mb-1 font-semibold">New cognition job</div>
        <div className="mb-2 text-xs text-muted-foreground">
          Reverse-engineer an ontology draft from source code (TS/JS/Vue/Py/Go/Java/SQL).
        </div>
        <input className={INPUT} placeholder="app name (optional)" value={appName} onChange={(e) => setAppName(e.target.value)} />
        <input className={INPUT} placeholder="root path (e.g. .)" value={rootPath} onChange={(e) => setRootPath(e.target.value)} />
        <button className={BTN} disabled={busy} onClick={submit}>
          {busy ? "…" : t("创建","Create")}
        </button>
        {err && <div className="mt-2 text-sm text-muted-foreground">{err}</div>}
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
              <button className={GHOST_BTN} onClick={() => setOpenJobId((row as unknown as CognitionJob).id)}>
                {(row as unknown as CognitionJob).app_name || (row as unknown as CognitionJob).job_key}
              </button>
            ),
          },
          { key: "progress_pct", header: "%", width: "70px" },
          {
            key: "status",
            header: t("状态","Status"),
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
    <div className="mb-3 rounded-xl border border-primary bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{job?.app_name || job?.job_key || "Cognition job"}</div>
        <button className={GHOST_BTN} onClick={onClose}>Close</button>
      </div>
      {loading && <p className="text-muted-foreground">Loading…</p>}
      {job && (
        <div className="mb-3 text-xs text-muted-foreground">
          {job.status} · {job.stage_label || "—"} · {job.progress_pct}%
        </div>
      )}

      <div className="mb-1 text-xs font-semibold">1 · Ingest code</div>
      <input className={INPUT + " mb-1"} placeholder="file path (e.g. src/order.ts)" value={filePath} onChange={(e) => setFilePath(e.target.value)} />
      <textarea
        className={INPUT + " mr-0 w-full min-h-32 resize-y font-mono"}
        placeholder="Paste source code to reverse-engineer…"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <div className="mt-2">
        <button className={BTN} disabled={busy || !code.trim()} onClick={runIngest}>
          {busy ? "…" : "Extract draft"}
        </button>
      </div>

      <div className="my-3 flex flex-wrap gap-3">
        <MetricCard label={t("节点类型","Node types")} value={nt} />
        <MetricCard label={t("关系类型","Relation types")} value={rt} />
        <MetricCard label={t("动作类型","Action types")} value={at} />
      </div>

      <div className="mb-1 text-xs font-semibold">2 · Publish to a domain</div>
      <select className={INPUT} value={targetDomain} onChange={(e) => setTargetDomain(e.target.value)}>
        <option value="">select target domain…</option>
        {(domainsData?.domains ?? []).map((d) => (
          <option key={d.id} value={d.id}>{d.display_name}</option>
        ))}
      </select>
      <button className={BTN} disabled={busy || !targetDomain || nt + rt + at === 0} onClick={runPublish}>
        {busy ? "…" : "Publish draft"}
      </button>

      {msg && <div className="mt-2 text-sm text-foreground">✓ {msg}</div>}
      {err && <div className="mt-2 text-sm text-muted-foreground">{err}</div>}
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
      <div className={CARD}>
        <div className="mb-2 font-semibold">New capability gap</div>
        <input
          className={INPUT + " min-w-80"}
          placeholder="what capability is missing?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className={BTN} disabled={busy || !title.trim()} onClick={submit}>
          {busy ? "…" : "Detect"}
        </button>
        {err && <div className="mt-2 text-sm text-muted-foreground">{err}</div>}
      </div>

      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : "No capability gaps yet."}
        rows={gaps as unknown as Record<string, unknown>[]}
        columns={[
          {
            key: "title",
            header: t("能力缺口","Capability gap"),
            render: (_v, row) => (
              <button className={GHOST_BTN} onClick={() => setOpenGapId((row as unknown as CapabilityGap).id)}>
                {(row as unknown as CapabilityGap).title}
              </button>
            ),
          },
          { key: "priority", header: t("优先级","Priority"), width: "90px" },
          {
            key: "status",
            header: t("状态","Status"),
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
    <div className="mb-3 rounded-xl border border-primary bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{gap.title}</div>
        <button className={GHOST_BTN} onClick={onClose}>Close</button>
      </div>
      <div className="mb-3 text-xs text-muted-foreground">
        {gap.gap_key} · {gap.status}
        {gap.resolved_function_id ? " · resolved to a function" : ""}
      </div>

      {gap.status !== "resolved" && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input className={INPUT} placeholder="candidate name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={INPUT} placeholder="license" value={license} onChange={(e) => setLicense(e.target.value)} />
          <select className={INPUT} value={source} onChange={(e) => setSource(e.target.value as (typeof CAPABILITY_SOURCES)[number])}>
            {CAPABILITY_SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button className={BTN} disabled={busy || !name.trim()} onClick={runAcquire}>
            {busy ? "…" : "Acquire"}
          </button>
          {err && <span className="text-muted-foreground">{err}</span>}
        </div>
      )}

      <div className="mb-1 text-xs font-semibold">Resolution trail</div>
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
            render: (v) => (v ? <span className="text-muted-foreground">{String(v)}</span> : "—"),
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
      <div className={CARD}>
        <div className="mb-2 font-semibold">{t("新建域", "New domain")}</div>
        <input className={INPUT} placeholder={t("标识 (slug)", "slug")} value={slug} onChange={(e) => setSlug(e.target.value)} />
        <input
          className={INPUT}
          placeholder={t("显示名称", "display name")}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <button className={BTN} disabled={busy || !slug || !displayName} onClick={submit}>
          {busy ? "…" : t("创建","Create")}
        </button>
        {formError && <div className="mt-2 text-sm text-muted-foreground">{formError}</div>}
      </div>

      <DataTable
        loading={loading}
        emptyMessage={error ? `${t("失败","Failed")}: ${error.message}` : t("还没有本体域,先在上方新建一个。", "No ontology domains yet.")}
        rows={(data?.domains ?? []) as unknown as Record<string, unknown>[]}
        columns={[
          {
            key: "display_name",
            header: t("域","Domain"),
            render: (_v, row) => (
              <button
                className={GHOST_BTN}
                onClick={() => onOpen((row as unknown as OntologyDomain).id)}
              >
                {(row as unknown as OntologyDomain).display_name}
              </button>
            ),
          },
          { key: "slug", header: t("标识","Slug") },
          { key: "version", header: t("版本","Version"), width: "90px" },
          {
            key: "status",
            header: t("状态","Status"),
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
    <div className={CARD}>
      <div className="mb-2 font-semibold">{t("评估与模拟", "Evaluation & simulation")}</div>

      <div className="mb-3 flex flex-wrap gap-3">
        <MetricCard label={t("评估","Evals")} value={evals.length} />
        <MetricCard label={t("已完成","Completed")} value={passed} />
        <MetricCard label={t("平均分","Avg score")} value={avg} />
        <MetricCard label={t("场景","Scenarios")} value={sims.length} />
      </div>

      <div className="mb-2">
        <input className={INPUT} placeholder="new eval name" value={evalName} onChange={(e) => setEvalName(e.target.value)} />
        <select className={INPUT} value={evalType} onChange={(e) => setEvalType(e.target.value as (typeof EVAL_METRIC_TYPES)[number])}>
          {EVAL_METRIC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className={BTN} disabled={busy || !evalName.trim()} onClick={addEval}>{busy ? "…" : t("添加评估","Add eval")}</button>
      </div>
      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : "No evals yet."}
        rows={evals as unknown as Record<string, unknown>[]}
        columns={[
          { key: "name", header: t("评估","Eval") },
          { key: "eval_type", header: t("指标","Metric"), width: "130px" },
          { key: "score", header: t("分数","Score"), width: "80px", render: (v) => (v == null ? "—" : String(v)) },
          {
            key: "status",
            header: t("状态","Status"),
            width: "110px",
            render: (v) => <StatusBadge label={String(v)} status={v === "completed" ? "ok" : v === "failed" ? "error" : v === "running" ? "info" : "pending"} />,
          },
        ]}
      />

      <div className="mb-2 mt-3">
        <input className={INPUT} placeholder="new scenario name" value={simName} onChange={(e) => setSimName(e.target.value)} />
        <button className={BTN} disabled={busy || !simName.trim()} onClick={addSim}>{busy ? "…" : t("添加场景","Add scenario")}</button>
      </div>
      <DataTable
        loading={loading}
        emptyMessage="No simulation scenarios yet."
        rows={sims as unknown as Record<string, unknown>[]}
        columns={[
          { key: "name", header: t("场景","Scenario") },
          { key: "recommended_strategy", header: "Recommended", render: (v) => (v ? String(v) : "—") },
          {
            key: "status",
            header: t("状态","Status"),
            width: "110px",
            render: (v) => <StatusBadge label={String(v)} status={v === "completed" ? "ok" : v === "failed" ? "error" : v === "running" ? "info" : "pending"} />,
          },
        ]}
      />
      {err && <div className="mt-2 text-sm text-muted-foreground">{err}</div>}
    </div>
  );
}

function pipelineStatusKind(s: string): "ok" | "pending" | "error" | "info" {
  if (s === "active" || s === "connected" || s === "succeeded") return "ok";
  if (s === "failed" || s === "error") return "error";
  if (s === "running" || s === "syncing") return "info";
  return "pending";
}

/** Data pipeline for a domain: datasets, connectors, transforms (DS data pipeline). */
function PipelineSection({ companyId, domainId }: { companyId: string; domainId: string }): ReactElement {
  const { data, loading, error, refresh } = usePluginData<{
    datasets: DatasetRow[];
    connectors: ConnectorRow[];
    transforms: TransformRow[];
  }>("domain-pipeline", { companyId, domainId });
  const createDataset = usePluginAction("create-dataset");
  const createConnector = usePluginAction("create-connector");
  const createTransform = usePluginAction("create-transform");
  const [dsName, setDsName] = useState("");
  const [dsFormat, setDsFormat] = useState<(typeof DATASET_FORMATS)[number]>("csv");
  const [connName, setConnName] = useState("");
  const [connType, setConnType] = useState<(typeof CONNECTOR_TYPES)[number]>("postgresql");
  const [tfName, setTfName] = useState("");
  const [tfType, setTfType] = useState<(typeof TRANSFORM_TYPES)[number]>("sql");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true); setErr(null);
      try { await fn(); refresh(); }
      catch (e) { setErr(String((e as Error)?.message ?? e)); }
      finally { setBusy(false); }
    },
    [refresh],
  );

  const datasets = data?.datasets ?? [];
  const connectors = data?.connectors ?? [];
  const transforms = data?.transforms ?? [];

  return (
    <div className={CARD}>
      <div className="mb-2 font-semibold">{t("数据管道", "Data pipeline")}</div>
      <div className="mb-3 flex flex-wrap gap-3">
        <MetricCard label={t("数据集","Datasets")} value={datasets.length} />
        <MetricCard label={t("连接器","Connectors")} value={connectors.length} />
        <MetricCard label={t("转换","Transforms")} value={transforms.length} />
      </div>

      <div className="mb-1">
        <input className={INPUT} placeholder="dataset name" value={dsName} onChange={(e) => setDsName(e.target.value)} />
        <select className={INPUT} value={dsFormat} onChange={(e) => setDsFormat(e.target.value as (typeof DATASET_FORMATS)[number])}>
          {DATASET_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <button className={BTN} disabled={busy || !dsName.trim()} onClick={() => run(async () => { await createDataset({ companyId, domainId, name: dsName.trim(), format: dsFormat }); setDsName(""); })}>{t("添加数据集","Add dataset")}</button>
      </div>
      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : "No datasets."}
        rows={datasets as unknown as Record<string, unknown>[]}
        columns={[
          { key: "name", header: t("数据集","Dataset") },
          { key: "format", header: t("格式","Format"), width: "120px" },
          { key: "current_version", header: "Ver", width: "70px" },
          { key: "lifecycle_state", header: "State", width: "110px", render: (v) => <StatusBadge label={String(v)} status={pipelineStatusKind(String(v))} /> },
        ]}
      />

      <div className="mb-1 mt-3">
        <input className={INPUT} placeholder="connector name" value={connName} onChange={(e) => setConnName(e.target.value)} />
        <select className={INPUT} value={connType} onChange={(e) => setConnType(e.target.value as (typeof CONNECTOR_TYPES)[number])}>
          {CONNECTOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className={BTN} disabled={busy || !connName.trim()} onClick={() => run(async () => { await createConnector({ companyId, domainId, name: connName.trim(), connectorType: connType }); setConnName(""); })}>{t("添加连接器","Add connector")}</button>
      </div>
      <DataTable
        loading={loading}
        emptyMessage="No connectors."
        rows={connectors as unknown as Record<string, unknown>[]}
        columns={[
          { key: "name", header: t("连接器","Connector") },
          { key: "connector_type", header: t("类型","Type"), width: "120px" },
          { key: "status", header: t("状态","Status"), width: "110px", render: (v) => <StatusBadge label={String(v)} status={pipelineStatusKind(String(v))} /> },
        ]}
      />

      <div className="mb-1 mt-3">
        <input className={INPUT} placeholder="transform name" value={tfName} onChange={(e) => setTfName(e.target.value)} />
        <select className={INPUT} value={tfType} onChange={(e) => setTfType(e.target.value as (typeof TRANSFORM_TYPES)[number])}>
          {TRANSFORM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className={BTN} disabled={busy || !tfName.trim()} onClick={() => run(async () => { await createTransform({ companyId, domainId, name: tfName.trim(), transformType: tfType }); setTfName(""); })}>{t("添加转换","Add transform")}</button>
      </div>
      <DataTable
        loading={loading}
        emptyMessage="No transforms."
        rows={transforms as unknown as Record<string, unknown>[]}
        columns={[
          { key: "name", header: t("转换","Transform") },
          { key: "transform_type", header: t("类型","Type"), width: "100px" },
          { key: "status", header: t("状态","Status"), width: "110px", render: (v) => <StatusBadge label={String(v)} status={pipelineStatusKind(String(v))} /> },
        ]}
      />
      {err && <div className="mt-2 text-sm text-muted-foreground">{err}</div>}
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
      <button className={GHOST_BTN + " mb-3"} onClick={onBack}>
        {t("← 返回","← Back")}
      </button>

      {loading && <p className="text-muted-foreground">Loading…</p>}
      {error && <p className="text-muted-foreground">Failed: {error.message}</p>}

      {domain && (
        <>
          <div className={CARD}>
            <div className="text-lg font-semibold">{domain.display_name}</div>
            <div className="text-sm text-muted-foreground">
              {domain.slug} · v{domain.version} · {domain.status}
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-3">
            <MetricCard label={t("节点类型","Node types")} value={counts?.nodeTypes ?? 0} />
            <MetricCard label={t("关系类型","Relation types")} value={counts?.relationTypes ?? 0} />
            <MetricCard label={t("节点","Nodes")} value={counts?.nodes ?? 0} />
            <MetricCard label={t("边","Edges")} value={counts?.edges ?? 0} />
          </div>

          <GraphView
            companyId={companyId}
            domainId={domainId}
            nodes={data?.graph?.nodes ?? []}
            edges={data?.graph?.edges ?? []}
            onChanged={refresh}
          />

          <TypeSection
            title={t("节点类型","Node types")}
            rows={(data?.nodeTypes ?? []) as unknown as Record<string, unknown>[]}
            columns={[
              { key: "key", header: t("键","Key") },
              { key: "display_name", header: t("显示名称","Display name") },
              { key: "description", header: t("描述","Description") },
            ]}
            onCreate={async (key, displayName) => {
              await createNodeType({ companyId, domainId, key, displayName });
              refresh();
            }}
          />

          <TypeSection
            title={t("关系类型","Relation types")}
            rows={(data?.relationTypes ?? []) as unknown as Record<string, unknown>[]}
            columns={[
              { key: "key", header: t("键","Key") },
              { key: "display_name", header: t("显示名称","Display name") },
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
          <PipelineSection companyId={companyId} domainId={domainId} />
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
    <div className={CARD}>
      <div className="mb-2 font-semibold">{title}</div>
      <div className="mb-3">
        <input className={INPUT} placeholder="key" value={key} onChange={(e) => setKey(e.target.value)} />
        <input
          className={INPUT}
          placeholder={t("显示名称", "display name")}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <button className={BTN} disabled={busy || !key || !displayName} onClick={submit}>
          {busy ? "…" : t("添加","Add")}
        </button>
        {err && <div className="mt-2 text-sm text-muted-foreground">{err}</div>}
      </div>
      <DataTable rows={rows} columns={columns} emptyMessage="None yet." />
    </div>
  );
}
