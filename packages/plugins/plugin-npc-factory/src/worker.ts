import {
  definePlugin,
  runWorker,
  type PluginApiRequestInput,
  type PluginApiResponse,
  type PluginContext,
  type PluginEvent,
} from "@paperclipai/plugin-sdk";
import { NpcStore, type NpcRunStep } from "./store.js";
import type {
  NpcArtifactType,
  NpcDriftStatus,
  NpcJobFamily,
  NpcLayer,
  NpcRoleType,
  NpcRunStatus,
} from "./enums.js";

let activeContext: PluginContext | null = null;
let store: NpcStore | null = null;

/**
 * Ontology plugin's cross-plugin event stream we subscribe to. The host emits
 * plugin domain events as `plugin.<pluginId>.<name>`, so a `node-stale` emit
 * from paperclipai.plugin-ontology arrives on this channel.
 */
const ONTOLOGY_NODE_STALE_EVENT = "plugin.paperclipai.plugin-ontology.node-stale" as const;
const ONTOLOGY_BUSINESS_SYSTEM_CREATED_EVENT =
  "plugin.paperclipai.plugin-ontology.business-system-created" as const;

function requireContext(): PluginContext {
  if (!activeContext) throw new Error("NPC factory plugin worker context is not initialized");
  return activeContext;
}
function requireStore(): NpcStore {
  if (!store) store = new NpcStore(requireContext().db);
  return store;
}
function queryString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}
function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Missing required field: ${field}`);
  return value;
}
function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function parseInt10(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}
function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * Flagship cross-plugin integration: when the ontology plugin reports a node as
 * stale, the NPC factory opens a remediation workflow run bound to the ontology
 * domain. Mirrors DigitalStaff domain-6 `ontology-node-stale` trigger semantics.
 * Idempotent per (domain, node): a deterministic run_key means a duplicate event
 * is absorbed by the run_key uniqueness constraint rather than creating dupes.
 */
async function handleOntologyNodeStale(ctx: PluginContext, event: PluginEvent): Promise<void> {
  const payload = optionalRecord(event.payload) ?? {};
  const companyId = event.companyId;
  const domainId = str(payload.domainId);
  const nodeId = str(payload.nodeId);
  if (!companyId || !domainId || !nodeId) {
    ctx.logger.warn("Ignoring node-stale event with missing fields", {
      eventId: event.eventId,
      hasCompany: Boolean(companyId),
      hasDomain: Boolean(domainId),
      hasNode: Boolean(nodeId),
    });
    return;
  }
  const runKey = `ontology-stale-${domainId}-${nodeId}`;
  try {
    const run = await requireStore().createRun({
      companyId,
      runKey,
      jobFamily: null,
      ontologyDomainRef: domainId,
      createdBy: "plugin:ontology",
      metadata: {
        trigger: "ontology-node-stale",
        ontologyNodeRef: nodeId,
        ontologyNodeKey: str(payload.nodeKey) ?? null,
        reason: str(payload.reason) ?? null,
        sourceEventId: event.eventId,
      },
    });
    await ctx.activity.log({
      companyId,
      message: `Opened remediation run for stale ontology node ${str(payload.nodeKey) ?? nodeId}`,
      entityType: "npc_workflow_run",
      entityId: run.id,
      metadata: { domainId, nodeId, trigger: "ontology-node-stale" },
    });
    ctx.logger.info("Created remediation run from ontology node-stale", {
      runId: run.id,
      domainId,
      nodeId,
    });
  } catch (err) {
    // A duplicate run_key (idempotent replay) or transient failure must not
    // crash the subscriber; log and move on.
    ctx.logger.warn("Failed to create remediation run for node-stale", {
      error: String((err as Error)?.message ?? err),
      domainId,
      nodeId,
      runKey,
    });
  }
}

/**
 * Emit a cross-plugin `run-status-changed` event. Best-effort: an emit failure
 * must never fail the underlying run transition.
 */
async function emitRunStatusChanged(
  ctx: PluginContext,
  companyId: string,
  payload: { runId: string; runKey: string; from: string; to: string },
): Promise<void> {
  try {
    await ctx.events.emit("run-status-changed", companyId, payload);
  } catch (err) {
    ctx.logger.warn("Failed to emit run-status-changed", {
      error: String((err as Error)?.message ?? err),
      runId: payload.runId,
    });
  }
}

const plugin = definePlugin({
  async setup(ctx) {
    activeContext = ctx;
    store = new NpcStore(ctx.db);
    ctx.data.register("list-templates", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const jobFamily =
        typeof params.jobFamily === "string" && params.jobFamily.trim() !== "" ? params.jobFamily : undefined;
      return { templates: await requireStore().listTemplates(companyId, jobFamily) };
    });

    ctx.data.register("list-runs", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      return { runs: await requireStore().listRuns(companyId) };
    });

    ctx.data.register("list-artifacts", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const driftStatus =
        typeof params.driftStatus === "string" && params.driftStatus.trim() !== ""
          ? params.driftStatus
          : undefined;
      return { artifacts: await requireStore().listArtifacts(companyId, driftStatus) };
    });

    // Mutating actions backing usePluginAction(...) in the npc-factory UI.
    ctx.actions.register("create-template", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const template = await requireStore().createTemplate({
        companyId,
        templateKey:
          typeof params.templateKey === "string" && params.templateKey.trim() !== ""
            ? params.templateKey
            : `tpl-${Date.now()}`,
        name: requireString(params.name, "name"),
        roleType: typeof params.roleType === "string" ? (params.roleType as NpcRoleType) : undefined,
        jobFamily: typeof params.jobFamily === "string" ? (params.jobFamily as NpcJobFamily) : null,
        artifactType:
          typeof params.artifactType === "string" ? (params.artifactType as NpcArtifactType) : undefined,
      });
      await ctx.activity.log({
        companyId,
        message: `Created NPC template ${template.template_key}`,
        entityType: "npc_template",
        entityId: template.id,
      });
      return { template };
    });

    ctx.actions.register("create-run", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const run = await requireStore().createRun({
        companyId,
        runKey:
          typeof params.runKey === "string" && params.runKey.trim() !== ""
            ? params.runKey
            : `run-${Date.now()}`,
        templateId: typeof params.templateId === "string" ? params.templateId : null,
        jobFamily: typeof params.jobFamily === "string" ? (params.jobFamily as NpcJobFamily) : null,
        createdBy: "board",
      });
      return { run };
    });

    ctx.actions.register("transition-run", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const runId = requireString(params.runId, "runId");
      const before = await requireStore().getRun(companyId, runId);
      const to = requireString(params.to, "to") as NpcRunStatus;
      const run = await requireStore().transitionRun(companyId, runId, to, {});
      if (!run) throw new Error("Run not found");
      await emitRunStatusChanged(ctx, companyId, {
        runId: run.id,
        runKey: run.run_key,
        from: before?.status ?? "",
        to,
      });
      return { run };
    });

    ctx.actions.register("set-artifact-drift", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const artifact = await requireStore().setArtifactDrift(
        companyId,
        requireString(params.artifactId, "artifactId"),
        requireString(params.driftStatus, "driftStatus") as NpcDriftStatus,
        typeof params.driftReason === "string" ? params.driftReason : "",
      );
      if (!artifact) throw new Error("Artifact not found");
      return { artifact };
    });

    // Cross-plugin closed loop: react to ontology node-stale events by opening
    // a remediation workflow run (ontology -> npc-factory -> workflow).
    ctx.events.on(ONTOLOGY_NODE_STALE_EVENT, async (event) => {
      await handleOntologyNodeStale(ctx, event);
    });

    // Phase 7: when ontology ingests a new business system (typically
    // via the legacy-import wizard), open a discovery run so an NPC
    // team can be auto-spawned against it. Mirrors DS
    // `hatchOntologyAppTeam`. Idempotent on (businessSystemId) — replay
    // events are absorbed by the run_key uniqueness constraint.
    ctx.events.on(ONTOLOGY_BUSINESS_SYSTEM_CREATED_EVENT, async (event) => {
      await handleOntologyBusinessSystemCreated(ctx, event);
    });

    ctx.logger.info("NPC factory plugin worker started", { namespace: ctx.db.namespace });
  },

  async onHealth() {
    const ctx = activeContext;
    if (!ctx) return { status: "error" as const, message: "worker context not initialized" };
    return { status: "ok" as const, message: "npc-factory worker running", details: { namespace: ctx.db.namespace } };
  },

  async onApiRequest(input: PluginApiRequestInput): Promise<PluginApiResponse> {
    const ctx = requireContext();
    const s = requireStore();
    const companyId = input.companyId;

    switch (input.routeKey) {
      case "list-templates":
        return { body: { templates: await s.listTemplates(companyId, queryString(input.query.jobFamily)) } };

      case "get-template": {
        const t = await s.getTemplate(companyId, requireString(input.params.templateId, "templateId"));
        if (!t) return { status: 404, body: { error: "Template not found" } };
        return { body: { template: t } };
      }

      case "create-template": {
        const b = optionalRecord(input.body) ?? {};
        const template = await s.createTemplate({
          companyId,
          templateKey: requireString(b.templateKey, "templateKey"),
          name: requireString(b.name, "name"),
          displayName: typeof b.displayName === "string" ? b.displayName : undefined,
          description: typeof b.description === "string" ? b.description : undefined,
          roleType: typeof b.roleType === "string" ? (b.roleType as NpcRoleType) : undefined,
          jobFamily: typeof b.jobFamily === "string" ? (b.jobFamily as NpcJobFamily) : null,
          microserviceLayer: typeof b.microserviceLayer === "string" ? (b.microserviceLayer as NpcLayer) : null,
          artifactType: typeof b.artifactType === "string" ? (b.artifactType as NpcArtifactType) : undefined,
          capabilities: optionalRecord(b.capabilities),
          sop: Array.isArray(b.sop) ? b.sop : undefined,
          triggers: Array.isArray(b.triggers) ? b.triggers : undefined,
          adapterType: typeof b.adapterType === "string" ? b.adapterType : undefined,
          systemPrompt: typeof b.systemPrompt === "string" ? b.systemPrompt : undefined,
        });
        await ctx.activity.log({
          companyId,
          message: `Created NPC template ${template.template_key}`,
          entityType: "npc_template",
          entityId: template.id,
        });
        return { status: 201, body: { template } };
      }

      case "update-template": {
        const b = optionalRecord(input.body) ?? {};
        const template = await s.updateTemplate(companyId, requireString(input.params.templateId, "templateId"), {
          name: typeof b.name === "string" ? b.name : undefined,
          displayName: typeof b.displayName === "string" ? b.displayName : undefined,
          description: typeof b.description === "string" ? b.description : undefined,
          roleType: typeof b.roleType === "string" ? (b.roleType as NpcRoleType) : undefined,
          jobFamily: "jobFamily" in b ? (b.jobFamily as NpcJobFamily | null) : undefined,
          microserviceLayer: "microserviceLayer" in b ? (b.microserviceLayer as NpcLayer | null) : undefined,
          artifactType: typeof b.artifactType === "string" ? (b.artifactType as NpcArtifactType) : undefined,
          capabilities: optionalRecord(b.capabilities),
          sop: Array.isArray(b.sop) ? b.sop : undefined,
          triggers: Array.isArray(b.triggers) ? b.triggers : undefined,
          adapterType: typeof b.adapterType === "string" ? b.adapterType : undefined,
          systemPrompt: typeof b.systemPrompt === "string" ? b.systemPrompt : undefined,
          isActive: typeof b.isActive === "boolean" ? b.isActive : undefined,
          metadata: optionalRecord(b.metadata),
        });
        if (!template) return { status: 404, body: { error: "Template not found" } };
        return { body: { template } };
      }

      case "list-runs":
        return { body: { runs: await s.listRuns(companyId, parseInt10(queryString(input.query.limit))) } };

      case "get-run": {
        const run = await s.getRun(companyId, requireString(input.params.runId, "runId"));
        if (!run) return { status: 404, body: { error: "Run not found" } };
        return { body: { run } };
      }

      case "create-run": {
        const b = optionalRecord(input.body) ?? {};
        const run = await s.createRun({
          companyId,
          runKey: requireString(b.runKey, "runKey"),
          npcId: typeof b.npcId === "string" ? b.npcId : undefined,
          templateId: typeof b.templateId === "string" ? b.templateId : null,
          jobFamily: typeof b.jobFamily === "string" ? (b.jobFamily as NpcJobFamily) : null,
          issueRef: typeof b.issueRef === "string" ? b.issueRef : null,
          sessionRef: typeof b.sessionRef === "string" ? b.sessionRef : null,
          ontologyDomainRef: typeof b.ontologyDomainRef === "string" ? b.ontologyDomainRef : null,
        });
        return { status: 201, body: { run } };
      }

      case "transition-run": {
        const b = optionalRecord(input.body) ?? {};
        try {
          const runId = requireString(input.params.runId, "runId");
          const before = await s.getRun(companyId, runId);
          const to = requireString(b.to, "to") as NpcRunStatus;
          const run = await s.transitionRun(companyId, runId, to,
            { error: typeof b.error === "string" ? b.error : undefined });
          if (!run) return { status: 404, body: { error: "Run not found" } };
          await emitRunStatusChanged(ctx, companyId, {
            runId: run.id,
            runKey: run.run_key,
            from: before?.status ?? "",
            to,
          });
          return { body: { run } };
        } catch (err) {
          return { status: 422, body: { error: String((err as Error)?.message ?? err) } };
        }
      }

      case "append-run-step": {
        const b = optionalRecord(input.body) ?? {};
        const step: NpcRunStep = {
          stepNo: Number(b.stepNo) || 0,
          action: requireString(b.action, "action"),
          tool: typeof b.tool === "string" ? b.tool : undefined,
          status: typeof b.status === "string" ? (b.status as NpcRunStep["status"]) : undefined,
          output: typeof b.output === "string" ? b.output : undefined,
          error: typeof b.error === "string" ? b.error : undefined,
        };
        const run = await s.appendRunStep(companyId, requireString(input.params.runId, "runId"), step);
        if (!run) return { status: 404, body: { error: "Run not found" } };
        return { body: { run } };
      }

      case "list-artifacts":
        return { body: { artifacts: await s.listArtifacts(companyId, queryString(input.query.driftStatus)) } };

      case "register-artifact": {
        const b = optionalRecord(input.body) ?? {};
        const artifact = await s.registerArtifact({
          companyId,
          artifactKey: requireString(b.artifactKey, "artifactKey"),
          artifactType: typeof b.artifactType === "string" ? (b.artifactType as NpcArtifactType) : undefined,
          path: typeof b.path === "string" ? b.path : undefined,
          description: typeof b.description === "string" ? b.description : undefined,
          npcOwnerRef: typeof b.npcOwnerRef === "string" ? b.npcOwnerRef : null,
          businessSystemRef: typeof b.businessSystemRef === "string" ? b.businessSystemRef : null,
          subProjectRef: typeof b.subProjectRef === "string" ? b.subProjectRef : null,
          ontologyDomainRef: typeof b.ontologyDomainRef === "string" ? b.ontologyDomainRef : null,
          artifacts: Array.isArray(b.artifacts) ? b.artifacts : undefined,
        });
        return { status: 201, body: { artifact } };
      }

      case "set-artifact-drift": {
        const b = optionalRecord(input.body) ?? {};
        const artifact = await s.setArtifactDrift(
          companyId,
          requireString(input.params.artifactId, "artifactId"),
          requireString(b.driftStatus, "driftStatus") as NpcDriftStatus,
          typeof b.driftReason === "string" ? b.driftReason : "",
        );
        if (!artifact) return { status: 404, body: { error: "Artifact not found" } };
        return { body: { artifact } };
      }

      default:
        return { status: 404, body: { error: `Unknown npc-factory route: ${input.routeKey}` } };
    }
  },
});

/**
 * Phase 7 — react to a freshly-created business system by opening a
 * discovery run so an NPC team can be auto-spawned against it.
 *
 * The handler is best-effort: a duplicate run_key from a replayed
 * event is absorbed by the uniqueness constraint rather than
 * failing the subscriber. Other errors are logged so a transient
 * store hiccup doesn't blow up the cross-plugin loop.
 *
 * Why a discovery run rather than auto-creating the team directly:
 * a run gives the user a single place to inspect / abort / re-run
 * the spawn, and it ties the spawn to the activity log so the
 * cockpit's per-domain panel surfaces it.
 */
async function handleOntologyBusinessSystemCreated(
  ctx: PluginContext,
  event: PluginEvent,
): Promise<void> {
  const payload = optionalRecord(event.payload) ?? {};
  const companyId = event.companyId;
  const businessSystemId = str(payload.businessSystemId);
  const domainId = str(payload.ontologyDomainId);
  if (!companyId || !businessSystemId) {
    ctx.logger.warn("Ignoring business-system-created event with missing fields", {
      eventId: event.eventId,
      hasCompany: Boolean(companyId),
      hasBusinessSystem: Boolean(businessSystemId),
    });
    return;
  }
  const runKey = `ontology-bs-${businessSystemId}`;
  try {
    const run = await requireStore().createRun({
      companyId,
      runKey,
      jobFamily: null,
      ontologyDomainRef: domainId,
      createdBy: "plugin:ontology",
      metadata: {
        trigger: "ontology-business-system-created",
        businessSystemRef: businessSystemId,
        code: str(payload.code) ?? null,
        name: str(payload.name) ?? null,
        targetRole: str(payload.targetRole) ?? null,
        sourceEventId: event.eventId,
      },
    });
    await ctx.activity.log({
      companyId,
      message: `Opened discovery run for new business system ${str(payload.code) ?? businessSystemId}`,
      entityType: "npc_workflow_run",
      entityId: run.id,
      metadata: { businessSystemId, trigger: "ontology-business-system-created" },
    });
    ctx.logger.info("Created discovery run from ontology business-system-created", {
      runId: run.id,
      businessSystemId,
      domainId,
    });
  } catch (err) {
    ctx.logger.warn("Failed to create discovery run for business-system-created", {
      error: String((err as Error)?.message ?? err),
      businessSystemId,
      runKey,
    });
  }
}

export default plugin;
runWorker(plugin, import.meta.url);
