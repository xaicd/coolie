import type { AgentRole } from "@paperclipai/shared";

/**
 * @paperclipai/agents — Coolie fork's employee templates.
 *
 * One file per Palantir Foundry role under `role-templates/`, each exporting a
 * `ROLE_TEMPLATE`. The templates are pure data with no server dependency, so the
 * CLI (`scripts/new-company.sh`), the register-agents API and any future UI all
 * read one description of "who this employee is" instead of three drifting ones.
 *
 * The person-level facts (workspace, CLI, model, skill) are the same facts
 * `templates/workspace-skel/models.yaml` preinstalls on disk; the maps here are
 * the server-side mirror of them, kept next to the duties each role owns.
 */

/** The five Palantir Foundry ontology roles. */
export const PALANTIR_ROLES = ["fda", "core-swe", "pre-sre", "fdse", "ds"] as const;
export type PalantirRole = (typeof PALANTIR_ROLES)[number];

/**
 * Compile-time proof that every Palantir role is a legal `AgentRole`.
 *
 * The union satisfies this only while `AGENT_ROLES` in @paperclipai/shared still
 * contains all five. If a role is ever dropped from the shared enum, this line
 * stops compiling rather than letting an invalid role reach the agents table.
 */
export type PalantirRolesAreAgentRoles =
  Extract<PalantirRole, AgentRole> extends PalantirRole ? true : never;

/**
 * One employee template: the identity the register-agents API materialises onto
 * an `agents` row, plus the role's duties and gates for prompts and hand-offs.
 */
export interface AgentRoleTemplate {
  /** The agent role, matching an `AgentRole` value. */
  role: PalantirRole;
  /** Agent name to register, `<role>-agent` (stable, so tooling can find it). */
  agentName: string;
  /** Human-readable role title, e.g. "FDA — 前线架构师". */
  title: string;
  /** Short label from AGENT_ROLE_LABELS. */
  label: string;
  /** Which CLI(s) the employee can run (mirrors workspace-skel/cli/<role>.sh). */
  cli: string | string[];
  /** Model(s) the employee can run on. */
  model: string | string[];
  /** Which of `cli` the employee prefers when several are installed. */
  defaultProvider?: string;
  /** Providers this employee can be dispatched to (adapter capability set). */
  providerCapabilities?: string[];
  /** Backup CLI/model when the primary is unavailable. */
  backup: { cli: string; model: string };
  /** The role skill preloaded into the employee's workspace. */
  skillRef: string;
  /** One-line duty (SKILL.md「一句话职责」). */
  summary: string;
  /** Gates this role owns; a hand-off is blocked while one is red. */
  gates: string[];
  /** Numbered duties (SKILL.md「一、职责」). */
  responsibilities: string[];
  /** Required deliverables (SKILL.md「四、必交付物」). */
  deliverables: string[];
  /** Anti-patterns that block a hand-off (SKILL.md「五、反例」). */
  antiPatterns: string[];
  /** Free-form capabilities string stored on the agent row. */
  capabilities: string;
}
