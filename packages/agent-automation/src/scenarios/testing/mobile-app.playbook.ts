import type { PlaybookDefinition } from "../../types.js";

export const mobileAppTestPlaybook: PlaybookDefinition = {
  id: "test-mobile-app",
  title: "原生移动端 App 核心旅程、业务本体与视觉防遮挡自动化验证",
  description: "由 Mobile Ops 专员与门神 (FDSE) 驱动 agent-device，在 Android / iOS 模拟器及真机上验证 App 启动、工作台导航、业务本体浏览及无白屏遮挡审查。",
  targetDomain: "mobile-app",
  kind: "testing",
  preferredPersona: "ops-mobile",
  engine: "device",
  tags: ["mobile", "app", "device", "expo"],
  steps: [
    {
      name: "1. 启动 Coolie 原生 App",
      description: "唤起 cloud.coolie.app 原生客户端",
      engine: "device",
      execute: async (ctx) => {
        return await ctx.device!.launchApp("cloud.coolie.app");
      },
      assert: async (ctx) => {
        await ctx.device!.assertScreen("WORKSPACE_MAIN");
      },
    },
    {
      name: "2. 切换至业务本体资产页",
      description: "点击底部导航 Tab5 资产并进入业务本体",
      engine: "device",
      execute: async (ctx) => {
        return await ctx.device!.tap("tab-bar-item-assets");
      },
      assert: async (ctx) => {
        await ctx.device!.assertScreen("ASSETS_ONTOLOGY");
      },
    },
    {
      name: "3. 滑动手势审查与视觉遮挡检测",
      description: "向下滑动列表，执行无白屏与无元素物理重叠断言",
      engine: "device",
      execute: async (ctx) => {
        await ctx.device!.swipe("down");
        const inspection = await ctx.device!.inspectScreenVisuals();
        if (inspection.hasWhiteScreen || inspection.hasVisualOverlap) {
          throw new Error("检测到原生移动端屏幕白屏或存在元素物理重叠遮挡缺陷！");
        }
        return {
          success: true,
          action: "inspectVisuals",
          durationMs: 50,
        };
      },
    },
  ],
};
