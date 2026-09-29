import {
  CMMI_WBS_PHASES,
  type ProjectWbsDraft,
  type ProjectWbsDraftItem,
  type IssueMilestone,
} from "@paperclipai/shared";

/**
 * Build a CMMI WBS draft from a project's initialisation context.
 *
 * Pure and dependency-free (no I/O, no clock read — `now` is injected) so the
 * breakdown rule can be unit-tested on its own. The persistence layer stores the
 * result on `projects.wbs_draft`; the project head then adopts or dismisses it.
 *
 * The six top-level phases are the CMMI lifecycle (需求确认 → … → 上线移交). Each
 * phase carries at least one 工作包 and closes with a 里程碑 task that carries the
 * gate that phase closes. When the requirement document yielded goal titles, the
 * 需求确认 phase's work packages are those goals — so the draft visibly reflects
 * the document rather than being a generic template.
 *
 * Sample input → output:
 *
 *   buildWbsDraft({ projectName: "产融协同平台", goalTitles: ["数据中台建设"], source: "技术规范书.docx" })
 *   → { source: "技术规范书.docx", goalTitles: ["数据中台建设"], items: [
 *       { code: "1",   type: "phase",        title: "产融协同平台 · 需求确认阶段" },
 *       { code: "1.1", type: "work_package", title: "数据中台建设",     parentCode: "1" },
 *       { code: "1.2", type: "task",         title: "需求确认收口里程碑", isMilestone: true,
 *         milestone: { gate: "gate_g1_spec", status: "not_started", … } },
 *       { code: "2",   type: "phase",        title: "产融协同平台 · 架构/设计阶段" },
 *       … ] }
 */

/** Cap on document-derived 需求 work packages — mirrors the goal cap in enrichment. */
export const MAX_GOAL_WORK_PACKAGES = 8;

export interface BuildWbsDraftInput {
  projectName: string;
  /** Goal titles the document produced (reused as 需求确认 work packages). */
  goalTitles?: readonly string[];
  /** Source document filename, recorded on the draft for provenance. */
  source?: string | null;
  /** Injected clock so the builder is deterministic under test. */
  now?: Date;
}

function emptyMilestone(gate: IssueMilestone["gate"]): IssueMilestone {
  return {
    gate,
    status: "not_started",
    plannedDate: null,
    completedDate: null,
    approver: null,
    evidence: null,
    exempted: false,
    exemptionReason: null,
  };
}

export function buildWbsDraft(input: BuildWbsDraftInput): ProjectWbsDraft {
  const now = input.now ?? new Date();
  const goalTitles = [...(input.goalTitles ?? [])].slice(0, MAX_GOAL_WORK_PACKAGES);
  const items: ProjectWbsDraftItem[] = [];

  CMMI_WBS_PHASES.forEach((phase, index) => {
    const phaseCode = String(index + 1);
    items.push({
      code: phaseCode,
      type: "phase",
      title: `${input.projectName} · ${phase.name}阶段`,
      description: null,
      isMilestone: false,
      milestone: null,
      parentCode: null,
    });

    const workPackages =
      index === 0 && goalTitles.length > 0 ? goalTitles : [`${phase.name}阶段工作包`];
    workPackages.forEach((title, i) => {
      items.push({
        code: `${phaseCode}.${i + 1}`,
        type: "work_package",
        title,
        description: null,
        isMilestone: false,
        milestone: null,
        parentCode: phaseCode,
      });
    });

    items.push({
      code: `${phaseCode}.${workPackages.length + 1}`,
      type: "task",
      title: `${phase.name}收口里程碑`,
      description: phase.acceptance,
      isMilestone: true,
      milestone: emptyMilestone(phase.gate),
      parentCode: phaseCode,
    });
  });

  return {
    generatedAt: now.toISOString(),
    source: input.source ?? null,
    goalTitles,
    items,
  };
}
