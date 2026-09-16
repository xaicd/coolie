/**
 * Perspectives: the same material, drawn for different readers.
 *
 * "原材料一样,视图不一样而已" — a product owner, an engineer on call and an
 * SRE are all looking at one domain, but they need different pictures of it.
 * The domain already holds both halves of the material: the object model
 * (types + the relations between them) and the architecture an import recorded
 * (services, their layer, stack, deployment facts and the calls between them).
 * These functions turn that material into the node/edge shape the canvas draws.
 *
 * Pure, so the mapping is testable without a browser, and so the eventual
 * server-side or export path can reuse it.
 *
 * Two rules the declarations follow:
 *
 *   - A perspective that has no material says so (`emptyReason`) instead of
 *     rendering a blank canvas. "Nothing here" and "we don't have that data"
 *     are different messages, and only one of them is actionable.
 *   - Nothing is invented to fill space. A service with no deploy facts is
 *     listed, not decorated with a default replica count.
 */
import type { GraphEdge, GraphNode, GraphNodeType } from "./graph-view.js";

export type PerspectiveId = "product" | "runtime" | "deployment";

/** An object type as the views need it. */
export interface PerspectiveNodeType {
  id: string;
  key: string;
  display_name?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** A relation *type*, with the endpoints an importer derived (when it did). */
export interface PerspectiveRelationType {
  id: string;
  key: string;
  display_name?: string | null;
  sourceNodeTypeKey?: string;
  targetNodeTypeKey?: string;
}

/** A service (sub-project) as the views need it. */
export interface PerspectiveService {
  id: string;
  name: string;
  code: string;
  microserviceLayer?: string | null;
  techStack?: string[] | null;
  buildConfig?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  dependencies?: Array<{ toServiceKey?: string | null; targetHint?: string; type?: string }> | null;
}

export interface PerspectiveInput {
  nodeTypes: PerspectiveNodeType[];
  relationTypes: PerspectiveRelationType[];
  services: PerspectiveService[];
}

export interface PerspectiveGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Legend entries — what the colours mean in this perspective. */
  legend: GraphNodeType[];
  /** What the legend axis is, for the caption. */
  legendAxis: string;
  /** Set when there is nothing to draw, explaining which half is missing. */
  emptyReason?: string;
  /**
   * Something the material says that the picture does not show — unresolved
   * calls, relation types with no endpoints, services with no deploy facts.
   * Surfaced, never silently dropped.
   */
  note?: string;
}

export interface Perspective {
  id: PerspectiveId;
  label: { zh: string; en: string };
  /** Who it is for — shown as the chip's tooltip. */
  audience: { zh: string; en: string };
  legendAxis: string;
}

export const PERSPECTIVES: Perspective[] = [
  {
    id: "product",
    label: { zh: "产品架构", en: "Product" },
    audience: {
      zh: "业务/产品视角:域里有哪些对象,它们之间是什么关系",
      en: "For product and business: which objects exist and how they relate",
    },
    legendAxis: "type",
  },
  {
    id: "runtime",
    label: { zh: "运行架构", en: "Runtime" },
    audience: {
      zh: "研发视角:服务按分层排布,以及谁调用谁",
      en: "For engineers: services by layer, and who calls whom",
    },
    legendAxis: "layer",
  },
  {
    id: "deployment",
    label: { zh: "部署架构", en: "Deployment" },
    audience: {
      zh: "运维视角:哪些服务部署在哪些环境,副本与端口",
      en: "For operators: what runs where, with replicas and ports",
    },
    legendAxis: "environment",
  },
];

const LAYER_LABELS: Record<string, string> = {
  L0: "L0 边缘 / 入口",
  L1: "L1 网关 / 编排",
  L2: "L2 业务服务",
  L3: "L3 共享能力",
  L4: "L4 数据 / 基础设施",
};

/** The legend entry for a group, synthesised so the canvas can colour by it. */
function groupNodeType(id: string, label: string, description: string): GraphNodeType {
  return { id, key: id, display_name: label, description } as GraphNodeType;
}

function edge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  relationKey: string | null,
): GraphEdge {
  return { id, sourceNodeId, targetNodeId, relationKey, weight: 1 };
}

/**
 * 产品架构 — the object model.
 *
 * Nodes are object types, edges are the relation types whose endpoints an
 * importer derived. A relation type with no endpoints is skipped rather than
 * guessed at: drawing an edge between the wrong two types is worse than drawing
 * none, and relation types routinely come from sources that never stated them.
 */
function resolveProduct(input: PerspectiveInput): PerspectiveGraph {
  const types = input.nodeTypes;
  if (types.length === 0) {
    return {
      nodes: [],
      edges: [],
      legend: [],
      legendAxis: "type",
      emptyReason: "本域还没有对象类型 — 先用「接入」导入旧系统,或在 Schema 里新建。",
    };
  }

  const idByKey = new Map(types.map((t) => [t.key, t.id]));
  const nodes: GraphNode[] = types.map((type) => ({
    id: type.id,
    key: type.key,
    label: type.display_name || type.key,
    nodeTypeId: type.id,
    properties: {
      ...(type.description ? { description: type.description } : {}),
    },
  }));

  const edges: GraphEdge[] = [];
  let unresolved = 0;
  for (const relation of input.relationTypes) {
    const source = relation.sourceNodeTypeKey ? idByKey.get(relation.sourceNodeTypeKey) : undefined;
    const target = relation.targetNodeTypeKey ? idByKey.get(relation.targetNodeTypeKey) : undefined;
    if (!source || !target) {
      unresolved += 1;
      continue;
    }
    edges.push(edge(relation.id, source, target, relation.key));
  }

  return {
    nodes,
    edges,
    legend: types.map((type) =>
      groupNodeType(type.id, type.display_name || type.key, type.key),
    ),
    legendAxis: "type",
    ...(unresolved > 0
      ? { note: `${unresolved} 个关系类型没有端点信息,未画线(导入来源未声明两端)` }
      : {}),
  };
}

/** The key a dependency points at, normalised the way service codes are. */
function normaliseServiceKey(value: string): string {
  return value.trim().toLowerCase();
}

function serviceIndex(services: PerspectiveService[]): Map<string, PerspectiveService> {
  const index = new Map<string, PerspectiveService>();
  for (const service of services) {
    index.set(normaliseServiceKey(service.code), service);
    index.set(normaliseServiceKey(service.name), service);
  }
  return index;
}

/** Services and the calls between them, coloured by microservice layer. */
function resolveRuntime(input: PerspectiveInput): PerspectiveGraph {
  const services = input.services;
  if (services.length === 0) {
    return {
      nodes: [],
      edges: [],
      legend: [],
      legendAxis: "layer",
      emptyReason:
        "还没有服务记录 — 目录扫描会识别 Maven/Gradle 模块与 spring.application.name,并在接入时写入。",
    };
  }

  const layers = [...new Set(services.map((s) => s.microserviceLayer ?? "L?"))].sort();
  const index = serviceIndex(services);

  const nodes: GraphNode[] = services.map((service) => ({
    id: service.id,
    key: service.code,
    label: service.name,
    nodeTypeId: `layer:${service.microserviceLayer ?? "L?"}`,
    properties: {
      ...(service.microserviceLayer ? { 分层: service.microserviceLayer } : {}),
      ...(service.techStack && service.techStack.length > 0
        ? { 技术栈: service.techStack.join(" · ") }
        : {}),
    },
  }));

  const edges: GraphEdge[] = [];
  const unresolvedTargets = new Set<string>();
  for (const service of services) {
    for (const [i, dependency] of (service.dependencies ?? []).entries()) {
      const key = dependency.toServiceKey;
      const target = key ? index.get(normaliseServiceKey(key)) : undefined;
      if (!target) {
        // "This service calls something we could not resolve" is a real finding
        // and must not read as "this service calls nothing".
        if (dependency.targetHint) unresolvedTargets.add(dependency.targetHint);
        continue;
      }
      if (target.id === service.id) continue;
      edges.push(
        edge(`${service.id}:dep:${i}`, service.id, target.id, dependency.type ?? "api-call"),
      );
    }
  }

  return {
    nodes,
    edges,
    legend: layers.map((layer) =>
      groupNodeType(`layer:${layer}`, LAYER_LABELS[layer] ?? layer, "微服务分层"),
    ),
    legendAxis: "layer",
    ...(unresolvedTargets.size > 0
      ? {
          note: `${unresolvedTargets.size} 个依赖目标未识别:${[...unresolvedTargets].slice(0, 4).join(", ")}`,
        }
      : {}),
  };
}

/** Where each service runs, coloured by the environments it declares. */
function resolveDeployment(input: PerspectiveInput): PerspectiveGraph {
  const services = input.services;
  if (services.length === 0) {
    return {
      nodes: [],
      edges: [],
      legend: [],
      legendAxis: "environment",
      emptyReason: "还没有服务记录,因此没有可部署的对象。",
    };
  }

  const deployOf = (service: PerspectiveService): Record<string, unknown> => {
    const fromMeta = service.metadata?.deploy;
    if (fromMeta && typeof fromMeta === "object") return fromMeta as Record<string, unknown>;
    const fromBuild = service.buildConfig?.deploy;
    return fromBuild && typeof fromBuild === "object" ? (fromBuild as Record<string, unknown>) : {};
  };

  const environmentOf = (service: PerspectiveService): string => {
    const envs = deployOf(service).envs;
    if (Array.isArray(envs) && envs.length > 0) return String(envs[0]);
    return "未声明环境";
  };

  const environments = [...new Set(services.map(environmentOf))].sort();
  const index = serviceIndex(services);

  const nodes: GraphNode[] = services.map((service) => {
    const deploy = deployOf(service);
    const ports = Array.isArray(deploy.ports) ? (deploy.ports as number[]) : [];
    const replicas = typeof deploy.replicas === "number" ? deploy.replicas : null;
    const image = typeof deploy.image === "string" ? deploy.image : undefined;
    return {
      id: service.id,
      key: service.code,
      label: service.name,
      nodeTypeId: `env:${environmentOf(service)}`,
      properties: {
        环境: environmentOf(service),
        ...(ports.length > 0 ? { 端口: ports.join(", ") } : {}),
        ...(replicas !== null ? { 副本: String(replicas) } : {}),
        ...(image ? { 镜像: image } : {}),
        ...(typeof deploy.namespace === "string" ? { 命名空间: deploy.namespace } : {}),
      },
    };
  });

  const edges: GraphEdge[] = [];
  for (const service of services) {
    for (const [i, dependency] of (service.dependencies ?? []).entries()) {
      const target = dependency.toServiceKey
        ? index.get(normaliseServiceKey(dependency.toServiceKey))
        : undefined;
      if (!target || target.id === service.id) continue;
      edges.push(
        edge(`${service.id}:dep:${i}`, service.id, target.id, dependency.type ?? "api-call"),
      );
    }
  }

  const withoutDeploy = services.filter((s) => {
    const deploy = deployOf(s);
    return Object.keys(deploy).length === 0;
  }).length;

  return {
    nodes,
    edges,
    legend: environments.map((env) =>
      groupNodeType(`env:${env}`, env, env === "未声明环境" ? "没有部署信息" : "部署环境"),
    ),
    legendAxis: "environment",
    ...(withoutDeploy > 0 ? { note: `${withoutDeploy} 个服务没有部署信息` } : {}),
  };
}

export function resolvePerspective(id: PerspectiveId, input: PerspectiveInput): PerspectiveGraph {
  switch (id) {
    case "runtime":
      return resolveRuntime(input);
    case "deployment":
      return resolveDeployment(input);
    case "product":
    default:
      return resolveProduct(input);
  }
}
