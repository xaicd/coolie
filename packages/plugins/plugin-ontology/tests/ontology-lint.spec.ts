/**
 * Tests for the modelling lint.
 *
 * The rules come from the upstream Ontology Design Patterns article and authoring
 * guide. Two of them matter more here than they would elsewhere, because this
 * repository builds domains by reading schemas:
 *
 *  - "Over-modelling: every internal table becomes an entity" is our default
 *    outcome, not an edge case.
 *  - "Model relationships, not foreign keys" is exactly what a DDL reader loses.
 *
 * So the lint is tested against a domain that looks like what our own scanner
 * produces, not against a tidy hand-written one.
 */
import { describe, expect, it } from "vitest";
import { DOCUMENT_FORMAT, type OntologyDocument } from "@paperclipai/ontology-core/document/OntologyDocument.js";
import { lintDocument } from "@paperclipai/ontology-core/document/lintDocument.js";

const type = (
  key: string,
  properties: Array<{ name: string; isIdentifier?: boolean }> = [{ name: "id", isIdentifier: true }],
) => ({
  key,
  displayName: key,
  orderSource: "declared" as const,
  properties: properties.map((property) => ({ ...property, type: "string" as const })),
});

function domain(overrides: Partial<OntologyDocument> = {}): OntologyDocument {
  return {
    format: DOCUMENT_FORMAT,
    name: "D",
    exportedAt: "2026-09-17T00:00:00.000Z",
    objectTypes: [type("customer")],
    relationTypes: [],
    ...overrides,
  };
}

const codes = (document: OntologyDocument) => lintDocument(document).map((finding) => finding.code);
const find = (document: OntologyDocument, code: string) => lintDocument(document).find((f) => f.code === code);

describe("the two rules that land on how this repository builds domains", () => {
  it("flags a domain that is mostly internal table names as over-modelled", () => {
    // This is what an imported legacy system looks like before a human curates it.
    const document = domain({
      objectTypes: [
        type("tbl_cust_v2"),
        type("dim_product"),
        type("fact_orders"),
        type("customer"),
      ],
    });
    const finding = find(document, "domain/over-modelled");
    expect(finding?.severity).toBe("warning");
    expect(finding?.message).toContain("3 of 4");
    // The finding has to carry the fix, not just the complaint.
    expect(finding?.advice).toContain("model what people will query");
  });

  it("does not cry over-modelling when the names are already concepts", () => {
    const document = domain({
      objectTypes: [type("customer"), type("order"), type("product"), type("store")],
    });
    expect(codes(document)).not.toContain("domain/over-modelled");
  });

  it("names the target object type for a foreign key column", () => {
    // A DDL reader reproduces "customer_id" faithfully; the meaning that the
    // column lost when it stopped being a relationship is what we have to say.
    const document = domain({
      objectTypes: [
        type("order", [
          { name: "orderNumber", isIdentifier: true },
          { name: "customer_id" },
        ]),
        { ...type("customer"), key: "customer" },
      ],
    });
    const finding = find(document, "property/foreign-key");
    expect(finding?.severity).toBe("warning");
    expect(finding?.subject).toBe("order.customer_id");
    expect(finding?.advice).toContain("order -> customer");
  });

  it("does not flag an entity's own identifier as a foreign key", () => {
    const document = domain({ objectTypes: [type("order", [{ name: "id", isIdentifier: true }, { name: "orderNumber" }])] });
    expect(codes(document)).not.toContain("property/foreign-key");
  });

  it("does not flag a word that merely ends in id", () => {
    // "paid" must not be read as a pointer at a "pa" entity.
    const document = domain({ objectTypes: [type("invoice", [{ name: "invoiceNo", isIdentifier: true }, { name: "paid" }])] });
    expect(codes(document)).not.toContain("property/foreign-key");
  });
});

describe("anti-patterns taken straight from the article", () => {
  it("flags a god entity and says to split it", () => {
    const document = domain({
      objectTypes: [
        {
          ...type("person"),
          properties: [
            { name: "personId", type: "string", isIdentifier: true },
            ...Array.from({ length: 31 }, (_, i) => ({ name: `field${i}`, type: "string" as const })),
          ],
        },
      ],
    });
    const finding = find(document, "object-type/god-entity");
    expect(finding?.message).toContain("32 properties");
    expect(finding?.advice).toContain("split");
  });

  it("flags a compound identifier", () => {
    const document = domain({
      objectTypes: [type("order", [{ name: "orderNumber", isIdentifier: true }, { name: "customerId", isIdentifier: true }])],
    });
    const finding = find(document, "object-type/compound-identifier");
    expect(finding?.severity).toBe("warning");
    expect(finding?.advice).toContain("single identifier");
  });

  it("flags an abbreviated property and spells out the fix", () => {
    const document = domain({ objectTypes: [type("order", [{ name: "orderNumber", isIdentifier: true }, { name: "qty" }])] });
    const finding = find(document, "property/abbreviated");
    expect(finding?.subject).toBe("order.qty");
    expect(finding?.advice).toContain("quantity");
  });

  it("flags vague relationship names", () => {
    const document = domain({
      objectTypes: [type("customer"), type("order")],
      relationTypes: [
        {
          key: "relatedTo",
          displayName: "relatedTo",
          cardinality: "one_to_many",
          sourceNodeTypeKey: "customer",
          targetNodeTypeKey: "order",
        },
      ],
    });
    expect(codes(document)).toContain("relation-type/vague-name");
  });

  it("accepts the verb names the article recommends", () => {
    const document = domain({
      objectTypes: [type("customer"), type("order")],
      relationTypes: [
        { key: "places", displayName: "places", cardinality: "one_to_many", sourceNodeTypeKey: "customer", targetNodeTypeKey: "order" },
        { key: "placedBy", displayName: "placedBy", cardinality: "many_to_one", sourceNodeTypeKey: "order", targetNodeTypeKey: "customer" },
      ],
    });
    expect(codes(document)).not.toContain("relation-type/vague-name");
  });

  it("flags two one-to-one relations over the same pair as one concept drawn twice", () => {
    const document = domain({
      objectTypes: [type("person"), type("employee")],
      relationTypes: [
        { key: "hasProfile", displayName: "has", cardinality: "one_to_one", sourceNodeTypeKey: "person", targetNodeTypeKey: "employee" },
        { key: "belongsTo", displayName: "belongs", cardinality: "one_to_one", sourceNodeTypeKey: "employee", targetNodeTypeKey: "person" },
      ],
    });
    const finding = find(document, "relation-type/circular-one-to-one");
    expect(finding?.severity).toBe("warning");
    expect(finding?.advice).toContain("merging");
  });

  it("does not confuse a legitimate two-directional pair with different cardinalities", () => {
    const document = domain({
      objectTypes: [type("customer"), type("order")],
      relationTypes: [
        { key: "places", displayName: "places", cardinality: "one_to_many", sourceNodeTypeKey: "customer", targetNodeTypeKey: "order" },
        { key: "placedBy", displayName: "placedBy", cardinality: "many_to_one", sourceNodeTypeKey: "order", targetNodeTypeKey: "customer" },
      ],
    });
    expect(codes(document)).not.toContain("relation-type/circular-one-to-one");
  });

  it("notes parallel relations between the same pair without calling them wrong", () => {
    const document = domain({
      objectTypes: [type("customer"), type("order")],
      relationTypes: [
        { key: "places", displayName: "places", cardinality: "one_to_many", sourceNodeTypeKey: "customer", targetNodeTypeKey: "order" },
        { key: "cancels", displayName: "cancels", cardinality: "one_to_many", sourceNodeTypeKey: "customer", targetNodeTypeKey: "order" },
      ],
    });
    const finding = find(document, "relation-type/parallel");
    expect(finding?.severity).toBe("info");
  });

  it("flags a surrogate identifier and asks for a business key", () => {
    const document = domain({ objectTypes: [type("customer", [{ name: "uuid", isIdentifier: true }])] });
    const finding = find(document, "object-type/weak-identifier");
    expect(finding?.advice).toContain("business key");
  });

  it("leaves a business key alone", () => {
    const document = domain({ objectTypes: [type("book", [{ name: "isbn", isIdentifier: true }])] });
    expect(codes(document)).not.toContain("object-type/weak-identifier");
  });
});

describe("findings are actionable", () => {
  it("gives every finding an advice string and a subject", () => {
    const document = domain({
      objectTypes: [type("tbl_x"), type("dim_y"), type("person")],
      relationTypes: [
        { key: "r", displayName: "relatedTo", cardinality: "one_to_one", sourceNodeTypeKey: "person", targetNodeTypeKey: "person" },
      ],
    });
    const findings = lintDocument(document);
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.advice.length).toBeGreaterThan(10);
      expect(finding.subject.length).toBeGreaterThan(0);
      expect(["warning", "info"]).toContain(finding.severity);
    }
  });

  it("never reports the severity that would block an import", () => {
    // Lint is advice. `validateDocument` is the gate, and the two must not blur.
    const document = domain({ objectTypes: [type("tbl_a"), type("tbl_b")] });
    for (const finding of lintDocument(document)) {
      expect(finding.severity).not.toBe("error");
    }
  });

  it("says nothing at all about a clean domain", () => {
    const document = domain({
      objectTypes: [
        { ...type("customer"), displayName: "Customer", properties: [
          { name: "email", type: "string", isIdentifier: true },
          { name: "name", type: "string" },
        ] },
        { ...type("order"), displayName: "Order", properties: [
          { name: "orderNumber", type: "string", isIdentifier: true },
        ] },
      ],
      relationTypes: [
        { key: "places", displayName: "places", cardinality: "one_to_many", sourceNodeTypeKey: "customer", targetNodeTypeKey: "order" },
      ],
    });
    expect(lintDocument(document)).toEqual([]);
  });
});
