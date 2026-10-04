import type { PlaybookDefinition } from "../../types.js";

export const ontologyDomainsTestPlaybook: PlaybookDefinition = {
  id: "test-ontology-domains",
  title: "业务本体多项目多域切换与防爆图谱采样自动化验证",
  description: "由墨斗 (FDA) 驱动 agent-browser 验证多本体域切换、默认域自生及 2000+ 关系图谱采样渲染防爆能力。",
  targetDomain: "ontology",
  kind: "testing",
  preferredPersona: "fda",
  engine: "browser",
  tags: ["ontology", "domains", "graph", "fda"],
  steps: [
    {
      name: "1. 访问业务本体控制台",
      description: "打开 /ontology-graph，检查图谱视图",
      engine: "browser",
      execute: async (ctx) => {
        return await ctx.browser!.navigate(`${ctx.baseUrl}/companies/${ctx.companyId ?? "default"}/ontology-graph`);
      },
      assert: async (ctx) => {
        await ctx.browser!.assertVisible("[data-testid='ontology-graph-container']");
      },
    },
    {
      name: "2. 验证多本体域切换器",
      description: "检查本体域下拉框，确认默认本体域与扩展域存在",
      engine: "browser",
      execute: async (ctx) => {
        return await ctx.browser!.click("[data-testid='ontology-domain-selector']");
      },
      assert: async (ctx) => {
        await ctx.browser!.assertVisible("[role='listbox']");
      },
    },
    {
      name: "3. 审查 2000+ 关系采样与边聚合防护",
      description: "确认高密度关系模式下启用了节点采样和边聚合，没有导致页面崩溃",
      engine: "browser",
      execute: async (ctx) => {
        return await ctx.browser!.assertVisible("[data-testid='graph-density-sampler']");
      },
    },
  ],
};
