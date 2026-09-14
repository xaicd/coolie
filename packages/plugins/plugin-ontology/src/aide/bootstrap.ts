/**
 * AI bootstrap helpers — pure functions used by both the worker (to assemble
 * prompts + parse model output) and unit tests (so we can exercise the parser
 * without spinning up the plugin worker or the Anthropic SDK).
 *
 * Two responsibilities:
 *  1. buildBootstrapSystemPrompt — render the existing domain + the user's
 *     description into a single LLM system prompt whose only acceptable
 *     output is a fenced ```json``` block.
 *  2. parseBootstrapDraft — extract that JSON block, shape-check it, and
 *     return either a typed BootstrapDraft or a parse error so the worker
 *     can surface a clear message in the SSE stream.
 *
 * The output schema (BootstrapDraft) is intentionally small: enough rows for
 * a meaningful initial domain (4-7 node types, 3-6 relation types, 8-15
 * nodes, 8-15 edges) but not so many that the LLM hallucinates real-looking
 * internal systems. The worker enforces hard caps as a second line of
 * defence.
 */

import type { DescribeDomainResult } from "../graph/GraphStore.js";

export interface BootstrapNodeTypeDraft {
  key: string;
  displayName: string;
  description?: string;
  properties?: Record<string, unknown>;
}

export interface BootstrapRelationTypeDraft {
  key: string;
  displayName: string;
  description?: string;
  directed?: boolean;
}

export interface BootstrapNodeDraft {
  key: string;
  label: string;
  nodeTypeKey: string;
  description?: string;
}

export interface BootstrapEdgeDraft {
  sourceKey: string;
  targetKey: string;
  relationKey: string;
}

export interface BootstrapDraft {
  nodeTypes: BootstrapNodeTypeDraft[];
  relationTypes: BootstrapRelationTypeDraft[];
  nodes: BootstrapNodeDraft[];
  edges: BootstrapEdgeDraft[];
}

export interface BootstrapParseOk {
  ok: true;
  draft: BootstrapDraft;
}

export interface BootstrapParseErr {
  ok: false;
  error: string;
}

export type BootstrapParseResult = BootstrapParseOk | BootstrapParseErr;

export interface BuildBootstrapPromptInput {
  domain: DescribeDomainResult;
  description?: string | null;
  /** Optional extension: a focal node id + summary for "AI extend from node". */
  focalNode?: {
    key: string;
    label: string;
    nodeTypeKey: string | null;
    outgoingRelationKeys: string[];
    incomingRelationKeys: string[];
  } | null;
  /** Maximum number of each row type the worker will accept. Caps prevent the
   *  LLM from writing 200-node drafts that take 30s+ to insert. */
  caps?: {
    nodeTypes?: number;
    relationTypes?: number;
    nodes?: number;
    edges?: number;
  };
}

/**
 * Build the system prompt that asks Claude to generate a JSON-only draft.
 * Two modes:
 *  - bootstrap (default): full domain initialisation — node types, relation
 *    types, a starter set of nodes, and edges wiring them together.
 *  - extend: only generate nodes + edges that grow from `focalNode`. No new
 *    types are created — we reuse what the domain already has.
 */
export function buildBootstrapSystemPrompt(input: BuildBootstrapPromptInput): string {
  const caps = {
    nodeTypes: 6,
    relationTypes: 5,
    nodes: 12,
    edges: 14,
    ...(input.caps ?? {}),
  };
  const lines: string[] = [];
  const desc = input.description?.trim() ?? "";
  const isExtend = input.focalNode != null;

  if (isExtend && input.focalNode) {
    const f = input.focalNode;
    lines.push(
      `你是「本体建模助手」。当前任务是「以节点 ${f.key} (${f.label}, 类型=${f.nodeTypeKey ?? "未分类"}) 为起点,生成与之相连的新节点和边」。`,
    );
    lines.push("");
    lines.push(
      "约束:不要新建对象类型或关系类型——只用本域已有的类型。新节点数 ≤ 5,新边数 ≤ 6。",
    );
    lines.push("");
    lines.push("已有对象类型:");
    if (input.domain.nodeTypes.length === 0) {
      lines.push("  (无)");
    } else {
      for (const nt of input.domain.nodeTypes) {
        lines.push(`  - ${nt.key} | ${nt.displayName}`);
      }
    }
    lines.push("");
    lines.push("已有关系类型:");
    if (input.domain.relationTypes.length === 0) {
      lines.push("  (无)");
    } else {
      for (const rt of input.domain.relationTypes) {
        const direction = rt.directed ? "directed" : "undirected";
        lines.push(`  - ${rt.key} | ${rt.displayName} | ${direction}`);
      }
    }
    lines.push("");
    lines.push(`起始节点 ${f.key} 的出向关系键:${f.outgoingRelationKeys.length === 0 ? "(无)" : f.outgoingRelationKeys.join(", ")}`);
    lines.push(`起始节点 ${f.key} 的入向关系键:${f.incomingRelationKeys.length === 0 ? "(无)" : f.incomingRelationKeys.join(", ")}`);
    lines.push("");
    lines.push("输出格式:");
    lines.push("- 只输出一个 ```json``` 块,不要任何额外文字");
    lines.push("- 块内结构: { \"nodes\": [...], \"edges\": [...] }");
    lines.push("- 节点 key 在域内必须唯一,格式 slug-case(小写字母+数字+连字符)");
    lines.push("- 边必须引用一个已存在的关系 key 和已存在的 source/target node key");
  } else {
    lines.push(
      `你是「本体建模助手」。当前域 ${input.domain.domain.slug} (name=${input.domain.domain.display_name}, v${input.domain.domain.version}) 还很空。`,
    );
    if (desc) {
      lines.push("");
      lines.push(`用户的域描述:${desc}`);
    }
    lines.push("");
    lines.push(
      `请生成一组「对象类型 / 关系类型 / 节点 / 边」,让这个域立刻可用。`,
    );
    lines.push("");
    lines.push(`硬性上限:`);
    lines.push(`- 对象类型 ≤ ${caps.nodeTypes} 个`);
    lines.push(`- 关系类型 ≤ ${caps.relationTypes} 个`);
    lines.push(`- 节点 ≤ ${caps.nodes} 个`);
    lines.push(`- 边 ≤ ${caps.edges} 条`);
    lines.push("");
    lines.push("设计原则:");
    lines.push("1. 节点类型应该覆盖域里的核心实体(例如:电商域的「商品 / 订单 / 客户」)。");
    lines.push("2. 关系类型应当描述节点之间的真实语义关联(例如「包含」「下单」)。");
    lines.push("3. 每个节点类型至少 1 个节点实例,每个关系类型至少 1 条边。");
    lines.push("4. 节点 key 用 slug-case(小写字母+数字+连字符),且全域唯一。");
    lines.push("5. 边必须引用已有 node key 和 relation key,不要引用不存在的。");
    lines.push("");
    lines.push("输出格式:");
    lines.push("- 只输出一个 ```json``` 块,不要任何额外文字");
    lines.push(
      "- 块内结构: { \"nodeTypes\": [...], \"relationTypes\": [...], \"nodes\": [...], \"edges\": [...] }",
    );
    lines.push("- properties 字段是 JSON Schema 风格的 object,可选。");
  }

  return lines.join("\n");
}

/**
 * Find the first fenced ```json``` block in the text and parse it. We accept
 * any of ```json / ```JSON / ``` (empty) but require that the body, when
 * trimmed, looks like a JSON object. Returns a structured error so callers
 * can show a useful message rather than a bare SyntaxError.
 */
export function parseBootstrapDraft(text: string): BootstrapParseResult {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (!fenced) {
    return {
      ok: false,
      error: "LLM 输出未包含 ```json``` 块,请重新生成",
    };
  }
  const body = fenced[1]?.trim() ?? "";
  if (body.length === 0) {
    return { ok: false, error: "```json``` 块为空" };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `\`\`\`json\`\`\` 块解析失败: ${reason}`,
    };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "顶层必须是 JSON object" };
  }
  const obj = raw as Record<string, unknown>;

  const nodeTypes = Array.isArray(obj.nodeTypes)
    ? obj.nodeTypes.map(normaliseNodeType)
    : [];
  const relationTypes = Array.isArray(obj.relationTypes)
    ? obj.relationTypes.map(normaliseRelationType)
    : [];
  const nodes = Array.isArray(obj.nodes)
    ? obj.nodes.map(normaliseNode)
    : [];
  const edges = Array.isArray(obj.edges)
    ? obj.edges.map(normaliseEdge)
    : [];

  // Empty response is only an error when we asked for a full bootstrap and
  // got nothing back — extend mode is allowed to return just {nodes, edges}.
  if (
    nodeTypes.length === 0 &&
    relationTypes.length === 0 &&
    nodes.length === 0 &&
    edges.length === 0
  ) {
    return { ok: false, error: "模型输出为空,无任何节点/类型/边" };
  }

  // Cross-check: every node references a known nodeTypeKey (when types are
  // present); every edge references a known node key (within the draft) and
  // a known relationKey. Drop invalid rows silently rather than reject the
  // whole draft — partial is better than nothing for a bootstrap.
  const validTypeKeys = new Set(nodeTypes.map((n) => n.key));
  const validNodeKeys = new Set(nodes.map((n) => n.key));
  const validRelationKeys = new Set(relationTypes.map((r) => r.key));

  const cleanNodes = nodes.filter((n) => {
    if (!n.key || !n.label) return false;
    if (nodeTypes.length > 0 && !validTypeKeys.has(n.nodeTypeKey)) return false;
    return true;
  });
  const cleanEdges = edges.filter((e) => {
    if (!e.sourceKey || !e.targetKey || !e.relationKey) return false;
    if (relationTypes.length > 0 && !validRelationKeys.has(e.relationKey)) return false;
    // Both endpoints must exist as draft node keys OR match a pre-existing
    // node already in the domain. For "extend" mode we accept either; for
    // bootstrap mode we only accept draft keys (the worker can later
    // resolve against existing nodes separately).
    if (cleanNodes.length > 0 && !validNodeKeys.has(e.sourceKey)) return false;
    if (cleanNodes.length > 0 && !validNodeKeys.has(e.targetKey)) return false;
    return true;
  });

  return {
    ok: true,
    draft: {
      nodeTypes,
      relationTypes,
      nodes: cleanNodes,
      edges: cleanEdges,
    },
  };
}

function normaliseNodeType(raw: unknown): BootstrapNodeTypeDraft {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const key = slugKey(asString(r.key) ?? asString(r.typeName) ?? asString(r.name));
  const displayName = asString(r.displayName) ?? asString(r.label) ?? asString(r.name) ?? key;
  const description = asString(r.description) ?? undefined;
  const properties = (typeof r.properties === "object" && r.properties !== null && !Array.isArray(r.properties))
    ? (r.properties as Record<string, unknown>)
    : undefined;
  return { key, displayName, description, properties };
}

function normaliseRelationType(raw: unknown): BootstrapRelationTypeDraft {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const key = slugKey(asString(r.key) ?? asString(r.relationType) ?? asString(r.name));
  const displayName = asString(r.displayName) ?? asString(r.label) ?? asString(r.name) ?? key;
  const description = asString(r.description) ?? undefined;
  const directed = typeof r.directed === "boolean" ? r.directed : true;
  return { key, displayName, description, directed };
}

function normaliseNode(raw: unknown): BootstrapNodeDraft {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const key = slugKey(asString(r.key) ?? asString(r.name));
  const label = asString(r.label) ?? asString(r.name) ?? key;
  const nodeTypeKey = slugKey(asString(r.nodeTypeKey) ?? asString(r.type) ?? asString(r.typeName) ?? "");
  const description = asString(r.description) ?? undefined;
  return { key, label, nodeTypeKey, description };
}

function normaliseEdge(raw: unknown): BootstrapEdgeDraft {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const sourceKey = slugKey(asString(r.sourceKey) ?? asString(r.from) ?? asString(r.source));
  const targetKey = slugKey(asString(r.targetKey) ?? asString(r.to) ?? asString(r.target));
  const relationKey = slugKey(asString(r.relationKey) ?? asString(r.relation) ?? asString(r.type));
  return { sourceKey, targetKey, relationKey };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Force a node/relation key into slug-case so it fits the column's expected
 *  shape (lowercase letters, digits, hyphens — no spaces, no underscores at
 *  the start). The DB schema enforces a check constraint; normalising here
 *  gives the LLM some slack for casual output without breaking inserts. */
function slugKey(value: string | undefined): string {
  if (!value) return "";
  const lower = value.toLowerCase().trim();
  const slug = lower
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug;
}
