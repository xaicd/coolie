import {
  definePlugin,
  runWorker,
  type PluginApiRequestInput,
  type PluginApiResponse,
  type PluginContext,
} from "@paperclipai/plugin-sdk";
import {
  PostgresGraphStore,
  type GraphStore,
  type ImpactDirection,
} from "./graph/GraphStore.js";

let activeContext: PluginContext | null = null;
let graphStore: GraphStore | null = null;

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

const plugin = definePlugin({
  async setup(ctx) {
    activeContext = ctx;
    graphStore = new PostgresGraphStore(ctx.db);

    // Backs usePluginData("list-domains") in the plugin UI.
    ctx.data.register("list-domains", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const domains = await ctx.db.query(
        `SELECT id, company_id, slug, display_name, description, status, version
           FROM "${ctx.db.namespace}".ontology_domains
          WHERE company_id = $1
          ORDER BY created_at ASC`,
        [companyId],
      );
      return { domains };
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

      default:
        return { status: 404, body: { error: `Unknown ontology route: ${input.routeKey}` } };
    }
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
