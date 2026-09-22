/**
 * Issue work modes — the App-side mirror of the Coolie Web single source.
 *
 * Upstream, the enum lives in `packages/shared/src/constants.ts`
 * (`ISSUE_WORK_MODES`) and the picker rows live in
 * `ui/src/lib/work-mode-meta.ts` (`workModeMetaList`). This module is the same
 * contract, re-expressed once for both Coolie clients (expo + h5) instead of
 * each client re-inventing its own list.
 *
 * The picker exposes three modes, exactly like upstream: `skill_test` is a real
 * member of the enum but never appears as a user choice, which is why
 * `WORK_MODES` (the full enum) and `WORK_MODE_OPTIONS` (the picker) are
 * deliberately different lists.
 */

/** Full enum — mirrors `ISSUE_WORK_MODES` in `packages/shared/src/constants.ts`. */
export const WORK_MODES = ["standard", "ask", "planning", "skill_test"] as const;

export type IssueWorkMode = (typeof WORK_MODES)[number];

/** Modes offered in the composer, in upstream display order. */
export const WORK_MODE_OPTIONS = ["standard", "planning", "ask"] as const satisfies readonly IssueWorkMode[];

export interface WorkModeMeta {
  value: IssueWorkMode;
  /** English label, identical to upstream `workModeMetaList()` (i18n patches key on it). */
  label: string;
  /** One-line explanation, mirrors upstream `titleForPendingWorkMode`. */
  hint: string;
}

const WORK_MODE_META: Record<IssueWorkMode, WorkModeMeta> = {
  standard: {
    value: "standard",
    label: "Auto mode",
    hint: "自动路由执行, 不需要人工规划",
  },
  planning: {
    value: "planning",
    label: "Plan mode",
    hint: "先产出执行计划, 再动手",
  },
  ask: {
    value: "ask",
    label: "Ask mode",
    hint: "负责人只在会话里回答, 不做实现",
  },
  skill_test: {
    value: "skill_test",
    label: "Skill test",
    hint: "技能测试运行",
  },
};

/** Picker rows — mirror of `workModeMetaList()`. */
export function workModeOptions(): WorkModeMeta[] {
  return WORK_MODE_OPTIONS.map((value) => WORK_MODE_META[value]);
}

export function workModeMetaFor(mode: IssueWorkMode): WorkModeMeta {
  return WORK_MODE_META[mode] ?? WORK_MODE_META.standard;
}

/**
 * Narrow an unknown value to a mode the picker can show.
 *
 * Mirrors upstream `isIssueWorkMode`, which also refuses `skill_test` — a
 * persisted `skill_test` task must not make the composer render a mode it has
 * no chip for.
 */
export function isSelectableWorkMode(value: unknown): value is IssueWorkMode {
  return value === "standard" || value === "planning" || value === "ask";
}

export const DEFAULT_WORK_MODE: IssueWorkMode = "standard";
