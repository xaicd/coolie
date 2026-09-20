import type { Db } from "@paperclipai/db";
import { issueService } from "./index.js";
import {
  BUILD_AGENT_TYPES,
  BUILD_AGENT_TYPE_LABELS,
  BUILD_STEP_AGENT_TYPE,
  BUILD_STEP_KINDS,
  dispatchBuildStep,
  resolveBuildStaffing,
  type BuildActor,
  type BuildAgentType,
  type BuildOrchestratorDeps,
  type BuildStepKind,
  type BuildStepPacing,
} from "./build-orchestrator.js";
import type { IssueAssignmentWakeupDeps } from "./issue-assignment-wakeup.js";
import type { OntologyBuildSpec } from "./ontology-spec.js";

/**
 * A domain build's issue chain, grouped by object type.
 *
 * A code build's chain is five steps, one card each, which is exactly what
 * `createBuildPlanIssues` makes. A *domain* build has the same five phases but a
 * different amount of work inside one of them: the implementation phase is one
 * card per object type in the approved model, not one card for "the model". That
 * is the whole reason this module exists rather than a flag on the other one.
 *
 * What it deliberately does not do: re-derive the sequential gate. Each phase's
 * cards are blocked by *every* card of the previous phase, so a phase cannot start
 * until the one before it is finished, and the platform's existing
 * dependency-resolved wakeup releases the next phase when its blockers close.
 * Nothing here schedules work on a timer.
 *
 * Ties to the rest of build mode:
 *  - it uses `dispatchBuildStep`, so a newly runnable card obeys the same
 *    per-worker cool-down as a code build's step (a domain build creates several
 *    runnable cards at once, which is exactly the burst pacing exists for);
 *  - it uses `resolveBuildStaffing`, so a card is only assigned to an agent the
 *    create call would accept.
 */

/** The step titles for the kinds that stay a single card. */
const STEP_TITLES: Record<BuildStepKind, string> = {
  requirements: "需求梳理",
  design: "方案设计",
  impl: "编码实现",
  test: "测试验收",
  release: "发布上线",
};

export interface SpecBuildIssue {
  step: number;
  kind: BuildStepKind;
  title: string;
  /** Empty for a phase that is a single card rather than a group of them. */
  nodeTypes: string[];
  issueId: string;
  identifier: string | null;
  status: string;
  assigneeAgentId: string | null;
  pacing: BuildStepPacing | null;
}

export interface DecomposeSpecInput {
  companyId: string;
  /** The issue holding the approved spec; every card here is its child. */
  buildId: string;
  spec: OntologyBuildSpec;
  actor: BuildActor;
}

/**
 * One card per object type inside `impl`, one card per phase everywhere else.
 *
 * Why only `impl`: requirements and design are about the model *as a whole* —
 * splitting them by object type would produce cards that each describe one type
 * and none that describe how they fit, which is the part those phases are for.
 * Implementation is where per-type work is genuinely independent.
 */
function workUnitsFor(spec: OntologyBuildSpec, kind: BuildStepKind): Array<{ title: string; nodeTypes: string[] }> {
  if (kind === "impl") {
    const declared = spec.build.steps.find((step) => step.kind === "impl")?.nodeTypes ?? [];
    if (declared.length > 0) {
      return declared.map((key) => ({
        title: `实现对象类型 ${key}`,
        nodeTypes: [key],
      }));
    }
  }
  return [{ title: STEP_TITLES[kind], nodeTypes: [] }];
}

export async function decomposeSpecIntoBuildIssues(
  deps: BuildOrchestratorDeps & { heartbeat?: IssueAssignmentWakeupDeps },
  input: DecomposeSpecInput,
): Promise<{
  issues: SpecBuildIssue[];
  unassignedAgentTypes: BuildAgentType[];
}> {
  const { db, heartbeat } = deps;
  const issueSvc = issueService(db);
  const staffing = await resolveBuildStaffing(db, input.companyId);

  const actorFields = {
    createdByAgentId: input.actor.agentId,
    createdByUserId: input.actor.actorType === "user" ? input.actor.actorId : null,
    responsibleUserId: input.actor.actorType === "user" ? input.actor.actorId : null,
    trustExplicitResponsibleUserId: input.actor.actorType === "user",
    actorRunId: input.actor.runId,
  };

  const created: SpecBuildIssue[] = [];
  /** Every issue of the previous phase: a card waits on all of them, not just one. */
  let previousPhaseIssueIds: string[] = [];
  let stepIndex = 0;

  for (const kind of BUILD_STEP_KINDS) {
    const units = workUnitsFor(input.spec, kind);
    const assignedAgentType = BUILD_STEP_AGENT_TYPE[kind];
    const assigneeAgentId = staffing.byAgentType.get(assignedAgentType) ?? null;
    const phaseIssueIds: string[] = [];

    for (const unit of units) {
      const issue = await issueSvc.create(input.companyId, {
        title: unit.title,
        description:
          `本体构建环节: ${kind}\n` +
          `负责类型: ${assignedAgentType} / ${BUILD_AGENT_TYPE_LABELS[assignedAgentType]}\n` +
          `所属构建: ${input.buildId}\n` +
          (unit.nodeTypes.length ? `对象类型: ${unit.nodeTypes.join(", ")}\n` : ""),
        parentId: input.buildId,
        status: previousPhaseIssueIds.length > 0 ? "blocked" : "todo",
        priority: "medium",
        originKind: "build_plan",
        originId: input.buildId,
        ...(assigneeAgentId ? { assigneeAgentId } : {}),
        ...(previousPhaseIssueIds.length > 0
          ? { blockedByIssueIds: previousPhaseIssueIds }
          : {}),
        ...actorFields,
      });
      phaseIssueIds.push(issue.id);

      // Only the first phase is runnable at creation; everything else waits for
      // its blockers, and is released by the dependency-resolved wakeup. A
      // runnable card still has to clear its worker's cool-down and parks if not.
      const pacing =
        heartbeat && previousPhaseIssueIds.length === 0 && issue.assigneeAgentId
          ? await dispatchBuildStep({
              deps,
              heartbeat,
              buildId: input.buildId,
              kind,
              actor: input.actor,
              issue: {
                id: issue.id,
                assigneeAgentId: issue.assigneeAgentId,
                status: issue.status,
              },
              adapterType: staffing.adapterTypeByAgentId.get(issue.assigneeAgentId) ?? null,
            })
          : null;

      created.push({
        step: stepIndex,
        kind,
        title: unit.title,
        nodeTypes: unit.nodeTypes,
        issueId: issue.id,
        identifier: issue.identifier ?? null,
        status: issue.status,
        assigneeAgentId: issue.assigneeAgentId ?? null,
        pacing,
      });
      stepIndex += 1;
    }

    previousPhaseIssueIds = phaseIssueIds;
  }

  return {
    issues: created,
    unassignedAgentTypes: BUILD_AGENT_TYPES.filter((type) => !staffing.byAgentType.has(type)),
  };
}
