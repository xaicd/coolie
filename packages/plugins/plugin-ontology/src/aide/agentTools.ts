/**
 * Read-only tool surface for the digital aide.
 *
 * The aide used to answer from a static schema dump, which meant it could only
 * ever recite the catalog — it had no access to instance data at all. These
 * tools let it look up what is actually in the domain (object types with their
 * field schemas, instances with their property values, and the relations
 * between them) before answering.
 *
 * Every tool is read-only by design: questions must not mutate the model.
 * Writes go through Edit mode, which has its own prompt and apply path.
 *
 * All tools are thin projections over existing `GraphStore` methods — no new
 * SQL — and they never throw: a bad argument or a missing key comes back as
 * `{ error }` so the model can correct itself instead of the turn failing.
 */
import type {
  DescribeDomainResult,
  GraphStore,
  ImpactDirection,
} from "@paperclipai/ontology-core/graph/GraphStore.js";

/** Anthropic tool definition. */
export interface AideToolSpec {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** Cap the number of instances a single lookup may return. */
const MAX_INSTANCES = 25;
/** Cap each stringified property value so one huge field cannot flood the context. */
const MAX_VALUE_CHARS = 240;

function truncate(value: unknown): unknown {
  if (typeof value === "string" && value.length > MAX_VALUE_CHARS) {
    return `${value.slice(0, MAX_VALUE_CHARS)}…`;
  }
  return value;
}

function projectProperties(
  props: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!props || typeof props !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) out[key] = truncate(value);
  return out;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalStringArg(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function intArg(input: Record<string, unknown>, key: string, fallback: number): number {
  const value = input[key];
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** Compact, self-describing view of the domain — the aide's "table of contents". */
function domainOverview(result: DescribeDomainResult): Record<string, unknown> {
  return {
    domain: {
      slug: result.domain.slug,
      displayName: result.domain.display_name,
      version: result.domain.version,
      status: result.domain.status,
    },
    counts: result.counts,
    objectTypes: result.nodeTypes.map((nt) => ({
      id: nt.id,
      key: nt.key,
      displayName: nt.displayName,
      propertyCount:
        nt.propertiesSchema && typeof nt.propertiesSchema === "object"
          ? Object.keys(nt.propertiesSchema).length
          : 0,
      instanceCount: nt.instanceCount,
    })),
    relationTypes: result.relationTypes.map((rt) => ({
      id: rt.id,
      key: rt.key,
      displayName: rt.displayName,
      directed: rt.directed,
      instanceCount: rt.instanceCount,
    })),
    businessSystems: result.businessSystems.map((bs) => ({
      id: bs.id,
      code: bs.code,
      name: bs.name,
      status: bs.status,
    })),
    subProjects: result.subProjects.map((sp) => ({
      code: sp.code,
      name: sp.name,
      type: sp.type,
      status: sp.status,
    })),
    actionTypes: result.actionTypes.map((at) => ({
      id: at.id,
      key: at.key,
      displayName: at.displayName,
      kind: at.kind,
      status: at.status,
    })),
  };
}

export const AIDE_TOOL_SPECS: AideToolSpec[] = [
  {
    name: "domain_overview",
    description:
      "本域总览:对象类型目录(含属性个数与实例数)、关系类型、真实应用系统、业务子项目、动作类型,以及节点/边总数。想知道这个域建模了什么时先调它。",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_object_types",
    description: "只列对象类型清单(键、显示名、属性个数、实例数),不含属性细节。",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_object_type",
    description:
      "取某个对象类型的完整属性 schema(字段名、类型、枚举、格式)。回答「某类型有哪些字段」时必须调它。",
    input_schema: {
      type: "object",
      properties: { typeKey: { type: "string", description: "对象类型的 key" } },
      required: ["typeKey"],
    },
  },
  {
    name: "list_instances",
    description:
      "列实例及其属性值。可按对象类型过滤,也可用 query 在各字段里做关键词搜索。默认最多 25 条。",
    input_schema: {
      type: "object",
      properties: {
        typeKey: { type: "string", description: "按对象类型 key 过滤(可省略)" },
        query: { type: "string", description: "关键词,匹配 key/标签/属性值(可省略)" },
        limit: { type: "number", description: "最多返回条数,默认 25" },
      },
    },
  },
  {
    name: "get_instance",
    description:
      "按 key 取单个实例的完整属性值,以及它和其他实例之间的关系(关系名、方向、对端)。",
    input_schema: {
      type: "object",
      properties: { key: { type: "string", description: "实例的 key" } },
      required: ["key"],
    },
  },
  {
    name: "list_relation_types",
    description: "列关系类型(键、显示名、是否有向、实例数)。",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "find_path",
    description: "求两个实例之间的最短路径(按 key 指定两端)。",
    input_schema: {
      type: "object",
      properties: {
        fromKey: { type: "string" },
        toKey: { type: "string" },
        maxDepth: { type: "number", description: "最大深度,默认 6" },
      },
      required: ["fromKey", "toKey"],
    },
  },
  {
    name: "find_impact",
    description:
      "影响推演:给出某个实例的下游(downstream,它影响谁)或上游(upstream,谁影响它)可达集。",
    input_schema: {
      type: "object",
      properties: {
        nodeKey: { type: "string" },
        direction: { type: "string", enum: ["downstream", "upstream"] },
        maxDepth: { type: "number", description: "最大深度,默认 4" },
      },
      required: ["nodeKey"],
    },
  },
];

/**
 * Execute one tool call. Never throws: failures come back as `{ error }` so the
 * model gets a chance to retry with better arguments.
 */
export async function executeAideTool(
  store: GraphStore,
  companyId: string,
  domainId: string,
  name: string,
  rawInput: unknown,
): Promise<unknown> {
  const input = asRecord(rawInput);
  try {
    switch (name) {
      case "domain_overview":
        return domainOverview(await store.describeDomain(companyId, domainId));

      case "list_object_types": {
        const result = await store.describeDomain(companyId, domainId);
        return {
          objectTypes: result.nodeTypes.map((nt) => ({
            id: nt.id,
            key: nt.key,
            displayName: nt.displayName,
            propertyCount:
              nt.propertiesSchema && typeof nt.propertiesSchema === "object"
                ? Object.keys(nt.propertiesSchema).length
                : 0,
            instanceCount: nt.instanceCount,
          })),
        };
      }

      case "get_object_type": {
        const typeKey = optionalStringArg(input, "typeKey");
        if (!typeKey) return { error: "typeKey is required" };
        const result = await store.describeDomain(companyId, domainId);
        const found = result.nodeTypes.find((nt) => nt.key === typeKey);
        if (!found) {
          return {
            error: `object type "${typeKey}" not found`,
            availableKeys: result.nodeTypes.map((nt) => nt.key),
          };
        }
        return {
          id: found.id,
          key: found.key,
          displayName: found.displayName,
          description: found.description,
          layer: found.layer,
          instanceCount: found.instanceCount,
          properties: asRecord(found.propertiesSchema),
        };
      }

      case "list_relation_types": {
        const result = await store.describeDomain(companyId, domainId);
        return {
          relationTypes: result.relationTypes.map((rt) => ({
            id: rt.id,
            key: rt.key,
            displayName: rt.displayName,
            directed: rt.directed,
            instanceCount: rt.instanceCount,
          })),
        };
      }

      case "list_instances": {
        const typeKey = optionalStringArg(input, "typeKey");
        const query = optionalStringArg(input, "query")?.toLowerCase();
        const limit = Math.min(intArg(input, "limit", MAX_INSTANCES), MAX_INSTANCES);

        // Instance rows carry `node_type_id`, but object-type *keys* only exist
        // on the describe payload, so we need both to filter by key.
        const [nodes, described] = await Promise.all([
          store.listNodes(companyId, domainId, 1000),
          store.describeDomain(companyId, domainId),
        ]);
        const keyByTypeId = new Map(described.nodeTypes.map((nt) => [nt.id, nt.key]));

        let rows = nodes.map((node) => ({
          id: node.id,
          key: node.key,
          label: node.label,
          typeKey: node.node_type_id ? keyByTypeId.get(node.node_type_id) ?? null : null,
          lifecycleState: node.lifecycle_state,
          properties: projectProperties(node.properties),
        }));

        if (typeKey) rows = rows.filter((row) => row.typeKey === typeKey);
        if (query) {
          rows = rows.filter((row) => {
            if (row.key.toLowerCase().includes(query)) return true;
            if (row.label.toLowerCase().includes(query)) return true;
            // Include scalar non-strings so "12" finds a numeric headcount=12.
            return Object.values(row.properties).some((value) => {
              if (value === null || value === undefined) return false;
              if (typeof value === "object") return false;
              return String(value).toLowerCase().includes(query);
            });
          });
        }

        return {
          total: rows.length,
          returned: Math.min(rows.length, limit),
          instances: rows.slice(0, limit),
        };
      }

      case "get_instance": {
        const key = optionalStringArg(input, "key");
        if (!key) return { error: "key is required" };
        const node = await store.getNodeByKey(companyId, domainId, key);
        if (!node) return { error: `instance "${key}" not found` };

        const graph = await store.getGraphSnapshot(companyId, domainId, 2000);
        const byId = new Map(graph.nodes.map((n) => [n.id, n]));
        const self = byId.get(node.id);
        const relations = graph.edges
          .filter((edge) => edge.sourceNodeId === node.id || edge.targetNodeId === node.id)
          .map((edge) => {
            const outward = edge.sourceNodeId === node.id;
            const other = byId.get(outward ? edge.targetNodeId : edge.sourceNodeId);
            return {
              relation: edge.relationKey ?? null,
              direction: outward ? ("out" as const) : ("in" as const),
              nodeKey: other?.key ?? null,
              nodeLabel: other?.label ?? null,
            };
          });

        return {
          id: node.id,
          key: node.key,
          label: node.label,
          lifecycleState: node.lifecycle_state,
          properties: projectProperties(self?.properties ?? node.properties),
          relations,
        };
      }

      case "find_path": {
        const fromKey = optionalStringArg(input, "fromKey");
        const toKey = optionalStringArg(input, "toKey");
        if (!fromKey || !toKey) return { error: "fromKey and toKey are required" };
        const [from, to] = await Promise.all([
          store.getNodeByKey(companyId, domainId, fromKey),
          store.getNodeByKey(companyId, domainId, toKey),
        ]);
        if (!from) return { error: `instance "${fromKey}" not found` };
        if (!to) return { error: `instance "${toKey}" not found` };

        const path = await store.findPath({
          companyId,
          sourceNodeId: from.id,
          targetNodeId: to.id,
          maxDepth: Math.min(intArg(input, "maxDepth", 6), 12),
        });
        if (!path) return { found: false, path: [] };

        const graph = await store.getGraphSnapshot(companyId, domainId, 2000);
        const byId = new Map(graph.nodes.map((n) => [n.id, n]));
        return {
          found: true,
          path: path.map((hop) => {
            const node = byId.get(hop.nodeId);
            return { key: node?.key ?? null, label: node?.label ?? null, depth: hop.depth };
          }),
        };
      }

      case "find_impact": {
        const nodeKey = optionalStringArg(input, "nodeKey");
        if (!nodeKey) return { error: "nodeKey is required" };
        const node = await store.getNodeByKey(companyId, domainId, nodeKey);
        if (!node) return { error: `instance "${nodeKey}" not found` };

        const rawDirection = optionalStringArg(input, "direction");
        const direction: ImpactDirection = rawDirection === "upstream" ? "upstream" : "downstream";
        const impacted = await store.findImpact({
          companyId,
          rootNodeId: node.id,
          direction,
          maxDepth: Math.min(intArg(input, "maxDepth", 4), 10),
        });
        return {
          direction,
          impacted: impacted.map((entry) => ({
            nodeId: entry.nodeId,
            label: entry.label,
            depth: entry.depth,
          })),
        };
      }

      default:
        return {
          error: `unknown tool "${name}"`,
          availableTools: AIDE_TOOL_SPECS.map((spec) => spec.name),
        };
    }
  } catch (err) {
    return { error: String((err as Error)?.message ?? err) };
  }
}
