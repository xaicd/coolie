/**
 * Plant the sample domains, so a new instance does not open on a blank page.
 *
 * The content comes from `ontology-domains.json`, which is generated (see
 * `scripts/convert-ontology-playground.mjs`) — never hand-edited, because the
 * pinned upstream revision recorded in that file is what makes the provenance
 * checkable.
 *
 * Two properties this module exists to hold:
 *
 *   1. **It never clobbers.** A domain whose slug already exists is skipped, not
 *      rewritten. Seeding is an initialisation step, and an initialisation step
 *      that can overwrite a user's model is a data-loss bug waiting for a
 *      second call.
 *   2. **Relation types carry their endpoints.** The older single-domain seeder
 *      created relation types with a key and a display name only, so the seeded
 *      domains had no type-level structure to draw — the structural graph the
 *      user actually asked for. Endpoints here go through `buildRelationMetadata`,
 *      the one writer the reader agrees with.
 *
 * Dependencies are injected rather than imported so the whole thing can be
 * exercised against a fake store: the bugs this guards against (a dropped
 * endpoint, a second call rewriting a domain) are invisible in a real instance
 * unless you happen to look at the right table.
 */
import { buildRelationMetadata } from "@paperclipai/ontology-core/relationEndpoints.js";
import { LINK_CARDINALITIES, type LinkCardinality } from "@paperclipai/ontology-core/enums.js";
// `with { type: "json" }` is required under NodeNext; the bundler honours it too.
import domainsFile from "./ontology-domains.json" with { type: "json" };
import { ENTERPRISE_CORE_DOMAIN, ENTERPRISE_INITIAL_INSTANCES } from "./enterprise-domain.js";

export { ENTERPRISE_CORE_DOMAIN, ENTERPRISE_INITIAL_INSTANCES };

export interface SampleNodeType {
  key: string;
  displayName: string;
  description: string | null;
  propertiesSchema: Record<string, unknown>;
}

export interface SampleRelationType {
  key: string;
  displayName: string;
  description: string | null;
  cardinality: string;
  sourceNodeTypeKey: string;
  targetNodeTypeKey: string;
}

export interface SampleDomain {
  key: string;
  displayName: string;
  description: string | null;
  category: string | null;
  tags: string[];
  nodeTypes: SampleNodeType[];
  relationTypes: SampleRelationType[];
  stats: { nodeTypes: number; relationTypes: number; properties: number };
}

export const SAMPLE_DOMAINS: SampleDomain[] = [
  ENTERPRISE_CORE_DOMAIN,
  ...(domainsFile as { domains: SampleDomain[] }).domains,
];

export const SAMPLE_SOURCE = (domainsFile as { source: Record<string, unknown> }).source;

const isCardinality = (value: string): value is LinkCardinality =>
  (LINK_CARDINALITIES as readonly string[]).includes(value);

export interface SeedStore {
  listDomains(companyId: string): Promise<Array<{ slug: string }>>;
  createDomain(input: {
    companyId: string;
    slug: string;
    displayName: string;
    description: string | null;
    category: string;
    isBuiltIn: boolean;
    bootstrapSource: "system-seed";
    bootstrapDescription: string;
    metadata: Record<string, unknown>;
  }): Promise<{ id: string }>;
  createNodeType(input: {
    companyId: string;
    domainId: string;
    key: string;
    displayName: string;
    description: string | null;
    propertiesSchema: Record<string, unknown>;
  }): Promise<{ id: string }>;
  createRelationType(input: {
    companyId: string;
    domainId: string;
    key: string;
    displayName: string;
    description: string | null;
    cardinality?: LinkCardinality;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }>;
  createNode?(input: {
    companyId: string;
    domainId: string;
    key: string;
    label: string;
    nodeTypeId?: string | null;
    properties?: Record<string, unknown>;
  }): Promise<{ id: string }>;
  createEdge?(input: {
    companyId: string;
    domainId: string;
    sourceNodeId: string;
    targetNodeId: string;
    relationKey: string;
  }): Promise<{ id: string }>;
}

export interface SeedReport {
  domains: Array<{
    slug: string;
    displayName: string;
    status: "created" | "skipped-existing" | "failed";
    nodeTypes?: number;
    relationTypes?: number;
    withEndpoints?: number;
    nodes?: number;
    reason?: string;
  }>;
  created: number;
  skipped: number;
  failed: number;
}

/**
 * Validate a sample before writing anything from it.
 *
 * The generated file is data, and data can be regenerated wrongly by a future
 * edit to the converter. Failing here — loudly, before a single row — is the
 * difference between a bad sample set and a bad model in a customer's database.
 */
export function validateSample(domain: SampleDomain): string[] {
  const problems: string[] = [];
  const typeKeys = new Set<string>();
  for (const type of domain.nodeTypes) {
    if (typeKeys.has(type.key)) problems.push(`duplicate object type key: ${type.key}`);
    typeKeys.add(type.key);
    for (const [field, descriptor] of Object.entries(type.propertiesSchema ?? {})) {
      const kind = (descriptor as { type?: unknown })?.type;
      if (kind !== "string" && kind !== "number" && kind !== "boolean") {
        problems.push(`${type.key}.${field}: unsupported property type ${JSON.stringify(kind)}`);
      }
    }
  }
  const relationKeys = new Set<string>();
  for (const relation of domain.relationTypes) {
    if (relationKeys.has(relation.key)) problems.push(`duplicate relation type key: ${relation.key}`);
    relationKeys.add(relation.key);
    if (!typeKeys.has(relation.sourceNodeTypeKey)) {
      problems.push(`${relation.key}: source ${relation.sourceNodeTypeKey} is not an object type here`);
    }
    if (!typeKeys.has(relation.targetNodeTypeKey)) {
      problems.push(`${relation.key}: target ${relation.targetNodeTypeKey} is not an object type here`);
    }
    if (!isCardinality(relation.cardinality)) {
      problems.push(`${relation.key}: unsupported cardinality ${relation.cardinality}`);
    }
  }
  return problems;
}

export async function seedSampleDomains(
  companyId: string,
  store: SeedStore,
  options: { only?: string[] } = {},
): Promise<SeedReport> {
  const wanted = options.only
    ? SAMPLE_DOMAINS.filter((domain) => options.only!.includes(domain.key))
    : SAMPLE_DOMAINS;

  const existing = new Set((await store.listDomains(companyId)).map((row) => row.slug));
  const report: SeedReport = { domains: [], created: 0, skipped: 0, failed: 0 };

  for (const domain of wanted) {
    if (existing.has(domain.key)) {
      report.domains.push({ slug: domain.key, displayName: domain.displayName, status: "skipped-existing" });
      report.skipped += 1;
      continue;
    }

    const problems = validateSample(domain);
    if (problems.length > 0) {
      report.domains.push({
        slug: domain.key,
        displayName: domain.displayName,
        status: "failed",
        reason: problems.join("; "),
      });
      report.failed += 1;
      continue;
    }

    const isEnterpriseCore = domain.key === "enterprise-core";
    const created = await store.createDomain({
      companyId,
      slug: domain.key,
      displayName: domain.displayName,
      description: domain.description,
      category: domain.category ?? "sample",
      isBuiltIn: true,
      bootstrapSource: "system-seed",
      bootstrapDescription: isEnterpriseCore
        ? "企业组织架构、员工与数字工匠编制、授权风控流程、资料资产库与CMDB基础设施底座核心本体域"
        : `Sample domain from Microsoft Ontology Playground (${String(
            SAMPLE_SOURCE.revision ?? "unknown",
          ).slice(0, 8)})`,
      metadata: {
        tags: domain.tags,
        isEnterpriseCore: isEnterpriseCore || undefined,
        sampleSource: isEnterpriseCore ? "coolie-native" : SAMPLE_SOURCE.repository,
      },
    });

    const typeIdByKey = new Map<string, string>();
    for (const type of domain.nodeTypes) {
      const createdType = await store.createNodeType({
        companyId,
        domainId: created.id,
        key: type.key,
        displayName: type.displayName,
        description: type.description,
        propertiesSchema: type.propertiesSchema ?? {},
      });
      if (createdType?.id) {
        typeIdByKey.set(type.key, createdType.id);
      }
    }

    let withEndpoints = 0;
    for (const relation of domain.relationTypes) {
      if (!isCardinality(relation.cardinality)) continue;
      const metadata = buildRelationMetadata(relation.sourceNodeTypeKey, relation.targetNodeTypeKey, {
        sample: true,
      });
      if (metadata) withEndpoints += 1;
      await store.createRelationType({
        companyId,
        domainId: created.id,
        key: relation.key,
        displayName: relation.displayName,
        description: relation.description,
        cardinality: relation.cardinality,
        metadata,
      });
    }

    let instanceCount = 0;
    if (
      isEnterpriseCore &&
      typeof store.createNode === "function" &&
      typeof store.createEdge === "function"
    ) {
      const nodeIdByKey = new Map<string, string>();
      for (const nodeDef of ENTERPRISE_INITIAL_INSTANCES.nodes) {
        const nodeTypeId = typeIdByKey.get(nodeDef.type) ?? null;
        const createdNode = await store.createNode({
          companyId,
          domainId: created.id,
          key: nodeDef.key,
          label: nodeDef.label,
          nodeTypeId,
          properties: nodeDef.properties,
        });
        if (createdNode?.id) {
          nodeIdByKey.set(nodeDef.key, createdNode.id);
          instanceCount += 1;
        }
      }

      for (const edgeDef of ENTERPRISE_INITIAL_INSTANCES.edges) {
        const sourceNodeId = nodeIdByKey.get(edgeDef.from);
        const targetNodeId = nodeIdByKey.get(edgeDef.to);
        if (sourceNodeId && targetNodeId) {
          await store.createEdge({
            companyId,
            domainId: created.id,
            sourceNodeId,
            targetNodeId,
            relationKey: edgeDef.rel,
          });
        }
      }
    }

    report.domains.push({
      slug: domain.key,
      displayName: domain.displayName,
      status: "created",
      nodeTypes: domain.nodeTypes.length,
      relationTypes: domain.relationTypes.length,
      withEndpoints,
      nodes: instanceCount > 0 ? instanceCount : undefined,
    });
    report.created += 1;
  }

  return report;
}
