import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "@paperclipai/db";
import {
  getAgentWorkEligibility,
  type AgentEligibilityAgent,
  type AgentRole,
} from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";
import { extractJsonObject, requestHermesOneShot } from "./hermes-oneshot.js";
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

/**
 * Coolie fork: CMMI skill directives injected into each build step's description
 * when a project carries a CMMI profile. Maps each build phase to the CMMI skill
 * that governs it and the document it must produce.
 */
export const BUILD_STEP_CMMI_DIRECTIVES: Record<BuildStepKind, {
  skill: string;
  document: string;
  gateId: string;
  directive: string;
}> = {
  requirements: {
    skill: "cmmi-req-spec",
    document: "01-srs.md",
    gateId: "G1",
    directive:
      "使用 EARS 语法提炼需求，产出软件需求规格说明书 (SRS) 和双向需求跟踪矩阵 (RTM)。" +
      "完成后运行 G1 需求风控门禁脚本校验。",
  },
  design: {
    skill: "cmmi-tech-solution",
    document: "02-hld.md",
    gateId: "G2",
    directive:
      "产出系统概要设计 (HLD)，包含架构图 (Mermaid)、数据隔离方案、关键技术决策分析 (DAR)、" +
      "风险登记册 (RSKM)。完成后运行 G2 架构选型门禁脚本校验。",
  },
  impl: {
    skill: "cmmi-detailed-contracts",
    document: "03-lld-api.md",
    gateId: "G3",
    directive:
      "产出详细设计与 API 契约 (LLD)，包含数据库 Schema、REST API 契约、接口连接器规范。" +
      "完成后运行 G3 编译门禁脚本校验，确保 0 编译报错。",
  },
  test: {
    skill: "cmmi-ver-val",
    document: "04-test-report.md",
    gateId: "G4",
    directive:
      "执行端到端业务旅程验证、UI 四态状态机穷举、交互防抖防御和系统集成测试。" +
      "产出测试验收报告，完成后运行 G4 全栈验收门禁脚本校验。",
  },
  release: {
    skill: "cmmi-immutable-release",
    document: "05-deploy-sop.md",
    gateId: "G5",
    directive:
      "产出部署运维 SOP，包含配置基线、部署拓扑、双人复核会签单、秒级回滚 SOP。" +
      "完成后运行 G5 投产门禁脚本校验，验证制品指纹。",
  },
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
  /** How this step's first dispatch was paced. Null when nothing was dispatched,
   * which is the case for every step that is still waiting on its predecessor. */
  pacing: BuildStepPacing | null;
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

/**
 * "建域 xxx" / "建模 xxx" / "domain xxx" — build a *domain*, not an application.
 *
 * A separate family from `BUILD_TRIGGER_PATTERN` because it starts a different
 * chain: an application build ends in shipped code, a domain build ends in a
 * model change that has to be approved before anything is written. Keeping them
 * distinct here lets each route own its own gate rather than branching on the
 * subject halfway through.
 */
export const DOMAIN_TRIGGER_PATTERN = /^(?:建域|建模|domain)\s+/i;

export function detectDomainTrigger(text: string): boolean {
  return DOMAIN_TRIGGER_PATTERN.test(text.trim());
}

/** The domain request with the trigger word stripped: "建域 电商" -> "电商". */
export function domainPromptSubject(prompt: string): string {
  return prompt.trim().replace(DOMAIN_TRIGGER_PATTERN, "").trim();
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
  return extractJsonObject(raw);
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
  return await requestHermesOneShot({
    companyId: input.companyId,
    apiUrl: input.apiUrl,
    systemPrompt: PLANNER_SYSTEM_PROMPT,
    requestLabel: "BUILD REQUEST",
    requestBody: input.prompt,
    model: process.env.BUILD_PLAN_MODEL ?? DEFAULT_PLANNER_MODEL,
    timeoutMs: PLAN_TIMEOUT_MS,
    maxOutputBytes: PLAN_MAX_OUTPUT_BYTES,
    label: "build planner",
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
 * Dispatch pacing.
 *
 * A step is dispatched by waking its assignee, and that wake is what makes an
 * adapter spawn its CLI. Firing those wakes back-to-back is what trips a
 * provider's per-minute rate limit, so each dispatch is gated by a per-worker
 * cool-down: a worker that dispatched too recently parks the step until its next
 * eligible slot instead of failing the build request.
 *
 * The policy lives in `server/src/config/build-orchestrator.json` so the
 * cool-downs can be tuned without a rebuild. The loader re-reads that file on
 * every dispatch and degrades to the built-in defaults when it is missing or
 * malformed. A worker's class comes from its `adapterType`, because that is what
 * decides which CLI is actually spawned.
 *
 * Pacing state is process-local. It is a cool-down between two dispatches, not
 * durability-relevant data, so it is deliberately not a table.
 */

export interface BuildWorkerClassPolicy {
  /** Shown in the log line and in the build-start response. */
  label: string;
  minIntervalSeconds: number;
}

export interface BuildOrchestratorConfig {
  version: number;
  /** `false` disables pacing entirely; every step dispatches immediately. */
  enabled: boolean;
  defaultClass: string;
  classes: Record<string, BuildWorkerClassPolicy>;
  /** `agent.adapterType` -> a key of `classes`. */
  adapterClass: Record<string, string>;
}

/** Mirrors `server/src/config/build-orchestrator.json` for the no-file case. */
export const DEFAULT_BUILD_ORCHESTRATOR_CONFIG: BuildOrchestratorConfig = {
  version: 1,
  enabled: true,
  defaultClass: "cmd",
  classes: {
    cmd: { label: "cmd 型", minIntervalSeconds: 180 },
    claude: { label: "claude 型", minIntervalSeconds: 30 },
  },
  adapterClass: {
    process: "cmd",
    hermes_local: "cmd",
    hermes_gateway: "cmd",
    claude_local: "claude",
  },
};

/** A typo in the config must not park a step for a day. */
const MIN_INTERVAL_CEILING_SECONDS = 3_600;
const CONFIG_FILE_NAME = "build-orchestrator.json";

export interface BuildPacingDecision {
  allowed: boolean;
  workerClass: string;
  classLabel: string;
  minIntervalSeconds: number;
  /** Milliseconds until the next eligible slot; 0 when already allowed. */
  waitMs: number;
  /** Epoch ms of the next eligible slot; null when already allowed. */
  retryAtMs: number | null;
}

/** Cool-down snapshot for one step, surfaced in the build-start response. */
export interface BuildStepPacing {
  state: "dispatched" | "waiting";
  workerClass: string;
  classLabel: string;
  minIntervalSeconds: number;
  /** Remaining cool-down at the instant this snapshot was taken. */
  waitMs: number;
  /** Epoch ms when the parked step becomes eligible; null when dispatched. */
  waitUntilMs: number | null;
}

function isReadableFile(candidate: string): boolean {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/**
 * Where the policy file is, or null when there is no file to read. An explicit
 * `BUILD_ORCHESTRATOR_CONFIG` is honoured on its own: the operator named a file,
 * so silently reading a different one would hide the typo.
 */
export function resolveBuildOrchestratorConfigPath(): string | null {
  const override = process.env.BUILD_ORCHESTRATOR_CONFIG?.trim();
  if (override) return path.resolve(override);

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Dev (tsx runs from src) and a packaged install that ships `config` next to
    // the compiled module.
    path.join(moduleDir, "..", "config", CONFIG_FILE_NAME),
    // A build run out of a checkout: dist/services -> src/config.
    path.join(moduleDir, "..", "..", "src", "config", CONFIG_FILE_NAME),
    path.join(process.cwd(), "server", "src", "config", CONFIG_FILE_NAME),
    path.join(process.cwd(), "src", "config", CONFIG_FILE_NAME),
  ];
  return candidates.find(isReadableFile) ?? null;
}

function normalizeClassPolicy(value: unknown): BuildWorkerClassPolicy | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const seconds = record.minIntervalSeconds;
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return {
    label: typeof record.label === "string" ? record.label.trim() : "",
    minIntervalSeconds: Math.min(Math.round(seconds), MIN_INTERVAL_CEILING_SECONDS),
  };
}

/**
 * A partly-valid file is rejected whole rather than merged with the defaults: a
 * policy that is half the operator's and half the built-in one is harder to
 * reason about than one that is wholly either, and the log line says which.
 */
function normalizeBuildOrchestratorConfig(
  raw: unknown,
  configPath: string,
): BuildOrchestratorConfig {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;

  const classes: Record<string, BuildWorkerClassPolicy> = {};
  const rawClasses = record?.classes;
  if (rawClasses && typeof rawClasses === "object") {
    for (const [name, value] of Object.entries(
      rawClasses as Record<string, unknown>,
    )) {
      const policy = normalizeClassPolicy(value);
      if (policy) classes[name] = policy;
    }
  }

  const defaultClass =
    typeof record?.defaultClass === "string" ? record.defaultClass : "";
  if (!classes[defaultClass]) {
    logger.warn(
      { configPath, defaultClass },
      "build orchestrator config has no usable `classes`/`defaultClass`; using the built-in pacing defaults",
    );
    return DEFAULT_BUILD_ORCHESTRATOR_CONFIG;
  }

  const adapterClass: Record<string, string> = {};
  const rawAdapterClass = record?.adapterClass;
  if (rawAdapterClass && typeof rawAdapterClass === "object") {
    for (const [adapterType, className] of Object.entries(
      rawAdapterClass as Record<string, unknown>,
    )) {
      if (typeof className === "string" && classes[className]) {
        adapterClass[adapterType] = className;
      }
    }
  }

  return {
    version: typeof record?.version === "number" ? record.version : 1,
    enabled: record?.enabled !== false,
    defaultClass,
    classes,
    adapterClass,
  };
}

let configCache: {
  configPath: string;
  raw: string;
  config: BuildOrchestratorConfig;
} | null = null;

/**
 * The active policy. Reading the file on every dispatch is what lets the boss
 * retune a cool-down without restarting the server; the raw text is the cache
 * key, so an unchanged file is parsed once.
 */
export function loadBuildOrchestratorConfig(): BuildOrchestratorConfig {
  const configPath = resolveBuildOrchestratorConfigPath();
  if (!configPath) return DEFAULT_BUILD_ORCHESTRATOR_CONFIG;

  try {
    const raw = readFileSync(configPath, "utf8");
    if (configCache?.configPath === configPath && configCache.raw === raw) {
      return configCache.config;
    }
    const config = normalizeBuildOrchestratorConfig(JSON.parse(raw), configPath);
    configCache = { configPath, raw, config };
    return config;
  } catch (error) {
    logger.warn(
      { err: error, configPath },
      "build orchestrator config is unreadable; using the built-in pacing defaults",
    );
    return DEFAULT_BUILD_ORCHESTRATOR_CONFIG;
  }
}

/**
 * The class and cool-down for one worker. Normalization guarantees every
 * `adapterClass` value and `defaultClass` names an existing class, so the lookup
 * below cannot miss.
 */
export function resolveWorkerPolicy(
  config: BuildOrchestratorConfig,
  adapterType: string | null | undefined,
): { workerClass: string; policy: BuildWorkerClassPolicy } {
  const workerClass =
    (adapterType ? config.adapterClass[adapterType] : undefined) ??
    config.defaultClass;
  return { workerClass, policy: config.classes[workerClass]! };
}

/** Last dispatch per worker, keyed by agent id. */
const workerLastDispatchAtMs = new Map<string, number>();

export function decideBuildDispatchPacing(input: {
  agentId: string;
  adapterType: string | null | undefined;
  nowMs: number;
  config?: BuildOrchestratorConfig;
}): BuildPacingDecision {
  const config = input.config ?? loadBuildOrchestratorConfig();
  const { workerClass, policy } = resolveWorkerPolicy(config, input.adapterType);
  const base = {
    workerClass,
    classLabel: policy.label,
    minIntervalSeconds: policy.minIntervalSeconds,
  };

  const intervalMs = policy.minIntervalSeconds * 1000;
  const lastDispatchAtMs = workerLastDispatchAtMs.get(input.agentId);
  if (!config.enabled || intervalMs <= 0 || lastDispatchAtMs === undefined) {
    return { ...base, allowed: true, waitMs: 0, retryAtMs: null };
  }

  const retryAtMs = lastDispatchAtMs + intervalMs;
  const waitMs = retryAtMs - input.nowMs;
  if (waitMs <= 0) {
    return { ...base, allowed: true, waitMs: 0, retryAtMs: null };
  }
  return { ...base, allowed: false, waitMs, retryAtMs };
}

interface ParkedBuildStep {
  deps: BuildOrchestratorDeps;
  heartbeat: IssueAssignmentWakeupDeps;
  buildId: string;
  kind: BuildStepKind;
  actor: BuildActor;
  issue: { id: string; assigneeAgentId: string; status: string };
  adapterType: string | null;
  retryAtMs: number;
  parkedAtMs: number;
}

const parkedBuildSteps = new Map<string, ParkedBuildStep>();
const parkedBuildStepTimers = new Map<string, NodeJS.Timeout>();

function clearParkedTimer(issueId: string): void {
  const timer = parkedBuildStepTimers.get(issueId);
  if (!timer) return;
  clearTimeout(timer);
  parkedBuildStepTimers.delete(issueId);
}

function scheduleParkedRelease(issueId: string, delayMs: number): void {
  clearParkedTimer(issueId);
  const timer = setTimeout(() => {
    void releaseParkedBuildStep(issueId);
  }, Math.max(0, delayMs));
  // A parked step must never hold the process open.
  timer.unref();
  parkedBuildStepTimers.set(issueId, timer);
}

/**
 * Wake the assignee of a step that was parked on its worker's rate limit.
 * Nothing here assumes the cool-down elapsed cleanly: an earlier parked step for
 * the same worker may have taken the slot, and the step itself may have closed
 * or been reassigned while it waited.
 */
async function releaseParkedBuildStep(issueId: string): Promise<void> {
  parkedBuildStepTimers.delete(issueId);
  const parked = parkedBuildSteps.get(issueId);
  if (!parked) return;

  const nowMs = Date.now();
  const decision = decideBuildDispatchPacing({
    agentId: parked.issue.assigneeAgentId,
    adapterType: parked.adapterType,
    nowMs,
  });
  if (!decision.allowed) {
    parked.retryAtMs = decision.retryAtMs ?? nowMs + 1_000;
    scheduleParkedRelease(issueId, parked.retryAtMs - nowMs);
    return;
  }

  parkedBuildSteps.delete(issueId);

  let current: { status: string; assigneeAgentId: string | null };
  try {
    const row = await issueService(parked.deps.db).getById(issueId);
    if (!row) {
      logger.warn(
        { issueId, buildId: parked.buildId },
        "parked build step no longer exists; dropping the wake",
      );
      return;
    }
    current = { status: row.status, assigneeAgentId: row.assigneeAgentId ?? null };
  } catch (error) {
    logger.warn(
      { err: error, issueId },
      "could not re-read a parked build step; dispatching on the parked snapshot",
    );
    current = {
      status: parked.issue.status,
      assigneeAgentId: parked.issue.assigneeAgentId,
    };
  }

  if (current.status === "done" || current.status === "cancelled") {
    logger.info(
      { issueId, status: current.status },
      "parked build step closed while cooling down; dropping the wake",
    );
    return;
  }
  if (!current.assigneeAgentId) {
    logger.info(
      { issueId },
      "parked build step lost its assignee while cooling down; dropping the wake",
    );
    return;
  }

  workerLastDispatchAtMs.set(current.assigneeAgentId, nowMs);
  await queueIssueAssignmentWakeup({
    heartbeat: parked.heartbeat,
    issue: {
      id: issueId,
      assigneeAgentId: current.assigneeAgentId,
      status: current.status,
    },
    reason: "build_step_rate_limit_released",
    mutation: "build_step_assigned",
    contextSource: "build.plan.rate_limit_released",
    requestedByActorType: parked.actor.actorType,
    requestedByActorId: parked.actor.actorId,
  });
  logger.info(
    {
      issueId,
      buildId: parked.buildId,
      kind: parked.kind,
      agentId: current.assigneeAgentId,
      workerClass: decision.workerClass,
      waitedMs: nowMs - parked.parkedAtMs,
    },
    "released a parked build step on the worker's next eligible slot",
  );
}

/**
 * Dispatch one runnable step, or park it when its worker is still cooling down.
 * The caller gets a snapshot either way, so the board shows a wait instead of a
 * step that looks stuck.
 *
 * Exported because a domain build's chain (see `ontology-spec-decomposition.ts`)
 * has the same problem this solves: it creates more issues at once than a
 * provider's rate limit tolerates, so it must dispatch through the same pacing
 * rather than wake them directly.
 */
export async function dispatchBuildStep(input: {
  deps: BuildOrchestratorDeps;
  heartbeat: IssueAssignmentWakeupDeps;
  buildId: string;
  kind: BuildStepKind;
  actor: BuildActor;
  issue: { id: string; assigneeAgentId: string; status: string };
  adapterType: string | null;
}): Promise<BuildStepPacing> {
  const { heartbeat, issue } = input;
  const nowMs = Date.now();
  const decision = decideBuildDispatchPacing({
    agentId: issue.assigneeAgentId,
    adapterType: input.adapterType,
    nowMs,
  });

  if (!decision.allowed) {
    const retryAtMs = decision.retryAtMs ?? nowMs;
    parkedBuildSteps.set(issue.id, {
      deps: input.deps,
      heartbeat,
      buildId: input.buildId,
      kind: input.kind,
      actor: input.actor,
      issue,
      adapterType: input.adapterType,
      retryAtMs,
      parkedAtMs: nowMs,
    });
    scheduleParkedRelease(issue.id, retryAtMs - nowMs);
    logger.info(
      {
        issueId: issue.id,
        buildId: input.buildId,
        agentId: issue.assigneeAgentId,
        workerClass: decision.workerClass,
        waitMs: decision.waitMs,
      },
      "build step parked until its worker's next eligible dispatch slot",
    );
    return {
      state: "waiting",
      workerClass: decision.workerClass,
      classLabel: decision.classLabel,
      minIntervalSeconds: decision.minIntervalSeconds,
      waitMs: decision.waitMs,
      waitUntilMs: retryAtMs,
    };
  }

  workerLastDispatchAtMs.set(issue.assigneeAgentId, nowMs);
  await queueIssueAssignmentWakeup({
    heartbeat,
    issue,
    reason: "build_step_assigned",
    mutation: "build_step_assigned",
    contextSource: "build.plan.created",
    requestedByActorType: input.actor.actorType,
    requestedByActorId: input.actor.actorId,
  });
  return {
    state: "dispatched",
    workerClass: decision.workerClass,
    classLabel: decision.classLabel,
    minIntervalSeconds: decision.minIntervalSeconds,
    waitMs: 0,
    waitUntilMs: null,
  };
}

export interface BuildStaffing {
  byAgentType: Map<BuildAgentType, string>;
  /** `agentId` -> `adapterType`, which is what the pacing rules classify on. */
  adapterTypeByAgentId: Map<string, string>;
}

/**
 * Staff each phase owner with an eligible agent. Eligibility is resolved the same
 * way `issueService.create` will judge the assignment, so a step is only assigned
 * to an agent the create call would accept — an ineligible assignee would fail the
 * whole chain rather than one step. Each assignee's adapter type comes back with
 * it, because that is what the pacing rules classify the worker by.
 */
export async function resolveBuildStaffing(
  db: Db,
  companyId: string,
): Promise<BuildStaffing> {
  const rows = await agentService(db).list(companyId);
  const adapterTypeByAgentId = new Map(
    rows.map((row) => [row.id, row.adapterType] as const),
  );
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

  const byAgentType = new Map<BuildAgentType, string>();
  const taken = new Set<string>();
  for (const agentType of BUILD_AGENT_TYPES) {
    for (const role of BUILD_AGENT_TYPE_ROLE_CHAIN[agentType]) {
      // Prefer an agent that has not already been given a phase, so one agent
      // does not silently absorb the whole chain when the company is small.
      const match =
        eligible.find((row) => row.role === role && !taken.has(row.id)) ??
        eligible.find((row) => row.role === role);
      if (match) {
        byAgentType.set(agentType, match.id);
        taken.add(match.id);
        break;
      }
    }
  }
  return { byAgentType, adapterTypeByAgentId };
}

export async function createBuildPlanIssues(
  deps: BuildOrchestratorDeps,
  input: {
    companyId: string;
    prompt: string;
    plan: BuildPlanStep[];
    actor: BuildActor;
    /** Coolie fork: bind all build-plan issues to this project when set. */
    projectId?: string;
  },
): Promise<{
  buildId: string;
  plan: BuildPlanStepIssue[];
  unassignedAgentTypes: BuildAgentType[];
}> {
  const { db, heartbeat } = deps;
  const issueSvc = issueService(db);
  const subject = buildPromptSubject(input.prompt);
  const staffing = await resolveBuildStaffing(db, input.companyId);

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
    ...(input.projectId ? { projectId: input.projectId } : {}),
  });
  const buildId = parent.id;

  const created: BuildPlanStepIssue[] = [];
  for (const step of input.plan) {
    const assigneeAgentId = staffing.byAgentType.get(step.assignedAgentType) ?? null;
    const blockerIssueIds = step.dependsOn
      .map((index) => created[index]?.issueId)
      .filter((id): id is string => Boolean(id));

    const issue = await issueSvc.create(input.companyId, {
      title: step.title,
      description:
        `${step.description}\n\n` +
        `构建环节: ${step.kind} (${step.step + 1}/${input.plan.length})\n` +
        `负责类型: ${step.assignedAgentType} / ${BUILD_AGENT_TYPE_LABELS[step.assignedAgentType]}\n` +
        `所属构建: ${buildId}` +
        // Coolie fork: inject CMMI skill directive so the assigned agent
        // knows which CMMI document to produce and which gate to pass.
        (input.projectId
          ? `\n\n---\n**CMMI 交付指令** (${BUILD_STEP_CMMI_DIRECTIVES[step.kind].gateId})\n` +
            `技能: ${BUILD_STEP_CMMI_DIRECTIVES[step.kind].skill}\n` +
            `产出文档: ${BUILD_STEP_CMMI_DIRECTIVES[step.kind].document}\n` +
            `${BUILD_STEP_CMMI_DIRECTIVES[step.kind].directive}`
          : ""),
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
      ...(input.projectId ? { projectId: input.projectId } : {}),
    });

    // Only steps with no unresolved blocker are runnable now; the rest are woken
    // by the existing blocker-resolution path when their predecessor closes. A
    // runnable step still has to clear its worker's cool-down, and parks when it
    // does not.
    const pacing =
      heartbeat && blockerIssueIds.length === 0 && issue.assigneeAgentId
        ? await dispatchBuildStep({
            deps,
            heartbeat,
            buildId,
            kind: step.kind,
            actor: input.actor,
            issue: {
              id: issue.id,
              assigneeAgentId: issue.assigneeAgentId,
              status: issue.status,
            },
            adapterType:
              staffing.adapterTypeByAgentId.get(issue.assigneeAgentId) ?? null,
          })
        : null;

    created.push({
      ...step,
      issueId: issue.id,
      identifier: issue.identifier ?? null,
      status: issue.status,
      assigneeAgentId: issue.assigneeAgentId ?? null,
      pacing,
    });
  }

  return {
    buildId,
    plan: created,
    unassignedAgentTypes: BUILD_AGENT_TYPES.filter(
      (type) => !staffing.byAgentType.has(type),
    ),
  };
}
