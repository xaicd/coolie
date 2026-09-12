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
  const [tab, setTab] = useState<"domains" | "capabilities">("domains");
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
          style={{ ...btnStyle, background: tab === "capabilities" ? tokens.primary : "transparent", color: tab === "capabilities" ? tokens.primaryFg : tokens.primary }}
          onClick={() => setTab("capabilities")}
        >
          Capabilities
        </button>
      </div>
      {tab === "domains" ? (
        selectedDomainId ? (
          <DomainDetailView
            companyId={companyId}
            domainId={selectedDomainId}
            onBack={() => setSelectedDomainId(null)}
          />
        ) : (
          <DomainList companyId={companyId} onOpen={setSelectedDomainId} />
        )
      ) : (
        <CapabilitiesTab companyId={companyId} />
      )}
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
  const [connectMode, setConnectMode] = useState(false);
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

  // Right-click node: start/finish a connection (game-style context action).
  const onNodeContextMenu = useCallback(
    (e: ReactMouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (linkFrom === null) {
        setLinkFrom(id);
      } else if (linkFrom === id) {
        setLinkFrom(null);
      } else {
        void connect(linkFrom, id);
      }
    },
    [linkFrom, connect],
  );

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
            ? "Right-click a target node to connect · right-click the source again to cancel"
            : "Right-click canvas: add node · right-click node: connect · drag: move"}
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
              <g key={e.id}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={tokens.border} strokeWidth={1.2} />
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
                onContextMenu={(e) => onNodeContextMenu(e, nd.id)}
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
