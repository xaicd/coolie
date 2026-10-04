import type { PlaybookDefinition } from "../../types.js";

export const governanceWaiverTestPlaybook: PlaybookDefinition = {
  id: "test-governance-waiver",
  title: "架构与质量治理 CMMI G1-G5 门禁特批会签流转端到端验证",
  description: "由门神 (FDSE) 与百晓生 (DS) 驱动 agent-browser 验证门禁阻断、特批会签发起、收件箱专属卡片审批流转及 Waived 徽章点亮闭环。",
  targetDomain: "governance",
  kind: "testing",
  preferredPersona: "fdse",
  engine: "browser",
  tags: ["governance", "cmmi", "approvals", "browser"],
  steps: [
    {
      name: "1. 访问架构治理控制台",
      description: "打开控制台插件页，确认 G1-G5 门禁列表已正常载入",
      engine: "browser",
      execute: async (ctx) => {
        return await ctx.browser!.navigate(`${ctx.baseUrl}/companies/${ctx.companyId ?? "default"}/plugins/plugin-governance`);
      },
      assert: async (ctx) => {
        await ctx.browser!.assertVisible("[data-testid='cmmi-gates-overview']");
      },
    },
    {
      name: "2. 嗅探阻断门禁并点击特批会签",
      description: "在 G5 投产门禁卡片上点击【发起特批会签】",
      engine: "browser",
      execute: async (ctx) => {
        return await ctx.browser!.click("[data-testid='gate-waiver-trigger-g5']");
      },
      assert: async (ctx) => {
        await ctx.browser!.assertVisible("[role='dialog']");
      },
    },
    {
      name: "3. 填写放行理由与安全承诺",
      description: "在弹窗表单中输入特批放行依据并提交",
      engine: "browser",
      execute: async (ctx) => {
        await ctx.browser!.fill("textarea[name='reason']", "演练批次特批放行，架构师与全栈测试已会签");
        return await ctx.browser!.click("button[type='submit']");
      },
    },
    {
      name: "4. 前往审批中心审查专属卡片",
      description: "跳转至 /approvals，检查质量门禁特批会签专属卡片结构",
      engine: "browser",
      execute: async (ctx) => {
        return await ctx.browser!.navigate(`${ctx.baseUrl}/approvals`);
      },
      assert: async (ctx) => {
        await ctx.browser!.assertVisible(".border-purple-500\\/20");
        await ctx.browser!.assertText(".border-purple-500\\/20", "特批放行理由与安全承诺");
      },
    },
    {
      name: "5. 执行 Approve 核准放行",
      description: "点击卡片底部的绿色 Approve 按钮",
      engine: "browser",
      execute: async (ctx) => {
        return await ctx.browser!.click("button:has-text('Approve')");
      },
    },
    {
      name: "6. 返回治理控制台验证 Waived 放行徽章",
      description: "重新加载治理页，确认 G5 门禁已由阻断变为紫色特批放行态",
      engine: "browser",
      execute: async (ctx) => {
        return await ctx.browser!.navigate(`${ctx.baseUrl}/companies/${ctx.companyId ?? "default"}/plugins/plugin-governance`);
      },
      assert: async (ctx) => {
        await ctx.browser!.assertVisible("[data-testid='gate-badge-waived-g5']");
      },
    },
  ],
};
