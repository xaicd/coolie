import {
  definePlugin,
  runWorker,
  type PluginApiRequestInput,
  type PluginApiResponse,
  type PluginContext,
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

const plugin = definePlugin({
  async setup(ctx) {
    activeContext = ctx;
    store = new NpcStore(ctx.db);
    ctx.data.register("list-templates", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      return { templates: await requireStore().listTemplates(companyId) };
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
          const run = await s.transitionRun(companyId, requireString(input.params.runId, "runId"),
            requireString(b.to, "to") as NpcRunStatus,
            { error: typeof b.error === "string" ? b.error : undefined });
          if (!run) return { status: 404, body: { error: "Run not found" } };
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

export default plugin;
runWorker(plugin, import.meta.url);
