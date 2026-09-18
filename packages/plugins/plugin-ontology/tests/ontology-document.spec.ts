/**
 * Tests for the ontology document — the unit of exchange.
 *
 * The properties worth testing here are the ones that decide whether a model can
 * leave one instance and arrive intact in another: that order is data, that two
 * documents that differ only in type sequence are the same model, that a
 * difference in property order is NOT the same model, and that nothing is
 * silently dropped or coerced on the way in.
 */
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_FORMAT,
  canonicalize,
  documentFromRows,
  documentToWritePlan,
  fingerprintDocument,
  parseDocument,
  serializeDocument,
  validateDocument,
  type OntologyDocument,
} from "@paperclipai/ontology-core/document/OntologyDocument.js";

function sample(overrides: Partial<OntologyDocument> = {}): OntologyDocument {
  return {
    format: DOCUMENT_FORMAT,
    name: "Fourth Coffee",
    description: "A coffee shop chain",
    exportedAt: "2026-09-17T00:00:00.000Z",
    source: { domainSlug: "cosmic-coffee", schemaVersion: 4 },
    objectTypes: [
      {
        key: "customer",
        displayName: "Customer",
        description: "A person who buys coffee",
        orderSource: "declared",
        properties: [
          { name: "customerId", type: "string", isIdentifier: true },
          { name: "name", type: "string" },
          { name: "loyaltyTier", type: "string", enum: ["Bronze", "Silver", "Gold"] },
          { name: "totalSpend", type: "number", unit: "USD" },
        ],
      },
      {
        key: "order",
        displayName: "Order",
        orderSource: "declared",
        properties: [
          { name: "orderId", type: "string", isIdentifier: true },
          { name: "placedAt", type: "string", format: "date-time" },
        ],
      },
    ],
    relationTypes: [
      {
        key: "customer_places_order",
        displayName: "places",
        cardinality: "one_to_many",
        sourceNodeTypeKey: "customer",
        targetNodeTypeKey: "order",
      },
    ],
    ...overrides,
  };
}

describe("canonicalize", () => {
  it("sorts object types by key, because their sequence is presentation", () => {
    const document = sample();
    const reversed: OntologyDocument = { ...document, objectTypes: [...document.objectTypes].reverse() };
    expect(serializeDocument(reversed)).toBe(serializeDocument(document));
  });

  it("does NOT sort properties, because their sequence is the model", () => {
    // The entire point of the explicit order. Sorting here would erase it.
    const document = sample();
    const reordered: OntologyDocument = {
      ...document,
      objectTypes: [
        { ...document.objectTypes[0], properties: [...document.objectTypes[0].properties].reverse() },
        document.objectTypes[1],
      ],
    };
    expect(serializeDocument(reordered)).not.toBe(serializeDocument(document));
  });
});

describe("fingerprint", () => {
  it("is stable across type order and drops nothing", () => {
    const document = sample();
    const reversed: OntologyDocument = { ...document, objectTypes: [...document.objectTypes].reverse() };
    expect(fingerprintDocument(reversed)).toBe(fingerprintDocument(document));
    expect(fingerprintDocument(document)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when a property's order changes", () => {
    const document = sample();
    const mutated: OntologyDocument = {
      ...document,
      objectTypes: [
        {
          ...document.objectTypes[0],
          properties: [...document.objectTypes[0].properties].reverse(),
        },
        document.objectTypes[1],
      ],
    };
    expect(fingerprintDocument(mutated)).not.toBe(fingerprintDocument(document));
  });

  it("is unchanged by key order in the input object", () => {
    // Same values, different key sequence — a JSON document has no meaningful key
    // order, so the fingerprint must not depend on it.
    const document = sample();
    const shuffled = JSON.parse(JSON.stringify(document)) as OntologyDocument;
    const rebuilt = {
      relationTypes: shuffled.relationTypes,
      relationTypeCount: undefined,
      objectTypes: shuffled.objectTypes,
      exportedAt: shuffled.exportedAt,
      source: shuffled.source,
      description: shuffled.description,
      name: shuffled.name,
      format: shuffled.format,
    } as unknown as OntologyDocument;
    expect(fingerprintDocument(rebuilt)).toBe(fingerprintDocument(document));
  });
});

describe("validateDocument", () => {
  const codes = (document: OntologyDocument) => validateDocument(document).map((problem) => problem.code);

  it("passes its own fixture", () => {
    expect(validateDocument(sample()).filter((p) => p.severity === "error")).toEqual([]);
  });

  it("rejects an unknown format without pretending to understand the rest", () => {
    const problems = validateDocument({ ...sample(), format: "someone.else/9" });
    expect(problems).toHaveLength(1);
    expect(problems[0].code).toBe("format/unknown");
  });

  it("requires an identifier property, like the upstream build does", () => {
    const document = sample();
    document.objectTypes[0].properties = document.objectTypes[0].properties.map((p) => ({
      name: p.name,
      type: p.type,
    }));
    expect(codes(document)).toContain("object-type/no-identifier");
  });

  it("reports an unknown cardinality instead of coercing it", () => {
    // Their parser silently turns anything unrecognised into one-to-many, which
    // changes the model. Ours has to say so.
    const document = sample();
    document.relationTypes[0].cardinality = "one-to-many" as never;
    expect(codes(document)).toContain("relation-type/unknown-cardinality");
  });

  it("reports an endpoint that is not an object type here", () => {
    const document = sample();
    document.relationTypes[0].targetNodeTypeKey = "nowhere";
    expect(codes(document)).toContain("relation-type/target-unknown");
  });

  it("reports a missing endpoint", () => {
    const document = sample();
    document.relationTypes[0].sourceNodeTypeKey = "";
    expect(codes(document)).toContain("relation-type/source-missing");
  });

  it("refuses tenancy or host identity anywhere in the document", () => {
    // The red line, enforced on the thing that leaves the instance.
    const document = sample({ source: { domainSlug: "x", origin: "companyId=abc" } });
    expect(codes(document)).toContain("document/host-coupling");
    expect(validateDocument(document).find((p) => p.code === "document/host-coupling")?.severity).toBe("error");
  });

  it("warns about a document that models nothing", () => {
    const document = sample({ objectTypes: [], relationTypes: [] });
    expect(codes(document)).toContain("document/no-object-types");
  });

  it("warns when types are disconnected", () => {
    expect(codes(sample({ relationTypes: [] }))).toContain("document/no-relations");
  });

  it("warns on a generic type name and on a noun relationship name", () => {
    const document = sample();
    document.objectTypes[1] = { ...document.objectTypes[1], key: "thing", displayName: "Thing" };
    document.relationTypes[0] = { ...document.relationTypes[0], displayName: "ownership" };
    expect(codes(document)).toContain("object-type/generic-name");
    expect(codes(document)).toContain("relation-type/noun-name");
  });

  it("warns past ten types and past eight properties", () => {
    const many: OntologyDocument = {
      ...sample(),
      objectTypes: Array.from({ length: 11 }, (_, i) => ({
        key: `type_${i}`,
        displayName: `Type ${i}`,
        orderSource: "declared" as const,
        properties: [{ name: "id", type: "string" as const, isIdentifier: true }],
      })),
    };
    expect(codes(many)).toContain("document/many-types");

    const wide = sample();
    wide.objectTypes[0].properties = Array.from({ length: 9 }, (_, i) => ({
      name: `p${i}`,
      type: "string" as const,
      ...(i === 0 ? { isIdentifier: true } : {}),
    }));
    expect(codes(wide)).toContain("object-type/many-properties");
  });
});

describe("documentFromRows", () => {
  const rows = {
    domain: { slug: "cosmic-coffee", displayName: "Fourth Coffee", description: "chain", version: 7 },
    nodeTypes: [
      {
        key: "customer",
        display_name: "Customer",
        properties_schema: {
          customerId: { type: "string", isIdentifier: true },
          loyaltyTier: { type: "string", enum: ["Bronze", "Silver"] },
          totalSpend: { type: "number", unit: "USD" },
          joinedAt: { type: "string", format: "date" },
        },
      },
    ],
    relationTypes: [
      {
        key: "places",
        display_name: "places",
        cardinality: "one_to_many",
        metadata: { sourceNodeTypeKey: "customer", targetNodeTypeKey: "order" },
      },
    ],
    exportedAt: "2026-09-17T00:00:00.000Z",
  };

  it("reads the endpoints out of the metadata bag", () => {
    const document = documentFromRows(rows).document;
    expect(document.relationTypes[0].sourceNodeTypeKey).toBe("customer");
    expect(document.relationTypes[0].targetNodeTypeKey).toBe("order");
  });

  it("marks the order as declared when it was told, and sorted when it was not", () => {
    // jsonb does not preserve key order. Saying "sorted" is honest about that;
    // presenting the map's arbitrary order as the source's would not be.
    const declared = documentFromRows({ ...rows, propertyOrder: { customer: ["totalSpend", "customerId"] } }).document;
    expect(declared.objectTypes[0].orderSource).toBe("declared");
    expect(declared.objectTypes[0].properties.map((p) => p.name)).toEqual([
      "totalSpend",
      "customerId",
      "joinedAt",
      "loyaltyTier",
    ]);

    const unknown = documentFromRows(rows).document;
    expect(unknown.objectTypes[0].orderSource).toBe("sorted");
    expect(unknown.objectTypes[0].properties.map((p) => p.name)).toEqual([
      "customerId",
      "joinedAt",
      "loyaltyTier",
      "totalSpend",
    ]);
  });

  it("keeps a property whose order the storage happened to give us", () => {
    // A declared name that is no longer in the schema must not resurrect, and a
    // schema name not in the declared list must not disappear.
    const document = documentFromRows({
      ...rows,
      propertyOrder: { customer: ["gone", "totalSpend"] },
    }).document;
    expect(document.objectTypes[0].properties.map((p) => p.name)).toEqual([
      "totalSpend",
      "customerId",
      "joinedAt",
      "loyaltyTier",
    ]);
  });

  it("reads the stored order column when the caller did not restate it", () => {
    // The column exists so a caller holding the rows does not have to restate the
    // order. Before it, omitting `propertyOrder` silently fell back to sorted.
    const document = documentFromRows({
      ...rows,
      nodeTypes: [{ ...rows.nodeTypes[0], property_order: ["totalSpend", "customerId"] }],
    }).document;
    expect(document.objectTypes[0].orderSource).toBe("declared");
    expect(document.objectTypes[0].properties.map((p) => p.name)).toEqual([
      "totalSpend",
      "customerId",
      "joinedAt",
      "loyaltyTier",
    ]);
  });

  it("lets an explicit declaration win over the stored column", () => {
    // A caller writing a document is telling us something storage cannot know,
    // so it outranks the column rather than the other way round.
    const document = documentFromRows({
      ...rows,
      propertyOrder: { customer: ["joinedAt"] },
      nodeTypes: [{ ...rows.nodeTypes[0], property_order: ["totalSpend"] }],
    }).document;
    expect(document.objectTypes[0].properties.map((p) => p.name)[0]).toBe("joinedAt");
  });

  it("carries the schema version as provenance, not as identity", () => {
    expect(documentFromRows(rows).document.source?.schemaVersion).toBe(7);
  });

  it("does not invent a cardinality it cannot read", () => {
    // A silent fallback to many_to_many would be indistinguishable from a source
    // that genuinely said many_to_many — which is exactly what the upstream
    // parser does, and exactly what we refuse to do.
    const result = documentFromRows({
      ...rows,
      relationTypes: [
        {
          ...rows.relationTypes[0],
          cardinality: "bogus",
          metadata: { sourceNodeTypeKey: "customer", targetNodeTypeKey: "customer" },
        },
      ],
    });
    expect(result.problems.map((p) => p.code)).toContain("relation-type/unknown-cardinality");
    expect(result.problems[0].severity).toBe("error");
  });

  it("does not invent a property type it cannot read", () => {
    const result = documentFromRows({
      ...rows,
      nodeTypes: [
        {
          key: "customer",
          display_name: "Customer",
          properties_schema: { weird: { type: "geometry" } },
        },
      ],
      relationTypes: [],
    });
    expect(result.problems.map((p) => p.code)).toContain("property/unknown-type");
  });
});

describe("documentToWritePlan", () => {
  it("carries the order beside the schema, not inside it", () => {
    // Inside the map is where jsonb would lose it.
    const plan = documentToWritePlan(sample());
    const customer = plan.objectTypes.find((type) => type.key === "customer")!;
    expect(customer.propertyOrder).toEqual(["customerId", "name", "loyaltyTier", "totalSpend"]);
    expect(Object.keys(customer.propertiesSchema)).toEqual(customer.propertyOrder);
    expect(customer.propertiesSchema.customerId).toEqual({ type: "string", isIdentifier: true });
  });
});

describe("round trip through a document", () => {
  it("preserves every field we carry", () => {
    const rows = {
      domain: { slug: "d", displayName: "D", description: "desc", version: 2 },
      nodeTypes: [
        {
          key: "customer",
          display_name: "Customer",
          description: "A person",
          properties_schema: {
            customerId: { type: "string", isIdentifier: true, description: "Unique customer identifier" },
            loyaltyTier: { type: "string", enum: ["Bronze", "Silver"], description: "Tier" },
            joinedAt: { type: "string", format: "date" },
            totalSpend: { type: "number", unit: "USD" },
            active: { type: "boolean" },
          },
        },
      ],
      relationTypes: [
        {
          key: "places",
          display_name: "places",
          description: "A customer places orders",
          cardinality: "one_to_many",
          metadata: { sourceNodeTypeKey: "customer", targetNodeTypeKey: "customer" },
        },
      ],
      propertyOrder: { customer: ["customerId", "loyaltyTier", "joinedAt", "totalSpend", "active"] },
      exportedAt: "2026-09-17T00:00:00.000Z",
    };

    const first = documentFromRows(rows).document;
    const parsed = parseDocument(JSON.stringify(first));
    expect(parsed.problems.filter((p) => p.severity === "error")).toEqual([]);
    expect(parsed.document).toBeDefined();

    const plan = documentToWritePlan(parsed.document!);
    const type = plan.objectTypes[0];
    expect(type.propertiesSchema).toEqual(rows.nodeTypes[0].properties_schema);
    expect(type.propertyOrder).toEqual(rows.propertyOrder.customer);
    expect(type.description).toBe("A person");
    expect(plan.relationTypes[0]).toMatchObject({
      key: "places",
      cardinality: "one_to_many",
      sourceNodeTypeKey: "customer",
      targetNodeTypeKey: "customer",
      description: "A customer places orders",
    });
  });

  it("survives a second round trip unchanged", () => {
    const once = parseDocument(JSON.stringify(documentFromRows({
      domain: { slug: "d", displayName: "D" },
      nodeTypes: [{ key: "a", display_name: "A", properties_schema: { id: { type: "string", isIdentifier: true } } }],
      relationTypes: [],
      propertyOrder: { a: ["id"] },
    }).document)).document!;
    const twice = parseDocument(serializeDocument(once)).document!;
    expect(serializeDocument(twice)).toBe(serializeDocument(once));
    expect(twice.fingerprint).toBe(once.fingerprint);
  });
});

describe("parseDocument", () => {
  it("reports bad JSON as a problem rather than throwing", () => {
    const result = parseDocument("{ not json");
    expect(result.document).toBeUndefined();
    expect(result.problems[0].code).toBe("document/not-json");
  });

  it("rejects a non-object payload", () => {
    expect(parseDocument("[]").problems[0].code).toBe("document/not-an-object");
    expect(parseDocument("null").problems[0].code).toBe("document/not-an-object");
  });

  it("returns a fingerprinted document when only warnings are present", () => {
    const document = sample({ relationTypes: [] });
    const result = parseDocument(JSON.stringify(document));
    expect(result.document?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.problems.some((p) => p.code === "document/no-relations")).toBe(true);
  });

  it("withholds the document when an error is present", () => {
    const document = sample();
    document.objectTypes[0].properties = [];
    const result = parseDocument(JSON.stringify(document));
    expect(result.document).toBeUndefined();
    expect(result.problems.some((p) => p.severity === "error")).toBe(true);
  });
});
