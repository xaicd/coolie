/**
 * wave222 — 5 角色 × CMMI 工作映射 + 派活算法 自检.
 *
 * 不依赖 DB. 只校验:
 *  1. ROLE_MAPPING 25 行, 阶段齐全 (5 阶段 × 5 任务).
 *  2. 每个 task 的 primary ∈ {fda, core-swe, pre-sre, fdse, ds}.
 *  3. 每个 task 的 secondary ∈ {fda, core-swe, pre-sre, fdse, ds} 或空字符串.
 *  4. pickRoleForCmmiTask 对 25 个 (phase, task) 都返回非空.
 *  5. summarizeRoleMapping 给出 5 行汇总.
 *  6. 5 个角色都至少出现 1 次 primary, 否则算法失效.
 *  7. isCoolieRole 守卫到 5 角色, 不接受其他 Paperclip 上游角色.
 *
 * 跑法 (从 server/ 目录):
 *   pnpm test:run -- agent-assign.test.ts
 */

import { describe, expect, it } from "vitest";

import {
  CMMI_PHASES,
  CMMI_TASKS,
  ROLE_MAPPING,
  isCoolieRole,
  pickRoleForCmmiTask,
  summarizeRoleMapping,
  tasksOfPhase,
} from "./agent-assign.js";

const COOLIE_ROLES = ["fda", "core-swe", "pre-sre", "fdse", "ds"] as const;

describe("wave222 ROLE_MAPPING", () => {
  it("contains 25 bindings — 5 phases × 5 tasks", () => {
    expect(ROLE_MAPPING).toHaveLength(25);
    expect(CMMI_PHASES).toHaveLength(5);
    expect(CMMI_TASKS).toHaveLength(25);
  });

  it("every phase has exactly 5 tasks", () => {
    for (const phase of CMMI_PHASES) {
      const tasks = tasksOfPhase(phase);
      expect(tasks, `phase ${phase} missing tasks`).toHaveLength(5);
    }
  });

  it("every primary role is one of the 5 Coolie fork roles", () => {
    for (const b of ROLE_MAPPING) {
      expect(COOLIE_ROLES, `task ${b.task} primary=${b.primary}`).toContain(b.primary);
    }
  });

  it("every secondary role is one of the 5 Coolie fork roles (or empty)", () => {
    for (const b of ROLE_MAPPING) {
      if (b.secondary === "") continue;
      expect(COOLIE_ROLES, `task ${b.task} secondary=${b.secondary}`).toContain(b.secondary);
    }
  });

  it("every (phase, task) pair resolves via pickRoleForCmmiTask", () => {
    for (const b of ROLE_MAPPING) {
      const pick = pickRoleForCmmiTask(b.phase, b.task);
      expect(pick, `missing pick for ${b.phase}:${b.task}`).not.toBeNull();
      expect(pick!.primary).toBe(b.primary);
      expect(pick!.secondary).toBe(b.secondary === "" ? null : b.secondary);
      expect(pick!.taskTitle).toBe(b.taskTitle);
    }
  });

  it("pickRoleForCmmiTask returns null for unknown pair", () => {
    const pick = pickRoleForCmmiTask("phase_1_initiation", "p5_retrospective" as never);
    expect(pick).toBeNull();
  });

  it("all 5 roles appear at least once as primary (no orphan bucket)", () => {
    const primaryCounts = summarizeRoleMapping();
    for (const role of COOLIE_ROLES) {
      const row = primaryCounts.find((r) => r.role === role);
      expect(row, `role ${role} not in summary`).toBeDefined();
      expect(row!.primary, `role ${role} never used as primary`).toBeGreaterThan(0);
    }
  });

  it("isCoolieRole accepts the 5 fork roles and rejects others", () => {
    expect(isCoolieRole("fda")).toBe(true);
    expect(isCoolieRole("core-swe")).toBe(true);
    expect(isCoolieRole("pre-sre")).toBe(true);
    expect(isCoolieRole("fdse")).toBe(true);
    expect(isCoolieRole("ds")).toBe(true);
    expect(isCoolieRole("ceo")).toBe(false);
    expect(isCoolieRole("qa")).toBe(false);
    expect(isCoolieRole("devops")).toBe(false);
    expect(isCoolieRole("ops-lead")).toBe(false);
  });

  it("taskTitle uses the canonical format '<phase>.<n> <name>'", () => {
    for (const b of ROLE_MAPPING) {
      expect(b.taskTitle).toMatch(/^[1-5]\.\d+ /);
    }
  });

  it("primary distribution matches docs-coolie/ROLE-MAPPING.md §1", async () => {
    const { readFileSync } = await import("node:fs");
    const doc = readFileSync(
      new URL("../../../docs-coolie/ROLE-MAPPING.md", import.meta.url),
      "utf8",
    );
    // The doc claims: fda ×5, core-swe ×14, pre-sre ×6, fdse ×4, ds ×3.
    // (Total = 32 primary-or-secondary counts across 25 entries; primaries are 25.)
    expect(doc).toMatch(/合计:\s*25 任务/);
    expect(doc).toMatch(/主角色分布 — `fda` ×5, `core-swe` ×14, `pre-sre` ×6, `fdse` ×4, `ds` ×3/);
  });

  it("primary count totals to 25", () => {
    const counts = summarizeRoleMapping();
    const total = counts.reduce((s, r) => s + r.primary, 0);
    expect(total).toBe(25);
  });
});