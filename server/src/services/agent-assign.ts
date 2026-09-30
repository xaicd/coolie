import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import type { AgentRole } from "@paperclipai/shared";

/**
 * wave222 — 本体 5 角色 × CMMI 工作完整映射 + 派活算法.
 *
 * Why this exists:
 * - wave140 把 CMMI WBS 拆成 6 阶段, 但 25 任务的派发散落各处.
 * - wave142 路由算法按 specialty metadata 匹配, 不按 5 角色优先.
 * - 老板原话: "本体 5 角色, 得把 cmmi 中所有工作分配清晰了".
 *
 * What this module owns:
 * 1. `ROLE_MAPPING` — 5 阶段 × 25 任务的纯数据映射 (5 角色优先).
 * 2. `pickRoleForCmmiTask` — 给 (阶段, 任务) 返回 5 角色 (主/副).
 * 3. `resolveCandidateAgents` — 在公司里按角色 + 可选 specialtyHint 找具体数字员工.
 *
 * What this module does NOT own:
 * - 不改 schema (5 阶段 25 任务元数据全部落在常量里).
 * - 不增 5 角色 (AGENT_ROLES enum 保持 5 个).
 * - 不替 wave142 路由脚本 (那是历史数据迁移, 本服务是上层算法).
 * - 不替 assertAssignableAgent (那个是 assignment 前的硬校验, 见 agent-assignability.ts).
 *
 * 文档: docs-coolie/ROLE-MAPPING.md (§1 映射表 / §4 算法).
 */

export const CMMI_PHASES = [
  "phase_1_initiation",
  "phase_2_planning",
  "phase_3_design",
  "phase_4_development",
  "phase_5_deployment",
] as const;
export type CmmiPhase = (typeof CMMI_PHASES)[number];

export const CMMI_TASKS = [
  // Phase 1 立项
  "p1_business_goal",
  "p1_tech_constraint",
  "p1_license_compliance",
  "p1_dar_selection",
  "p1_g0_selection_gate",
  // Phase 2 规划
  "p2_port_strategy",
  "p2_wbs_breakdown",
  "p2_spec_write",
  "p2_effort_estimate",
  "p2_risk_assess",
  // Phase 3 设计
  "p3_system_design",
  "p3_api_contract",
  "p3_db_schema",
  "p3_security_design",
  "p3_deploy_arch",
  // Phase 4 开发
  "p4_coding",
  "p4_unit_test",
  "p4_code_review",
  "p4_integration_test",
  "p4_perf_opt",
  // Phase 5 部署
  "p5_deploy_exec",
  "p5_monitor_alert",
  "p5_acceptance_test",
  "p5_release_notes",
  "p5_retrospective",
] as const;
export type CmmiTask = (typeof CMMI_TASKS)[number];

export interface CmmiTaskRoleBinding {
  phase: CmmiPhase;
  task: CmmiTask;
  /** 中文任务名 — 仅供日志/UI 显示, 不参与路由. */
  taskTitle: string;
  /** 主角色 — 必填, 5 角色之一. */
  primary: AgentRole;
  /** 副角色 — 可空; 空字符串代表"无副". */
  secondary: AgentRole | "";
}

export const ROLE_MAPPING: ReadonlyArray<CmmiTaskRoleBinding> = [
  // Phase 1: 立项
  { phase: "phase_1_initiation", task: "p1_business_goal", taskTitle: "1.1 业务目标", primary: "fda", secondary: "" },
  { phase: "phase_1_initiation", task: "p1_tech_constraint", taskTitle: "1.2 技术约束", primary: "fda", secondary: "core-swe" },
  { phase: "phase_1_initiation", task: "p1_license_compliance", taskTitle: "1.3 License 合规", primary: "ds", secondary: "fda" },
  { phase: "phase_1_initiation", task: "p1_dar_selection", taskTitle: "1.4 选型研判 (DAR)", primary: "fda", secondary: "ds" },
  { phase: "phase_1_initiation", task: "p1_g0_selection_gate", taskTitle: "1.5 G0 选型门禁", primary: "core-swe", secondary: "fda" },
  // Phase 2: 规划
  { phase: "phase_2_planning", task: "p2_port_strategy", taskTitle: "2.1 端口策略矩阵", primary: "pre-sre", secondary: "core-swe" },
  { phase: "phase_2_planning", task: "p2_wbs_breakdown", taskTitle: "2.2 WBS 拆解", primary: "core-swe", secondary: "fda" },
  { phase: "phase_2_planning", task: "p2_spec_write", taskTitle: "2.3 Spec 编写", primary: "core-swe", secondary: "" },
  { phase: "phase_2_planning", task: "p2_effort_estimate", taskTitle: "2.4 工时估算", primary: "fdse", secondary: "core-swe" },
  { phase: "phase_2_planning", task: "p2_risk_assess", taskTitle: "2.5 风险评估", primary: "fda", secondary: "pre-sre" },
  // Phase 3: 设计
  { phase: "phase_3_design", task: "p3_system_design", taskTitle: "3.1 系统设计", primary: "core-swe", secondary: "fda" },
  { phase: "phase_3_design", task: "p3_api_contract", taskTitle: "3.2 API 契约", primary: "core-swe", secondary: "" },
  { phase: "phase_3_design", task: "p3_db_schema", taskTitle: "3.3 DB Schema", primary: "core-swe", secondary: "ds" },
  { phase: "phase_3_design", task: "p3_security_design", taskTitle: "3.4 安全设计", primary: "pre-sre", secondary: "core-swe" },
  { phase: "phase_3_design", task: "p3_deploy_arch", taskTitle: "3.5 部署架构", primary: "pre-sre", secondary: "core-swe" },
  // Phase 4: 开发
  { phase: "phase_4_development", task: "p4_coding", taskTitle: "4.1 编码", primary: "core-swe", secondary: "fdse" },
  { phase: "phase_4_development", task: "p4_unit_test", taskTitle: "4.2 单元测试", primary: "core-swe", secondary: "" },
  { phase: "phase_4_development", task: "p4_code_review", taskTitle: "4.3 代码审查", primary: "fdse", secondary: "core-swe" },
  { phase: "phase_4_development", task: "p4_integration_test", taskTitle: "4.4 集成测试", primary: "core-swe", secondary: "fdse" },
  { phase: "phase_4_development", task: "p4_perf_opt", taskTitle: "4.5 性能优化", primary: "pre-sre", secondary: "core-swe" },
  // Phase 5: 部署
  { phase: "phase_5_deployment", task: "p5_deploy_exec", taskTitle: "5.1 部署执行", primary: "pre-sre", secondary: "" },
  { phase: "phase_5_deployment", task: "p5_monitor_alert", taskTitle: "5.2 监控告警", primary: "pre-sre", secondary: "ds" },
  { phase: "phase_5_deployment", task: "p5_acceptance_test", taskTitle: "5.3 验收测试", primary: "core-swe", secondary: "fdse" },
  { phase: "phase_5_deployment", task: "p5_release_notes", taskTitle: "5.4 发布说明", primary: "core-swe", secondary: "fda" },
  { phase: "phase_5_deployment", task: "p5_retrospective", taskTitle: "5.5 复盘", primary: "fda", secondary: "ds" },
];

/** Index by `phase + task` for O(1) lookup. */
const ROLE_MAPPING_BY_KEY = new Map<string, CmmiTaskRoleBinding>(
  ROLE_MAPPING.map((b) => [`${b.phase}:${b.task}`, b]),
);

/** Tasks of a given phase (preserve phase order). */
export function tasksOfPhase(phase: CmmiPhase): CmmiTaskRoleBinding[] {
  return ROLE_MAPPING.filter((b) => b.phase === phase);
}

export interface RolePick {
  phase: CmmiPhase;
  task: CmmiTask;
  taskTitle: string;
  primary: AgentRole;
  secondary: AgentRole | null;
}

/**
 * Look up the role binding for (phase, task). Returns null if the pair is unknown.
 * Used by:
 *   - wbs-adopt route (sets assigneeAgentId at create time).
 *   - /api/agents/route-dry-run (preview before commit).
 *   - `scripts/wave222/route-demo.mjs` demo script.
 */
export function pickRoleForCmmiTask(phase: CmmiPhase, task: CmmiTask): RolePick | null {
  const binding = ROLE_MAPPING_BY_KEY.get(`${phase}:${task}`);
  if (!binding) return null;
  return {
    phase: binding.phase,
    task: binding.task,
    taskTitle: binding.taskTitle,
    primary: binding.primary,
    secondary: binding.secondary === "" ? null : binding.secondary,
  };
}

/** The 5 Coolie fork roles (subset of `AGENT_ROLES` appended at fork time). */
export const COOLIE_ROLES: readonly AgentRole[] = [
  "fda",
  "core-swe",
  "pre-sre",
  "fdse",
  "ds",
] as const;

/** Defensive: assert a role id is one of the 5 Coolie fork roles (not the upstream Paperclip ones like ceo/cto/...). */
export function isCoolieRole(role: string): role is AgentRole {
  return (COOLIE_ROLES as readonly string[]).includes(role);
}

export interface ResolveAgentsOptions {
  companyId: string;
  role: AgentRole;
  /** Bucket-narrowing label (e.g. "ops-mobile", "qa-lead"). Stored on
   *  `agents.metadata.opsSpecialty` (or `metadata.specialty`); falls back to
   *  any active agent of `role` when nothing matches. */
  specialtyHint?: string | null;
  /** When true, also return secondary-role candidates (if provided). */
  includeSecondary?: AgentRole | null;
  /** Maximum candidates returned per role (default 5). */
  limit?: number;
}

export interface ResolvedAgent {
  id: string;
  name: string;
  role: string;
  status: string;
  specialty: string | null;
}

export interface RoleResolution {
  primary: AgentRole;
  primaryCandidates: ResolvedAgent[];
  secondary: AgentRole | null;
  secondaryCandidates: ResolvedAgent[];
}

/**
 * Resolve concrete 数字员工 ids within a company, given a 5-role bucket and an
 * optional specialty hint. This is the secondary-match step described in
 * docs-coolie/ROLE-MAPPING.md §4.2 (5 角色优先 → specialty 二次匹配).
 *
 * Lookup rules:
 *   1. role 必须在 5 角色之一 (否则返回空数组, 不抛).
 *   2. specialtyHint 命中 → 找 metadata.opsSpecialty 或 metadata.specialty === hint 的 active 员工.
 *   3. 无 hint 或未命中 → 找 role === role 且 status === "active" 的任意员工 (默认 `*-agent`).
 *   4. 仍无结果 → 兜底 status === "idle" 的同 role 员工.
 *
 * 不硬编码 specialty 字符串 — 算法只读取 `agents.metadata` 的现有字段.
 */
export async function resolveCandidateAgents(
  db: Db,
  options: ResolveAgentsOptions,
): Promise<RoleResolution> {
  const limit = options.limit ?? 5;

  const primaryCandidates = await pickAgentsInRole(db, {
    companyId: options.companyId,
    role: options.role,
    specialtyHint: options.specialtyHint ?? null,
    limit,
  });

  let secondaryCandidates: ResolvedAgent[] = [];
  let secondaryRole: AgentRole | null = null;
  if (options.includeSecondary) {
    secondaryRole = options.includeSecondary;
    // Secondary never carries a specialtyHint — always bucket-fallback.
    secondaryCandidates = await pickAgentsInRole(db, {
      companyId: options.companyId,
      role: options.includeSecondary,
      specialtyHint: null,
      limit,
    });
  }

  return {
    primary: options.role,
    primaryCandidates,
    secondary: secondaryRole,
    secondaryCandidates,
  };
}

interface PickAgentsArgs {
  companyId: string;
  role: AgentRole;
  specialtyHint: string | null;
  limit: number;
}

async function pickAgentsInRole(db: Db, args: PickAgentsArgs): Promise<ResolvedAgent[]> {
  const baseWhere = and(eq(agents.companyId, args.companyId), eq(agents.role, args.role));

  // Step 1: try active agents (status="active") matching role + optional specialty.
  let rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      role: agents.role,
      status: agents.status,
      metadata: agents.metadata,
    })
    .from(agents)
    .where(baseWhere)
    .limit(200);

  rows = rows.filter((r) => r.status === "active" || r.status === "idle");

  if (args.specialtyHint) {
    const narrowed = rows.filter((r) => specialtyOf(r.metadata) === args.specialtyHint);
    if (narrowed.length > 0) {
      return narrowed.slice(0, args.limit).map(toResolvedAgent);
    }
    // No match — fall through to bucket-fallback so the algorithm stays total.
  }

  // Step 2: bucket-fallback — prefer "active", then "idle".
  const active = rows.filter((r) => r.status === "active").slice(0, args.limit);
  if (active.length > 0) return active.map(toResolvedAgent);
  const idle = rows.filter((r) => r.status === "idle").slice(0, args.limit);
  return idle.map(toResolvedAgent);
}

function toResolvedAgent(row: {
  id: string;
  name: string;
  role: string;
  status: string;
  metadata: Record<string, unknown> | null;
}): ResolvedAgent {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    status: row.status,
    specialty: specialtyOf(row.metadata),
  };
}

function specialtyOf(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const v = metadata.opsSpecialty ?? metadata.specialty;
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Convenience: resolve a full role→candidate picture for a CMMI task in one call.
 * Use this when the caller doesn't want to assemble (pickRoleForCmmiTask + resolveCandidateAgents).
 */
export async function resolveAssignmentForCmmiTask(
  db: Db,
  args: {
    companyId: string;
    phase: CmmiPhase;
    task: CmmiTask;
    primarySpecialtyHint?: string | null;
    secondarySpecialtyHint?: string | null;
    limit?: number;
  },
): Promise<{ pick: RolePick; resolution: RoleResolution } | null> {
  const pick = pickRoleForCmmiTask(args.phase, args.task);
  if (!pick) return null;

  const resolution = await resolveCandidateAgents(db, {
    companyId: args.companyId,
    role: pick.primary,
    specialtyHint: args.primarySpecialtyHint ?? null,
    includeSecondary: pick.secondary,
    limit: args.limit ?? 5,
  });

  // If a secondary hint was supplied, narrow secondary in a second pass.
  if (pick.secondary && args.secondarySpecialtyHint) {
    const narrowed = resolution.secondaryCandidates.filter(
      (c) => c.specialty === args.secondarySpecialtyHint,
    );
    if (narrowed.length > 0) {
      resolution.secondaryCandidates = narrowed;
    }
  }

  return { pick, resolution };
}

/**
 * Helper for routes that just want the primary assignee id without ceremony.
 * Returns the first candidate's id (or null if the bucket is empty).
 */
export async function pickPrimaryAgentId(
  db: Db,
  args: {
    companyId: string;
    phase: CmmiPhase;
    task: CmmiTask;
    primarySpecialtyHint?: string | null;
  },
): Promise<{ id: string | null; pick: RolePick | null; resolution: RoleResolution | null }> {
  const result = await resolveAssignmentForCmmiTask(db, args);
  if (!result) return { id: null, pick: null, resolution: null };
  const first = result.resolution.primaryCandidates[0];
  return { id: first?.id ?? null, pick: result.pick, resolution: result.resolution };
}

/** Aggregate counts for ops-daily-report / dashboards. */
export function summarizeRoleMapping(): Array<{ role: AgentRole; primary: number; secondary: number }> {
  const counts = new Map<AgentRole, { primary: number; secondary: number }>();
  for (const role of COOLIE_ROLES) counts.set(role, { primary: 0, secondary: 0 });
  for (const b of ROLE_MAPPING) {
    const a = counts.get(b.primary);
    if (a) a.primary += 1;
    if (b.secondary) {
      const s = counts.get(b.secondary as AgentRole);
      if (s) s.secondary += 1;
    }
  }
  return COOLIE_ROLES.map((role) => ({ role, ...(counts.get(role) ?? { primary: 0, secondary: 0 }) }));
}

/** Sanity guard: list every (phase,task) pair so callers can iterate without touching ROLE_MAPPING. */
export function listAllCmmiTasks(): ReadonlyArray<CmmiTaskRoleBinding> {
  return ROLE_MAPPING;
}

/** Re-export `inArray` so callers (e.g. batch bulk-routes) don't need to import drizzle directly. */
export { inArray };