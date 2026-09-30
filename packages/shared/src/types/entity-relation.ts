/**
 * Ontology graph (wave154) — the link layer over the workshop's objects.
 *
 * Until this wave the control plane had objects (`Company / Project / Issue /
 * Spec / Conversation / WorkProduct / Attachment / Comment`) but no first-class
 * *links* between them: every relationship lived implicitly in a foreign-key
 * column on one of the two sides, so "show me everything connected to this
 * project" meant hard-coding each join. `entity_relations` makes those links
 * rows, and these types are the contract the API and UI share.
 *
 * The vocabulary is deliberately small. `type` is a plain `string` in the DB
 * column; here it is a union so a typo is a compile error rather than a row
 * that no query will ever find.
 */

/** The object kinds a relation can name. `spec` shares the issue id (a spec is
 *  the issue's `spec_kind`/`spec` payload), so node identity is the PAIR
 *  `(type, id)` — never the id alone. */
export const ENTITY_TYPES = [
  "company",
  "project",
  "issue",
  "spec",
  "conversation",
  "work_product",
  "attachment",
  "comment",
  "agent",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** Relation verbs. Read `src -[relation]-> target`. */
export const ENTITY_RELATION_KINDS = [
  /** work_product / attachment live on an issue. */
  "attached_to",
  /** a child object is owned by its parent (issue → project, spec → project). */
  "belongs_to",
  /** a spec answers or refines its parent spec. */
  "derived_from",
  /** a general pointer when no narrower verb fits. */
  "references",
  /** a spec is realized by the work that satisfies it. */
  "satisfies",
  /** an issue was discussed in a conversation. */
  "discussed_in",
  /** a parent object produced a child object. */
  "spawned",
  /** an issue (or task) is owned by an agent (wave155: agent_dashboard). */
  "assigned_to",
] as const;
export type EntityRelationKind = (typeof ENTITY_RELATION_KINDS)[number];

/**
 * Preset graph views (wave155). A view is a named `{ depth, relations }` recipe
 * the server applies when the caller does not override either, so the board can
 * offer "the project tree" / "the agent dashboard" as one click instead of a
 * type + id + depth + filter form.
 */
export const ONTOLOGY_GRAPH_VIEWS = [
  /** Project → its issues → specs / work products / attachments / conversations. */
  "project_tree",
  /** Agent → the issues it owns → what those issues carry. */
  "agent_dashboard",
  /** Conversation → the issue it is anchored on → that issue's project. */
  "conversation_thread",
] as const;
export type OntologyGraphView = (typeof ONTOLOGY_GRAPH_VIEWS)[number];

/** A reference to one object in the graph. `type` namespaces `id`. */
export interface EntityRef {
  type: EntityType;
  id: string;
}

/** One node in a graph view, hydrated with a display label for the board. */
export interface OntologyGraphNode extends EntityRef {
  /** Stable React/DOM key: `${type}:${id}` (type is needed because a spec and
   *  its issue share the id). */
  key: string;
  label: string;
  /** Optional route the board UI navigates to when the node is clicked. */
  href?: string | null;
  /** Small, display-only facts (status, kind, filename). */
  metadata?: Record<string, unknown>;
}

/** One edge. `weight` orders strong links (containment) above weak ones. */
export interface OntologyGraphEdge {
  key: string;
  source: string;
  target: string;
  relation: EntityRelationKind;
  weight: number;
  metadata?: Record<string, unknown>;
}

export interface OntologyGraphRoot extends EntityRef {}

export interface OntologyGraphResponse {
  root: OntologyGraphRoot | null;
  depth: number;
  /** The preset recipe applied, when one was named. */
  view?: OntologyGraphView;
  /** True when the traversal hit a node/edge cap and the view is partial. */
  truncated: boolean;
  nodes: OntologyGraphNode[];
  edges: OntologyGraphEdge[];
}

/** One relation bucket in a backfill report. */
export interface OntologyBackfillBucket {
  relation: EntityRelationKind;
  /** Rows newly written; an already-present edge is not counted again. */
  inserted: number;
}

export interface OntologyBackfillResponse {
  companyId: string;
  buckets: OntologyBackfillBucket[];
  totalInserted: number;
  /** Edge count for the company after the pass, so a caller can see the net. */
  totalRelations: number;
}

/** One connection from `src` to `target`, as a sequence of node keys. */
export interface OntologyPath {
  /** Node keys (`type:id`) in order, src first / target last. */
  nodeKeys: string[];
  edges: OntologyGraphEdge[];
  length: number;
}

export interface OntologyPathsResponse {
  src: OntologyGraphRoot | null;
  target: OntologyGraphRoot | null;
  maxDepth: number;
  paths: OntologyPath[];
}

export interface OntologyTypeCount {
  entityType: EntityType;
  count: number;
}

export interface OntologyStatsResponse {
  companyId: string;
  /** Per-entity-type object counts (sourced from the owning tables, not the
   *  relation rows — a spec with no links still counts). */
  nodeCounts: OntologyTypeCount[];
  totalNodes: number;
  relationCounts: Array<{ relation: EntityRelationKind; count: number }>;
  totalRelations: number;
  /** 2 * edges / nodes — how wired the company's objects are on average. */
  averageDegree: number;
}
