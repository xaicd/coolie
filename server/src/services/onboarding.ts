import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies, projects } from "@paperclipai/db";
import type {
  CompanyOnboardingResponse,
  CompanyOnboardingState,
} from "@paperclipai/shared";
import type { OnboardingStepInput } from "@paperclipai/shared";
import { notFound } from "../errors.js";
import { projectService } from "./projects.js";
import { issueService } from "./issues.js";

/**
 * Company onboarding (wave155) — the board's own 3-step first-run state.
 *
 *   Step 1: pick an industry (8 scenarios).
 *   Step 2: pick the employees to hire (the default six, or custom).
 *   Step 3: run a demo — one project and five tasks, so the board opens with a
 *           working graph instead of an empty one.
 *
 * State lives in `companies.onboarding_state` (jsonb). NULL means "never
 * onboarded", which is exactly the gate the UI reads to force a first-time
 * company into the wizard. The step is monotonic — `updateOnboardingStep` never
 * moves it backwards, so re-entering an earlier step to change an answer does
 * not re-lock the later ones.
 *
 * This is deliberately separate from `onboarding-seed`: the seed is content the
 * Cloud pushes once; this is local progress the customer drives.
 */

/** The demo project step 3 creates, named so a re-run reuses it. */
export const ONBOARDING_DEMO_PROJECT_NAME = "示范项目";

/** The five tasks the demo seeds, in the order they should appear. */
export const ONBOARDING_DEMO_TASKS = [
  "明确目标与验收标准",
  "拆解为可执行任务",
  "指派负责人并开工",
  "产出第一份交付物",
  "复盘并更新看板",
] as const;

export function onboardingService(db: Db) {
  async function readState(companyId: string): Promise<CompanyOnboardingState | null> {
    const row = await db
      .select({ state: companies.onboardingState })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound("Company not found");
    return row.state ?? null;
  }

  function toResponse(companyId: string, state: CompanyOnboardingState | null): CompanyOnboardingResponse {
    return {
      companyId,
      state,
      onboardedStep: state?.step ?? null,
      completed: Boolean(state?.completedAt),
    };
  }

  async function getOnboardingState(companyId: string): Promise<CompanyOnboardingResponse> {
    return toResponse(companyId, await readState(companyId));
  }

  /**
   * Merge one step's answers into the stored state and advance the reached step
   * (never backwards). Also mirrors the industry onto `companies.metadata` so a
   * later feature can read it without parsing the onboarding blob.
   */
  async function updateOnboardingStep(
    companyId: string,
    input: OnboardingStepInput,
  ): Promise<CompanyOnboardingResponse> {
    const current = await readState(companyId);
    const next: CompanyOnboardingState = {
      ...current,
      step: Math.max(current?.step ?? 0, input.step),
      ...(input.industry ? { industry: input.industry } : {}),
      ...(input.employees ? { employees: input.employees } : {}),
    };
    await db
      .update(companies)
      .set({
        onboardingState: next,
        ...(input.industry ? { metadata: { ...(await readMetadata(companyId)), industry: input.industry } } : {}),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));
    return toResponse(companyId, next);
  }

  async function readMetadata(companyId: string): Promise<Record<string, unknown>> {
    const row = await db
      .select({ metadata: companies.metadata })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound("Company not found");
    return row.metadata ?? {};
  }

  /**
   * Run the demo: create the demo project and its five tasks, then mark the
   * company onboarded. Idempotent — if the recorded demo project still exists,
   * it is reused and its task ids are returned instead of creating a second set.
   */
  async function completeOnboarding(companyId: string): Promise<CompanyOnboardingResponse> {
    const current = await readState(companyId);
    const projectSvc = projectService(db);
    const issueSvc = issueService(db);

    // Reuse the recorded demo project when it is still around.
    const existingDemoId = current?.demoProjectId ?? null;
    let demoProjectId = existingDemoId;
    let demoTaskIds = current?.demoTaskIds ?? [];

    if (existingDemoId) {
      const stillThere = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, existingDemoId))
        .then((rows) => rows[0] ?? null);
      if (!stillThere) {
        demoProjectId = null;
        demoTaskIds = [];
      }
    }

    if (!demoProjectId) {
      const created = await projectSvc.create(companyId, {
        name: ONBOARDING_DEMO_PROJECT_NAME,
        status: "in_progress",
      });
      demoProjectId = created.id;
      demoTaskIds = [];
      for (const title of ONBOARDING_DEMO_TASKS) {
        const issue = await issueSvc.create(companyId, {
          title,
          projectId: created.id,
          status: "todo",
          priority: "medium",
        });
        demoTaskIds.push(issue.id);
      }
    }

    const next: CompanyOnboardingState = {
      ...current,
      step: 3,
      demoProjectId,
      demoTaskIds,
      completedAt: current?.completedAt ?? new Date().toISOString(),
    };
    await db
      .update(companies)
      .set({ onboardingState: next, updatedAt: new Date() })
      .where(eq(companies.id, companyId));
    return toResponse(companyId, next);
  }

  return { getOnboardingState, updateOnboardingStep, completeOnboarding };
}

export type OnboardingService = ReturnType<typeof onboardingService>;
