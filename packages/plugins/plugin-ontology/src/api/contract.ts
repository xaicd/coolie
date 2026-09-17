/**
 * The core API contract.
 *
 * This is the boundary the rest of the system is meant to talk to. Today the
 * workbench, the host and (eventually) DSH's `ontology-mcp` all reach the
 * ontology through these operations; the point of declaring them here is that
 * the eventual standalone service keeps the same surface, so moving the core out
 * of the plugin is a deployment change rather than a rewrite.
 *
 * The manifest already declares each route for the *host* — method, path, auth,
 * capability. What it cannot express is the part a consumer needs:
 *
 *   - **which service owns it** (schema / fact / mapping / query / …), so the
 *     surface is navigable rather than a flat list of 86 routes;
 *   - **whether an agent should see it**, which is a judgement, not a
 *     derivation — an agent needs the domain's business knowledge, not its
 *     audit log or its evaluation bench;
 *   - **what version of the contract** this is, because an independently
 *     deployed core has to evolve without breaking DSH.
 *
 * `tests/api-contract.spec.ts` binds this to the manifest and to the worker's
 * dispatch table, so a route cannot be added to one and forgotten in the others.
 *
 * One field every reader should look at: the domain's `schemaVersion`, bumped by
 * every accepted change to the object model. An answer that names the model
 * version it came from is reproducible; one that does not is a rumour. The
 * versioning contract itself is `doc/plans/2026-09-17-ontology-standalone-and-upgrade.md` §4.
 */

/** Bump when an existing route's shape changes in a way a caller must handle. */
export const CORE_API_VERSION = 1;

/**
 * Which part of the core owns a route. These follow the service split the
 * standalone architecture is built on, so a route's group is also its future
 * home.
 */
export type CoreApiGroup =
  | "ops"
  | "schema"
  | "fact"
  | "mapping"
  | "query"
  | "governance"
  | "bench"
  | "umodel";

export interface CoreApiRoute {
  routeKey: string;
  group: CoreApiGroup;
  /** One line: what a caller gets back. */
  purpose: string;
  /**
   * Whether `ontology-mcp` should expose this to an agent.
   *
   * The rule is reads that carry the domain's own knowledge. Mutations are
   * board-only by design — an agent may propose a change, but publishing stays
   * with a human or a rule — and reporting another agent cannot see them is
   * worse than not exposing them at all.
   */
  agentExposed: boolean;
}

/** Local shorthand: the list below is long and should stay readable. */
function r(
  routeKey: string,
  group: CoreApiGroup,
  agentExposed: boolean,
  purpose: string,
): CoreApiRoute {
  return { routeKey, group, agentExposed, purpose };
}

export const CORE_API: CoreApiRoute[] = [
  // --- ops ------------------------------------------------------------------
  r("health", "ops", false, "存活与版本探测"),
  r("list-audit-logs", "ops", false, "审计流水(运维面)"),
  r("list-package-installs", "ops", false, "包安装记录"),
  r("create-package-install", "ops", false, "登记一次包安装"),

  // --- schema: the object model ---------------------------------------------
  r("list-domains", "schema", true, "列出本体域"),
  r("create-domain", "schema", false, "新建本体域"),
  r("get-domain", "schema", true, "单个本体域,含 schema_version(模型版本)"),
  r("update-domain", "schema", false, "改本体域元数据"),
  r("transition-domain", "schema", false, "推进本体域生命周期"),
  r("snapshot-domain", "schema", false, "给当前 schema 存快照"),
  r("list-domain-snapshots", "schema", true, "schema 历史版本"),
  r("list-node-types", "schema", true, "列出对象类型"),
  r("create-node-type", "schema", false, "新建对象类型"),
  r("update-node-type", "schema", false, "改对象类型(含字段)"),
  r("delete-node-type", "schema", false, "删对象类型"),
  r("list-relation-types", "schema", true, "列出关系类型"),
  r("create-relation-type", "schema", false, "新建关系类型"),
  r("update-relation-type", "schema", false, "改关系类型"),
  r("delete-relation-type", "schema", false, "删关系类型"),
  r("list-functions", "schema", true, "列出函数定义"),
  r("create-function", "schema", false, "新建函数定义"),
  r("update-function", "schema", false, "改函数定义"),
  r("delete-function", "schema", false, "删函数定义"),
  r("list-interfaces", "schema", true, "列出接口类型"),
  r("create-interface", "schema", false, "新建接口类型"),
  r("update-interface", "schema", false, "改接口类型"),
  r("delete-interface", "schema", false, "删接口类型"),
  r("list-action-types", "schema", true, "列出动作类型"),
  r("create-action-type", "schema", false, "新建动作类型"),
  r("update-action-type", "schema", false, "改动作类型"),
  r("delete-action-type", "schema", false, "删动作类型"),

  // --- fact: the instances ---------------------------------------------------
  r("create-node", "fact", false, "建一个实例节点"),
  r("create-edge", "fact", false, "建一条实例关系"),
  r("graph-snapshot", "fact", true, "实例图快照(有上限)"),

  // --- query: the read models the agent reasons over ------------------------
  r("find-path", "query", true, "两点之间的最短有向路径"),
  r("find-impact", "query", true, "一个节点的上下游影响范围"),

  // --- mapping: raw material → ontology -------------------------------------
  r("list-cognition-jobs", "mapping", false, "列出逆向认知作业"),
  r("get-cognition-job", "mapping", false, "单个认知作业"),
  r("create-cognition-job", "mapping", false, "新建认知作业"),
  r("transition-cognition-job", "mapping", false, "推进认知作业状态"),
  r("update-cognition-shards", "mapping", false, "上传分片"),
  r("set-cognition-draft", "mapping", false, "写入抽取草稿"),
  r("publish-cognition-job", "mapping", false, "把草稿发布成本体"),
  r("ingest-cognition-shard", "mapping", false, "按分片增量抽取"),
  r("list-datasets", "mapping", false, "列出数据集"),
  r("create-dataset", "mapping", false, "新建数据集"),
  r("update-dataset", "mapping", false, "改数据集"),
  r("list-connectors", "mapping", false, "列出连接器"),
  r("create-connector", "mapping", false, "新建连接器"),
  r("update-connector", "mapping", false, "改连接器"),
  r("list-transforms", "mapping", false, "列出转换"),
  r("create-transform", "mapping", false, "新建转换"),
  r("update-transform", "mapping", false, "改转换"),
  r("run-transform", "mapping", false, "执行一次转换"),
  r("extract-document", "mapping", false, "从文档文本里抽取对象类型"),

  // --- governance: who owns what --------------------------------------------
  r("list-business-systems", "governance", true, "列出业务系统"),
  r("get-business-system", "governance", true, "单个业务系统"),
  r("create-business-system", "governance", false, "新建业务系统"),
  r("update-business-system", "governance", false, "改业务系统"),
  r("list-sub-projects", "governance", true, "列出服务/子项目(含分层与部署)"),
  r("create-sub-project", "governance", false, "新建服务/子项目"),
  r("update-sub-project", "governance", false, "改服务/子项目"),
  r("list-capability-gaps", "governance", true, "列出能力缺口"),
  r("create-capability-gap", "governance", false, "新建能力缺口"),
  r("acquire-capability", "governance", false, "获取能力(写回解析来源)"),
  r("list-capability-resolutions", "governance", true, "能力缺口的解析轨迹"),

  // --- bench: the evaluation apparatus (DS parity) --------------------------
  r("list-prompt-templates", "bench", false, "列出提示词模板"),
  r("create-prompt-template", "bench", false, "新建提示词模板"),
  r("list-golden-datasets", "bench", false, "列出黄金数据集"),
  r("create-golden-dataset", "bench", false, "新建黄金数据集"),
  r("list-aip-logics", "bench", false, "列出 AIP 逻辑"),
  r("create-aip-logic", "bench", false, "新建 AIP 逻辑"),
  r("update-aip-logic", "bench", false, "改 AIP 逻辑"),
  r("list-evals", "bench", false, "列出评测"),
  r("create-eval", "bench", false, "新建评测"),
  r("update-eval", "bench", false, "改评测"),
  r("list-simulation-scenarios", "bench", false, "列出模拟场景"),
  r("create-simulation-scenario", "bench", false, "新建模拟场景"),
  r("update-simulation-scenario", "bench", false, "改模拟场景"),

  // --- umodel: the observed-model bridge ------------------------------------
  r("list-umodel-entity-sets", "umodel", false, "列出观测实体集"),
  r("create-umodel-entity-set", "umodel", false, "新建观测实体集"),
  r("list-umodel-entities", "umodel", false, "列出观测实体"),
  r("create-umodel-entity", "umodel", false, "新建观测实体"),
  r("update-umodel-entity", "umodel", false, "改观测实体"),
  r("list-umodel-links", "umodel", false, "列出观测关系"),
  r("create-umodel-link", "umodel", false, "新建观测关系"),
  r("list-umodel-telemetry", "umodel", false, "列出观测遥测"),
  r("record-umodel-telemetry", "umodel", false, "写入观测遥测"),
];

export function coreApiRoute(routeKey: string): CoreApiRoute | undefined {
  return CORE_API.find((route) => route.routeKey === routeKey);
}

/** The operations an `ontology-mcp` would expose to an agent. */
export function agentApiRoutes(): CoreApiRoute[] {
  return CORE_API.filter((route) => route.agentExposed);
}

export interface CoreApiDoc {
  version: number;
  routeCount: number;
  agentRouteCount: number;
  groups: Array<{ group: CoreApiGroup; routes: CoreApiRoute[] }>;
}

/**
 * The machine-readable description of the surface, grouped. A consumer (the
 * MCP layer, or a doc generator) reads this instead of reflecting over the
 * manifest, which carries only what the host needs.
 */
export function describeCoreApi(): CoreApiDoc {
  const groups = new Map<CoreApiGroup, CoreApiRoute[]>();
  for (const route of CORE_API) {
    const bucket = groups.get(route.group);
    if (bucket) bucket.push(route);
    else groups.set(route.group, [route]);
  }
  return {
    version: CORE_API_VERSION,
    routeCount: CORE_API.length,
    agentRouteCount: agentApiRoutes().length,
    groups: [...groups.entries()]
      .map(([group, routes]) => ({
        group,
        routes: [...routes].sort((a, b) => a.routeKey.localeCompare(b.routeKey)),
      }))
      .sort((a, b) => a.group.localeCompare(b.group)),
  };
}
