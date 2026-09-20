import { describe, expect, it } from "vitest";
import { BUILD_STEP_KINDS } from "../services/build-orchestrator.js";
import {
  normalizeOntologyBuildSpec,
  specDocumentForProvisioning,
  specDomainSlug,
  specObjectTypeKeys,
} from "../services/ontology-spec.js";

/**
 * The passthrough invariant.
 *
 * The server does not own the ontology's vocabulary, so it must not rewrite an
 * ontology document on its way to the plugin — and this is the test that says so.
 * It exists because the first version of the normalizer rebuilt each object type
 * and each property from the fields it knew about, which quietly dropped
 * `isIdentifier`. `validateDocument` requires an identifier on every object type,
 * so every spec would have been refused, and the symptom ("the planner never
 * produces anything") pointed nowhere near the cause.
 *
 * So the assertion is not "these fields survive" — it is "the document is the
 * same document", which cannot rot as the document format grows.
 */

function plannerOutput(overrides: Record<string, unknown> = {}) {
  return {
    specVersion: "0.1",
    document: {
      format: "paperclip.ontology/1",
      name: "电商平台",
      description: "示例域",
      source: { domainSlug: "ecommerce", origin: "build_spec" },
      objectTypes: [
        {
          key: "product",
          displayName: "商品",
          orderSource: "declared",
          properties: [
            {
              name: "productId",
              type: "string",
              description: "平台唯一编号",
              isIdentifier: true,
            },
            { name: "status", type: "string", enum: ["draft", "on_sale"] },
            { name: "publishedAt", type: "string", format: "date-time" },
            { name: "weight", type: "number", unit: "kg" },
          ],
        },
        {
          key: "sku",
          displayName: "SKU",
          orderSource: "declared",
          properties: [{ name: "skuId", type: "string", isIdentifier: true }],
        },
      ],
      relationTypes: [
        {
          key: "HAS_SKU",
          displayName: "包含",
          cardinality: "one_to_many",
          sourceNodeTypeKey: "product",
          targetNodeTypeKey: "sku",
        },
      ],
    },
    build: {
      steps: BUILD_STEP_KINDS.map((kind) => ({
        kind,
        nodeTypes: kind === "impl" ? ["product", "sku"] : [],
      })),
    },
    ...overrides,
  };
}

describe("normalizeOntologyBuildSpec", () => {
  it("keeps the document byte-identical to what the planner wrote", () => {
    const input = plannerOutput();
    const spec = normalizeOntologyBuildSpec(input, BUILD_STEP_KINDS);

    expect(spec).not.toBeNull();
    expect(spec!.document).toEqual(input.document);
  });

  it("keeps the identifier flag the ontology validator requires", () => {
    const spec = normalizeOntologyBuildSpec(plannerOutput(), BUILD_STEP_KINDS);

    const product = spec!.document.objectTypes.find((type) => type.key === "product");
    const identifier = product?.properties?.find((property) => property.name === "productId");
    // The exact field an earlier version dropped. Asserted directly, because
    // losing it rejects the whole spec rather than degrading it.
    expect((identifier as Record<string, unknown>).isIdentifier).toBe(true);
  });

  it("passes the document through unchanged when handed to the plugin", () => {
    const input = plannerOutput();
    const spec = normalizeOntologyBuildSpec(input, BUILD_STEP_KINDS)!;

    expect(specDocumentForProvisioning(spec)).toEqual(input.document);
  });

  it("keeps enum, format and unit on properties", () => {
    const input = plannerOutput();
    const spec = normalizeOntologyBuildSpec(input, BUILD_STEP_KINDS)!;
    const document = specDocumentForProvisioning(spec) as {
      objectTypes: Array<{ key: string; properties: Array<Record<string, unknown>> }>;
    };
    const product = document.objectTypes.find((type) => type.key === "product")!;

    // The document format carries far more than a type name; the server keeps all
    // of it even though it reads none of it.
    expect(product.properties[1]).toEqual({ name: "status", type: "string", enum: ["draft", "on_sale"] });
    expect(product.properties[2]).toEqual({ name: "publishedAt", type: "string", format: "date-time" });
    expect(product.properties[3]).toEqual({ name: "weight", type: "number", unit: "kg" });
  });

  it("refuses a document with no object types", () => {
    const input = plannerOutput();
    (input.document as { objectTypes: unknown[] }).objectTypes = [];
    expect(normalizeOntologyBuildSpec(input, BUILD_STEP_KINDS)).toBeNull();
  });

  it("refuses an answer that is missing a build phase", () => {
    const input = plannerOutput();
    input.build.steps = input.build.steps.filter((step) => step.kind !== "release");
    expect(normalizeOntologyBuildSpec(input, BUILD_STEP_KINDS)).toBeNull();
  });

  it("refuses an answer that names a phase twice", () => {
    const input = plannerOutput();
    input.build.steps = [...input.build.steps, { kind: "impl", nodeTypes: ["product"] }];
    expect(normalizeOntologyBuildSpec(input, BUILD_STEP_KINDS)).toBeNull();
  });

  it("refuses a phase the build vocabulary does not know", () => {
    const input = plannerOutput();
    input.build.steps = [
      ...input.build.steps.filter((step) => step.kind !== "test"),
      { kind: "validate", nodeTypes: [] },
    ];
    expect(normalizeOntologyBuildSpec(input, BUILD_STEP_KINDS)).toBeNull();
  });

  it("drops a phase reference to an undeclared object type without refusing the spec", () => {
    const input = plannerOutput();
    input.build.steps = input.build.steps.map((step) =>
      step.kind === "impl" ? { ...step, nodeTypes: ["product", "ghost"] } : step,
    );
    const spec = normalizeOntologyBuildSpec(input, BUILD_STEP_KINDS);

    // The envelope is bookkeeping: losing "ghost" costs a card, not the model.
    // A dangling *relation* is the model's problem, and the plugin refuses that.
    expect(spec).not.toBeNull();
    expect(spec!.build.steps.find((step) => step.kind === "impl")?.nodeTypes).toEqual(["product"]);
  });

  it("rejects a malformed wrapper rather than half-reading it", () => {
    expect(normalizeOntologyBuildSpec(null, BUILD_STEP_KINDS)).toBeNull();
    expect(normalizeOntologyBuildSpec([], BUILD_STEP_KINDS)).toBeNull();
    expect(normalizeOntologyBuildSpec({}, BUILD_STEP_KINDS)).toBeNull();
    expect(normalizeOntologyBuildSpec({ document: {} }, BUILD_STEP_KINDS)).toBeNull();
  });
});

describe("spec accessors", () => {
  it("reads the declared object type keys in order", () => {
    const spec = normalizeOntologyBuildSpec(plannerOutput(), BUILD_STEP_KINDS)!;
    expect(specObjectTypeKeys(spec)).toEqual(["product", "sku"]);
  });

  it("reads the domain slug, and reports absence rather than inventing one", () => {
    const spec = normalizeOntologyBuildSpec(plannerOutput(), BUILD_STEP_KINDS)!;
    expect(specDomainSlug(spec)).toBe("ecommerce");

    const unnamed = normalizeOntologyBuildSpec(
      plannerOutput({
        document: { ...plannerOutput().document, source: {} },
      }),
      BUILD_STEP_KINDS,
    )!;
    expect(specDomainSlug(unnamed)).toBeNull();
  });
});
