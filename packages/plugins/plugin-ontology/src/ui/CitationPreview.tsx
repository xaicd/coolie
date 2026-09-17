/**
 * CitationPreview — clickable preview card for a single cockpit
 * citation. The chip lives in the assistant message footer; clicking
 * it expands an inline preview here with the kind-appropriate
 * details.
 *
 * The lookup helper `lookupCitation` is exported so other parts of
 * the cockpit (e.g. the schema pane in Phase 3) can reuse it without
 * pulling in the preview component itself.
 */
import { type ReactElement, useMemo } from "react";
import { t } from "./isZh.js";
import type {
  DescribeDomainActionType,
  DescribeDomainBusinessSystem,
  DescribeDomainNodeType,
  DescribeDomainRecentNode,
  DescribeDomainRelationType,
  DescribeDomainSubProject,
  DescribeDomainResult as CoreDescribeDomainResult,
} from "../graph/GraphStore.js";

export type AideCitation =
  | { kind: "node-type"; id: string }
  | { kind: "relation-type"; id: string }
  | { kind: "node"; id: string }
  | { kind: "sub-project"; id: string }
  | { kind: "action-type"; id: string }
  | { kind: "business-system"; id: string };

// ---- Describe-domain payload shape (mirrors SandboxTab) ----

/**
 * The describe payload is a *core* contract: the store produces it and the
 * worker adds the config probe on top. The UI used to keep its own copy of every
 * shape, which made a UI file the owner of a cross-layer type — the aide modules
 * imported `DescribeDomainResult` from here, i.e. an application layer reaching
 * into the view layer for a contract the core already declared.
 *
 * Named aliases keep the local vocabulary while the definitions live where they
 * belong.
 */
export type DescribeNodeType = DescribeDomainNodeType;
export type DescribeRelationType = DescribeDomainRelationType;
export type DescribeRecentNode = DescribeDomainRecentNode;
export type DescribeBusinessSystem = DescribeDomainBusinessSystem;
export type DescribeSubProject = DescribeDomainSubProject;
export type DescribeActionType = DescribeDomainActionType;
/** The store's result plus the config probe the worker appends. */
export type DescribeDomainResult = CoreDescribeDomainResult & {
  configured: boolean;
  configReason?: string;
};

/* ------------------------------------------------------------------ */
/*  Lookup                                                              */
/* ------------------------------------------------------------------ */

export type CitationLookupResult =
  | { kind: "node-type"; data: DescribeNodeType }
  | { kind: "relation-type"; data: DescribeRelationType }
  | { kind: "node"; data: DescribeRecentNode; sameTypeNodes: DescribeRecentNode[] }
  | { kind: "business-system"; data: DescribeBusinessSystem }
  | { kind: "sub-project"; data: DescribeSubProject }
  | { kind: "action-type"; data: DescribeActionType }
  | null;

export function lookupCitation(
  cite: AideCitation,
  describe: DescribeDomainResult | null,
): CitationLookupResult {
  if (!describe) return null;
  switch (cite.kind) {
    case "node-type": {
      const data = describe.nodeTypes.find((n) => n.id === cite.id);
      return data ? { kind: "node-type", data } : null;
    }
    case "relation-type": {
      const data = describe.relationTypes.find((r) => r.id === cite.id);
      return data ? { kind: "relation-type", data } : null;
    }
    case "node": {
      const data = describe.recentNodes.find((n) => n.id === cite.id);
      if (!data) return null;
      // The describe payload doesn't carry neighbor edges; show recent
      // nodes of the same type as a stand-in. Capped to 8 so the
      // preview stays compact.
      const sameTypeNodes = describe.recentNodes
        .filter((n) => n.nodeTypeKey && data.nodeTypeKey && n.nodeTypeKey === data.nodeTypeKey && n.id !== data.id)
        .slice(0, 8);
      return { kind: "node", data, sameTypeNodes };
    }
    case "business-system": {
      const data = describe.businessSystems.find((b) => b.id === cite.id);
      return data ? { kind: "business-system", data } : null;
    }
    case "sub-project": {
      const data = describe.subProjects.find((s) => s.id === cite.id);
      return data ? { kind: "sub-project", data } : null;
    }
    case "action-type": {
      const data = describe.actionTypes.find((a) => a.id === cite.id);
      return data ? { kind: "action-type", data } : null;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Preview component                                                   */
/* ------------------------------------------------------------------ */

export function CitationPreview({
  citation,
  describe,
  onClose,
}: {
  citation: AideCitation;
  describe: DescribeDomainResult | null;
  onClose: () => void;
}): ReactElement {
  const result = useMemo(() => lookupCitation(citation, describe), [citation, describe]);

  return (
    <div className="mt-2 rounded-lg border border-border bg-background p-3 shadow-sm">
      <PreviewHeader citation={citation} onClose={onClose} title={previewTitle(result)} />
      <div className="mt-2">{renderBody(result)}</div>
    </div>
  );
}

function previewTitle(result: CitationLookupResult): string {
  if (!result) return t("未找到", "Not found");
  switch (result.kind) {
    case "node-type": return result.data.displayName;
    case "relation-type": return result.data.displayName;
    case "node": return result.data.label;
    case "business-system": return result.data.name;
    case "sub-project": return result.data.name;
    case "action-type": return result.data.displayName;
  }
}

function PreviewHeader({
  citation,
  title,
  onClose,
}: {
  citation: AideCitation;
  title: string;
  onClose: () => void;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-(length:--text-nano) font-medium uppercase text-primary">
          {kindLabel(citation.kind)}
        </span>
        <span className="truncate text-(length:--text-compact) font-semibold">{title}</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("关闭预览", "Close preview")}
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}

function renderBody(result: CitationLookupResult): ReactElement {
  if (!result) {
    return (
      <p className="text-(length:--text-nano) text-muted-foreground">
        {t("这个引用已失效,或对应的对象已被删除。", "This citation is stale — the referenced object no longer exists.")}
      </p>
    );
  }
  switch (result.kind) {
    case "node-type": return <NodeTypePreview data={result.data} />;
    case "relation-type": return <RelationTypePreview data={result.data} />;
    case "node": return <NodePreview data={result.data} sameTypeNodes={result.sameTypeNodes} />;
    case "business-system": return <BusinessSystemPreview data={result.data} />;
    case "sub-project": return <SubProjectPreview data={result.data} />;
    case "action-type": return <ActionTypePreview data={result.data} />;
  }
}

function NodeTypePreview({ data }: { data: DescribeNodeType }): ReactElement {
  const props = (data.propertiesSchema && typeof data.propertiesSchema === "object"
    ? Object.entries(data.propertiesSchema)
    : []) as [string, unknown][];
  return (
    <div className="space-y-1.5 text-(length:--text-compact)">
      <div className="flex items-center gap-2">
        <span className="font-mono text-(length:--text-nano) text-muted-foreground">{data.key}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-(length:--text-nano) text-muted-foreground">
          {t("层级", "layer")} {data.layer}
        </span>
        <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 text-(length:--text-nano) text-primary tabular-nums">
          {data.instanceCount} {t("实例", "instances")}
        </span>
      </div>
      {data.description && <p className="text-muted-foreground">{data.description}</p>}
      {props.length > 0 && (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded-md border border-border bg-muted/20 p-2 text-(length:--text-nano)">
          {props.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-mono text-foreground/80">{k}</dt>
              <dd className="truncate text-muted-foreground">{summarizeType(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {props.length === 0 && (
        <p className="text-(length:--text-nano) text-muted-foreground">
          {t("尚未配置属性 schema", "No property schema defined yet")}
        </p>
      )}
    </div>
  );
}

function RelationTypePreview({ data }: { data: DescribeRelationType }): ReactElement {
  return (
    <div className="space-y-1.5 text-(length:--text-compact)">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-(length:--text-nano) text-muted-foreground">{data.key}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-(length:--text-nano) text-muted-foreground">
          {data.directed ? t("有向", "directed") : t("无向", "undirected")} · {data.cardinality || "1..N"}
        </span>
        <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 text-(length:--text-nano) text-primary tabular-nums">
          {data.instanceCount} {t("实例", "instances")}
        </span>
      </div>
      {data.description && <p className="text-muted-foreground">{data.description}</p>}
    </div>
  );
}

function NodePreview({
  data,
  sameTypeNodes,
}: {
  data: DescribeRecentNode;
  sameTypeNodes: DescribeRecentNode[];
}): ReactElement {
  return (
    <div className="space-y-1.5 text-(length:--text-compact)">
      <div className="flex items-center gap-2">
        <span className="font-mono text-(length:--text-nano) text-muted-foreground">
          {data.nodeTypeKey ?? "?"}
        </span>
        <span className="ml-auto font-mono text-(length:--text-nano) text-muted-foreground">{data.key}</span>
      </div>
      {sameTypeNodes.length > 0 && (
        <div className="space-y-1">
          <div className="text-(length:--text-nano) text-muted-foreground">
            {t("同类型最近节点", "Recent same-type nodes")} ({sameTypeNodes.length})
          </div>
          <ul className="space-y-0.5 rounded-md border border-border bg-muted/20 p-2 text-(length:--text-nano)">
            {sameTypeNodes.map((n) => (
              <li key={n.id} className="truncate text-foreground/80">
                {n.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {sameTypeNodes.length === 0 && (
        <p className="text-(length:--text-nano) text-muted-foreground">
          {t("尚未加载该节点的邻居关系。", "Neighbor edges haven't been loaded for this node.")}
        </p>
      )}
    </div>
  );
}

function BusinessSystemPreview({ data }: { data: DescribeBusinessSystem }): ReactElement {
  return (
    <div className="space-y-1.5 text-(length:--text-compact)">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-(length:--text-nano) text-muted-foreground">{data.code}</span>
        <span className={`rounded px-1.5 py-0.5 text-(length:--text-nano) ${statusClass(data.status)}`}>
          {data.status}
        </span>
        {data.targetRole && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-(length:--text-nano) text-muted-foreground">
            {data.targetRole}
          </span>
        )}
      </div>
      {data.description && <p className="text-muted-foreground">{data.description}</p>}
    </div>
  );
}

function SubProjectPreview({ data }: { data: DescribeSubProject }): ReactElement {
  return (
    <div className="space-y-1.5 text-(length:--text-compact)">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-(length:--text-nano) text-muted-foreground">{data.code}</span>
        <span className={`rounded px-1.5 py-0.5 text-(length:--text-nano) ${statusClass(data.status)}`}>
          {data.status}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-(length:--text-nano) text-muted-foreground">
          {data.type}
        </span>
      </div>
      {data.description && <p className="text-muted-foreground">{data.description}</p>}
    </div>
  );
}

function ActionTypePreview({ data }: { data: DescribeActionType }): ReactElement {
  return (
    <div className="space-y-1.5 text-(length:--text-compact)">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-(length:--text-nano) text-muted-foreground">{data.key}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-(length:--text-nano) text-muted-foreground">
          {data.kind}
        </span>
        <span className={`ml-auto rounded px-1.5 py-0.5 text-(length:--text-nano) ${statusClass(data.status)}`}>
          {data.status}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers — shared with SandboxTab's CitationChips                    */
/* ------------------------------------------------------------------ */

export function kindLabel(kind: AideCitation["kind"]): string {
  switch (kind) {
    case "node-type": return t("对象类型", "NodeType");
    case "relation-type": return t("关系类型", "RelType");
    case "node": return t("节点", "Node");
    case "sub-project": return t("子项目", "SubProject");
    case "action-type": return t("Action", "Action");
    case "business-system": return t("应用系统", "System");
  }
}

export function statusClass(status: string): string {
  switch (status) {
    case "running":
    case "active":
      return "bg-green-500/15 text-green-700 dark:text-green-300";
    case "planning":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    case "deprecated":
    case "retired":
      return "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function summarizeType(v: unknown): string {
  if (!v || typeof v !== "object") return String(v ?? "");
  const obj = v as { type?: string; format?: string; enum?: unknown };
  if (obj.type && obj.format) return `${obj.type} (${obj.format})`;
  if (obj.type) return obj.type;
  return JSON.stringify(v);
}