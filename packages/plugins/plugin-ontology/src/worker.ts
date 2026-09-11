import {
  definePlugin,
  runWorker,
  type PluginApiRequestInput,
  type PluginApiResponse,
  type PluginContext,
} from "@paperclipai/plugin-sdk";
import {
  PostgresGraphStore,
  type CognitionShard,
  type GraphStore,
  type ImpactDirection,
} from "./graph/GraphStore.js";
import type {
  ActionKind,
  ActionTypeStatus,
  CognitionJobStatus,
  CognitionScale,
  DomainLifecycleState,
  FunctionStatus,
  FunctionType,
  NodeLayer,
} from "./enums.js";

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

const plugin = definePlugin({
  async setup(ctx) {
    activeContext = ctx;
    graphStore = new PostgresGraphStore(ctx.db);

    const store = requireGraphStore();

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
          const domain = await store.transitionDomainLifecycle(
            companyId,
            requireString(input.params.domainId, "domainId"),
            requireString(body.to, "to") as DomainLifecycleState,
            typeof body.actor === "string" ? body.actor : "system",
          );
          if (!domain) return { status: 404, body: { error: "Domain not found" } };
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

      default:
        return { status: 404, body: { error: `Unknown ontology route: ${input.routeKey}` } };
    }
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
