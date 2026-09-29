import type { IssueSpecKind } from "../constants.js";

/**
 * Spec-driven development (wave147).
 *
 * CMMI (G1–G5, `cmmi-*` skills) governs a project end to end — the right weight
 * for the boss/PM plane. The development plane is lighter: every code change is
 * meant to carry a small three-step spec chain, requirement/bugfix → design →
 * task, the Kiro shape the repo already practises through
 * `.agents/skills/requirements-capture` + `system-design-spec`.
 *
 * A spec rides on an issue: one issue carries at most one `IssueSpec`, whose
 * `kind` names which payload is populated. The chain is expressed by
 * `parentSpecId`, which points at the *issue* that carries the parent spec —
 * tasks point at their design, a design points at the requirement/bugfix it
 * answers. The whole chain is therefore a subtree of the ordinary issue tree.
 */
export interface IssueSpecRequirement {
  /** What to build / change, in 1–3 sentences. */
  body: string;
  /** Acceptance criteria — each one a checkable statement. */
  acceptanceCriteria: string[];
}

export interface IssueSpecBugfix {
  /** How to reproduce, step by step. */
  reproSteps: string;
  /** What the system should have done. */
  expectedBehavior: string;
  /** What it actually does. */
  actualBehavior: string;
}

export interface IssueSpecDesign {
  /** The chosen approach. */
  approach: string;
  /** Trade-offs considered — one line each, the reasoning the next reader needs. */
  tradeoffs: string[];
  /** Interface / data / boundary surface this design fixes. */
  apiSurface?: string | null;
}

export interface IssueSpecTask {
  /** Files this task will touch. */
  files: string[];
  /** Concrete steps to carry the change out. */
  steps: string[];
}

export interface IssueSpec {
  kind: IssueSpecKind;
  /** Parent spec, by the id of the issue that carries it. */
  parentSpecId?: string | null;
  requirement?: IssueSpecRequirement;
  bugfix?: IssueSpecBugfix;
  design?: IssueSpecDesign;
  task?: IssueSpecTask;
}

/** `GET/POST /api/issues/:id/spec`. */
export interface IssueSpecResponse {
  issueId: string;
  specKind: IssueSpecKind | null;
  spec: IssueSpec | null;
}

/** One node of `GET /api/companies/:companyId/specs/tree`. */
export interface IssueSpecTreeNode {
  issueId: string;
  identifier: string | null;
  title: string;
  status: string;
  specKind: IssueSpecKind;
  spec: IssueSpec;
  children: IssueSpecTreeNode[];
}

export interface IssueSpecTreeResponse {
  roots: IssueSpecTreeNode[];
}
