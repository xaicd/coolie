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
import { ENTITY_TYPES } from "@paperclipai/shared";
import { ontologyBackfillService } from "./ontology-backfill.js";

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
 * Wave261 — boss screenshot showed 75 entities / 2100 relations. The graph
 * endpoint is capped at MAX_NODES=400, so when a company's full graph is
 * bigger the UI only sees "first 400" — and the App's domain chip can show
 * "75 entities" because that is what the plugin-worker counted in
 * `OntologyGraphSnapshot`. `summarizeLevels` is the response that ties the
 * two together: it returns the *real* totals (no cap) bucketed by domain and
 * entityType, so the App's drill-down screen can say "75 entities, 2100
 * relations — pick a level to drill into" and the user can decide whether to
 * enter a graph view.
 */
export interface OntologyEntityTypeLevel {
  entityType: EntityType;
  /** Total rows in the source table for this company. */
  count: number;
  /** Edges that have either endpoint of this entityType. */
  edgeCount: number;
}

export interface OntologyDomainLevel {
  domainId: string;
  displayName: string;
  category: string;
  lifecycleState: string;
  /** Distinct entity types that have at least one row in this company. */
  typeCount: number;
  /** Sum of entity-type counts (every source-table row that the domain owns). */
  instanceCount: number;
  /** Edges whose either endpoint belongs to an entity type in this domain. */
  edgeCount: number;
}

export interface OntologyLevelsResponse {
  companyId: string;
  /** Total rows across every entity type (uncapped). */
  totalNodes: number;
  /** Total edges in `entity_relations` for this company. */
  totalEdges: number;
  byEntityType: OntologyEntityTypeLevel[];
  byDomain: OntologyDomainLevel[];
}

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

/**
 * wave244: 节点 label 必须人类可读。raw UUID 漏出 = 老板截图前两波都栽过的
 * 真因 (wave163 attachment/comment, wave216 instance 行, 5 类节点里
 * project/issue/spec/agent/conversation/work_product/company 还没显式兜).
 * 任何一段 label 落到 UUID-shaped (或空) 一律替换, 让 graph 的所有节点
 * 都拿到一段中文/真名, 截图里再不会看见 UUID 满天飞.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeNodeLabel(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  if (UUID_RE.test(value)) return fallback;
  return value;
}

/**
 * 与 safeNodeLabel 区别: 允许字符串里嵌入 UUID 段 (例如 issue 的
 * `PC-123 <uuid>`). 仅当整段就是 UUID-shape 才替换; 中间含 UUID 段
 * 视为正常组合 label, 留原样.
 */
function safeTitle(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  if (UUID_RE.test(value)) return fallback;
  return value;
}

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
          label: safeNodeLabel(row.name, "未命名项目"),
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
        label: row.identifier
          ? `${row.identifier} ${safeTitle(row.title, "未命名任务")}`
          : safeTitle(row.title, "未命名任务"),
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
        label: `${SPEC_KIND_LABEL[row.specKind] ?? row.specKind}: ${safeTitle(row.title, "未命名规格")}`,
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
          label: safeNodeLabel(row.title, "未命名对话"),
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
          label: safeNodeLabel(row.title, "未命名交付物"),
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
    // board. wave216: this server-side fallback is also tightened — if the
    // resolver above somehow returned an id-shaped label (e.g. a future caller
    // forgot to populate `name`), we still won't ship a uuid to the UI.
    // wave244: tightened one more notch — a non-deleted row that somehow
    // resolves to a uuid-shaped label (e.g. an `agents.name` written by an
    // upstream that left the column empty) is also caught here. The loop is
    // the last line of defence before the JSON hits the wire, so a single
    // pass over the assembled node list is enough.
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
    const FALLBACK_LABEL: Record<EntityType, string> = {
      company: "未命名公司",
      project: "未命名项目",
      issue: "未命名任务",
      spec: "未命名规格",
      conversation: "未命名对话",
      work_product: "未命名交付物",
      attachment: "未命名附件",
      comment: "未命名评论",
      agent: "未命名智能体",
    };
    const result: OntologyGraphNode[] = [];
    for (const ref of refs) {
      const key = nodeKey(ref.type, ref.id);
      const existing = nodes.get(key);
      if (!existing) {
        result.push({
          type: ref.type,
          id: ref.id,
          key,
          label: PLACEHOLDER_LABEL[ref.type] ?? `已删除的 ${ref.type}`,
          href: null,
        });
        continue;
      }
      // wave244: existing resolved row might still carry a UUID-shaped label
      // (an upstream write left `name` empty and the column fell back to the
      // row id). One last pass strips that — anything matching UUID_RE is
      // rewritten to the type's "未命名 X" placeholder so the board never
      // shows a bare uuid. The exact type-specific fallback beats the generic
      // `已删除的 X` here because the row DOES exist; only the name is bad.
      const fallback = FALLBACK_LABEL[ref.type] ?? `未命名 ${ref.type}`;
      result.push({
        ...existing,
        label: UUID_RE.test(existing.label) ? fallback : existing.label,
      });
    }
    return result;
  }

  async function buildView(input: {
    companyId: string;
    root: EntityRef | null;
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

    let edgeRows = await loadEdges(input.companyId, relationFilter);
    // 工业级自生引擎 (Auto-Bootstrapper): 首次访问若无任何关系，自动基于公司员工、项目与任务自生基础设施图谱
    if (edgeRows.length === 0 && !input.root) {
      try {
        const backfillSvc = ontologyBackfillService(db);
        const backfilled = await backfillSvc.backfill(input.companyId);
        if (backfilled.totalInserted > 0) {
          edgeRows = await loadEdges(input.companyId, relationFilter);
        }
      } catch (err) {
        // 自生失败降级走空图谱
      }
    }

    const edges = edgeRows.map(toEdge);

    // 工业级大图防爆防御策略 (Safe Backbone Sampling & Edge Bundling):
    // 当全域关系巨大 (>60) 时，杜绝全量 2000+ 边并发导致前端 DOM/Canvas/Webview 崩溃卡死。
    // 自动切换为「中心度骨干采样」：优先保留度数最高的 Top 40 个枢纽节点，并对同向连边做智能聚合。
    if (!input.root) {
      const isHugeGraph = edges.length > 60;
      let safeEdges: OntologyGraphEdge[] = edges;
      let truncated = edges.length > MAX_NODES;

      if (isHugeGraph) {
        truncated = true;
        // 1. 统计节点度数 (Degree Centrality)
        const degrees = new Map<string, number>();
        for (const e of edges) {
          degrees.set(e.source, (degrees.get(e.source) ?? 0) + 1);
          degrees.set(e.target, (degrees.get(e.target) ?? 0) + 1);
        }

        // 2. 按中心度排序，提取前 40 个核心枢纽节点 (Top Hubs)
        const sortedHubKeys = Array.from(degrees.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 40)
          .map(([k]) => k);
        const hubSet = new Set(sortedHubKeys);

        // 3. 筛选连接核心节点的边
        const candidateEdges = edges.filter(
          (e) => hubSet.has(e.source) && hubSet.has(e.target),
        );

        // 4. 边聚合 (Edge Bundling): 对相同 (source, target) 的重复边合并为一条聚合复合边
        const bundledMap = new Map<string, OntologyGraphEdge>();
        for (const e of candidateEdges) {
          const pairKey = `${e.source}->${e.target}`;
          const existing = bundledMap.get(pairKey);
          if (!existing) {
            bundledMap.set(pairKey, { ...e });
          } else {
            existing.weight += e.weight;
          }
        }
        safeEdges = Array.from(bundledMap.values());
      } else if (truncated) {
        safeEdges = edges.slice(0, MAX_NODES);
      }

      const nodeKeys = new Set<string>();
      for (const edge of safeEdges) {
        nodeKeys.add(edge.source);
        nodeKeys.add(edge.target);
      }
      const nodes = await hydrate(input.companyId, keysToRefs(Array.from(nodeKeys)));
      return { root: null, depth, view, truncated, nodes, edges: safeEdges };
    }

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

  /**
   * Wave261 — five-level drilldown summary. Buckets the company's full graph
   * into:
   *   L0 — totals (no cap, distinct from `stats()` which is per-type)
   *   L1 — per-domain rollup
   *   L2 — per-entityType rollup (the "75 types" boss screenshot bucket)
   *   L3 — implicit (per-entityType count is also the L3 instance count —
   *         callers walk via `/ontology/instances?entityType=...`)
   *   L4 — implicit (per-type property list lives in
   *         `/ontology/types/:typeId/properties`)
   *
   * The two implicit levels reuse existing routes; the App's drilldown
   * breadcrumb drives the navigation. We do not expose instance counts for
   * each domain — the App calls `listInstances` for that — so this method
   * stays purely aggregate.
   *
   * Domain ↔ entityType mapping: we use the domain's `category` field. The
   * plugin sets this to one of `业务 / 项目 / 员工 / 资产 / 模板` for the
   * five built-in templates, and custom domains carry whatever the creator
   * chose. A row whose entityType is not mapped to a domain bucket falls
   * into `(uncategorized)` so the totals stay consistent.
   */
  async function summarizeLevels(companyId: string): Promise<OntologyLevelsResponse> {
    // Per-entityType: count distinct source rows + count edges incident.
    const nodeRows = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(projects).where(eq(projects.companyId, companyId)),
      db.select({ count: sql<number>`count(*)::int` }).from(issues).where(eq(issues.companyId, companyId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(issues)
        .where(and(eq(issues.companyId, companyId), isNotNull(issues.specKind))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(boardConversations)
        .where(eq(boardConversations.companyId, companyId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(issueWorkProducts)
        .where(eq(issueWorkProducts.companyId, companyId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(issueAttachments)
        .where(eq(issueAttachments.companyId, companyId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(issueComments)
        .where(eq(issueComments.companyId, companyId)),
      db.select({ count: sql<number>`count(*)::int` }).from(agents).where(eq(agents.companyId, companyId)),
    ]);
    const typeRows: Array<{ entityType: EntityType; count: number }> = [
      { entityType: "project", count: nodeRows[0][0]?.count ?? 0 },
      { entityType: "issue", count: nodeRows[1][0]?.count ?? 0 },
      { entityType: "spec", count: nodeRows[2][0]?.count ?? 0 },
      { entityType: "conversation", count: nodeRows[3][0]?.count ?? 0 },
      { entityType: "work_product", count: nodeRows[4][0]?.count ?? 0 },
      { entityType: "attachment", count: nodeRows[5][0]?.count ?? 0 },
      { entityType: "comment", count: nodeRows[6][0]?.count ?? 0 },
      { entityType: "agent", count: nodeRows[7][0]?.count ?? 0 },
    ];
    const totalNodes = typeRows.reduce((sum, entry) => sum + entry.count, 0);

    // Edge buckets per side: edges with src OR target of this entityType.
    // sql<number> group-by returns one row per group; we sum into one bucket
    // by re-running for each entityType so a single edge counts twice in
    // edgeCount totals — by design (each endpoint's domain wants to see it).
    const edgeRows = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(entityRelations)
      .where(eq(entityRelations.companyId, companyId));
    const totalEdges = edgeRows[0]?.value ?? 0;
    const edgesByType = new Map<EntityType, number>();
    for (const entityType of ENTITY_TYPES) {
      if (entityType === "company") continue;
      const rows = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(entityRelations)
        .where(
          and(
            eq(entityRelations.companyId, companyId),
            sql`(${entityRelations.srcType} = ${entityType} OR ${entityRelations.targetType} = ${entityType})`,
          ),
        );
      edgesByType.set(entityType, rows[0]?.value ?? 0);
    }
    const byEntityType: OntologyEntityTypeLevel[] = typeRows.map((row) => ({
      entityType: row.entityType,
      count: row.count,
      edgeCount: edgesByType.get(row.entityType) ?? 0,
    }));

    // Domain buckets. The plugin sets `category` to one of the five built-in
    // labels (业务 / 项目 / 员工 / 资产 / 模板). We map each entityType to
    // the matching bucket, and any leftover types (e.g. `comment`,
    // `attachment`) flow into the parent type's bucket so totals stay
    // consistent across buckets.
    const TYPE_TO_DOMAIN: Record<EntityType, string> = {
      company: "uncategorized",
      project: "项目",
      issue: "业务",
      spec: "业务",
      conversation: "业务",
      work_product: "资产",
      attachment: "资产",
      comment: "业务",
      agent: "员工",
    };
    const byDomain = new Map<string, OntologyDomainLevel>();
    const ensure = (category: string): OntologyDomainLevel => {
      const existing = byDomain.get(category);
      if (existing) return existing;
      const created: OntologyDomainLevel = {
        domainId: category,
        displayName: category,
        category,
        lifecycleState: "active",
        typeCount: 0,
        instanceCount: 0,
        edgeCount: 0,
      };
      byDomain.set(category, created);
      return created;
    };
    for (const entry of byEntityType) {
      if (entry.entityType === "company") continue;
      const bucket = TYPE_TO_DOMAIN[entry.entityType] ?? "uncategorized";
      const agg = ensure(bucket);
      if (entry.count > 0) agg.typeCount += 1;
      agg.instanceCount += entry.count;
      agg.edgeCount += entry.edgeCount;
    }
    // Sort by instanceCount desc so the App renders the biggest bucket first.
    const domainList = Array.from(byDomain.values()).sort(
      (a, b) => b.instanceCount - a.instanceCount,
    );

    return {
      companyId,
      totalNodes,
      totalEdges,
      byEntityType,
      byDomain: domainList,
    };
  }

  return { buildView, traverse: buildView, findPaths, stats, hydrate, loadEdges, summarizeLevels };
}

export type OntologyGraphService = ReturnType<typeof ontologyGraphService>;
