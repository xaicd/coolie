import type { PlaybookDefinition } from "../../types.js";

export const governancePatrolOpsPlaybook: PlaybookDefinition = {
  id: "ops-governance-patrol",
  title: "架构与质量治理 CMMI 质量门禁常态化巡航与健康巡检",
  description: "由兑底渊 (PRE-SRE) 驱动 agent-browser 每日自动化巡检企业级门禁健康分、滞留阻断项与放行合规性。",
  targetDomain: "governance",
  kind: "operations",
  preferredPersona: "pre-sre",
  engine: "browser",
  tags: ["governance", "ops", "patrol", "sre"],
  steps: [
    {
      name: "1. 巡查架构治理全局健康度",
      description: "拉取全企业治理大盘数据并检查健康分",
      engine: "browser",
      execute: async (ctx) => {
        return await ctx.browser!.navigate(`${ctx.baseUrl}/companies/${ctx.companyId ?? "default"}/plugins/plugin-governance`);
      },
      assert: async (ctx) => {
        await ctx.browser!.assertVisible("[data-testid='governance-health-score']");
      },
    },
    {
      name: "2. 嗅探滞留阻断门禁",
      description: "扫描红色的 Blocked 门禁，统计阻塞工单数",
      engine: "browser",
      execute: async (ctx) => {
        return await ctx.browser!.assertVisible("[data-testid='cmmi-gates-overview']");
      },
    },
    {
      name: "3. 检查特批放行有效期与留痕",
      description: "审查近期待审批与已放行单据留痕",
      engine: "browser",
      execute: async (ctx) => {
        return await ctx.browser!.assertVisible("[data-testid='recent-waivers-audit']");
      },
    },
  ],
};
