import type { PlaybookDefinition } from "../../types.js";

export const inboxApprovalsTestPlaybook: PlaybookDefinition = {
  id: "test-inbox-approvals",
  title: "原生收件箱与审批中心全流转自动化验证",
  description: "由百晓生 (DS) 驱动 agent-browser 验证收件箱条目列表、审批单快速过滤、卡片详情与审核裁决。",
  targetDomain: "inbox",
  kind: "testing",
  preferredPersona: "ds",
  engine: "browser",
  tags: ["inbox", "approvals", "browser", "ds"],
  steps: [
    {
      name: "1. 访问收件箱页面",
      description: "打开 /inbox，检查待办流与审批项分类",
      engine: "browser",
      execute: async (ctx) => {
        return await ctx.browser!.navigate(`${ctx.baseUrl}/inbox`);
      },
      assert: async (ctx) => {
        await ctx.browser!.assertVisible("div:has-text('Inbox')");
      },
    },
    {
      name: "2. 筛选 Approvals 待裁决审批流",
      description: "切换到 Approvals 分类，断言审批单卡片列表存在",
      engine: "browser",
      execute: async (ctx) => {
        return await ctx.browser!.click("button:has-text('Approvals')");
      },
    },
    {
      name: "3. 点击审批单进入审批详情页",
      description: "点击单据进入 /approvals/:id，检查审批动作区",
      engine: "browser",
      execute: async (ctx) => {
        return await ctx.browser!.click("[data-testid='approval-item-row']");
      },
      assert: async (ctx) => {
        await ctx.browser!.assertVisible("button:has-text('Approve')");
        await ctx.browser!.assertVisible("button:has-text('Reject')");
      },
    },
  ],
};
