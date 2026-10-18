import { describe, expect, it } from "vitest";
import {
  SPEC_DOC_KINDS,
  SPEC_DOC_KIND_FOR_SPEC_KIT_TYPE,
  SPEC_KIT_TYPES,
  SPEC_KIT_TYPE_LABEL,
  specDocSkeleton,
} from "./spec-kit";

/**
 * COOA-525 regression guard for the native App / 工坊 create form.
 *
 * `CreateTaskModal` wrote its spec skeleton with the chip's Spec-Kit type as the
 * wave147 `kind` — `{kind:"feature"}`, `{kind:"refactor"}`, `{kind:"security"}`.
 * `POST /api/issues/:id/spec` accepts only `requirement | bugfix | design | task`
 * (`ISSUE_SPEC_KINDS`), so those three writes 400'd and the error was swallowed
 * by the create flow's try/catch: the task existed, the spec never landed.
 *
 * These cases pin the convergence between the two vocabularies on the client side.
 */
describe("spec-kit ↔ wave147 spec kind convergence", () => {
  it("the spec-document vocabulary is exactly ISSUE_SPEC_KINDS", () => {
    expect([...SPEC_DOC_KINDS]).toEqual(["requirement", "bugfix", "design", "task"]);
  });

  it("every Spec-Kit type maps to a valid wave147 spec kind", () => {
    for (const type of SPEC_KIT_TYPES) {
      expect(SPEC_DOC_KINDS).toContain(SPEC_DOC_KIND_FOR_SPEC_KIT_TYPE[type]);
    }
  });

  it("never maps a Spec-Kit type back to itself when it is not a spec kind", () => {
    const mapped = SPEC_KIT_TYPES.map((type) => SPEC_DOC_KIND_FOR_SPEC_KIT_TYPE[type]) as string[];
    expect(mapped).not.toContain("feature");
    expect(mapped).not.toContain("refactor");
    expect(mapped).not.toContain("security");
  });

  it("every skeleton carries its own kind and exactly one matching payload", () => {
    for (const kind of SPEC_DOC_KINDS) {
      const skeleton = specDocSkeleton(kind);
      expect(skeleton.kind).toBe(kind);
      const payloadKeys = Object.keys(skeleton).filter((key) => key !== "kind");
      expect(payloadKeys).toEqual([kind]);
      expect(typeof skeleton[kind]).toBe("object");
    }
  });

  it("labels every Spec-Kit type", () => {
    for (const type of SPEC_KIT_TYPES) {
      expect(SPEC_KIT_TYPE_LABEL[type]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
