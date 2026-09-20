import { spawn } from "node:child_process";
import type { Db } from "@paperclipai/db";
import {
  getAgentWorkEligibility,
  type AgentEligibilityAgent,
  type AgentRole,
} from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";
import { agentService, issueService } from "./index.js";
import {
  queueIssueAssignmentWakeup,
  type IssueAssignmentWakeupDeps,
} from "./issue-assignment-wakeup.js";

/**
 * DS-style build mode.
 *
 * A "build <x>" ask in the board room becomes a sequenced chain of five issue
 * cards — requirements -> design -> impl -> test -> release — where each card is
 * assigned to the agent type that owns that phase.
 *
 * The sequential gate is NOT reimplemented here. The platform already models a
 * blocked-by edge (`issue_relations` type `blocks`, written through
 * `issueService.create({ blockedByIssueIds })`) and already wakes dependents when
 * their last blocker reaches `done` (`listWakeableBlockedDependents` + the
 * dependency-resolved wakeup in the issue routes). So every step after the first
 * is created `blocked` with its predecessor as its blocker, and the existing
 * resume path advances the chain. Nothing in this module schedules work itself.
 */

/** "build xxx" / "开发 xxx" / "做 xxx" at the start of a board message. */
export const BUILD_TRIGGER_PATTERN = /^(?:build|开发|做)\s+/i;

export const BUILD_STEP_KINDS = [
  "requirements",
  "design",
  "impl",
  "test",
  "release",
] as const;
export type BuildStepKind = (typeof BUILD_STEP_KINDS)[number];

/**
 * The build-plan vocabulary. These are phase owners, not company roles: a company
 * hires `engineer`/`designer`/`qa`/`pm` agents, and `BUILD_AGENT_TYPE_ROLE_CHAIN`
 * maps a phase owner onto the roles that can staff it.
 */
export const BUILD_AGENT_TYPES = ["arch", "dev", "qa", "pm"] as const;
export type BuildAgentType = (typeof BUILD_AGENT_TYPES)[number];

export const BUILD_STEP_AGENT_TYPE: Record<BuildStepKind, BuildAgentType> = {
  requirements: "pm",
  design: "arch",
  impl: "dev",
  test: "qa",
  release: "pm",
};

export const BUILD_AGENT_TYPE_LABELS: Record<BuildAgentType, string> = {
  arch: "架构",
  dev: "研发",
  qa: "测试",
  pm: "产品",
};

/**
 * Roles that can staff each phase owner, most specific first. The chains end at
 * `general` so a company staffed with only generic agents can still run a build
 * instead of silently creating an unassigned chain that never advances — an
 * unassigned step is never woken, because the wake path requires an assignee.
 */
export const BUILD_AGENT_TYPE_ROLE_CHAIN: Record<BuildAgentType, AgentRole[]> = {
  arch: ["cto", "designer", "engineer", "general"],
  dev: ["engineer", "cto", "designer", "general"],
  qa: ["qa", "engineer", "general"],
  pm: ["pm", "general"],
};

/** Templated titles, used when the planner is unavailable or half-answers. */
const BUILD_STEP_TITLES: Record<BuildStepKind, string> = {
  requirements: "需求梳理",
  design: "方案设计",
  impl: "编码实现",
  test: "测试验收",
  release: "发布上线",
};

const PLAN_TIMEOUT_MS = 60_000;
const PLAN_MAX_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_PLANNER_MODEL = "glm-5.3-flash";

export interface BuildPlanStep {
  step: number;
  kind: BuildStepKind;
  title: string;
  description: string;
  assignedAgentType: BuildAgentType;
  dependsOn: number[];
}

export interface BuildPlanStepIssue extends BuildPlanStep {
  issueId: string;
  identifier: string | null;
  status: string;
  assigneeAgentId: string | null;
}

export interface BuildActor {
  actorType: "user" | "agent";
  actorId: string;
  agentId: string | null;
  runId: string | null;
}

export interface BuildOrchestratorDeps {
  db: Db;
  heartbeat?: IssueAssignmentWakeupDeps;
}

export function detectBuildTrigger(text: string): boolean {
  return BUILD_TRIGGER_PATTERN.test(text.trim());
}

/** The build request with the trigger word stripped: "build 登录页" -> "登录页". */
export function buildPromptSubject(prompt: string): string {
  return prompt.trim().replace(BUILD_TRIGGER_PATTERN, "").trim();
}

/**
 * The strict linear chain. `dependsOn` is derived here rather than taken from the
 * model: the sequential gate is the feature, so a planner that returns a parallel
 * or cyclic graph must not be able to weaken it.
 */
function buildPlanStep(
  index: number,
  kind: BuildStepKind,
  title: string,
  description: string,
): BuildPlanStep {
  return {
    step: index,
    kind,
    title,
    description,
    assignedAgentType: BUILD_STEP_AGENT_TYPE[kind],
    dependsOn: index === 0 ? [] : [index - 1],
  };
}

export function templateBuildPlan(prompt: string): BuildPlanStep[] {
  const subject = buildPromptSubject(prompt);
  return BUILD_STEP_KINDS.map((kind, index) =>
    buildPlanStep(
      index,
      kind,
      `${BUILD_STEP_TITLES[kind]}: ${subject}`,
      `构建「${subject}」的${BUILD_STEP_TITLES[kind]}环节。`,
    ),
  );
}

const PLANNER_SYSTEM_PROMPT = [
  "You are the build planner for a software company.",
  "Decompose the build request into exactly five sequential phases.",
  "Return ONE JSON object and nothing else — no prose, no markdown fence.",
  'Shape: {"plan":[{"kind":"requirements","title":"...","description":"..."}]}',
  "`kind` must be each of requirements, design, impl, test, release exactly once, in that order.",
  "`title` is at most 60 characters and names the phase's deliverable.",
  "`description` is one to three sentences describing the concrete deliverable.",
  "Write both in the same language as the build request.",
].join("\n");

/** Outermost JSON object in the planner's output, tolerating a fenced block. */
export function extractPlanJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  for (const candidate of [fenced?.[1], raw]) {
    if (!candidate) continue;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function planEntries(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const list = record.plan ?? record.steps;
  return Array.isArray(list) ? list : null;
}

/**
 * Accept the planner's answer only if it covers all five phases. A partial answer
 * is rejected outright rather than merged with the template — a plan that is half
 * model output and half placeholder is harder to reason about than a fallback
 * that is wholly one or the other, and `source` stays honest either way.
 */
export function normalizeBuildPlan(value: unknown, prompt: string): BuildPlanStep[] | null {
  const entries = planEntries(value);
  if (!entries) return null;

  const byKind = new Map<BuildStepKind, Record<string, unknown>>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const kind = record.kind;
    if (typeof kind !== "string") continue;
    if (!(BUILD_STEP_KINDS as readonly string[]).includes(kind)) continue;
    if (byKind.has(kind as BuildStepKind)) return null;
    byKind.set(kind as BuildStepKind, record);
  }
  if (byKind.size !== BUILD_STEP_KINDS.length) return null;

  const subject = buildPromptSubject(prompt);
  return BUILD_STEP_KINDS.map((kind, index) => {
    const record = byKind.get(kind)!;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const description =
      typeof record.description === "string" ? record.description.trim() : "";
    return buildPlanStep(
      index,
      kind,
      title.slice(0, 200) || `${BUILD_STEP_TITLES[kind]}: ${subject}`,
      description || `构建「${subject}」的${BUILD_STEP_TITLES[kind]}环节。`,
    );
  });
}

async function requestPlanFromHermes(input: {
  companyId: string;
  prompt: string;
  apiUrl?: string;
}): Promise<string> {
  const model = process.env.BUILD_PLAN_MODEL ?? DEFAULT_PLANNER_MODEL;
  const query =
    `[SYSTEM]\n${PLANNER_SYSTEM_PROMPT}\n[/SYSTEM]\n\n` +
    `[BUILD REQUEST]\n${input.prompt}\n[/BUILD REQUEST]`;

  return await new Promise<string>((resolve, reject) => {
    const proc = spawn(
      "hermes",
      ["chat", "--oneshot", "--quiet", "--query-file", "-", "-m", model],
      {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: "/tmp",
        env: {
          ...process.env,
          ...(input.apiUrl ? { PAPERCLIP_API_URL: input.apiUrl } : {}),
          PAPERCLIP_COMPANY_ID: input.companyId,
        },
      },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;
    let overflowed = false;

    const finish = (error: Error | null, value = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      finish(new Error(`build planner timed out after ${PLAN_TIMEOUT_MS}ms`));
    }, PLAN_TIMEOUT_MS);

    proc.stdout.on("data", (data: Buffer) => {
      if (overflowed) return;
      stdout += data.toString();
      if (stdout.length > PLAN_MAX_OUTPUT_BYTES) {
        overflowed = true;
        proc.kill("SIGTERM");
        finish(new Error("build planner produced more output than expected"));
      }
    });
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on("error", (err) => finish(err));
    proc.on("close", (code) => {
      if (code === 0) return finish(null, stdout);
      finish(
        new Error(
          `build planner exited with code ${code ?? "unknown"}${
            stderr.trim() ? `: ${stderr.trim().slice(0, 500)}` : ""
          }`,
        ),
      );
    });

    proc.stdin.write(query);
    proc.stdin.end();
  });
}

/**
 * Plan a build. The phase chain is fixed, so a planner that is missing, slow, or
 * malformed degrades to the templated chain instead of failing the request; the
 * returned `source` records which of the two produced the titles.
 */
export async function generateBuildPlan(input: {
  companyId: string;
  prompt: string;
  apiUrl?: string;
}): Promise<{ plan: BuildPlanStep[]; source: "hermes" | "template" }> {
  try {
    const raw = await requestPlanFromHermes(input);
    const plan = normalizeBuildPlan(extractPlanJson(raw), input.prompt);
    if (plan) return { plan, source: "hermes" };
    logger.warn(
      { companyId: input.companyId },
      "build planner returned no usable plan; using the fixed step template",
    );
  } catch (error) {
    logger.warn(
      { err: error, companyId: input.companyId },
      "build planner unavailable; using the fixed step template",
    );
  }
  return { plan: templateBuildPlan(input.prompt), source: "template" };
}

/**
 * Staff each phase owner with an eligible agent. Eligibility is resolved the same
 * way `issueService.create` will judge the assignment, so a step is only assigned
 * to an agent the create call would accept — an ineligible assignee would fail the
 * whole chain rather than one step.
 */
export async function resolveBuildAssignees(
  db: Db,
  companyId: string,
): Promise<Map<BuildAgentType, string>> {
  const rows = await agentService(db).list(companyId);
  const eligibilityAgents: AgentEligibilityAgent[] = rows.map((row) => ({
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    status: row.status,
    reportsTo: row.reportsTo ?? null,
  }));
  const eligible = rows.filter(
    (row) =>
      getAgentWorkEligibility({
        agent: {
          id: row.id,
          companyId: row.companyId,
          name: row.name,
          status: row.status,
          reportsTo: row.reportsTo ?? null,
        },
        agents: eligibilityAgents,
      }).assignable,
  );

  const resolved = new Map<BuildAgentType, string>();
  const taken = new Set<string>();
  for (const agentType of BUILD_AGENT_TYPES) {
    for (const role of BUILD_AGENT_TYPE_ROLE_CHAIN[agentType]) {
      // Prefer an agent that has not already been given a phase, so one agent
      // does not silently absorb the whole chain when the company is small.
      const match =
        eligible.find((row) => row.role === role && !taken.has(row.id)) ??
        eligible.find((row) => row.role === role);
      if (match) {
        resolved.set(agentType, match.id);
        taken.add(match.id);
        break;
      }
    }
  }
  return resolved;
}

export async function createBuildPlanIssues(
  deps: BuildOrchestratorDeps,
  input: {
    companyId: string;
    prompt: string;
    plan: BuildPlanStep[];
    actor: BuildActor;
  },
): Promise<{
  buildId: string;
  plan: BuildPlanStepIssue[];
  unassignedAgentTypes: BuildAgentType[];
}> {
  const { db, heartbeat } = deps;
  const issueSvc = issueService(db);
  const subject = buildPromptSubject(input.prompt);
  const assignees = await resolveBuildAssignees(db, input.companyId);

  const actorFields = {
    createdByAgentId: input.actor.agentId,
    createdByUserId: input.actor.actorType === "user" ? input.actor.actorId : null,
    responsibleUserId: input.actor.actorType === "user" ? input.actor.actorId : null,
    trustExplicitResponsibleUserId: input.actor.actorType === "user",
    actorRunId: input.actor.runId,
  };

  const parent = await issueSvc.create(input.companyId, {
    title: `构建: ${subject}`,
    description:
      `DS 式构建计划，共 ${input.plan.length} 个环节，按序推进。\n\n` +
      `原始需求: ${input.prompt}\n\n` +
      input.plan.map((step) => `${step.step + 1}. ${step.title}`).join("\n"),
    status: "todo",
    priority: "medium",
    // `build_plan` + the parent's id is how the steps are found again; the parent
    // itself carries a null originId.
    originKind: "build_plan",
    ...actorFields,
  });
  const buildId = parent.id;

  const created: BuildPlanStepIssue[] = [];
  for (const step of input.plan) {
    const assigneeAgentId = assignees.get(step.assignedAgentType) ?? null;
    const blockerIssueIds = step.dependsOn
      .map((index) => created[index]?.issueId)
      .filter((id): id is string => Boolean(id));

    const issue = await issueSvc.create(input.companyId, {
      title: step.title,
      description:
        `${step.description}\n\n` +
        `构建环节: ${step.kind} (${step.step + 1}/${input.plan.length})\n` +
        `负责类型: ${step.assignedAgentType} / ${BUILD_AGENT_TYPE_LABELS[step.assignedAgentType]}\n` +
        `所属构建: ${buildId}`,
      parentId: buildId,
      // The first step is open; every later step waits on its predecessor and is
      // released by the platform's dependency-resolved wakeup.
      status: blockerIssueIds.length > 0 ? "blocked" : "todo",
      priority: "medium",
      originKind: "build_plan",
      originId: buildId,
      ...(assigneeAgentId ? { assigneeAgentId } : {}),
      ...(blockerIssueIds.length > 0 ? { blockedByIssueIds: blockerIssueIds } : {}),
      ...actorFields,
    });

    created.push({
      ...step,
      issueId: issue.id,
      identifier: issue.identifier ?? null,
      status: issue.status,
      assigneeAgentId: issue.assigneeAgentId ?? null,
    });

    // Only steps with no unresolved blocker are runnable now; the rest are woken
    // by the existing blocker-resolution path when their predecessor closes.
    if (heartbeat && blockerIssueIds.length === 0 && issue.assigneeAgentId) {
      await queueIssueAssignmentWakeup({
        heartbeat,
        issue: {
          id: issue.id,
          assigneeAgentId: issue.assigneeAgentId,
          status: issue.status,
        },
        reason: "build_step_assigned",
        mutation: "build_step_assigned",
        contextSource: "build.plan.created",
        requestedByActorType: input.actor.actorType,
        requestedByActorId: input.actor.actorId,
      });
    }
  }

  return {
    buildId,
    plan: created,
    unassignedAgentTypes: BUILD_AGENT_TYPES.filter((type) => !assignees.has(type)),
  };
}
