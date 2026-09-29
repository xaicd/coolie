import type { IssueSpec } from "./types/issue-spec.js";
import { ISSUE_SPEC_KINDS, type IssueSpecKind } from "./constants.js";

/**
 * Template registry for the spec-driven chain (wave147).
 *
 * One place decides what a fresh spec of each kind starts as, so the endpoint
 * that starts a spec from a template and the human templates under
 * `templates/spec-driven/` describe the same field set. The markdown files carry
 * the wording and a worked example; this module carries the machine skeleton
 * that is actually written to the issue.
 */
export const SPEC_TEMPLATE_NAMES = ISSUE_SPEC_KINDS;
export type SpecTemplateName = IssueSpecKind;

const PLACEHOLDER = "（待填写）";

/** True for a string that only carries the placeholder — an untouched skeleton. */
export function isSpecPlaceholder(value: string): boolean {
  return value.trim().startsWith(PLACEHOLDER);
}

/**
 * A fresh, structurally valid spec of `kind`. Every required field carries the
 * placeholder so the skeleton passes `issueSpecSchema` and can be stored before
 * a human fills it in.
 */
export function specTemplateSkeleton(kind: IssueSpecKind): IssueSpec {
  switch (kind) {
    case "requirement":
      return {
        kind,
        requirement: {
          body: `${PLACEHOLDER}描述要做什么 —— 1~3 句话。`,
          acceptanceCriteria: [`${PLACEHOLDER}一条可判定的验收条件。`],
        },
      };
    case "bugfix":
      return {
        kind,
        bugfix: {
          reproSteps: `${PLACEHOLDER}复现步骤 1、2、3…`,
          expectedBehavior: `${PLACEHOLDER}预期行为。`,
          actualBehavior: `${PLACEHOLDER}实际行为。`,
        },
      };
    case "design":
      return {
        kind,
        design: {
          approach: `${PLACEHOLDER}怎么做：接口 / 数据 / 边界。`,
          tradeoffs: [`${PLACEHOLDER}权衡 1。`],
          apiSurface: `${PLACEHOLDER}接口或数据结构（可留空）。`,
        },
      };
    case "task":
      return {
        kind,
        task: {
          files: [`${PLACEHOLDER}path/to/file.ts`],
          steps: [`${PLACEHOLDER}改动点 1。`],
        },
      };
    default: {
      const exhaustive: never = kind;
      throw new Error(`unknown spec kind: ${String(exhaustive)}`);
    }
  }
}

/** `kind` → the payload key it populates. Same string for all four kinds. */
export function specPayloadKey(kind: IssueSpecKind): keyof IssueSpec {
  return kind;
}
