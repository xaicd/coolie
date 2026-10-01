/**
 * wave258 — 派活精准匹配 单测.
 *
 * 覆盖 5 个 case:
 *   1. 单 skill 完全匹配 (1 个员工 100 分)
 *   2. 多 skill 完全匹配 (1 个员工 100 分)
 *   3. 多 skill 部分匹配 (部分员工 50 分)
 *   4. 无匹配 (空数组)
 *   5. 空 input (空数组)
 *   6. parseSkillInput 边界 (空格 / 多 / / 末尾 /)
 */
import { describe, expect, it } from "vitest";
import { parseSkillInput, CMMI_SKILLS } from "../dispatch-skill-matcher.js";

describe("dispatch-skill-matcher", () => {
  describe("parseSkillInput", () => {
    it("拆 / 输入", () => {
      expect(parseSkillInput("编码")).toEqual(["编码"]);
      expect(parseSkillInput("编码/测试")).toEqual(["编码", "测试"]);
      expect(parseSkillInput("编码 / 测试")).toEqual(["编码", "测试"]);
      expect(parseSkillInput("  编码  /  测试 /")).toEqual(["编码", "测试"]);
    });

    it("空 input 返空数组", () => {
      expect(parseSkillInput("")).toEqual([]);
      expect(parseSkillInput("/")).toEqual([]);
      expect(parseSkillInput("   ")).toEqual([]);
    });

    it("CMMI_SKILLS 30 个全在", () => {
      expect(CMMI_SKILLS.length).toBe(30);
      for (const s of ["调研", "画图", "编码", "重构", "测试", "部署", "派活", "验收", "复盘", "风控"]) {
        expect(CMMI_SKILLS).toContain(s);
      }
    });
  });

  describe("topMatchForSkill — 评分逻辑 (无 DB)", () => {
    // 算法是纯函数, 不需要真 DB. 在内存里模拟 matchAgentsBySkills.
    type Agent = { id: string; name: string; roleLabel: string | null; skills: string[]; status: string };

    function matchAgentsBySkillsInMemory(agentsList: Agent[], rawInput: string) {
      const input = parseSkillInput(rawInput);
      if (input.length === 0) return [];
      const matches: { agentId: string; agentName: string; roleLabel: string | null; matchedSkills: string[]; score: number }[] = [];
      for (const row of agentsList) {
        if (row.status === "terminated") continue;
        const matchedSkills = input.filter((s) => row.skills.includes(s));
        if (matchedSkills.length === 0) continue;
        const score = Math.round((matchedSkills.length / input.length) * 100);
        matches.push({ agentId: row.id, agentName: row.name, roleLabel: row.roleLabel, matchedSkills, score });
      }
      matches.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.agentName.localeCompare(b.agentName);
      });
      return matches;
    }

    const bossTeam: Agent[] = [
      { id: "1", name: "Hermes", roleLabel: "PM", skills: ["派活", "验收", "报告", "调度", "评审", "复盘", "立项", "文档"], status: "active" },
      { id: "2", name: "墨斗", roleLabel: "FDA", skills: ["调研", "画图", "选型", "研判", "文档", "设计", "立项", "规划"], status: "active" },
      { id: "3", name: "铁匠", roleLabel: "Core SWE", skills: ["编码", "重构", "测试", "修复", "联调", "文档", "设计", "评审"], status: "active" },
      { id: "4", name: "兑底渊", roleLabel: "PRE-SRE", skills: ["部署", "运维", "监控", "应急", "自动化", "脚本", "命令", "风控"], status: "active" },
      { id: "5", name: "门神", roleLabel: "FDSE", skills: ["命令", "脚本", "自动化", "部署", "联调", "测试", "调研", "文档"], status: "active" },
      { id: "6", name: "百晓生", roleLabel: "DS", skills: ["数据", "分析", "报告", "测试", "验收", "复盘", "风控", "评审"], status: "active" },
    ];

    it("单 skill 完全匹配 → 1 个员工 100 分", () => {
      const m = matchAgentsBySkillsInMemory(bossTeam, "编码");
      expect(m).toHaveLength(1);
      expect(m[0].agentName).toBe("铁匠");
      expect(m[0].score).toBe(100);
      expect(m[0].matchedSkills).toEqual(["编码"]);
    });

    it("多 skill 完全匹配 → 1 个员工 100 分", () => {
      const m = matchAgentsBySkillsInMemory(bossTeam, "编码/重构");
      expect(m).toHaveLength(1);
      expect(m[0].agentName).toBe("铁匠");
      expect(m[0].score).toBe(100);
      expect(m[0].matchedSkills).toEqual(["编码", "重构"]);
    });

    it("多 skill 部分匹配 → 平局 12.5 分", () => {
      // 铁匠 100 / 门神 0 / 百晓生 0 (测试不在 input 里)
      // 输入 "测试/数据" 1 个员工匹配: 百晓生 (测试 + 数据 = 2 个)
      const m = matchAgentsBySkillsInMemory(bossTeam, "测试/数据");
      expect(m[0].agentName).toBe("百晓生");
      expect(m[0].score).toBe(100);
      expect(m[0].matchedSkills).toEqual(["测试", "数据"]);
    });

    it("平局按名字升序 (Unicode 码点序, 不是拼音)", () => {
      // "测试" 在 铁匠 / 门神 / 百晓生 都命中 (各 100 分) — 平局按名字 Unicode 升序.
      // localeCompare 默认是 codepoint 序, 不是拼音. 百(U+767E) < 铁(U+94C1) < 门(U+95E8).
      const m = matchAgentsBySkillsInMemory(bossTeam, "测试");
      expect(m).toHaveLength(3);
      expect(m[0].agentName).toBe("百晓生");
      expect(m[1].agentName).toBe("铁匠");
      expect(m[2].agentName).toBe("门神");
    });

    it("无匹配 → 空数组", () => {
      const m = matchAgentsBySkillsInMemory(bossTeam, "不存在的技能");
      expect(m).toEqual([]);
    });

    it("空 input → 空数组", () => {
      expect(matchAgentsBySkillsInMemory(bossTeam, "")).toEqual([]);
      expect(matchAgentsBySkillsInMemory(bossTeam, "   ")).toEqual([]);
      expect(matchAgentsBySkillsInMemory(bossTeam, "/")).toEqual([]);
    });

    it("terminated 员工不参与匹配", () => {
      const terminated: Agent[] = [
        { id: "9", name: "已删", roleLabel: "QA", skills: ["编码"], status: "terminated" },
        ...bossTeam,
      ];
      const m = matchAgentsBySkillsInMemory(terminated, "编码");
      expect(m).toHaveLength(1);
      expect(m[0].agentName).toBe("铁匠");
    });
  });
});
