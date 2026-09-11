import {
  usePluginData,
  type PluginPageProps,
  type PluginSidebarProps,
} from "@paperclipai/plugin-sdk/ui";
import type { CSSProperties, ReactElement } from "react";

const tokens = {
  border: "var(--border, oklch(0.269 0 0))",
  card: "var(--card, oklch(0.205 0 0))",
  bg: "var(--background, oklch(0.145 0 0))",
  fg: "var(--foreground, oklch(0.985 0 0))",
  muted: "var(--muted-foreground, oklch(0.708 0 0))",
};

interface OntologyDomain {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  status: string;
  version: number;
}

interface DomainsResponse {
  domains: OntologyDomain[];
}

/** Sidebar navigation entry for the ontology plugin. */
export function SidebarLink(_props: PluginSidebarProps): ReactElement {
  return <span>Ontology</span>;
}

/** Full-page ontology view. O0: lists the company's ontology domains. */
export function OntologyPage({ context }: PluginPageProps): ReactElement {
  const companyId = context.companyId ?? undefined;
  const { data, loading, error } = usePluginData<DomainsResponse>(
    "list-domains",
    companyId ? { companyId } : {},
  );

  const containerStyle: CSSProperties = {
    padding: "1.5rem",
    background: tokens.bg,
    color: tokens.fg,
    minHeight: "100%",
  };
  const cardStyle: CSSProperties = {
    border: `1px solid ${tokens.border}`,
    background: tokens.card,
    borderRadius: "0.75rem",
    padding: "1rem",
    marginBottom: "0.75rem",
  };

  if (!companyId) {
    return (
      <div style={containerStyle}>
        <p style={{ color: tokens.muted }}>Select a company to view its ontology domains.</p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h1 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Ontology Domains</h1>
      {loading && <p style={{ color: tokens.muted }}>Loading…</p>}
      {error && <p style={{ color: tokens.muted }}>Failed to load domains: {String(error.message ?? error)}</p>}
      {!loading && !error && (data?.domains?.length ?? 0) === 0 && (
        <p style={{ color: tokens.muted }}>No ontology domains yet.</p>
      )}
      {data?.domains?.map((domain) => (
        <div key={domain.id} style={cardStyle}>
          <div style={{ fontWeight: 600 }}>{domain.display_name}</div>
          <div style={{ color: tokens.muted, fontSize: "0.85rem" }}>
            {domain.slug} · v{domain.version} · {domain.status}
          </div>
          {domain.description && <div style={{ marginTop: "0.5rem" }}>{domain.description}</div>}
        </div>
      ))}
    </div>
  );
}
