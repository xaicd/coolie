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
  type OntologyResourceKind,
} from "@paperclipai/ontology-core/graph/GraphStore.js";
import type { SqlClient } from "@paperclipai/ontology-core/graph/SqlClient.js";
import { generateApiKey } from "@paperclipai/ontology-core/auth/credentials.js";
import { createMemberStore } from "@paperclipai/ontology-core/auth/memberStore.js";
import { knownRoles } from "@paperclipai/ontology-core/auth/members.js";
import { scoreDomainCandidates } from "@paperclipai/ontology-core/graph/linkSuggestions.js";
import { extractRepoDraft } from "@paperclipai/ontology-core/cognition/AstExtractor.js";
import { AideStore, type AideCitation } from "./aide/AideStore.js";
import { SAMPLE_SOURCE, seedSampleDomains } from "./samples/seed.js";
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
import { EDIT_SYSTEM_PROMPT_SUFFIX, parseEditResponse } from "./aide/editOps.js";
import { AIDE_TOOL_SPECS, executeAideTool } from "./aide/agentTools.js";
import { runAideAgent, type AideLoopMessage } from "./aide/agentLoop.js";
import { buildSuggestFieldsPrompt, parseSuggestedFields } from "./aide/suggestFields.js";
import { buildEnrichPrompt, parseEnrichResponse, type EnrichTarget } from "./aide/enrichDescriptions.js";
import { parseSqlDdl } from "@paperclipai/ontology-core/cognition/AstExtractor.js";
import { buildTypeProvenance } from "@paperclipai/ontology-core/provenance.js";
import { readPropertyOrder } from "@paperclipai/ontology-core/propertyOrder.js";
import { architectureToArchifyIr } from "@paperclipai/ontology-core/export/archify.js";
import { ONTOLOGY_TOOLS, callOntologyTool, type OntologyTool } from "@paperclipai/ontology-core/mcp/tools.js";
import {
  normaliseView,
  validateView,
  visibleViews,
  withheldViews,
} from "@paperclipai/ontology-core/views.js";
import type { OntologyViewRow } from "@paperclipai/ontology-core/graph/GraphStore.js";
import { subProjectsFromArchitecture } from "@paperclipai/ontology-core/architecture/subProjectMapping.js";
import {
  buildRelationMetadata,
  documentToWritePlan,
  lintDocument,
  parseDocument,
  validateDocument,
  type DocumentProblem,
  type OntologyDocument,
} from "@paperclipai/ontology-core";
import { parseOpenAPI } from "./legacy/openapiParser.js";
import {
  buildSourceIndex,
  matchDescriptions,
  type SourceEntity,
  type SourceKind,
} from "./legacy/descriptionMatcher.js";
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
  ProposalStatus,
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
} from "@paperclipai/ontology-core/enums.js";

let activeContext: PluginContext | null = null;
let graphStore: GraphStore | null = null;
let aideStore: AideStore | null = null;

const ensuredEnterpriseCompanies = new Set<string>();

/**
 * Ensures the enterprise core domain is present and reconciled for a company.
 * Completely idempotent: if already present and current, it returns immediately.
 */
async function ensureEnterpriseDomain(companyId: string, store: GraphStore): Promise<void> {
  if (!companyId || ensuredEnterpriseCompanies.has(companyId)) return;
  try {
    await seedSampleDomains(companyId, store, { only: ["enterprise-core"] });
    ensuredEnterpriseCompanies.add(companyId);
  } catch (err) {
    activeContext?.logger.warn(`[ontology-worker] ensureEnterpriseDomain failed for ${companyId}: ${err}`);
  }
}

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

  // ── Identity. The previous prompt opened straight into six sections of
  // schema dump with no statement of who the aide was, so "你是谁" had no
  // answer available and the model recited the dump instead.
  lines.push(
    `你是本体域「${snapshot.domain.display_name}」(slug=${snapshot.domain.slug}, v${snapshot.domain.version})的「数字副手」(Digital Aide)。`,
  );
  lines.push(
    "你的职责是帮助使用者理解并运用这个本体域:它建模了什么业务、有哪些对象类型与关系、某个概念是如何建模的、实例数据长什么样。",
  );
  lines.push("");

  // ── Behaviour. This is the part that was missing outright.
  lines.push("## 回答方式");
  lines.push("1. 先用一两句话直接回答用户**实际问的那个问题**。用户问什么就答什么。");
  lines.push(
    "2. 只有用户明确要「概览」「有哪些类型」「这个域建模了什么」时,才展开下面的目录。其他问题不要拿目录当答案。",
  );
  lines.push(
    "3. 凡是涉及**具体字段、具体实例、实例之间的关系**,必须先用工具查真实数据再下结论。目录只有名字和计数,不足以支撑任何结论。",
  );
  lines.push(
    "4. 查不到就说查不到,并说明「本体内未建模此项」;不要编造字段名、实例或数值。",
  );
  lines.push("5. 用中文回答,除非用户用英文提问。");
  lines.push("");

  lines.push("## 可用工具");
  for (const spec of AIDE_TOOL_SPECS) {
    lines.push(`- ${spec.name} — ${spec.description}`);
  }
  lines.push("");

  // ── Compact index. Details deliberately stay behind the tools so the model
  // cannot satisfy a data question without actually looking.
  lines.push("## 本域索引(仅索引,细节请用工具查)");
  lines.push(`对象类型 (${snapshot.nodeTypes.length}):`);
  if (snapshot.nodeTypes.length === 0) lines.push("  (无)");
  for (const nt of snapshot.nodeTypes) {
    const propCount = nt.propertiesSchema && typeof nt.propertiesSchema === "object"
      ? Object.keys(nt.propertiesSchema).length
      : 0;
    lines.push(`  - ${nt.key} | ${nt.displayName} | 属性=${propCount} | 实例=${nt.instanceCount} | id=${nt.id}`);
  }
  lines.push(`关系类型 (${snapshot.relationTypes.length}):`);
  if (snapshot.relationTypes.length === 0) lines.push("  (无)");
  for (const rt of snapshot.relationTypes) {
    lines.push(
      `  - ${rt.key} | ${rt.displayName} | ${rt.directed ? "有向" : "无向"} | 实例=${rt.instanceCount} | id=${rt.id}`,
    );
  }
  lines.push(
    `节点总数=${snapshot.counts.totalNodes} | 关系总数=${snapshot.counts.totalEdges} | 业务系统=${snapshot.counts.businessSystems} | 子项目=${snapshot.counts.subProjects} | 动作类型=${snapshot.counts.actionTypes}`,
  );
  lines.push("");

  // ── Citation contract — unchanged; `extractCitations` depends on it.
  lines.push("## 引用");
  lines.push(
    "回答末尾另起一行附引用,格式:`[cite:kind:id,...]`(逗号分隔)。kind 只能取: node-type | relation-type | node | sub-project | action-type | business-system。",
  );
  lines.push("引用行必须独占一行,放在回答末尾,不要嵌在正文中。");
  lines.push(
    "**只要本轮提到了具体的对象类型、关系类型或实例(包括工具返回的),就必须附上对应的引用行** —— 引用来自工具结果里的 `id` 字段。",
  );
  lines.push("只有整轮回答没有涉及任何具体对象时,才省略引用行(不要输出空的 `[cite:]`)。");

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

/** Who acted, as the host reports it. Identity comes from the caller, not a body. */
function actorRefOf(actor: { actorType?: string; actorId?: string } | undefined): string {
  if (!actor?.actorId) return actor?.actorType === "agent" ? "agent" : "board";
  const kind = actor.actorType === "agent" ? "agent" : actor.actorType === "system" ? "system" : "user";
  return `${kind}:${actor.actorId}`;
}

function optionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

/**
 * Members live next to the credential rules they serve, not in the graph store:
 * they are read on every authenticated request and never take part in a domain.
 */
function memberStore(ctx: PluginContext) {
  return createMemberStore(ctx.db as unknown as SqlClient);
}

/**
 * The pepper that salts key hashes.
 *
 * Required rather than defaulted: a built-in pepper would make every deployment's
 * hashes alike, which is the exact property the salt exists to prevent. Absent
 * means the operator has not opted into issuing keys from here.
 */
async function keyPepper(ctx: PluginContext, companyId: string): Promise<string | undefined> {
  const config = await ctx.config.get(companyId);
  const pepper = config.keyPepper ?? config.ONTOLOGY_KEY_PEPPER;
  return typeof pepper === "string" && pepper.length > 0 ? pepper : undefined;
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
    // `propertiesSchema` was dropped here even though `parseSqlDdl` had already
    // extracted the columns and their comments — so a table imported through the
    // cognition path arrived with no fields at all. `origin` and `sourceFiles`
    // were dropped the same way, which is why the schema index could only sort
    // these types by name.
    await store.createNodeType({
      companyId,
      domainId: targetDomainId,
      key,
      displayName: str(nt.displayName ?? nt.label ?? key, key),
      description: str(nt.description) || null,
      layer: (str(nt.layer) as NodeLayer) || undefined,
      propertiesSchema: optionalRecord(nt.properties ?? nt.propertiesSchema),
      // The order the scan declared. Without it the type is `sorted`, which is
      // how the source order was being lost on the way to the schema page.
      propertyOrder: optionalStringArray(nt.propertyOrder),
      metadata: buildTypeProvenance(
        optionalRecord(nt.origin) as never,
        Array.isArray(nt.sourceFiles) ? (nt.sourceFiles as string[]) : undefined,
      ),
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

// ---------------------------------------------------------------------------
// Mutation bridge — one implementation, two surfaces
// ---------------------------------------------------------------------------
//
// The plugin exposes mutations on two different surfaces:
//
//   A. `ctx.actions.register(key, fn)` — reached by `usePluginAction(key)` in
//      the plugin UI via `POST /api/plugins/:id/actions/:key`. The host spreads
//      the hook argument into the handler's params and adds `companyId`
//      (server/src/routes/plugins.ts — actionParamsWithAuthorizedCompanyScope).
//   B. `onApiRequest(input)` — reached through the manifest `apiRoutes`, which
//      hands over separate `params` (path) and `body` (JSON) objects.
//
// The UI calls mutations in BOTH shapes, so every handler normalises through
// `readMutationCall` instead of reading raw params. Keeping a single handler
// per mutation means the two surfaces cannot drift apart again — which is
// exactly how `update-node-type` and friends ended up registered on B but not
// on A, leaving the cockpit's "确认应用" with nothing to call.

interface MutationCall {
  companyId: string;
  /**
   * Merged field bag. Nested `{ params, body }` calls (cockpit dispatch) and
   * flat calls (import wizard, seed actions) both land here, so handlers read
   * `call.fields.<field>` regardless of which surface invoked them.
   */
  fields: Record<string, unknown>;
}

interface MutationOutcome {
  status: number;
  payload: Record<string, unknown>;
}

type MutationHandler = (
  store: GraphStore,
  ctx: PluginContext,
  call: MutationCall,
) => Promise<MutationOutcome>;

function readMutationCall(params: Record<string, unknown>): MutationCall {
  const companyId = requireString(params.companyId, "companyId");
  // Presence of the envelope keys decides the shape; an empty `body: {}` must
  // not fall back to the raw params or the real fields get lost.
  const isNested = "params" in params || "body" in params;
  const fields = isNested
    ? { ...optionalRecord(params.params), ...optionalRecord(params.body) }
    : { ...params };
  return { companyId, fields };
}

/** Same normalisation for the manifest `apiRoutes` surface. */
function httpMutationCall(companyId: string, input: PluginApiRequestInput): MutationCall {
  return {
    companyId,
    fields: { ...optionalRecord(input.params), ...optionalRecord(input.body) },
  };
}

const ok = (payload: Record<string, unknown>): MutationOutcome => ({ status: 200, payload });
const created = (payload: Record<string, unknown>): MutationOutcome => ({ status: 201, payload });
const noContent = (): MutationOutcome => ({ status: 204, payload: {} });
const notFound = (error: string): MutationOutcome => ({ status: 404, payload: { error } });
const badRequest = (error: string): MutationOutcome => ({ status: 400, payload: { error } });

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalStringOrNull(value: unknown): string | null | undefined {
  return typeof value === "string" || value === null ? (value as string | null) : undefined;
}

/**
 * Carry out what a proposal asked for.
 *
 * Deliberately a small, closed set of operations routed through the same store
 * methods a direct edit uses — the point of the proposal is the gate in front of
 * the write, not a second implementation of it. An operation the applier does not
 * know how to perform is an error rather than a no-op, so a proposal cannot be
 * marked applied without anything having happened.
 */
async function applyProposalOperation(
  store: GraphStore,
  ctx: PluginContext,
  companyId: string,
  domainId: string,
  operation: string,
  op: Record<string, unknown>,
): Promise<{ schemaVersion: number; entityId?: string }> {
  const nodeTypeId = optionalString(op.nodeTypeId);
  const propertiesSchema = optionalRecord(op.propertiesSchema);
  const propertyOrder = optionalStringArray(op.propertyOrder);
  const propertyRenames = optionalStringMap(op.propertyRenames);
  const displayName = optionalString(op.displayName);
  const description = typeof op.description === "string" ? op.description : undefined;

  switch (operation) {
    case "update-node-type": {
      if (!nodeTypeId) throw new Error("update-node-type needs nodeTypeId");
      const nodeType = await store.updateNodeType(companyId, nodeTypeId, {
        ...(displayName === undefined ? {} : { displayName }),
        ...(description === undefined ? {} : { description }),
        ...(propertiesSchema === undefined ? {} : { propertiesSchema }),
        ...(propertyOrder === undefined ? {} : { propertyOrder }),
        ...(propertyRenames === undefined ? {} : { propertyRenames }),
      });
      if (!nodeType) throw new Error("Node type not found");
      // `updateNodeType` bumps the domain, so the version is the one it produced.
      return { schemaVersion: await currentSchemaVersion(store, companyId, domainId) };
    }
    case "create-node-type": {
      const created = await store.createNodeType({
        companyId,
        domainId,
        key: requireString(op.key, "payload.key"),
        displayName: requireString(op.displayName, "payload.displayName"),
        description: optionalString(op.description) ?? null,
        propertiesSchema,
        propertyOrder,
      });
      return { schemaVersion: await currentSchemaVersion(store, companyId, created.domain_id) };
    }
    // --- facts ------------------------------------------------------------
    //
    // A fact change does not move the schema version, and that is the point:
    // the version answers "which model did I read", so publishing an instance
    // must not make it look as though the model changed. The proposal still goes
    // through the same gate and the same audit trail as a schema change.
    case "create-node": {
      const type = await requireNodeTypeByKey(store, companyId, domainId, requireString(op.nodeTypeKey, "payload.nodeTypeKey"));
      const key = requireString(op.key, "payload.key");
      const node = await store.createNode({
        companyId,
        domainId,
        key,
        label: optionalString(op.label) ?? key,
        nodeTypeId: type.id,
        properties: optionalRecord(op.properties),
      });
      return { schemaVersion: await currentSchemaVersion(store, companyId, domainId), entityId: node.id };
    }
    case "update-node": {
      const node = await requireNodeByKey(store, companyId, domainId, requireString(op.nodeKey, "payload.nodeKey"));
      const updated = await store.updateNode(companyId, node.id, {
        ...(optionalString(op.label) === undefined ? {} : { label: optionalString(op.label)! }),
        ...(op.properties === undefined ? {} : { properties: optionalRecord(op.properties) ?? {} }),
      });
      if (!updated) throw new Error("Node not found");
      return { schemaVersion: await currentSchemaVersion(store, companyId, domainId), entityId: updated.id };
    }
    case "create-edge": {
      const source = await requireNodeByKey(store, companyId, domainId, requireString(op.sourceKey, "payload.sourceKey"));
      const target = await requireNodeByKey(store, companyId, domainId, requireString(op.targetKey, "payload.targetKey"));
      const relationKey = optionalString(op.relationKey);
      if (relationKey) {
        // A relation key that does not exist would create an untyped edge and
        // look, to everyone reading the graph, like the relation was known.
        const relations = await store.listRelationTypes(companyId, domainId);
        if (!relations.some((relation) => relation.key === relationKey)) {
          throw new Error(`No such relation type in this domain: ${relationKey}`);
        }
      }
      const edge = await store.createEdge({
        companyId,
        domainId,
        sourceNodeId: source.id,
        targetNodeId: target.id,
        relationKey: relationKey ?? null,
      });
      return { schemaVersion: await currentSchemaVersion(store, companyId, domainId), entityId: edge.id };
    }
    default:
      void ctx;
      throw new Error(`Unsupported proposal operation: ${operation}`);
  }
}

/** A node type by key: a caller names keys, never internal ids. */
async function requireNodeTypeByKey(
  store: GraphStore,
  companyId: string,
  domainId: string,
  key: string,
): Promise<{ id: string }> {
  const types = await store.listNodeTypes(companyId, domainId);
  const found = types.find((type) => type.key === key);
  if (!found) throw new Error(`No such object type in this domain: ${key}`);
  return found;
}

async function requireNodeByKey(
  store: GraphStore,
  companyId: string,
  domainId: string,
  key: string,
): Promise<{ id: string }> {
  const node = await store.getNodeByKey(companyId, domainId, key);
  if (!node) throw new Error(`No such node in this domain: ${key}`);
  return node;
}

/** The domain's version as the store currently reports it. */
async function currentSchemaVersion(
  store: GraphStore,
  companyId: string,
  domainId: string,
): Promise<number> {
  const domain = await store.getDomain(companyId, domainId);
  return domain?.schema_version ?? 0;
}

/**
 * Load a domain's architecture and turn it into an Archify diagram.
 *
 * The views are derived from the material rather than authored: "which services
 * run where" is a question the data answers, and a view that named services the
 * domain does not have would be a lie in the tab bar.
 */
async function buildArchitectureDiagram(
  store: GraphStore,
  companyId: string,
  domainId: string,
): Promise<Record<string, unknown>> {
  const [domain, rows] = await Promise.all([
    store.getDomain(companyId, domainId),
    store.listDomainSubProjects(companyId, domainId),
  ]);

  const services = rows.map((row) => ({
    code: row.code,
    name: row.name,
    microserviceLayer: row.microservice_layer,
    type: row.type,
    techStack: row.tech_stack,
    buildConfig: row.build_config,
    metadata: row.metadata,
    dependencies: Array.isArray(row.dependencies)
      ? (row.dependencies as Array<{ toServiceKey?: string | null; targetHint?: string; type?: string }>)
      : [],
  }));

  const byLayer = new Map<string, string[]>();
  for (const service of services) {
    const layer = service.microserviceLayer ?? "未分层";
    byLayer.set(layer, [...(byLayer.get(layer) ?? []), service.code]);
  }
  const byEnv = new Map<string, string[]>();
  for (const service of services) {
    const deploy = (service.metadata?.deploy ?? service.buildConfig?.deploy ?? {}) as Record<string, unknown>;
    const envs = Array.isArray(deploy.envs) ? (deploy.envs as string[]) : [];
    const key = envs[0] ?? "未声明环境";
    byEnv.set(key, [...(byEnv.get(key) ?? []), service.code]);
  }

  const views = [
    { id: "runtime", label: "运行架构", focus: services.map((s) => s.code), note: "谁调用谁" },
    ...[...byEnv.entries()]
      .filter(([env]) => env !== "未声明环境")
      .map(([env, focus]) => ({ id: `env-${env}`, label: `部署架构 · ${env}`, focus, note: "声明部署在该环境的服务" })),
    ...[...byLayer.entries()]
      .sort()
      .map(([layer, focus]) => ({ id: `layer-${layer}`, label: `分层 · ${layer}`, focus, note: "该层的服务" })),
  ];

  return architectureToArchifyIr(services, {
    title: `${domain?.display_name ?? "本体域"} · 运行架构`,
    subtitle: "由本体域的架构原料生成(服务 + 依赖 + 部署事实)",
    views,
  }) as unknown as Record<string, unknown>;
}

/**
 * A one-line human summary of a tool result, for the agent's transcript.
 *
 * The structured payload is what the model reasons over; this is what makes the
 * call readable in a log or in the chat. It counts collections rather than
 * dumping them.
 */
function summariseToolResult(tool: OntologyTool, data: unknown): string {
  if (data && typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    const counted = entries
      .filter(([, value]) => Array.isArray(value))
      .map(([key, value]) => `${key}: ${(value as unknown[]).length}`);
    if (counted.length > 0) return `${tool.displayName} — ${counted.join(", ")}`;
    if ("path" in data) {
      const path = (data as { path: unknown[] | null }).path;
      return path === null ? `${tool.displayName} — 无路径` : `${tool.displayName} — ${path.length} 跳`;
    }
  }
  return tool.displayName;
}

/**
 * What an actor may open, and what they may not.
 *
 * Reporting the withheld half matters: a user who cannot find a view someone
 * mentioned should learn it exists and is restricted, not conclude they imagined
 * it. The actor defaults to the board, which sees everything shared.
 */
/**
 * The two actor classes the host reports, mapped to the roles this workshop
 * understands. A `user` is board context and holds the human roles; an `agent`
 * holds the agent role. Nothing else is trusted as identity.
 */
function actorKindOf(actor: { actorType?: string } | undefined): "board" | "agent" {
  return actor?.actorType === "agent" ? "agent" : "board";
}

function describeViewsFor(
  rows: OntologyViewRow[],
  actorKind: "board" | "agent",
  actor: string | undefined,
): {
  views: OntologyViewRow[];
  withheld: Array<{ id: string; key: string; name: string }>;
} {
  // The roles an actor holds come from what the host says they are, not from a
  // blanket grant: giving both actor classes every role would make a restricted
  // view visible to everyone, which is a restriction in name only.
  const audience = {
    roles: actorKind === "agent" ? ["agent"] : ["modeler", "reviewer", "viewer"],
    ...(actor ? { actor } : {}),
  };
  return {
    views: visibleViews(rows, audience),
    withheld: withheldViews(rows, audience).map((view) => ({
      id: view.id,
      key: view.key,
      name: view.name,
    })),
  };
}

/** The HTTP half of `create-view`, sharing the validation with the bridge half. */
async function createViewFromHttp(
  store: GraphStore,
  ctx: PluginContext,
  companyId: string,
  input: PluginApiRequestInput,
): Promise<OntologyViewRow> {
  const body = optionalRecord(input.body) ?? {};
  const candidate = normaliseView({
    key: requireString(body.key, "key"),
    name: requireString(body.name, "name"),
    description: optionalString(body.description),
    kind: optionalString(body.kind) as never,
    config: optionalRecord(body.config),
    visibility: optionalString(body.visibility) as never,
    roles: Array.isArray(body.roles) ? (body.roles as never) : [],
    // The creator is the authenticated actor, not a field the caller supplies.
    created_by: input.actor.actorId || "user",
  });
  const validation = validateView(candidate);
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  const view = await store.createView({
    companyId,
    domainId: requireString(input.params.domainId ?? body.domainId, "domainId"),
    ...candidate,
    createdBy: candidate.created_by,
  });
  await ctx.activity.log({
    companyId,
    message: `Saved view ${view.key} (${view.visibility})`,
    entityType: "ontology_view",
    entityId: view.id,
  });
  return view;
}

/** A `string -> string` map, or undefined; anything else is a caller bug. */
function optionalStringMap(value: unknown): Record<string, string> | undefined {
  const record = optionalRecord(value);
  if (!record) return undefined;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (typeof raw === "string") out[key] = raw;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** A JSON array field, or an empty list — a missing scan is not an error. */
function optionalArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** `propertiesSchema` must be an object; anything else is a caller bug. */
function requireRecordOrThrow(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  const record = optionalRecord(value);
  if (!record) throw new Error(`${field} must be a JSON object`);
  return record;
}

/**
 * Record a change to the ontology's own model.
 *
 * Schema changes are the ontology's history, and "who changed the model, and
 * when" has to be answerable — all the more so once an external consumer pins a
 * schema version and reasons over what it read. Only business-system creation
 * used to log, so creating, editing and deleting object and relation types left
 * no trace at all: a property could be renamed and nothing recorded it.
 */
async function logSchemaChange(
  ctx: PluginContext,
  companyId: string,
  message: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  try {
    await ctx.activity.log({ companyId, message, entityType, entityId });
  } catch (err) {
    // The change itself already succeeded. Losing the audit line must not fail
    // it, but it must not disappear silently either.
    ctx.logger.warn("Failed to write schema audit entry", {
      error: String((err as Error)?.message ?? err),
      entityType,
      entityId,
    });
  }
}

const updateNodeTypeMutation: MutationHandler = async (store, _ctx, call) => {
  const nodeType = await store.updateNodeType(
    call.companyId,
    requireString(call.fields.nodeTypeId, "nodeTypeId"),
    {
      displayName: optionalString(call.fields.displayName),
      description: "description" in call.fields
        ? optionalStringOrNull(call.fields.description)
        : undefined,
      propertiesSchema: call.fields.propertiesSchema === undefined
        ? undefined
        : requireRecordOrThrow(call.fields.propertiesSchema, "propertiesSchema"),
      propertyOrder: optionalStringArray(call.fields.propertyOrder),
      metadata: optionalRecord(call.fields.metadata),
      // Stating which removed field became which added one is what makes the
      // existing instance values follow the rename. A diff cannot tell a rename
      // from a delete plus an add, so only the caller can say.
      propertyRenames: optionalStringMap(call.fields.propertyRenames),
      // The explicit "I know values will be orphaned" — without it the store
      // refuses the edit rather than leaving values unreachable.
      allowOrphaned: call.fields.allowOrphaned === true,
    },
  );
  if (!nodeType) return notFound("Node type not found");
  await logSchemaChange(
    _ctx,
    call.companyId,
    `更新对象类型 ${nodeType.key}`,
    "ontology_node_type",
    nodeType.id,
  );
  return ok({ nodeType });
};

const deleteNodeTypeMutation: MutationHandler = async (store, _ctx, call) => {
  // Hard-delete: see GraphStore.deleteNodeType for ON DELETE SET NULL
  // semantics on referencing nodes.
  const nodeTypeId = requireString(call.fields.nodeTypeId, "nodeTypeId");
  const okDeleted = await store.deleteNodeType(call.companyId, nodeTypeId);
  if (!okDeleted) return notFound("Node type not found");
  await logSchemaChange(_ctx, call.companyId, `删除对象类型 ${nodeTypeId}`, "ontology_node_type", nodeTypeId);
  return noContent();
};

const updateRelationTypeMutation: MutationHandler = async (store, _ctx, call) => {
  const relationType = await store.updateRelationType(
    call.companyId,
    requireString(call.fields.relationTypeId, "relationTypeId"),
    {
      displayName: optionalString(call.fields.displayName),
      description: "description" in call.fields
        ? optionalStringOrNull(call.fields.description)
        : undefined,
      directed: typeof call.fields.directed === "boolean" ? call.fields.directed : undefined,
      metadata: optionalRecord(call.fields.metadata),
    },
  );
  if (!relationType) return notFound("Relation type not found");
  await logSchemaChange(
    _ctx,
    call.companyId,
    `更新关系类型 ${relationType.key}`,
    "ontology_relation_type",
    relationType.id,
  );
  return ok({ relationType });
};

const deleteRelationTypeMutation: MutationHandler = async (store, _ctx, call) => {
  // Hard-delete: see GraphStore.deleteRelationType for ON DELETE SET NULL
  // semantics on referencing edges.
  const relationTypeId = requireString(call.fields.relationTypeId, "relationTypeId");
  const okDeleted = await store.deleteRelationType(call.companyId, relationTypeId);
  if (!okDeleted) return notFound("Relation type not found");
  await logSchemaChange(
    _ctx,
    call.companyId,
    `删除关系类型 ${relationTypeId}`,
    "ontology_relation_type",
    relationTypeId,
  );
  return noContent();
};

const createFunctionMutation: MutationHandler = async (store, _ctx, call) => {
  const fn = await store.createFunction({
    companyId: call.companyId,
    domainId: requireString(call.fields.domainId, "domainId"),
    name: requireString(call.fields.name, "name"),
    type: optionalString(call.fields.type) as FunctionType | undefined,
    version: optionalString(call.fields.version),
    description: optionalString(call.fields.description),
    inputSchema: optionalRecord(call.fields.inputSchema),
    outputSchema: optionalRecord(call.fields.outputSchema),
    implementation: optionalRecord(call.fields.implementation),
    permissions: optionalRecord(call.fields.permissions),
  });
  return created({ function: fn });
};

const deleteFunctionMutation: MutationHandler = async (store, _ctx, call) => {
  // Soft-delete: see deleteActionType for rationale.
  const okDeleted = await store.deleteFunction(
    call.companyId,
    requireString(call.fields.functionId, "functionId"),
  );
  return okDeleted ? noContent() : notFound("Function not found");
};

const createInterfaceMutation: MutationHandler = async (store, _ctx, call) => {
  const iface = await store.createInterface({
    companyId: call.companyId,
    domainId: requireString(call.fields.domainId, "domainId"),
    key: requireString(call.fields.key, "key"),
    displayName: requireString(call.fields.displayName, "displayName"),
    description: typeof call.fields.description === "string" ? call.fields.description : null,
    propertiesSchema: call.fields.propertiesSchema === undefined
      ? undefined
      : requireRecordOrThrow(call.fields.propertiesSchema, "propertiesSchema"),
    extendsInterfaces: Array.isArray(call.fields.extendsInterfaces)
      ? (call.fields.extendsInterfaces as string[])
      : undefined,
  });
  return created({ interface: iface });
};

const deleteInterfaceMutation: MutationHandler = async (store, _ctx, call) => {
  // Soft-delete: see deleteActionType for rationale.
  const okDeleted = await store.deleteInterface(
    call.companyId,
    requireString(call.fields.interfaceId, "interfaceId"),
  );
  return okDeleted ? noContent() : notFound("Interface not found");
};

const createActionTypeMutation: MutationHandler = async (store, _ctx, call) => {
  const actionType = await store.createActionType({
    companyId: call.companyId,
    domainId: requireString(call.fields.domainId, "domainId"),
    key: requireString(call.fields.key, "key"),
    displayName: requireString(call.fields.displayName, "displayName"),
    description: optionalString(call.fields.description),
    kind: optionalString(call.fields.kind) as ActionKind | undefined,
    appliesToNodeTypeId:
      typeof call.fields.appliesToNodeTypeId === "string" ? call.fields.appliesToNodeTypeId : null,
    apiContract: optionalRecord(call.fields.apiContract),
    stateTransitions: Array.isArray(call.fields.stateTransitions)
      ? call.fields.stateTransitions
      : undefined,
    emitsEvents: Array.isArray(call.fields.emitsEvents) ? call.fields.emitsEvents : undefined,
    requiredPermissions: Array.isArray(call.fields.requiredPermissions)
      ? call.fields.requiredPermissions
      : undefined,
    idempotent:
      typeof call.fields.idempotent === "boolean" ? call.fields.idempotent : undefined,
  });
  return created({ actionType });
};

const deleteActionTypeMutation: MutationHandler = async (store, _ctx, call) => {
  // Soft-delete: marks is_deleted + deleted_at so audit/lineage keeps
  // resolving. Subsequent list calls skip the row.
  const okDeleted = await store.deleteActionType(
    call.companyId,
    requireString(call.fields.actionTypeId, "actionTypeId"),
  );
  return okDeleted ? noContent() : notFound("Action type not found");
};

const runTransformMutation: MutationHandler = async (store, ctx, call) => {
  const { runTransform } = await import("@paperclipai/ontology-core/transform/TransformRunner.js");
  // Accept transformId/domainId from either the path args or the body.
  const transformId =
    (optionalString(call.fields.transformId) ?? "").trim();
  const domainId = (optionalString(call.fields.domainId) ?? "").trim();
  if (!transformId || !domainId) {
    return badRequest("run-transform requires transformId and domainId");
  }
  const result = await runTransform(store, ctx.db, call.companyId, domainId, transformId);
  return ok({ result });
};

/**
 * LLM-driven entity/relation extraction from free-form text (PRD, Word, PDF,
 * meeting notes). The import wizard's "文档" sub-tab calls this to show the
 * model's proposed node types / relation types before publishing the domain.
 */
const extractDocumentMutation: MutationHandler = async (_store, _ctx, call) => {
  const documentText = requireString(call.fields.documentText, "documentText");
  const filename = typeof call.fields.filename === "string" ? call.fields.filename : "(unnamed)";
  const client = getClient();
  const systemPrompt = [
    "You are an ontology extractor. Given a free-form document,",
    "return a JSON object with `nodeTypes`, `relationTypes`, and",
    "`actions`. Each node type: `{ key, displayName, description, properties: { name: { type, description } } }`.",
    "Each relation type: `{ key, displayName, sourceNodeTypeKey, targetNodeTypeKey }`.",
    "Each action: `{ key, method, endpoint, description }`.",
    "Use only types that are explicitly named or unambiguously",
    "implied by the document. Output JSON only — no prose, no markdown.",
  ].join(" ");
  const response = await client.messages.create({
    model: getModel(),
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Document filename: ${filename}\n\n${documentText}`,
      },
    ],
  });
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  // The LLM sometimes wraps the JSON in ```json fences. Strip
  // them so JSON.parse doesn't have to.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  let parsed: {
    nodeTypes?: Array<{
      key: string;
      displayName?: string;
      description?: string;
      properties?: Record<string, { type?: string; description?: string }>;
    }>;
    relationTypes?: Array<{
      key: string;
      displayName?: string;
      sourceNodeTypeKey: string;
      targetNodeTypeKey: string;
    }>;
    actions?: Array<{
      key: string;
      method: string;
      endpoint: string;
      description?: string;
    }>;
  } = {};
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // The LLM sometimes returns partial JSON or includes prose.
    // Return the raw text so the wizard can show "模型输出无法
    // 解析为 JSON,是否手动编辑?" instead of failing silently.
    return {
      status: 422,
      payload: {
        error: "Model output is not valid JSON",
        raw: text,
      },
    };
  }
  return ok({
    nodeTypes: parsed.nodeTypes ?? [],
    relationTypes: parsed.relationTypes ?? [],
    actions: parsed.actions ?? [],
  });
};

const createBusinessSystemMutation: MutationHandler = async (store, ctx, call) => {
  const system = await store.createBusinessSystem({
    companyId: call.companyId,
    code: requireString(call.fields.code, "code"),
    name: requireString(call.fields.name, "name"),
    description: optionalString(call.fields.description),
    domain: optionalString(call.fields.domain) as BusinessSystemDomain | undefined,
    tags: Array.isArray(call.fields.tags) ? (call.fields.tags as string[]) : undefined,
    ontologyDomainId:
      typeof call.fields.ontologyDomainId === "string" ? call.fields.ontologyDomainId : null,
    ownerRef: typeof call.fields.ownerRef === "string" ? call.fields.ownerRef : null,
    targetRole: optionalString(call.fields.targetRole),
    repos: Array.isArray(call.fields.repos) ? call.fields.repos : undefined,
    ontologyBinding: optionalRecord(call.fields.ontologyBinding),
    domainCopilotConfig: optionalRecord(call.fields.domainCopilotConfig),
    domainGovernance: optionalRecord(call.fields.domainGovernance),
    npcTeamConfig: optionalRecord(call.fields.npcTeamConfig),
    metadata: optionalRecord(call.fields.metadata),
  });
  await ctx.activity.log({
    companyId: call.companyId,
    message: `Created business system ${system.code}`,
    entityType: "ontology_business_system",
    entityId: system.id,
  });
  // Cross-plugin NPC bridge — phase 7. The npc-factory plugin
  // listens for this and can spawn an NPC team tailored to the
  // new business system (DS does this via hatchOntologyAppTeam).
  // Best-effort: an emit failure must not roll back the create.
  try {
    await ctx.events.emit("business-system-created", call.companyId, {
      businessSystemId: system.id,
      code: system.code,
      name: system.name,
      ontologyDomainId: system.ontology_domain_id,
    });
  } catch (err) {
    ctx.logger.warn("Failed to emit business-system-created", {
      error: String((err as Error)?.message ?? err),
      businessSystemId: system.id,
    });
  }
  return created({ businessSystem: system });
};

/**
 * Mutations the plugin UI reaches through `usePluginAction(key)` and that the
 * manifest `apiRoutes` also expose. Both surfaces dispatch into these same
 * handlers. `tests/action-parity.spec.ts` asserts every `usePluginAction` key
 * in `src/ui/**` is reachable, so this table is the single source of truth.
 */
/**
 * Write a proposal. Changes nothing until it is decided.
 *
 * This is the operation an agent is allowed to perform: a request for review is
 * not a change, and without it "AI 是提案者" had no path through the API — an
 * agent could only read, and the UI was the only proposer.
 */
const createProposalMutation: MutationHandler = async (store, ctx, call) => {
  const domainId = requireString(call.fields.domainId, "domainId");
  const authorKind = call.fields.authorKind === "agent" ? "agent" : "human";
  const proposal = await store.createProposal({
    companyId: call.companyId,
    domainId,
    kind: call.fields.kind === "fact_change" ? "fact_change" : "schema_change",
    title: requireString(call.fields.title, "title"),
    summary: optionalString(call.fields.summary),
    payload: requireRecordOrThrow(call.fields.payload, "payload"),
    blastRadius: optionalRecord(call.fields.blastRadius),
    author: optionalString(call.fields.author) ?? (authorKind === "agent" ? "agent" : "user"),
    authorKind,
  });
  await ctx.activity.log({
    companyId: call.companyId,
    message: `Proposed ${proposal.kind}: ${proposal.title}`,
    entityType: "ontology_proposal",
    entityId: proposal.id,
  });
  return created({ proposal });
};

/**
 * Decide a proposal, and carry it out if approved.
 *
 * Applying rides on the same call deliberately: a proposal marked applied with
 * nothing performed would be a lie in the review queue, and a separate step
 * invites exactly that. The change goes through the ordinary store methods, so it
 * takes the same version bump, audit entry and property migration as a direct
 * edit — a proposal is a gate in front of the write, not a second way to write.
 */
const decideProposalMutation: MutationHandler = async (store, ctx, call) => {
  const proposalId = requireString(call.fields.proposalId, "proposalId");
  const decision = call.fields.decision === "rejected" ? "rejected" : "approved";
  const proposal = await store.getProposal(call.companyId, proposalId);
  if (!proposal) return notFound("Proposal not found");
  if (proposal.status !== "proposed") {
    return badRequest(`Proposal is ${proposal.status}; only a proposed one can be decided`);
  }

  const reviewed = await store.reviewProposal(
    call.companyId,
    proposalId,
    decision,
    optionalString(call.fields.reviewedBy) ?? "user",
    optionalString(call.fields.note) ?? "",
  );
  if (!reviewed) return badRequest("Proposal could not be decided");
  if (decision === "rejected") return ok({ proposal: reviewed, applied: false });

  const applied = await applyProposalOperation(
    store,
    ctx,
    call.companyId,
    reviewed.domain_id,
    requireString(reviewed.payload.operation, "payload.operation"),
    reviewed.payload,
  );
  const done = await store.markProposalApplied(call.companyId, proposalId, applied.schemaVersion);
  return ok({ proposal: done ?? reviewed, applied: true, schemaVersion: applied.schemaVersion });
};

/**
 * Retire a domain. Soft-delete, so the audit trail still resolves; `listDomains`
 * stops returning it.
 *
 * No `allowOrphaned`-style flag and no confirmation count, deliberately: the
 * domain row is what disappears, the object types and instances under it keep
 * their own rows and are simply no longer reachable through the picker. Refusing
 * the call when the domain holds data would mean the sample seeder's output could
 * not be cleared, which is the case that produced this.
 */
const deleteDomainMutation: MutationHandler = async (store, ctx, call) => {
  const domainId = requireString(call.fields.domainId, "domainId");
  const okDeleted = await store.deleteDomain(call.companyId, domainId);
  if (!okDeleted) return notFound("Domain not found");
  await logSchemaChange(ctx, call.companyId, `注销本体域 ${domainId}`, "ontology_domain", domainId);
  return noContent();
};

/**
 * Rename / re-describe / re-status a domain.
 *
 * Lived only on the HTTP surface until now, which is why the UI could not reach
 * it: `usePluginAction` goes through the action surface and there was nothing
 * registered there. The HTTP case now delegates here, so there is one
 * implementation rather than two that drift.
 */
const updateDomainMutation: MutationHandler = async (store, ctx, call) => {
  const domainId = requireString(call.fields.domainId, "domainId");
  const domain = await store.updateDomain(call.companyId, domainId, {
    displayName: typeof call.fields.displayName === "string" ? call.fields.displayName : undefined,
    description: "description" in call.fields ? (call.fields.description as string | null) : undefined,
    status: typeof call.fields.status === "string" ? call.fields.status : undefined,
    metadata: optionalRecord(call.fields.metadata),
  });
  if (!domain) return notFound("Domain not found");
  await ctx.activity.log({
    companyId: call.companyId,
    message: `Updated ontology domain ${domain.slug} (v${domain.version})`,
    entityType: "ontology_domain",
    entityId: domain.id,
    metadata: { version: domain.version },
  });
  return ok({ domain });
};

/**
 * Move a domain along its lifecycle: draft -> active -> deprecated -> archived.
 *
 * The side effects are the reason this is not a thin store call: deprecating a
 * domain marks its published nodes stale (a remediation trigger other plugins
 * subscribe to) and every transition is announced cross-plugin. Both were on the
 * HTTP path only before.
 */
const transitionDomainMutation: MutationHandler = async (store, ctx, call) => {
  const domainId = requireString(call.fields.domainId, "domainId");
  const rawTo = requireString(
    call.fields.to ?? call.fields.state ?? call.fields.lifecycleState ?? call.fields.lifecycle_state,
    "to",
  );
  const to = (rawTo === "locked" || rawTo === "lock" ? "archived" : rawTo) as DomainLifecycleState;
  try {
    const before = await store.getDomain(call.companyId, domainId);
    const actor = typeof call.fields.actor === "string" ? call.fields.actor : "system";
    const domain = await store.transitionDomainLifecycle(
      call.companyId,
      domainId,
      to,
      actor,
    );
    if (!domain) return notFound("Domain not found");

    // Best-effort: a failed emit must never fail the transition itself.
    await emitDomainLifecycleChanged(ctx, call.companyId, {
      domainId,
      from: before?.lifecycle_state ?? null,
      to,
    });

    if (to === "deprecated") {
      await emitStaleNodesForDomain(ctx, store, call.companyId, domainId);
    }

    if (rawTo === "locked" || rawTo === "lock" || call.fields.reason || call.fields.deviceInfo) {
      await store.writeAuditLog({
        companyId: call.companyId,
        domainId,
        eventType: "domain_state_changed",
        entityId: domainId,
        actor,
        beforeState: { lifecycle_state: before?.lifecycle_state ?? null },
        afterState: { lifecycle_state: to, rawTo },
        metadata: {
          action: "emergency_kill_switch",
          reason: typeof call.fields.reason === "string" ? call.fields.reason : "Emergency kill switch triggered",
          deviceInfo: typeof call.fields.deviceInfo === "string" ? call.fields.deviceInfo : "mobile",
        },
      });
    }

    return ok({ domain });
  } catch (err) {
    return { status: 422, payload: { error: String((err as Error)?.message ?? err) } };
  }
};

const MUTATION_HANDLERS: Record<string, MutationHandler> = {
  "update-node-type": updateNodeTypeMutation,
  "create-proposal": createProposalMutation,
  "decide-proposal": decideProposalMutation,
  "delete-domain": deleteDomainMutation,
  "update-domain": updateDomainMutation,
  "transition-domain": transitionDomainMutation,
  "set-domain-lifecycle": transitionDomainMutation,
  "delete-node-type": deleteNodeTypeMutation,
  "update-relation-type": updateRelationTypeMutation,
  "delete-relation-type": deleteRelationTypeMutation,
  "create-function": createFunctionMutation,
  "delete-function": deleteFunctionMutation,
  "create-interface": createInterfaceMutation,
  "delete-interface": deleteInterfaceMutation,
  "create-action-type": createActionTypeMutation,
  "delete-action-type": deleteActionTypeMutation,
  "run-transform": runTransformMutation,
  "extract-document": extractDocumentMutation,
  "create-business-system": createBusinessSystemMutation,
};

/** Wraps a shared handler as a `ctx.actions` handler: payload out, throw on error. */
function registerMutationAction(
  ctx: PluginContext,
  store: GraphStore,
  key: string,
  handler: MutationHandler,
): void {
  ctx.actions.register(key, async (params) => {
    const outcome = await handler(store, ctx, readMutationCall(params));
    if (outcome.status >= 400) {
      const message = typeof outcome.payload.error === "string"
        ? outcome.payload.error
        : `Action "${key}" failed`;
      throw new Error(message);
    }
    return outcome.payload;
  });
}

/**
 * Object types planted by `seed-samples`, each with a real `propertiesSchema`.
 *
 * These used to be inserted as bare `{ key, displayName }` shells, so a freshly
 * seeded domain rendered as a set of object types with zero attributes —
 * "连 UML 都不如". Exported so the seed tests can assert the schema actually
 * reaches the store.
 */
export const SAMPLE_NODE_TYPE_DEFS: Array<{
  key: string;
  displayName: string;
  propertiesSchema: Record<string, unknown>;
}> = [
  {
    key: "team",
    displayName: "Team",
    propertiesSchema: {
      name: { type: "string" },
      description: { type: "string" },
      costCenter: { type: "string" },
      headcount: { type: "number" },
    },
  },
  {
    key: "person",
    displayName: "Person",
    propertiesSchema: {
      name: { type: "string" },
      email: { type: "string" },
      title: { type: "string" },
      role: { type: "string", enum: ["individual_contributor", "lead", "manager"] },
      joinedAt: { type: "string", format: "date-time" },
    },
  },
  {
    key: "service",
    displayName: "Service",
    propertiesSchema: {
      name: { type: "string" },
      repoUrl: { type: "string" },
      language: { type: "string" },
      tier: { type: "number", enum: [1, 2, 3] },
      status: { type: "string", enum: ["active", "deprecated", "planned"] },
      ownerTeamKey: { type: "string" },
    },
  },
  {
    key: "repository",
    displayName: "Repository",
    propertiesSchema: {
      name: { type: "string" },
      url: { type: "string" },
      language: { type: "string" },
      defaultBranch: { type: "string" },
      lastCommitAt: { type: "string", format: "date-time" },
      archived: { type: "boolean" },
    },
  },
  {
    key: "project",
    displayName: "Project",
    propertiesSchema: {
      name: { type: "string" },
      status: { type: "string", enum: ["planned", "active", "done", "cancelled"] },
      owner: { type: "string" },
      startDate: { type: "string", format: "date" },
      dueDate: { type: "string", format: "date" },
    },
  },
  {
    key: "task",
    displayName: "Task",
    propertiesSchema: {
      title: { type: "string" },
      status: { type: "string", enum: ["todo", "in_progress", "done"] },
      priority: { type: "string", enum: ["low", "medium", "high"] },
      estimateDays: { type: "number" },
      dueDate: { type: "string", format: "date" },
    },
  },
];

/**
 * Instance rows planted by `seed-samples`. Each carries values for its type's
 * schema so the table view actually has something to show — seeding bare nodes
 * produced a "实例数据列表" of empty cells, which is what made the model look
 * like it had no substance.
 */
export const SAMPLE_NODE_DEFS: Array<{
  key: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
}> = [
  {
    key: "team-platform",
    label: "Platform Team",
    type: "team",
    properties: {
      name: "Platform Team",
      description: "Runs the shared platform services",
      costCenter: "CC-1001",
      headcount: 12,
    },
  },
  {
    key: "team-growth",
    label: "Growth Team",
    type: "team",
    properties: {
      name: "Growth Team",
      description: "Owns billing and growth experiments",
      costCenter: "CC-1002",
      headcount: 7,
    },
  },
  {
    key: "person-alice",
    label: "Alice (Lead)",
    type: "person",
    properties: {
      name: "Alice Chen",
      email: "alice@example.com",
      title: "Engineering Lead",
      role: "lead",
      joinedAt: "2021-03-15T09:00:00Z",
    },
  },
  {
    key: "person-bob",
    label: "Bob (Engineer)",
    type: "person",
    properties: {
      name: "Bob Liu",
      email: "bob@example.com",
      title: "Senior Engineer",
      role: "individual_contributor",
      joinedAt: "2022-07-01T09:00:00Z",
    },
  },
  {
    key: "person-carol",
    label: "Carol (Engineer)",
    type: "person",
    properties: {
      name: "Carol Wang",
      email: "carol@example.com",
      title: "Engineer",
      role: "individual_contributor",
      joinedAt: "2023-01-09T09:00:00Z",
    },
  },
  {
    key: "svc-auth",
    label: "Auth Service",
    type: "service",
    properties: {
      name: "Auth Service",
      repoUrl: "https://git.example.com/platform/auth-service",
      language: "TypeScript",
      tier: 1,
      status: "active",
      ownerTeamKey: "team-platform",
    },
  },
  {
    key: "svc-billing",
    label: "Billing Service",
    type: "service",
    properties: {
      name: "Billing Service",
      repoUrl: "https://git.example.com/growth/billing-service",
      language: "Go",
      tier: 1,
      status: "active",
      ownerTeamKey: "team-growth",
    },
  },
  {
    key: "svc-gateway",
    label: "API Gateway",
    type: "service",
    properties: {
      name: "API Gateway",
      repoUrl: "https://git.example.com/platform/api-gateway",
      language: "Rust",
      tier: 1,
      status: "active",
      ownerTeamKey: "team-platform",
    },
  },
  {
    key: "repo-auth",
    label: "auth-service (repo)",
    type: "repository",
    properties: {
      name: "auth-service",
      url: "https://git.example.com/platform/auth-service",
      language: "TypeScript",
      defaultBranch: "main",
      lastCommitAt: "2026-09-12T10:24:00Z",
      archived: false,
    },
  },
  {
    key: "repo-billing",
    label: "billing-service (repo)",
    type: "repository",
    properties: {
      name: "billing-service",
      url: "https://git.example.com/growth/billing-service",
      language: "Go",
      defaultBranch: "main",
      lastCommitAt: "2026-09-10T16:02:00Z",
      archived: false,
    },
  },
  {
    key: "proj-q3",
    label: "Q3 Platform Hardening",
    type: "project",
    properties: {
      name: "Q3 Platform Hardening",
      status: "active",
      owner: "Alice Chen",
      startDate: "2026-07-01",
      dueDate: "2026-09-30",
    },
  },
  {
    key: "task-mfa",
    label: "Add MFA to Auth",
    type: "task",
    properties: {
      title: "Add MFA to Auth",
      status: "in_progress",
      priority: "high",
      estimateDays: 5,
      dueDate: "2026-09-20",
    },
  },
  {
    key: "task-invoices",
    label: "Invoice export",
    type: "task",
    properties: {
      title: "Invoice export",
      status: "todo",
      priority: "medium",
      estimateDays: 3,
      dueDate: "2026-09-26",
    },
  },
];

/**
 * Signals used to guess which domain a project belongs to: whatever the UI
 * passed, plus the project's own name/ref and its workspace names when the
 * `projects.read` capability is granted. Best-effort — a missing capability
 * must not break the tab.
 */
async function collectProjectSignals(
  ctx: PluginContext,
  companyId: string,
  fields: Record<string, unknown>,
): Promise<string[]> {
  const signals: string[] = [];
  for (const key of ["projectName", "projectRef", "repoName"]) {
    const value = fields[key];
    if (typeof value === "string" && value.trim() !== "") signals.push(value.trim());
  }
  const projectId = typeof fields.projectId === "string" ? fields.projectId : "";
  if (projectId !== "") {
    try {
      const project = await ctx.projects.get(projectId, companyId);
      if (project) {
        const raw = project as unknown as Record<string, unknown>;
        for (const key of ["name", "key", "slug"]) {
          if (typeof raw[key] === "string") signals.push(raw[key] as string);
        }
      }
      const workspaces = await ctx.projects.listWorkspaces(projectId, companyId);
      for (const workspace of workspaces) {
        const raw = workspace as unknown as Record<string, unknown>;
        for (const key of ["name", "path", "repoUrl"]) {
          if (typeof raw[key] === "string") signals.push(raw[key] as string);
        }
      }
    } catch {
      // `projects.read` not granted — fall back to what the UI supplied.
    }
  }
  return [...new Set(signals.filter((s) => s.trim() !== ""))];
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
      await ensureEnterpriseDomain(companyId, store);
      return { domains: await store.listDomains(companyId) };
    });

    // Backs usePluginData("domain-detail", { companyId, domainId }) — domain +
    // node-types + relation-types + a bounded graph snapshot in one payload.
    ctx.data.register("domain-detail", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      if (domainId === "enterprise-core") {
        await ensureEnterpriseDomain(companyId, store);
      }
      const [domain, nodeTypes, relationTypes, graph, services] = await Promise.all([
        store.getDomain(companyId, domainId),
        store.listNodeTypes(companyId, domainId),
        store.listRelationTypes(companyId, domainId),
        store.getGraphSnapshot(companyId, domainId),
        // The architecture an import recorded — the runtime and deployment
        // perspectives draw from these, and they are not part of the type graph.
        store.listDomainSubProjects(companyId, domainId),
      ]);
      // The workbench reads `propertiesSchema` (camelCase, the same shape
      // `describe-domain` emits), but `listNodeTypes` hands back the raw row
      // keyed `properties_schema`. Without this mapping the UI sees `undefined`
      // and renders every object type as having no properties — the table view
      // shows no property columns and the schema view shows no fields, no
      // matter what is actually stored.
      return {
        domain,
        nodeTypes: nodeTypes.map((nt) => ({
          ...nt,
          propertiesSchema: nt.properties_schema,
          // The declared order travels beside the schema map, because jsonb keeps
          // an array's order and not an object's. Absent means unknown, and the
          // reader falls back to a deterministic sort rather than map order.
          propertyOrder: readPropertyOrder(nt),
        })),
        // Relation-type rows carry their endpoints in `metadata`; the views read
        // them through `relationEndpoints`, so the bag is forwarded as-is.
        relationTypes,
        services,
        graph,
      };
    });

    // List handlers the workbench reaches through `usePluginData`.
    //
    // These keys previously existed ONLY on the manifest `apiRoutes` surface
    // (`onApiRequest`), so every call from the UI came back 502 "No data handler
    // registered for key …" and the tabs that read them — 数据集 / 连接器 /
    // 转换 / 动作 / 函数 / 接口 — rendered as empty lists.
    ctx.data.register("list-node-types", async (params) => {
      const nodeTypes = await store.listNodeTypes(
        requireString(params.companyId, "companyId"),
        requireString(params.domainId, "domainId"),
      );
      return {
        nodeTypes: nodeTypes.map((nt) => ({
          ...nt,
          propertiesSchema: nt.properties_schema,
          // The declared order travels beside the schema map, because jsonb keeps
          // an array's order and not an object's. Absent means unknown, and the
          // reader falls back to a deterministic sort rather than map order.
          propertyOrder: readPropertyOrder(nt),
        })),
      };
    });

    ctx.data.register("list-action-types", async (params) => ({
      actionTypes: await store.listActionTypes(
        requireString(params.companyId, "companyId"),
        requireString(params.domainId, "domainId"),
      ),
    }));

    ctx.data.register("list-functions", async (params) => ({
      functions: await store.listFunctions(
        requireString(params.companyId, "companyId"),
        requireString(params.domainId, "domainId"),
      ),
    }));

    ctx.data.register("list-interfaces", async (params) => ({
      interfaces: await store.listInterfaces(
        requireString(params.companyId, "companyId"),
        requireString(params.domainId, "domainId"),
      ),
    }));

    ctx.data.register("list-datasets", async (params) => ({
      datasets: await store.listDatasets(
        requireString(params.companyId, "companyId"),
        requireString(params.domainId, "domainId"),
      ),
    }));

    ctx.data.register("list-connectors", async (params) => ({
      connectors: await store.listConnectors(
        requireString(params.companyId, "companyId"),
        requireString(params.domainId, "domainId"),
      ),
    }));

    ctx.data.register("list-transforms", async (params) => ({
      transforms: await store.listTransforms(
        requireString(params.companyId, "companyId"),
        requireString(params.domainId, "domainId"),
      ),
    }));

    // Mutating actions backing usePluginAction(...) in the plugin UI.
    ctx.actions.register("create-domain", async (params) => {
      // `category` and `metadata` used to be dropped here. The import wizard
      // folds the routes / actions it mined into that metadata blob, so losing
      // it meant the whole non-DDL import produced nothing but type names.
      const call = readMutationCall(params);
      const domain = await store.createDomain({
        companyId: call.companyId,
        slug: requireString(call.fields.slug, "slug"),
        displayName: requireString(call.fields.displayName, "displayName"),
        description: typeof call.fields.description === "string" ? call.fields.description : null,
        category: typeof call.fields.category === "string" ? call.fields.category : undefined,
        metadata: optionalRecord(call.fields.metadata),
      });
      await ctx.activity.log({
        companyId: call.companyId,
        message: `Created ontology domain ${domain.slug}`,
        entityType: "ontology_domain",
        entityId: domain.id,
      });
      return { domain };
    });

    /**
     * Persist the architecture material a scan produced.
     *
     * The scanner has always derived services, layers, stacks, deployment facts
     * and the dependency graph, but the wizard only ever *previewed* them — so
     * the views that are supposed to render "运行架构 / 部署架构" had nothing to
     * read. Re-importing the same project updates by `code` instead of stacking
     * up duplicates, because a scan is expected to be re-run as the tree moves.
     */
    ctx.actions.register("import-architecture", async (params) => {
      const call = readMutationCall(params);
      const businessSystemId = requireString(call.fields.businessSystemId, "businessSystemId");
      const drafts = subProjectsFromArchitecture(
        optionalArray(call.fields.services) as never,
        optionalArray(call.fields.dependencies) as never,
      );

      const prior = new Map(
        (await store.listSubProjects(call.companyId, businessSystemId)).map((s) => [s.code, s]),
      );
      let createdCount = 0;
      let updatedCount = 0;
      for (const draft of drafts) {
        const existing = prior.get(draft.code);
        if (existing) {
          await store.updateSubProject(call.companyId, existing.id, {
            name: draft.name,
            type: draft.type,
            techStack: draft.techStack,
            framework: draft.framework,
            gitRepo: draft.gitRepo,
            dependencies: draft.dependencies,
            buildConfig: draft.buildConfig,
            microserviceLayer: draft.microserviceLayer,
            metadata: draft.metadata,
          });
          updatedCount += 1;
        } else {
          await store.createSubProject({
            companyId: call.companyId,
            businessSystemId,
            ...draft,
          });
          createdCount += 1;
        }
      }

      await ctx.activity.log({
        companyId: call.companyId,
        message: `Imported architecture: ${createdCount} new service(s), ${updatedCount} updated`,
        entityType: "ontology_sub_project",
        entityId: businessSystemId,
      });
      return { created: createdCount, updated: updatedCount, total: drafts.length };
    });

    ctx.actions.register("create-node-type", async (params) => {
      // `propertiesSchema` used to be dropped here, which is why every object
      // type created from the cockpit/import wizard persisted as `{}` and the
      // UI rendered "No properties defined". `metadata` was dropped the same
      // way, so the provenance an importer had just extracted never reached the
      // row and the schema index had nothing but names to group by.
      const call = readMutationCall(params);
      const nodeType = await store.createNodeType({
        companyId: call.companyId,
        domainId: requireString(call.fields.domainId, "domainId"),
        key: requireString(call.fields.key, "key"),
        displayName: requireString(call.fields.displayName, "displayName"),
        description: typeof call.fields.description === "string" ? call.fields.description : null,
        layer: typeof call.fields.layer === "string" ? (call.fields.layer as NodeLayer) : undefined,
        propertiesSchema: call.fields.propertiesSchema === undefined
          ? undefined
          : requireRecordOrThrow(call.fields.propertiesSchema, "propertiesSchema"),
        metadata: optionalRecord(call.fields.metadata),
      });
      await logSchemaChange(ctx, call.companyId, `新建对象类型 ${nodeType.key}`, "ontology_node_type", nodeType.id);
      return { nodeType };
    });

    ctx.actions.register("create-relation-type", async (params) => {
      const call = readMutationCall(params);
      const relationType = await store.createRelationType({
        companyId: call.companyId,
        domainId: requireString(call.fields.domainId, "domainId"),
        key: requireString(call.fields.key, "key"),
        displayName: requireString(call.fields.displayName, "displayName"),
        description:
          typeof call.fields.description === "string" ? call.fields.description : null,
        directed: typeof call.fields.directed === "boolean" ? call.fields.directed : undefined,
        // The endpoints an importer derived live here. The HTTP surface has always
        // forwarded this and the action surface did not, so a relation type
        // created by the import wizard arrived with no endpoints and the
        // structure view had nothing to draw between the two types.
        metadata: optionalRecord(call.fields.metadata),
      });
      await logSchemaChange(
        ctx,
        call.companyId,
        `新建关系类型 ${relationType.key}`,
        "ontology_relation_type",
        relationType.id,
      );
      return { relationType };
    });

    // Type/asset mutations that the UI reaches through `usePluginAction` and
    // that the manifest `apiRoutes` expose too. Registered here so the action
    // surface and the HTTP surface share one implementation.
    for (const [key, handler] of Object.entries(MUTATION_HANDLERS)) {
      registerMutationAction(ctx, store, key, handler);
    }

    // 属性说明补全 — fill in Chinese property descriptions from a legacy
    // source: DDL comments and OpenAPI field descriptions first (verbatim), then
    // one batched model call to translate or infer whatever is left.
    //
    // Read-only: it returns the merged schemas and a report; the UI persists
    // them through `update-node-type` like every other edit path.
    ctx.actions.register("enrich-property-descriptions", async (params) => {
      const call = readMutationCall(params);
      const domainId = requireString(call.fields.domainId, "domainId");
      const sourceText = optionalString(call.fields.sourceText) ?? "";
      const requestedKind = optionalString(call.fields.sourceKind) ?? "auto";
      const typeKeyFilter = optionalString(call.fields.typeKey) ?? null;
      const overwrite = call.fields.overwrite === true;
      const useAi = call.fields.useAi !== false;

      const described = await store.describeDomain(call.companyId, domainId);

      // ── 1. Mine the source, if one was supplied ──
      let entities: SourceEntity[] = [];
      let kind: SourceKind = "ddl";
      if (sourceText.trim() !== "") {
        const looksLikeJson = /^[\s]*[{[]/.test(sourceText);
        const resolved: SourceKind = requestedKind === "auto"
          ? (looksLikeJson ? "openapi" : "ddl")
          : (requestedKind as SourceKind);
        kind = resolved;
        if (resolved === "openapi") {
          const parsed = parseOpenAPI(sourceText);
          entities = parsed.nodeTypes.map((nt) => ({
            typeName: nt.key,
            displayName: nt.displayName,
            properties: Object.entries(nt.properties).map(([name, def]) => ({
              name,
              description: def.description,
            })),
          }));
        } else {
          entities = parseSqlDdl(sourceText, "source.sql").entities.map((e) => ({
            typeName: e.typeName,
            description: e.description,
            properties: (e.properties ?? []).map((p) => ({ name: p.name, description: p.description })),
          }));
        }
      }

      const inScope = typeKeyFilter
        ? described.nodeTypes.filter((nt) => nt.key === typeKeyFilter)
        : described.nodeTypes;
      if (inScope.length === 0) return { error: `对象类型「${typeKeyFilter}」不存在`, updates: [] };

      const index = buildSourceIndex(entities, kind);
      const matched = matchDescriptions({
        nodeTypes: inScope.map((nt) => ({
          key: nt.key,
          fields: Object.keys(nt.propertiesSchema ?? {}),
        })),
        index,
      });

      // ── 2. Decide what each field gets ──
      const report = {
        ddl: 0,
        openapi: 0,
        ai: 0,
        keptExisting: 0,
        unmatched: 0,
        weakMatches: 0,
        sourceEntities: entities.length,
      };
      const plan = new Map<string, Record<string, string>>(); // typeKey -> field -> description
      const aiTargets: EnrichTarget[] = [];

      for (const nodeType of inScope) {
        const schema = nodeType.propertiesSchema ?? {};
        const perType: Record<string, string> = {};
        for (const [field, rawDescriptor] of Object.entries(schema)) {
          const descriptor = rawDescriptor && typeof rawDescriptor === "object"
            ? (rawDescriptor as Record<string, unknown>)
            : {};
          const existing = typeof descriptor.description === "string"
            ? descriptor.description.trim()
            : "";

          if (existing !== "" && !overwrite) {
            report.keptExisting += 1;
            continue;
          }

          const hit = matched.matched.get(`${nodeType.key}.${field}`);
          if (hit) {
            perType[field] = hit.description;
            if (hit.from === "openapi") report.openapi += 1;
            else report.ddl += 1;
            if (hit.weak) report.weakMatches += 1;
            continue;
          }

          if (useAi && aiTargets.length < 200) {
            aiTargets.push({
              typeKey: nodeType.key,
              typeDisplayName: nodeType.displayName,
              field,
              ...(existing !== "" ? { existing } : {}),
            });
          } else {
            report.unmatched += 1;
          }
        }
        if (Object.keys(perType).length > 0) plan.set(nodeType.key, perType);
      }

      // ── 3. One batched model call for the leftovers ──
      if (useAi && aiTargets.length > 0) {
        const client = getClient();
        const response = await client.messages.create({
          model: getModel(),
          max_tokens: 4096,
          system: buildEnrichPrompt({
            domainSlug: described.domain.slug,
            domainName: described.domain.display_name,
            typeKeys: described.nodeTypes.map((nt) => nt.key),
            targets: aiTargets,
          }),
          messages: [{ role: "user", content: "请给出这些属性的中文说明。" }],
        });
        const text = response.content
          .filter((block) => block.type === "text")
          .map((block) => (block.type === "text" ? block.text : ""))
          .join("");
        const parsed = parseEnrichResponse(
          text,
          aiTargets.map((target) => `${target.typeKey}.${target.field}`),
        );
        if (parsed.ok) {
          for (const [key, description] of Object.entries(parsed.descriptions)) {
            const dot = key.indexOf(".");
            const typeKey = key.slice(0, dot);
            const field = key.slice(dot + 1);
            const perType = plan.get(typeKey) ?? {};
            perType[field] = description;
            plan.set(typeKey, perType);
            report.ai += 1;
          }
        } else {
          report.unmatched += aiTargets.length;
        }
      }

      // ── 4. Merge onto the stored schema, preserving every other descriptor key ──
      const updates = [];
      for (const nodeType of inScope) {
        const perType = plan.get(nodeType.key);
        if (!perType || Object.keys(perType).length === 0) continue;
        const schema = nodeType.propertiesSchema ?? {};
        const next: Record<string, unknown> = {};
        for (const [field, rawDescriptor] of Object.entries(schema)) {
          const descriptor = rawDescriptor && typeof rawDescriptor === "object"
            ? { ...(rawDescriptor as Record<string, unknown>) }
            : {};
          if (perType[field] !== undefined) descriptor.description = perType[field];
          next[field] = descriptor;
        }
        updates.push({ nodeTypeId: nodeType.id, key: nodeType.key, propertiesSchema: next });
      }

      return { updates, report };
    });

    // ── Resource links (project / application ↔ ontology domain) ──
    //
    // A domain is the anchor; projects and applications reference it. `link`
    // is idempotent so a re-run (or a repeated import) is safe.
    ctx.actions.register("link-ontology-resource", async (params) => {
      const call = readMutationCall(params);
      const resourceKind = requireString(call.fields.resourceKind, "resourceKind") as OntologyResourceKind;
      const resourceId = requireString(call.fields.resourceId, "resourceId");
      let label = optionalString(call.fields.resourceLabel) ?? "";
      if (label === "" && resourceKind === "project") {
        const project = await ctx.projects
          .get(resourceId, call.companyId)
          .catch(() => null);
        label = str((project as unknown as Record<string, unknown> | null)?.name) || "";
      }
      const link = await store.linkResource({
        companyId: call.companyId,
        domainId: requireString(call.fields.domainId, "domainId"),
        resourceKind,
        resourceId,
        resourceLabel: label,
        role: call.fields.role === "owner" ? "owner" : "consumer",
        createdBy: "board",
      });
      await ctx.activity.log({
        companyId: call.companyId,
        message: `Linked ${resourceKind} ${resourceId} to ontology domain ${link.domain_id}`,
        entityType: "ontology_resource_link",
        entityId: link.id,
      });
      return { link };
    });

    ctx.actions.register("unlink-ontology-resource", async (params) => {
      const call = readMutationCall(params);
      const removed = await store.unlinkResource(
        call.companyId,
        requireString(call.fields.resourceKind, "resourceKind") as OntologyResourceKind,
        requireString(call.fields.resourceId, "resourceId"),
        requireString(call.fields.domainId, "domainId"),
      );
      return { removed };
    });

    ctx.actions.register("suggest-ontology-domains", async (params) => {
      const call = readMutationCall(params);
      const signals = await collectProjectSignals(ctx, call.companyId, call.fields);
      const domains = await store.listDomains(call.companyId);
      return {
        signals,
        candidates: scoreDomainCandidates(
          domains.map((d) => ({ id: d.id, slug: d.slug, display_name: d.display_name })),
          signals,
        ),
      };
    });

    ctx.data.register("resource-links", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      return { links: await store.listLinksForDomain(companyId, domainId) };
    });

    /** Backs the project page's 「本体域」 tab. */
    ctx.data.register("project-ontology", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const projectId = requireString(params.projectId, "projectId");

      const linked = await store.listDomainsForResource(companyId, "project", projectId);
      // Scale per linked domain, so the tab can say what each one actually holds.
      const domains = await Promise.all(
        linked.map(async (row) => ({
          ...row,
          counts: (await store.getGraphSnapshot(companyId, row.domain_id, 1)).counts,
        })),
      );

      const signals = await collectProjectSignals(ctx, companyId, { ...params, projectId });
      const all = await store.listDomains(companyId);
      const linkedIds = new Set(linked.map((row) => row.domain_id));
      const candidates = scoreDomainCandidates(
        all
          .filter((d) => !linkedIds.has(d.id))
          .map((d) => ({ id: d.id, slug: d.slug, display_name: d.display_name })),
        signals,
      );

      return { domains, candidates, signals };
    });

    // 对话式编辑 — turn a plain-language request into concrete schema
    // operations. Read-only here: the UI runs the returned ops through the same
    // `applyOperations` → mutation path the cockpit's Edit mode uses, so both
    // conversational surfaces share one apply implementation.
    ctx.actions.register("ai-edit-schema", async (params) => {
      const call = readMutationCall(params);
      const domainId = requireString(call.fields.domainId, "domainId");
      const instruction = requireString(call.fields.instruction, "instruction");
      const focusTypeKey = optionalString(call.fields.typeKey) ?? null;

      const described = await store.describeDomain(call.companyId, domainId);
      const client = getClient();
      const response = await client.messages.create({
        model: getModel(),
        max_tokens: 4096,
        system: buildAideSystemPrompt(described) + EDIT_SYSTEM_PROMPT_SUFFIX,
        messages: [
          {
            role: "user",
            content: focusTypeKey
              ? `当前聚焦对象类型:${focusTypeKey}。请处理以下需求(不需要跨类型时只改这个类型):\n${instruction}`
              : instruction,
          },
        ],
      });
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");

      const parsed = parseEditResponse(text);
      if (!parsed.ok) return { error: parsed.error, raw: text };
      return {
        intent: parsed.result.intent,
        summary: parsed.result.summary,
        confidence: parsed.result.confidence,
        warnings: parsed.result.warnings,
        operations: parsed.result.operations,
      };
    });

    // 智能补全 — propose standard fields for an object type.
    //
    // Read-only on purpose: the proposal is merged into the existing schema
    // editor and the user saves it through the same `update-node-type` path as
    // a manual edit. (The reference workbench's version of this menu item only
    // fires a toast with a hardcoded field list and writes nothing.)
    ctx.actions.register("ai-suggest-fields", async (params) => {
      const call = readMutationCall(params);
      const domainId = requireString(call.fields.domainId, "domainId");
      const typeKey = requireString(call.fields.typeKey, "typeKey");

      const described = await store.describeDomain(call.companyId, domainId);
      const nodeType = described.nodeTypes.find((nt) => nt.key === typeKey);
      if (!nodeType) return { error: `对象类型「${typeKey}」不存在` };

      const existingProperties =
        nodeType.propertiesSchema && typeof nodeType.propertiesSchema === "object"
          ? nodeType.propertiesSchema
          : {};

      const client = getClient();
      const response = await client.messages.create({
        model: getModel(),
        max_tokens: 2048,
        system: buildSuggestFieldsPrompt({
          domainSlug: described.domain.slug,
          domainName: described.domain.display_name,
          typeKey: nodeType.key,
          displayName: nodeType.displayName,
          description: nodeType.description,
          existingProperties,
          siblingTypeKeys: described.nodeTypes
            .filter((nt) => nt.key !== typeKey)
            .map((nt) => nt.key),
        }),
        messages: [{ role: "user", content: `请为对象类型 ${typeKey} 补充标准字段。` }],
      });
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");

      const parsed = parseSuggestedFields(text, Object.keys(existingProperties));
      if (!parsed.ok) return { error: parsed.error, raw: text };

      return {
        typeKey: nodeType.key,
        fields: parsed.fields,
        merged: { ...existingProperties, ...parsed.fields },
        addedCount: Object.keys(parsed.fields).length,
      };
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
    //
    // Also repairs domains that were seeded before the sample types carried a
    // `propertiesSchema` — those inserted bare type shells, which the cockpit
    // renders as "尚未配置属性". The repair is idempotent and only touches
    // sample keys whose schema is still empty, so user-authored types and
    // hand-edited schemas are never overwritten.
    ctx.actions.register("seed-samples", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");

      const backfilled: string[] = [];
      const existingTypes = await store.listNodeTypes(companyId, domainId);
      const existingTypeByKey = new Map(existingTypes.map((row) => [row.key, row]));
      for (const def of SAMPLE_NODE_TYPE_DEFS) {
        const current = existingTypeByKey.get(def.key);
        if (!current) continue;
        const schema = current.properties_schema;
        const hasProperties =
          schema !== null && typeof schema === "object" && Object.keys(schema).length > 0;
        if (hasProperties) continue;
        await store.updateNodeType(companyId, current.id, {
          propertiesSchema: def.propertiesSchema,
          // The catalogue states its fields in a deliberate order; declare it
          // rather than leaving the page to alphabetise them.
          propertyOrder: Object.keys(def.propertiesSchema),
        });
        backfilled.push(def.key);
      }

      // Nodes seeded before `properties` was forwarded carry an empty bag, so
      // the instance table had no attributes to show. Fill them from the same
      // catalog — only sample keys whose properties are still empty, so any
      // value a user has since written is preserved.
      const snapshot = await store.getGraphSnapshot(companyId, domainId);
      const nodeDefByKey = new Map(SAMPLE_NODE_DEFS.map((def) => [def.key, def]));
      const backfilledNodes: string[] = [];
      for (const node of snapshot.nodes) {
        const def = nodeDefByKey.get(node.key);
        if (!def) continue;
        const props = node.properties;
        const hasProperties =
          props !== null && typeof props === "object" && Object.keys(props).length > 0;
        if (hasProperties) continue;
        await store.updateNode(companyId, node.id, { properties: def.properties });
        backfilledNodes.push(node.key);
      }

      if (snapshot.counts.nodes > 0) {
        return {
          seeded: false,
          reason: "domain-not-empty",
          counts: snapshot.counts,
          backfilled,
          backfilledNodes,
        };
      }

      // ── Node types ──
      const nodeTypeDefs = SAMPLE_NODE_TYPE_DEFS;
      const typeIdByKey = new Map<string, string>();
      for (const def of nodeTypeDefs) {
        const nt = await store.createNodeType({
          companyId,
          domainId,
          key: def.key,
          displayName: def.displayName,
          description: null,
          propertiesSchema: def.propertiesSchema,
          propertyOrder: Object.keys(def.propertiesSchema),
        });
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
      const nodeDefs = SAMPLE_NODE_DEFS;
      const nodeIdByKey = new Map<string, string>();
      for (const def of nodeDefs) {
        const node = await store.createNode({
          companyId,
          domainId,
          key: def.key,
          label: def.label,
          nodeTypeId: typeIdByKey.get(def.type) ?? null,
          properties: def.properties,
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

    /**
     * Plant the built-in sample domains (Retail, Healthcare, Finance, …).
     *
     * Distinct from `seed-samples` above, which fills *one* domain the caller
     * already created and refuses to touch a non-empty one. This one creates the
     * domains themselves, because the point is that a new instance does not open
     * on a blank page. Both are idempotent: a domain whose slug already exists is
     * skipped rather than rewritten, so calling this twice is not a data-loss
     * event. `only` narrows it to a subset of sample keys.
     */
    ctx.actions.register("seed-sample-domains", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const only = Array.isArray(params.only)
        ? params.only.filter((key): key is string => typeof key === "string")
        : undefined;
      const report = await seedSampleDomains(companyId, store, only ? { only } : {});
      return { ...report, sampleSource: SAMPLE_SOURCE };
    });

    /**
     * Seed or idempotently ensure the enterprise core operations and CMDB domain.
     * Plants the corporate entity, departments, personnel & agents, approval
     * workflows, governance gates, documentation, and CMDB infrastructure.
     */
    ctx.actions.register("seed-enterprise-context", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const report = await seedSampleDomains(companyId, store, { only: ["enterprise-core"] });
      return { ...report, domainKey: "enterprise-core" };
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
    /**
     * Saved views.
     *
     * The rules live in the core (`views.ts`) and are applied here, where the
     * actor is known: the list is filtered for the caller, and what was withheld
     * is reported alongside it rather than dropped — a view somebody cannot see
     * is a fact about their access, not an absence.
     *
     * Saving is board-only: a view is how the team agrees to look at the model,
     * and an agent that could rewrite that agreement would be editing the shared
     * picture rather than contributing to it.
     */
    ctx.actions.register("create-view", async (params) => {
      const call = readMutationCall(params);
      // The bridge surface is the board UI: the host has already authenticated
      // it as full-control operator context.
      const candidate = normaliseView({
        key: requireString(call.fields.key, "key"),
        name: requireString(call.fields.name, "name"),
        description: optionalString(call.fields.description),
        kind: optionalString(call.fields.kind) as never,
        config: optionalRecord(call.fields.config),
        visibility: optionalString(call.fields.visibility) as never,
        roles: Array.isArray(call.fields.roles) ? (call.fields.roles as never) : [],
        created_by: optionalString(call.fields.actor) ?? "user",
      });
      const validation = validateView(candidate);
      if (!validation.ok) throw new Error(validation.errors.join("; "));
      const view = await store.createView({
        companyId: call.companyId,
        domainId: requireString(call.fields.domainId, "domainId"),
        ...candidate,
        createdBy: candidate.created_by,
      });
      await ctx.activity.log({
        companyId: call.companyId,
        message: `Saved view ${view.key} (${view.visibility})`,
        entityType: "ontology_view",
        entityId: view.id,
      });
      return { view };
    });

    ctx.actions.register("update-view", async (params) => {
      const call = readMutationCall(params);
      const viewId = requireString(call.fields.viewId, "viewId");
      const update: Record<string, unknown> = {};
      if (call.fields.name !== undefined) update.name = requireString(call.fields.name, "name");
      if (call.fields.description !== undefined) update.description = optionalString(call.fields.description) ?? "";
      if (call.fields.kind !== undefined) update.kind = optionalString(call.fields.kind);
      if (call.fields.config !== undefined) update.config = optionalRecord(call.fields.config) ?? {};
      if (call.fields.visibility !== undefined) update.visibility = optionalString(call.fields.visibility);
      if (call.fields.roles !== undefined) {
        update.roles = Array.isArray(call.fields.roles) ? (call.fields.roles as never) : [];
      }
      const validation = validateView({
        key: "unchanged",
        name: update.name === undefined ? "unchanged" : (update.name as string),
        kind: update.kind as never,
        visibility: update.visibility as never,
        roles: update.roles as never,
        config: update.config as never,
      });
      if (!validation.ok) throw new Error(validation.errors.join("; "));
      const view = await store.updateView(call.companyId, viewId, update);
      if (!view) return notFound("View not found");
      return ok({ view });
    });

    ctx.actions.register("delete-view", async (params) => {
      const call = readMutationCall(params);
      const deleted = await store.deleteView(call.companyId, requireString(call.fields.viewId, "viewId"));
      return deleted ? noContent() : notFound("View not found");
    });

    // The UI reads the list declaratively; an agent reaches the same data over
    // the `list-views` route. Registering it as an action too would be a handler
    // nothing calls.
    ctx.data.register("list-views", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const rows = await store.listViews(companyId, domainId);
      return describeViewsFor(
        rows,
        params.actorKind === "agent" ? "agent" : "board",
        optionalString(params.actor),
      );
    });

    ctx.data.register("list-proposals", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const status = typeof params.status === "string" ? (params.status as ProposalStatus) : undefined;
      return { proposals: await store.listProposals(companyId, domainId, status) };
    });

    /**
     * The architecture as an Archify diagram IR.
     *
     * One name on both surfaces: a bridge action so the workbench can hand the
     * user a file, and a GET route so an agent can fetch the same document and
     * render it with the Archify skill. The translation itself is pure and lives
     * in the core — what happens here is loading the material and naming the
     * views.
     */
    ctx.actions.register("architecture-diagram", async (params) => {
      const call = readMutationCall(params);
      return { diagram: await buildArchitectureDiagram(store, call.companyId, requireString(call.fields.domainId, "domainId")) };
    });

    ctx.data.register("list-sub-projects", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const businessSystemId = requireString(params.businessSystemId, "businessSystemId");
      return { subProjects: await store.listSubProjects(companyId, businessSystemId) };
    });

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

    /**
     * Agent-facing tools, from the core's catalogue.
     *
     * The catalogue is derived from the API contract, so the tool surface cannot
     * drift from what agents are allowed to reach — and the one write an agent
     * may perform is the proposal, whose schema demands a reason.
     *
     * `companyId` comes from the run context, never from the model's arguments:
     * an agent can only ever touch its own company's ontology.
     */
    for (const tool of ONTOLOGY_TOOLS) {
      ctx.tools.register(
        tool.name,
        {
          displayName: tool.displayName,
          description: tool.description,
          parametersSchema: tool.parametersSchema,
        },
        async (params, runCtx) => {
          try {
            const args = (params ?? {}) as Record<string, unknown>;
            const data = await callOntologyTool(store, runCtx.companyId, tool.name, args);
            return { content: summariseToolResult(tool, data), data };
          } catch (err) {
            // Say what was wrong. An empty result would read as "this domain
            // holds nothing", which is how an agent ends up confidently wrong.
            return { error: String((err as Error)?.message ?? err) };
          }
        },
      );
    }

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
      const mode = params.mode === "edit" ? "edit" : "qa";
      const aide = requireAideStore();
      const streamChannel = `ontology.aide.stream.${companyId}.${domainId}`;

      await aide.appendMessage(companyId, domainId, "user", userMessage, []);

      const [snapshot, history] = await Promise.all([
        store.describeDomain(companyId, domainId),
        aide.loadHistory(companyId, domainId, 500),
      ]);

      const baseSystemPrompt = buildAideSystemPrompt(snapshot);
      const systemPrompt = mode === "edit"
        ? baseSystemPrompt + EDIT_SYSTEM_PROMPT_SUFFIX
        : baseSystemPrompt;
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

        if (mode === "edit") {
          // Edit stays a single-shot JSON-patch call: it is a generation task,
          // not a retrieval one, so it gets no tools and no loop.
          const stream = client.messages.stream({
            model: getModel(),
            max_tokens: 4096,
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

          // Edit-mode does not use citations. We parse the final buffer
          // as JSON and emit a structured `edit_result` event the UI
          // renders as an EditCard. The full JSON also goes into the
          // assistant message column so the user can scroll back to it.
          const parsed = parseEditResponse(acc);
          if (!registryEntry.aborted) {
            await aide.appendMessage(
              companyId,
              domainId,
              "assistant",
              acc,
              [],
            );
            if (parsed.ok) {
              ctx.streams.emit(streamChannel, { type: "edit_result", result: parsed.result });
              ctx.streams.emit(streamChannel, { type: "done", citations: [] });
            } else {
              ctx.streams.emit(streamChannel, { type: "edit_error", error: parsed.error });
              ctx.streams.emit(streamChannel, { type: "done", citations: [] });
            }
          } else {
            ctx.streams.emit(streamChannel, { type: "aborted" });
          }
          return { ok: true, mode, aborted: registryEntry.aborted };
        }

        // QA runs as an agent: the model can look up real domain data with the
        // read-only tools before answering. `acc` accumulates everything
        // streamed (intermediate narration included) so the citation trailer at
        // the very end still parses the same way it always did.
        const agentMessages: AideLoopMessage[] = llmMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        const runOnce = async (withTools: boolean) => {
          const accBefore = acc;
          try {
            return await runAideAgent({
              createStream: ({ system, messages, tools }) =>
                client.messages.stream({
                  model: getModel(),
                  max_tokens: 2048,
                  system,
                  messages: messages as never,
                  ...(withTools ? { tools: tools as never } : {}),
                }) as never,
              systemPrompt,
              tools: AIDE_TOOL_SPECS,
              messages: agentMessages,
              executeTool: (name, input) =>
                executeAideTool(store, companyId, domainId, name, input),
              onToken: (delta) => {
                acc += delta;
                if (!registryEntry.aborted) {
                  ctx.streams.emit(streamChannel, { type: "token", text: delta });
                }
              },
              onTool: (name, phase) => {
                if (!registryEntry.aborted) {
                  ctx.streams.emit(streamChannel, { type: "tool", name, phase });
                }
              },
              onController: (controller) => {
                registryEntry.controller = controller;
              },
              isAborted: () => registryEntry.aborted,
            });
          } catch (err) {
            // Drop anything streamed before the failure so a retry doesn't
            // duplicate it in the bubble.
            acc = accBefore;
            throw err;
          }
        };

        try {
          await runOnce(true);
        } catch (err) {
          const message = String((err as Error)?.message ?? err);
          const toolUnsupported =
            /tool/i.test(message) && /(not supported|unsupported|unexpected|invalid|unknown)/i.test(message);
          if (!toolUnsupported) throw err;
          ctx.logger.warn("Aide model rejected tools — falling back to single-shot", { message });
          await runOnce(false);
        }

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
              propertyOrder: optionalStringArray(nt.propertyOrder),
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

    // Backs usePluginData("aide-snapshots", { companyId, domainId }) —
    // schema history list for the right-side snapshot drawer. Returns
    // newest-first so the drawer shows the most recent edit at the top.
    ctx.data.register("aide-snapshots", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const snapshots = await requireAideStore().listSnapshots(companyId, domainId);
      return { snapshots };
    });

    // Captures the *pre-edit* ontology schema as a snapshot row. The
    // EditCard's "Apply" success path calls this immediately before
    // dispatching mutations so the drawer always shows the state
    // immediately before the most recent edit.
    ctx.actions.register("aide-create-snapshot", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const intent = requireString(params.intent, "intent");
      const summary = typeof params.summary === "string" ? params.summary : "";
      const opCount = Number.isFinite(params.opCount) ? Number(params.opCount) : 0;
      const createdBy =
        typeof params.createdBy === "string" ? params.createdBy : "user";
      const label =
        typeof params.label === "string" && params.label.length > 0
          ? params.label
          : intent.slice(0, 60);
      const snapshot = await store.describeDomain(companyId, domainId);
      const schema = requireAideStore().buildSchemaSnapshot(snapshot);
      const meta = await requireAideStore().createSnapshot({
        companyId,
        domainId,
        label,
        intent,
        summary,
        opCount,
        schema,
        createdBy,
      });
      return { snapshot: meta };
    });

    // Restore a previously-saved snapshot by computing the inverse op
    // set against the live schema and dispatching them through the
    // existing create-* / update-* / delete-* actions.
    ctx.actions.register("aide-restore-snapshot", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domainId = requireString(params.domainId, "domainId");
      const version = Number(params.version);
      if (!Number.isInteger(version) || version < 1) {
        throw new Error("version must be a positive integer");
      }
      const aide = requireAideStore();
      const target = await aide.getSnapshot(companyId, domainId, version);
      if (!target) throw new Error(`snapshot v${version} not found`);
      // The restore logic lives in the UI side (it has the applyOperations
      // helper + dispatch glue). We just hand the snapshot back; the UI
      // computes the inverse ops and applies them through the same
      // mutation actions it uses for edit-mode Apply.
      return { snapshot: target };
    });

    // Production auto-seeding pass: background ensure enterprise-core domain exists for active companies
    setTimeout(async () => {
      try {
        const rows = await ctx.db.query<{ id: string }>(
          `SELECT id FROM "${ctx.db.namespace}".companies WHERE status != 'archived'`
        );
        for (const row of rows) {
          if (row?.id) {
            await ensureEnterpriseDomain(row.id, store);
          }
        }
      } catch {
        // Fallback: if companies table is in another schema or query fails,
        // on-demand ensureEnterpriseDomain in list-domains / onApiRequest covers it.
      }
    }, 1000).unref?.();

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
        // Through the store, like the data face does. The hand-written projection
        // this replaces selected straight from `ontology_domains` with no
        // `is_deleted` filter, so the route kept returning retired domains once
        // retiring became possible — visible only to this path, which is the
        // worst kind of difference. It also dropped `lifecycle_state`, which the
        // same rows carry everywhere else.
        await ensureEnterpriseDomain(companyId, store);
        return { body: { domains: await store.listDomains(companyId) } };
      }

      // --- who may act ------------------------------------------------------
      //
      // The caller identity comes from the host for every other route. These are
      // the routes that create identity, so they are the one place where a body
      // names an actor — and they are board-only, which is what keeps that from
      // being a way in.
      case "create-tenant": {
        const body = optionalRecord(input.body) ?? {};
        const tenant = await store.createTenant({
          slug: requireString(body.slug, "slug"),
          name: requireString(body.name, "name"),
          createdBy: actorRefOf(input.actor),
        });
        await ctx.activity.log({
          companyId,
          message: `Created ontology tenant ${tenant.slug}`,
          entityType: "ontology_tenant",
          entityId: tenant.id,
          metadata: { slug: tenant.slug },
        });
        return { status: 201, body: { tenant } };
      }

      case "list-tenants": {
        const tenants = await store.listTenants();
        return { status: 200, body: { tenants } };
      }

      case "create-api-key": {
        const body = optionalRecord(input.body) ?? {};
        const tenantId = requireString(body.tenantId, "tenantId");
        const member = typeof body.memberId === "string"
          ? await memberStore(ctx).getById(tenantId, body.memberId)
          : null;
        if (typeof body.memberId === "string" && !member) {
          // Binding a key to a member that is not there would silently produce a
          // key with no roles, which looks like a permission bug later.
          return { status: 404, body: { error: "Member not found in this tenant" } };
        }
        const roleSource = member ? member.roles : optionalStringArray(body.roles) ?? [];
        // The company, not the tenant: plugin configuration is read in the
        // company the call was invoked for, which is not the ontology tenant.
        const pepper = await keyPepper(ctx, companyId);
        if (!pepper) {
          return {
            status: 422,
            body: {
              error:
                "No key pepper configured, so this deployment cannot issue keys. Set the plugin setting keyPepper (the standalone server reads ONTOLOGY_KEY_PEPPER) to the same value the verifier uses.",
            },
          };
        }
        const generated = generateApiKey({ pepper });
        const key = await store.createApiKey({
          tenantId,
          prefix: generated.prefix,
          keyHash: generated.hash,
          label: optionalString(body.label) ?? "",
          scope: body.scope === "board" ? "board" : "agent",
          roles: knownRoles(roleSource) as never,
          ...(member ? { memberId: member.id } : {}),
          createdBy: actorRefOf(input.actor),
        });
        await ctx.activity.log({
          companyId,
          message: `Issued ontology API key ${key.prefix}${member ? ` for ${member.actor_ref}` : ""}`,
          entityType: "ontology_api_key",
          entityId: key.id,
          metadata: { prefix: key.prefix, memberId: member?.id ?? null },
        });
        // The only time the secret exists outside the caller's hands.
        return { status: 201, body: { key, secret: generated.secret } };
      }

      case "list-api-keys": {
        const keys = await store.listApiKeys(requireString((optionalRecord(input.body) ?? {}).tenantId ?? input.query.tenantId, "tenantId"));
        // Projected, so a future column cannot leak the hash into a listing.
        return {
          status: 200,
          body: {
            keys: keys.map((key) => ({
              prefix: key.prefix,
              label: key.label,
              scope: key.scope,
              roles: key.roles,
              memberId: key.member_id,
              revokedAt: key.revoked_at,
              lastUsedAt: key.last_used_at,
            })),
          },
        };
      }

      case "revoke-api-key": {
        const body = optionalRecord(input.body) ?? {};
        const ok = await store.revokeApiKey(
          requireString(body.tenantId, "tenantId"),
          requireString(body.prefix, "prefix"),
          actorRefOf(input.actor),
        );
        if (!ok) return { status: 404, body: { error: "No such active key" } };
        await ctx.activity.log({
          companyId,
          message: `Revoked ontology API key ${String(body.prefix)}`,
          entityType: "ontology_api_key",
          entityId: String(body.prefix),
        });
        return { status: 200, body: { revoked: true } };
      }

      case "create-member": {
        const body = optionalRecord(input.body) ?? {};
        const roles = knownRoles(optionalStringArray(body.roles) ?? []);
        if (roles.length === 0 && body.roles !== undefined) {
          // Refusing is better than storing a member who can do nothing while the
          // caller believes they granted something.
          return { status: 422, body: { error: `No known role in: ${JSON.stringify(body.roles)}` } };
        }
        const member = await memberStore(ctx).create({
          tenantId: requireString(body.tenantId, "tenantId"),
          actorRef: requireString(body.actorRef, "actorRef"),
          displayName: optionalString(body.displayName) ?? "",
          roles,
          status: body.status === "suspended" ? "suspended" : "active",
          createdBy: actorRefOf(input.actor),
        });
        await ctx.activity.log({
          companyId,
          message: `Added ontology member ${member.actor_ref}`,
          entityType: "ontology_member",
          entityId: member.id,
          metadata: { roles: member.roles },
        });
        return { status: 201, body: { member } };
      }

      case "list-members": {
        const members = await memberStore(ctx).list(requireString((optionalRecord(input.body) ?? {}).tenantId ?? input.query.tenantId, "tenantId"));
        return { status: 200, body: { members } };
      }

      case "update-member": {
        const body = optionalRecord(input.body) ?? {};
        const member = await memberStore(ctx).update(
          requireString(body.tenantId, "tenantId"),
          requireString(body.memberId, "memberId"),
          {
            ...(body.roles === undefined ? {} : { roles: knownRoles(optionalStringArray(body.roles) ?? []) }),
            ...(body.status === undefined ? {} : { status: body.status === "suspended" ? "suspended" : "active" }),
            ...(body.displayName === undefined ? {} : { displayName: optionalString(body.displayName) ?? "" }),
          },
        );
        if (!member) return { status: 404, body: { error: "Member not found" } };
        await ctx.activity.log({
          companyId,
          message: `Updated ontology member ${member.actor_ref} (${member.status})`,
          entityType: "ontology_member",
          entityId: member.id,
          metadata: { roles: member.roles, status: member.status },
        });
        return { status: 200, body: { member } };
      }

      case "remove-member": {
        const body = optionalRecord(input.body) ?? {};
        const ok = await memberStore(ctx).remove(
          requireString(body.tenantId, "tenantId"),
          requireString(body.memberId, "memberId"),
        );
        if (!ok) return { status: 404, body: { error: "Member not found" } };
        await ctx.activity.log({
          companyId,
          message: `Removed ontology member ${String(body.memberId)}`,
          entityType: "ontology_member",
          entityId: String(body.memberId),
        });
        return { status: 200, body: { removed: true } };
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
        const outcome = await updateDomainMutation(store, ctx, httpMutationCall(companyId, input));
        return { status: outcome.status, body: outcome.payload };
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
          propertyOrder: optionalStringArray(body.propertyOrder),
          metadata: optionalRecord(body.metadata),
        });
        await logSchemaChange(ctx, companyId, `新建对象类型 ${nodeType.key}`, "ontology_node_type", nodeType.id);
        return { status: 201, body: { nodeType } };
      }

      case "update-node-type": {
        const outcome = await updateNodeTypeMutation(store, ctx, httpMutationCall(companyId, input));
        return { status: outcome.status, body: outcome.payload };
      }

      case "delete-domain": {
        const outcome = await deleteDomainMutation(store, ctx, httpMutationCall(companyId, input));
        return { status: outcome.status, body: outcome.payload };
      }

      case "delete-node-type": {
        const outcome = await deleteNodeTypeMutation(store, ctx, httpMutationCall(companyId, input));
        return { status: outcome.status, body: outcome.payload };
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
        await logSchemaChange(
          ctx,
          companyId,
          `新建关系类型 ${relationType.key}`,
          "ontology_relation_type",
          relationType.id,
        );
        return { status: 201, body: { relationType } };
      }

      case "update-relation-type": {
        const outcome = await updateRelationTypeMutation(
          store,
          ctx,
          httpMutationCall(companyId, input),
        );
        return { status: outcome.status, body: outcome.payload };
      }

      case "delete-relation-type": {
        const outcome = await deleteRelationTypeMutation(
          store,
          ctx,
          httpMutationCall(companyId, input),
        );
        return { status: outcome.status, body: outcome.payload };
      }

      case "get-domain-snapshot":
      case "graph-snapshot": {
        const domainId =
          optionalString(input.params?.domainId) ||
          requireString(queryString(input.query.domainId), "domainId");
        const graph = await store.getGraphSnapshot(
          companyId,
          domainId,
          parseDepth(queryString(input.query.nodeLimit)),
        );
        return { body: { graph, snapshot: graph } };
      }

      case "set-domain-lifecycle":
      case "transition-domain": {
        const outcome = await transitionDomainMutation(store, ctx, httpMutationCall(companyId, input));
        return { status: outcome.status, body: outcome.payload };
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
        const outcome = await createFunctionMutation(store, ctx, httpMutationCall(companyId, input));
        return { status: outcome.status, body: outcome.payload };
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
        const outcome = await deleteFunctionMutation(store, ctx, httpMutationCall(companyId, input));
        return { status: outcome.status, body: outcome.payload };
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
        const outcome = await createInterfaceMutation(store, ctx, httpMutationCall(companyId, input));
        return { status: outcome.status, body: outcome.payload };
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
        const outcome = await deleteInterfaceMutation(store, ctx, httpMutationCall(companyId, input));
        return { status: outcome.status, body: outcome.payload };
      }

      case "list-action-types": {
        const actionTypes = await store.listActionTypes(
          companyId,
          requireString(queryString(input.query.domainId), "domainId"),
        );
        return { body: { actionTypes } };
      }

      case "create-action-type": {
        const outcome = await createActionTypeMutation(store, ctx, httpMutationCall(companyId, input));
        return { status: outcome.status, body: outcome.payload };
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
        const outcome = await deleteActionTypeMutation(store, ctx, httpMutationCall(companyId, input));
        return { status: outcome.status, body: outcome.payload };
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

      case "run-transform": {
        const outcome = await runTransformMutation(store, ctx, httpMutationCall(companyId, input));
        return { status: outcome.status, body: outcome.payload };
      }

      case "extract-document": {
        const outcome = await extractDocumentMutation(store, ctx, httpMutationCall(companyId, input));
        return { status: outcome.status, body: outcome.payload };
      }

      // Read-only: answers whether a document would load, and what a modeller
      // would want to fix, without touching a row. Split from `import-document`
      // so the control plane can gate on it — a spec that cannot load is rejected
      // while it is still a proposal, and never becomes an approval someone has
      // to reason about.
      case "validate-document": {
        const body = optionalRecord(input.body) ?? {};
        const document = optionalRecord(body.document);
        if (!document) return { status: 400, body: { error: "document is required" } };

        let problems: DocumentProblem[];
        try {
          problems = validateDocument(document as unknown as OntologyDocument);
        } catch (err) {
          // `validateDocument` assumes our shape. A caller that hands us
          // something else gets a 400 rather than a thrown 500: the boundary is
          // where a malformed payload stops.
          return {
            status: 400,
            body: { error: `document is not a well-formed ontology document: ${(err as Error).message}` },
          };
        }

        const parsed = parseDocument(JSON.stringify(document));
        return {
          status: 200,
          body: {
            problems,
            // Modelling quality, which is a separate question from loadability —
            // a document can import perfectly and still be unusable.
            lint: parsed.document ? lintDocument(parsed.document) : [],
            loadable: !problems.some((problem) => problem.severity === "error"),
            ...(parsed.document?.fingerprint ? { fingerprint: parsed.document.fingerprint } : {}),
          },
        };
      }

      // Write side. Everything above this line in the request lifecycle was a
      // proposal; this is the only place a build spec becomes rows.
      case "import-document": {
        const body = optionalRecord(input.body) ?? {};
        const document = optionalRecord(body.document);
        if (!document) return { status: 400, body: { error: "document is required" } };

        let problems: DocumentProblem[];
        try {
          problems = validateDocument(document as unknown as OntologyDocument);
        } catch (err) {
          return {
            status: 400,
            body: { error: `document is not a well-formed ontology document: ${(err as Error).message}` },
          };
        }
        if (problems.some((problem) => problem.severity === "error")) {
          // Validate before write, and refuse the whole thing: a document that
          // half applies leaves a domain nobody can describe.
          return { status: 422, body: { error: "document failed validation", problems } };
        }

        const parsed = parseDocument(JSON.stringify(document));
        if (!parsed.document) {
          return { status: 422, body: { error: "document failed validation", problems: parsed.problems } };
        }

        const slug = parsed.document.source?.domainSlug;
        if (!slug) {
          return { status: 400, body: { error: "document.source.domainSlug is required" } };
        }

        // Idempotency, and the reason it is by slug: `ontology_domain_snapshots`
        // and the schema-change audit both key off the domain, so "same spec
        // twice" has to resolve to "same domain". A retried instantiate must not
        // produce a second model.
        const existing = await store.getDomainBySlug(companyId, slug);
        if (existing) {
          if (existing.bootstrap_source !== "build_spec") {
            // The slug is held by a model a human made (or one imported from a
            // legacy system). Reusing it would overwrite work nobody offered to
            // replace, so this is a conflict for the caller to resolve, not a
            // merge we perform.
            return {
              status: 409,
              body: {
                error: `domain "${slug}" already exists and was not created from a build spec`,
                code: "DOMAIN_SLUG_TAKEN",
                domainId: existing.id,
              },
            };
          }
          return {
            status: 200,
            body: {
              domainId: existing.id,
              slug,
              reused: true,
              created: { nodeTypes: 0, relationTypes: 0 },
            },
          };
        }

        const plan = documentToWritePlan(parsed.document);
        const domain = await store.createDomain({
          companyId,
          slug,
          displayName: parsed.document.name,
          description: parsed.document.description ?? null,
          bootstrapSource: "build_spec",
          bootstrapDescription: parsed.document.source?.origin ?? "",
          metadata: {
            buildSpec: {
              format: parsed.document.format,
              origin: parsed.document.source?.origin ?? null,
              fingerprint: parsed.document.fingerprint ?? null,
            },
          },
        });

        for (const type of plan.objectTypes) {
          await store.createNodeType({
            companyId,
            domainId: domain.id,
            key: type.key,
            displayName: type.displayName,
            description: type.description ?? null,
            propertiesSchema: type.propertiesSchema,
            propertyOrder: type.propertyOrder,
          });
        }

        for (const relation of plan.relationTypes) {
          await store.createRelationType({
            companyId,
            domainId: domain.id,
            key: relation.key,
            displayName: relation.displayName,
            description: relation.description ?? null,
            cardinality: relation.cardinality,
            // Relation types store their endpoints in `metadata`; the builder is
            // the one writer, so the type-level graph can read them back.
            metadata: buildRelationMetadata(relation.sourceNodeTypeKey, relation.targetNodeTypeKey),
          });
        }

        // A named restore point for what the import produced. A *first* import
        // has no prior state to return to — its undo is deleting the domain — so
        // this is what a later edit rolls back to, not a "before" image. Saying
        // so matters: calling it a pre-import snapshot would promise an undo this
        // path cannot provide.
        await store.snapshotDomain(
          companyId,
          domain.id,
          `构建规范导入: ${parsed.document.source?.origin ?? slug}`,
          "build_spec",
        );

        await logSchemaChange(
          ctx,
          companyId,
          `从构建规范创建本体域 ${slug}（${plan.objectTypes.length} 对象类型 / ${plan.relationTypes.length} 关系类型）`,
          "ontology_domain",
          domain.id,
        );

        return {
          status: 201,
          body: {
            domainId: domain.id,
            slug,
            reused: false,
            created: { nodeTypes: plan.objectTypes.length, relationTypes: plan.relationTypes.length },
          },
        };
      }

      case "create-proposal": {
        const outcome = await createProposalMutation(store, ctx, httpMutationCall(companyId, input));
        return { status: outcome.status, body: outcome.payload };
      }

      case "decide-proposal": {
        const outcome = await decideProposalMutation(store, ctx, httpMutationCall(companyId, input));
        return { status: outcome.status, body: outcome.payload };
      }

      case "list-views": {
        const rows = await store.listViews(
          companyId,
          requireString(queryString(input.query.domainId), "domainId"),
        );
        // The actor class comes from the authenticated request, never from a
        // query parameter: a caller that could say "I am the board" would see
        // every restricted view, which makes the restriction decoration.
        return {
          body: describeViewsFor(rows, actorKindOf(input.actor), input.actor.actorId),
        };
      }

      case "create-view": {
        const view = await createViewFromHttp(store, ctx, companyId, input);
        return { status: 201, body: { view } };
      }

      case "update-view": {
        const body = optionalRecord(input.body) ?? {};
        const view = await store.updateView(
          companyId,
          requireString(input.params.viewId, "viewId"),
          {
            ...(typeof body.name === "string" ? { name: body.name } : {}),
            ...(typeof body.description === "string" ? { description: body.description } : {}),
            ...(typeof body.kind === "string" ? { kind: body.kind as never } : {}),
            ...(body.config !== undefined ? { config: optionalRecord(body.config) ?? {} } : {}),
            ...(typeof body.visibility === "string" ? { visibility: body.visibility as never } : {}),
            ...(Array.isArray(body.roles) ? { roles: body.roles as never } : {}),
          },
        );
        if (!view) return { status: 404, body: { error: "View not found" } };
        return { body: { view } };
      }

      case "delete-view": {
        const deleted = await store.deleteView(
          companyId,
          requireString(input.params.viewId, "viewId"),
        );
        return deleted
          ? { status: 204, body: {} }
          : { status: 404, body: { error: "View not found" } };
      }

      case "architecture-diagram": {
        return {
          body: {
            diagram: await buildArchitectureDiagram(
              store,
              companyId,
              requireString(queryString(input.query.domainId), "domainId"),
            ),
          },
        };
      }

      case "list-proposals": {
        const proposals = await store.listProposals(
          companyId,
          requireString(queryString(input.query.domainId), "domainId"),
          typeof input.query.status === "string" ? (input.query.status as ProposalStatus) : undefined,
        );
        return { body: { proposals } };
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
        const outcome = await createBusinessSystemMutation(
          store,
          ctx,
          httpMutationCall(companyId, input),
        );
        return { status: outcome.status, body: outcome.payload };
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
