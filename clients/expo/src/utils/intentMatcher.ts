import type { AgentRow } from "../coolie";

/**
 * CMMI 30 个官方技能
 */
export const CMMI_SKILLS = [
  "调研", "画图", "选型", "研判", "文档", "评审", "立项", "规划",
  "设计", "编码", "重构", "测试", "修复", "联调", "部署", "运维",
  "监控", "应急", "命令", "脚本", "自动化", "数据", "分析", "报告",
  "派活", "验收", "调度", "复盘", "预算", "风控",
] as const;

export type CmmiSkill = (typeof CMMI_SKILLS)[number];

interface IntentRule {
  regex: RegExp;
  skills: CmmiSkill[];
  weight: number; // 动作词权重高于名词
}

/**
 * 常用自然语言词汇与 CMMI 技能映射表 (赋予核心动词更高置信度权重)
 */
const INTENT_RULES: IntentRule[] = [
  // 核心动作: 修理/排错/编码 (高权重 3)
  { regex: /(修|bug|缺陷|报错|崩溃|白屏|卡顿|卡死|闪退|异常|报错|fix|error|crash)/i, skills: ["修复", "编码"], weight: 3 },
  // 核心动作: 原型/设计/视觉 (高权重 3)
  { regex: /(原型|沙箱|画图|交互设计|ui设计|做个原型|视觉设计|原型设计)/i, skills: ["画图", "设计"], weight: 3 },
  // 核心动作: 部署/发版/运维 (高权重 3)
  { regex: /(部署|发版|发布|上线|tag|ota|manifest|重启|容器|docker|发个版)/i, skills: ["部署", "运维"], weight: 3 },
  // 核心动作: 测试/审查/回归 (高权重 3)
  { regex: /(测试|真机|回归|用例|走查|检查|playwright|自动化测试|审查|review)/i, skills: ["测试", "评审"], weight: 3 },
  // 核心动作: 调研/架构/选型 (高权重 3)
  { regex: /(架构|选型|方案|调研|评估|选型|对比|技术方案|spec|srs)/i, skills: ["调研", "选型", "研判"], weight: 3 },
  // 核心动作: 数据/分析/复盘 (高权重 3)
  { regex: /(数据分析|报表|指标|看板|复盘|成本分析)/i, skills: ["数据", "分析", "复盘"], weight: 3 },
  // 次级名词上下文: 界面/页面/代码/文档 (普通权重 1)
  { regex: /(界面|设计稿)/i, skills: ["设计"], weight: 1 },
  { regex: /(代码|重构|接口|api|接入|实现)/i, skills: ["编码", "重构"], weight: 2 },
  { regex: /(文档|说明书|需求)/i, skills: ["文档"], weight: 1 },
];

export interface IntentMatchResult {
  detectedSkills: string[];
  recommendedAgent: AgentRow | null;
  score: number;
  reason: string;
}

/**
 * 从文本中精准提取 CMMI 技能意图
 */
export function extractSkillsFromText(text: string): { skills: string[]; skillWeights: Record<string, number> } {
  if (!text || !text.trim()) return { skills: [], skillWeights: {} };
  const clean = text.trim();
  const skillWeights: Record<string, number> = {};

  // 1. 全词匹配 30 个 CMMI 技能
  for (const skill of CMMI_SKILLS) {
    if (clean.includes(skill)) {
      skillWeights[skill] = (skillWeights[skill] ?? 0) + 3;
    }
  }

  // 2. 匹配意图规则
  for (const rule of INTENT_RULES) {
    if (rule.regex.test(clean)) {
      rule.skills.forEach((s) => {
        skillWeights[s] = (skillWeights[s] ?? 0) + rule.weight;
      });
    }
  }

  const skills = Object.keys(skillWeights).sort((a, b) => skillWeights[b] - skillWeights[a]);
  return { skills, skillWeights };
}

/**
 * 根据输入的文本与当前公司员工列表，精准匹配最合适的员工
 */
export function matchIntentToAgent(text: string, agents: AgentRow[]): IntentMatchResult {
  const { skills: detectedSkills, skillWeights } = extractSkillsFromText(text);
  if (!detectedSkills.length || !agents.length) {
    return {
      detectedSkills: [],
      recommendedAgent: null,
      score: 0,
      reason: "",
    };
  }

  let bestAgent: AgentRow | null = null;
  let bestWeightedScore = -1;

  for (const agent of agents) {
    if (agent.status === "terminated") continue;
    const skills = (agent.skills ?? []) as string[];
    
    // 计算基于技能权重的匹配分
    let matchedWeight = 0;
    let totalWeight = 0;
    for (const s of detectedSkills) {
      const w = skillWeights[s] ?? 1;
      totalWeight += w;
      if (skills.includes(s)) {
        matchedWeight += w;
      }
    }

    // 角色身份加成
    let roleBonus = 0;
    const role = (agent.roleLabel ?? "").toUpperCase();
    const name = agent.name;

    // 修复/编码优先给 Core SWE 铁匠
    if ((skillWeights["修复"] ?? 0) >= 3 || (skillWeights["编码"] ?? 0) >= 3) {
      if (role.includes("CORE SWE") || name.includes("铁匠")) roleBonus += 30;
    }
    // 原型/设计/调研优先给 FDA 墨斗
    if ((skillWeights["画图"] ?? 0) >= 3 || (skillWeights["设计"] ?? 0) >= 3 || (skillWeights["调研"] ?? 0) >= 3) {
      if (role.includes("FDA") || name.includes("墨斗")) roleBonus += 30;
    }
    // 部署/发版优先给 PRE-SRE 兑底渊
    if ((skillWeights["部署"] ?? 0) >= 3 || (skillWeights["运维"] ?? 0) >= 3) {
      if (role.includes("PRE-SRE") || name.includes("兑底渊")) roleBonus += 30;
    }
    // 测试/评审优先给 FDSE 门神
    if ((skillWeights["测试"] ?? 0) >= 3 || (skillWeights["评审"] ?? 0) >= 3) {
      if (role.includes("FDSE") || name.includes("门神")) roleBonus += 30;
    }
    // 数据/复盘优先给 DS 百晓生
    if ((skillWeights["数据"] ?? 0) >= 3 || (skillWeights["分析"] ?? 0) >= 3 || (skillWeights["复盘"] ?? 0) >= 3) {
      if (role.includes("DS") || name.includes("百晓生")) roleBonus += 30;
    }

    const baseScore = totalWeight > 0 ? (matchedWeight / totalWeight) * 70 : 0;
    const finalScore = Math.round(Math.min(100, baseScore + roleBonus));

    if (finalScore > bestWeightedScore) {
      bestWeightedScore = finalScore;
      bestAgent = agent;
    }
  }

  if (bestWeightedScore <= 0 || !bestAgent) {
    return {
      detectedSkills,
      recommendedAgent: null,
      score: 0,
      reason: "",
    };
  }

  return {
    detectedSkills,
    recommendedAgent: bestAgent,
    score: bestWeightedScore,
    reason: `包含技能 [${detectedSkills.slice(0, 3).join("、")}]，匹配度 ${bestWeightedScore}%`,
  };
}
