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
 * 13 数字员工 (qa-* / ops-*) 老板原话 "不要 13 员工" — 本脚本**不**再标它们,
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
import { resolveMigrationConnection } from "../packages/db/src/migration-runtime.js";

interface RoleProfile {
  canonicalName?: string;
  role: string;
  roleLabel: string;
  title: string;
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
      canonicalName: "Hermes",
      role: "pm",
      roleLabel: "PM",
      title: "项目总调度掌柜",
      responsibilities: ["调度派活", "验收交付", "汇总报告", "CMMI阶段管理"],
      skills: ["派活", "验收", "报告", "调度", "评审", "复盘", "立项", "文档"],
      tools: ["agy", "claude-glm"],
    },
  },
  {
    match: (n) => /铁匠贰号|forge-2|forgetwo|forge2/i.test(n),
    profile: {
      canonicalName: "铁匠贰号",
      role: "core-swe",
      roleLabel: "Core SWE",
      title: "代码开发兜底",
      responsibilities: ["代码开发兜底", "PR 评审", "Bug 修复"],
      skills: ["编码", "重构", "修复", "测试", "联调", "文档", "评审", "设计"],
      tools: ["claude-mm", "cmd"],
    },
  },
  {
    match: (n) => /铁匠|forger|forge|core-swe/i.test(n),
    profile: {
      canonicalName: "铁匠",
      role: "core-swe",
      roleLabel: "Core SWE",
      title: "平台核心研发",
      responsibilities: ["代码开发主力", "功能实现", "PR 主写", "缺陷修复"],
      skills: ["编码", "重构", "测试", "修复", "联调", "文档", "设计", "评审"],
      tools: ["cmd", "claude-mm", "claude-glm"],
    },
  },
  {
    match: (n) => /门神|gatekeeper|gate|fdse/i.test(n),
    profile: {
      canonicalName: "门神",
      role: "fdse",
      roleLabel: "FDSE",
      title: "前线部署工程师",
      responsibilities: ["自动化脚本", "命令编排", "部署执行", "端到端联调"],
      skills: ["命令", "脚本", "自动化", "部署", "联调", "测试", "调研", "文档"],
      tools: ["cmd", "claude-mm"],
    },
  },
  {
    match: (n) => /墨斗|mockr|mockup|agy|fda/i.test(n),
    profile: {
      canonicalName: "墨斗",
      role: "fda",
      roleLabel: "FDA",
      title: "前线架构师",
      responsibilities: ["画原型", "选型研判", "License 梳理", "本体域规划"],
      skills: ["调研", "画图", "选型", "研判", "文档", "设计", "立项", "规划"],
      tools: ["agy", "claude-glm"],
    },
  },
  {
    match: (n) => /兑底渊|duidi|sre|pre-sre|presre/i.test(n),
    profile: {
      canonicalName: "兑底渊",
      role: "pre-sre",
      roleLabel: "PRE-SRE",
      title: "产品可靠性专家",
      responsibilities: ["部署运维", "监控告警", "故障恢复", "发版门禁守护"],
      skills: ["部署", "运维", "监控", "应急", "自动化", "脚本", "命令", "风控"],
      tools: ["cmd", "claude-mm"],
    },
  },
  // ===== 百晓生 (DS) =====
  {
    match: (n) => /百晓生|sage|ds-agent|ds_/i.test(n),
    profile: {
      canonicalName: "百晓生",
      role: "ds",
      roleLabel: "DS",
      title: "部署战略与方案专家",
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
    role: "general",
    roleLabel: "通用",
    title: "通用数字员工",
    responsibilities: ["通用执行"],
    skills: [],
    tools: [],
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  let url = process.env.DATABASE_URL;
  let migrationConn: { stop: () => Promise<void> } | null = null;
  if (!url) {
    const resolved = await resolveMigrationConnection();
    url = resolved.connectionString;
    migrationConn = resolved;
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
      console.log(`  [dry-run] ${row.name} -> ${profile.canonicalName || row.name} (${profile.title}) ${profile.roleLabel} skills=[${profile.skills.join("/")}] tools=[${profile.tools.join("/")}]`);
      continue;
    }
    const updateValues: Record<string, unknown> = {
      roleLabel: profile.roleLabel,
      responsibilities: profile.responsibilities,
      skills: profile.skills,
      tools: profile.tools,
      status: "idle",
    };
    if (profile.title) {
      updateValues.title = profile.title;
    }
    if (profile.role) {
      updateValues.role = profile.role;
    }
    if (profile.canonicalName) {
      updateValues.name = profile.canonicalName;
    }

    await db
      .update(agents)
      .set(updateValues)
      .where(eq(agents.id, row.id));
    updated += 1;
  }

  await client.end();
  if (migrationConn) {
    await migrationConn.stop();
  }
  console.log(`[seed-agent-roles] 完成: updated=${updated}`);
}

main().catch((err) => {
  console.error("[seed-agent-roles] 失败:", err);
  process.exit(1);
});
