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
import { type GraphNode, type GraphEdge, type GraphNodeType, GraphView, toneFor } from "./graph-view.js";
import { Workbench } from "./workbench.js";

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

/**
 * Derive a URL-safe slug from a display name. ASCII letters/digits are kept
 * (lowercased, spaces → hyphens); any name that reduces to empty (e.g. a
 * purely-CJK name) falls back to a short timestamp-based slug so the user
 * never has to type a slug by hand.
 */
function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base) return base;
  // CJK / non-ASCII names: fall back to a stable short id.
  return `domain-${Date.now().toString(36)}`;
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



/** Full-page ontology workbench — three-column layout matching DS's ontology workbench. */
export function OntologyPage({ context }: PluginPageProps): ReactElement {
  const companyId = context.companyId ?? undefined;

  if (!companyId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {t("请选择公司以建模其本体。", "Select a company to model its ontology.")}
      </div>
    );
  }

  return <OntologyWorkbench companyId={companyId} />;
}

type WorkbenchView = "graph" | "table" | "schema" | "cognition" | "capabilities";

const DRAG_MIME = "application/x-ontology-node-type-id";

function OntologyWorkbench({ companyId }: { companyId: string }): ReactElement {
  const { data: domainsData, loading: domainsLoading, refresh: refreshDomains } = usePluginData<{ domains: OntologyDomain[] }>(
    "list-domains", { companyId }
  );
  const domains = domainsData?.domains ?? [];

  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [view, setView] = useState<WorkbenchView>("graph");
  const [rightOpen, setRightOpen] = useState(true);
  const [showNewDomain, setShowNewDomain] = useState(false);

  // Auto-select first domain
  const activeDomainId = selectedDomainId ?? domains[0]?.id ?? null;
  const activeDomain = domains.find(d => d.id === activeDomainId) ?? null;

  const views: { id: WorkbenchView; label: string; icon: string }[] = [
    { id: "graph", label: t("图谱", "Graph"), icon: "⬡" },
    { id: "table", label: t("表格", "Table"), icon: "⊞" },
    { id: "schema", label: "Schema", icon: "⊙" },
    { id: "cognition", label: t("认知", "Cognition"), icon: "⚡" },
    { id: "capabilities", label: t("能力", "Capabilities"), icon: "◈" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {/* ── Top bar ── */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        {domainsLoading ? (
          <span className="text-(length:--text-compact) text-muted-foreground">…</span>
        ) : (
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-1.5 py-0.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted-foreground" aria-hidden>
              <circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
              <path d="M12 7v3M12 10 6.5 17M12 10 17.5 17" />
            </svg>
            <select
              value={activeDomainId ?? ""}
              onChange={e => { setSelectedDomainId(e.target.value || null); }}
              className="h-6 bg-transparent pr-1 text-(length:--text-compact) font-medium text-foreground outline-none"
            >
              {domains.length === 0 && <option value="">{t("无域", "No domains")}</option>}
              {domains.map(d => (
                <option key={d.id} value={d.id}>{d.display_name} · v{d.version}</option>
              ))}
            </select>
          </div>
        )}

        {activeDomain && (
          <span className={[
            "rounded-full px-2 py-0.5 text-(length:--text-nano) font-medium",
            activeDomain.status === "active" ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground",
          ].join(" ")}>
            {activeDomain.status}
          </span>
        )}

        {/* New domain button — always visible so a second ontology is easy to add */}
        <button
          onClick={() => setShowNewDomain(true)}
          title={t("新建本体域", "Create a new ontology domain")}
          className="flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-(length:--text-compact) font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <span className="text-[13px] leading-none">＋</span>
          {t("新建域", "New domain")}
        </button>

        <div className="mx-2 h-5 w-px bg-border" />

        <div className="flex items-center gap-0.5">
          {views.map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={[
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-(length:--text-compact) font-medium transition-colors",
                view === v.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              ].join(" ")}
            >
              <span className="text-[13px]">{v.icon}</span>
              {v.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setRightOpen(o => !o)}
            title={t("切换右侧面板", "Toggle right panel")}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M15 3v18" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      {!activeDomainId ? (
        <div className="flex min-h-0 flex-1">
          <NoDomainState companyId={companyId} onCreated={refreshDomains} />
        </div>
      ) : (
        // Keyed on domainId so switching domains remounts the workspace with a
        // valid, non-null domainId — the hook inside never runs with undefined.
        <DomainWorkspace
          key={activeDomainId}
          companyId={companyId}
          domainId={activeDomainId}
          domain={activeDomain}
          view={view}
          rightOpen={rightOpen}
          onDomainsChanged={refreshDomains}
        />
      )}

      {showNewDomain && (
        <NewDomainModal
          companyId={companyId}
          onClose={() => setShowNewDomain(false)}
          onCreated={(newDomainId) => {
            setShowNewDomain(false);
            refreshDomains();
            if (newDomainId) setSelectedDomainId(newDomainId);
          }}
        />
      )}
    </div>
  );
}

/** Centered modal for creating a new ontology domain; auto-selects it on success. */
function NewDomainModal({
  companyId,
  onClose,
  onCreated,
}: {
  companyId: string;
  onClose: () => void;
  onCreated: (newDomainId: string | null) => void;
}): ReactElement {
  const createDomain = usePluginAction("create-domain");
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!slug.trim() || !displayName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = (await createDomain({ companyId, slug: slug.trim(), displayName: displayName.trim() })) as {
        domain?: { id?: string };
        id?: string;
      };
      const newId = res?.domain?.id ?? res?.id ?? null;
      onCreated(newId);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, slug, displayName, createDomain, onCreated]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-(length:--text-base) font-semibold">{t("新建本体域", "New ontology domain")}</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-(length:--text-nano) text-muted-foreground">{t("标识 (slug)", "Slug")}</label>
            <input
              autoFocus
              className={INPUT + " mr-0 w-full"}
              placeholder="e.g. orders, ecommerce"
              value={slug}
              onChange={e => setSlug(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void submit(); }}
            />
          </div>
          <div>
            <label className="mb-1 block text-(length:--text-nano) text-muted-foreground">{t("显示名称", "Display name")}</label>
            <input
              className={INPUT + " mr-0 w-full"}
              placeholder={t("如：订单域、电商平台", "e.g. Orders, E-commerce")}
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void submit(); }}
            />
          </div>
          {err && <div className="text-(length:--text-compact) text-muted-foreground">{err}</div>}
          <div className="mt-1 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-(length:--text-compact) text-muted-foreground hover:bg-accent">
              {t("取消", "Cancel")}
            </button>
            <button className={BTN} disabled={busy || !slug.trim() || !displayName.trim()} onClick={() => void submit()}>
              {busy ? "…" : t("创建", "Create")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * DS "影响推演" (impact simulation): compute the blast radius of a node —
 * which nodes it reaches downstream (affects) and which reach it upstream
 * (depend on it) — via BFS over the already-loaded edges. Client-side so it
 * runs instantly without an extra round trip.
 */
function ImpactSimulationModal({
  companyId: _companyId,
  domainId: _domainId,
  node,
  onClose,
}: {
  companyId: string;
  domainId: string;
  node: GraphNode;
  onClose: () => void;
}): ReactElement {
  const { data } = usePluginData<DomainDetail>("domain-detail", { companyId: _companyId, domainId: _domainId });
  const edges = data?.graph?.edges ?? [];
  const nodes = data?.graph?.nodes ?? [];
  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) m.set(n.id, n.label || n.key);
    return m;
  }, [nodes]);

  const bfs = useCallback((direction: "downstream" | "upstream") => {
    const reached = new Map<string, number>(); // id -> hop depth
    reached.set(node.id, 0);
    let frontier = [node.id];
    let depth = 0;
    while (frontier.length > 0) {
      depth++;
      const next: string[] = [];
      for (const e of edges) {
        const [from, to] = direction === "downstream"
          ? [e.sourceNodeId, e.targetNodeId]
          : [e.targetNodeId, e.sourceNodeId];
        if (frontier.includes(from) && !reached.has(to)) {
          reached.set(to, depth);
          next.push(to);
        }
      }
      frontier = next;
    }
    reached.delete(node.id);
    return reached;
  }, [edges, node.id]);

  const downstream = useMemo(() => bfs("downstream"), [bfs]);
  const upstream = useMemo(() => bfs("upstream"), [bfs]);

  const renderList = (m: Map<string, number>) => {
    const rows = Array.from(m.entries()).sort((a, b) => a[1] - b[1]);
    if (rows.length === 0) return <div className="text-(length:--text-nano) text-muted-foreground">{t("无", "None")}</div>;
    return (
      <div className="space-y-0.5">
        {rows.map(([id, hop]) => (
          <div key={id} className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1 text-(length:--text-nano)">
            <span className="truncate">{labelById.get(id) ?? id}</span>
            <span className="shrink-0 text-muted-foreground">{hop} {t("跳", "hop")}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[min(34rem,calc(100%-2rem))] rounded-xl border border-border bg-card p-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-(length:--text-base) font-semibold">{t("影响推演", "Impact simulation")}</div>
            <div className="text-(length:--text-nano) text-muted-foreground">{node.label || node.key}</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="mb-3 flex gap-3">
          <div className="flex-1 rounded-lg border border-border bg-background p-2 text-center">
            <div className="text-lg font-semibold text-amber-500">{downstream.size}</div>
            <div className="text-(length:--text-nano) text-muted-foreground">{t("下游受影响", "Affected downstream")}</div>
          </div>
          <div className="flex-1 rounded-lg border border-border bg-background p-2 text-center">
            <div className="text-lg font-semibold text-sky-500">{upstream.size}</div>
            <div className="text-(length:--text-nano) text-muted-foreground">{t("上游依赖", "Upstream dependencies")}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1 text-(length:--text-compact) font-medium">→ {t("下游 (受此节点影响)", "Downstream (affected by)")}</div>
            {renderList(downstream)}
          </div>
          <div>
            <div className="mb-1 text-(length:--text-compact) font-medium">← {t("上游 (此节点依赖)", "Upstream (depends on)")}</div>
            {renderList(upstream)}
          </div>
        </div>
      </div>
    </div>
  );
}

function DomainWorkspace({
  companyId,
  domainId,
  domain,
  view,
  rightOpen,
  onDomainsChanged,
}: {
  companyId: string;
  domainId: string;
  domain: OntologyDomain | null;
  view: WorkbenchView;
  rightOpen: boolean;
  onDomainsChanged: () => void;
}): ReactElement {
  const { data: domainData, refresh: refreshDomain } = usePluginData<DomainDetail>(
    "domain-detail", { companyId, domainId }
  );

  const counts = domainData?.graph?.counts;
  const nodes = domainData?.graph?.nodes ?? [];
  const edges = domainData?.graph?.edges ?? [];
  const nodeTypes = domainData?.nodeTypes ?? [];
  const relationTypes = domainData?.relationTypes ?? [];

  const [focusNodeTypeId, setFocusNodeTypeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null;
  const [simulateNode, setSimulateNode] = useState<GraphNode | null>(null);

  const showTree = view === "graph" || view === "table" || view === "schema";

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Left: node type tree */}
      {showTree && (
        <div className="flex w-48 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-muted/20 p-2">
          <div className="mb-1 px-1 text-(length:--text-nano) font-semibold text-muted-foreground uppercase tracking-wide">
            {t("节点类型", "Node types")} · {nodeTypes.length}
          </div>
          {nodeTypes.length === 0 ? (
            <div className="px-1 text-(length:--text-nano) text-muted-foreground">{t("暂无", "None yet")}</div>
          ) : (
            nodeTypes.map(nt => (
              <div
                key={nt.id}
                draggable
                onDragStart={e => { e.dataTransfer.setData(DRAG_MIME, nt.id); e.dataTransfer.effectAllowed = "copy"; }}
                onClick={() => setFocusNodeTypeId(f => f === nt.id ? null : nt.id)}
                title={t("拖到图谱=按类型建节点 · 点击=过滤", "Drag to canvas to create typed node · click to filter")}
                className={[
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-(length:--text-compact) transition-colors select-none",
                  focusNodeTypeId === nt.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent",
                ].join(" ")}
              >
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: toneFor(nt.id) }} />
                <span className="flex-1 truncate">{nt.display_name || nt.key}</span>
              </div>
            ))
          )}

          {relationTypes.length > 0 && (
            <>
              <div className="mb-1 mt-3 px-1 text-(length:--text-nano) font-semibold text-muted-foreground uppercase tracking-wide">
                {t("关系类型", "Relation types")} · {relationTypes.length}
              </div>
              {relationTypes.map(rt => (
                <div key={rt.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-(length:--text-compact) text-muted-foreground">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full border border-border" style={{ background: toneFor(rt.id) }} />
                  <span className="flex-1 truncate">{rt.display_name || rt.key}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Center: main view */}
      <div className="relative min-w-0 flex-1 overflow-hidden">
        {showTree && (
          <GraphView
            companyId={companyId}
            domainId={domainId}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            relationTypes={relationTypes}
            onChanged={refreshDomain}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            focusNodeTypeId={focusNodeTypeId}
            mode={view === "graph" ? "graph" : view === "table" ? "table" : "schema"}
            hideTabs
            nodeTypeDragMime={DRAG_MIME}
            onViewNodeDetail={(nodeId) => setSelectedNodeId(nodeId)}
            onSimulateImpact={(node) => setSimulateNode(node)}
          />
        )}
        {view === "cognition" && <CognitionTab companyId={companyId} />}
        {view === "capabilities" && <CapabilitiesTab companyId={companyId} />}

        {simulateNode && (
          <ImpactSimulationModal
            companyId={companyId}
            domainId={domainId}
            node={simulateNode}
            onClose={() => setSimulateNode(null)}
          />
        )}
      </div>

      {/* Right: stats panel */}
      {rightOpen && domain && (
        <div className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-muted/10 p-3">
          <div>
            <div className="mb-2 text-(length:--text-compact) font-semibold">{t("域概览", "Domain overview")}</div>
            <div className="space-y-1 rounded-lg border border-border bg-card p-2.5 text-(length:--text-nano)">
              <InfoRow label={t("域 ID", "Domain ID")} value={domain.slug} mono />
              <InfoRow label={t("名称", "Name")} value={domain.display_name} />
              <InfoRow label={t("版本", "Version")} value={`v${domain.version}`} />
              <InfoRow label={t("状态", "Status")} value={domain.status}
                valueClass={domain.status === "active" ? "text-emerald-500" : "text-muted-foreground"} />
            </div>
          </div>

          {counts && (
            <div>
              <div className="mb-2 text-(length:--text-compact) font-semibold">{t("统计", "Statistics")}</div>
              <div className="grid grid-cols-2 gap-2">
                <StatCard label={t("节点数", "Nodes")} value={counts.nodes} />
                <StatCard label={t("关系数", "Edges")} value={counts.edges} />
                <StatCard label={t("类型数", "Node types")} value={counts.nodeTypes} />
                <StatCard label={t("关系类型", "Rel types")} value={counts.relationTypes} />
              </div>
            </div>
          )}

          {nodeTypes.length > 0 && (
            <div>
              <div className="mb-1 text-(length:--text-compact) font-semibold">{t("对象类型", "Object types")} ({nodeTypes.length})</div>
              <div className="space-y-0.5">
                {nodeTypes.map(nt => (
                  <button
                    key={nt.id}
                    onClick={() => setFocusNodeTypeId(f => f === nt.id ? null : nt.id)}
                    className={[
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-(length:--text-compact) text-left transition-colors",
                      focusNodeTypeId === nt.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent",
                    ].join(" ")}
                  >
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: toneFor(nt.id) }} />
                    <span className="flex-1 truncate">{nt.display_name || nt.key}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedNode && (
            <NodeInspector
              companyId={companyId}
              domainId={domainId}
              node={selectedNode}
              nodeTypes={nodeTypes}
              edges={edges}
              nodes={nodes}
              onChanged={refreshDomain}
              onDeselect={() => setSelectedNodeId(null)}
            />
          )}

          <NewDomainForm companyId={companyId} onCreated={onDomainsChanged} />
        </div>
      )}
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

// ─── Workbench helper components ──────────────────────────────────────────────

function InfoRow({ label, value, mono, valueClass }: { label: string; value: string; mono?: boolean; valueClass?: string }): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={["truncate text-right", mono ? "font-mono" : "", valueClass ?? ""].join(" ")}>{value}</span>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <div className="rounded-lg border border-border bg-card p-2 text-center">
      <div className="text-lg font-semibold leading-none">{value}</div>
      <div className="mt-0.5 text-(length:--text-nano) text-muted-foreground">{label}</div>
    </div>
  );
}

function NodeInspector({
  companyId,
  domainId,
  node,
  nodeTypes,
  edges,
  nodes,
  onChanged,
  onDeselect,
}: {
  companyId: string;
  domainId: string;
  node: GraphNode;
  nodeTypes: OntologyNodeType[];
  edges: GraphEdge[];
  nodes: GraphNode[];
  onChanged: () => void;
  onDeselect: () => void;
}): ReactElement {
  const updateNode = usePluginAction("update-node");
  const deleteNode = usePluginAction("delete-node");
  const [busy, setBusy] = useState(false);

  const nt = nodeTypes.find(t => t.id === node.nodeTypeId);
  const outEdges = edges.filter(e => e.sourceNodeId === node.id);
  const inEdges = edges.filter(e => e.targetNodeId === node.id);
  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) m.set(n.id, n.label || n.key);
    return m;
  }, [nodes]);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); onChanged(); } finally { setBusy(false); }
  }, [onChanged]);

  return (
    <div className="rounded-lg border border-primary/30 bg-card p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-(length:--text-compact) font-semibold">{t("节点详情", "Node detail")}</span>
        <button onClick={onDeselect} className="text-(length:--text-nano) text-muted-foreground hover:text-foreground">✕</button>
      </div>
      <div className="space-y-1 text-(length:--text-nano)">
        <InfoRow label={t("标签", "Label")} value={node.label || node.key} />
        <InfoRow label={t("键", "Key")} value={node.key} mono />
        {nt && <InfoRow label={t("类型", "Type")} value={nt.display_name || nt.key} />}
      </div>
      {(outEdges.length > 0 || inEdges.length > 0) && (
        <div className="mt-2 space-y-1">
          {outEdges.map(e => (
            <div key={e.id} className="flex items-center gap-1 text-(length:--text-nano) text-muted-foreground">
              <span className="text-primary">→</span>
              <span className="truncate">{e.relationKey ?? "—"}</span>
              <span className="truncate font-medium text-foreground">{labelById.get(e.targetNodeId) ?? "?"}</span>
            </div>
          ))}
          {inEdges.map(e => (
            <div key={e.id} className="flex items-center gap-1 text-(length:--text-nano) text-muted-foreground">
              <span className="text-muted-foreground">←</span>
              <span className="truncate font-medium text-foreground">{labelById.get(e.sourceNodeId) ?? "?"}</span>
              <span className="truncate">{e.relationKey ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex gap-1">
        <button
          disabled={busy}
          onClick={() => {
            const label = window.prompt(t("节点标签", "Node label"), node.label);
            if (label?.trim()) void run(() => updateNode({ companyId, nodeId: node.id, label: label.trim() }));
          }}
          className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-(length:--text-nano) transition-colors hover:bg-accent"
        >
          {t("重命名", "Rename")}
        </button>
        <button
          disabled={busy}
          onClick={() => {
            if (window.confirm(t("删除该节点及其边?", "Delete this node and its edges?"))) {
              void run(() => deleteNode({ companyId, nodeId: node.id }));
              onDeselect();
            }
          }}
          className="flex-1 rounded-md border border-destructive/30 bg-background px-2 py-1 text-(length:--text-nano) text-destructive transition-colors hover:bg-destructive/10"
        >
          {t("删除", "Delete")}
        </button>
      </div>
    </div>
  );
}

function NoDomainState({ companyId, onCreated }: { companyId: string; onCreated: () => void }): ReactElement {
  const createDomain = usePluginAction("create-domain");
  const [displayName, setDisplayName] = useState("");
  const [slugOverride, setSlugOverride] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const effectiveSlug = slugOverride ?? slugify(displayName);

  const submit = async () => {
    setBusy(true); setErr(null);
    try { await createDomain({ companyId, slug: effectiveSlug, displayName: displayName.trim() }); onCreated(); setDisplayName(""); setSlugOverride(null); }
    catch (e) { setErr(String((e as Error)?.message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <div className="text-(length:--text-compact)">{t("还没有本体域，先创建一个。", "No ontology domains yet. Create one to get started.")}</div>
      <div className="flex w-80 flex-col gap-2">
        <div className="flex gap-2">
          <input
            className={INPUT + " flex-1"}
            placeholder={t("域名称（如：电商平台）", "Domain name (e.g. E-commerce)")}
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && displayName.trim() && !busy) void submit(); }}
            autoFocus
          />
          <button className={BTN} disabled={busy || !displayName.trim()} onClick={submit}>
            {busy ? "…" : t("创建", "Create")}
          </button>
        </div>
        {displayName.trim() && (
          <div className="flex items-center gap-1.5 px-0.5 text-(length:--text-nano)">
            <span>{t("标识", "Slug")}:</span>
            <span className="font-mono text-foreground">{effectiveSlug}</span>
            <button
              type="button"
              onClick={() => { setShowAdvanced(v => !v); if (!showAdvanced && slugOverride == null) setSlugOverride(effectiveSlug); }}
              className="ml-auto text-primary hover:underline"
            >
              {showAdvanced ? t("自动", "Auto") : t("自定义", "Edit")}
            </button>
          </div>
        )}
        {showAdvanced && (
          <input
            className={INPUT + " w-full font-mono"}
            placeholder="slug"
            value={slugOverride ?? effectiveSlug}
            onChange={e => setSlugOverride(slugify(e.target.value) || e.target.value.toLowerCase())}
          />
        )}
      </div>
      {err && <div className="text-(length:--text-nano) text-muted-foreground">{err}</div>}
    </div>
  );
}

function NewDomainForm({ companyId, onCreated }: { companyId: string; onCreated: () => void }): ReactElement {
  const createDomain = usePluginAction("create-domain");
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [slugOverride, setSlugOverride] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // slug auto-derives from the display name unless the user has typed a custom one.
  const effectiveSlug = slugOverride ?? slugify(displayName);

  const reset = () => {
    setDisplayName("");
    setSlugOverride(null);
    setShowAdvanced(false);
    setErr(null);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-auto flex items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5 text-(length:--text-compact) text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <span>＋</span> {t("新建域", "New domain")}
      </button>
    );
  }

  return (
    <div className="mt-auto rounded-lg border border-border bg-card p-2.5">
      <div className="mb-2 text-(length:--text-compact) font-semibold">{t("新建域", "New domain")}</div>
      <div className="space-y-1.5">
        <input
          className={INPUT + " w-full"}
          placeholder={t("域名称（如：电商平台）", "Domain name (e.g. E-commerce)")}
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          autoFocus
        />
        {/* Live slug preview — auto-generated, editable via advanced toggle */}
        {displayName.trim() && (
          <div className="flex items-center gap-1.5 px-0.5 text-(length:--text-nano) text-muted-foreground">
            <span>{t("标识", "Slug")}:</span>
            <span className="font-mono text-foreground">{effectiveSlug}</span>
            <button
              type="button"
              onClick={() => { setShowAdvanced(v => !v); if (!showAdvanced && slugOverride == null) setSlugOverride(effectiveSlug); }}
              className="ml-auto text-primary hover:underline"
            >
              {showAdvanced ? t("自动", "Auto") : t("自定义", "Edit")}
            </button>
          </div>
        )}
        {showAdvanced && (
          <input
            className={INPUT + " w-full font-mono"}
            placeholder="slug"
            value={slugOverride ?? effectiveSlug}
            onChange={e => setSlugOverride(slugify(e.target.value) || e.target.value.toLowerCase())}
          />
        )}
        <div className="flex gap-1.5">
          <button
            className={BTN + " flex-1"}
            disabled={busy || !displayName.trim()}
            onClick={async () => {
              setBusy(true); setErr(null);
              try {
                await createDomain({ companyId, slug: effectiveSlug, displayName: displayName.trim() });
                onCreated();
                setOpen(false);
                reset();
              }
              catch (e) { setErr(String((e as Error)?.message ?? e)); }
              finally { setBusy(false); }
            }}
          >
            {busy ? "…" : t("创建", "Create")}
          </button>
          <button onClick={() => { setOpen(false); reset(); }} className="rounded-md border border-border px-3 py-1.5 text-(length:--text-compact) text-muted-foreground hover:bg-accent">
            {t("取消", "Cancel")}
          </button>
        </div>
        {err && <div className="text-(length:--text-nano) text-muted-foreground">{err}</div>}
      </div>
    </div>
  );
}

// ─── End workbench helpers ─────────────────────────────────────────────────────

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

          <div className="mb-3">
            <Workbench
              companyId={companyId}
              domainId={domainId}
              nodes={data?.graph?.nodes ?? []}
              edges={data?.graph?.edges ?? []}
              nodeTypes={data?.nodeTypes ?? []}
              relationTypes={data?.relationTypes ?? []}
              onChanged={refresh}
            />
          </div>

          <CollapsibleSection title={t("管理 Schema 与数据管道", "Manage schema & pipeline")}>
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
          </CollapsibleSection>
        </>
      )}
    </>
  );
}

/** Collapsible container so the schema/pipeline forms don't clutter the workbench. */
function CollapsibleSection({ title, children }: { title: string; children: ReactElement | ReactElement[] }): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="mb-2 flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-(length:--text-compact) font-medium text-foreground transition-colors hover:bg-accent/40"
      >
        <span className="text-muted-foreground">{open ? "▾" : "▸"}</span>
        {title}
      </button>
      {open && <div>{children}</div>}
    </div>
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
