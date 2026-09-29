import {
  CMMI_WBS_PHASES,
  cmmiGateDefinition,
  type CmmiGateKey,
  type IssueWbsType,
  type MilestoneStatus,
} from "./constants.js";
import type { IssueMilestone } from "./types/issue.js";

/**
 * Pure CMMI WBS logic (wave140) — no I/O, no framework. Both the server
 * (serialising gate state / the mainline payload) and the web board (rendering
 * the mainline view and the 只看主线-gated warnings) call into this one module,
 * so the two surfaces cannot drift.
 *
 * The WBS a project is broken into is the six {@link CMMI_WBS_PHASES}; a phase's
 * 收口 produces a milestone carrying the gate that phase closes. A task under a
 * phase is "gate-blocked" when an earlier gated phase's milestone is unmet and
 * not exempted — the stage-gate linkage.
 */

/** The minimum shape the WBS helpers read off an issue. */
export interface WbsIssueLike {
  id: string;
  title: string;
  status?: string | null;
  wbsCode?: string | null;
  wbsType?: IssueWbsType | null;
  isMilestone?: boolean | null;
  milestone?: IssueMilestone | null;
}

/** Parse a WBS number ("1.2.3") into its numeric segments. Non-numeric → []. */
export function wbsSegments(code: string | null | undefined): number[] {
  if (!code) return [];
  return code
    .split(".")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isFinite(value));
}

/** lexicographic-but-numeric compare of two WBS numbers ("1.2" before "1.10"). */
export function compareWbsCode(a: string | null | undefined, b: string | null | undefined): number {
  const left = wbsSegments(a);
  const right = wbsSegments(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? -1;
    const r = right[i] ?? -1;
    if (l !== r) return l - r;
  }
  return 0;
}

/** The 1-based top-level phase number a WBS code sits under (0 when unknown). */
export function wbsPhaseNumber(code: string | null | undefined): number {
  return wbsSegments(code)[0] ?? 0;
}

/** True when an issue is a 里程碑/主线 task. */
export function isMainlineIssue(issue: Pick<WbsIssueLike, "isMilestone">): boolean {
  return issue.isMilestone === true;
}

/** Normalise a milestone's status (a milestone with no block counts as 未开始). */
export function milestoneStatus(milestone: IssueMilestone | null | undefined): MilestoneStatus {
  return milestone?.status ?? "not_started";
}

/** A gated milestone blocks its successors until it is achieved or exempted. */
export function milestoneSatisfied(
  milestone: { status?: MilestoneStatus | null; exempted?: boolean | null } | null | undefined,
): boolean {
  if (!milestone) return false;
  return milestone.status === "achieved" || milestone.exempted === true;
}

export interface WbsGateState {
  /** The gate of the nearest gated phase at or before this issue's phase. */
  gate: CmmiGateKey | null;
  /** True when the issue sits downstream of an unmet, non-exempted gate. */
  blocked: boolean;
  blockedByMilestoneId: string | null;
  blockedByMilestoneCode: string | null;
  blockedByMilestoneTitle: string | null;
  /** Human-readable reason, ready for a tooltip. */
  reason: string | null;
}

const PHASE_BY_NUMBER = new Map(
  CMMI_WBS_PHASES.map((phase, index) => [index + 1, phase] as const),
);

/**
 * Evaluate the stage-gate linkage for a project's issues. A task is blocked when
 * an earlier gated phase's milestone exists and is neither achieved nor
 * exempted. A milestone missing from the set (partial fetch / not yet adopted)
 * does not block — we only gate on a milestone we can actually see.
 */
export function evaluateWbsGates(issues: readonly WbsIssueLike[]): Map<string, WbsGateState> {
  const milestonesByPhase = new Map<number, WbsIssueLike>();
  for (const issue of issues) {
    if (!isMainlineIssue(issue)) continue;
    const phase = wbsPhaseNumber(issue.wbsCode);
    if (phase > 0 && !milestonesByPhase.has(phase)) milestonesByPhase.set(phase, issue);
  }

  const unmetGateBefore = (phaseNumber: number) => {
    let worst: WbsIssueLike | null = null;
    for (const [phase, milestone] of milestonesByPhase) {
      if (phase >= phaseNumber) continue;
      const definition = PHASE_BY_NUMBER.get(phase);
      if (!definition?.gate) continue;
      if (milestoneSatisfied(milestone.milestone)) continue;
      if (!worst || compareWbsCode(milestone.wbsCode, worst.wbsCode) < 0) worst = milestone;
    }
    return worst;
  };

  const result = new Map<string, WbsGateState>();
  for (const issue of issues) {
    const phaseNumber = wbsPhaseNumber(issue.wbsCode);
    const definition = PHASE_BY_NUMBER.get(phaseNumber) ?? null;
    const blocker = phaseNumber > 0 ? unmetGateBefore(phaseNumber) : null;
    result.set(issue.id, {
      gate: definition?.gate ?? null,
      blocked: blocker != null,
      blockedByMilestoneId: blocker?.id ?? null,
      blockedByMilestoneCode: blocker?.wbsCode ?? null,
      blockedByMilestoneTitle: blocker?.title ?? null,
      reason: blocker
        ? `上游里程碑未达成: ${blocker.wbsCode ?? ""} ${blocker.title}`.trim()
        : null,
    });
  }
  return result;
}

export interface WbsMainlineMilestone {
  id: string;
  code: string;
  title: string;
  gate: CmmiGateKey | null;
  gateLabel: string | null;
  status: MilestoneStatus;
  plannedDate: string | null;
  completedDate: string | null;
  approver: string | null;
  evidence: string | null;
  exempted: boolean;
  exemptionReason: string | null;
  /** True when an earlier gated milestone is unmet and not exempted. */
  blocked: boolean;
}

export interface WbsMainlinePhase {
  /** 0-based index; the WBS number of the phase is `index + 1`. */
  index: number;
  key: string;
  name: string;
  gate: CmmiGateKey | null;
  acceptance: string;
  milestone: WbsMainlineMilestone | null;
  /** Adopted non-milestone work under this phase. */
  issueCount: number;
  doneCount: number;
}

export interface WbsMainline {
  phases: WbsMainlinePhase[];
  /** Gated milestones achieved / gated milestone total. */
  achievedGates: number;
  totalGates: number;
  /** Earliest gated phase whose milestone is unmet — "where the project stands". */
  currentPhaseIndex: number | null;
}

/**
 * Build the milestone mainline: each CMMI phase with its 收口 milestone, its
 * adopted work, and whether an upstream gate is holding it back.
 */
export function buildWbsMainline(issues: readonly WbsIssueLike[]): WbsMainline {
  const gates = evaluateWbsGates(issues);
  const phases: WbsMainlinePhase[] = CMMI_WBS_PHASES.map((phase, index) => {
    const phaseNumber = index + 1;
    const children = issues.filter(
      (issue) => wbsPhaseNumber(issue.wbsCode) === phaseNumber,
    );
    const milestoneIssue = children.find((issue) => isMainlineIssue(issue)) ?? null;
    const work = children.filter((issue) => !isMainlineIssue(issue));
    const definition = cmmiGateDefinition(phase.gate);
    return {
      index,
      key: phase.key,
      name: phase.name,
      gate: phase.gate,
      acceptance: phase.acceptance,
      milestone: milestoneIssue
        ? {
          id: milestoneIssue.id,
          code: milestoneIssue.wbsCode ?? String(phaseNumber),
          title: milestoneIssue.title,
          gate: phase.gate,
          gateLabel: definition?.label ?? null,
          status: milestoneStatus(milestoneIssue.milestone),
          plannedDate: milestoneIssue.milestone?.plannedDate ?? null,
          completedDate: milestoneIssue.milestone?.completedDate ?? null,
          approver: milestoneIssue.milestone?.approver ?? null,
          evidence: milestoneIssue.milestone?.evidence ?? null,
          exempted: milestoneIssue.milestone?.exempted === true,
          exemptionReason: milestoneIssue.milestone?.exemptionReason ?? null,
          blocked: gates.get(milestoneIssue.id)?.blocked === true,
        }
        : null,
      issueCount: work.length,
      doneCount: work.filter((issue) => issue.status === "done").length,
    } satisfies WbsMainlinePhase;
  });

  const gated = phases.filter((phase) => phase.gate != null);
  const achievedGates = gated.filter((phase) => milestoneSatisfied(phase.milestone)).length;
  const currentPhaseIndex = gated.find((phase) => {
    if (!phase.milestone) return true;
    if (milestoneSatisfied(phase.milestone)) return false;
    return phase.milestone.exempted !== true;
  })?.index ?? null;

  return {
    phases,
    achievedGates,
    totalGates: gated.length,
    currentPhaseIndex,
  };
}
