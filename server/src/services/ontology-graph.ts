import {
  agents,
  assets,
  boardConversations,
  companies,
  entityRelations,
  issueAttachments,
  issueComments,
  issueWorkProducts,
  issues,
  projects,
} from "@paperclipai/db";
import type { Db } from "@paperclipai/db";
import { and, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type {
  EntityRef,
  EntityRelationKind,
  EntityType,
  OntologyGraphEdge,
  OntologyGraphNode,
  OntologyGraphResponse,
  OntologyGraphView,
  OntologyPath,
  OntologyPathsResponse,
  OntologyStatsResponse,
} from "@paperclipai/shared";

/**
 * Ontology graph service (wave154) — generic traversal over `entity_relations`.
 *
 * The whole point of turning links into rows is that no query needs to know what
 * an object is: `traverse` walks edges, `findPaths` searches them, `buildView`
 * adds display labels. Adding an object kind later means writing backfill SQL,
 * not new join code here.
 *
 * Node identity is the PAIR `(type, id)` — a spec and its issue share a uuid, so
 * every internal key is `type:id`. Using the id alone would fuse them.
 *
 * Bounds: a company is small enough to load all of its edges and walk in memory
 * (`MAX_EDGES`), which keeps the traversal a single round trip and makes path
 * search a plain BFS. Both the node set and the edge set are capped so a
 * pathological company cannot turn a page load into an unbounded scan; hitting a
 * cap sets `truncated: true` rather than silently dropping data.
 */

const MAX_EDGES = 20_000;
const MAX_NODES = 400;
const MAX_PATHS = 10;

/**
 * Preset recipes (wave155). `depth` is the preset's default (an explicit query
 * depth still wins); `relations`, when present, narrows the walk to the verbs
 * that view is about so an agent dashboard does not drag in every stray link.
 */
const VIEW_PRESETS: Record<OntologyGraphView, { depth: number; relations?: string[] }> = {
  project_tree: { depth: 3 },
  agent_dashboard: {
    depth: 2,
    relations: ["assigned_to", "belongs_to", "attached_to", "discussed_in", "derived_from"],
  },
  conversation_thread: {
    depth: 3,
    relations: ["discussed_in", "belongs_to", "attached_to", "derived_from"],
  },
};

const nodeKey = (type: string, id: string) => `${type}:${id}`;

type EdgeRow = {
  srcType: string;
  srcId: string;
  relation: string;
  targetType: string;
  targetId: string;
  weight: number;
  metadata: Record<string, unknown> | null;
};

export interface RecordRelationInput {
  companyId: string;
  srcType: EntityType;
  srcId: string;
  relation: EntityRelationKind;
  targetType: EntityType;
  targetId: string;
  weight?: number;
  metadata?: Record<string, unknown>;
  createdByUserId?: string | null;
  createdByAgentId?: string | null;
}

/**
 * Insert one link, idempotently. The unique edge key makes a repeated write a
 * no-op, so callers do not need to check first. Callers on a hot path should
 * still wrap this best-effort — a link is bookkeeping, not the write itself.
 */
export async function recordEntityRelation(db: Db, input: RecordRelationInput): Promise<void> {
  await db
    .insert(entityRelations)
    .values({
      companyId: input.companyId,
      srcType: input.srcType,
      srcId: input.srcId,
      relation: input.relation,
      targetType: input.targetType,
      targetId: input.targetId,
      weight: input.weight ?? 1,
      metadata: input.metadata ?? {},
      createdByUserId: input.createdByUserId ?? null,
      createdByAgentId: input.createdByAgentId ?? null,
    })
    .onConflictDoNothing();
}

const SPEC_KIND_LABEL: Record<string, string> = {
  requirement: "需求",
  bugfix: "缺陷",
  design: "设计",
  task: "任务",
};

/** Fire-and-forget link maintenance for the comment write path. */
export async function recordCommentRelation(
  db: Db,
  input: { companyId: string; issueId: string },
): Promise<void> {
  const rows = await db
    .select({ id: boardConversations.id })
    .from(boardConversations)
    .where(
      and(
        eq(boardConversations.companyId, input.companyId),
        eq(boardConversations.issueId, input.issueId),
      ),
    );
  for (const conversation of rows) {
    await recordEntityRelation(db, {
      companyId: input.companyId,
      srcType: "issue",
      srcId: input.issueId,
      relation: "discussed_in",
      targetType: "conversation",
      targetId: conversation.id,
      weight: 1,
    });
  }
}

export function ontologyGraphService(db: Db) {
  async function countRows(from: PgTable, where: SQL | undefined): Promise<number> {
    const rows = await db.select({ value: sql<number>`count(*)::int` }).from(from).where(where);
    return rows[0]?.value ?? 0;
  }

  async function loadEdges(companyId: string, relationFilter?: Set<string>): Promise<EdgeRow[]> {
    const rows = await db
      .select({
        srcType: entityRelations.srcType,
        srcId: entityRelations.srcId,
        relation: entityRelations.relation,
        targetType: entityRelations.targetType,
        targetId: entityRelations.targetId,
        weight: entityRelations.weight,
        metadata: entityRelations.metadata,
      })
      .from(entityRelations)
      .where(eq(entityRelations.companyId, companyId))
      .limit(MAX_EDGES);
    const list = rows as EdgeRow[];
    return relationFilter && relationFilter.size > 0
      ? list.filter((edge) => relationFilter.has(edge.relation))
      : list;
  }

  function toEdge(edge: EdgeRow): OntologyGraphEdge {
    const source = nodeKey(edge.srcType, edge.srcId);
    const target = nodeKey(edge.targetType, edge.targetId);
    return {
      key: `${source}|${edge.relation}|${target}`,
      source,
      target,
      relation: edge.relation as EntityRelationKind,
      weight: edge.weight,
      ...(edge.metadata && Object.keys(edge.metadata).length > 0 ? { metadata: edge.metadata } : {}),
    };
  }

  /** Undirected adjacency: an edge is reachable from either endpoint. */
  function buildAdjacency(edges: OntologyGraphEdge[]) {
    const adjacency = new Map<string, Array<{ edge: OntologyGraphEdge; other: string }>>();
    const push = (from: string, to: string, edge: OntologyGraphEdge) => {
      const list = adjacency.get(from);
      if (list) list.push({ edge, other: to });
      else adjacency.set(from, [{ edge, other: to }]);
    };
    for (const edge of edges) {
      push(edge.source, edge.target, edge);
      push(edge.target, edge.source, edge);
    }
    return adjacency;
  }

  /**
   * Breadth-first subgraph around `root`. Returns the node keys and the edges
   * traversed, capped, plus whether a cap was hit.
   */
  function bfs(edges: OntologyGraphEdge[], rootKey: string, depth: number) {
    const adjacency = buildAdjacency(edges);
    const visitedNodes = new Set<string>([rootKey]);
    const visitedEdges = new Map<string, OntologyGraphEdge>();
    let frontier = [rootKey];
    let truncated = false;

    for (let level = 0; level < depth && frontier.length > 0; level += 1) {
      const next: string[] = [];
      for (const current of frontier) {
        for (const { edge, other } of adjacency.get(current) ?? []) {
          visitedEdges.set(edge.key, edge);
          if (!visitedNodes.has(other)) {
            if (visitedNodes.size >= MAX_NODES) {
              truncated = true;
              continue;
            }
            visitedNodes.add(other);
            next.push(other);
          }
        }
      }
      frontier = next;
    }

    // Drop edges whose both endpoints never made the node set (only possible
    // when a cap halted expansion) so the view never draws a dangling line.
    const keptEdges = [...visitedEdges.values()].filter(
      (edge) => visitedNodes.has(edge.source) && visitedNodes.has(edge.target),
    );
    return { nodeKeys: [...visitedNodes], edges: keptEdges, truncated };
  }

  function keysToRefs(keys: string[]): EntityRef[] {
    return keys.map((key) => {
      const idx = key.indexOf(":");
      return { type: key.slice(0, idx) as EntityType, id: key.slice(idx + 1) };
    });
  }

  /** Resolve display labels for a set of refs, batched per entity type. */
  async function hydrate(companyId: string, refs: EntityRef[]): Promise<OntologyGraphNode[]> {
    const byType = new Map<EntityType, string[]>();
    for (const ref of refs) {
      const list = byType.get(ref.type);
      if (list) list.push(ref.id);
      else byType.set(ref.type, [ref.id]);
    }
    const nodes = new Map<string, OntologyGraphNode>();
    const put = (node: OntologyGraphNode) => nodes.set(node.key, node);

    const idsOf = (type: EntityType) => byType.get(type) ?? [];

    const projectIds = idsOf("project");
    if (projectIds.length) {
      const rows = await db
        .select({ id: projects.id, name: projects.name, status: projects.status })
        .from(projects)
        .where(and(eq(projects.companyId, companyId), inArray(projects.id, projectIds)));
      for (const row of rows) {
        put({
          type: "project",
          id: row.id,
          key: nodeKey("project", row.id),
          label: row.name,
          href: `/projects/${row.id}`,
          metadata: { status: row.status },
        });
      }
    }

    const issueIds = idsOf("issue");
    const specIds = idsOf("spec");
    const issueRowIds = [...new Set([...issueIds, ...specIds])];
    const issueRows = issueRowIds.length
      ? await db
          .select({
            id: issues.id,
            identifier: issues.identifier,
            title: issues.title,
            status: issues.status,
            projectId: issues.projectId,
            specKind: issues.specKind,
          })
          .from(issues)
          .where(and(eq(issues.companyId, companyId), inArray(issues.id, issueRowIds)))
      : [];
    const issueById = new Map(issueRows.map((row) => [row.id, row]));
    for (const id of issueIds) {
      const row = issueById.get(id);
      if (!row) continue;
      put({
        type: "issue",
        id: row.id,
        key: nodeKey("issue", row.id),
        label: row.identifier ? `${row.identifier} ${row.title}` : row.title,
        href: `/issues/${row.id}`,
        metadata: { status: row.status, projectId: row.projectId ?? null },
      });
    }
    for (const id of specIds) {
      const row = issueById.get(id);
      if (!row || !row.specKind) continue;
      put({
        type: "spec",
        id: row.id,
        key: nodeKey("spec", row.id),
        label: `${SPEC_KIND_LABEL[row.specKind] ?? row.specKind}: ${row.title}`,
        href: `/issues/${row.id}/spec`,
        metadata: { specKind: row.specKind },
      });
    }

    const conversationIds = idsOf("conversation");
    if (conversationIds.length) {
      const rows = await db
        .select({
          id: boardConversations.id,
          title: boardConversations.title,
          issueId: boardConversations.issueId,
          projectId: boardConversations.projectId,
        })
        .from(boardConversations)
        .where(
          and(eq(boardConversations.companyId, companyId), inArray(boardConversations.id, conversationIds)),
        );
      for (const row of rows) {
        put({
          type: "conversation",
          id: row.id,
          key: nodeKey("conversation", row.id),
          label: row.title,
          href: null,
          metadata: { issueId: row.issueId ?? null, projectId: row.projectId ?? null },
        });
      }
    }

    const workProductIds = idsOf("work_product");
    if (workProductIds.length) {
      const rows = await db
        .select({
          id: issueWorkProducts.id,
          title: issueWorkProducts.title,
          type: issueWorkProducts.type,
          status: issueWorkProducts.status,
          issueId: issueWorkProducts.issueId,
        })
        .from(issueWorkProducts)
        .where(
          and(eq(issueWorkProducts.companyId, companyId), inArray(issueWorkProducts.id, workProductIds)),
        );
      for (const row of rows) {
        put({
          type: "work_product",
          id: row.id,
          key: nodeKey("work_product", row.id),
          label: row.title,
          href: `/issues/${row.issueId}`,
          metadata: { productType: row.type, status: row.status },
        });
      }
    }

    const attachmentIds = idsOf("attachment");
    if (attachmentIds.length) {
      const rows = await db
        .select({
          id: issueAttachments.id,
          issueId: issueAttachments.issueId,
          filename: assets.originalFilename,
        })
        .from(issueAttachments)
        .leftJoin(assets, eq(issueAttachments.assetId, assets.id))
        .where(
          and(eq(issueAttachments.companyId, companyId), inArray(issueAttachments.id, attachmentIds)),
        );
      for (const row of rows) {
        put({
          type: "attachment",
          id: row.id,
          key: nodeKey("attachment", row.id),
          // wave163: hydrate by filename (real name), not a uuid slice — even
          // when the original_filename column is null, fall back to a typed
          // placeholder rather than slicing the id (which looked like a uuid
          // on the board).
          label: row.filename ?? "未命名附件",
          href: `/issues/${row.issueId}`,
          metadata: { issueId: row.issueId },
        });
      }
    }

    const commentIds = idsOf("comment");
    if (commentIds.length) {
      const rows = await db
        .select({ id: issueComments.id, issueId: issueComments.issueId, body: issueComments.body })
        .from(issueComments)
        .where(and(eq(issueComments.companyId, companyId), inArray(issueComments.id, commentIds)));
      for (const row of rows) {
        const snippet = row.body.replace(/\s+/g, " ").trim().slice(0, 60);
        put({
          type: "comment",
          id: row.id,
          key: nodeKey("comment", row.id),
          // wave163: prefer the body snippet; never slice the id.
          label: snippet || "评论",
          href: `/issues/${row.issueId}`,
          metadata: { issueId: row.issueId },
        });
      }
    }

    const companyIds = idsOf("company");
    if (companyIds.length) {
      const rows = await db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(inArray(companies.id, companyIds));
      for (const row of rows) {
        put({
          type: "company",
          id: row.id,
          key: nodeKey("company", row.id),
          label: row.name,
          href: null,
        });
      }
    }

    const agentIds = idsOf("agent");
    if (agentIds.length) {
      const rows = await db
        .select({ id: agents.id, name: agents.name, role: agents.role, status: agents.status })
        .from(agents)
        .where(and(eq(agents.companyId, companyId), inArray(agents.id, agentIds)));
      for (const row of rows) {
        put({
          type: "agent",
          id: row.id,
          key: nodeKey("agent", row.id),
          label: row.name,
          href: `/agents/${row.id}`,
          metadata: { role: row.role, status: row.status },
        });
      }
    }

    // Any ref whose owning row is gone still gets a placeholder node so the
    // graph stays consistent (an edge is never drawn to nothing). wave163:
    // label by type only — never slice the id, which read like a uuid on the
    // board.
    const PLACEHOLDER_LABEL: Record<EntityType, string> = {
      company: "已删除的公司",
      project: "已删除的项目",
      issue: "已删除的任务",
      spec: "已删除的规格",
      conversation: "已删除的对话",
      work_product: "已删除的交付物",
      attachment: "已删除的附件",
      comment: "已删除的评论",
      agent: "已删除的智能体",
    };
    const result: OntologyGraphNode[] = [];
    for (const ref of refs) {
      const key = nodeKey(ref.type, ref.id);
      result.push(
        nodes.get(key) ?? {
          type: ref.type,
          id: ref.id,
          key,
          label: PLACEHOLDER_LABEL[ref.type] ?? `已删除的 ${ref.type}`,
          href: null,
        },
      );
    }
    return result;
  }

  async function buildView(input: {
    companyId: string;
    root: EntityRef;
    depth?: number;
    view?: OntologyGraphView;
    relations?: string[];
  }): Promise<OntologyGraphResponse> {
    const view: OntologyGraphView = input.view ?? "project_tree";
    const preset = VIEW_PRESETS[view];
    // An explicit depth or relation list from the caller wins over the preset.
    const depth = input.depth ?? preset.depth;
    const relations = input.relations && input.relations.length > 0 ? input.relations : preset.relations;
    const relationFilter = relations && relations.length > 0 ? new Set(relations) : undefined;

    const edgeRows = await loadEdges(input.companyId, relationFilter);
    const edges = edgeRows.map(toEdge);
    const rootKey = nodeKey(input.root.type, input.root.id);
    const { nodeKeys, edges: keptEdges, truncated } = bfs(edges, rootKey, depth);
    const nodes = await hydrate(input.companyId, keysToRefs(nodeKeys));
    return { root: input.root, depth, view, truncated, nodes, edges: keptEdges };
  }

  /**
   * All simple shortest paths from src to target within `maxDepth`, up to
   * MAX_PATHS. Layered BFS: each node keeps the predecessors that first reached
   * it, so the set of shortest paths is reconstructed without re-walking.
   */
  async function findPaths(input: {
    companyId: string;
    src: EntityRef;
    target: EntityRef;
    maxDepth: number;
  }): Promise<OntologyPathsResponse> {
    const edgeRows = await loadEdges(input.companyId);
    const edges = edgeRows.map(toEdge);
    const adjacency = buildAdjacency(edges);

    const srcKey = nodeKey(input.src.type, input.src.id);
    const targetKey = nodeKey(input.target.type, input.target.id);
    const emptyResult: OntologyPathsResponse = {
      src: input.src,
      target: input.target,
      maxDepth: input.maxDepth,
      paths: [],
    };
    if (srcKey === targetKey) return emptyResult;

    // level[node] = shortest distance from src; preds[node] = edges that first
    // reached it at that distance.
    const level = new Map<string, number>([[srcKey, 0]]);
    const preds = new Map<string, OntologyGraphEdge[]>();
    let frontier = [srcKey];

    for (let d = 1; d <= input.maxDepth && frontier.length > 0; d += 1) {
      const next: string[] = [];
      for (const current of frontier) {
        for (const { edge, other } of adjacency.get(current) ?? []) {
          const existing = level.get(other);
          if (existing === undefined) {
            level.set(other, d);
            preds.set(other, [edge]);
            next.push(other);
          } else if (existing === d) {
            preds.get(other)?.push(edge);
          }
        }
      }
      frontier = next;
      if (level.has(targetKey)) break;
    }

    if (!level.has(targetKey)) return emptyResult;

    // Reconstruct shortest paths, newest edge last, walking predecessors back.
    const paths: OntologyPath[] = [];
    const reconstruct = (node: string, edgeStack: OntologyGraphEdge[], nodeStack: string[]) => {
      if (paths.length >= MAX_PATHS) return;
      if (node === srcKey) {
        paths.push({
          nodeKeys: [...nodeStack].reverse(),
          edges: [...edgeStack].reverse(),
          length: edgeStack.length,
        });
        return;
      }
      for (const edge of preds.get(node) ?? []) {
        const parent = edge.source === node ? edge.target : edge.source;
        reconstruct(parent, [...edgeStack, edge], [...nodeStack, parent]);
        if (paths.length >= MAX_PATHS) return;
      }
    };
    reconstruct(targetKey, [], [targetKey]);

    return { src: input.src, target: input.target, maxDepth: input.maxDepth, paths };
  }

  async function stats(companyId: string): Promise<OntologyStatsResponse> {
    const [
      projectCount,
      issueCount,
      specCount,
      conversationCount,
      workProductCount,
      attachmentCount,
      commentCount,
      companyCount,
    ] = await Promise.all([
      countRows(projects, eq(projects.companyId, companyId)),
      countRows(issues, eq(issues.companyId, companyId)),
      countRows(issues, and(eq(issues.companyId, companyId), isNotNull(issues.specKind))),
      countRows(boardConversations, eq(boardConversations.companyId, companyId)),
      countRows(issueWorkProducts, eq(issueWorkProducts.companyId, companyId)),
      countRows(issueAttachments, eq(issueAttachments.companyId, companyId)),
      countRows(issueComments, eq(issueComments.companyId, companyId)),
      countRows(companies, eq(companies.id, companyId)),
    ]);

    const relationRows = await db
      .select({ relation: entityRelations.relation, value: sql<number>`count(*)::int` })
      .from(entityRelations)
      .where(eq(entityRelations.companyId, companyId))
      .groupBy(entityRelations.relation);

    const nodeCounts = [
      { entityType: "company" as const, count: companyCount },
      { entityType: "project" as const, count: projectCount },
      { entityType: "issue" as const, count: issueCount },
      { entityType: "spec" as const, count: specCount },
      { entityType: "conversation" as const, count: conversationCount },
      { entityType: "work_product" as const, count: workProductCount },
      { entityType: "attachment" as const, count: attachmentCount },
      { entityType: "comment" as const, count: commentCount },
    ];
    const totalNodes = nodeCounts.reduce((sum, entry) => sum + entry.count, 0);
    const relationCounts = relationRows
      .map((row) => ({ relation: row.relation as EntityRelationKind, count: row.value }))
      .sort((a, b) => b.count - a.count);
    const totalRelations = relationCounts.reduce((sum, entry) => sum + entry.count, 0);
    const averageDegree = totalNodes > 0 ? (2 * totalRelations) / totalNodes : 0;

    return {
      companyId,
      nodeCounts,
      totalNodes,
      relationCounts,
      totalRelations,
      averageDegree: Math.round(averageDegree * 100) / 100,
    };
  }

  return { buildView, traverse: buildView, findPaths, stats, hydrate, loadEdges };
}

export type OntologyGraphService = ReturnType<typeof ontologyGraphService>;
