import { describe, expect, it } from "vitest";
import type { IssueMilestone } from "./types/issue.js";
import {
  buildWbsMainline,
  compareWbsCode,
  evaluateWbsGates,
  milestoneSatisfied,
  wbsPhaseNumber,
  wbsSegments,
  type WbsIssueLike,
} from "./wbs.js";

function milestone(overrides: Partial<IssueMilestone> = {}): IssueMilestone {
  return {
    gate: null,
    status: "not_started",
    plannedDate: null,
    completedDate: null,
    approver: null,
    evidence: null,
    exempted: false,
    exemptionReason: null,
    ...overrides,
  };
}

function task(id: string, code: string, overrides: Partial<WbsIssueLike> = {}): WbsIssueLike {
  return { id, title: `task ${id}`, wbsCode: code, wbsType: "task", ...overrides };
}

function milestoneIssue(id: string, code: string, overrides: Partial<IssueMilestone> = {}): WbsIssueLike {
  return {
    id,
    title: `milestone ${id}`,
    wbsCode: code,
    wbsType: "task",
    isMilestone: true,
    milestone: milestone(overrides),
  };
}

describe("WBS code helpers", () => {
  it("parses segments and compares numerically, not lexically", () => {
    expect(wbsSegments("1.10.2")).toEqual([1, 10, 2]);
    expect(wbsSegments(null)).toEqual([]);
    // "1.10" must sort after "1.2" — a plain string compare would get this wrong.
    expect(compareWbsCode("1.2", "1.10")).toBeLessThan(0);
    expect(compareWbsCode("1.2.3", "1.2")).toBeGreaterThan(0);
    expect(compareWbsCode("2", "1.9")).toBeGreaterThan(0);
  });

  it("reads the top-level phase number", () => {
    expect(wbsPhaseNumber("3.2")).toBe(3);
    expect(wbsPhaseNumber("5")).toBe(5);
    expect(wbsPhaseNumber(undefined)).toBe(0);
  });
});

describe("milestoneSatisfied", () => {
  it("is satisfied only when achieved or exempted", () => {
    expect(milestoneSatisfied(milestone({ status: "achieved" }))).toBe(true);
    expect(milestoneSatisfied(milestone({ exempted: true }))).toBe(true);
    expect(milestoneSatisfied(milestone({ status: "blocked" }))).toBe(false);
    expect(milestoneSatisfied(null)).toBe(false);
  });
});

describe("evaluateWbsGates", () => {
  const issues: WbsIssueLike[] = [
    milestoneIssue("m1", "1.2", { status: "achieved", gate: "gate_g1_spec" }),
    task("t2", "2.1"),
    milestoneIssue("m2", "2.2", { status: "not_started", gate: "gate_g2_arch" }),
    task("t3", "3.1"),
    milestoneIssue("m4", "4.2", { status: "not_started", gate: "gate_g3_compile" }),
    task("t5", "5.1"),
  ];

  it("blocks the phase downstream of an unmet gate, not the phase itself", () => {
    const gates = evaluateWbsGates(issues);
    // Phase 1's milestone is achieved → nothing before phase 2 blocks.
    expect(gates.get("t2")).toMatchObject({ blocked: false });
    // Phase 2's gate is unmet → phase 3 work is blocked by it.
    expect(gates.get("t3")).toMatchObject({
      blocked: true,
      blockedByMilestoneId: "m2",
      blockedByMilestoneCode: "2.2",
    });
    // Phase 2's own milestone is not blocked by itself.
    expect(gates.get("m2")?.blocked).toBe(false);
    // Phase 5 is blocked by the earliest unmet gate (m2), not the nearest (m4).
    expect(gates.get("t5")).toMatchObject({ blocked: true, blockedByMilestoneId: "m2" });
  });

  it("clears the block when the gate is exempted with a reason", () => {
    const exempted = issues.map((issue) =>
      issue.id === "m2"
        ? milestoneIssue("m2", "2.2", { status: "not_started", gate: "gate_g2_arch", exempted: true, exemptionReason: "客户书面同意" })
        : issue,
    );
    const gates = evaluateWbsGates(exempted);
    expect(gates.get("t3")?.blocked).toBe(false);
  });

  it("does not block on a milestone that is absent (partial fetch / not adopted)", () => {
    const partial: WbsIssueLike[] = [task("t3", "3.1")];
    expect(evaluateWbsGates(partial).get("t3")?.blocked).toBe(false);
  });
});

describe("buildWbsMainline", () => {
  it("reports each phase's milestone, adopted work and overall progress", () => {
    const mainline = buildWbsMainline([
      milestoneIssue("m1", "1.2", { status: "achieved", gate: "gate_g1_spec", approver: "掌柜" }),
      task("t1", "1.1"),
      milestoneIssue("m2", "2.2", { status: "in_progress", gate: "gate_g2_arch" }),
      task("t2a", "2.1"),
      task("t2b", "2.3", { status: "done" }),
    ]);

    expect(mainline.phases).toHaveLength(6);
    expect(mainline.phases[0]).toMatchObject({ name: "需求确认", gate: "gate_g1_spec", issueCount: 1, doneCount: 0 });
    expect(mainline.phases[0].milestone).toMatchObject({ status: "achieved", approver: "掌柜" });
    expect(mainline.phases[1]).toMatchObject({ name: "架构/设计", issueCount: 2, doneCount: 1 });
    expect(mainline.phases[2]).toMatchObject({ name: "详细设计", gate: null, milestone: null, issueCount: 0 });
    expect(mainline.totalGates).toBe(5);
    expect(mainline.achievedGates).toBe(1);
    // Phase 2 (index 1) is the earliest gated phase whose milestone is unmet.
    expect(mainline.currentPhaseIndex).toBe(1);
  });

  it("skips an exempted gate when deciding where the project stands", () => {
    const mainline = buildWbsMainline([
      milestoneIssue("m1", "1.2", { status: "achieved", gate: "gate_g1_spec" }),
      milestoneIssue("m2", "2.2", { status: "blocked", gate: "gate_g2_arch", exempted: true, exemptionReason: "客户同意" }),
    ]);
    expect(mainline.currentPhaseIndex).toBe(3);
  });
});
