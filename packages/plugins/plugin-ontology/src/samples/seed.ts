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

export const SAMPLE_DOMAINS: SampleDomain[] = (domainsFile as { domains: SampleDomain[] }).domains;

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
}

export interface SeedReport {
  domains: Array<{
    slug: string;
    displayName: string;
    status: "created" | "skipped-existing" | "failed";
    nodeTypes?: number;
    relationTypes?: number;
    withEndpoints?: number;
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

    const created = await store.createDomain({
      companyId,
      slug: domain.key,
      displayName: domain.displayName,
      description: domain.description,
      category: domain.category ?? "sample",
      isBuiltIn: true,
      bootstrapSource: "system-seed",
      bootstrapDescription: `Sample domain from Microsoft Ontology Playground (${String(
        SAMPLE_SOURCE.revision ?? "unknown",
      ).slice(0, 8)})`,
      metadata: { tags: domain.tags, sampleSource: SAMPLE_SOURCE.repository },
    });

    for (const type of domain.nodeTypes) {
      await store.createNodeType({
        companyId,
        domainId: created.id,
        key: type.key,
        displayName: type.displayName,
        description: type.description,
        propertiesSchema: type.propertiesSchema ?? {},
      });
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

    report.domains.push({
      slug: domain.key,
      displayName: domain.displayName,
      status: "created",
      nodeTypes: domain.nodeTypes.length,
      relationTypes: domain.relationTypes.length,
      withEndpoints,
    });
    report.created += 1;
  }

  return report;
}
