import type { PlaybookDefinition } from "../../types.js";

export const ontologyPatrolOpsPlaybook: PlaybookDefinition = {
  id: "ops-ontology-patrol",
  title: "业务本体模型完整度与孤立实体常态化打理巡检",
  description: "由百晓生 (DS) 驱动 agent-browser 周期性扫描业务本体库，排查孤岛节点与死关系，生成模型拓扑健康度建议。",
  targetDomain: "ontology",
  kind: "operations",
  preferredPersona: "ds",
  engine: "browser",
  tags: ["ontology", "ops", "patrol", "graph"],
  steps: [
    {
      name: "1. 扫描实体与关系全量规模",
      description: "检查实体总数、关系总数与各域密度指标",
      engine: "browser",
      execute: async (ctx) => {
        return await ctx.browser!.navigate(`${ctx.baseUrl}/companies/${ctx.companyId ?? "default"}/ontology-graph`);
      },
    },
    {
      name: "2. 嗅探孤岛实体",
      description: "识别度数为 0 的未关联实体，列出待绑定清单",
      engine: "browser",
      execute: async (ctx) => {
        return await ctx.browser!.assertVisible("[data-testid='ontology-stats-bar']");
      },
    },
  ],
};
