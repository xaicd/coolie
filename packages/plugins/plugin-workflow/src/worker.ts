import {
  definePlugin,
  runWorker,
  type PluginApiRequestInput,
  type PluginApiResponse,
  type PluginContext,
} from "@paperclipai/plugin-sdk";
import { WorkflowStore, type WorkflowNodeExecution } from "./store.js";
import type {
  WorkflowConfigStatus,
  WorkflowEngineMode,
  WorkflowExecutionStatus,
  WorkflowNodeStatus,
} from "./enums.js";

let activeContext: PluginContext | null = null;
let store: WorkflowStore | null = null;

function requireContext(): PluginContext {
  if (!activeContext) throw new Error("Workflow plugin worker context is not initialized");
  return activeContext;
}
function requireStore(): WorkflowStore {
  if (!store) store = new WorkflowStore(requireContext().db);
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

/**
 * Emit a cross-plugin `execution-status-changed` event. Best-effort: an emit
 * failure must never fail the underlying execution transition.
 */
async function emitExecutionStatusChanged(
  ctx: PluginContext,
  companyId: string,
  payload: { executionId: string; executionKey: string; from: string; to: string },
): Promise<void> {
  try {
    await ctx.events.emit("execution-status-changed", companyId, payload);
  } catch (err) {
    ctx.logger.warn("Failed to emit execution-status-changed", {
      error: String((err as Error)?.message ?? err),
      executionId: payload.executionId,
    });
  }
}

const plugin = definePlugin({
  async setup(ctx) {
    activeContext = ctx;
    store = new WorkflowStore(ctx.db);
    ctx.data.register("list-configs", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      return { configs: await requireStore().listConfigs(companyId) };
    });
    ctx.logger.info("Workflow plugin worker started", { namespace: ctx.db.namespace });
  },

  async onHealth() {
    const ctx = activeContext;
    if (!ctx) return { status: "error" as const, message: "worker context not initialized" };
    return { status: "ok" as const, message: "workflow worker running", details: { namespace: ctx.db.namespace } };
  },

  async onApiRequest(input: PluginApiRequestInput): Promise<PluginApiResponse> {
    const ctx = requireContext();
    const s = requireStore();
    const companyId = input.companyId;

    switch (input.routeKey) {
      case "list-configs":
        return { body: { configs: await s.listConfigs(companyId, queryString(input.query.category)) } };

      case "get-config": {
        const config = await s.getConfig(companyId, requireString(input.params.configId, "configId"));
        if (!config) return { status: 404, body: { error: "Config not found" } };
        return { body: { config } };
      }

      case "create-config": {
        const b = optionalRecord(input.body) ?? {};
        const config = await s.createConfig({
          companyId,
          configKey: requireString(b.configKey, "configKey"),
          name: requireString(b.name, "name"),
          description: typeof b.description === "string" ? b.description : undefined,
          category: typeof b.category === "string" ? b.category : undefined,
          nodes: Array.isArray(b.nodes) ? b.nodes : undefined,
          edges: Array.isArray(b.edges) ? b.edges : undefined,
          execution: optionalRecord(b.execution),
          executionMode: typeof b.executionMode === "string" ? (b.executionMode as WorkflowEngineMode) : undefined,
          triggers: Array.isArray(b.triggers) ? b.triggers : undefined,
          isTemplate: typeof b.isTemplate === "boolean" ? b.isTemplate : undefined,
        });
        await ctx.activity.log({
          companyId,
          message: `Created workflow config ${config.config_key}`,
          entityType: "workflow_config",
          entityId: config.id,
        });
        return { status: 201, body: { config } };
      }

      case "update-config": {
        const b = optionalRecord(input.body) ?? {};
        const config = await s.updateConfig(companyId, requireString(input.params.configId, "configId"), {
          name: typeof b.name === "string" ? b.name : undefined,
          description: typeof b.description === "string" ? b.description : undefined,
          category: typeof b.category === "string" ? b.category : undefined,
          nodes: Array.isArray(b.nodes) ? b.nodes : undefined,
          edges: Array.isArray(b.edges) ? b.edges : undefined,
          execution: optionalRecord(b.execution),
          executionMode: typeof b.executionMode === "string" ? (b.executionMode as WorkflowEngineMode) : undefined,
          triggers: Array.isArray(b.triggers) ? b.triggers : undefined,
          status: typeof b.status === "string" ? (b.status as WorkflowConfigStatus) : undefined,
          enabled: typeof b.enabled === "boolean" ? b.enabled : undefined,
          metadata: optionalRecord(b.metadata),
        });
        if (!config) return { status: 404, body: { error: "Config not found" } };
        return { body: { config } };
      }

      case "list-executions":
        return { body: { executions: await s.listExecutions(companyId, parseInt10(queryString(input.query.limit))) } };

      case "get-execution": {
        const execution = await s.getExecution(companyId, requireString(input.params.executionId, "executionId"));
        if (!execution) return { status: 404, body: { error: "Execution not found" } };
        return { body: { execution } };
      }

      case "create-execution": {
        const b = optionalRecord(input.body) ?? {};
        const execution = await s.createExecution({
          companyId,
          executionKey: requireString(b.executionKey, "executionKey"),
          workflowId: typeof b.workflowId === "string" ? b.workflowId : null,
          workflowName: typeof b.workflowName === "string" ? b.workflowName : undefined,
          workflowVersion: typeof b.workflowVersion === "string" ? b.workflowVersion : undefined,
          triggerType: typeof b.triggerType === "string" ? b.triggerType : undefined,
          inputs: optionalRecord(b.inputs),
          sessionRef: typeof b.sessionRef === "string" ? b.sessionRef : null,
          issueRef: typeof b.issueRef === "string" ? b.issueRef : null,
        });
        return { status: 201, body: { execution } };
      }

      case "transition-execution": {
        const b = optionalRecord(input.body) ?? {};
        try {
          const executionId = requireString(input.params.executionId, "executionId");
          const before = await s.getExecution(companyId, executionId);
          const to = requireString(b.to, "to") as WorkflowExecutionStatus;
          const execution = await s.transitionExecution(companyId, executionId, to,
            { error: typeof b.error === "string" ? b.error : undefined, outputs: optionalRecord(b.outputs) });
          if (!execution) return { status: 404, body: { error: "Execution not found" } };
          await emitExecutionStatusChanged(ctx, companyId, {
            executionId: execution.id,
            executionKey: execution.execution_key,
            from: before?.status ?? "",
            to,
          });
          return { body: { execution } };
        } catch (err) {
          return { status: 422, body: { error: String((err as Error)?.message ?? err) } };
        }
      }

      case "update-node-execution": {
        const b = optionalRecord(input.body) ?? {};
        const node: WorkflowNodeExecution = {
          nodeId: requireString(b.nodeId, "nodeId"),
          status: typeof b.status === "string" ? (b.status as WorkflowNodeStatus) : undefined,
          agentName: typeof b.agentName === "string" ? b.agentName : undefined,
          output: b.output,
          error: typeof b.error === "string" ? b.error : undefined,
        };
        const execution = await s.updateNodeExecution(companyId, requireString(input.params.executionId, "executionId"), node);
        if (!execution) return { status: 404, body: { error: "Execution not found" } };
        return { body: { execution } };
      }

      default:
        return { status: 404, body: { error: `Unknown workflow route: ${input.routeKey}` } };
    }
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
