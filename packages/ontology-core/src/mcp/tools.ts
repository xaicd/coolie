/**
 * The ontology's agent tools.
 *
 * The contract already says which operations an agent may reach
 * (`CORE_API` with `agentExposed`); this turns them into something an agent can
 * actually call, with the description and input schema a model needs to pick the
 * right one. Inside Paperclip the plugin registers these through `ctx.tools`;
 * a standalone deployment serves the same catalogue over MCP. One catalogue, so
 * the two cannot describe the domain differently.
 *
 * The catalogue is **derived from the contract, not maintained beside it**:
 * `tests/mcp-tools.spec.ts` fails if an agent-visible operation has no tool, or
 * if a tool wraps something agents may not see. Adding an operation therefore
 * forces the decision about how an agent calls it.
 *
 * Two deliberate choices about the inputs:
 *
 *   - Tools take a domain **slug or id** and node **keys**, not internal ids.
 *     A key is what the other tools return (`SysUser`, `order-service`) and it
 *     survives a re-import; a uuid does not.
 *   - A tool that cannot resolve what it was given says so. Returning an empty
 *     list for a typo would read as "this domain has nothing", which is the
 *     failure mode that makes an agent confidently wrong.
 */

import type { GraphStore } from "../graph/GraphStore.js";
import { architectureToArchifyIr, type ArchifyServiceInput } from "../export/archify.js";
import { visibleViews, withheldViews } from "../views.js";

export interface OntologyTool {
  /** Tool name as an agent sees it. */
  name: string;
  /** The contract operation this wraps. */
  routeKey: string;
  displayName: string;
  /** Read by the model to decide when to call it. */
  description: string;
  /** JSON Schema for the arguments. */
  parametersSchema: Record<string, unknown>;
  invoke: (
    store: GraphStore,
    companyId: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
}

function str(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function num(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function required(args: Record<string, unknown>, key: string): string {
  const value = str(args, key);
  if (!value) throw new Error(`Missing required argument: ${key}`);
  return value;
}

/** The domain a tool acts on: a slug is friendlier, an id is unambiguous. */
async function resolveDomain(
  store: GraphStore,
  companyId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const id = str(args, "domainId");
  if (id) return id;
  const slug = str(args, "domainSlug");
  if (!slug) throw new Error("Provide domainSlug (or domainId)");
  const domain = await store.getDomainBySlug(companyId, slug);
  if (!domain) throw new Error(`No such domain: ${slug}`);
  return domain.id;
}

async function resolveNodeId(
  store: GraphStore,
  companyId: string,
  domainId: string,
  args: Record<string, unknown>,
  key: string,
): Promise<string> {
  const nodeKey = required(args, key);
  const node = await store.getNodeByKey(companyId, domainId, nodeKey);
  if (!node) throw new Error(`No such node in this domain: ${nodeKey}`);
  return node.id;
}

/**
 * The domain selector every domain-scoped tool takes, plus whatever else that
 * tool needs. `alsoRequired` is separate from `extra` because a property that is
 * declared but not required is a schema the model can legitimately call without
 * — which, for the proposal tool, meant proposing a change with no title.
 */
function domainParams(
  extra: Record<string, unknown> = {},
  alsoRequired: string[] = [],
): Record<string, unknown> {
  return {
    type: "object",
    required: ["domainSlug", ...alsoRequired],
    properties: {
      domainSlug: { type: "string", description: "本体域的 slug(例如 orders)" },
      ...extra,
    },
  };
}

const DOMAIN_ONLY = {
  type: "object",
  properties: {
    domainSlug: { type: "string", description: "只查这一个域;省略则返回全部域" },
  },
};

export const ONTOLOGY_TOOLS: OntologyTool[] = [
  {
    name: "ontology_list_domains",
    routeKey: "list-domains",
    displayName: "列出本体域",
    description:
      "List the ontology domains in this company. Start here when you do not know which domain holds the answer.",
    parametersSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "只看这一个域(按 slug 过滤)" },
      },
    },
    invoke: async (store, companyId, args) => {
      const slug = str(args, "slug");
      const domains = await store.listDomains(companyId);
      return { domains: slug ? domains.filter((d) => d.slug === slug) : domains };
    },
  },
  {
    name: "ontology_get_domain",
    routeKey: "get-domain",
    displayName: "本体域详情",
    description:
      "One domain, including its schema_version — the version of the model. Quote it when you report a finding, so the answer can be traced to the model it came from.",
    parametersSchema: domainParams(),
    invoke: async (store, companyId, args) => {
      const domainId = await resolveDomain(store, companyId, args);
      const domain = await store.getDomain(companyId, domainId);
      if (!domain) throw new Error("Domain not found");
      return { domain };
    },
  },
  {
    name: "ontology_list_object_types",
    routeKey: "list-node-types",
    displayName: "列出对象类型",
    description:
      "The object types ( entities ) in a domain, each with its fields. This is the business vocabulary — use it before writing anything that names entities.",
    parametersSchema: domainParams({
      withFields: { type: "boolean", description: "是否附带字段定义(默认 true)" },
    }),
    invoke: async (store, companyId, args) => {
      const domainId = await resolveDomain(store, companyId, args);
      const types = await store.listNodeTypes(companyId, domainId);
      if (args.withFields === false) {
        return { objectTypes: types.map((t) => ({ key: t.key, displayName: t.display_name })) };
      }
      return { objectTypes: types };
    },
  },
  {
    name: "ontology_get_object_type",
    routeKey: "list-node-types",
    displayName: "单个对象类型",
    description:
      "One object type by key, with its fields and where it came from (source files, mapped table). Use it to answer 'what fields does X have'.",
    parametersSchema: domainParams({
      key: { type: "string", description: "对象类型的 key,例如 SysUser" },
    }),
    invoke: async (store, companyId, args) => {
      const domainId = await resolveDomain(store, companyId, args);
      const key = required(args, "key");
      const types = await store.listNodeTypes(companyId, domainId);
      const found = types.find((t) => t.key === key);
      if (!found) throw new Error(`No such object type in this domain: ${key}`);
      return { objectType: found };
    },
  },
  {
    name: "ontology_list_relation_types",
    routeKey: "list-relation-types",
    displayName: "列出关系类型",
    description:
      "The relation types in a domain, with the endpoints an importer derived. Use it to answer how two object types can be connected.",
    parametersSchema: domainParams(),
    invoke: async (store, companyId, args) => {
      const domainId = await resolveDomain(store, companyId, args);
      return { relationTypes: await store.listRelationTypes(companyId, domainId) };
    },
  },
  {
    name: "ontology_list_functions",
    routeKey: "list-functions",
    displayName: "列出函数",
    description: "Functions defined on a domain, with their input and output schemas.",
    parametersSchema: domainParams(),
    invoke: async (store, companyId, args) => {
      const domainId = await resolveDomain(store, companyId, args);
      return { functions: await store.listFunctions(companyId, domainId) };
    },
  },
  {
    name: "ontology_list_interfaces",
    routeKey: "list-interfaces",
    displayName: "列出接口类型",
    description: "Interface types a domain defines, which object types may implement.",
    parametersSchema: domainParams(),
    invoke: async (store, companyId, args) => {
      const domainId = await resolveDomain(store, companyId, args);
      return { interfaces: await store.listInterfaces(companyId, domainId) };
    },
  },
  {
    name: "ontology_list_action_types",
    routeKey: "list-action-types",
    displayName: "列出动作类型",
    description:
      "The operations a domain exposes, with their HTTP contract. Use it to answer 'what can be done with this entity'.",
    parametersSchema: domainParams(),
    invoke: async (store, companyId, args) => {
      const domainId = await resolveDomain(store, companyId, args);
      return { actionTypes: await store.listActionTypes(companyId, domainId) };
    },
  },
  {
    name: "ontology_list_snapshots",
    routeKey: "list-domain-snapshots",
    displayName: "列出 schema 版本快照",
    description:
      "Named snapshots of a domain's schema. Use it to see how the model evolved, or to name a version in a report.",
    parametersSchema: domainParams(),
    invoke: async (store, companyId, args) => {
      const domainId = await resolveDomain(store, companyId, args);
      return { snapshots: await store.listDomainSnapshots(companyId, domainId) };
    },
  },
  {
    name: "ontology_graph_snapshot",
    routeKey: "graph-snapshot",
    displayName: "实例图快照",
    description:
      "A bounded snapshot of a domain's instances and relations, plus counts. Prefer the object-type tools for questions about the model; use this for questions about actual data. It is capped, and the counts tell you when it was.",
    parametersSchema: domainParams({
      nodeLimit: { type: "number", description: "返回节点数上限(默认由服务端决定,最大 2000)" },
    }),
    invoke: async (store, companyId, args) => {
      const domainId = await resolveDomain(store, companyId, args);
      return { graph: await store.getGraphSnapshot(companyId, domainId, num(args, "nodeLimit")) };
    },
  },
  {
    name: "ontology_find_path",
    routeKey: "find-path",
    displayName: "两点之间最短路径",
    description:
      "The shortest directed path between two instances, by node key. Answers 'how is A connected to B'. Returns null when there is no path — that is a finding, not an error.",
    parametersSchema: domainParams({
      sourceKey: { type: "string", description: "起点的节点 key" },
      targetKey: { type: "string", description: "终点的节点 key" },
      maxDepth: { type: "number", description: "最大跳数(默认 12,上限 64)" },
    }),
    invoke: async (store, companyId, args) => {
      const domainId = await resolveDomain(store, companyId, args);
      const sourceNodeId = await resolveNodeId(store, companyId, domainId, args, "sourceKey");
      const targetNodeId = await resolveNodeId(store, companyId, domainId, args, "targetKey");
      const path = await store.findPath({
        companyId,
        sourceNodeId,
        targetNodeId,
        maxDepth: num(args, "maxDepth"),
      });
      return { path };
    },
  },
  {
    name: "ontology_find_impact",
    routeKey: "find-impact",
    displayName: "影响范围",
    description:
      "What an instance affects downstream, or what it depends on upstream. Use it before changing something, or when asked 'what breaks if this changes'. It reports the authored graph, not runtime impact.",
    parametersSchema: domainParams({
      nodeKey: { type: "string", description: "根节点 key" },
      direction: { type: "string", enum: ["downstream", "upstream"], description: "默认 downstream" },
      maxDepth: { type: "number", description: "最大跳数(默认 12,上限 64)" },
    }),
    invoke: async (store, companyId, args) => {
      const domainId = await resolveDomain(store, companyId, args);
      const rootNodeId = await resolveNodeId(store, companyId, domainId, args, "nodeKey");
      const direction = args.direction === "upstream" ? "upstream" : "downstream";
      const impacted = await store.findImpact({
        companyId,
        rootNodeId,
        direction,
        maxDepth: num(args, "maxDepth"),
      });
      return { direction, impacted };
    },
  },
  {
    name: "ontology_list_business_systems",
    routeKey: "list-business-systems",
    displayName: "列出业务系统",
    description:
      "The business systems in this company, and which ontology domain each is bound to. Use it to answer organisational rather than modelling questions.",
    parametersSchema: { type: "object", properties: { limit: { type: "number" } } },
    invoke: async (store, companyId, args) => ({
      businessSystems: await store.listBusinessSystems(companyId, num(args, "limit")),
    }),
  },
  {
    name: "ontology_get_business_system",
    routeKey: "get-business-system",
    displayName: "业务系统详情",
    description: "One business system by id, with its governance metadata.",
    parametersSchema: {
      type: "object",
      required: ["businessSystemId"],
      properties: { businessSystemId: { type: "string" } },
    },
    invoke: async (store, companyId, args) => {
      const system = await store.getBusinessSystem(companyId, required(args, "businessSystemId"));
      if (!system) throw new Error("Business system not found");
      return { businessSystem: system };
    },
  },
  {
    name: "ontology_list_services",
    routeKey: "list-sub-projects",
    displayName: "列出服务(运行架构)",
    description:
      "The services a domain is built from: their microservice layer, tech stack, deployment facts and the calls between them. This is the run-time architecture an import recorded.",
    parametersSchema: domainParams(),
    invoke: async (store, companyId, args) => {
      const domainId = await resolveDomain(store, companyId, args);
      return { services: await store.listDomainSubProjects(companyId, domainId) };
    },
  },
  {
    name: "ontology_architecture_diagram",
    routeKey: "architecture-diagram",
    displayName: "架构图 IR",
    description:
      "A domain's architecture as an Archify diagram IR, ready to render as an interactive HTML/SVG page. Nothing is stored; the diagram is a product of the model.",
    parametersSchema: domainParams(),
    invoke: async (store, companyId, args) => {
      const domainId = await resolveDomain(store, companyId, args);
      const [domain, rows] = await Promise.all([
        store.getDomain(companyId, domainId),
        store.listDomainSubProjects(companyId, domainId),
      ]);
      const services: ArchifyServiceInput[] = rows.map((row) => ({
        code: row.code,
        name: row.name,
        microserviceLayer: row.microservice_layer,
        type: row.type,
        techStack: row.tech_stack,
        buildConfig: row.build_config,
        metadata: row.metadata,
        dependencies: Array.isArray(row.dependencies)
          ? (row.dependencies as ArchifyServiceInput["dependencies"])
          : [],
      }));
      return {
        diagram: architectureToArchifyIr(services, {
          title: `${domain?.display_name ?? "本体域"} · 运行架构`,
          subtitle: "由本体域的架构原料生成(服务 + 依赖 + 部署事实)",
          views: [
            { id: "runtime", label: "运行架构", focus: services.map((s) => s.code), note: "谁调用谁" },
          ],
        }),
      };
    },
  },
  {
    name: "ontology_list_capability_gaps",
    routeKey: "list-capability-gaps",
    displayName: "列出能力缺口",
    description: "Open capability gaps recorded against this company.",
    parametersSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "按状态过滤" },
        limit: { type: "number" },
      },
    },
    invoke: async (store, companyId, args) => ({
      capabilityGaps: await store.listCapabilityGaps(
        companyId,
        str(args, "status"),
        num(args, "limit"),
      ),
    }),
  },
  {
    name: "ontology_capability_resolutions",
    routeKey: "list-capability-resolutions",
    displayName: "能力缺口的解析轨迹",
    description:
      "How a capability gap was resolved, and from where. Use it to answer 'have we solved this before'.",
    parametersSchema: {
      type: "object",
      required: ["gapId"],
      properties: { gapId: { type: "string", description: "能力缺口 id" } },
    },
    invoke: async (store, companyId, args) => ({
      resolutions: await store.listCapabilityResolutions(companyId, required(args, "gapId")),
    }),
  },
  {
    name: "ontology_list_proposals",
    routeKey: "list-proposals",
    displayName: "列出提案",
    description:
      "Change proposals for a domain and their review state. An agent may read these and write new ones, but never decide them.",
    parametersSchema: domainParams({
      status: { type: "string", enum: ["proposed", "approved", "rejected", "applied"] },
    }),
    invoke: async (store, companyId, args) => {
      const domainId = await resolveDomain(store, companyId, args);
      const status = str(args, "status");
      return {
        proposals: await store.listProposals(
          companyId,
          domainId,
          status as Parameters<GraphStore["listProposals"]>[2],
        ),
      };
    },
  },
  {
    name: "ontology_list_views",
    routeKey: "list-views",
    displayName: "列出已保存的视图",
    description:
      "The saved views of a domain: named arrangements of the model, such as a runtime or deployment reading. Use one when a question refers to a view by name, so you and the team look at the same picture. Views you cannot open are reported too.",
    parametersSchema: domainParams({
      actor: { type: "string", description: "调用方身份,用于创建者判断(可选)。角色由凭证决定,不接受调用方声明。" },
    }),
    invoke: async (store, companyId, args) => {
      const domainId = await resolveDomain(store, companyId, args);
      const views = await store.listViews(companyId, domainId);
      // The caller's roles are supplied by whatever authenticated them — the
      // host for the plugin, the key for a standalone server. Defaulting to the
      // agent role here would be the safe guess, but a server that knows better
      // passes it in.
      const supplied = Array.isArray(args.roles)
        ? (args.roles as unknown[]).filter((role): role is string => typeof role === "string")
        : ["agent"];
      const audience = {
        roles: supplied,
        ...(str(args, "actor") ? { actor: str(args, "actor") } : {}),
      };
      return {
        views: visibleViews(views, audience),
        withheld: withheldViews(views, audience).map((view) => ({
          key: view.key,
          name: view.name,
          visibility: view.visibility,
        })),
      };
    },
  },
  {
    name: "ontology_propose_change",
    routeKey: "create-proposal",
    displayName: "提交变更提案",
    description:
      "Propose a change to the model. This is the only write an agent may perform, and it changes nothing until a human or a rule decides it. Describe what you propose and why; a reviewer reads the summary, not your reasoning trace.",
    parametersSchema: domainParams({
      title: { type: "string", description: "一句话说明这次变更" },
      summary: { type: "string", description: "为什么改:依据、影响面、替代方案" },
      operation: {
        type: "string",
        enum: ["update-node-type", "create-node-type"],
        description: "要执行的操作",
      },
      nodeTypeId: { type: "string", description: "update-node-type 必填" },
      key: { type: "string", description: "create-node-type 必填" },
      displayName: { type: "string", description: "create-node-type 必填" },
      propertiesSchema: { type: "object", description: "新的字段定义" },
      propertyRenames: {
        type: "object",
        description: "字段改名 oldKey -> newKey;声明了才会把存量实例的数据一起搬走",
      },
    }, ["title", "operation"]),
    invoke: async (store, companyId, args) => {
      const domainId = await resolveDomain(store, companyId, args);
      const operation = required(args, "operation");
      const proposal = await store.createProposal({
        companyId,
        domainId,
        title: required(args, "title"),
        summary: str(args, "summary") ?? "",
        authorKind: "agent",
        author: str(args, "author") ?? "agent",
        payload: {
          operation,
          ...(str(args, "nodeTypeId") ? { nodeTypeId: str(args, "nodeTypeId") } : {}),
          ...(str(args, "key") ? { key: str(args, "key") } : {}),
          ...(str(args, "displayName") ? { displayName: str(args, "displayName") } : {}),
          ...(args.propertiesSchema ? { propertiesSchema: args.propertiesSchema } : {}),
          ...(args.propertyRenames ? { propertyRenames: args.propertyRenames } : {}),
        },
        blastRadius: { proposedBy: "agent" },
      });
      return { proposal };
    },
  },
];

export function ontologyToolByName(name: string): OntologyTool | undefined {
  return ONTOLOGY_TOOLS.find((tool) => tool.name === name);
}

/**
 * Run one tool.
 *
 * Errors are rethrown rather than returned as empty results: an agent that asked
 * about a domain that does not exist must be told, or it will report that the
 * domain has nothing in it.
 */
export async function callOntologyTool(
  store: GraphStore,
  companyId: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const tool = ontologyToolByName(name);
  if (!tool) throw new Error(`Unknown ontology tool: ${name}`);
  return tool.invoke(store, companyId, args);
}
