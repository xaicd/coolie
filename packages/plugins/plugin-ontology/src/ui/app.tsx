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
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import {
  DOMAIN_STATE_TRANSITIONS,
  type DomainLifecycleState,
} from "@paperclipai/ontology-core/enums.js";
import {
  type GraphNode,
  type GraphEdge,
  type GraphNodeType,
  type ServiceRowView,
  GraphView,
  toneFor,
} from "./graph-view.js";
import { Workbench } from "./workbench.js";
import { ChatTab } from "./ChatTab.js";
import { SandboxTab } from "./SandboxTab.js";
import { TopStatusBar } from "./TopStatusBar.js";
import { NodePropertyEditor } from "./NodePropertyEditor.js";
import { BootstrapPanel } from "./BootstrapPanel.js";

/**
 * Minimal plugin-side i18n. Plugin UI runs sandboxed and does not receive the
 * host locale through the SDK context, but it shares the browser with the host,
 * which persists the chosen UI language in localStorage under "coolie.locale".
 * We read that and pick Chinese vs English. `zh`, `zh-CN`, `zh-TW` all count as
 * Chinese; everything else falls back to English.
 */
import { t } from "./isZh.js";
import { LegacyImportWizardModal, type ParsedSource } from "./LegacyImportWizardModal.js";
import { DatasetsTab } from "./DatasetsTab.js";
import { ConnectorsTab } from "./ConnectorsTab.js";
import { TransformsTab } from "./TransformsTab.js";
import { applyOperations, type MutationCall } from "../aide/editOps.js";
import {
  rowsFromSchema,
  schemaFromRows,
  typeOptionsFor,
  type SchemaRow,
} from "./schemaRows.js";

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
  /** draft -> active -> deprecated -> archived. Distinct from `status`. */
  lifecycle_state: string;
}

interface OntologyNodeType {
  id: string;
  key: string;
  display_name: string;
  description: string | null;
  /** JSON Schema describing the per-instance properties this type allows. */
  propertiesSchema: Record<string, unknown> | null;
  /**
   * The declared field order, beside the schema map because jsonb cannot keep an
   * object's key order. `[]` means it was never recorded.
   */
  propertyOrder?: string[] | null;
}

interface OntologyRelationType {
  id: string;
  key: string;
  display_name: string;
  description: string | null;
  directed: boolean;
}

interface GraphSnapshot {
  counts: {
    nodeTypes: number;
    relationTypes: number;
    nodes: number;
    edges: number;
    byNodeType?: Record<string, number>;
    crossDomainEdges?: number;
  };
  nodes?: GraphNode[];
  edges?: GraphEdge[];
}

interface DomainDetail {
  domain: OntologyDomain | null;
  nodeTypes: OntologyNodeType[];
  relationTypes: OntologyRelationType[];
  /** Services an import recorded — the runtime/deployment views draw these. */
  services: ServiceRowView[];
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
/** Row-level action in a table: outline, nano-sized. */
const ROW_BTN =
  "rounded-md border border-border bg-background px-2 py-1 text-(length:--text-nano) " +
  "whitespace-nowrap text-foreground transition-colors hover:bg-accent disabled:opacity-50";
/** Row-level destructive action: same shape, destructive tone. */
const ROW_DANGER_BTN =
  "rounded-md border border-destructive/30 bg-background px-2 py-1 text-(length:--text-nano) " +
  "whitespace-nowrap text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50";

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

type WorkbenchView = "graph" | "table" | "schema" | "cognition" | "capabilities" | "dialogue" | "sandbox" | "actions" | "functions" | "interfaces" | "datasets" | "connectors" | "transforms" | "domains" | "manage";
type WorkbenchGroup = "data-flow" | "assets" | "ops";

/**
 * View layout — split into primary (always visible in the top row) and
 * groups (collapsed into 3 chip-style menus: 数据流 / 资产 / 运维).
 *
 * The original 14-tab horizontal strip overflowed a 1280px viewport on
 * this plugin's cockpit; users reported it as "太密集". Grouping keeps
 * the top bar under 6 chrome elements and pushes the long tail into a
 * sub-tab strip that renders *inside* the content area when a group
 * is active. Selecting a primary view also closes any open group so
 * only one mode is visible at a time.
 */
const PRIMARY_VIEWS: { id: WorkbenchView; label: string; icon: string }[] = [
  { id: "graph", label: t("图谱", "Graph"), icon: "⬡" },
  { id: "table", label: t("表格", "Table"), icon: "⊞" },
  { id: "schema", label: "Schema", icon: "⊙" },
  { id: "sandbox", label: t("驾驶舱", "Cockpit"), icon: "🤝" },
];

const VIEW_GROUPS: {
  id: WorkbenchGroup;
  label: string;
  icon: string;
  views: { id: WorkbenchView; label: string; icon: string }[];
}[] = [
  {
    id: "data-flow",
    label: t("数据流", "Data flow"),
    icon: "≣",
    views: [
      { id: "datasets", label: t("数据集", "Datasets"), icon: "📊" },
      { id: "connectors", label: t("连接器", "Connectors"), icon: "🔌" },
      { id: "transforms", label: t("转换", "Transforms"), icon: "⚙" },
    ],
  },
  {
    id: "assets",
    label: t("资产", "Assets"),
    icon: "◈",
    views: [
      { id: "cognition", label: t("认知", "Cognition"), icon: "⚡" },
      { id: "capabilities", label: t("能力", "Capabilities"), icon: "◈" },
      { id: "actions", label: t("动作", "Actions"), icon: "⚙" },
      { id: "functions", label: t("函数", "Functions"), icon: "λ" },
      { id: "interfaces", label: t("接口", "Interfaces"), icon: "⌘" },
      { id: "dialogue", label: t("对话", "Dialogue"), icon: "💬" },
    ],
  },
  {
    id: "ops",
    label: t("运维", "Ops"),
    icon: "🛠",
    views: [
      // Listed before 治理: this is the view you reach for when a domain is in the
      // way, and it used to require the API.
      { id: "domains", label: t("本体域", "Domains"), icon: "◫" },
      { id: "manage", label: t("治理", "Manage"), icon: "📋" },
    ],
  },
];

const DRAG_MIME = "application/x-ontology-node-type-id";

function OntologyWorkbench({ companyId }: { companyId: string }): ReactElement {
  const { data: domainsData, loading: domainsLoading, refresh: refreshDomains } = usePluginData<{ domains: OntologyDomain[] }>(
    "list-domains", { companyId }
  );
  const domains = domainsData?.domains ?? [];

  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [view, setView] = useState<WorkbenchView>("graph");

  /**
   * Planting the built-in sample domains lives here, in the header, because it
   * creates domains — and this bar is the only thing on screen whether or not a
   * domain exists yet. It used to sit in the workbench's "this domain is empty"
   * banner, which meant it was reachable only while a domain happened to be
   * empty: on an instance that already had domains the feature was invisible.
   */
  const seedSampleDomains = usePluginAction("seed-sample-domains");
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const runSeedDomains = useCallback(async () => {
    setSeeding(true);
    setSeedMsg(null);
    try {
      const report = (await seedSampleDomains({ companyId })) as {
        created?: number;
        skipped?: number;
        failed?: number;
      };
      setSeedMsg(
        t(
          `已创建 ${report.created ?? 0} 个,跳过 ${report.skipped ?? 0} 个(已存在)${
            report.failed ? `,失败 ${report.failed} 个` : ""
          }`,
          `Created ${report.created ?? 0}, skipped ${report.skipped ?? 0} already present${
            report.failed ? `, ${report.failed} failed` : ""
          }`,
        ),
      );
      await refreshDomains();
    } catch (e) {
      setSeedMsg(String((e as Error)?.message ?? e));
    } finally {
      setSeeding(false);
    }
  }, [seedSampleDomains, companyId, refreshDomains]);
  // Which group menu is expanded. null = no group active; user is on a
  // primary view OR has dismissed the group strip. We keep `view` as the
  // single source of truth for *which* view mounts — the group is just a
  // affordance for surfacing its children as a sub-tab strip.
  const [activeGroup, setActiveGroup] = useState<WorkbenchGroup | null>(null);
  // Right stats panel. Off by default so the canvas gets the full width; the
  // panel is forced open while a node is selected because that is the only
  // time its inspector is the thing the user is looking at (DS does the same).
  const [rightOpen, setRightOpen] = useState(false);
  // Left object-type tree. Collapsible so the canvas can go full-bleed.
  const [treeOpen, setTreeOpen] = useState(true);
  const [showNewDomain, setShowNewDomain] = useState(false);
  const [newDomainDefaultMode, setNewDomainDefaultMode] = useState<"directory" | "manual">("directory");
  // When the graph node right-click menu dispatches "动作", DomainWorkspace
  // catches the window CustomEvent and writes the captured nodeTypeId here
  // via the setter we thread down as a prop. ActionsTab consumes the prefill
  // on mount (cleared via onConsumePrefill) so a second visit without a new
  // dispatch doesn't keep stale form state.
  const [actionFormPrefill, setActionFormPrefill] = useState<{ nodeTypeId: string } | null>(null);
  // Legacy-system import wizard. Independent of showNewDomain so the user
  // can layer them — "新建" still goes through NewDomainModal, "接入" opens
  // the multi-step wizard below. The wizard is the entry to ingest a real
  // legacy app's schema into ontology (SQL DDL / OpenAPI / code / docs).
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardInitialParsed, setWizardInitialParsed] = useState<ParsedSource | null>(null);
  const [wizardInitialStep, setWizardInitialStep] = useState<1 | 2 | 3 | 4>(1);

  // Auto-select first domain
  const activeDomainId = selectedDomainId ?? domains[0]?.id ?? null;
  const activeDomain = domains.find(d => d.id === activeDomainId) ?? null;

  // View selection rules:
  //  - Clicking a primary view (graph/table/schema/sandbox) clears the
  //    active group so only the primary view is mounted.
  //  - Clicking a group toggles the sub-tab strip; if the group was
  //    already active, it closes. If a different group was open, switch.
  //  - The right-click menu / canvas dispatch can jump straight to a
  //    group member (e.g. "actions"); we map that back to its group so
  //    the sub-tab strip stays visible while the user is on the leaf.
  const groupForView = (v: WorkbenchView): WorkbenchGroup | null =>
    VIEW_GROUPS.find(g => g.views.some(child => child.id === v))?.id ?? null;
  const selectView = (v: WorkbenchView) => {
    setView(v);
    const g = groupForView(v);
    setActiveGroup(g);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {/* ── Row 1 — primary chrome: domain · primary views · actions ── */}
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

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Primary view strip — the four views users land on 90% of the
            time. Group menus (data-flow / assets / ops) sit on row 2. */}
        <div className="flex items-center gap-0.5">
          {PRIMARY_VIEWS.map(v => (
            <button
              key={v.id}
              onClick={() => selectView(v.id)}
              className={[
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-(length:--text-compact) font-medium transition-colors",
                view === v.id && activeGroup === null ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              ].join(" ")}
            >
              <span className="text-[13px]">{v.icon}</span>
              {v.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* 接入 — opens the legacy-system import wizard. Reachable from
              any view so the user doesn't have to back out to start one. */}
          <button
            onClick={runSeedDomains}
            disabled={seeding}
            title={t(
              "载入内置行业样例域(零售、电商、金融、医疗、制造、教育、供应链)。已存在的域会被跳过,不会覆盖。",
              "Load the built-in industry sample domains (retail, e-commerce, finance, healthcare, manufacturing, education, supply chain). Existing domains are skipped, never overwritten.",
            )}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-(length:--text-compact) font-medium text-foreground hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <span className="text-[13px] leading-none">✨</span>
            {t("样例域", "Samples")}
          </button>
          {seedMsg && (
            <span className="text-(length:--text-nano) text-muted-foreground">{seedMsg}</span>
          )}
          <button
            onClick={() => setWizardOpen(true)}
            title={t("4 步接入存量旧系统", "4-step legacy import wizard")}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-(length:--text-compact) font-medium text-foreground hover:border-primary hover:text-primary"
          >
            <span className="text-[13px] leading-none">⚡</span>
            {t("接入", "Import")}
          </button>
          {/* New domain — secondary affordance; primary "create a domain"
              flows through NoDomainState / OnlineAppsPortal so we keep it
              light here. Border-dashed signals "container, not action". */}
          <button
            onClick={() => setShowNewDomain(true)}
            title={t("新建本体域", "Create a new ontology domain")}
            className="flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-(length:--text-compact) font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <span className="text-[13px] leading-none">＋</span>
            {t("新建", "New")}
          </button>
          {/* Collapse the object-type tree — reclaims 192px for the canvas. */}
          {(view === "graph" || view === "table" || view === "schema") && (
            <button
              onClick={() => setTreeOpen(o => !o)}
              title={treeOpen
                ? t("收起类型树", "Collapse type tree")
                : t("展开类型树", "Expand type tree")}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
              </svg>
            </button>
          )}
          {/* The cockpit has no right panel to toggle — see DomainWorkspace. */}
          {view !== "sandbox" && (
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
          )}
        </div>
      </div>

      {/* ── Row 2 — group menus + status. Compact (h-9), same surface so
          the two rows read as one continuous toolbar but the long tail
          stays out of the way until the user picks a group. */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 text-(length:--text-compact)">
        <div className="flex items-center gap-0.5">
          {VIEW_GROUPS.map(g => {
            const isOn = activeGroup === g.id;
            return (
              <button
                key={g.id}
                onClick={() => {
                  if (isOn) {
                    // Toggling the same group off — return to whichever
                    // primary view the user was last on (default: graph).
                    setActiveGroup(null);
                    if (!PRIMARY_VIEWS.some(p => p.id === view)) setView("graph");
                  } else {
                    setActiveGroup(g.id);
                    // If we're landing on the group from a primary view,
                    // also flip `view` to the group's first child so the
                    // content area doesn't go blank.
                    if (activeGroup === null) setView(g.views[0]!.id);
                  }
                }}
                className={[
                  "flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors",
                  isOn
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                ].join(" ")}
              >
                <span className="text-[13px]">{g.icon}</span>
                {g.label}
                <span className="text-(length:--text-nano) text-muted-foreground/70">{g.views.length}</span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <TopStatusBar companyId={companyId} domain={activeDomain} onSnapshot={refreshDomains} />
        </div>
      </div>

      {/* ── Body ── */}
      {!activeDomainId ? (
        <div className="flex min-h-0 flex-1">
          <NoDomainState
            companyId={companyId}
            onCreated={(newId) => {
              // Land the user on the freshly-created domain with the graph
              // view mounted. Without setView("graph") here, a user who was
              // last on Cognition/Capabilities/Dialogue would create a domain
              // and find themselves on a tab that has no canvas — so the
              // right-click context menu would silently do nothing because
              // the ReactFlow pane is unmounted.
              if (newId) setSelectedDomainId(newId);
              setView("graph");
              refreshDomains();
            }}
            onImportLegacy={() => setWizardOpen(true)}
            onOpenNewDomain={(mode) => {
              setNewDomainDefaultMode(mode ?? "directory");
              setShowNewDomain(true);
            }}
          />
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
          treeOpen={treeOpen}
          activeGroup={activeGroup}
          onSelectView={selectView}
          actionFormPrefill={actionFormPrefill}
          setActionFormPrefill={setActionFormPrefill}
          onDomainsChanged={refreshDomains}
          onRequestView={selectView}
          onOpenDomain={(id) => {
            setSelectedDomainId(id);
            selectView("graph");
          }}
          onImportLegacy={() => setWizardOpen(true)}
        />
      )}

      {showNewDomain && (
        <NewDomainModal
          companyId={companyId}
          initialMode={newDomainDefaultMode}
          onClose={() => setShowNewDomain(false)}
          onCreated={(newDomainId) => {
            setShowNewDomain(false);
            // Always land on graph view so the canvas is mounted and
            // right-click works. If we left the user on Cognition /
            // Capabilities / Dialogue, the ReactFlow pane wouldn't render
            // and the right-click menu would silently do nothing.
            setView("graph");
            refreshDomains();
            if (newDomainId) setSelectedDomainId(newDomainId);
          }}
          onOpenWizard={(parsed, step) => {
            setShowNewDomain(false);
            setWizardInitialParsed(parsed ?? null);
            setWizardInitialStep(step ?? 1);
            setWizardOpen(true);
          }}
        />
      )}

      {/* Legacy-system import wizard. Independent modal — when the user
          finishes, refresh domains and select the freshly-created one so the
          workbench lands on graph view of the new domain. */}
      {wizardOpen && (
        <LegacyImportWizardModal
          companyId={companyId}
          initialParsed={wizardInitialParsed}
          initialStep={wizardInitialStep}
          onClose={() => {
            setWizardOpen(false);
            setWizardInitialParsed(null);
            setWizardInitialStep(1);
          }}
          onPublished={(newDomainId) => {
            setWizardOpen(false);
            setWizardInitialParsed(null);
            setWizardInitialStep(1);
            setView("graph");
            refreshDomains();
            if (newDomainId) setSelectedDomainId(newDomainId);
          }}
        />
      )}
    </div>
  );
}

/** Centered modal for creating a new ontology domain; supports manual blank creation and directory scan import. */
function NewDomainModal({
  companyId,
  initialMode = "directory",
  onClose,
  onCreated,
  onOpenWizard,
}: {
  companyId: string;
  initialMode?: "directory" | "manual";
  onClose: () => void;
  onCreated: (newDomainId: string | null) => void;
  onOpenWizard?: (parsed?: ParsedSource | null, step?: 1 | 2 | 3 | 4) => void;
}): ReactElement {
  const createDomain = usePluginAction("create-domain");
  const createNodeType = usePluginAction("create-node-type");
  const createRelationType = usePluginAction("create-relation-type");
  const createBusinessSystem = usePluginAction("create-business-system");
  const importArchitecture = usePluginAction("import-architecture");

  const [mode, setMode] = useState<"directory" | "manual">(initialMode);
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Directory scan state
  const [scanned, setScanned] = useState<ParsedSource | null>(null);
  const [folderName, setFolderName] = useState("");
  const [fileCount, setFileCount] = useState(0);

  const handleDirectoryScan = async (files: FileList) => {
    setScanning(true);
    setErr(null);
    try {
      const { scanProject, IGNORED_EXTENSIONS } = await import(
        "@paperclipai/ontology-core/cognition/projectScanner.js"
      );
      const { buildTypeProvenance } = await import(
        "@paperclipai/ontology-core/provenance.js"
      );
      const inputs: Array<{ path: string; content: string }> = [];
      const repos = new Set<string>();
      const MAX_FILE_BYTES = 1024 * 1024;
      for (let i = 0; i < files.length; i++) {
        const f = files[i]!;
        const relative =
          (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? f.name;
        const root = relative.split("/").filter(Boolean)[0];
        if (root) repos.add(root);
        const ext = /(\.[A-Za-z0-9]+)$/.exec(relative)?.[1]?.toLowerCase() ?? "";
        if (IGNORED_EXTENSIONS.has(ext)) continue;
        if (f.size > MAX_FILE_BYTES) continue;
        inputs.push({ path: relative, content: await f.text() });
      }

      const scan = scanProject(inputs);
      const provenance: Record<string, Record<string, unknown>> = {};
      for (const seed of scan.draft.seedNodeTypes) {
        const bag = buildTypeProvenance(seed.origin, seed.sourceFiles);
        if (bag) provenance[seed.typeName] = bag;
      }

      const parsedData: ParsedSource = {
        nodeTypes: scan.draft.seedNodeTypes.map((n) => ({
          key: n.typeName,
          displayName: n.displayName,
          properties: n.properties ?? {},
          propertyOrder: n.propertyOrder,
        })),
        relationTypes: scan.draft.seedRelationTypes.map((r) => ({
          key: `${r.sourceType}_${r.relationType}_${r.targetType}`,
          displayName: r.displayName,
          sourceNodeTypeKey: r.sourceType,
          targetNodeTypeKey: r.targetType,
        })),
        actions: scan.draft.seedActions.map((a) => ({
          key: `${a.method} ${a.path}`,
          method: a.method,
          endpoint: a.path,
        })),
        repos: [...repos],
        services: scan.services,
        dependencies: scan.dependencies,
        sharedDatabases: scan.sharedDatabases,
        provenance,
        scanCoverage: {
          byExtension: scan.byExtension,
          unsupported: scan.unsupported,
          architectureOnly: scan.architectureOnly,
          truncationNote: scan.truncationNote,
        },
      };

      const rootName = [...repos][0] || "project";
      setFolderName(rootName);
      setFileCount(inputs.length);
      setScanned(parsedData);
      setDisplayName(rootName);
      setSlug(rootName.toLowerCase().replace(/[^a-z0-9_-]/g, "_"));
      setDescription(
        `由工程目录「${rootName}」自动分析生成的业务本体域，涵盖 ${parsedData.nodeTypes.length} 个对象类型与 ${parsedData.relationTypes.length} 个关系类型。`,
      );
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setScanning(false);
    }
  };

  const submit = useCallback(async () => {
    if (!slug.trim() || !displayName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      if (scanned) {
        const dom = (await createDomain({
          companyId,
          slug: slug.trim(),
          displayName: displayName.trim(),
          description: description.trim() || undefined,
          category: "legacy-system",
          metadata: {
            pipelineMode: "virtualization",
            sourceNodeTypeKeys: scanned.nodeTypes.map((n) => n.key),
            bridgeActions: scanned.actions ?? [],
          },
        })) as
          | { domain?: { id?: string }; id?: string; data?: { domain?: { id?: string } } }
          | undefined;
        const domainId = dom?.domain?.id ?? dom?.id ?? dom?.data?.domain?.id;
        if (!domainId) {
          throw new Error(t("创建本体域失败: 未返回域ID", "create-domain returned no domain id"));
        }

        for (const nt of scanned.nodeTypes) {
          try {
            await createNodeType({
              companyId,
              domainId,
              key: nt.key,
              displayName: nt.displayName,
              propertiesSchema: nt.properties,
              propertyOrder: nt.propertyOrder,
              metadata: scanned.provenance?.[nt.key],
            });
          } catch (e) {
            console.warn(`Object type ${nt.key} failed:`, e);
          }
        }

        for (const rt of scanned.relationTypes) {
          try {
            await createRelationType({
              companyId,
              domainId,
              key: rt.key,
              displayName: rt.displayName,
              metadata: {
                sourceNodeTypeKey: rt.sourceNodeTypeKey,
                targetNodeTypeKey: rt.targetNodeTypeKey,
              },
            });
          } catch (e) {
            console.warn(`Relation type ${rt.key} failed:`, e);
          }
        }

        try {
          await createBusinessSystem({
            companyId,
            code: `SYS_${slug.trim().toUpperCase()}`,
            name: displayName.trim(),
            ontologyDomainId: domainId,
            status: "planning",
            ...(scanned.repos && scanned.repos.length > 0
              ? { repos: scanned.repos.map((name) => ({ name })) }
              : {}),
          });
        } catch (e) {
          console.warn("createBusinessSystem failed:", e);
        }

        if (scanned.services && scanned.services.length > 0) {
          try {
            await importArchitecture({
              companyId,
              businessSystemId: `SYS_${slug.trim().toUpperCase()}`,
              services: scanned.services,
              dependencies: scanned.dependencies ?? [],
            });
          } catch (e) {
            console.warn("importArchitecture failed:", e);
          }
        }

        onCreated(domainId);
      } else {
        const res = (await createDomain({
          companyId,
          slug: slug.trim(),
          displayName: displayName.trim(),
          description: description.trim() || undefined,
        })) as {
          domain?: { id?: string };
          id?: string;
        };
        const newId = res?.domain?.id ?? res?.id ?? null;
        onCreated(newId);
      }
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [
    companyId,
    slug,
    displayName,
    description,
    scanned,
    createDomain,
    createNodeType,
    createRelationType,
    createBusinessSystem,
    importArchitecture,
    onCreated,
  ]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-(length:--text-base) font-semibold">
            {t("新建本体域", "New ontology domain")}
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>

        {/* Tab 切换: 文件夹目录接入 vs 空白手动创建 */}
        <div className="mb-3 flex rounded-lg border border-border bg-muted/20 p-0.5 text-(length:--text-nano)">
          <button
            type="button"
            className={[
              "flex-1 rounded-md py-1 font-medium transition-colors",
              mode === "directory"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
            onClick={() => setMode("directory")}
          >
            📁 {t("文件夹目录接入", "Import folder directory")}
          </button>
          <button
            type="button"
            className={[
              "flex-1 rounded-md py-1 font-medium transition-colors",
              mode === "manual"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
            onClick={() => setMode("manual")}
          >
            ✏️ {t("空白手动创建", "Blank domain")}
          </button>
        </div>

        {mode === "directory" && (
          <div className="mb-3 space-y-2">
            {!scanned ? (
              <div>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4 text-center hover:bg-primary/10 transition-colors">
                  <span className="text-xl">📁</span>
                  <span className="text-(length:--text-compact) font-medium text-foreground">
                    {t("点击选择工程文件夹目录", "Click to select project directory")}
                  </span>
                  <span className="text-(length:--text-nano) text-muted-foreground max-w-xs">
                    {t(
                      "支持识别 Java/Kotlin(Spring/JPA/MyBatis)、.proto、SQL DDL、TS/JS/Py/Go 代码与服务架构",
                      "Reads Java/Kotlin, .proto, SQL DDL, and TS/JS/Py/Go to extract object models and services",
                    )}
                  </span>
                  <input
                    type="file"
                    /* @ts-expect-error webkitdirectory is browser-native */
                    webkitdirectory=""
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const fl = e.target?.files;
                      if (fl && fl.length > 0) void handleDirectoryScan(fl);
                    }}
                  />
                </label>
                {scanning && (
                  <div className="mt-2 flex items-center justify-center gap-2 py-3 text-(length:--text-compact) text-muted-foreground">
                    <span className="animate-spin">⏳</span>
                    <span>{t("正在扫描分析工程目录并提取实体模型…", "Scanning project directory…")}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 p-2.5">
                <div className="flex items-center justify-between text-(length:--text-nano)">
                  <span className="font-semibold text-foreground">
                    📁 {folderName} ({fileCount} {t("个代码文件", "files")})
                  </span>
                  <label className="cursor-pointer text-primary hover:underline">
                    {t("重新选择", "Change folder")}
                    <input
                      type="file"
                      /* @ts-expect-error webkitdirectory is browser-native */
                      webkitdirectory=""
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const fl = e.target?.files;
                        if (fl && fl.length > 0) void handleDirectoryScan(fl);
                      }}
                    />
                  </label>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-(length:--text-nano)">
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                    ✓ {scanned.nodeTypes.length} {t("对象类型", "object types")}
                  </span>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                    ✓ {scanned.relationTypes.length} {t("关系类型", "relation types")}
                  </span>
                  {scanned.services && scanned.services.length > 0 && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                      ✓ {scanned.services.length} {t("微服务", "services")}
                    </span>
                  )}
                  {scanned.actions && scanned.actions.length > 0 && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                      ✓ {scanned.actions.length} {t("接口", "actions")}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-(length:--text-nano) text-muted-foreground">
              {t("标识 (slug)", "Slug")}
            </label>
            <input
              autoFocus={mode === "manual"}
              className={INPUT + " mr-0 w-full"}
              placeholder="e.g. orders, ecommerce"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-(length:--text-nano) text-muted-foreground">
              {t("显示名称", "Display name")}
            </label>
            <input
              className={INPUT + " mr-0 w-full"}
              placeholder={t("如：订单域、电商平台", "e.g. Orders, E-commerce")}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-(length:--text-nano) text-muted-foreground">
              {t(
                "描述 (可选 — 让 AI 初始化补全效果更好)",
                "Description (optional — improves AI bootstrap quality)",
              )}
            </label>
            <textarea
              className={INPUT + " mr-0 w-full resize-none"}
              rows={2}
              placeholder={t(
                "例：本域建模银行核心系统,涵盖账户、交易、风控三类实体",
                "e.g. This domain models our banking core: accounts, transactions, risk",
              )}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {err && <div className="text-(length:--text-compact) text-destructive">{err}</div>}
          <div className="mt-2 flex items-center justify-between gap-2">
            <div>
              {mode === "directory" && scanned && onOpenWizard && (
                <button
                  type="button"
                  onClick={() => onOpenWizard(scanned, 2)}
                  className="text-(length:--text-nano) text-muted-foreground hover:text-foreground underline"
                >
                  {t("进入完整接入向导 (4步) →", "Full 4-step wizard →")}
                </button>
              )}
              {mode === "manual" && (
                <button
                  type="button"
                  onClick={() => setMode("directory")}
                  className="text-(length:--text-nano) text-primary hover:underline"
                >
                  📁 {t("选择文件夹目录接入 →", "Import folder directory →")}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-md border border-border px-3 py-1.5 text-(length:--text-compact) text-muted-foreground hover:bg-accent"
              >
                {t("取消", "Cancel")}
              </button>
              <button
                className={BTN}
                disabled={busy || scanning || !slug.trim() || !displayName.trim()}
                onClick={() => void submit()}
              >
                {busy
                  ? "…"
                  : mode === "directory" && scanned
                    ? t("创建并接入", "Create & Ingest")
                    : t("创建", "Create")}
              </button>
            </div>
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
  treeOpen,
  activeGroup,
  onSelectView,
  actionFormPrefill,
  setActionFormPrefill,
  onDomainsChanged,
  onRequestView,
  onOpenDomain,
  onImportLegacy,
}: {
  companyId: string;
  domainId: string;
  domain: OntologyDomain | null;
  view: WorkbenchView;
  rightOpen: boolean;
  /** Whether the left object-type tree is expanded. Collapsing it gives the
      canvas the full width. */
  treeOpen: boolean;
  /** Which group menu is expanded in row 2 of the toolbar. When set,
      we render a sub-tab strip below the toolbar showing the group's
      leaf views. Null = no group active (user is on a primary view). */
  activeGroup: WorkbenchGroup | null;
  /** Selects a view and updates the toolbar's group/primary state in
      one go. Same contract as the parent's internal selectView. */
  onSelectView: (v: WorkbenchView) => void;
  /** When the graph node right-click menu dispatches "动作", the parent
      sets this prefill and we hand it to ActionsTab on mount. */
  actionFormPrefill?: { nodeTypeId: string } | null;
  setActionFormPrefill?: (v: { nodeTypeId: string } | null) => void;
  onDomainsChanged: () => void;
  /** Bridge to switch the host workbench's tab (e.g. graph → sandbox). */
  onRequestView?: (view: WorkbenchView) => void;
  /** Select a different domain and land on its graph. The domain picker lives in
      the parent, so the bridge is the only way a panel in here can move it. */
  onOpenDomain?: (domainId: string) => void;
  /** Bridge to open the legacy-system import wizard from inside the cockpit. */
  onImportLegacy?: () => void;
}): ReactElement {
  // The group currently expanded (mirrors parent's activeGroup). Used to
  // render the sub-tab strip just inside the content area.
  const currentGroup = activeGroup
    ? VIEW_GROUPS.find(g => g.id === activeGroup) ?? null
    : null;
  const { data: domainData, refresh: refreshDomain } = usePluginData<DomainDetail>(
    "domain-detail", { companyId, domainId }
  );
  // Stable callback identity so child effects keyed on it don't fire on every
  // parent re-render. refreshDomain from the SDK is already stable but
  // wrapping it here keeps the call site explicit and future-proof.
  const handleBootstrapCompleted = useCallback(() => {
    refreshDomain();
  }, [refreshDomain]);

  const counts = domainData?.graph?.counts;
  const nodes = domainData?.graph?.nodes ?? [];
  const edges = domainData?.graph?.edges ?? [];
  const nodeTypes = domainData?.nodeTypes ?? [];
  const relationTypes = domainData?.relationTypes ?? [];

  // Right-click on a node type in the left tree opens this menu. We keep it
  // local to DomainWorkspace (rather than the parent) because the actions
  // here depend on companyId + domainId + the active domain — all of which
  // the parent already routes in via props.
  const [nodeTypeMenu, setNodeTypeMenu] = useState<{
    x: number;
    y: number;
    nodeType: { id: string; key: string; display_name: string; properties_schema?: Record<string, unknown> | null };
  } | null>(null);
  /**
   * Naming a new node or relation happens in this small panel, next to the type
   * it belongs to, rather than in `window.prompt`. A browser modal takes the
   * whole page away for a one-word answer, and it cannot show why the answer was
   * refused — an error here leaves the panel open with the text still in it.
   */
  const [nodeTypeAsk, setNodeTypeAsk] = useState<{
    kind: "node" | "relation";
    nodeType: { id: string; key: string; display_name: string };
    x: number;
    y: number;
    value: string;
    error?: string;
  } | null>(null);
  const deleteNodeType = usePluginAction("delete-node-type");
  const createNodeType = usePluginAction("create-node-type");
  const createNode = usePluginAction("create-node");
  const updateNodeType = usePluginAction("update-node-type");
  const createRelationType = usePluginAction("create-relation-type");
  // 智能补全 — asks the model for standard fields on a type. Read-only: the
  // merged result opens in the schema editor so the user still confirms.
  const aiSuggestFields = usePluginAction("ai-suggest-fields");

  const submitNodeTypeAsk = () => {
    const ask = nodeTypeAsk;
    if (!ask || !ask.value.trim()) return;
    void (async () => {
      try {
        if (ask.kind === "node") {
          await createNode({
            companyId,
            domainId,
            key: `n-${Date.now()}`,
            label: ask.value.trim(),
            nodeTypeId: ask.nodeType.id,
          });
        } else {
          // The key is what the model reads, so it is slugged rather than kept
          // as typed; the panel shows the slug it will use before submitting.
          const relationKey = ask.value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
          await createRelationType({ companyId, domainId, key: relationKey, displayName: relationKey, directed: true });
        }
        setNodeTypeAsk(null);
        refreshDomain();
      } catch (e) {
        setNodeTypeAsk({ ...ask, error: String((e as Error)?.message ?? e) });
      }
    })();
  };
  /** Type whose fields are currently being generated (menu item shows a busy state). */
  const [suggestingFieldsFor, setSuggestingFieldsFor] = useState<string | null>(null);
  // Properties-schema editor modal — opened from the type right-click "属性"
  // item. Independent of nodeTypeMenu so the menu can dismiss while the
  // editor stays open. The user picks "save" or "cancel".
  const [propSchemaEditor, setPropSchemaEditor] = useState<{
    nodeTypeId: string;
    nodeTypeLabel: string;
    initialSchema: Record<string, unknown> | null;
  } | null>(null);
  // Right-click on a relation type in the left tree. Same UX as
  // nodeTypeMenu but for the edges' classification.
  const [relationTypeMenu, setRelationTypeMenu] = useState<{
    x: number;
    y: number;
    relationType: { id: string; key: string; display_name: string };
  } | null>(null);
  const deleteRelationType = usePluginAction("delete-relation-type");
  const updateRelationType = usePluginAction("update-relation-type");
  const aiEditSchema = usePluginAction("ai-edit-schema");
  const enrichDescriptions = usePluginAction("enrich-property-descriptions");

  /**
   * Dispatch one resolved edit call. Same shape the cockpit's Edit mode uses,
   * so a conversational change applies through exactly one code path.
   */
  const dispatchEditCall = useCallback(
    async (call: MutationCall): Promise<unknown> => {
      switch (call.action) {
        case "create-node-type":
          return createNodeType({ body: call.body });
        case "update-node-type":
          return updateNodeType({ params: call.params, body: call.body });
        case "delete-node-type":
          return deleteNodeType({ params: call.params });
        case "create-relation-type":
          return createRelationType({ body: call.body });
        case "update-relation-type":
          return updateRelationType({ params: call.params, body: call.body });
        case "delete-relation-type":
          return deleteRelationType({ params: call.params });
      }
    },
    [createNodeType, updateNodeType, deleteNodeType, createRelationType, updateRelationType, deleteRelationType],
  );

  /** Inline property-table save (add / edit / delete a field). */
  const saveNodeTypeSchema = useCallback(
    async (nodeTypeId: string, schema: Record<string, unknown>, propertyOrder: string[]) => {
      try {
        await updateNodeType({ companyId, nodeTypeId, propertiesSchema: schema, propertyOrder });
      } catch (e) {
        // Removing a field leaves the values already stored on instances
        // unreachable through the type — not deleted, which is what makes it
        // easy to miss. The store refuses unless the loss is accepted, so ask:
        // naming what will be orphaned is the difference between a decision and
        // an accident.
        const message = String((e as Error)?.message ?? e);
        const isOrphanRefusal = /allowOrphaned|orphan/i.test(message);
        if (!isOrphanRefusal) throw e;
        const proceed = window.confirm(
          `${message}\n\n${t(
            "确认删除这些字段并留下孤立数据吗?(值不会被删除,但在类型上已不可达)",
            "Remove these fields and leave the values orphaned? (Values are not deleted, but become unreachable through the type.)",
          )}`,
        );
        if (!proceed) return;
        await updateNodeType({
          companyId,
          nodeTypeId,
          propertiesSchema: schema,
          propertyOrder,
          allowOrphaned: true,
        });
      }
      refreshDomain();
    },
    [companyId, updateNodeType, refreshDomain],
  );

  /**
   * 补全属性说明 — the worker mines DDL comments / interface descriptions and
   * asks the model for whatever is left; we persist the merged schemas through
   * the same `update-node-type` path as every other edit.
   */
  const runEnrichDescriptions = useCallback(
    async (opts: {
      sourceText: string;
      overwrite: boolean;
      useAi: boolean;
      scope: "type" | "domain";
      typeKey: string;
    }): Promise<string> => {
      const res = (await enrichDescriptions({
        companyId,
        domainId,
        sourceText: opts.sourceText,
        sourceKind: "auto",
        overwrite: opts.overwrite,
        useAi: opts.useAi,
        ...(opts.scope === "type" ? { typeKey: opts.typeKey } : {}),
      })) as {
        error?: string;
        updates?: Array<{ nodeTypeId: string; key: string; propertiesSchema: Record<string, unknown> }>;
        report?: {
          ddl: number; openapi: number; ai: number;
          keptExisting: number; unmatched: number; weakMatches: number;
        };
      };
      if (res?.error) throw new Error(res.error);

      for (const update of res.updates ?? []) {
        await updateNodeType({
          companyId,
          nodeTypeId: update.nodeTypeId,
          propertiesSchema: update.propertiesSchema,
        });
      }
      refreshDomain();

      const r = res.report ?? { ddl: 0, openapi: 0, ai: 0, keptExisting: 0, unmatched: 0, weakMatches: 0 };
      return t(
        `DDL ${r.ddl} · 接口 ${r.openapi} · AI ${r.ai} · 保留已有 ${r.keptExisting} · 未匹配 ${r.unmatched}` +
          (r.weakMatches > 0 ? ` · 弱匹配 ${r.weakMatches}(请复核)` : ""),
        `DDL ${r.ddl} · API ${r.openapi} · AI ${r.ai} · kept ${r.keptExisting} · unmatched ${r.unmatched}` +
          (r.weakMatches > 0 ? ` · weak ${r.weakMatches} (review)` : ""),
      );
    },
    [enrichDescriptions, companyId, domainId, updateNodeType, refreshDomain],
  );

  /**
   * 对话式编辑 — hand a plain-language request to the model, then apply the
   * operations it returns. `applyOperations` only reads
   * `nodeTypes[].{key,id,propertiesSchema}` and `relationTypes[].{key,id}`, all
   * of which `domain-detail` already carries.
   */
  const runAiEdit = useCallback(
    async (instruction: string, typeKey: string): Promise<string> => {
      const res = (await aiEditSchema({ companyId, domainId, instruction, typeKey })) as {
        error?: string;
        summary?: string;
        operations?: unknown[];
      };
      if (res?.error) throw new Error(res.error);

      const operations = (res?.operations ?? []) as Parameters<typeof applyOperations>[0];
      if (operations.length === 0) return t("模型没有给出任何改动", "The model proposed no changes");

      const outcome = applyOperations(
        operations,
        { nodeTypes: nodeTypes, relationTypes: relationTypes } as never,
        domainId,
      );
      for (const call of outcome.calls) await dispatchEditCall(call);
      refreshDomain();

      const applied = t(`已应用 ${outcome.calls.length} 项`, `${outcome.calls.length} applied`);
      const skipped = outcome.skipped.length > 0
        ? t(`,跳过 ${outcome.skipped.length} 项`, `, ${outcome.skipped.length} skipped`)
        : "";
      return res?.summary ? `${res.summary}(${applied}${skipped})` : `${applied}${skipped}`;
    },
    [aiEditSchema, companyId, domainId, nodeTypes, relationTypes, dispatchEditCall, refreshDomain],
  );

  // Action / Function / Interface counts are not in the graph snapshot; we
  // pull them separately for the right-side Statistics panel.
  const { data: actionTypesData } = usePluginData<{ actionTypes: unknown[] }>(
    "list-action-types", { companyId, domainId },
  );
  const { data: functionsData } = usePluginData<{ functions: unknown[] }>(
    "list-functions", { companyId, domainId },
  );
  const { data: interfacesData } = usePluginData<{ interfaces: unknown[] }>(
    "list-interfaces", { companyId, domainId },
  );

  const [focusNodeTypeId, setFocusNodeTypeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null;
  const [simulateNode, setSimulateNode] = useState<GraphNode | null>(null);
  // Pre-filled ask-aide prompt set by right-click "AI 解释这个节点". Cleared
  // by SandboxTab after it consumes the draft.
  const [aidePrePrompt, setAidePrePrompt] = useState<string | null>(null);
  // BootstrapPanel lifecycle. The panel itself holds the "running" /
  // "completed" UI state, but the parent must keep the panel mounted across
  // the counts-nodes transition (0 -> N) so the user can see the progress
  // lines and the completion summary. Once the user dismisses the panel, we
  // unmount it (and the next re-render will re-evaluate from `counts`).
  const [bootstrapActive, setBootstrapActive] = useState(false);

  // Listen for the "open action form" custom event dispatched by the graph
  // node right-click menu ("动作"). We switch view to the actions tab and
  // hand off the source nodeTypeId so ActionsTab can prefill appliesToNodeTypeId.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ domainId: string; nodeTypeId: string }>).detail;
      if (!detail?.nodeTypeId) return;
      setActionFormPrefill?.({ nodeTypeId: detail.nodeTypeId });
      onRequestView?.("actions");
    };
    window.addEventListener("paperclip-ontology:open-action-form", handler);
    return () => window.removeEventListener("paperclip-ontology:open-action-form", handler);
  }, [onRequestView, setActionFormPrefill]);

  const showTree = view === "graph" || view === "table" || view === "schema";

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Left: node type tree */}
      {showTree && treeOpen && (
        <div className="flex w-48 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-muted/20 p-2">
          <div
            className="mb-1 px-1 text-(length:--text-nano) font-semibold text-muted-foreground uppercase tracking-wide"
            title={t("对象类型 = Palantir Object Type,本域中所有节点的分类", "Object types — Palantir Object Types; the classification of every node in this domain")}
          >
            {t("类型", "Types")} · {nodeTypes.length}
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
                onContextMenu={e => {
                  e.preventDefault();
                  setNodeTypeMenu({
                    x: e.clientX,
                    y: e.clientY,
                    nodeType: { id: nt.id, key: nt.key, display_name: nt.display_name, properties_schema: nt.propertiesSchema },
                  });
                }}
                title={t("拖到图谱=按类型建节点 · 点击=过滤 · 右键=功能菜单", "Drag to canvas to create typed node · click to filter · right-click for actions")}
                className={[
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-(length:--text-compact) transition-colors select-none",
                  focusNodeTypeId === nt.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent",
                ].join(" ")}
              >
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: toneFor(nt.id) }} />
                <span className="flex-1 truncate">{nt.display_name || nt.key}</span>
                {nt.propertiesSchema && typeof nt.propertiesSchema === "object" && Object.keys(nt.propertiesSchema).length > 0 && (
                  <span
                    title={t("该对象类型的属性 schema 字段数", "Number of property schema fields for this object type")}
                    className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-(length:--text-nano) tabular-nums text-muted-foreground"
                  >
                    {Object.keys(nt.propertiesSchema).length} {t("属性", "props")}
                  </span>
                )}
                {(counts?.byNodeType?.[nt.id] ?? 0) > 0 && (
                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-(length:--text-nano) tabular-nums text-primary">
                    {counts!.byNodeType![nt.id]}
                  </span>
                )}
              </div>
            ))
          )}

          {relationTypes.length > 0 && (
            <>
              <div className="mb-1 mt-3 px-1 text-(length:--text-nano) font-semibold text-muted-foreground uppercase tracking-wide">
                {t("关系类型", "Relation types")} · {relationTypes.length}
              </div>
              {relationTypes.map(rt => (
                <div
                  key={rt.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setRelationTypeMenu({
                      x: e.clientX,
                      y: e.clientY,
                      relationType: { id: rt.id, key: rt.key, display_name: rt.display_name },
                    });
                  }}
                  title={t("右键=功能菜单", "Right-click for actions")}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-(length:--text-compact) text-muted-foreground hover:bg-accent"
                >
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
        {/* Sub-tab strip — only when a group menu is active. Renders the
            group's leaf views as a thin horizontal strip just below the
            toolbar so the user can switch between siblings (e.g. between
            动作 ↔ 函数 ↔ 接口 inside 资产) without going back up to row 2. */}
        {currentGroup && (
          <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border bg-muted/20 px-3">
            <span className="text-(length:--text-nano) font-medium text-muted-foreground">
              {currentGroup.icon} {currentGroup.label}
            </span>
            <div className="mx-2 h-4 w-px bg-border" />
            {currentGroup.views.map(child => (
              <button
                key={child.id}
                onClick={() => onSelectView(child.id)}
                className={[
                  "flex items-center gap-1 rounded-md px-2 py-0.5 text-(length:--text-compact) font-medium transition-colors",
                  view === child.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                ].join(" ")}
              >
                <span className="text-[12px]">{child.icon}</span>
                {child.label}
              </button>
            ))}
          </div>
        )}
        {showTree && (
          <GraphView
            companyId={companyId}
            domainId={domainId}
            nodes={nodes}
            edges={edges}
            services={domainData?.services ?? []}
            nodeTypes={nodeTypes}
            relationTypes={relationTypes}
            onChanged={refreshDomain}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            focusNodeTypeId={focusNodeTypeId}
            onSelectNodeType={setFocusNodeTypeId}
            onSaveNodeTypeSchema={saveNodeTypeSchema}
            onAiEdit={runAiEdit}
            onEnrichDescriptions={runEnrichDescriptions}
            mode={view === "graph" ? "graph" : view === "table" ? "table" : "schema"}
            hideTabs
            nodeTypeDragMime={DRAG_MIME}
            onViewNodeDetail={(nodeId) => setSelectedNodeId(nodeId)}
            onSimulateImpact={(node) => setSimulateNode(node)}
            isDomainEmpty={(counts?.nodes ?? 0) === 0}
            onAskAideAboutNode={(node) => {
              onRequestView?.("sandbox");
              setAidePrePrompt(`请介绍节点 ${node.key} (${node.label}) 在本域里扮演什么角色,以及它的上下游关系。`);
            }}
          />
        )}
        {view === "cognition" && <CognitionTab companyId={companyId} />}
        {view === "capabilities" && <CapabilitiesTab companyId={companyId} />}
        {view === "dialogue" && <ChatTab />}
        {view === "sandbox" && domain && (
          <SandboxTab
            companyId={companyId}
            domainId={domain.id}
            domainVersion={domain.version}
            prePrompt={aidePrePrompt}
            onConsumePrePrompt={() => setAidePrePrompt(null)}
            onImportLegacy={onImportLegacy}
          />
        )}
        {view === "actions" && (
          <ActionsTab
            companyId={companyId}
            domainId={domainId}
            initialPrefill={actionFormPrefill}
            onConsumePrefill={() => setActionFormPrefill?.(null)}
          />
        )}
        {view === "functions" && (
          <FunctionsTab companyId={companyId} domainId={domainId} />
        )}
        {view === "interfaces" && (
          <InterfacesTab companyId={companyId} domainId={domainId} />
        )}
        {view === "datasets" && domainId && (
          <DatasetsTab companyId={companyId} domainId={domainId} />
        )}
        {view === "connectors" && domainId && (
          <ConnectorsTab companyId={companyId} domainId={domainId} />
        )}
        {view === "transforms" && domainId && (
          <TransformsTab companyId={companyId} domainId={domainId} />
        )}
        {view === "domains" && (
          <DomainList
            companyId={companyId}
            activeDomainId={domainId}
            onOpen={(id) => onOpenDomain?.(id)}
          />
        )}
        {view === "manage" && domainId && (
          <ManageTab companyId={companyId} domainId={domainId} />
        )}

        {simulateNode && (
          <ImpactSimulationModal
            companyId={companyId}
            domainId={domainId}
            node={simulateNode}
            onClose={() => setSimulateNode(null)}
          />
        )}

        {/* Right-click on a node type in the left tree opens this menu.
            Anchored at the cursor (clientX/clientY); backdrop click closes.
            Items mirror the canvas right-click ("按型" submenu) plus copy /
            action / delete. The delete item is disabled when this type
            still has nodes referencing it — the hard-delete would orphan
            them (their node_type_id becomes NULL). We surface this through
            counts.byNodeType which already tracks live instance counts. */}
        {nodeTypeAsk && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setNodeTypeAsk(null)}
              onContextMenu={(e) => { e.preventDefault(); setNodeTypeAsk(null); }}
            />
            <div
              className="fixed z-50 w-72 rounded-lg border border-border bg-card p-2 shadow-lg"
              style={{ left: nodeTypeAsk.x, top: nodeTypeAsk.y }}
            >
              <div className="mb-1.5 text-(length:--text-nano) text-muted-foreground">
                {nodeTypeAsk.kind === "node"
                  ? t(
                      `在「${nodeTypeAsk.nodeType.display_name}」下新建节点`,
                      `New node under "${nodeTypeAsk.nodeType.display_name}"`,
                    )
                  : t(
                      `从「${nodeTypeAsk.nodeType.display_name}」出发的关系 key`,
                      `Relation key from "${nodeTypeAsk.nodeType.display_name}"`,
                    )}
              </div>
              <input
                autoFocus
                value={nodeTypeAsk.value}
                placeholder={nodeTypeAsk.kind === "relation" ? "belongs_to" : ""}
                onChange={(e) => setNodeTypeAsk({ ...nodeTypeAsk, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitNodeTypeAsk();
                  if (e.key === "Escape") setNodeTypeAsk(null);
                }}
                className="w-full rounded border border-border bg-background px-2 py-1 text-(length:--text-nano) text-foreground outline-none"
              />
              {nodeTypeAsk.kind === "relation" && (
                <div className="mt-1 text-(length:--text-nano) text-muted-foreground">
                  key:{" "}
                  <span className="text-foreground/80">
                    {nodeTypeAsk.value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_") || "…"}
                  </span>
                </div>
              )}
              {nodeTypeAsk.error && (
                <div className="mt-1 text-(length:--text-nano) text-destructive">{nodeTypeAsk.error}</div>
              )}
              <div className="mt-1.5 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setNodeTypeAsk(null)}
                  className="rounded px-2 py-0.5 text-(length:--text-nano) text-muted-foreground hover:bg-accent"
                >
                  {t("取消", "Cancel")}
                </button>
                <button
                  type="button"
                  onClick={submitNodeTypeAsk}
                  className="rounded bg-accent px-2 py-0.5 text-(length:--text-nano) text-foreground"
                >
                  {t("确定", "OK")}
                </button>
              </div>
            </div>
          </>
        )}

        {nodeTypeMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setNodeTypeMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setNodeTypeMenu(null); }}
            />
            <div
              className="fixed z-50 min-w-[8rem] rounded-lg border border-border bg-card p-1 shadow-lg"
              style={{ left: nodeTypeMenu.x, top: nodeTypeMenu.y }}
            >
              <MenuItem2
                label={t("新建", "New")}
                icon="＋"
                onClick={() => {
                  const m = nodeTypeMenu; setNodeTypeMenu(null);
                  setNodeTypeAsk({
                    kind: "node",
                    nodeType: m.nodeType,
                    x: m.x,
                    y: m.y,
                    value: m.nodeType.display_name,
                  });
                }}
              />
              <MenuItem2
                label={t("动作", "Action")}
                icon="⚙"
                onClick={() => {
                  const m = nodeTypeMenu; setNodeTypeMenu(null);
                  setActionFormPrefill?.({ nodeTypeId: m.nodeType.id });
                  onRequestView?.("actions");
                }}
              />
              <MenuItem2
                label={t("复制", "Copy")}
                icon="⎘"
                onClick={() => {
                  const m = nodeTypeMenu; setNodeTypeMenu(null);
                  if (m.nodeType.key && typeof navigator !== "undefined" && navigator.clipboard) {
                    void navigator.clipboard.writeText(m.nodeType.key);
                  }
                }}
              />
              <MenuItem2
                label={t("聚焦", "Focus")}
                icon="◉"
                onClick={() => {
                  const m = nodeTypeMenu; setNodeTypeMenu(null);
                  setFocusNodeTypeId(m.nodeType.id);
                }}
              />
              <MenuItem2
                label={t("属性", "Schema")}
                icon="◐"
                onClick={() => {
                  const m = nodeTypeMenu; setNodeTypeMenu(null);
                  setPropSchemaEditor({
                    nodeTypeId: m.nodeType.id,
                    nodeTypeLabel: m.nodeType.display_name,
                    initialSchema: (m.nodeType.properties_schema as Record<string, unknown> | null | undefined) ?? null,
                  });
                }}
              />
              <MenuItem2
                label={suggestingFieldsFor
                  ? t("生成中…", "Generating…")
                  : t("智能补全", "AI fields")}
                icon="✨"
                disabled={suggestingFieldsFor !== null}
                onClick={() => {
                  const m = nodeTypeMenu; setNodeTypeMenu(null);
                  setSuggestingFieldsFor(m.nodeType.id);
                  void (async () => {
                    try {
                      const res = await aiSuggestFields({
                        companyId,
                        domainId,
                        typeKey: m.nodeType.key,
                      }) as { error?: string; merged?: Record<string, unknown> };
                      if (res?.error) {
                        window.alert(res.error);
                        return;
                      }
                      // The model only proposes — the merge opens in the schema
                      // editor so the user still reviews before saving.
                      setPropSchemaEditor({
                        nodeTypeId: m.nodeType.id,
                        nodeTypeLabel: m.nodeType.display_name,
                        initialSchema: res?.merged ?? null,
                      });
                    } catch (e) {
                      window.alert(String((e as Error)?.message ?? e));
                    } finally {
                      setSuggestingFieldsFor(null);
                    }
                  })();
                }}
              />
              <MenuItem2
                label={t("建立关系", "New relation")}
                icon="⇄"
                onClick={() => {
                  const m = nodeTypeMenu; setNodeTypeMenu(null);
                  setNodeTypeAsk({ kind: "relation", nodeType: m.nodeType, x: m.x, y: m.y, value: "" });
                }}
              />
              <MenuDivider2 />
              <MenuItem2
                label={t("删除", "Delete")}
                icon="✕"
                danger
                disabled={(counts?.byNodeType?.[nodeTypeMenu.nodeType.id] ?? 0) > 0}
                disabledReason={t("该类型下还有节点,先删除节点", "Has nodes referencing it; delete them first")}
                onClick={() => {
                  const m = nodeTypeMenu; setNodeTypeMenu(null);
                  const remaining = counts?.byNodeType?.[m.nodeType.id] ?? 0;
                  const confirmMsg = remaining > 0
                    ? t(`该类型下还有 ${remaining} 个节点,删除后这些节点会失去分类。继续?`, `${remaining} nodes reference this type. Delete the type anyway? Nodes will lose their classification but survive.`)
                    : t("删除该类型?", "Delete this type?");
                  if (!window.confirm(confirmMsg)) return;
                  void (async () => {
                    try {
                      await deleteNodeType({ companyId, nodeTypeId: m.nodeType.id });
                      refreshDomain();
                    } catch (e) {
                      window.alert(String((e as Error)?.message ?? e));
                    }
                  })();
                }}
              />
            </div>
          </>
        )}

        {/* Right-click on a relation type in the left tree. Smaller menu
            than nodeTypeMenu — no "create node" / "动作" affordance (those
            make sense for object types, not link types). We expose copy
            and delete; delete is hard-delete (same ON DELETE SET NULL on
            ontology_edges.relation_type_id as deleteNodeType). */}
        {relationTypeMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setRelationTypeMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setRelationTypeMenu(null); }}
            />
            <div
              className="fixed z-50 min-w-[8rem] rounded-lg border border-border bg-card p-1 shadow-lg"
              style={{ left: relationTypeMenu.x, top: relationTypeMenu.y }}
            >
              <MenuItem2
                label={t("复制", "Copy")}
                icon="⎘"
                onClick={() => {
                  const m = relationTypeMenu; setRelationTypeMenu(null);
                  if (m.relationType.key && typeof navigator !== "undefined" && navigator.clipboard) {
                    void navigator.clipboard.writeText(m.relationType.key);
                  }
                }}
              />
              <MenuDivider2 />
              <MenuItem2
                label={t("删除", "Delete")}
                icon="✕"
                danger
                onClick={() => {
                  const m = relationTypeMenu; setRelationTypeMenu(null);
                  const confirmMsg = t("删除该关系类型? 该关系下的边会失去分类但保留。", "Delete this relation type? Edges using it will lose classification but survive.");
                  if (!window.confirm(confirmMsg)) return;
                  void (async () => {
                    try {
                      await deleteRelationType({ companyId, relationTypeId: m.relationType.id });
                      refreshDomain();
                    } catch (e) {
                      window.alert(String((e as Error)?.message ?? e));
                    }
                  })();
                }}
              />
            </div>
          </>
        )}

        {/* Properties-schema editor. Lives on the type, not the instance —
            this is the canonical place to define "what fields does a
            Customer carry?". Default UI is a structured row form
            (name + type), with a JSON link for the rare case where you
            need $ref / enum / format / nested objects. Save sends a
            PATCH update-node-type with the parsed payload. */}
        <PropertiesSchemaEditor
          editor={propSchemaEditor}
          onClose={() => setPropSchemaEditor(null)}
          onSave={async (parsed) => {
            if (!propSchemaEditor) return;
            await updateNodeType({
              companyId,
              nodeTypeId: propSchemaEditor.nodeTypeId,
              propertiesSchema: parsed,
              // The order the user wrote in the JSON payload. Anything that is not
              // a property name is pruned by the store, so a wrapped document
              // degrades to "unknown" rather than declaring a false order.
              propertyOrder: Object.keys(parsed),
            });
            setPropSchemaEditor(null);
            refreshDomain();
          }}
        />
      </div>

      {/* Right: stats panel. Skipped on the cockpit (a chat surface that needs
          no stats chrome beside it) and only shown when the user asked for it
          or a node is selected — otherwise the canvas keeps the full width. */}
      {domain && view !== "sandbox" && (rightOpen || selectedNode !== null) && (
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

          {/* AI 初始化 — only on empty domains. Above Statistics so it's the
              most prominent thing in the panel when the user lands here. We
              keep the panel mounted across the bootstrap itself so the
              progress lines + completion summary don't disappear the moment
              counts.nodes flips from 0 to N. */}
          {counts && (counts.nodes === 0 || bootstrapActive) && (
            <BootstrapPanel
              companyId={companyId}
              domainId={domainId}
              description={domain?.description ?? null}
              onActiveChange={setBootstrapActive}
              onCompleted={handleBootstrapCompleted}
            />
          )}

          {counts && (
            <div>
              <div className="mb-2 text-(length:--text-compact) font-semibold">{t("统计", "Statistics")}</div>
              <div className="grid grid-cols-2 gap-2">
                <StatCard label={t("节点数", "Nodes")} value={counts.nodes} />
                <StatCard label={t("关系数", "Edges")} value={counts.edges} />
                <StatCard label={t("类型数", "Node types")} value={counts.nodeTypes} />
                <StatCard label={t("关系类型", "Rel types")} value={counts.relationTypes} />
                <StatCard
                  label={t("跨域关系", "Cross-domain")}
                  value={counts.crossDomainEdges ?? 0}
                />
                <StatCard label={t("类型节点", "Typed nodes")} value={Object.values(counts.byNodeType ?? {}).reduce((s, n) => s + n, 0)} />
                <StatCard label={t("动作数", "Actions")} value={actionTypesData?.actionTypes.length ?? 0} />
                <StatCard label={t("函数数", "Functions")} value={functionsData?.functions.length ?? 0} />
                <StatCard label={t("接口数", "Interfaces")} value={interfacesData?.interfaces.length ?? 0} />
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

// Generic status kind for the new Palantir-style primitives (Action /
// Function / Interface). All three share the same status vocabulary:
// "draft" / "active" / "deprecated".
function primitiveStatusKind(s: string): "ok" | "pending" | "info" {
  if (s === "active") return "ok";
  if (s === "deprecated") return "info";
  return "pending";
}

// Domain lifecycle, which is a different axis from the domain's free-text
// `status`. "archived" reads as neutral rather than pending: nothing is waiting.
function domainLifecycleKind(s: string): "ok" | "pending" | "info" | "warning" {
  if (s === "active") return "ok";
  if (s === "deprecated") return "warning";
  if (s === "archived") return "info";
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

interface ActionTypeRow {
  id: string;
  key: string;
  display_name: string;
  description: string | null;
  kind: string;
  applies_to_node_type_id: string | null;
  idempotent: boolean;
  status: string;
}

/**
 * Tab for browsing and editing Palantir-style action types attached to
 * this ontology domain. Mirrors the CapabilitiesTab pattern: a top card
 * with a "new" form, a DataTable of existing rows, a soft-delete button
 * per row, and (when launched from the graph node right-click) a prefill
 * on the appliesToNodeTypeId field. The prefill is consumed on mount so
 * the form doesn't keep stale state on a second visit.
 */
function ActionsTab({
  companyId,
  domainId,
  initialPrefill,
  onConsumePrefill,
}: {
  companyId: string;
  domainId: string;
  initialPrefill?: { nodeTypeId: string } | null;
  onConsumePrefill?: () => void;
}): ReactElement {
  const { data, loading, error, refresh } = usePluginData<{ actionTypes: ActionTypeRow[] }>(
    "list-action-types",
    { companyId, domainId },
  );
  const createAction = usePluginAction("create-action-type");
  const deleteAction = usePluginAction("delete-action-type");
  const [keyInput, setKeyInput] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [kind, setKind] = useState<string>("create");
  const [description, setDescription] = useState("");
  const [appliesToNodeTypeId, setAppliesToNodeTypeId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Node types are exposed via the list-node-types route keyed on domainId.
  // We only need key/displayName here, but reading the full row is fine — the
  // data is already in the parent's usePluginData cache for graph rendering.
  const { data: ntData } = usePluginData<{ nodeTypes: { id: string; key: string; display_name: string }[] }>(
    "list-node-types",
    { companyId, domainId },
  );
  const nodeTypes = ntData?.nodeTypes ?? [];

  // Apply prefill from the graph right-click menu (the "动作" item dispatches
  // a window CustomEvent that the parent routes here). Consume on first
  // effect so a subsequent manual visit doesn't see stale state.
  useEffect(() => {
    if (!initialPrefill?.nodeTypeId) return;
    setAppliesToNodeTypeId(initialPrefill.nodeTypeId);
    onConsumePrefill?.();
  }, [initialPrefill?.nodeTypeId, onConsumePrefill]);

  const submit = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      await createAction({
        companyId,
        domainId,
        key: keyInput.trim(),
        displayName: displayName.trim() || keyInput.trim(),
        description: description.trim() || undefined,
        kind,
        appliesToNodeTypeId: appliesToNodeTypeId || null,
      });
      setKeyInput("");
      setDisplayName("");
      setDescription("");
      setAppliesToNodeTypeId("");
      refresh();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, domainId, keyInput, displayName, description, kind, appliesToNodeTypeId, createAction, refresh]);

  const rows = data?.actionTypes ?? [];
  const ntById = useMemo(() => {
    const m = new Map<string, { id: string; key: string; display_name: string }>();
    for (const nt of nodeTypes) m.set(nt.id, nt);
    return m;
  }, [nodeTypes]);

  return (
    <>
      <div className={CARD}>
        <div className="mb-2 font-semibold">{t("新建动作", "New action")}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            className={INPUT + " w-32"}
            placeholder="key"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <input
            className={INPUT + " w-44"}
            placeholder={t("显示名", "Display name")}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <select className={INPUT + " w-28"} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="create">create</option>
            <option value="modify">modify</option>
            <option value="delete">delete</option>
            <option value="function">function</option>
            <option value="external">external</option>
            <option value="notify">notify</option>
            <option value="composite">composite</option>
          </select>
          <select
            className={INPUT + " w-40"}
            value={appliesToNodeTypeId}
            onChange={(e) => setAppliesToNodeTypeId(e.target.value)}
          >
            <option value="">{t("适用所有类型", "(any type)")}</option>
            {nodeTypes.map((nt) => (
              <option key={nt.id} value={nt.id}>
                {nt.display_name || nt.key}
              </option>
            ))}
          </select>
          <input
            className={INPUT + " min-w-60 flex-1"}
            placeholder={t("描述", "Description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button className={BTN} disabled={busy || !keyInput.trim()} onClick={submit}>
            {busy ? "…" : t("新建", "Create")}
          </button>
        </div>
        {err && <div className="mt-2 text-(length:--text-compact) text-muted-foreground">{err}</div>}
      </div>

      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : t("暂无动作", "No actions yet")}
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          { key: "key", header: "key", width: "140px", render: (_v, row) => (
            <span className="font-mono">{(row as unknown as ActionTypeRow).key}</span>
          ) },
          { key: "display_name", header: t("名称", "Name") },
          { key: "kind", header: t("类型", "Kind"), width: "90px" },
          {
            key: "applies_to_node_type_id",
            header: t("适用", "Applies"),
            width: "140px",
            render: (_v, row) => {
              const nt = ntById.get((row as unknown as ActionTypeRow).applies_to_node_type_id ?? "");
              return nt ? (nt.display_name || nt.key) : "—";
            },
          },
          {
            key: "status",
            header: t("状态", "Status"),
            width: "100px",
            render: (_v, row) => <StatusBadge label={(row as unknown as ActionTypeRow).status} status={primitiveStatusKind((row as unknown as ActionTypeRow).status)} />,
          },
          {
            key: "_del",
            header: "",
            width: "60px",
            render: (_v, row) => (
              <button
                className={GHOST_BTN}
                onClick={async () => {
                  if (!window.confirm(t("删除该动作?", "Delete this action?"))) return;
                  setBusy(true);
                  try {
                    await deleteAction({ companyId, actionTypeId: (row as unknown as ActionTypeRow).id });
                    refresh();
                  } catch (e) {
                    setErr(String((e as Error)?.message ?? e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("删除", "Del")}
              </button>
            ),
          },
        ]}
      />
    </>
  );
}

interface FunctionRow {
  id: string;
  name: string;
  type: string;
  version: string;
  description: string | null;
  status: string;
}

/**
 * Tab for browsing and editing Palantir-style ontology functions (queries,
 * actions, webhooks). Same shape as ActionsTab but the row uses `name`
 * instead of `key` (ontology_functions has no key column — identity is
 * (domain_id, name, version) per the migration's UNIQUE constraint). No
 * cross-tab navigation; functions are not directly tied to a node type
 * the way actions are.
 */
function FunctionsTab({
  companyId,
  domainId,
}: {
  companyId: string;
  domainId: string;
}): ReactElement {
  const { data, loading, error, refresh } = usePluginData<{ functions: FunctionRow[] }>(
    "list-functions",
    { companyId, domainId },
  );
  const createFn = usePluginAction("create-function");
  const deleteFn = usePluginAction("delete-function");
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("query");
  const [version, setVersion] = useState("1.0.0");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      await createFn({
        companyId,
        domainId,
        name: name.trim(),
        type,
        version: version.trim() || "1.0.0",
        description: description.trim() || undefined,
      });
      setName("");
      setDescription("");
      refresh();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, domainId, name, type, version, description, createFn, refresh]);

  const rows = data?.functions ?? [];

  return (
    <>
      <div className={CARD}>
        <div className="mb-2 font-semibold">{t("新建函数", "New function")}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            className={INPUT + " w-44"}
            placeholder={t("函数名", "Function name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select className={INPUT + " w-24"} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="query">query</option>
            <option value="action">action</option>
            <option value="webhook">webhook</option>
          </select>
          <input
            className={INPUT + " w-24"}
            placeholder="version"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          />
          <input
            className={INPUT + " min-w-60 flex-1"}
            placeholder={t("描述", "Description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button className={BTN} disabled={busy || !name.trim()} onClick={submit}>
            {busy ? "…" : t("新建", "Create")}
          </button>
        </div>
        {err && <div className="mt-2 text-(length:--text-compact) text-muted-foreground">{err}</div>}
      </div>

      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : t("暂无函数", "No functions yet")}
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          { key: "name", header: t("名称", "Name"), width: "180px", render: (_v, row) => (
            <span className="font-mono">{(row as unknown as FunctionRow).name}</span>
          ) },
          { key: "type", header: t("类型", "Type"), width: "90px" },
          { key: "version", header: t("版本", "Version"), width: "90px" },
          {
            key: "status",
            header: t("状态", "Status"),
            width: "100px",
            render: (_v, row) => <StatusBadge label={(row as unknown as FunctionRow).status} status={primitiveStatusKind((row as unknown as FunctionRow).status)} />,
          },
          {
            key: "_del",
            header: "",
            width: "60px",
            render: (_v, row) => (
              <button
                className={GHOST_BTN}
                onClick={async () => {
                  if (!window.confirm(t("删除该函数?", "Delete this function?"))) return;
                  setBusy(true);
                  try {
                    await deleteFn({ companyId, functionId: (row as unknown as FunctionRow).id });
                    refresh();
                  } catch (e) {
                    setErr(String((e as Error)?.message ?? e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("删除", "Del")}
              </button>
            ),
          },
        ]}
      />
    </>
  );
}

/**
 * Local MenuItem used by the node-type right-click menu in DomainWorkspace.
 * Duplicates graph-view's MenuItem shape so we don't have to thread that
 * component through the public ui/ boundary just for this one menu.
 * `disabled` greys the row out and short-circuits the click handler; the
 * optional `disabledReason` becomes the button title so hover explains why.
 */
function MenuItem2({
  label,
  onClick,
  danger,
  icon,
  disabled,
  disabledReason,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  icon?: string;
  disabled?: boolean;
  disabledReason?: string;
}): ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      title={disabled ? disabledReason : undefined}
      className={[
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-(length:--text-compact) transition-colors",
        disabled
          ? "cursor-not-allowed text-muted-foreground opacity-50"
          : danger
            ? "text-destructive hover:bg-accent"
            : "text-foreground hover:bg-accent",
      ].join(" ")}
    >
      {icon && <span aria-hidden className="w-4 shrink-0 text-center text-muted-foreground">{icon}</span>}
      <span className="truncate">{label}</span>
    </button>
  );
}

function MenuDivider2(): ReactElement {
  return <div className="my-1 h-px bg-border" />;
}

/**
 * Modal for editing a node type's properties schema. Default UI is a
 * simple row list (key + type + delete) — covers 95% of the cases where
 * you just want to declare "this type has these fields". A "JSON" link
 * in the footer opens a raw textarea for the rare cases where you need
 * enum / $ref / format / nested objects. Two separate entry points, no
 * round-trip syncing.
 *
 * Row parsing/serialisation is shared with the schema tab's inline editor
 * (`./schemaRows.js`) so both surfaces preserve the descriptor keys this form
 * does not expose — previously saving here rewrote every field as `{ type }`
 * and silently dropped `enum` / `format` / `required`.
 */

function PropertiesSchemaEditor({
  editor,
  onClose,
  onSave,
}: {
  editor: {
    nodeTypeId: string;
    nodeTypeLabel: string;
    initialSchema: Record<string, unknown> | null;
  } | null;
  onClose: () => void;
  onSave: (parsed: Record<string, unknown>) => Promise<void>;
}): ReactElement | null {
  const [rows, setRows] = useState<SchemaRow[]>([]);
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [seeded, setSeeded] = useState<{ nodeTypeId: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editor && (!seeded || seeded.nodeTypeId !== editor.nodeTypeId)) {
      setRows(rowsFromSchema(editor.initialSchema));
      setJsonText(JSON.stringify(editor.initialSchema ?? {}, null, 2));
      setShowJson(false);
      setErr(null);
      setBusy(false);
      setSeeded({ nodeTypeId: editor.nodeTypeId });
    }
  }, [editor, seeded]);

  if (!editor) return null;

  const updateRow = (i: number, patch: Partial<SchemaRow>) => {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };
  const removeRow = (i: number) => {
    setRows((r) => r.filter((_, idx) => idx !== i));
  };
  const addRow = () => {
    setRows((r) => [...r, { key: "", type: "string", description: "", rest: {} }]);
  };

  const save = async () => {
    setErr(null);
    let payload: Record<string, unknown>;
    if (showJson) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch (e) {
        setErr(`${t("JSON 解析失败", "JSON parse failed")}: ${(e as Error).message}`);
        return;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setErr(t("schema 必须是 object", "schema must be an object"));
        return;
      }
      payload = parsed as Record<string, unknown>;
    } else {
      payload = schemaFromRows(rows);
    }
    setBusy(true);
    try {
      await onSave(payload);
    } catch (e) {
      setBusy(false);
      setErr(String((e as Error)?.message ?? e));
    }
  };

  return (
    <div
      className="fixed inset-0 z-40"
      onClick={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
    >
      <div
        className="absolute left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[28rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-(length:--text-compact) font-semibold">
              {t("属性", "Properties")}
            </div>
            <div className="truncate text-(length:--text-nano) text-muted-foreground">
              {editor.nodeTypeLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-0.5 text-(length:--text-nano) text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t("关闭", "Close")}
          >
            ×
          </button>
        </div>

        {/* Body — `min-h-0` is load-bearing: without it a flex child keeps
            `min-height: auto`, refuses to shrink below its content, and pushes
            the footer out of the max-h box (the Save / Cancel buttons become
            unreachable once the field list is long — e.g. after 智能补全). */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {showJson ? (
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
              className="h-72 w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 font-mono text-(length:--text-nano) text-foreground outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <>
              <div className="mb-1.5 grid grid-cols-[1fr_5rem_1.5rem] gap-1.5 px-1 text-(length:--text-nano) font-medium text-muted-foreground">
                <div>{t("字段名", "Key")}</div>
                <div>{t("类型", "Type")}</div>
                <div></div>
              </div>
              <div className="space-y-1">
                {rows.map((row, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_5rem_1.5rem] items-center gap-1.5"
                  >
                    <input
                      type="text"
                      value={row.key}
                      placeholder={t("name", "name")}
                      onChange={(e) => updateRow(i, { key: e.target.value })}
                      className="rounded-md border border-border bg-background px-2 py-1 text-(length:--text-nano) text-foreground outline-none focus:ring-1 focus:ring-ring"
                    />
                    <select
                      value={row.type}
                      onChange={(e) =>
                        updateRow(i, { type: e.target.value })
                      }
                      className="rounded-md border border-border bg-background px-1.5 py-1 text-(length:--text-nano) text-foreground outline-none focus:ring-1 focus:ring-ring"
                    >
                      {typeOptionsFor(row.type).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="rounded px-1 py-1 text-(length:--text-nano) text-muted-foreground hover:bg-accent hover:text-destructive"
                      title={t("删除字段", "Remove field")}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addRow}
                className="mt-2 rounded-md border border-dashed border-border px-2 py-1 text-(length:--text-nano) text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                + {t("字段", "field")}
              </button>
            </>
          )}
          {err && <div className="mt-2 text-(length:--text-nano) text-destructive">{err}</div>}
        </div>

        {/* Footer — must never be squeezed or scrolled away. */}
        <div className="flex shrink-0 items-center justify-between border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={() => setShowJson((s) => !s)}
            className="text-(length:--text-nano) text-muted-foreground hover:text-foreground hover:underline"
          >
            {showJson ? t("← 表单", "← Form") : t("高级 JSON →", "Advanced JSON →")}
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-md px-2 py-1 text-(length:--text-nano) text-muted-foreground hover:bg-accent"
            >
              {t("取消", "Cancel")}
            </button>
            <button
              type="button"
              onClick={() => { void save(); }}
              disabled={busy}
              className="rounded-md bg-primary px-2 py-1 text-(length:--text-nano) font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "…" : t("保存", "Save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface InterfaceRow {
  id: string;
  key: string;
  display_name: string;
  description: string | null;
}

/**
 * Tab for browsing and editing Palantir-style ontology interfaces (shared
 * property schemas that object types can implement — Foundry's
 * InterfaceType primitive). Mirrors FunctionsTab shape but with the
 * interface-specific fields: key / displayName / description. The
 * extends_interfaces list is editable later if needed.
 */
function InterfacesTab({
  companyId,
  domainId,
}: {
  companyId: string;
  domainId: string;
}): ReactElement {
  const { data, loading, error, refresh } = usePluginData<{ interfaces: InterfaceRow[] }>(
    "list-interfaces",
    { companyId, domainId },
  );
  const createIface = usePluginAction("create-interface");
  const deleteIface = usePluginAction("delete-interface");
  const [keyInput, setKeyInput] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      await createIface({
        companyId,
        domainId,
        key: keyInput.trim(),
        displayName: displayName.trim() || keyInput.trim(),
        description: description.trim() || undefined,
      });
      setKeyInput("");
      setDisplayName("");
      setDescription("");
      refresh();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, domainId, keyInput, displayName, description, createIface, refresh]);

  const rows = data?.interfaces ?? [];

  return (
    <>
      <div className={CARD}>
        <div className="mb-2 font-semibold">{t("新建接口", "New interface")}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            className={INPUT + " w-32"}
            placeholder="key"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <input
            className={INPUT + " w-44"}
            placeholder={t("显示名", "Display name")}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <input
            className={INPUT + " min-w-60 flex-1"}
            placeholder={t("描述", "Description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button className={BTN} disabled={busy || !keyInput.trim()} onClick={submit}>
            {busy ? "…" : t("新建", "Create")}
          </button>
        </div>
        {err && <div className="mt-2 text-(length:--text-compact) text-muted-foreground">{err}</div>}
      </div>

      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : t("暂无接口", "No interfaces yet")}
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          { key: "key", header: "key", width: "180px", render: (_v, row) => (
            <span className="font-mono">{(row as unknown as InterfaceRow).key}</span>
          ) },
          { key: "display_name", header: t("名称", "Name") },
          { key: "description", header: t("描述", "Description"), render: (_v, row) => (
            <span className="truncate text-(length:--text-nano) text-muted-foreground">
              {(row as unknown as InterfaceRow).description ?? ""}
            </span>
          ) },
          {
            key: "_del",
            header: "",
            width: "60px",
            render: (_v, row) => (
              <button
                className={GHOST_BTN}
                onClick={async () => {
                  if (!window.confirm(t("删除该接口?", "Delete this interface?"))) return;
                  setBusy(true);
                  try {
                    await deleteIface({ companyId, interfaceId: (row as unknown as InterfaceRow).id });
                    refresh();
                  } catch (e) {
                    setErr(String((e as Error)?.message ?? e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("删除", "Del")}
              </button>
            ),
          },
        ]}
      />
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

/**
 * Domain list management: every ontology domain in the company, and what can be
 * done to one.
 *
 * This component already existed and was never rendered — it was written for a
 * domain-picker entry point that the header `<select>` ended up covering, so it
 * sat as dead code while the only thing the UI could do with a domain was look at
 * it. The create form and the table below are reused as they were; the lifecycle
 * and action columns are what make it management rather than a listing.
 */
function DomainList({
  companyId,
  activeDomainId,
  onOpen,
}: {
  companyId: string;
  activeDomainId: string | null;
  onOpen: (domainId: string) => void;
}): ReactElement {
  const { data, loading, error, refresh } = usePluginData<{ domains: OntologyDomain[] }>(
    "list-domains",
    { companyId },
  );
  const createDomain = usePluginAction("create-domain");
  const updateDomain = usePluginAction("update-domain");
  const transitionDomain = usePluginAction("transition-domain");
  const deleteDomain = usePluginAction("delete-domain");
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /** Which row has work in flight, and what went wrong on it. */
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  /**
   * Renaming happens in the row, not in `window.prompt`: the name belongs beside
   * the row it names, and a browser modal would take the list away to ask for one
   * string. Only one row is ever open at a time.
   */
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [rowError, setRowError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setFormError(null);
    try {
      await createDomain({ companyId, slug, displayName, description: description.trim() || undefined });
      setSlug("");
      setDisplayName("");
      setDescription("");
      refresh();
    } catch (err) {
      setFormError(String((err as Error)?.message ?? err));
    } finally {
      setBusy(false);
    }
  }, [companyId, slug, displayName, description, createDomain, refresh]);

  /**
   * Run one row's mutation, then re-read the list. Refreshing beats patching the
   * row in place: retiring a domain changes what the picker should offer, and the
   * list is short enough that a re-read costs nothing.
   */
  const runOnRow = useCallback(
    async (domainId: string, fn: () => Promise<unknown>) => {
      setBusyRowId(domainId);
      setRowError(null);
      try {
        await fn();
        refresh();
      } catch (e) {
        setRowError(String((e as Error)?.message ?? e));
      } finally {
        setBusyRowId(null);
      }
    },
    [refresh],
  );

  const rename = (d: OntologyDomain) => {
    setRenamingId(d.id);
    setRenameValue(d.display_name);
  };

  const submitRename = (d: OntologyDomain) => {
    const name = renameValue.trim();
    setRenamingId(null);
    // Clearing the box, or retyping the same name, is a cancel — not an error.
    if (!name || name === d.display_name) return;
    void runOnRow(d.id, () => updateDomain({ companyId, domainId: d.id, displayName: name }));
  };

  const advance = (d: OntologyDomain, to: DomainLifecycleState) => {
    if (!window.confirm(t(`把「${d.display_name}」推进到 ${to}?`, `Move "${d.display_name}" to ${to}?`))) return;
    void runOnRow(d.id, () => transitionDomain({ companyId, domainId: d.id, to }));
  };

  const retire = (d: OntologyDomain) => {
    // The message says the data is kept, because it is: this is a soft delete and
    // an operator who believes otherwise plans a different recovery.
    const message = t(
      `注销「${d.display_name}」?它会从所有列表消失,数据保留、可恢复。`,
      `Retire "${d.display_name}"? It disappears from every list; the row is kept and can be restored.`,
    );
    if (!window.confirm(message)) return;
    void runOnRow(d.id, () => deleteDomain({ companyId, domainId: d.id }));
  };

  return (
    <>
      <div className={CARD}>
        <div className={SECTION_TITLE}>{t("新建域", "New domain")}</div>
        <input className={INPUT} placeholder={t("标识 (slug)", "slug")} value={slug} onChange={(e) => setSlug(e.target.value)} />
        <input
          className={INPUT}
          placeholder={t("显示名称", "display name")}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <textarea
          className={INPUT + " resize-none"}
          rows={2}
          placeholder={t("描述 (可选)", "Description (optional)")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button className={BTN} disabled={busy || !slug || !displayName} onClick={submit}>
          {busy ? "…" : t("创建","Create")}
        </button>
        {formError && <div className={MUTED + " mt-2"}>{formError}</div>}
      </div>

      {rowError && <div className={CARD + " text-destructive"}>{rowError}</div>}

      <DataTable
        loading={loading}
        emptyMessage={error ? `${t("失败","Failed")}: ${error.message}` : t("还没有本体域,先在上方新建一个。", "No ontology domains yet.")}
        rows={(data?.domains ?? []) as unknown as Record<string, unknown>[]}
        columns={[
          {
            key: "display_name",
            header: t("域","Domain"),
            render: (_v, row) => {
              const d = row as unknown as OntologyDomain;
              return (
                <div className="flex items-center gap-2">
                  <button className={GHOST_BTN} onClick={() => onOpen(d.id)}>
                    {d.display_name}
                  </button>
                  {d.id === activeDomainId && <span className={MUTED}>{t("当前","current")}</span>}
                </div>
              );
            },
          },
          { key: "slug", header: t("标识","Slug") },
          { key: "version", header: t("版本","Version"), width: "80px" },
          {
            key: "lifecycle_state",
            header: t("生命周期","Lifecycle"),
            width: "120px",
            render: (v) => <StatusBadge label={String(v)} status={domainLifecycleKind(String(v))} />,
          },
          {
            key: "status",
            header: t("状态","Status"),
            width: "100px",
            render: (_v, row) => {
              const status = (row as unknown as OntologyDomain).status;
              return <StatusBadge label={status} status={status === "active" ? "ok" : "pending"} />;
            },
          },
          {
            key: "actions",
            header: t("操作","Actions"),
            // Four buttons at nano size; 240px clipped the last one against the
            // table edge.
            width: "330px",
            render: (_v, row) => {
              const d = row as unknown as OntologyDomain;
              const rowBusy = busyRowId === d.id;
              // The transitions the core allows from here, so the panel cannot
              // offer a move the store would refuse.
              const next = DOMAIN_STATE_TRANSITIONS[d.lifecycle_state as DomainLifecycleState] ?? [];
              return (
                <div className="flex flex-wrap items-center gap-1.5">
                  {renamingId === d.id ? (
                    <>
                      <input
                        autoFocus
                        value={renameValue}
                        placeholder={t("显示名称", "Display name")}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitRename(d);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="w-40 rounded border border-border bg-background px-1.5 py-0.5 text-(length:--text-nano) text-foreground outline-none"
                      />
                      <button className={ROW_BTN} disabled={rowBusy} onClick={() => submitRename(d)}>
                        {t("保存","Save")}
                      </button>
                      <button className={ROW_BTN} disabled={rowBusy} onClick={() => setRenamingId(null)}>
                        {t("取消","Cancel")}
                      </button>
                    </>
                  ) : (
                    <button className={ROW_BTN} disabled={rowBusy} onClick={() => rename(d)}>
                      {t("改名","Rename")}
                    </button>
                  )}
                  {next.map((state) => (
                    <button key={state} className={ROW_BTN} disabled={rowBusy} onClick={() => advance(d, state)}>
                      {/* Arrow prefix: the label is the state it moves *to*, so on
                          its own it reads as a status rather than an action. */}
                      →{state}
                    </button>
                  ))}
                  <button className={ROW_DANGER_BTN} disabled={rowBusy} onClick={() => retire(d)}>
                    {t("注销","Retire")}
                  </button>
                </div>
              );
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

  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");

  // Clearing the box is a cancel, not a node with no label — `node.label || key`
  // is what the row falls back to, so an empty label is already represented.
  const saveLabel = () => {
    const label = labelDraft.trim();
    setEditingLabel(false);
    if (!label || label === node.label) return;
    void run(() => updateNode({ companyId, nodeId: node.id, label }));
  };

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
        {/* Edited in place, next to the key it labels — a detail view is where
            a field gets changed, not a browser modal over the top of it. */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="shrink-0 text-muted-foreground">{t("标签", "Label")}</span>
          {editingLabel ? (
            <span className="flex min-w-0 items-center gap-1">
              <input
                autoFocus
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveLabel();
                  if (e.key === "Escape") setEditingLabel(false);
                }}
                className="w-32 rounded border border-border bg-background px-1.5 py-0.5 text-(length:--text-nano) text-foreground outline-none"
              />
              <button className="text-muted-foreground hover:text-foreground" onClick={saveLabel}>
                {t("保存", "Save")}
              </button>
              <button className="text-muted-foreground hover:text-foreground" onClick={() => setEditingLabel(false)}>
                {t("取消", "Cancel")}
              </button>
            </span>
          ) : (
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate text-right">{node.label || node.key}</span>
              <button
                title={t("重命名", "Rename")}
                aria-label={t("重命名", "Rename")}
                onClick={() => {
                  setLabelDraft(node.label ?? "");
                  setEditingLabel(true);
                }}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                ✎
              </button>
            </span>
          )}
        </div>
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

      <NodePropertyEditor
        initial={(node.properties as Record<string, unknown> | null) ?? {}}
        busy={busy}
        onSave={(properties) => run(() => updateNode({ companyId, nodeId: node.id, properties }))}
      />
      <div className="mt-2 flex gap-1">
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

function NoDomainState({
  companyId,
  onCreated,
  onImportLegacy,
  onOpenNewDomain,
}: {
  companyId: string;
  onCreated: (domainId: string) => void;
  onImportLegacy?: () => void;
  onOpenNewDomain?: (mode?: "directory" | "manual") => void;
}): ReactElement {
  const createDomain = usePluginAction("create-domain");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [slugOverride, setSlugOverride] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const effectiveSlug = slugOverride ?? slugify(displayName);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const res = (await createDomain({
        companyId,
        slug: effectiveSlug,
        displayName: displayName.trim(),
        description: description.trim() || undefined,
      })) as { data?: { domain?: { id: string } } } | undefined;
      const newId = res?.data?.domain?.id;
      if (newId) {
        onCreated(newId);
      } else {
        onCreated("");
      }
      setDisplayName("");
      setDescription("");
      setSlugOverride(null);
    }
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
        <textarea
          className={INPUT + " resize-none"}
          rows={2}
          placeholder={t("描述 (可选 — 让 AI 初始化补全效果更好)", "Description (optional — improves AI bootstrap)")}
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
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
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onOpenNewDomain && (
          <button
            type="button"
            onClick={() => onOpenNewDomain("directory")}
            className="rounded-md border border-primary/50 bg-primary/10 px-3 py-1.5 text-(length:--text-nano) font-medium text-primary hover:bg-primary/20 transition-colors"
            title={t("选择工程文件夹目录自动分析并接入本体", "Select folder directory to import ontology")}
          >
            📁 {t("选择文件夹目录接入", "Import folder directory")}
          </button>
        )}
        {onImportLegacy && (
          <button
            type="button"
            onClick={onImportLegacy}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-(length:--text-nano) font-medium text-foreground hover:border-primary hover:text-primary"
            title={t("4 步渐进式接入存量旧系统 (Zero-ETL 虚拟化)", "4-step wizard to ingest a legacy system")}
          >
            ⚡ {t("接入旧系统", "Import legacy")}
          </button>
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
  const [description, setDescription] = useState("");
  const [slugOverride, setSlugOverride] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // slug auto-derives from the display name unless the user has typed a custom one.
  const effectiveSlug = slugOverride ?? slugify(displayName);

  const reset = () => {
    setDisplayName("");
    setDescription("");
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
        <textarea
          className={INPUT + " w-full resize-none"}
          rows={2}
          placeholder={t("描述 (可选)", "Description (optional)")}
          value={description}
          onChange={e => setDescription(e.target.value)}
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
                await createDomain({
                  companyId,
                  slug: effectiveSlug,
                  displayName: displayName.trim(),
                  description: description.trim() || undefined,
                });
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

/* ------------------------------------------------------------------ */
/*  ManageTab — Phase 5 resurrects the dead-code EvaluationSection +  */
/*  PipelineSection that previously only ran inside DomainDetailView.  */
/*  Adds a small GovernancePanel showing each bound business system's  */
/*  governance jsonb so the user can see who's accountable, what      */
/*  approval rules apply, etc. — without flipping to the legacy view. */
/* ------------------------------------------------------------------ */

function ManageTab({
  companyId,
  domainId,
}: {
  companyId: string;
  domainId: string;
}): ReactElement {
  const { data: describe } = usePluginData<{
    businessSystems: Array<{
      id: string;
      code: string;
      name: string;
      status: string;
      description: string | null;
      targetRole: string | null;
    }>;
  }>("describe-domain", { companyId, domainId });
  const businessSystems = describe?.businessSystems ?? [];

  return (
    <>
      <EvaluationSection companyId={companyId} domainId={domainId} />
      <PipelineSection companyId={companyId} domainId={domainId} />
      <GovernancePanel companyId={companyId} domainId={domainId} businessSystems={businessSystems} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  ServiceList — the architecture material an import persisted.       */
/*                                                                     */
/*  Layer, stack, deployment and the outgoing dependency edges are the  */
/*  raw material the run/deploy perspectives render. Rendered one line  */
/*  per service with the detail collapsed, because a monolith scan      */
/*  yields dozens and a full dump would bury the panel.                */
/* ------------------------------------------------------------------ */

interface SubProjectView {
  id: string;
  name: string;
  code: string;
  type: string;
  microservice_layer: string | null;
  tech_stack: string[] | null;
  dependencies: Array<{ toServiceKey: string | null; targetHint: string; type: string }> | null;
  build_config: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

const LAYER_MEANING: Record<string, string> = {
  L0: "边缘 / 入口",
  L1: "网关 / 编排",
  L2: "业务服务",
  L3: "共享能力",
  L4: "数据 / 基础设施",
};

function ServiceList({
  companyId,
  domainId,
  businessSystemId,
}: {
  companyId: string;
  domainId: string;
  businessSystemId: string;
}): ReactElement | null {
  const { data } = usePluginData<{ subProjects: SubProjectView[] }>("list-sub-projects", {
    companyId,
    businessSystemId,
  });
  const buildDiagram = usePluginAction("architecture-diagram");
  const [diagramBusy, setDiagramBusy] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const services = data?.subProjects ?? [];
  if (services.length === 0) return null;

  const deployOf = (s: SubProjectView): Record<string, unknown> => {
    const fromMeta = s.metadata?.deploy;
    if (fromMeta && typeof fromMeta === "object") return fromMeta as Record<string, unknown>;
    const fromBuild = s.build_config?.deploy;
    return fromBuild && typeof fromBuild === "object" ? (fromBuild as Record<string, unknown>) : {};
  };

  return (
    <div className="mt-1.5 border-t border-border/60 pt-1.5">
      <div className="mb-0.5 flex items-center gap-2 text-(length:--text-nano) font-medium text-muted-foreground">
        <span>
          {t("服务 / 模块", "Services")} · {services.length}
        </span>
        {/* The diagram is the ontology's *product*: nothing is stored, and the
            same document is what an agent renders with the Archify skill. */}
        <button
          type="button"
          disabled={diagramBusy}
          onClick={() => {
            setDiagramBusy(true);
            void (async () => {
              try {
                const res = (await buildDiagram({ companyId, domainId })) as {
                  diagram?: unknown;
                };
                const blob = new Blob([JSON.stringify(res?.diagram ?? {}, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `architecture-diagram-${domainId.slice(0, 8)}.json`;
                link.click();
                URL.revokeObjectURL(url);
              } finally {
                setDiagramBusy(false);
              }
            })();
          }}
          className="rounded border border-border px-1.5 py-0.5 text-(length:--text-nano) text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          title={t(
            "导出 Archify 架构图 IR(可交给 Archify 渲染成可分享的 HTML/SVG)",
            "Export the Archify diagram IR (render it with Archify into a shareable HTML/SVG)",
          )}
        >
          {diagramBusy ? "…" : t("导出架构图", "Export diagram")}
        </button>
      </div>
      <ul className="space-y-0.5">
        {services.map((s) => {
          const expanded = open.has(s.id);
          const deploy = deployOf(s);
          const ports = Array.isArray(deploy.ports) ? (deploy.ports as number[]) : [];
          const envs = Array.isArray(deploy.envs) ? (deploy.envs as string[]) : [];
          const deps = s.dependencies ?? [];
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() =>
                  setOpen((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.id)) next.delete(s.id);
                    else next.add(s.id);
                    return next;
                  })
                }
                className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-(length:--text-nano) transition-colors hover:bg-accent"
              >
                <span aria-hidden className="w-2 shrink-0 text-muted-foreground">
                  {expanded ? "▾" : "▸"}
                </span>
                <span className="truncate text-foreground/90">{s.name}</span>
                {s.microservice_layer && (
                  <span
                    className="shrink-0 rounded bg-primary/10 px-1 text-primary"
                    title={LAYER_MEANING[s.microservice_layer] ?? s.microservice_layer}
                  >
                    {s.microservice_layer}
                  </span>
                )}
                <span className="ml-auto shrink-0 text-muted-foreground">
                  {(s.tech_stack ?? []).slice(0, 2).join(" · ")}
                  {deps.length > 0 && ` · ↦${deps.length}`}
                </span>
              </button>
              {expanded && (
                <div className="ml-4 space-y-0.5 pb-1 text-(length:--text-nano) text-muted-foreground">
                  <div>
                    {t("类型", "type")}: {s.type}
                    {s.microservice_layer && ` · ${LAYER_MEANING[s.microservice_layer] ?? ""}`}
                  </div>
                  {(s.tech_stack ?? []).length > 0 && (
                    <div>{t("技术栈", "stack")}: {(s.tech_stack ?? []).join(" · ")}</div>
                  )}
                  {(ports.length > 0 || envs.length > 0 || deploy.replicas !== undefined) && (
                    <div>
                      {t("部署", "deploy")}:{" "}
                      {[
                        ports.length > 0 ? `${t("端口", "port")} ${ports.join(",")}` : null,
                        envs.length > 0 ? envs.join("/") : null,
                        typeof deploy.replicas === "number" ? `×${deploy.replicas}` : null,
                        typeof deploy.namespace === "string" ? deploy.namespace : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                  {deps.length > 0 && (
                    <div>
                      {t("依赖", "calls")}:{" "}
                      {deps
                        .slice(0, 6)
                        .map((d) => `${d.toServiceKey ?? d.targetHint} [${d.type}]`)
                        .join(", ")}
                      {deps.length > 6 && ` … +${deps.length - 6}`}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GovernancePanel({
  companyId,
  domainId,
  businessSystems,
}: {
  companyId: string;
  domainId: string;
  businessSystems: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    description: string | null;
    targetRole: string | null;
  }>;
}): ReactElement {
  return (
    <div className={CARD}>
      <div className="mb-2 font-semibold">{t("治理概览", "Governance")}</div>
      {businessSystems.length === 0 ? (
        <div className="text-(length:--text-compact) text-muted-foreground">
          {t(
            "本域尚未绑定业务系统。 接入旧系统后,可在此查看治理元数据。",
            "No business systems bound yet. After legacy import, governance metadata will appear here.",
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {businessSystems.map((bs) => (
            <li
              key={bs.id}
              className="rounded-md border border-border bg-background p-2"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-(length:--text-nano) text-muted-foreground">
                  {bs.code}
                </span>
                <span className="font-medium">{bs.name}</span>
                <StatusBadge
                  label={bs.status}
                  status={
                    bs.status === "running" || bs.status === "active"
                      ? "ok"
                      : bs.status === "planning"
                      ? "info"
                      : "pending"
                  }
                />
                {bs.targetRole && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-(length:--text-tiny) text-muted-foreground">
                    {bs.targetRole}
                  </span>
                )}
              </div>
              {bs.description && (
                <p className="mt-1 text-(length:--text-compact) text-muted-foreground">
                  {bs.description}
                </p>
              )}
              <ServiceList companyId={companyId} domainId={domainId} businessSystemId={bs.id} />
            </li>
          ))}
        </ul>
      )}
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
