import { describe, expect, it } from "vitest";
import { CMMI_WBS_PHASES, type ProjectWbsDraftItem } from "@paperclipai/shared";
import { buildWbsDraft, MAX_GOAL_WORK_PACKAGES } from "./wbs-draft.js";

const byCode = (items: ProjectWbsDraftItem[]) => new Map(items.map((item) => [item.code, item]));

describe("buildWbsDraft", () => {
  it("splits the project into the six CMMI phases, each closing with a gated milestone", () => {
    const draft = buildWbsDraft({ projectName: "产融协同平台", now: new Date("2026-09-29T00:00:00Z") });

    expect(draft.generatedAt).toBe("2026-09-29T00:00:00.000Z");
    expect(draft.source).toBeNull();

    const items = byCode(draft.items);
    for (const [index, phase] of CMMI_WBS_PHASES.entries()) {
      const phaseCode = String(index + 1);
      expect(items.get(phaseCode)).toMatchObject({ type: "phase", parentCode: null });
      // Each phase closes with exactly one milestone carrying the phase's gate.
      const milestones = draft.items.filter(
        (item) => item.isMilestone && item.code.startsWith(`${phaseCode}.`),
      );
      expect(milestones).toHaveLength(1);
      expect(milestones[0].milestone?.gate ?? null).toBe(phase.gate);
      expect(milestones[0].milestone?.status).toBe("not_started");
    }
  });

  it("reuses document goals as the 需求确认 work packages", () => {
    const draft = buildWbsDraft({ projectName: "P", goalTitles: ["统一门户", "支付结算"] });

    expect(draft.goalTitles).toEqual(["统一门户", "支付结算"]);
    const items = byCode(draft.items);
    expect(items.get("1.1")).toMatchObject({ type: "work_package", title: "统一门户", parentCode: "1" });
    expect(items.get("1.2")).toMatchObject({ type: "work_package", title: "支付结算", parentCode: "1" });
    // The 需求确认 milestone follows the two work packages.
    expect(items.get("1.3")).toMatchObject({ isMilestone: true, milestone: { gate: "gate_g1_spec" } });
    // A phase with no document goals still gets one generic work package.
    expect(items.get("2.1")).toMatchObject({ type: "work_package", parentCode: "2" });
    expect(items.get("2.2")).toMatchObject({ isMilestone: true, milestone: { gate: "gate_g2_arch" } });
  });

  it("caps document-derived work packages and keeps every code unique", () => {
    const goalTitles = Array.from({ length: 12 }, (_, i) => `目标 ${i + 1}`);
    const draft = buildWbsDraft({ projectName: "P", goalTitles });

    expect(draft.goalTitles).toHaveLength(MAX_GOAL_WORK_PACKAGES);
    const codes = draft.items.map((item) => item.code);
    expect(new Set(codes).size).toBe(codes.length);
    // Every non-phase item hangs off its phase.
    for (const item of draft.items) {
      if (item.type !== "phase") {
        expect(byCode(draft.items).get(item.parentCode!)).toMatchObject({ type: "phase" });
      }
    }
  });

  it("records the source document filename for provenance", () => {
    const draft = buildWbsDraft({ projectName: "P", source: "技术规范书.docx" });
    expect(draft.source).toBe("技术规范书.docx");
  });
});
