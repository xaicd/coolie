import {
  definePlugin,
  runWorker,
  type PluginApiRequestInput,
  type PluginApiResponse,
  type PluginContext,
} from "@paperclipai/plugin-sdk";
import {
  PostgresGraphStore,
  type CapabilityCandidate,
  type CognitionShard,
  type DescribeDomainResult,
  type GraphStore,
  type ImpactDirection,
} from "./graph/GraphStore.js";
import { extractRepoDraft } from "./cognition/AstExtractor.js";
import { AideStore, type AideCitation } from "./aide/AideStore.js";
import {
  AideConfigError,
  getClient,
  getModel,
  loadClaudeConfig,
  probeClaudeConfig,
} from "./aide/ClaudeClient.js";
import { extractCitations, stripCitationTrailer } from "./aide/citations.js";
import {
  buildBootstrapSystemPrompt,
  parseBootstrapDraft,
} from "./aide/bootstrap.js";
import type {
  ActionKind,
  ActionTypeStatus,
  CognitionJobStatus,
  CognitionScale,
  AipLogicStatus,
  BusinessSystemDomain,
  BusinessSystemStatus,
  ConnectorStatus,
  ConnectorType,
  DatasetFormat,
  DatasetLifecycleState,
  DomainLifecycleState,
  EvalMetricType,
  EvalStatus,
  FunctionStatus,
  FunctionType,
  MicroserviceLayer,
  NodeLayer,
  SimulationStatus,
  SubProjectStatus,
  SubProjectType,
  SyncStrategy,
  TransformStatus,
  TransformType,
  UModelDiscoveredFrom,
  UModelEntitySetLayer,
  UModelEntityState,
  UModelEntityType,
  UModelLinkDirection,
  UModelLinkType,
  UModelTelemetryType,
} from "./enums.js";

let activeContext: PluginContext | null = null;
let graphStore: GraphStore | null = null;
let aideStore: AideStore | null = null;

/**
 * Registry of in-flight `ask-aide` streams, keyed by their stream channel.
 * The UI calls the `aide-abort` action with a (companyId, domainId) pair; we
 * look up the running stream, call its `controller.abort()` (the Anthropic SDK
 * exposes it on `MessageStream`), and emit a `done` marker with an empty
 * citations array so the UI can flip the bubble out of "streaming" state.
 *
 * We don't try to be clever about partial state — abort just cancels the HTTP
 * request; the worker has not yet persisted the assistant message at the
 * point of abort, so there's nothing to roll back. If a stream races with a
 * successful finalMessage() (very tight timing), the registry entry is gone
 * by then and abort becomes a no-op.
 */
const aideStreamRegistry = new Map<
  string,
  { controller: { abort(): void }; aborted: boolean }
>();

function aideChannelKey(companyId: string, domainId: string): string {
  return `${companyId}::${domainId}`;
}

/**
 * Registry of in-flight `ai-bootstrap-plan` streams. Same shape as
 * `aideStreamRegistry` so the abort action reads from a single contract.
 * Each entry binds the running MessageStream's controller; the plan loops
 * `store.createNodeType / RelationType / Node / Edge` after `finalMessage()`
 * succeeds, so partial writes (after a stream finishes but before all rows
 * are inserted) cannot be aborted — only the LLM call itself is cancellable.
 */
const bootstrapStreamRegistry = new Map<
  string,
  { controller: { abort(): void }; aborted: boolean }
>();

function bootstrapChannelKey(companyId: string, domainId: string): string {
  return `${companyId}::${domainId}`;
}

function requireContext(): PluginContext {
  if (!activeContext) {
    throw new Error("Ontology plugin worker context is not initialized");
  }
  return activeContext;
}

function requireGraphStore(): GraphStore {
  if (!graphStore) {
    graphStore = new PostgresGraphStore(requireContext().db);
  }
  return graphStore;
}

function requireAideStore(): AideStore {
  if (!aideStore) {
    aideStore = new AideStore(requireContext().db);
  }
  return aideStore;
}

// ---------------------------------------------------------------------------
// O10 — 数字副手 prompt helper (citation parsing lives in ./aide/citations)
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for the digital-aide chat. We deliberately stay
 * terse and put the schema directly inline so the model cannot invent objects
 * that do not exist. The hard cap is the worker's `describeDomain()` payload;
 * anything not listed there must be answered as "未建模".
 */
function buildAideSystemPrompt(snapshot: DescribeDomainResult): string {
  const lines: string[] = [];
  lines.push(
    `你是「数字副手」,专门回答关于本体域 ${snapshot.domain.slug} (id=${snapshot.domain.id}, name=${snapshot.domain.display_name}, v${snapshot.domain.version}) 的问题。`,
  );
  lines.push("");
  lines.push(
    "你只能引用以下本体数据回答问题,不要编造对象、关系、属性或数值。如果用户问到本体内未建模的信息,直接说「本体内未建模此字段」,不要瞎猜。",
  );
  lines.push("");
  lines.push(`## 1. 对象类型 (共 ${snapshot.nodeTypes.length} 个)`);
  if (snapshot.nodeTypes.length === 0) {
    lines.push("  (无)");
  }
  for (const nt of snapshot.nodeTypes) {
    const propCount = nt.propertiesSchema && typeof nt.propertiesSchema === "object"
      ? Object.keys(nt.propertiesSchema).length
      : 0;
    lines.push(
      `  - ${nt.key} | ${nt.displayName} | 实例=${nt.instanceCount} | 属性=${propCount}`,
    );
  }
  lines.push("");
  lines.push(`## 2. 关系类型 (共 ${snapshot.relationTypes.length} 个)`);
  if (snapshot.relationTypes.length === 0) {
    lines.push("  (无)");
  }
  for (const rt of snapshot.relationTypes) {
    lines.push(
      `  - ${rt.key} | ${rt.displayName} | 方向=${rt.directed ? "directed" : "undirected"} | 实例=${rt.instanceCount}`,
    );
  }
  lines.push("");
  lines.push(`## 3. 最近修改节点 (展示 ${snapshot.recentNodes.length} 条)`);
  if (snapshot.recentNodes.length === 0) {
    lines.push("  (无)");
  }
  for (const n of snapshot.recentNodes) {
    lines.push(`  - ${n.key} | ${n.label} | 类型=${n.nodeTypeKey ?? "(未分类)"}`);
  }
  lines.push("");
  lines.push(
    `## 4. 真实应用系统 (共 ${snapshot.businessSystems.length} 个,绑定到本域)`,
  );
  if (snapshot.businessSystems.length === 0) {
    lines.push("  (无)");
  }
  for (const bs of snapshot.businessSystems) {
    lines.push(`  - ${bs.code} | ${bs.name} | status=${bs.status}`);
  }
  lines.push("");
  lines.push(`## 5. 业务子项目 (共 ${snapshot.subProjects.length} 个)`);
  if (snapshot.subProjects.length === 0) {
    lines.push("  (无)");
  }
  for (const sp of snapshot.subProjects) {
    lines.push(`  - ${sp.code} | ${sp.name} | type=${sp.type} | status=${sp.status}`);
  }
  lines.push("");
  lines.push(`## 6. Action / API 类型 (共 ${snapshot.actionTypes.length} 个)`);
  if (snapshot.actionTypes.length === 0) {
    lines.push("  (无)");
  }
  for (const at of snapshot.actionTypes) {
    lines.push(`  - ${at.key} | ${at.displayName} | kind=${at.kind} | status=${at.status}`);
  }
  lines.push("");
  lines.push("回答要求:");
  lines.push("1. 用中文回答,除非用户用英文提问。");
  lines.push(
    "2. 每条回答末尾必须添加一行引用,格式:`[cite:kind:id,kind:id,...]`(逗号分隔)。kind 只能取: node-type | relation-type | node | sub-project | action-type | business-system。",
  );
  lines.push("3. 引用行必须独占一行,放在回答末尾,不要嵌在正文中。");
  lines.push("4. 没有可引用的本体数据时,引用行可以为空:`[cite:]`。");
  return lines.join("\n");
}

/** Parse the trailing `[cite:kind:id,...]` line from an LLM response. The
 *  shared implementation lives in ./aide/citations so unit tests can import
 *  it without dragging in the whole worker module. */

/** Read the first value of a query parameter that may arrive as string[]. */
function queryString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required field: ${field}`);
  }
  return value;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseDepth(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Coerce an unknown tool-param value to a finite number, or undefined. */
function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

/**
 * Publish a cognition job draft into a target domain: create Object types from
 * seed node types, Link types from seed relation types, and Action types from
 * seed actions (reusing the O2 Foundry building-block store). Transitions the
 * job publishing -> completed and records a result summary.
 *
 * Returns null when the job or target domain does not exist.
 */
async function publishCognitionDraft(
  ctx: PluginContext,
  store: GraphStore,
  companyId: string,
  jobId: string,
  targetDomainId: string,
): Promise<{ published: { nodeTypes: number; relationTypes: number; actionTypes: number }; job: unknown } | null> {
  const draft = await store.getCognitionDraft(companyId, jobId);
  if (!draft) return null;
  const domain = await store.getDomain(companyId, targetDomainId);
  if (!domain) return null;

  // publishing gate (validates the current state allows publishing)
  await store.transitionCognitionStatus(companyId, jobId, "publishing", { stageLabel: "publishing draft" });

  let nodeTypes = 0;
  let relationTypes = 0;
  let actionTypes = 0;

  for (const raw of draft.seedNodeTypes) {
    const nt = raw as Record<string, unknown>;
    const key = str(nt.typeName ?? nt.key ?? nt.name);
    if (!key) continue;
    await store.createNodeType({
      companyId,
      domainId: targetDomainId,
      key,
      displayName: str(nt.displayName ?? nt.label ?? key, key),
      description: str(nt.description) || null,
      layer: (str(nt.layer) as NodeLayer) || undefined,
    });
    nodeTypes += 1;
  }

  for (const raw of draft.seedRelationTypes) {
    const rt = raw as Record<string, unknown>;
    const key = str(rt.relationType ?? rt.key ?? rt.name);
    if (!key) continue;
    await store.createRelationType({
      companyId,
      domainId: targetDomainId,
      key,
      displayName: str(rt.displayName ?? key, key),
      description: str(rt.description) || null,
    });
    relationTypes += 1;
  }

  for (const raw of draft.seedActions) {
    const act = raw as Record<string, unknown>;
    const key = str(act.name ?? act.key ?? act.path);
    if (!key) continue;
    await store.createActionType({
      companyId,
      domainId: targetDomainId,
      key,
      displayName: str(act.displayName ?? act.name ?? key, key),
      description: str(act.desc ?? act.description),
      apiContract: {
        httpMethod: str(act.method, "POST"),
        routePath: str(act.path),
      },
    });
    actionTypes += 1;
  }

  const result = { domainId: targetDomainId, nodeTypes, relationTypes, actionTypes };
  await store.setCognitionResult(companyId, jobId, result);
  const job = await store.transitionCognitionStatus(companyId, jobId, "completed", {
    stageLabel: "published",
  });

  await ctx.activity.log({
    companyId,
    message: `Published cognition draft: ${nodeTypes} node types, ${relationTypes} relation types, ${actionTypes} action types`,
    entityType: "ontology_cognition_job",
    entityId: jobId,
    metadata: result,
  });

  return { published: { nodeTypes, relationTypes, actionTypes }, job };
}

/**
 * Emit a cross-plugin `domain-lifecycle-changed` event. Best-effort: swallow
 * emit failures so a domain transition never fails because a subscriber or the
 * event bus is unavailable.
 */
async function emitDomainLifecycleChanged(
  ctx: PluginContext,
  companyId: string,
  payload: { domainId: string; from: string | null; to: string },
): Promise<void> {
  try {
    await ctx.events.emit("domain-lifecycle-changed", companyId, payload);
  } catch (err) {
    ctx.logger.warn("Failed to emit domain-lifecycle-changed", {
      error: String((err as Error)?.message ?? err),
      domainId: payload.domainId,
    });
  }
}

/**
 * Emit one `node-stale` event per node in a domain. Used when a domain is
 * deprecated so downstream plugins can open remediation work. Best-effort per
 * node; individual failures are logged and skipped.
 */
async function emitStaleNodesForDomain(
  ctx: PluginContext,
  store: GraphStore,
  companyId: string,
  domainId: string,
): Promise<void> {
  let nodes: Awaited<ReturnType<GraphStore["listNodes"]>>;
  try {
    nodes = await store.listNodes(companyId, domainId, 500);
  } catch (err) {
    ctx.logger.warn("Failed to list nodes for node-stale emit", {
      error: String((err as Error)?.message ?? err),
      domainId,
    });
    return;
  }
  for (const node of nodes) {
    try {
      await ctx.events.emit("node-stale", companyId, {
        domainId,
        nodeId: node.id,
        nodeKey: node.key,
        reason: "domain-deprecated",
      });
    } catch (err) {
      ctx.logger.warn("Failed to emit node-stale", {
        error: String((err as Error)?.message ?? err),
        domainId,
        nodeId: node.id,
      });
    }
  }
}

/** Best-effort cross-plugin emit for a capability-domain event. */
async function emitCapabilityEvent(
  ctx: PluginContext,
  name: string,
  companyId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await ctx.events.emit(name, companyId, payload);
  } catch (err) {
    ctx.logger.warn(`Failed to emit ${name}`, {
      error: String((err as Error)?.message ?? err),
    });
  }
}

const plugin = definePlugin({
  async setup(ctx) {
    activeContext = ctx;
    graphStore = new PostgresGraphStore(ctx.db);

    const store = requireGraphStore();

    // Heartbeat on the `ontology.health` stream so the host's SSE link has a
    // live producer. The UI's TopStatusBar reflects the connection state via
    // `usePluginStream("ontology.health").connected`; without any emissions the
    // link technically opens, but emitting periodic pings lets future widgets
    // surface worker-side liveness (e.g. a degraded Postgres) and exercises the
    // channel for streaming tests.
    const HEALTH_CHANNEL = "ontology.health";
    const HEALTH_INTERVAL_MS = 15_000;
    const healthTimer = setInterval(() => {
      try {
        ctx.streams.emit(HEALTH_CHANNEL, {
          type: "ping",
          ts: Date.now(),
        });
      } catch {
        // Streams may be torn down on shutdown; ignore.
      }
    }, HEALTH_INTERVAL_MS);
    healthTimer.unref?.();

    // Backs usePluginData("list-domains") in the plugin UI.
    ctx.data.register("list-domains", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      return { domains: await store.listDomains(companyId) };
    });

    // Backs usePluginData("domain-detail", { companyId, domainId }) — domain +
    // node-types + relation-types + a bounded graph snapshot in one payload.
    ctx.data.register("domain-detail", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const [domain, nodeTypes, relationTypes, graph] = await Promise.all([
        store.getDomain(companyId, domainId),
        store.listNodeTypes(companyId, domainId),
        store.listRelationTypes(companyId, domainId),
        store.getGraphSnapshot(companyId, domainId),
      ]);
      return { domain, nodeTypes, relationTypes, graph };
    });

    // Mutating actions backing usePluginAction(...) in the plugin UI.
    ctx.actions.register("create-domain", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domain = await store.createDomain({
        companyId,
        slug: requireString(params.slug, "slug"),
        displayName: requireString(params.displayName, "displayName"),
        description: typeof params.description === "string" ? params.description : null,
      });
      await ctx.activity.log({
        companyId,
        message: `Created ontology domain ${domain.slug}`,
        entityType: "ontology_domain",
        entityId: domain.id,
      });
      return { domain };
    });

    ctx.actions.register("create-node-type", async (params) => {
      const nodeType = await store.createNodeType({
        companyId: requireString(params.companyId, "companyId"),
        domainId: requireString(params.domainId, "domainId"),
        key: requireString(params.key, "key"),
        displayName: requireString(params.displayName, "displayName"),
        description: typeof params.description === "string" ? params.description : null,
      });
      return { nodeType };
    });

    ctx.actions.register("create-relation-type", async (params) => {
      const relationType = await store.createRelationType({
        companyId: requireString(params.companyId, "companyId"),
        domainId: requireString(params.domainId, "domainId"),
        key: requireString(params.key, "key"),
        displayName: requireString(params.displayName, "displayName"),
        description: typeof params.description === "string" ? params.description : null,
        directed: typeof params.directed === "boolean" ? params.directed : undefined,
      });
      return { relationType };
    });

    // Graph instance authoring — backs drag-to-model in the graph view.
    ctx.actions.register("create-node", async (params) => {
      const node = await store.createNode({
        companyId: requireString(params.companyId, "companyId"),
        domainId: requireString(params.domainId, "domainId"),
        key: requireString(params.key, "key"),
        label: requireString(params.label, "label"),
        nodeTypeId: typeof params.nodeTypeId === "string" ? params.nodeTypeId : null,
        properties: optionalRecord(params.properties),
      });
      return { node };
    });

    ctx.actions.register("create-edge", async (params) => {
      const edge = await store.createEdge({
        companyId: requireString(params.companyId, "companyId"),
        domainId: requireString(params.domainId, "domainId"),
        sourceNodeId: requireString(params.sourceNodeId, "sourceNodeId"),
        targetNodeId: requireString(params.targetNodeId, "targetNodeId"),
        relationKey: typeof params.relationKey === "string" ? params.relationKey : null,
      });
      return { edge };
    });

    ctx.actions.register("update-node", async (params) => {
      const updates: { label?: string; properties?: Record<string, unknown> } = {};
      if (typeof params.label === "string") updates.label = params.label;
      const props = optionalRecord(params.properties);
      if (props !== undefined) updates.properties = props;
      const node = await store.updateNode(
        requireString(params.companyId, "companyId"),
        requireString(params.nodeId, "nodeId"),
        updates,
      );
      if (!node) throw new Error("Node not found");
      return { node };
    });

    // Mirror of the snapshot-domain HTTP route so the plugin UI's top status
    // pill can trigger a snapshot via usePluginAction without round-tripping
    // through the HTTP layer.
    ctx.actions.register("snapshot-domain", async (params) => {
      const snapshot = await store.snapshotDomain(
        requireString(params.companyId, "companyId"),
        requireString(params.domainId, "domainId"),
        typeof params.description === "string" ? params.description : "",
        typeof params.createdBy === "string" ? params.createdBy : "system",
      );
      if (!snapshot) throw new Error("Domain not found");
      return { snapshot };
    });

    ctx.actions.register("delete-node", async (params) => {
      const deleted = await store.deleteNode(
        requireString(params.companyId, "companyId"),
        requireString(params.nodeId, "nodeId"),
      );
      return { deleted };
    });

    ctx.actions.register("update-edge", async (params) => {
      const edge = await store.updateEdge(
        requireString(params.companyId, "companyId"),
        requireString(params.edgeId, "edgeId"),
        { relationKey: typeof params.relationKey === "string" ? params.relationKey : null },
      );
      if (!edge) throw new Error("Edge not found");
      return { edge };
    });

    ctx.actions.register("delete-edge", async (params) => {
      const deleted = await store.deleteEdge(
        requireString(params.companyId, "companyId"),
        requireString(params.edgeId, "edgeId"),
      );
      return { deleted };
    });

    // One-click sample seed: populate an empty domain with a small, coherent
    // "software delivery" ontology so the graph is immediately meaningful.
    // Idempotent: no-ops if the domain already has nodes.
    ctx.actions.register("seed-samples", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");

      const existing = await store.getGraphSnapshot(companyId, domainId);
      if (existing.counts.nodes > 0) {
        return { seeded: false, reason: "domain-not-empty", counts: existing.counts };
      }

      // ── Node types ──
      const nodeTypeDefs: Array<{ key: string; displayName: string }> = [
        { key: "team", displayName: "Team" },
        { key: "person", displayName: "Person" },
        { key: "service", displayName: "Service" },
        { key: "repository", displayName: "Repository" },
        { key: "project", displayName: "Project" },
        { key: "task", displayName: "Task" },
      ];
      const typeIdByKey = new Map<string, string>();
      for (const def of nodeTypeDefs) {
        const nt = await store.createNodeType({ companyId, domainId, key: def.key, displayName: def.displayName, description: null });
        typeIdByKey.set(def.key, nt.id);
      }

      // ── Relation types ──
      const relationTypeDefs: Array<{ key: string; displayName: string }> = [
        { key: "member_of", displayName: "Member of" },
        { key: "owns", displayName: "Owns" },
        { key: "depends_on", displayName: "Depends on" },
        { key: "assigned_to", displayName: "Assigned to" },
        { key: "part_of", displayName: "Part of" },
      ];
      for (const def of relationTypeDefs) {
        await store.createRelationType({ companyId, domainId, key: def.key, displayName: def.displayName, description: null });
      }

      // ── Nodes ──
      const nodeDefs: Array<{ key: string; label: string; type: string }> = [
        { key: "team-platform", label: "Platform Team", type: "team" },
        { key: "team-growth", label: "Growth Team", type: "team" },
        { key: "person-alice", label: "Alice (Lead)", type: "person" },
        { key: "person-bob", label: "Bob (Engineer)", type: "person" },
        { key: "person-carol", label: "Carol (Engineer)", type: "person" },
        { key: "svc-auth", label: "Auth Service", type: "service" },
        { key: "svc-billing", label: "Billing Service", type: "service" },
        { key: "svc-gateway", label: "API Gateway", type: "service" },
        { key: "repo-auth", label: "auth-service (repo)", type: "repository" },
        { key: "repo-billing", label: "billing-service (repo)", type: "repository" },
        { key: "proj-q3", label: "Q3 Platform Hardening", type: "project" },
        { key: "task-mfa", label: "Add MFA to Auth", type: "task" },
        { key: "task-invoices", label: "Invoice export", type: "task" },
      ];
      const nodeIdByKey = new Map<string, string>();
      for (const def of nodeDefs) {
        const node = await store.createNode({
          companyId,
          domainId,
          key: def.key,
          label: def.label,
          nodeTypeId: typeIdByKey.get(def.type) ?? null,
        });
        nodeIdByKey.set(def.key, node.id);
      }

      // ── Edges ──
      const edgeDefs: Array<{ from: string; to: string; rel: string }> = [
        { from: "person-alice", to: "team-platform", rel: "member_of" },
        { from: "person-bob", to: "team-platform", rel: "member_of" },
        { from: "person-carol", to: "team-growth", rel: "member_of" },
        { from: "team-platform", to: "svc-auth", rel: "owns" },
        { from: "team-platform", to: "svc-gateway", rel: "owns" },
        { from: "team-growth", to: "svc-billing", rel: "owns" },
        { from: "svc-auth", to: "repo-auth", rel: "owns" },
        { from: "svc-billing", to: "repo-billing", rel: "owns" },
        { from: "svc-gateway", to: "svc-auth", rel: "depends_on" },
        { from: "svc-billing", to: "svc-auth", rel: "depends_on" },
        { from: "task-mfa", to: "proj-q3", rel: "part_of" },
        { from: "task-invoices", to: "proj-q3", rel: "part_of" },
        { from: "task-mfa", to: "person-bob", rel: "assigned_to" },
        { from: "task-invoices", to: "person-carol", rel: "assigned_to" },
      ];
      let edgeCount = 0;
      for (const def of edgeDefs) {
        const sourceNodeId = nodeIdByKey.get(def.from);
        const targetNodeId = nodeIdByKey.get(def.to);
        if (!sourceNodeId || !targetNodeId) continue;
        await store.createEdge({ companyId, domainId, sourceNodeId, targetNodeId, relationKey: def.rel });
        edgeCount++;
      }

      const counts = (await store.getGraphSnapshot(companyId, domainId)).counts;
      return {
        seeded: true,
        counts,
        created: { nodeTypes: nodeTypeDefs.length, relationTypes: relationTypeDefs.length, nodes: nodeDefs.length, edges: edgeCount },
      };
    });

    // Evaluation / simulation — domain-scoped data/action handlers for the UI.
    ctx.data.register("domain-evaluation", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const [evals, simulations] = await Promise.all([
        store.listEvals(companyId, domainId),
        store.listSimulationScenarios(companyId, domainId),
      ]);
      return { evals, simulations };
    });

    ctx.actions.register("create-eval", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const evalRun = await store.createEval({
        companyId,
        domainId,
        key: typeof params.key === "string" && params.key.trim() !== "" ? params.key : `eval-${Date.now()}`,
        name: requireString(params.name, "name"),
        evalType: typeof params.evalType === "string" ? (params.evalType as EvalMetricType) : undefined,
      });
      return { eval: evalRun };
    });

    ctx.actions.register("create-simulation-scenario", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const scenario = await store.createSimulationScenario({
        companyId,
        domainId,
        key: typeof params.key === "string" && params.key.trim() !== "" ? params.key : `sim-${Date.now()}`,
        name: requireString(params.name, "name"),
      });
      return { scenario };
    });

    // Data pipeline — domain-scoped datasets / connectors / transforms.
    ctx.data.register("domain-pipeline", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const [datasets, connectors, transforms] = await Promise.all([
        store.listDatasets(companyId, domainId),
        store.listConnectors(companyId, domainId),
        store.listTransforms(companyId, domainId),
      ]);
      return { datasets, connectors, transforms };
    });

    ctx.actions.register("create-dataset", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const dataset = await store.createDataset({
        companyId,
        domainId,
        key: typeof params.key === "string" && params.key.trim() !== "" ? params.key : `ds-${Date.now()}`,
        name: requireString(params.name, "name"),
        format: typeof params.format === "string" ? (params.format as DatasetFormat) : undefined,
      });
      return { dataset };
    });

    ctx.actions.register("create-connector", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const connector = await store.createConnector({
        companyId,
        domainId,
        key: typeof params.key === "string" && params.key.trim() !== "" ? params.key : `conn-${Date.now()}`,
        name: requireString(params.name, "name"),
        connectorType: requireString(params.connectorType, "connectorType") as ConnectorType,
        datasetId: typeof params.datasetId === "string" ? params.datasetId : null,
      });
      return { connector };
    });

    ctx.actions.register("create-transform", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const transform = await store.createTransform({
        companyId,
        domainId,
        key: typeof params.key === "string" && params.key.trim() !== "" ? params.key : `tf-${Date.now()}`,
        name: requireString(params.name, "name"),
        transformType: typeof params.transformType === "string" ? (params.transformType as TransformType) : undefined,
        outputDatasetId: typeof params.outputDatasetId === "string" ? params.outputDatasetId : null,
      });
      return { transform };
    });

    // Cognition (AST reverse-engineering) — data/action handlers for the UI:
    // create a job, ingest code files (extract a draft), review, publish to a domain.
    ctx.data.register("list-cognition-jobs", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      return { jobs: await store.listCognitionJobs(companyId) };
    });

    ctx.data.register("cognition-job", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const jobId = requireString(params.jobId, "jobId");
      const [job, draft] = await Promise.all([
        store.getCognitionJob(companyId, jobId),
        store.getCognitionDraft(companyId, jobId),
      ]);
      return { job, draft };
    });

    ctx.actions.register("create-cognition-job", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const job = await store.createCognitionJob({
        companyId,
        jobKey:
          typeof params.jobKey === "string" && params.jobKey.trim() !== ""
            ? params.jobKey
            : `cog-${Date.now()}`,
        rootPath: requireString(params.rootPath, "rootPath"),
        domainId: typeof params.domainId === "string" ? params.domainId : null,
        appName: typeof params.appName === "string" ? params.appName : undefined,
      });
      await ctx.activity.log({
        companyId,
        message: `Created cognition job ${job.job_key}`,
        entityType: "ontology_cognition_job",
        entityId: job.id,
      });
      return { job };
    });

    ctx.actions.register("ingest-cognition-files", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const jobId = requireString(params.jobId, "jobId");
      const rawFiles = Array.isArray(params.files) ? params.files : [];
      const files = rawFiles
        .map((f) => optionalRecord(f))
        .filter((f): f is Record<string, unknown> => f !== undefined && typeof f.path === "string")
        .map((f) => ({ path: String(f.path), content: typeof f.content === "string" ? f.content : "" }));
      const draft = extractRepoDraft(files);
      const job = await store.setCognitionDraft(companyId, jobId, {
        draftPreview: { coverage: draft.coverage },
        seedNodeTypes: draft.seedNodeTypes,
        seedRelationTypes: draft.seedRelationTypes,
        seedActions: draft.seedActions,
      });
      if (!job) throw new Error("Cognition job not found");
      await store.recordCognitionCoverage(companyId, jobId, {
        entityCount: draft.coverage.entityCount,
        relationCount: draft.coverage.relationCount,
        actionCount: draft.coverage.actionCount,
        sqlFiles: draft.coverage.sqlFiles,
        apiFiles: draft.coverage.apiFiles,
      });
      return { job, coverage: draft.coverage };
    });

    ctx.actions.register("publish-cognition-job", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const jobId = requireString(params.jobId, "jobId");
      const targetDomainId = requireString(params.domainId, "domainId");
      const result = await publishCognitionDraft(ctx, store, companyId, jobId, targetDomainId);
      if (!result) throw new Error("Cognition job or domain not found");
      return result;
    });

    // Capability acquisition — data/action handlers backing the Capabilities UI.
    ctx.data.register("list-capability-gaps", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const status =
        typeof params.status === "string" && params.status.trim() !== "" ? params.status : undefined;
      return { gaps: await store.listCapabilityGaps(companyId, status) };
    });

    ctx.data.register("capability-resolutions", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const gapId = requireString(params.gapId, "gapId");
      return { resolutions: await store.listCapabilityResolutions(companyId, gapId) };
    });

    ctx.actions.register("create-capability-gap", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const gap = await store.detectCapabilityGap({
        companyId,
        domainId: typeof params.domainId === "string" ? params.domainId : null,
        gapKey:
          typeof params.gapKey === "string" && params.gapKey.trim() !== ""
            ? params.gapKey
            : `gap-${Date.now()}`,
        title: requireString(params.title, "title"),
        description: typeof params.description === "string" ? params.description : undefined,
        detectedFrom: "manual",
      });
      await emitCapabilityEvent(ctx, "capability-gap-detected", companyId, {
        gapId: gap.id,
        domainId: gap.domain_id,
        title: gap.title,
      });
      return { gap };
    });

    ctx.actions.register("acquire-capability", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const cand = optionalRecord(params.candidate) ?? {};
      const result = await store.acquireCapability(
        companyId,
        requireString(params.gapId, "gapId"),
        {
          name: requireString(cand.name, "candidate.name"),
          version: typeof cand.version === "string" ? cand.version : undefined,
          repoUrl: typeof cand.repoUrl === "string" ? cand.repoUrl : undefined,
          license: typeof cand.license === "string" ? cand.license : undefined,
          sizeBytes: typeof cand.sizeBytes === "number" ? cand.sizeBytes : undefined,
          source: (typeof cand.source === "string" ? cand.source : "none") as CapabilityCandidate["source"],
          smokeTestPassed: cand.smokeTestPassed === true,
        },
      );
      if (!result) throw new Error("Capability gap not found");
      await emitCapabilityEvent(ctx, "capability-resolution-advanced", companyId, {
        gapId: result.gap.id,
        resolutionId: result.resolution.id,
        stage: result.resolution.stage,
        source: result.resolution.source,
      });
      if (result.acquired && result.functionId) {
        await emitCapabilityEvent(ctx, "capability-acquired", companyId, {
          gapId: result.gap.id,
          functionId: result.functionId,
          domainId: result.gap.domain_id,
        });
      }
      return result;
    });

    // Agent-facing tools (O5 consumption interface). companyId comes from the
    // run context, so agents can only ever query their own company's ontology.
    ctx.tools.register(
      "queryOntology",
      {
        displayName: "Query Ontology",
        description:
          "Query the company ontology graph. Modes: 'node', 'nodes', 'path'. Returns structured graph data.",
        parametersSchema: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["node", "nodes", "path"] },
            domainSlug: { type: "string" },
            nodeKey: { type: "string" },
            sourceNodeKey: { type: "string" },
            targetNodeKey: { type: "string" },
            limit: { type: "number" },
            maxDepth: { type: "number" },
          },
          required: ["mode", "domainSlug"],
        },
      },
      async (params, runCtx) => {
        const p = optionalRecord(params) ?? {};
        const companyId = runCtx.companyId;
        const domainSlug = requireString(p.domainSlug, "domainSlug");
        const domain = await store.getDomainBySlug(companyId, domainSlug);
        if (!domain) {
          return { error: `Ontology domain not found: ${domainSlug}` };
        }
        const mode = requireString(p.mode, "mode");

        if (mode === "node") {
          const key = requireString(p.nodeKey, "nodeKey");
          const node = await store.getNodeByKey(companyId, domain.id, key);
          if (!node) return { error: `Node not found: ${key} in ${domainSlug}` };
          return {
            content: `Node ${node.key} (${node.label}) in domain ${domainSlug}.`,
            data: { domain: { id: domain.id, slug: domain.slug }, node },
          };
        }

        if (mode === "nodes") {
          const nodes = await store.listNodes(companyId, domain.id, toNumber(p.limit) ?? 100);
          return {
            content: `Domain ${domainSlug} has ${nodes.length} node(s) (capped).`,
            data: { domain: { id: domain.id, slug: domain.slug }, nodes },
          };
        }

        if (mode === "path") {
          const sourceKey = requireString(p.sourceNodeKey, "sourceNodeKey");
          const targetKey = requireString(p.targetNodeKey, "targetNodeKey");
          const [source, target] = await Promise.all([
            store.getNodeByKey(companyId, domain.id, sourceKey),
            store.getNodeByKey(companyId, domain.id, targetKey),
          ]);
          if (!source) return { error: `Source node not found: ${sourceKey}` };
          if (!target) return { error: `Target node not found: ${targetKey}` };
          const path = await store.findPath({
            companyId,
            sourceNodeId: source.id,
            targetNodeId: target.id,
            maxDepth: toNumber(p.maxDepth),
          });
          return {
            content: path
              ? `Path ${sourceKey} -> ${targetKey}: ${path.length - 1} hop(s).`
              : `No directed path from ${sourceKey} to ${targetKey}.`,
            data: { found: path !== null, path: path ?? [] },
          };
        }

        return { error: `Unknown query mode: ${mode}` };
      },
    );

    ctx.tools.register(
      "simulateOntologyImpact",
      {
        displayName: "Simulate Ontology Impact",
        description:
          "Simulate the blast radius of a node: nodes reachable downstream (affected by) or upstream (depend on) it.",
        parametersSchema: {
          type: "object",
          properties: {
            domainSlug: { type: "string" },
            nodeKey: { type: "string" },
            direction: { type: "string", enum: ["downstream", "upstream"] },
            maxDepth: { type: "number" },
          },
          required: ["domainSlug", "nodeKey"],
        },
      },
      async (params, runCtx) => {
        const p = optionalRecord(params) ?? {};
        const companyId = runCtx.companyId;
        const domainSlug = requireString(p.domainSlug, "domainSlug");
        const domain = await store.getDomainBySlug(companyId, domainSlug);
        if (!domain) return { error: `Ontology domain not found: ${domainSlug}` };

        const nodeKey = requireString(p.nodeKey, "nodeKey");
        const node = await store.getNodeByKey(companyId, domain.id, nodeKey);
        if (!node) return { error: `Node not found: ${nodeKey} in ${domainSlug}` };

        const direction: ImpactDirection = p.direction === "upstream" ? "upstream" : "downstream";
        const impacted = await store.findImpact({
          companyId,
          rootNodeId: node.id,
          direction,
          maxDepth: toNumber(p.maxDepth),
        });
        return {
          content: `${direction} impact of ${nodeKey}: ${impacted.length} node(s).`,
          data: { direction, count: impacted.length, impacted },
        };
      },
    );

    // -----------------------------------------------------------------------
    // O10 — 数字副手 (Digital Aide) chat surface
    // -----------------------------------------------------------------------

    // Eagerly probe the aide config so any missing ~/.claude/settings.json env
    // surfaces in the worker log at startup rather than as a confusing 500
    // mid-conversation. The actual SDK client is built lazily on first use.
    try {
      const cfg = loadClaudeConfig();
      ctx.logger.info("数字副手 ready", {
        model: cfg.model,
        baseURL: cfg.baseURL,
      });
    } catch (err) {
      if (err instanceof AideConfigError) {
        ctx.logger.warn("数字副手 disabled: " + err.reason, {
          hint: "Add ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL / ANTHROPIC_MODEL to ~/.claude/settings.json env",
        });
      } else {
        throw err;
      }
    }

    // Backs usePluginData("describe-domain", { companyId, domainId }) — the
    // payload the worker feeds into the LLM system prompt, plus a non-throwing
    // config probe so the UI can render a setup card if Claude is unconfigured.
    ctx.data.register("describe-domain", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const probe = probeClaudeConfig();
      const result = await store.describeDomain(companyId, domainId);
      return { ...result, configured: probe.configured, configReason: probe.reason };
    });

    // Backs usePluginData("aide-history", { companyId, domainId }) — full chat
    // transcript in chronological order for the current domain. The worker
    // trims this list to the most recent 50 turns before sending to the LLM.
    ctx.data.register("aide-history", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const messages = await requireAideStore().loadHistory(companyId, domainId);
      return { messages };
    });

    // Backs usePluginAction("ask-aide", { companyId, domainId, message }).
    // Streams Claude tokens to `ontology.aide.stream.${companyId}.${domainId}`
    // and persists the final assistant message (with parsed citations) when
    // the stream completes. Errors are propagated through the same channel.
    ctx.actions.register("ask-aide", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const userMessage = requireString(params.message, "message");
      const aide = requireAideStore();
      const streamChannel = `ontology.aide.stream.${companyId}.${domainId}`;

      await aide.appendMessage(companyId, domainId, "user", userMessage, []);

      const [snapshot, history] = await Promise.all([
        store.describeDomain(companyId, domainId),
        aide.loadHistory(companyId, domainId, 500),
      ]);

      const systemPrompt = buildAideSystemPrompt(snapshot);
      const recentHistory = history.slice(-50);
      const llmMessages: Array<{ role: "user" | "assistant"; content: string }> = [
        ...recentHistory
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userMessage },
      ];

      ctx.streams.open(streamChannel, companyId);
      let acc = "";
      const registryKey = aideChannelKey(companyId, domainId);
      const registryEntry = { controller: { abort() {} }, aborted: false };
      aideStreamRegistry.set(registryKey, registryEntry);
      try {
        const client = getClient();
        const stream = client.messages.stream({
          model: getModel(),
          max_tokens: 2048,
          system: systemPrompt,
          messages: llmMessages,
        });
        // The Anthropic SDK exposes an AbortController-shaped handle on the
        // MessageStream; re-point our registry entry at it so a later
        // aide-abort call actually cancels the HTTP request.
        registryEntry.controller = stream.controller;
        stream.on("text", (delta: string) => {
          acc += delta;
          if (!registryEntry.aborted) {
            ctx.streams.emit(streamChannel, { type: "token", text: delta });
          }
        });
        await stream.finalMessage();
        const citations = extractCitations(acc);
        const cleanContent = stripCitationTrailer(acc);
        // Don't persist partial output if the user aborted mid-flight — the
        // bubble will show a localised "已停止" hint instead of a half answer.
        if (!registryEntry.aborted) {
          await aide.appendMessage(
            companyId,
            domainId,
            "assistant",
            cleanContent,
            citations,
          );
          ctx.streams.emit(streamChannel, { type: "done", citations });
        } else {
          ctx.streams.emit(streamChannel, { type: "aborted" });
        }
        return { ok: true, citations, aborted: registryEntry.aborted };
      } catch (err) {
        // AbortController.abort() resolves with an APIUserAbortError — the SDK
        // converts it into a thrown error. Treat that case as a clean cancel
        // rather than a real failure so the UI doesn't show an error chip.
        if (registryEntry.aborted) {
          ctx.streams.emit(streamChannel, { type: "aborted" });
          return { ok: false, aborted: true };
        }
        const message = err instanceof Error ? err.message : String(err);
        ctx.streams.emit(streamChannel, { type: "error", message });
        throw err;
      } finally {
        aideStreamRegistry.delete(registryKey);
        ctx.streams.close(streamChannel);
      }
    });

    // Cancel the currently streaming aide answer for (companyId, domainId),
    // if any. No-op if no stream is in flight. Backs the "停止生成" button
    // in the sandbox tab composer.
    ctx.actions.register("aide-abort", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const entry = aideStreamRegistry.get(aideChannelKey(companyId, domainId));
      if (!entry) return { ok: true, aborted: false };
      entry.aborted = true;
      try {
        entry.controller.abort();
      } catch {
        // controller.abort() shouldn't throw, but if it does we still want
        // to report that we tried.
      }
      return { ok: true, aborted: true };
    });

    // -----------------------------------------------------------------------
    // AI 初始化补全 — LLM-driven draft + direct-write to the live domain.
    //
    // Stream shape (matches SandboxTab's pattern but uses a different channel
    // prefix so the UI doesn't conflate bootstrap progress with chat tokens):
    //   { type: "start", totalSteps }
    //   { type: "progress", step, kind: "node-type"|"relation-type"|"node"|"edge", label }
    //   { type: "done", counts: { nodeTypes, relationTypes, nodes, edges } }
    //   { type: "error", message }
    //   { type: "aborted" }
    //
    // The action registers its MessageStream with `bootstrapStreamRegistry` so
    // the UI can cancel mid-LLM-call via `ai-bootstrap-abort`. Once the model
    // returns, we parse + filter + insert in a straight loop — there is no
    // transaction, so a partial failure leaves whatever rows already wrote.
    // -----------------------------------------------------------------------
    ctx.actions.register("ai-bootstrap-plan", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const description = typeof params.description === "string" ? params.description : "";
      const streamChannel = `ontology.bootstrap.stream.${companyId}.${domainId}`;
      const bKey = bootstrapChannelKey(companyId, domainId);

      const existing = await store.getGraphSnapshot(companyId, domainId);
      if (existing.counts.nodes > 0) {
        ctx.streams.open(streamChannel, companyId);
        ctx.streams.emit(streamChannel, { type: "error", message: "域已存在节点,无法 AI 初始化" });
        ctx.streams.close(streamChannel);
        return { ok: false, reason: "domain-not-empty" };
      }

      const snapshot = await store.describeDomain(companyId, domainId);
      const systemPrompt = buildBootstrapSystemPrompt({
        domain: snapshot,
        description: description || null,
      });

      ctx.streams.open(streamChannel, companyId);
      const registryEntry = { controller: { abort() {} }, aborted: false };
      bootstrapStreamRegistry.set(bKey, registryEntry);
      try {
        const client = getClient();
        const stream = client.messages.stream({
          model: getModel(),
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: description || "请为本域生成一组对象类型、关系类型、节点和边。" }],
        });
        registryEntry.controller = stream.controller;
        let acc = "";
        stream.on("text", (delta: string) => {
          acc += delta;
        });
        await stream.finalMessage();

        if (registryEntry.aborted) {
          ctx.streams.emit(streamChannel, { type: "aborted" });
          return { ok: false, aborted: true };
        }

        const parsed = parseBootstrapDraft(acc);
        if (!parsed.ok) {
          ctx.streams.emit(streamChannel, { type: "error", message: parsed.error });
          return { ok: false, reason: "parse-failed", error: parsed.error };
        }
        const draft = parsed.draft;
        const totalSteps = draft.nodeTypes.length + draft.relationTypes.length + draft.nodes.length + draft.edges.length;
        ctx.streams.emit(streamChannel, { type: "start", totalSteps });

        const typeIdByKey = new Map<string, string>();
        let step = 0;
        for (const nt of draft.nodeTypes) {
          try {
            const created = await store.createNodeType({
              companyId,
              domainId,
              key: nt.key,
              displayName: nt.displayName,
              description: nt.description ?? null,
              propertiesSchema: nt.properties,
            });
            typeIdByKey.set(nt.key, created.id);
          } catch (err) {
            ctx.logger.warn("AI bootstrap: createNodeType failed", { key: nt.key, error: String((err as Error)?.message ?? err) });
          }
          step += 1;
          ctx.streams.emit(streamChannel, { type: "progress", step, kind: "node-type", label: nt.displayName });
        }

        for (const rt of draft.relationTypes) {
          try {
            await store.createRelationType({
              companyId,
              domainId,
              key: rt.key,
              displayName: rt.displayName,
              description: rt.description ?? null,
              directed: rt.directed,
            });
          } catch (err) {
            ctx.logger.warn("AI bootstrap: createRelationType failed", { key: rt.key, error: String((err as Error)?.message ?? err) });
          }
          step += 1;
          ctx.streams.emit(streamChannel, { type: "progress", step, kind: "relation-type", label: rt.displayName });
        }

        const nodeIdByKey = new Map<string, string>();
        for (const nd of draft.nodes) {
          try {
            const created = await store.createNode({
              companyId,
              domainId,
              key: nd.key,
              label: nd.label,
              nodeTypeId: typeIdByKey.get(nd.nodeTypeKey) ?? null,
            });
            nodeIdByKey.set(nd.key, created.id);
          } catch (err) {
            ctx.logger.warn("AI bootstrap: createNode failed", { key: nd.key, error: String((err as Error)?.message ?? err) });
          }
          step += 1;
          ctx.streams.emit(streamChannel, { type: "progress", step, kind: "node", label: nd.label });
        }

        let edgeCount = 0;
        for (const e of draft.edges) {
          const sourceNodeId = nodeIdByKey.get(e.sourceKey);
          const targetNodeId = nodeIdByKey.get(e.targetKey);
          if (!sourceNodeId || !targetNodeId) continue;
          try {
            await store.createEdge({ companyId, domainId, sourceNodeId, targetNodeId, relationKey: e.relationKey });
            edgeCount += 1;
          } catch (err) {
            ctx.logger.warn("AI bootstrap: createEdge failed", { error: String((err as Error)?.message ?? err) });
          }
          step += 1;
          ctx.streams.emit(streamChannel, { type: "progress", step, kind: "edge", label: `${e.sourceKey} → ${e.targetKey}` });
        }

        ctx.streams.emit(streamChannel, {
          type: "done",
          counts: {
            nodeTypes: typeIdByKey.size,
            relationTypes: draft.relationTypes.length,
            nodes: nodeIdByKey.size,
            edges: edgeCount,
          },
        });
        await ctx.activity.log({
          companyId,
          message: `AI bootstrap: ${typeIdByKey.size} node types, ${draft.relationTypes.length} relation types, ${nodeIdByKey.size} nodes, ${edgeCount} edges`,
          entityType: "ontology_domain",
          entityId: domainId,
        });
        return { ok: true, counts: { nodeTypes: typeIdByKey.size, relationTypes: draft.relationTypes.length, nodes: nodeIdByKey.size, edges: edgeCount } };
      } catch (err) {
        if (registryEntry.aborted) {
          ctx.streams.emit(streamChannel, { type: "aborted" });
          return { ok: false, aborted: true };
        }
        const message = err instanceof Error ? err.message : String(err);
        ctx.streams.emit(streamChannel, { type: "error", message });
        throw err;
      } finally {
        bootstrapStreamRegistry.delete(bKey);
        ctx.streams.close(streamChannel);
      }
    });

    // Cancel a running `ai-bootstrap-plan`. Same contract as `aide-abort` —
    // looks up the registry entry, flips its `aborted` flag, then aborts the
    // underlying Anthropic stream. Once the LLM call returns and the worker
    // starts inserting rows, abort becomes a no-op (partial writes stay).
    ctx.actions.register("ai-bootstrap-abort", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const entry = bootstrapStreamRegistry.get(bootstrapChannelKey(companyId, domainId));
      if (!entry) return { ok: true, aborted: false };
      entry.aborted = true;
      try {
        entry.controller.abort();
      } catch {
        // Same swallowing rationale as `aide-abort`: a misbehaving controller
        // should not propagate — the registry entry will be cleared by the
        // running action's `finally` block.
      }
      return { ok: true, aborted: true };
    });

    // Synchronously suggest new nodes + edges from a focal node. Two modes:
    //   - "related": free-form suggestions of 2-5 nodes that connect to this
    //     one (any direction). Reuses existing node + relation types.
    //   - "extend": one layer of nodes downstream, following this node's
    //     outgoing relation keys.
    //
    // The LLM call here is bounded (max 5 nodes, 6 edges) so the action
    // should comfortably complete inside the 30s RPC timeout. We still stream
    // from Anthropic so the user gets partial results if the model is slow,
    // but we DO NOT relay the stream to the UI — the action returns the
    // final structured result via the action response.
    ctx.actions.register("ai-extend-from-node", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const nodeId = requireString(params.nodeId, "nodeId");
      const kind: "related" | "extend" = params.kind === "extend" ? "extend" : "related";

      const snapshot = await store.describeDomain(companyId, domainId);
      const allNodes = await store.listNodes(companyId, domainId, 500);
      const focal = allNodes.find((n) => n.id === nodeId);
      if (!focal) throw new Error("Node not found");

      // Build the focal-node context: which relation keys appear on its
      // outgoing / incoming edges in the live graph. This is the most useful
      // shape to feed the LLM because it grounds "where to extend" in real
      // data rather than just the static schema.
      const graph = await store.getGraphSnapshot(companyId, domainId, 500);
      const outgoingRelationKeys = Array.from(new Set(
        graph.edges
          .filter((e) => e.sourceNodeId === focal.id && e.relationKey)
          .map((e) => e.relationKey as string),
      ));
      const incomingRelationKeys = Array.from(new Set(
        graph.edges
          .filter((e) => e.targetNodeId === focal.id && e.relationKey)
          .map((e) => e.relationKey as string),
      ));

      const focalNodeType = snapshot.nodeTypes.find((nt) => nt.id === focal.node_type_id);
      const focalTypeKey = focalNodeType?.key ?? null;
      const systemPrompt = buildBootstrapSystemPrompt({
        domain: snapshot,
        description: null,
        focalNode: {
          key: focal.key,
          label: focal.label,
          nodeTypeKey: focalTypeKey,
          outgoingRelationKeys,
          incomingRelationKeys,
        },
        caps: { nodes: 5, edges: 6 },
      });

      const userPrompt = kind === "extend"
        ? `请沿着 ${focal.key} 的出向关系,生成 1-3 个下游节点及对应边。`
        : `请基于 ${focal.key} 在本域的角色,推荐 2-5 个可能相关的新节点(任何方向)及对应边。`;

      const client = getClient();
      const stream = client.messages.stream({
        model: getModel(),
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      let acc = "";
      stream.on("text", (delta: string) => { acc += delta; });
      await stream.finalMessage();
      const parsed = parseBootstrapDraft(acc);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }

      // Resolve node-type keys: the model may invent keys we already have, but
      // we restrict to types that exist in the domain (extend mode shouldn't
      // create new types).
      const typeKeyByModelKey = new Map<string, string>();
      for (const nt of snapshot.nodeTypes) typeKeyByModelKey.set(nt.key, nt.id);

      const newNodes: Array<{ key: string; label: string; nodeTypeKey: string }> = [];
      const createdNodeIds = new Map<string, string>();
      for (const nd of parsed.draft.nodes) {
        const typeKey = nd.nodeTypeKey || focalTypeKey || "";
        const resolvedTypeId = typeKeyByModelKey.get(typeKey);
        if (!resolvedTypeId) continue; // skip nodes with unknown types
        try {
          const created = await store.createNode({
            companyId,
            domainId,
            key: nd.key,
            label: nd.label,
            nodeTypeId: resolvedTypeId,
          });
          createdNodeIds.set(nd.key, created.id);
          newNodes.push({ key: nd.key, label: nd.label, nodeTypeKey: typeKey });
        } catch (err) {
          ctx.logger.warn("AI extend: createNode failed", { key: nd.key, error: String((err as Error)?.message ?? err) });
        }
      }

      const newEdges: Array<{ sourceKey: string; targetKey: string; relationKey: string }> = [];
      // Edges may reference either a freshly-created node or the focal node.
      // For extend mode we allow self-references back to focal.
      const resolveNodeId = (key: string): string | null => {
        if (key === focal.key) return focal.id;
        return createdNodeIds.get(key) ?? null;
      };
      for (const e of parsed.draft.edges) {
        const sourceId = resolveNodeId(e.sourceKey);
        const targetId = resolveNodeId(e.targetKey);
        if (!sourceId || !targetId) continue;
        try {
          await store.createEdge({ companyId, domainId, sourceNodeId: sourceId, targetNodeId: targetId, relationKey: e.relationKey });
          newEdges.push({ sourceKey: e.sourceKey, targetKey: e.targetKey, relationKey: e.relationKey });
        } catch (err) {
          ctx.logger.warn("AI extend: createEdge failed", { error: String((err as Error)?.message ?? err) });
        }
      }

      return {
        ok: true,
        kind,
        focalKey: focal.key,
        created: { nodes: newNodes, edges: newEdges },
      };
    });

    // Hard-clear the persisted session — backs the "清空会话" button. We
    // intentionally do not throw if the channel is mid-stream; the UI just
    // stops showing those tokens after a page reload.
    ctx.actions.register("aide-clear-session", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const result = await requireAideStore().clearSession(companyId, domainId);
      return result;
    });

    ctx.logger.info("Ontology plugin worker started", { namespace: ctx.db.namespace });
  },

  async onHealth() {
    const ctx = activeContext;
    if (!ctx) {
      return { status: "error" as const, message: "worker context not initialized" };
    }
    return {
      status: "ok" as const,
      message: "ontology worker running",
      details: { namespace: ctx.db.namespace },
    };
  },

  async onApiRequest(input: PluginApiRequestInput): Promise<PluginApiResponse> {
    const ctx = requireContext();
    const store = requireGraphStore();
    const companyId = input.companyId;

    switch (input.routeKey) {
      case "health": {
        return {
          body: {
            status: "ok",
            namespace: ctx.db.namespace,
            checkedAt: new Date().toISOString(),
          },
        };
      }

      case "list-domains": {
        const rows = await ctx.db.query(
          `SELECT id, company_id, slug, display_name, description, status, version
             FROM "${ctx.db.namespace}".ontology_domains
            WHERE company_id = $1
            ORDER BY created_at ASC`,
          [companyId],
        );
        return { body: { domains: rows } };
      }

      case "create-domain": {
        const body = optionalRecord(input.body) ?? {};
        const domain = await store.createDomain({
          companyId,
          slug: requireString(body.slug, "slug"),
          displayName: requireString(body.displayName, "displayName"),
          description: typeof body.description === "string" ? body.description : null,
          category: typeof body.category === "string" ? body.category : undefined,
          metadata: optionalRecord(body.metadata),
        });
        await ctx.activity.log({
          companyId,
          message: `Created ontology domain ${domain.slug}`,
          entityType: "ontology_domain",
          entityId: domain.id,
          metadata: { slug: domain.slug },
        });
        return { status: 201, body: { domain } };
      }

      case "create-node": {
        const body = optionalRecord(input.body) ?? {};
        const node = await store.createNode({
          companyId,
          domainId: requireString(body.domainId, "domainId"),
          key: requireString(body.key, "key"),
          label: requireString(body.label, "label"),
          nodeTypeId: typeof body.nodeTypeId === "string" ? body.nodeTypeId : null,
          properties: optionalRecord(body.properties),
          metadata: optionalRecord(body.metadata),
        });
        return { status: 201, body: { node } };
      }

      case "create-edge": {
        const body = optionalRecord(input.body) ?? {};
        const edge = await store.createEdge({
          companyId,
          domainId: requireString(body.domainId, "domainId"),
          sourceNodeId: requireString(body.sourceNodeId, "sourceNodeId"),
          targetNodeId: requireString(body.targetNodeId, "targetNodeId"),
          relationTypeId: typeof body.relationTypeId === "string" ? body.relationTypeId : null,
          relationKey: typeof body.relationKey === "string" ? body.relationKey : null,
          weight: typeof body.weight === "number" ? body.weight : undefined,
          properties: optionalRecord(body.properties),
          metadata: optionalRecord(body.metadata),
        });
        return { status: 201, body: { edge } };
      }

      case "get-domain": {
        const domain = await store.getDomain(companyId, requireString(input.params.domainId, "domainId"));
        if (!domain) return { status: 404, body: { error: "Domain not found" } };
        return { body: { domain } };
      }

      case "update-domain": {
        const body = optionalRecord(input.body) ?? {};
        const domain = await store.updateDomain(
          companyId,
          requireString(input.params.domainId, "domainId"),
          {
            displayName: typeof body.displayName === "string" ? body.displayName : undefined,
            description: "description" in body ? (body.description as string | null) : undefined,
            status: typeof body.status === "string" ? body.status : undefined,
            metadata: optionalRecord(body.metadata),
          },
        );
        if (!domain) return { status: 404, body: { error: "Domain not found" } };
        await ctx.activity.log({
          companyId,
          message: `Updated ontology domain ${domain.slug} (v${domain.version})`,
          entityType: "ontology_domain",
          entityId: domain.id,
          metadata: { version: domain.version },
        });
        return { body: { domain } };
      }

      case "list-node-types": {
        const nodeTypes = await store.listNodeTypes(
          companyId,
          requireString(queryString(input.query.domainId), "domainId"),
        );
        return { body: { nodeTypes } };
      }

      case "create-node-type": {
        const body = optionalRecord(input.body) ?? {};
        const nodeType = await store.createNodeType({
          companyId,
          domainId: requireString(body.domainId, "domainId"),
          key: requireString(body.key, "key"),
          displayName: requireString(body.displayName, "displayName"),
          description: typeof body.description === "string" ? body.description : null,
          propertiesSchema: optionalRecord(body.propertiesSchema),
          metadata: optionalRecord(body.metadata),
        });
        return { status: 201, body: { nodeType } };
      }

      case "update-node-type": {
        const body = optionalRecord(input.body) ?? {};
        const nodeType = await store.updateNodeType(
          companyId,
          requireString(input.params.nodeTypeId, "nodeTypeId"),
          {
            displayName: typeof body.displayName === "string" ? body.displayName : undefined,
            description: "description" in body ? (body.description as string | null) : undefined,
            propertiesSchema: optionalRecord(body.propertiesSchema),
            metadata: optionalRecord(body.metadata),
          },
        );
        if (!nodeType) return { status: 404, body: { error: "Node type not found" } };
        return { body: { nodeType } };
      }

      case "delete-node-type": {
        // Hard-delete: see GraphStore.deleteNodeType for ON DELETE SET NULL
        // semantics on referencing nodes.
        const body = optionalRecord(input.body) ?? {};
        const id = requireString(input.params?.nodeTypeId ?? body.nodeTypeId, "nodeTypeId");
        const ok = await store.deleteNodeType(companyId, id);
        return { status: ok ? 204 : 404, body: ok ? {} : { error: "Node type not found" } };
      }

      case "list-relation-types": {
        const relationTypes = await store.listRelationTypes(
          companyId,
          requireString(queryString(input.query.domainId), "domainId"),
        );
        return { body: { relationTypes } };
      }

      case "create-relation-type": {
        const body = optionalRecord(input.body) ?? {};
        const relationType = await store.createRelationType({
          companyId,
          domainId: requireString(body.domainId, "domainId"),
          key: requireString(body.key, "key"),
          displayName: requireString(body.displayName, "displayName"),
          description: typeof body.description === "string" ? body.description : null,
          directed: typeof body.directed === "boolean" ? body.directed : undefined,
          metadata: optionalRecord(body.metadata),
        });
        return { status: 201, body: { relationType } };
      }

      case "update-relation-type": {
        const body = optionalRecord(input.body) ?? {};
        const relationType = await store.updateRelationType(
          companyId,
          requireString(input.params.relationTypeId, "relationTypeId"),
          {
            displayName: typeof body.displayName === "string" ? body.displayName : undefined,
            description: "description" in body ? (body.description as string | null) : undefined,
            directed: typeof body.directed === "boolean" ? body.directed : undefined,
            metadata: optionalRecord(body.metadata),
          },
        );
        if (!relationType) return { status: 404, body: { error: "Relation type not found" } };
        return { body: { relationType } };
      }

      case "delete-relation-type": {
        // Hard-delete: see GraphStore.deleteRelationType for ON DELETE SET NULL
        // semantics on referencing edges.
        const body = optionalRecord(input.body) ?? {};
        const id = requireString(input.params?.relationTypeId ?? body.relationTypeId, "relationTypeId");
        const ok = await store.deleteRelationType(companyId, id);
        return { status: ok ? 204 : 404, body: ok ? {} : { error: "Relation type not found" } };
      }

      case "graph-snapshot": {
        const graph = await store.getGraphSnapshot(
          companyId,
          requireString(queryString(input.query.domainId), "domainId"),
          parseDepth(queryString(input.query.nodeLimit)),
        );
        return { body: { graph } };
      }

      case "transition-domain": {
        const body = optionalRecord(input.body) ?? {};
        try {
          const domainId = requireString(input.params.domainId, "domainId");
          const before = await store.getDomain(companyId, domainId);
          const to = requireString(body.to, "to") as DomainLifecycleState;
          const domain = await store.transitionDomainLifecycle(
            companyId,
            domainId,
            to,
            typeof body.actor === "string" ? body.actor : "system",
          );
          if (!domain) return { status: 404, body: { error: "Domain not found" } };

          // Cross-plugin event: announce the domain lifecycle change so other
          // plugins (npc-factory, workflow) can react. Best-effort; a failed
          // emit must never fail the transition itself.
          await emitDomainLifecycleChanged(ctx, companyId, {
            domainId,
            from: before?.lifecycle_state ?? null,
            to,
          });

          // Flagship trigger: when a domain is deprecated, its published nodes
          // are considered stale. Emit a node-stale event per node so downstream
          // plugins (npc-factory) can open remediation workflow runs. Mirrors
          // DigitalStaff domain-6 ontology-node-stale trigger semantics.
          if (to === "deprecated") {
            await emitStaleNodesForDomain(ctx, store, companyId, domainId);
          }

          return { body: { domain } };
        } catch (err) {
          return { status: 422, body: { error: String((err as Error)?.message ?? err) } };
        }
      }

      case "snapshot-domain": {
        const body = optionalRecord(input.body) ?? {};
        const snapshot = await store.snapshotDomain(
          companyId,
          requireString(input.params.domainId, "domainId"),
          typeof body.description === "string" ? body.description : "",
          typeof body.createdBy === "string" ? body.createdBy : "system",
        );
        if (!snapshot) return { status: 404, body: { error: "Domain not found" } };
        return { status: 201, body: { snapshot } };
      }

      case "list-domain-snapshots": {
        const snapshots = await store.listDomainSnapshots(
          companyId,
          requireString(input.params.domainId, "domainId"),
        );
        return { body: { snapshots } };
      }

      case "list-functions": {
        const functions = await store.listFunctions(
          companyId,
          requireString(queryString(input.query.domainId), "domainId"),
        );
        return { body: { functions } };
      }

      case "create-function": {
        const body = optionalRecord(input.body) ?? {};
        const fn = await store.createFunction({
          companyId,
          domainId: requireString(body.domainId, "domainId"),
          name: requireString(body.name, "name"),
          type: typeof body.type === "string" ? (body.type as FunctionType) : undefined,
          version: typeof body.version === "string" ? body.version : undefined,
          description: typeof body.description === "string" ? body.description : undefined,
          inputSchema: optionalRecord(body.inputSchema),
          outputSchema: optionalRecord(body.outputSchema),
          implementation: optionalRecord(body.implementation),
          permissions: optionalRecord(body.permissions),
        });
        return { status: 201, body: { function: fn } };
      }

      case "update-function": {
        const body = optionalRecord(input.body) ?? {};
        const fn = await store.updateFunction(
          companyId,
          requireString(input.params.functionId, "functionId"),
          {
            description: typeof body.description === "string" ? body.description : undefined,
            inputSchema: optionalRecord(body.inputSchema),
            outputSchema: optionalRecord(body.outputSchema),
            implementation: optionalRecord(body.implementation),
            permissions: optionalRecord(body.permissions),
            status: typeof body.status === "string" ? (body.status as FunctionStatus) : undefined,
            metadata: optionalRecord(body.metadata),
          },
        );
        if (!fn) return { status: 404, body: { error: "Function not found" } };
        return { body: { function: fn } };
      }

      case "delete-function": {
        // Soft-delete: see deleteActionType for rationale.
        const body = optionalRecord(input.body) ?? {};
        const id = requireString(input.params?.functionId ?? body.functionId, "functionId");
        const ok = await store.deleteFunction(companyId, id);
        return { status: ok ? 204 : 404, body: ok ? {} : { error: "Function not found" } };
      }

      case "list-audit-logs": {
        const logs = await store.listAuditLogs(
          companyId,
          requireString(queryString(input.query.domainId), "domainId"),
          parseDepth(queryString(input.query.limit)),
        );
        return { body: { auditLogs: logs } };
      }

      case "list-interfaces": {
        const interfaces = await store.listInterfaces(
          companyId,
          requireString(queryString(input.query.domainId), "domainId"),
        );
        return { body: { interfaces } };
      }

      case "create-interface": {
        const body = optionalRecord(input.body) ?? {};
        const iface = await store.createInterface({
          companyId,
          domainId: requireString(body.domainId, "domainId"),
          key: requireString(body.key, "key"),
          displayName: requireString(body.displayName, "displayName"),
          description: typeof body.description === "string" ? body.description : null,
          propertiesSchema: optionalRecord(body.propertiesSchema),
          extendsInterfaces: Array.isArray(body.extendsInterfaces)
            ? (body.extendsInterfaces as string[])
            : undefined,
        });
        return { status: 201, body: { interface: iface } };
      }

      case "update-interface": {
        const body = optionalRecord(input.body) ?? {};
        const iface = await store.updateInterface(
          companyId,
          requireString(input.params.interfaceId, "interfaceId"),
          {
            displayName: typeof body.displayName === "string" ? body.displayName : undefined,
            description: "description" in body ? (body.description as string | null) : undefined,
            propertiesSchema: optionalRecord(body.propertiesSchema),
            extendsInterfaces: Array.isArray(body.extendsInterfaces)
              ? (body.extendsInterfaces as string[])
              : undefined,
            metadata: optionalRecord(body.metadata),
          },
        );
        if (!iface) return { status: 404, body: { error: "Interface not found" } };
        return { body: { interface: iface } };
      }

      case "delete-interface": {
        // Soft-delete: see deleteActionType for rationale.
        const body = optionalRecord(input.body) ?? {};
        const id = requireString(input.params?.interfaceId ?? body.interfaceId, "interfaceId");
        const ok = await store.deleteInterface(companyId, id);
        return { status: ok ? 204 : 404, body: ok ? {} : { error: "Interface not found" } };
      }

      case "list-action-types": {
        const actionTypes = await store.listActionTypes(
          companyId,
          requireString(queryString(input.query.domainId), "domainId"),
        );
        return { body: { actionTypes } };
      }

      case "create-action-type": {
        const body = optionalRecord(input.body) ?? {};
        const actionType = await store.createActionType({
          companyId,
          domainId: requireString(body.domainId, "domainId"),
          key: requireString(body.key, "key"),
          displayName: requireString(body.displayName, "displayName"),
          description: typeof body.description === "string" ? body.description : undefined,
          kind: typeof body.kind === "string" ? (body.kind as ActionKind) : undefined,
          appliesToNodeTypeId:
            typeof body.appliesToNodeTypeId === "string" ? body.appliesToNodeTypeId : null,
          apiContract: optionalRecord(body.apiContract),
          stateTransitions: Array.isArray(body.stateTransitions) ? body.stateTransitions : undefined,
          emitsEvents: Array.isArray(body.emitsEvents) ? body.emitsEvents : undefined,
          requiredPermissions: Array.isArray(body.requiredPermissions)
            ? body.requiredPermissions
            : undefined,
          idempotent: typeof body.idempotent === "boolean" ? body.idempotent : undefined,
        });
        return { status: 201, body: { actionType } };
      }

      case "update-action-type": {
        const body = optionalRecord(input.body) ?? {};
        const actionType = await store.updateActionType(
          companyId,
          requireString(input.params.actionTypeId, "actionTypeId"),
          {
            displayName: typeof body.displayName === "string" ? body.displayName : undefined,
            description: typeof body.description === "string" ? body.description : undefined,
            kind: typeof body.kind === "string" ? (body.kind as ActionKind) : undefined,
            appliesToNodeTypeId:
              "appliesToNodeTypeId" in body ? (body.appliesToNodeTypeId as string | null) : undefined,
            apiContract: optionalRecord(body.apiContract),
            stateTransitions: Array.isArray(body.stateTransitions) ? body.stateTransitions : undefined,
            emitsEvents: Array.isArray(body.emitsEvents) ? body.emitsEvents : undefined,
            requiredPermissions: Array.isArray(body.requiredPermissions)
              ? body.requiredPermissions
              : undefined,
            idempotent: typeof body.idempotent === "boolean" ? body.idempotent : undefined,
            status: typeof body.status === "string" ? (body.status as ActionTypeStatus) : undefined,
            metadata: optionalRecord(body.metadata),
          },
        );
        if (!actionType) return { status: 404, body: { error: "Action type not found" } };
        return { body: { actionType } };
      }

      case "delete-action-type": {
        // Soft-delete: marks is_deleted + deleted_at so audit/lineage keeps
        // resolving. Subsequent list calls skip the row.
        const body = optionalRecord(input.body) ?? {};
        const id = requireString(input.params?.actionTypeId ?? body.actionTypeId, "actionTypeId");
        const ok = await store.deleteActionType(companyId, id);
        return { status: ok ? 204 : 404, body: ok ? {} : { error: "Action type not found" } };
      }

      case "find-path": {
        const path = await store.findPath({
          companyId,
          sourceNodeId: requireString(queryString(input.query.sourceNodeId), "sourceNodeId"),
          targetNodeId: requireString(queryString(input.query.targetNodeId), "targetNodeId"),
          maxDepth: parseDepth(queryString(input.query.maxDepth)),
        });
        return { body: { found: path !== null, path: path ?? [] } };
      }

      case "find-impact": {
        const rawDirection = queryString(input.query.direction);
        const direction: ImpactDirection = rawDirection === "upstream" ? "upstream" : "downstream";
        const impacted = await store.findImpact({
          companyId,
          rootNodeId: requireString(queryString(input.query.rootNodeId), "rootNodeId"),
          direction,
          maxDepth: parseDepth(queryString(input.query.maxDepth)),
        });
        return { body: { direction, count: impacted.length, impacted } };
      }

      case "list-cognition-jobs": {
        const jobs = await store.listCognitionJobs(companyId, parseDepth(queryString(input.query.limit)));
        return { body: { jobs } };
      }

      case "get-cognition-job": {
        const job = await store.getCognitionJob(companyId, requireString(input.params.jobId, "jobId"));
        if (!job) return { status: 404, body: { error: "Cognition job not found" } };
        return { body: { job } };
      }

      case "create-cognition-job": {
        const body = optionalRecord(input.body) ?? {};
        const job = await store.createCognitionJob({
          companyId,
          jobKey: requireString(body.jobKey, "jobKey"),
          rootPath: requireString(body.rootPath, "rootPath"),
          domainId: typeof body.domainId === "string" ? body.domainId : null,
          appName: typeof body.appName === "string" ? body.appName : undefined,
          displayName: typeof body.displayName === "string" ? body.displayName : undefined,
          description: typeof body.description === "string" ? body.description : undefined,
          targetRole: typeof body.targetRole === "string" ? body.targetRole : undefined,
          category: typeof body.category === "string" ? body.category : undefined,
          scale: typeof body.scale === "string" ? (body.scale as CognitionScale) : undefined,
        });
        await ctx.activity.log({
          companyId,
          message: `Created cognition job ${job.job_key}`,
          entityType: "ontology_cognition_job",
          entityId: job.id,
        });
        return { status: 201, body: { job } };
      }

      case "transition-cognition-job": {
        const body = optionalRecord(input.body) ?? {};
        try {
          const job = await store.transitionCognitionStatus(
            companyId,
            requireString(input.params.jobId, "jobId"),
            requireString(body.to, "to") as CognitionJobStatus,
            {
              stageLabel: typeof body.stageLabel === "string" ? body.stageLabel : undefined,
              error: "error" in body ? (body.error as string | null) : undefined,
            },
          );
          if (!job) return { status: 404, body: { error: "Cognition job not found" } };
          return { body: { job } };
        } catch (err) {
          return { status: 422, body: { error: String((err as Error)?.message ?? err) } };
        }
      }

      case "update-cognition-shards": {
        const body = optionalRecord(input.body) ?? {};
        const shards = Array.isArray(body.shards) ? (body.shards as CognitionShard[]) : [];
        const job = await store.updateCognitionShards(
          companyId,
          requireString(input.params.jobId, "jobId"),
          shards,
        );
        if (!job) return { status: 404, body: { error: "Cognition job not found" } };
        return { body: { job } };
      }

      case "set-cognition-draft": {
        const body = optionalRecord(input.body) ?? {};
        const job = await store.setCognitionDraft(companyId, requireString(input.params.jobId, "jobId"), {
          draftPreview: optionalRecord(body.draftPreview),
          seedNodeTypes: Array.isArray(body.seedNodeTypes) ? body.seedNodeTypes : undefined,
          seedRelationTypes: Array.isArray(body.seedRelationTypes) ? body.seedRelationTypes : undefined,
          seedActions: Array.isArray(body.seedActions) ? body.seedActions : undefined,
        });
        if (!job) return { status: 404, body: { error: "Cognition job not found" } };
        return { body: { job } };
      }

      case "ingest-cognition-shard": {
        // Scan the shard files with the AST extractor and store the resulting
        // draft (seed node/relation/action types) + coverage on the job.
        const body = optionalRecord(input.body) ?? {};
        const jobId = requireString(input.params.jobId, "jobId");
        const rawFiles = Array.isArray(body.files) ? body.files : [];
        const files = rawFiles
          .map((f) => optionalRecord(f))
          .filter((f): f is Record<string, unknown> => f !== undefined && typeof f.path === "string")
          .map((f) => ({ path: String(f.path), content: typeof f.content === "string" ? f.content : "" }));
        const draft = extractRepoDraft(files);
        const job = await store.setCognitionDraft(companyId, jobId, {
          draftPreview: { coverage: draft.coverage },
          seedNodeTypes: draft.seedNodeTypes,
          seedRelationTypes: draft.seedRelationTypes,
          seedActions: draft.seedActions,
        });
        if (!job) return { status: 404, body: { error: "Cognition job not found" } };
        await store.recordCognitionCoverage(companyId, jobId, {
          entityCount: draft.coverage.entityCount,
          relationCount: draft.coverage.relationCount,
          actionCount: draft.coverage.actionCount,
          sqlFiles: draft.coverage.sqlFiles,
          apiFiles: draft.coverage.apiFiles,
        });
        return { body: { job, coverage: draft.coverage } };
      }

      case "publish-cognition-job": {
        const body = optionalRecord(input.body) ?? {};
        const jobId = requireString(input.params.jobId, "jobId");
        const targetDomainId = requireString(body.domainId, "domainId");
        try {
          const result = await publishCognitionDraft(ctx, store, companyId, jobId, targetDomainId);
          if (!result) return { status: 404, body: { error: "Cognition job or domain not found" } };
          return { body: result };
        } catch (err) {
          return { status: 422, body: { error: String((err as Error)?.message ?? err) } };
        }
      }

      case "list-datasets": {
        const datasets = await store.listDatasets(
          companyId,
          requireString(queryString(input.query.domainId), "domainId"),
        );
        return { body: { datasets } };
      }

      case "create-dataset": {
        const body = optionalRecord(input.body) ?? {};
        const dataset = await store.createDataset({
          companyId,
          domainId: requireString(body.domainId, "domainId"),
          key: requireString(body.key, "key"),
          name: requireString(body.name, "name"),
          description: typeof body.description === "string" ? body.description : undefined,
          format: typeof body.format === "string" ? (body.format as DatasetFormat) : undefined,
          dataSchema: optionalRecord(body.dataSchema),
          storageConfig: optionalRecord(body.storageConfig),
          syncConfig: optionalRecord(body.syncConfig),
        });
        return { status: 201, body: { dataset } };
      }

      case "update-dataset": {
        const body = optionalRecord(input.body) ?? {};
        const dataset = await store.updateDataset(
          companyId,
          requireString(input.params.datasetId, "datasetId"),
          {
            name: typeof body.name === "string" ? body.name : undefined,
            description: typeof body.description === "string" ? body.description : undefined,
            format: typeof body.format === "string" ? (body.format as DatasetFormat) : undefined,
            dataSchema: optionalRecord(body.dataSchema),
            storageConfig: optionalRecord(body.storageConfig),
            syncConfig: optionalRecord(body.syncConfig),
            lifecycleState:
              typeof body.lifecycleState === "string"
                ? (body.lifecycleState as DatasetLifecycleState)
                : undefined,
            metadata: optionalRecord(body.metadata),
          },
        );
        if (!dataset) return { status: 404, body: { error: "Dataset not found" } };
        return { body: { dataset } };
      }

      case "list-connectors": {
        const connectors = await store.listConnectors(
          companyId,
          requireString(queryString(input.query.domainId), "domainId"),
        );
        return { body: { connectors } };
      }

      case "create-connector": {
        const body = optionalRecord(input.body) ?? {};
        const connector = await store.createConnector({
          companyId,
          domainId: requireString(body.domainId, "domainId"),
          key: requireString(body.key, "key"),
          name: requireString(body.name, "name"),
          connectorType: requireString(body.connectorType, "connectorType") as ConnectorType,
          datasetId: typeof body.datasetId === "string" ? body.datasetId : null,
          config: optionalRecord(body.config),
          syncSchedule: typeof body.syncSchedule === "string" ? body.syncSchedule : null,
          syncStrategy: typeof body.syncStrategy === "string" ? (body.syncStrategy as SyncStrategy) : null,
        });
        return { status: 201, body: { connector } };
      }

      case "update-connector": {
        const body = optionalRecord(input.body) ?? {};
        const connector = await store.updateConnector(
          companyId,
          requireString(input.params.connectorId, "connectorId"),
          {
            name: typeof body.name === "string" ? body.name : undefined,
            datasetId: "datasetId" in body ? (body.datasetId as string | null) : undefined,
            config: optionalRecord(body.config),
            syncSchedule: "syncSchedule" in body ? (body.syncSchedule as string | null) : undefined,
            syncStrategy: "syncStrategy" in body ? (body.syncStrategy as SyncStrategy | null) : undefined,
            status: typeof body.status === "string" ? (body.status as ConnectorStatus) : undefined,
            syncState: optionalRecord(body.syncState),
            lastError: "lastError" in body ? (body.lastError as string | null) : undefined,
            metadata: optionalRecord(body.metadata),
          },
        );
        if (!connector) return { status: 404, body: { error: "Connector not found" } };
        return { body: { connector } };
      }

      case "list-transforms": {
        const transforms = await store.listTransforms(
          companyId,
          requireString(queryString(input.query.domainId), "domainId"),
        );
        return { body: { transforms } };
      }

      case "create-transform": {
        const body = optionalRecord(input.body) ?? {};
        const transform = await store.createTransform({
          companyId,
          domainId: requireString(body.domainId, "domainId"),
          key: requireString(body.key, "key"),
          name: requireString(body.name, "name"),
          description: typeof body.description === "string" ? body.description : undefined,
          transformType:
            typeof body.transformType === "string" ? (body.transformType as TransformType) : undefined,
          inputDatasetIds: Array.isArray(body.inputDatasetIds)
            ? (body.inputDatasetIds as string[])
            : undefined,
          outputDatasetId: typeof body.outputDatasetId === "string" ? body.outputDatasetId : null,
          code: typeof body.code === "string" ? body.code : undefined,
          config: optionalRecord(body.config),
        });
        return { status: 201, body: { transform } };
      }

      case "update-transform": {
        const body = optionalRecord(input.body) ?? {};
        const transform = await store.updateTransform(
          companyId,
          requireString(input.params.transformId, "transformId"),
          {
            name: typeof body.name === "string" ? body.name : undefined,
            description: typeof body.description === "string" ? body.description : undefined,
            transformType:
              typeof body.transformType === "string" ? (body.transformType as TransformType) : undefined,
            inputDatasetIds: Array.isArray(body.inputDatasetIds)
              ? (body.inputDatasetIds as string[])
              : undefined,
            outputDatasetId:
              "outputDatasetId" in body ? (body.outputDatasetId as string | null) : undefined,
            code: typeof body.code === "string" ? body.code : undefined,
            config: optionalRecord(body.config),
            status: typeof body.status === "string" ? (body.status as TransformStatus) : undefined,
            markExecuted: body.markExecuted === true,
            metadata: optionalRecord(body.metadata),
          },
        );
        if (!transform) return { status: 404, body: { error: "Transform not found" } };
        return { body: { transform } };
      }

      case "list-package-installs": {
        const installs = await store.listPackageInstalls(
          companyId,
          requireString(queryString(input.query.domainId), "domainId"),
        );
        return { body: { packageInstalls: installs } };
      }

      case "create-package-install": {
        const body = optionalRecord(input.body) ?? {};
        const install = await store.createPackageInstall({
          companyId,
          domainId: requireString(body.domainId, "domainId"),
          packageId: requireString(body.packageId, "packageId"),
          version: typeof body.version === "string" ? body.version : undefined,
          installedBy: typeof body.installedBy === "string" ? body.installedBy : undefined,
          result: optionalRecord(body.result),
        });
        return { status: 201, body: { packageInstall: install } };
      }

      case "list-business-systems": {
        const systems = await store.listBusinessSystems(companyId, parseDepth(queryString(input.query.limit)));
        return { body: { businessSystems: systems } };
      }

      case "get-business-system": {
        const system = await store.getBusinessSystem(companyId, requireString(input.params.systemId, "systemId"));
        if (!system) return { status: 404, body: { error: "Business system not found" } };
        return { body: { businessSystem: system } };
      }

      case "create-business-system": {
        const body = optionalRecord(input.body) ?? {};
        const system = await store.createBusinessSystem({
          companyId,
          code: requireString(body.code, "code"),
          name: requireString(body.name, "name"),
          description: typeof body.description === "string" ? body.description : undefined,
          domain: typeof body.domain === "string" ? (body.domain as BusinessSystemDomain) : undefined,
          tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
          ontologyDomainId: typeof body.ontologyDomainId === "string" ? body.ontologyDomainId : null,
          ownerRef: typeof body.ownerRef === "string" ? body.ownerRef : null,
          targetRole: typeof body.targetRole === "string" ? body.targetRole : undefined,
          repos: Array.isArray(body.repos) ? body.repos : undefined,
          ontologyBinding: optionalRecord(body.ontologyBinding),
          domainCopilotConfig: optionalRecord(body.domainCopilotConfig),
          domainGovernance: optionalRecord(body.domainGovernance),
          npcTeamConfig: optionalRecord(body.npcTeamConfig),
          metadata: optionalRecord(body.metadata),
        });
        await ctx.activity.log({
          companyId,
          message: `Created business system ${system.code}`,
          entityType: "ontology_business_system",
          entityId: system.id,
        });
        return { status: 201, body: { businessSystem: system } };
      }

      case "update-business-system": {
        const body = optionalRecord(input.body) ?? {};
        const system = await store.updateBusinessSystem(
          companyId,
          requireString(input.params.systemId, "systemId"),
          {
            name: typeof body.name === "string" ? body.name : undefined,
            description: typeof body.description === "string" ? body.description : undefined,
            domain: typeof body.domain === "string" ? (body.domain as BusinessSystemDomain) : undefined,
            status: typeof body.status === "string" ? (body.status as BusinessSystemStatus) : undefined,
            tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
            ontologyDomainId: "ontologyDomainId" in body ? (body.ontologyDomainId as string | null) : undefined,
            targetRole: typeof body.targetRole === "string" ? body.targetRole : undefined,
            repos: Array.isArray(body.repos) ? body.repos : undefined,
            serviceMap: optionalRecord(body.serviceMap),
            npcTeamConfig: optionalRecord(body.npcTeamConfig),
            ontologyBinding: optionalRecord(body.ontologyBinding),
            domainCopilotConfig: optionalRecord(body.domainCopilotConfig),
            domainGovernance: optionalRecord(body.domainGovernance),
            runtimeStats: optionalRecord(body.runtimeStats),
            isTemplateSystem: typeof body.isTemplateSystem === "boolean" ? body.isTemplateSystem : undefined,
            metadata: optionalRecord(body.metadata),
          },
        );
        if (!system) return { status: 404, body: { error: "Business system not found" } };
        return { body: { businessSystem: system } };
      }

      case "list-sub-projects": {
        const subProjects = await store.listSubProjects(
          companyId,
          requireString(queryString(input.query.businessSystemId), "businessSystemId"),
        );
        return { body: { subProjects } };
      }

      case "create-sub-project": {
        const body = optionalRecord(input.body) ?? {};
        const subProject = await store.createSubProject({
          companyId,
          businessSystemId: requireString(body.businessSystemId, "businessSystemId"),
          name: requireString(body.name, "name"),
          code: requireString(body.code, "code"),
          type: typeof body.type === "string" ? (body.type as SubProjectType) : undefined,
          techStack: Array.isArray(body.techStack) ? (body.techStack as string[]) : undefined,
          framework: optionalRecord(body.framework),
          gitRepo: optionalRecord(body.gitRepo),
          apiSpecs: Array.isArray(body.apiSpecs) ? body.apiSpecs : undefined,
          dependencies: Array.isArray(body.dependencies) ? body.dependencies : undefined,
          buildConfig: optionalRecord(body.buildConfig),
          microserviceLayer:
            typeof body.microserviceLayer === "string" ? (body.microserviceLayer as MicroserviceLayer) : null,
          ontologyNodeRef: optionalRecord(body.ontologyNodeRef),
        });
        return { status: 201, body: { subProject } };
      }

      case "update-sub-project": {
        const body = optionalRecord(input.body) ?? {};
        const subProject = await store.updateSubProject(
          companyId,
          requireString(input.params.subProjectId, "subProjectId"),
          {
            name: typeof body.name === "string" ? body.name : undefined,
            type: typeof body.type === "string" ? (body.type as SubProjectType) : undefined,
            techStack: Array.isArray(body.techStack) ? (body.techStack as string[]) : undefined,
            framework: optionalRecord(body.framework),
            gitRepo: optionalRecord(body.gitRepo),
            apiSpecs: Array.isArray(body.apiSpecs) ? body.apiSpecs : undefined,
            dependencies: Array.isArray(body.dependencies) ? body.dependencies : undefined,
            buildConfig: optionalRecord(body.buildConfig),
            status: typeof body.status === "string" ? (body.status as SubProjectStatus) : undefined,
            microserviceLayer:
              "microserviceLayer" in body ? (body.microserviceLayer as MicroserviceLayer | null) : undefined,
            ontologyNodeRef: optionalRecord(body.ontologyNodeRef),
            markActivity: body.markActivity === true,
            metadata: optionalRecord(body.metadata),
          },
        );
        if (!subProject) return { status: 404, body: { error: "Sub-project not found" } };
        return { body: { subProject } };
      }

      case "list-prompt-templates":
        return { body: { promptTemplates: await store.listPromptTemplates(companyId, requireString(queryString(input.query.domainId), "domainId")) } };
      case "create-prompt-template": {
        const b = optionalRecord(input.body) ?? {};
        const promptTemplate = await store.createPromptTemplate({
          companyId,
          domainId: requireString(b.domainId, "domainId"),
          key: requireString(b.key, "key"),
          name: requireString(b.name, "name"),
          description: typeof b.description === "string" ? b.description : undefined,
          template: typeof b.template === "string" ? b.template : undefined,
          parameters: Array.isArray(b.parameters) ? b.parameters : undefined,
        });
        return { status: 201, body: { promptTemplate } };
      }

      case "list-golden-datasets":
        return { body: { goldenDatasets: await store.listGoldenDatasets(companyId, requireString(queryString(input.query.domainId), "domainId")) } };
      case "create-golden-dataset": {
        const b = optionalRecord(input.body) ?? {};
        const goldenDataset = await store.createGoldenDataset({
          companyId,
          domainId: requireString(b.domainId, "domainId"),
          key: requireString(b.key, "key"),
          name: requireString(b.name, "name"),
          description: typeof b.description === "string" ? b.description : undefined,
          entries: Array.isArray(b.entries) ? b.entries : undefined,
        });
        return { status: 201, body: { goldenDataset } };
      }

      case "list-aip-logics":
        return { body: { aipLogics: await store.listAipLogics(companyId, requireString(queryString(input.query.domainId), "domainId")) } };
      case "create-aip-logic": {
        const b = optionalRecord(input.body) ?? {};
        const aipLogic = await store.createAipLogic({
          companyId,
          domainId: requireString(b.domainId, "domainId"),
          key: requireString(b.key, "key"),
          name: requireString(b.name, "name"),
          description: typeof b.description === "string" ? b.description : undefined,
          steps: Array.isArray(b.steps) ? b.steps : undefined,
          inputSchema: optionalRecord(b.inputSchema),
          outputSchema: optionalRecord(b.outputSchema),
          contextConfig: optionalRecord(b.contextConfig),
          promptTemplateId: typeof b.promptTemplateId === "string" ? b.promptTemplateId : null,
          modelConfig: optionalRecord(b.modelConfig),
          tags: Array.isArray(b.tags) ? (b.tags as string[]) : undefined,
        });
        return { status: 201, body: { aipLogic } };
      }
      case "update-aip-logic": {
        const b = optionalRecord(input.body) ?? {};
        const aipLogic = await store.updateAipLogic(companyId, requireString(input.params.logicId, "logicId"), {
          name: typeof b.name === "string" ? b.name : undefined,
          description: typeof b.description === "string" ? b.description : undefined,
          status: typeof b.status === "string" ? (b.status as AipLogicStatus) : undefined,
          steps: Array.isArray(b.steps) ? b.steps : undefined,
          inputSchema: optionalRecord(b.inputSchema),
          outputSchema: optionalRecord(b.outputSchema),
          contextConfig: optionalRecord(b.contextConfig),
          modelConfig: optionalRecord(b.modelConfig),
          tags: Array.isArray(b.tags) ? (b.tags as string[]) : undefined,
          metadata: optionalRecord(b.metadata),
        });
        if (!aipLogic) return { status: 404, body: { error: "AIP logic not found" } };
        return { body: { aipLogic } };
      }

      case "list-evals":
        return { body: { evals: await store.listEvals(companyId, requireString(queryString(input.query.domainId), "domainId")) } };
      case "create-eval": {
        const b = optionalRecord(input.body) ?? {};
        const evalRun = await store.createEval({
          companyId,
          domainId: requireString(b.domainId, "domainId"),
          key: requireString(b.key, "key"),
          name: requireString(b.name, "name"),
          description: typeof b.description === "string" ? b.description : undefined,
          evalType: typeof b.evalType === "string" ? (b.evalType as EvalMetricType) : undefined,
          inputData: optionalRecord(b.inputData) ?? null,
          expectedOutput: optionalRecord(b.expectedOutput) ?? null,
          modelId: typeof b.modelId === "string" ? b.modelId : undefined,
          promptTemplateId: typeof b.promptTemplateId === "string" ? b.promptTemplateId : null,
          goldenDatasetId: typeof b.goldenDatasetId === "string" ? b.goldenDatasetId : null,
        });
        return { status: 201, body: { eval: evalRun } };
      }
      case "update-eval": {
        const b = optionalRecord(input.body) ?? {};
        const evalRun = await store.updateEval(companyId, requireString(input.params.evalId, "evalId"), {
          status: typeof b.status === "string" ? (b.status as EvalStatus) : undefined,
          actualOutput: optionalRecord(b.actualOutput) ?? undefined,
          score: typeof b.score === "number" ? b.score : "score" in b ? null : undefined,
          metrics: optionalRecord(b.metrics),
          metadata: optionalRecord(b.metadata),
        });
        if (!evalRun) return { status: 404, body: { error: "Eval not found" } };
        return { body: { eval: evalRun } };
      }

      case "list-simulation-scenarios":
        return { body: { simulationScenarios: await store.listSimulationScenarios(companyId, requireString(queryString(input.query.domainId), "domainId")) } };
      case "create-simulation-scenario": {
        const b = optionalRecord(input.body) ?? {};
        const scenario = await store.createSimulationScenario({
          companyId,
          domainId: requireString(b.domainId, "domainId"),
          key: requireString(b.key, "key"),
          name: requireString(b.name, "name"),
          description: typeof b.description === "string" ? b.description : undefined,
          initialContext: optionalRecord(b.initialContext),
          strategies: Array.isArray(b.strategies) ? b.strategies : undefined,
        });
        return { status: 201, body: { simulationScenario: scenario } };
      }
      case "update-simulation-scenario": {
        const b = optionalRecord(input.body) ?? {};
        const scenario = await store.updateSimulationScenario(companyId, requireString(input.params.scenarioId, "scenarioId"), {
          status: typeof b.status === "string" ? (b.status as SimulationStatus) : undefined,
          results: optionalRecord(b.results),
          recommendedStrategy: "recommendedStrategy" in b ? (b.recommendedStrategy as string | null) : undefined,
          recommendationReason: typeof b.recommendationReason === "string" ? b.recommendationReason : undefined,
          metadata: optionalRecord(b.metadata),
        });
        if (!scenario) return { status: 404, body: { error: "Simulation scenario not found" } };
        return { body: { simulationScenario: scenario } };
      }

      case "list-umodel-entity-sets":
        return { body: { entitySets: await store.listUModelEntitySets(companyId) } };
      case "create-umodel-entity-set": {
        const b = optionalRecord(input.body) ?? {};
        const entitySet = await store.createUModelEntitySet({
          companyId,
          key: requireString(b.key, "key"),
          name: requireString(b.name, "name"),
          description: typeof b.description === "string" ? b.description : undefined,
          layer: typeof b.layer === "string" ? (b.layer as UModelEntitySetLayer) : undefined,
          parentId: typeof b.parentId === "string" ? b.parentId : null,
        });
        return { status: 201, body: { entitySet } };
      }

      case "list-umodel-entities":
        return { body: { entities: await store.listUModelEntities(companyId, parseDepth(queryString(input.query.limit))) } };
      case "create-umodel-entity": {
        const b = optionalRecord(input.body) ?? {};
        const entity = await store.createUModelEntity({
          companyId,
          key: requireString(b.key, "key"),
          type: requireString(b.type, "type") as UModelEntityType,
          name: requireString(b.name, "name"),
          displayName: typeof b.displayName === "string" ? b.displayName : undefined,
          description: typeof b.description === "string" ? b.description : undefined,
          state: typeof b.state === "string" ? (b.state as UModelEntityState) : undefined,
          attributes: optionalRecord(b.attributes),
          telemetryBindings: Array.isArray(b.telemetryBindings) ? b.telemetryBindings : undefined,
          semanticTags: Array.isArray(b.semanticTags) ? (b.semanticTags as string[]) : undefined,
          agentDescription: optionalRecord(b.agentDescription),
          entitySetId: typeof b.entitySetId === "string" ? b.entitySetId : null,
        });
        return { status: 201, body: { entity } };
      }
      case "update-umodel-entity": {
        const b = optionalRecord(input.body) ?? {};
        const entity = await store.updateUModelEntity(companyId, requireString(input.params.entityId, "entityId"), {
          name: typeof b.name === "string" ? b.name : undefined,
          displayName: typeof b.displayName === "string" ? b.displayName : undefined,
          description: typeof b.description === "string" ? b.description : undefined,
          state: typeof b.state === "string" ? (b.state as UModelEntityState) : undefined,
          attributes: optionalRecord(b.attributes),
          semanticTags: Array.isArray(b.semanticTags) ? (b.semanticTags as string[]) : undefined,
          entitySetId: "entitySetId" in b ? (b.entitySetId as string | null) : undefined,
          metadata: optionalRecord(b.metadata),
        });
        if (!entity) return { status: 404, body: { error: "UModel entity not found" } };
        return { body: { entity } };
      }

      case "list-umodel-links": {
        const entityId = queryString(input.query.entityId);
        return { body: { links: await store.listUModelLinks(companyId, entityId ? String(entityId) : undefined) } };
      }
      case "create-umodel-link": {
        const b = optionalRecord(input.body) ?? {};
        const link = await store.createUModelLink({
          companyId,
          fromEntityId: requireString(b.fromEntityId, "fromEntityId"),
          toEntityId: requireString(b.toEntityId, "toEntityId"),
          type: requireString(b.type, "type") as UModelLinkType,
          direction: typeof b.direction === "string" ? (b.direction as UModelLinkDirection) : undefined,
          strength: typeof b.strength === "number" ? b.strength : undefined,
          properties: optionalRecord(b.properties),
          discoveredFrom: typeof b.discoveredFrom === "string" ? (b.discoveredFrom as UModelDiscoveredFrom) : undefined,
        });
        return { status: 201, body: { link } };
      }

      case "list-umodel-telemetry":
        return { body: { telemetry: await store.listUModelTelemetry(companyId, requireString(queryString(input.query.entityId), "entityId"), parseDepth(queryString(input.query.limit))) } };
      case "record-umodel-telemetry": {
        const b = optionalRecord(input.body) ?? {};
        const telemetry = await store.recordUModelTelemetry({
          companyId,
          entityId: requireString(b.entityId, "entityId"),
          type: requireString(b.type, "type") as UModelTelemetryType,
          payload: optionalRecord(b.payload),
          labels: optionalRecord(b.labels),
          source: typeof b.source === "string" ? b.source : undefined,
        });
        return { status: 201, body: { telemetry } };
      }

      // --- capability acquisition ---------------------------------------
      case "list-capability-gaps": {
        const gaps = await store.listCapabilityGaps(
          companyId,
          queryString(input.query.status),
          parseDepth(queryString(input.query.limit)),
        );
        return { body: { gaps } };
      }

      case "create-capability-gap": {
        const body = optionalRecord(input.body) ?? {};
        const gap = await store.detectCapabilityGap({
          companyId,
          domainId: typeof body.domainId === "string" ? body.domainId : null,
          gapKey: requireString(body.gapKey, "gapKey"),
          title: requireString(body.title, "title"),
          description: typeof body.description === "string" ? body.description : undefined,
          detectedFrom: typeof body.detectedFrom === "string" ? body.detectedFrom : undefined,
          intentRef: typeof body.intentRef === "string" ? body.intentRef : null,
          priority: typeof body.priority === "string" ? body.priority : undefined,
        });
        await emitCapabilityEvent(ctx, "capability-gap-detected", companyId, {
          gapId: gap.id,
          domainId: gap.domain_id,
          title: gap.title,
        });
        return { status: 201, body: { gap } };
      }

      case "list-capability-resolutions": {
        const resolutions = await store.listCapabilityResolutions(
          companyId,
          requireString(input.params.gapId, "gapId"),
        );
        return { body: { resolutions } };
      }

      case "acquire-capability": {
        const body = optionalRecord(input.body) ?? {};
        const cand = optionalRecord(body.candidate) ?? {};
        const candidate: CapabilityCandidate = {
          name: requireString(cand.name, "candidate.name"),
          version: typeof cand.version === "string" ? cand.version : undefined,
          repoUrl: typeof cand.repoUrl === "string" ? cand.repoUrl : undefined,
          license: typeof cand.license === "string" ? cand.license : undefined,
          sizeBytes: typeof cand.sizeBytes === "number" ? cand.sizeBytes : undefined,
          source: (typeof cand.source === "string" ? cand.source : "none") as CapabilityCandidate["source"],
          smokeTestPassed: cand.smokeTestPassed === true,
        };
        const result = await store.acquireCapability(
          companyId,
          requireString(input.params.gapId, "gapId"),
          candidate,
        );
        if (!result) return { status: 404, body: { error: "Capability gap not found" } };
        await emitCapabilityEvent(ctx, "capability-resolution-advanced", companyId, {
          gapId: result.gap.id,
          resolutionId: result.resolution.id,
          stage: result.resolution.stage,
          source: result.resolution.source,
        });
        if (result.acquired && result.functionId) {
          await emitCapabilityEvent(ctx, "capability-acquired", companyId, {
            gapId: result.gap.id,
            functionId: result.functionId,
            domainId: result.gap.domain_id,
          });
          await ctx.activity.log({
            companyId,
            message: `Acquired capability ${candidate.name} for gap ${result.gap.gap_key}`,
            entityType: "ontology_function",
            entityId: result.functionId,
            metadata: { gapId: result.gap.id, source: candidate.source },
          });
        }
        return { body: result };
      }

      default:
        return { status: 404, body: { error: `Unknown ontology route: ${input.routeKey}` } };
    }
  },

  async onShutdown() {
    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
  },
});

let healthTimer: NodeJS.Timeout | null = null;

export default plugin;
runWorker(plugin, import.meta.url);
