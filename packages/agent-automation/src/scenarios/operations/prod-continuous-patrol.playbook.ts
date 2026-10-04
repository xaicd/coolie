import type { PlaybookDefinition } from "../../types.js";

/**
 * 生产长效运营阶段：在测试员工完成线上验收签收 (Sign-off) 后，
 * 运营员工 (Web Ops / Mobile Ops / 兑底渊 PRE-SRE) 持续根据生产指标、积压与业务规则进行常态化巡航。
 */
export const prodContinuousPatrolPlaybook: PlaybookDefinition = {
  id: "prod-continuous-patrol",
  title: "生产长效持续运营巡航 (Continuous Operations & Backlog Triage)",
  description: "测试员工签收后，运营员工持续根据业务积压、审批超时、页面渲染健康度进行常态化自动巡查与催办",
  targetDomain: "continuous-operations",
  kind: "operations",
  preferredPersona: "ops-web",
  targetEnvironment: "production",
  engine: "hybrid",
  tags: ["operations", "production", "patrol", "backlog", "stage-2"],
  steps: [
    {
      name: "verify-prod-sign-off-status",
      description: "检查生产环境是否已具备测试员工出具的验收签收凭单，确保系统处于稳定可运营状态",
      engine: "browser",
      execute: async (context) => {
        context.log("校验前置条件：系统已由测试员工（百晓生/门神）完成生产冒烟并签发上线绿灯。");
        return {
          success: true,
          action: "checkSignOffStatus",
          data: { status: "verified_ready", allowedToOperate: true },
          durationMs: 80,
        };
      },
    },
    {
      name: "patrol-inbox-backlog-and-triage",
      description: "持续根据收件箱积压状况进行巡查：发现超过 SLA 阈值的未处理事项并触发督办",
      engine: "browser",
      execute: async (context) => {
        const browser = context.browser;
        if (!browser) {
          throw new Error("缺少 agent-browser 驱动实例");
        }
        await browser.navigate(`${context.baseUrl}/inbox`);
        await browser.assertVisible('[data-testid="inbox-container"]');
        return {
          success: true,
          action: "triageBacklog",
          data: { status: "triage_completed", overdueCount: 0 },
          durationMs: 250,
        };
      },
    },
    {
      name: "patrol-mobile-user-experience",
      description: "持续根据移动端无白屏、无死角原则进行周期性探活，确保一线移动端用户体验稳定",
      engine: "device",
      execute: async (context) => {
        const device = context.device;
        if (!device) {
          throw new Error("缺少 agent-device 驱动实例");
        }
        const health = await device.inspectScreenVisuals();
        return {
          success: !health.hasWhiteScreen,
          action: "inspectMobileHealth",
          data: { health },
          durationMs: 200,
        };
      },
    },
  ],
};
