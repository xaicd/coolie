import type { PlaybookDefinition } from "../../types.js";

export const inboxTriageOpsPlaybook: PlaybookDefinition = {
  id: "ops-inbox-triage",
  title: "待办审批单与收件箱积压常态打理巡检",
  description: "由 Web 运营 专员驱动 agent-browser 每日早间巡视全企业待办收件箱，审查滞留审批流并形成打理快报。",
  targetDomain: "inbox",
  kind: "operations",
  preferredPersona: "ops-web",
  engine: "browser",
  tags: ["inbox", "ops", "triage", "approvals"],
  steps: [
    {
      name: "1. 巡检收件箱未读与待办积压",
      description: "检查是否有未读通知与待处理事项",
      engine: "browser",
      execute: async (ctx) => {
        return await ctx.browser!.navigate(`${ctx.baseUrl}/inbox`);
      },
    },
    {
      name: "2. 巡检待裁决审批列表",
      description: "检查审批中心 pending 数量，统计超过 24h 滞留项",
      engine: "browser",
      execute: async (ctx) => {
        return await ctx.browser!.navigate(`${ctx.baseUrl}/approvals`);
      },
      assert: async (ctx) => {
        await ctx.browser!.assertVisible("button:has-text('Pending')");
      },
    },
  ],
};
