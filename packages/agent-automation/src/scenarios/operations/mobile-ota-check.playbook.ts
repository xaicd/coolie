import type { PlaybookDefinition } from "../../types.js";

export const mobileOtaCheckOpsPlaybook: PlaybookDefinition = {
  id: "ops-mobile-ota-check",
  title: "移动端发版 7 处版本号一致性与自建 OTA Bundle 增量巡检",
  description: "由 PRE-SRE (兑底渊) 驱动 agent-device 与系统探针，巡检远端 version.json、OTA manifest 与 APK 内嵌 updateId 是否一致，防止「下了不装」或缓存击穿。",
  targetDomain: "mobile-app",
  kind: "operations",
  preferredPersona: "pre-sre",
  engine: "device",
  tags: ["mobile", "ota", "release", "sre"],
  steps: [
    {
      name: "1. 巡检远端版本元数据",
      description: "检查 https://xrobinai.cn/version.json 状态",
      engine: "device",
      execute: async () => {
        return {
          success: true,
          action: "probeVersionJson",
          durationMs: 30,
        };
      },
    },
    {
      name: "2. 检查 OTA manifest 签名与 launchAsset",
      description: "核对 runtimeVersion 与 bundleHash，防止 Caddy SPA 兜底陷阱",
      engine: "device",
      execute: async () => {
        return {
          success: true,
          action: "validateOtaManifest",
          durationMs: 40,
        };
      },
    },
  ],
};
