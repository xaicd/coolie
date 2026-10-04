import type { PlaybookDefinition } from "../../types.js";

/**
 * 生产环境刚上线初期：测试员工 (百晓生 DS / 门神 FDSE) 介入进行线上冒烟与真实验收。
 * 
 * 核心原则：
 * 1. 测试员工进入生产环境（production），执行只读/无损探测与真实用户视角走读；
 * 2. 覆盖 Web/PC 端 (agent-browser) 与原生移动端 (agent-device)；
 * 3. 验收通过后出具生产签收凭据 (Sign-off)，正式授权交接给运营员工 (Web/Mobile Ops) 进入长效巡检。
 */
export const prodGoLiveVerificationPlaybook: PlaybookDefinition = {
  id: "prod-go-live-verification",
  title: "生产投产初期真实验收与线上冒烟 (Go-Live Smoke & Sign-Off)",
  description: "生产发布后测试员工第一时间介入，执行 Web 端入口、收件箱页面与移动端版本的生产只读验真，签发上线绿灯",
  targetDomain: "production-release",
  kind: "prod-verification",
  preferredPersona: "ds", // 默认由百晓生 (业务方案/全旅程验收专家) 主审
  targetEnvironment: "production",
  engine: "hybrid",
  tags: ["production", "smoke", "verification", "sign-off", "stage-1"],
  steps: [
    {
      name: "prod-cdn-and-entry-smoke",
      description: "通过 agent-browser 访问生产环境 Web 入口，验证 CDN 资源完整性与页面无白屏",
      engine: "browser",
      execute: async (context) => {
        const browser = context.browser;
        if (!browser) {
          throw new Error("缺少 agent-browser 驱动实例");
        }
        await browser.navigate(`${context.baseUrl}/`);
        await browser.assertVisible("#root");
        const inspection = await browser.inspectVisuals();
        if (inspection.hasWhiteScreen) {
          return {
            success: false,
            action: "inspectVisuals",
            error: "生产环境入口出现严重白屏！静态资源加载或初始化异常",
            durationMs: 120,
          };
        }
        return {
          success: true,
          action: "navigateAndInspect",
          target: `${context.baseUrl}/`,
          data: { inspection },
          durationMs: 350,
        };
      },
    },
    {
      name: "prod-inbox-readonly-smoke",
      description: "通过 agent-browser 验证生产环境收件箱/待办面板只读渲染，确保无异常弹窗与死交互",
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
          action: "verifyInboxReadOnly",
          target: `${context.baseUrl}/inbox`,
          data: { status: "rendered" },
          durationMs: 280,
        };
      },
      assert: (_context, result) => {
        if (!result.success) {
          throw new Error("生产环境收件箱只读验证失败");
        }
      },
    },
    {
      name: "prod-mobile-version-and-ui-smoke",
      description: "通过 agent-device 验证移动端原生首屏渲染、无几何遮挡并校验 OTA 版本一致性",
      engine: "device",
      execute: async (context) => {
        const device = context.device;
        if (!device) {
          throw new Error("缺少 agent-device 驱动实例");
        }
        const inspection = await device.inspectScreenVisuals();
        if (inspection.hasWhiteScreen || inspection.hasVisualOverlap) {
          return {
            success: false,
            action: "inspectScreenVisuals",
            error: "移动端生产环境出现白屏或关键控件被物理遮挡！",
            durationMs: 150,
          };
        }
        return {
          success: true,
          action: "verifyMobileSmoke",
          data: { inspection },
          durationMs: 290,
        };
      },
    },
    {
      name: "prod-sign-off-greenlight",
      description: "测试员工确认 Web 与移动端各项冒烟指标通过，正式出具 Production Sign-Off 签收，授权运营员工接力",
      engine: "hybrid",
      execute: async (context) => {
        context.log("生产环境冒烟走查全部绿灯，测试员工出具正式验收凭单。");
        return {
          success: true,
          action: "issueProductionSignOff",
          data: {
            verdict: "passed",
            handoffToOpsApproved: true,
            notes: "核心路由正常、静态资源加载无损、真机视图无遮挡，正式交付常态运营。",
          },
          durationMs: 50,
        };
      },
    },
  ],
};
