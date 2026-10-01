#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * wave258 — 6 老板团队 skills 用中文 2 字 + tools 英文 cli.
 *
 * wave256 老板原话 "把 cmmi 任务中所有包含的技能都列全了" + "技能不是 cli 工具,
 * 是 skills, 得区分了". 这一版:
 *   - `skills` 列: 中文 2 字 (调研/画图/选型/编码/部署/...),
 *                 从 CMMI 5 阶段 25 任务的派活路径反讲, 6 老板团队每个标 6-8 个.
 *   - `tools` 列:  英文 cli (cmd / agy / claude-glm / claude-mm / copilot),
 *                 老板原话 "工具不是 skill", 独立一列, 每个员工 1-3 个.
 *
 * 13 数字员工 (qa-*/ops-*) 老板原话 "不要 13 员工" — 本脚本**不**再标它们,
 * 由 migration 9023 直接 DELETE FROM agents WHERE name IN (...) 兜底.
 *
 * 用法:
 *   pnpm tsx scripts/seed-agent-roles.ts
 *   pnpm tsx scripts/seed-agent-roles.ts --dry-run
 *
 * 数据流: 不依赖外部 DB URL — 自动用 packages/db 的本地 PGlite
 * (同 server dev 默认). 远程用 DATABASE_URL env 覆盖.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";

import { agents } from "../packages/db/src/schema/agents.js";

interface RoleProfile {
  roleLabel: string;
  responsibilities: string[];
  /** 中文 2 字 skill (wave258) — 跟英文 cli 工具拆开. */
  skills: string[];
  /** 英文 cli / tool (wave258) — 跟中文 skill 拆开. */
  tools: string[];
}

interface NameMatcher {
  match: (name: string) => boolean;
  profile: RoleProfile;
}

/** 6 老板团队的真值 (wave258 中文 2 字 skill × 英文 cli tool). */
const MATCHERS: NameMatcher[] = [
  // ===== 6 老板团队 (boss 6 员工, wave222 物理层 + wave258 中文 2 字) =====
  {
    match: (n) => /hermes/i.test(n),
    profile: {
      roleLabel: "PM",
      responsibilities: ["调度派活", "验收交付", "汇总报告"],
      skills: ["派活", "验收", "报告", "调度", "评审", "复盘", "立项", "文档"],
      tools: ["agy", "claude-glm"],
    },
  },
  {
    match: (n) => /铁匠贰号|forge-2|forgetwo|forge2/i.test(n),
    profile: {
      roleLabel: "Core SWE",
      responsibilities: ["代码开发兜底", "PR 评审", "Bug 修复"],
      skills: ["编码", "重构", "修复", "测试", "联调", "文档", "评审", "设计"],
      tools: ["claude-mm", "cmd"],
    },
  },
  {
    match: (n) => /铁匠|forger|forge/i.test(n),
    profile: {
      roleLabel: "Core SWE",
      responsibilities: ["代码开发主力", "功能实现", "PR 主写"],
      skills: ["编码", "重构", "测试", "修复", "联调", "文档", "设计", "评审"],
      tools: ["cmd", "claude-mm"],
    },
  },
  {
    match: (n) => /门神|gatekeeper|gate/i.test(n),
    profile: {
      roleLabel: "FDSE",
      responsibilities: ["自动化脚本", "命令编排", "部署执行"],
      skills: ["命令", "脚本", "自动化", "部署", "联调", "测试", "调研", "文档"],
      tools: ["cmd", "claude-mm"],
    },
  },
  {
    match: (n) => /墨斗|mockr|mockup|agy/i.test(n),
    profile: {
      roleLabel: "FDA",
      responsibilities: ["画原型", "选型研判", "License 梳理"],
      skills: ["调研", "画图", "选型", "研判", "文档", "设计", "立项", "规划"],
      tools: ["agy", "claude-glm"],
    },
  },
  {
    match: (n) => /兑底渊|duidi|sre|pre-sre|presre/i.test(n),
    profile: {
      roleLabel: "PRE-SRE",
      responsibilities: ["部署运维", "监控告警", "故障恢复"],
      skills: ["部署", "运维", "监控", "应急", "自动化", "脚本", "命令", "风控"],
      tools: ["cmd", "claude-mm"],
    },
  },
  // ===== 百晓生 (DS) =====
  {
    match: (n) => /百晓生|sage|ds-agent|ds_/i.test(n),
    profile: {
      roleLabel: "DS",
      responsibilities: ["数据决策", "测试验收", "风险评估", "复盘总结"],
      skills: ["数据", "分析", "报告", "测试", "验收", "复盘", "风控", "评审"],
      tools: ["claude-mm", "claude-glm"],
    },
  },

  // ===== 13 数字员工 — wave258 老板原话 "不要 13 员工" =====
  // 不再标它们 (migration 9023 会直接 DELETE FROM agents WHERE name IN (...)).
  // 通用 fallback 给上游 5 角色外的 agent (ceo/cto/.../engineer/general/...).
];

/** 给定 agent name, 返回 profile (没匹配上时给通用 fallback). */
function profileFor(name: string): RoleProfile {
  for (const m of MATCHERS) {
    if (m.match(name)) return m.profile;
  }
  return {
    roleLabel: "通用",
    responsibilities: ["通用执行"],
    skills: [],
    tools: [],
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[seed-agent-roles] DATABASE_URL 未设置 — 跳过 (生产部署脚本期望运维手跑).");
    process.exit(0);
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema: { agents } });

  console.log(`[seed-agent-roles] 加载 agents ...`);
  const rows = await db.select({
    id: agents.id,
    name: agents.name,
    companyId: agents.companyId,
    role: agents.role,
  }).from(agents);

  console.log(`[seed-agent-roles] 共 ${rows.length} 行, dryRun=${dryRun}`);

  let updated = 0;
  for (const row of rows) {
    const profile = profileFor(row.name);
    if (dryRun) {
      console.log(`  [dry-run] ${row.name} -> ${profile.roleLabel} skills=[${profile.skills.join("/")}] tools=[${profile.tools.join("/")}]`);
      continue;
    }
    await db
      .update(agents)
      .set({
        roleLabel: profile.roleLabel,
        responsibilities: profile.responsibilities,
        skills: profile.skills,
        tools: profile.tools,
      })
      .where(eq(agents.id, row.id));
    updated += 1;
  }

  await client.end();
  console.log(`[seed-agent-roles] 完成: updated=${updated}`);
}

main().catch((err) => {
  console.error("[seed-agent-roles] 失败:", err);
  process.exit(1);
});
