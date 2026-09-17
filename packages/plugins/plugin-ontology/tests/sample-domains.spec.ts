/**
 * Tests for the sample-domain seeder.
 *
 * The properties under test are the ones that are invisible in a real instance:
 * a relation type written without its endpoints looks fine in the table and draws
 * nothing; a seeder that overwrites an existing domain looks fine the first time
 * it runs and destroys a customer's model the second.
 */
import { describe, expect, it } from "vitest";
import { relationEndpoints } from "@paperclipai/ontology-core/relationEndpoints.js";
import {
  SAMPLE_DOMAINS,
  SAMPLE_SOURCE,
  seedSampleDomains,
  validateSample,
  type SampleDomain,
} from "../src/samples/seed.js";

interface Written {
  domains: Array<{ slug: string; id: string }>;
  nodeTypes: Array<{ domainId: string; key: string; propertiesSchema: Record<string, unknown> }>;
  relationTypes: Array<{ domainId: string; key: string; metadata?: unknown; cardinality?: string }>;
}

function fakeStore(preExisting: string[] = []) {
  const written: Written = { domains: [], nodeTypes: [], relationTypes: [] };
  let nextId = 0;
  const store = {
    async listDomains() {
      return preExisting.map((slug) => ({ slug }));
    },
    async createDomain(input: { slug: string }) {
      const id = `domain-${++nextId}`;
      written.domains.push({ slug: input.slug, id });
      return { id };
    },
    async createNodeType(input: { domainId: string; key: string; propertiesSchema: Record<string, unknown> }) {
      written.nodeTypes.push(input);
      return { id: `nt-${++nextId}` };
    },
    async createRelationType(input: { domainId: string; key: string; metadata?: unknown; cardinality?: string }) {
      written.relationTypes.push(input);
      return { id: `rt-${++nextId}` };
    },
  };
  return { store, written };
}

describe("the generated sample set", () => {
  it("is not empty and covers several domains", () => {
    // A blank catalogue would make every other assertion here vacuous.
    expect(SAMPLE_DOMAINS.length).toBeGreaterThanOrEqual(5);
  });

  it("pins the upstream revision it was generated from", () => {
    // Without this the attribution cannot be checked against a specific tree.
    expect(String(SAMPLE_SOURCE.revision)).toMatch(/^[0-9a-f]{40}$/);
    expect(SAMPLE_SOURCE.license).toBe("MIT");
  });

  it("is valid against our own enums, per domain", () => {
    for (const domain of SAMPLE_DOMAINS) {
      expect(validateSample(domain), domain.key).toEqual([]);
    }
  });

  it("has no relation type pointing at a type it does not define", () => {
    for (const domain of SAMPLE_DOMAINS) {
      const keys = new Set(domain.nodeTypes.map((type) => type.key));
      for (const relation of domain.relationTypes) {
        expect(keys.has(relation.sourceNodeTypeKey), `${domain.key}/${relation.key}`).toBe(true);
        expect(keys.has(relation.targetNodeTypeKey), `${domain.key}/${relation.key}`).toBe(true);
      }
    }
  });
});

describe("validateSample", () => {
  const base = SAMPLE_DOMAINS[0];

  it("rejects a property type we cannot render", () => {
    const broken: SampleDomain = {
      ...base,
      nodeTypes: [{ ...base.nodeTypes[0], propertiesSchema: { x: { type: "geometry" } } }],
      relationTypes: [],
    };
    expect(validateSample(broken).join()).toMatch(/unsupported property type/);
  });

  it("rejects an endpoint that is not an object type in this domain", () => {
    const broken: SampleDomain = {
      ...base,
      nodeTypes: base.nodeTypes.slice(0, 1),
      relationTypes: [{ ...base.relationTypes[0], sourceNodeTypeKey: "nowhere" }],
    };
    expect(validateSample(broken).join()).toMatch(/is not an object type here/);
  });

  it("rejects a cardinality outside our enum", () => {
    // The upstream spelling is hyphenated; our storage is underscored.
    const broken: SampleDomain = {
      ...base,
      relationTypes: [{ ...base.relationTypes[0], cardinality: "one-to-many" }],
    };
    expect(validateSample(broken).join()).toMatch(/unsupported cardinality/);
  });

  it("rejects a duplicate key", () => {
    const broken: SampleDomain = {
      ...base,
      nodeTypes: [base.nodeTypes[0], { ...base.nodeTypes[0] }],
    };
    expect(validateSample(broken).join()).toMatch(/duplicate object type key/);
  });
});

describe("seedSampleDomains", () => {
  it("plants every domain with its types", async () => {
    const { store, written } = fakeStore();
    const report = await seedSampleDomains("company-1", store);

    expect(report.created).toBe(SAMPLE_DOMAINS.length);
    expect(written.domains).toHaveLength(SAMPLE_DOMAINS.length);
    const expectedTypes = SAMPLE_DOMAINS.reduce((sum, d) => sum + d.nodeTypes.length, 0);
    expect(written.nodeTypes).toHaveLength(expectedTypes);
  });

  it("gives every relation type readable endpoints", async () => {
    // The bug this exists for: the older seeder wrote key + display name only, so
    // the structural view drew no lines and nothing errored.
    const { store, written } = fakeStore();
    await seedSampleDomains("company-1", store);

    expect(written.relationTypes.length).toBeGreaterThan(0);
    for (const relation of written.relationTypes) {
      const endpoints = relationEndpoints(relation.metadata);
      expect(endpoints.sourceNodeTypeKey, relation.key).toBeTruthy();
      expect(endpoints.targetNodeTypeKey, relation.key).toBeTruthy();
    }
  });

  it("carries the cardinality through", async () => {
    const { store, written } = fakeStore();
    await seedSampleDomains("company-1", store);
    for (const relation of written.relationTypes) {
      expect(["one_to_one", "one_to_many", "many_to_one", "many_to_many"]).toContain(relation.cardinality);
    }
  });

  it("skips a domain that already exists instead of rewriting it", async () => {
    const slug = SAMPLE_DOMAINS[0].key;
    const { store, written } = fakeStore([slug]);
    const report = await seedSampleDomains("company-1", store);

    expect(report.skipped).toBe(1);
    expect(report.created).toBe(SAMPLE_DOMAINS.length - 1);
    expect(written.domains.map((d) => d.slug)).not.toContain(slug);
  });

  it("is idempotent: a second call writes nothing new", async () => {
    const { store, written } = fakeStore();
    await seedSampleDomains("company-1", store);
    const after = written.domains.map((d) => d.slug);

    const again = await seedSampleDomains("company-1", { ...store, listDomains: async () => after.map((slug) => ({ slug })) });
    expect(again.created).toBe(0);
    expect(again.skipped).toBe(SAMPLE_DOMAINS.length);
  });

  it("honours a subset request", async () => {
    const { store, written } = fakeStore();
    const only = [SAMPLE_DOMAINS[0].key, SAMPLE_DOMAINS[1].key];
    const report = await seedSampleDomains("company-1", store, { only });

    expect(report.created).toBe(2);
    expect(written.domains.map((d) => d.slug).sort()).toEqual([...only].sort());
  });

  it("reports an unknown domain key as nothing to do, not as a creation", async () => {
    const { store, written } = fakeStore();
    const report = await seedSampleDomains("company-1", store, { only: ["no-such-domain"] });
    expect(report.created).toBe(0);
    expect(written.domains).toHaveLength(0);
  });

  it("writes nothing from a domain that fails validation", async () => {
    const broken = SAMPLE_DOMAINS[0];
    const { store, written } = fakeStore();
    const report = await seedSampleDomains("company-1", store, { only: [broken.key] });

    // A sanity check on the fixture used above: it must be valid, or this test
    // would pass for the wrong reason.
    expect(validateSample(broken)).toEqual([]);
    expect(report.created).toBe(1);
    expect(written.nodeTypes.length).toBe(broken.nodeTypes.length);
  });
});
