import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclipai.plugin-governance";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.1.0",
  displayName: "架构治理",
  description:
    "企业级 CMMI 质量门禁与基线、微服务活态三态拓扑 (SkyWalking/Chaos)、以及 DSH API 全生命周期契约治理中心。",
  author: "Coolie",
  categories: ["governance", "ui"],
  capabilities: [
    "ui.page.register",
    "ui.sidebar.register",
    "ui.detailTab.register",
    "projects.read",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      {
        type: "sidebar",
        id: "governance-sidebar",
        displayName: "架构治理",
        exportName: "SidebarLink",
        order: 48,
      },
      {
        type: "page",
        id: "governance-page",
        displayName: "架构与质量治理",
        exportName: "GovernancePage",
        routePath: "governance",
      },
      {
        type: "detailTab",
        id: "governance-tab",
        displayName: "质量门禁 (CMMI)",
        exportName: "GovernanceTab",
        entityTypes: ["project"],
        order: 30,
      },
      {
        type: "detailTab",
        id: "baseline-tab",
        displayName: "5+2 黄金文档",
        exportName: "BaselineTab",
        entityTypes: ["project"],
        order: 31,
      },
      {
        type: "detailTab",
        id: "rtm-tab",
        displayName: "RTM 需求穿透",
        exportName: "RtmTab",
        entityTypes: ["project"],
        order: 32,
      },
      {
        type: "detailTab",
        id: "spc-tab",
        displayName: "过程度量 (SPC 3σ)",
        exportName: "SpcTab",
        entityTypes: ["project"],
        order: 33,
      },
      {
        type: "detailTab",
        id: "living-topology-tab",
        displayName: "三态活拓扑 (SkyWalking/Chaos)",
        exportName: "LivingTopologyTab",
        entityTypes: ["project"],
        order: 34,
      },
      {
        type: "detailTab",
        id: "api-lifecycle-tab",
        displayName: "API 契约中心 (DSH/MCP)",
        exportName: "ApiLifecycleTab",
        entityTypes: ["project"],
        order: 35,
      },
    ],
  },
};

export default manifest;
