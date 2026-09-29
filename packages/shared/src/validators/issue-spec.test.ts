import { describe, expect, it } from "vitest";
import {
  createSpecFromTemplateSchema,
  issueSpecDraftSchema,
  issueSpecSchema,
} from "./issue-spec.js";

const PARENT = "9af8228f-0be7-45ae-a104-6fbe0af6f1d3";

describe("issueSpecSchema", () => {
  it("accepts a complete requirement spec", () => {
    const spec = issueSpecSchema.parse({
      kind: "requirement",
      requirement: {
        body: "Board chat must show a send receipt.",
        acceptanceCriteria: ["WHEN sent, THEN a receipt SHALL render."],
      },
    });
    expect(spec.kind).toBe("requirement");
    expect(spec.requirement?.acceptanceCriteria).toHaveLength(1);
    expect(spec.parentSpecId).toBeNull();
  });

  it("accepts a task spec with a parent design", () => {
    const spec = issueSpecSchema.parse({
      kind: "task",
      parentSpecId: PARENT,
      task: { files: ["ui/src/App.tsx"], steps: ["Add the route"] },
    });
    expect(spec.parentSpecId).toBe(PARENT);
    expect(spec.task?.files).toEqual(["ui/src/App.tsx"]);
  });

  it("accepts bugfix and design kinds", () => {
    expect(
      issueSpecSchema.safeParse({
        kind: "bugfix",
        bugfix: { reproSteps: "a", expectedBehavior: "b", actualBehavior: "c" },
      }).success,
    ).toBe(true);
    expect(
      issueSpecSchema.safeParse({ kind: "design", design: { approach: "a", tradeoffs: [] } })
        .success,
    ).toBe(true);
  });

  it("rejects a kind whose payload is missing", () => {
    const result = issueSpecSchema.safeParse({ kind: "requirement" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toContain('requires a "requirement" payload');
  });

  it("rejects unknown keys and a bad enum", () => {
    expect(issueSpecSchema.safeParse({ kind: "requirement", extra: true }).success).toBe(false);
    expect(issueSpecSchema.safeParse({ kind: "epic" }).success).toBe(false);
  });
});

describe("issueSpecDraftSchema", () => {
  it("accepts an empty draft", () => {
    expect(issueSpecDraftSchema.parse({})).toEqual({});
  });

  it("accepts a draft carrying only the kind", () => {
    expect(issueSpecDraftSchema.parse({ kind: "design" })).toEqual({ kind: "design" });
  });

  it("accepts a partially written requirement payload", () => {
    const draft = issueSpecDraftSchema.parse({
      kind: "requirement",
      requirement: { body: "half written" },
    });
    expect(draft.requirement?.body).toBe("half written");
  });

  it("accepts a null parent and a partial task", () => {
    const draft = issueSpecDraftSchema.parse({
      parentSpecId: null,
      task: { steps: ["only steps so far"] },
    });
    expect(draft.parentSpecId).toBeNull();
    expect(draft.task?.steps).toEqual(["only steps so far"]);
  });

  it("still rejects unknown keys", () => {
    expect(issueSpecDraftSchema.safeParse({ nope: 1 }).success).toBe(false);
  });
});

describe("createSpecFromTemplateSchema", () => {
  it("requires a kind and defaults nothing unexpected", () => {
    expect(createSpecFromTemplateSchema.safeParse({}).success).toBe(false);
    expect(createSpecFromTemplateSchema.safeParse({ kind: "bugfix" }).success).toBe(true);
  });
});
