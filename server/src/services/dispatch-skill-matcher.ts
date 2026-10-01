/**
 * wave258 — 派活精准匹配 (老板原话 "方便后续派活精准").
 *
 * 输入: 中文 2 字技能 (单个或多个, 用 / 分隔).
 * 输出: 公司内 6 老板团队 × 评分排序 (matchedCount / totalInputSkills * 100).
 *
 * Why this exists:
 * - wave222 派活算法是给 mainline task 用的 (5 角色 → specialty 二次匹配).
 * - 老板 0.6.16 真机后续: 想在工坊 chat 直接说 "派活给编码" → 立刻知道派给铁匠.
 *   这是 Hermes 反讲的辅助功能, 不替 wave222 算法 (5 角色优先, 算法层不动).
 *
 * What this module owns:
 * 1. `parseSkillInput` — 拆 / 输入到 string[].
 * 2. `matchAgentsBySkills` — 给公司所有 agent 评分, 0-100, 降序.
 * 3. `topMatchForSkill` — 单 skill 返回最高分 (Hermes 反讲用).
 *
 * What this module does NOT own:
 * - 不写 issue assignee (那是派活算法的事).
 * - 不动 AGENT_ROLES enum.
 * - 不替 wave222 resolveCandidateAgents (specialty 二次匹配留给算法层).
 *
 * 文档: docs-coolie/CMMI-EMPLOYEE-MAPPING.md §6 (wave258).
 */
import { and, eq, ne } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";

/** 老板规定的"中文 2 字技能"全集 (30 个, 见 CMMI-EMPLOYEE-MAPPING.md §1 反讲). */
export const CMMI_SKILLS = [
  "调研", "画图", "选型", "研判", "文档", "评审", "立项", "规划",
  "设计", "编码", "重构", "测试", "修复", "联调", "部署", "运维",
  "监控", "应急", "命令", "脚本", "自动化", "数据", "分析", "报告",
  "派活", "验收", "调度", "复盘", "预算", "风控",
] as const;
export type CmmiSkill = (typeof CMMI_SKILLS)[number];

export interface SkillMatch {
  agentId: string;
  agentName: string;
  roleLabel: string | null;
  /** 命中的中文 2 字 skill (来自 agent.skills 列). */
  matchedSkills: string[];
  /** 0-100, 越高越匹配. */
  score: number;
}

/**
 * 拆 / 输入. 容忍空格 + 多 / + 末尾 /.
 * 例:
 *   "编码"           → ["编码"]
 *   "编码 / 测试"     → ["编码", "测试"]
 *   "  编码  /  测试 /" → ["编码", "测试"]
 */
export function parseSkillInput(raw: string): string[] {
  return raw
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 公司里所有 agent × 输入 skill 的匹配度评分.
 *
 * 算法 (O(N*K), N=agent 数, K=input skills):
 *   score = matchedSkills.length / inputSkills.length * 100
 *
 * 平局按 agent 名字拼音升序 (确定性, 测试好写).
 *
 * 不做 "weighted" 也不做 "fuzzy" — 老板原话要的是"中文 2 字精准", 输入错别字
 * 由 UI 层提示重输, 不在算法里猜.
 */
export async function matchAgentsBySkills(
  db: Db,
  companyId: string,
  rawInput: string,
): Promise<SkillMatch[]> {
  const input = parseSkillInput(rawInput);
  if (input.length === 0) return [];

  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      roleLabel: agents.roleLabel,
      skills: agents.skills,
      status: agents.status,
    })
    .from(agents)
    .where(and(eq(agents.companyId, companyId), ne(agents.status, "terminated")))
    .limit(200);

  const matches: SkillMatch[] = [];
  for (const row of rows) {
    const agentSkills = (row.skills ?? []) as string[];
    const matchedSkills = input.filter((s) => agentSkills.includes(s));
    if (matchedSkills.length === 0) continue;
    const score = Math.round((matchedSkills.length / input.length) * 100);
    matches.push({
      agentId: row.id,
      agentName: row.name,
      roleLabel: row.roleLabel ?? null,
      matchedSkills,
      score,
    });
  }

  // 评分降序, 平局按 agentName 升序 (确定性).
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.agentName.localeCompare(b.agentName);
  });
  return matches;
}

/**
 * 单 skill 派活精准: 返回最高分 agent (平局取第一个按名字升序).
 * Hermes chat 反讲用: "派活给编码" → "派给 铁匠 (编码, 评分 100)".
 */
export async function topMatchForSkill(
  db: Db,
  companyId: string,
  skill: string,
): Promise<SkillMatch | null> {
  const all = await matchAgentsBySkills(db, companyId, skill);
  return all[0] ?? null;
}
