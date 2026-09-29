import { describe, expect, it } from "vitest";
import { buildSpecTree, type SpecTreeRow } from "./spec-tree.js";
import { specTemplateSkeleton } from "./spec-templates.js";
import { issueSpecSchema } from "./validators/issue-spec.js";

const REQ = "11111111-1111-1111-1111-111111111111";
const DESIGN = "22222222-2222-2222-2222-222222222222";
const TASK_A = "33333333-3333-3333-3333-333333333333";
const TASK_B = "44444444-4444-4444-4444-444444444444";
const ORPHAN = "55555555-5555-5555-5555-555555555555";

function row(over: Partial<SpecTreeRow> & Pick<SpecTreeRow, "issueId" | "specKind">): SpecTreeRow {
  const spec = specTemplateSkeleton(over.specKind);
  return {
    identifier: over.issueId.slice(0, 4),
    title: over.issueId,
    status: "todo",
    spec,
    parentSpecId: null,
    ...over,
  };
}

describe("buildSpecTree", () => {
  it("nests tasks under their design and the design under its requirement", () => {
    const tree = buildSpecTree([
      row({ issueId: REQ, specKind: "requirement", identifier: "1" }),
      row({ issueId: DESIGN, specKind: "design", identifier: "2", parentSpecId: REQ }),
      row({ issueId: TASK_A, specKind: "task", identifier: "3", parentSpecId: DESIGN }),
      row({ issueId: TASK_B, specKind: "task", identifier: "4", parentSpecId: DESIGN }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].issueId).toBe(REQ);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].issueId).toBe(DESIGN);
    expect(tree[0].children[0].children.map((n) => n.issueId)).toEqual([TASK_A, TASK_B]);
  });

  it("surfaces an orphan as a root rather than dropping it", () => {
    const tree = buildSpecTree([
      row({ issueId: ORPHAN, specKind: "design", identifier: "9", parentSpecId: REQ }),
    ]);
    expect(tree.map((n) => n.issueId)).toEqual([ORPHAN]);
  });

  it("does not recurse on a self-parent", () => {
    const tree = buildSpecTree([
      row({ issueId: DESIGN, specKind: "design", parentSpecId: DESIGN }),
    ]);
    expect(tree.map((n) => n.issueId)).toEqual([DESIGN]);
  });

  it("returns an empty forest for no rows", () => {
    expect(buildSpecTree([])).toEqual([]);
  });
});

describe("specTemplateSkeleton", () => {
  it("produces a spec that passes the write contract for every kind", () => {
    for (const kind of ["requirement", "bugfix", "design", "task"] as const) {
      const parsed = issueSpecSchema.safeParse(specTemplateSkeleton(kind));
      expect(parsed.success, `skeleton for ${kind} must validate`).toBe(true);
    }
  });

  it("carries the payload keyed by its kind", () => {
    expect(specTemplateSkeleton("task").task).toBeDefined();
    expect(specTemplateSkeleton("bugfix").bugfix).toBeDefined();
  });
});
