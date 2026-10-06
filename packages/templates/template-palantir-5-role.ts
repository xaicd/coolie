import type { CompanyTemplateRoleBinding, CompanyTemplateSeed } from "./types.js";

/**
 * 5 角色主备绑定（与 templates/workspace-skel/models.yaml 保持同源）。
 * 默认装 Claude + Hermes（defaultProvider: claude），降级用 cmd/glm-5.3。
 * 第二波 service 用它批量 POST /api/companies/<id>/agents。
 */
export const palantir5RoleBindings: CompanyTemplateRoleBinding[] = [
  {
    role: "fda",
    cli: ["agy", "cmd"],
    model: ["gemini-3.8", "commandcode"],
    defaultProvider: "agy",
    providerCapabilities: ["agy", "cmd"],
    skillRef: ".agents/skills/fda/",
    adapterType: "gemini_local",
    tools: ["agy-gemini3.8", "cmd"],
  },
  {
    role: "core-swe",
    cli: ["claude", "cmd"],
    model: ["glm-5.3", "minimax-m3"],
    defaultProvider: "claude",
    providerCapabilities: ["claude", "cmd"],
    skillRef: ".agents/skills/core-swe/",
    adapterType: "claude_local",
    tools: ["claude-glm", "claude-mm"],
  },
  {
    role: "pre-sre",
    cli: ["copilot", "claude"],
    model: ["gpt5-sol", "minimax-m3"],
    defaultProvider: "copilot",
    providerCapabilities: ["copilot", "claude"],
    skillRef: ".agents/skills/pre-sre/",
    adapterType: "process",
    tools: ["copilot", "claude-mm"],
  },
  {
    role: "fdse",
    cli: ["cmd", "claude"],
    model: ["commandcode", "minimax-m3"],
    defaultProvider: "cmd",
    providerCapabilities: ["cmd", "claude"],
    skillRef: ".agents/skills/fdse/",
    adapterType: "process",
    tools: ["cmd", "claude-mm"],
  },
  {
    role: "ds",
    cli: ["claude", "agy"],
    model: ["glm-5.3", "minimax-m3", "gemini-3.8"],
    defaultProvider: "claude",
    providerCapabilities: ["claude", "agy"],
    skillRef: ".agents/skills/ds/",
    adapterType: "claude_local",
    tools: ["claude-glm", "claude-mm", "agy-gemini3.8"],
  },
];

/** 默认模板：Palantir 5 角色 + workspace 骨架 + ruoyi-all-next 子模块。 */
export const templatePalantir5Role: CompanyTemplateSeed = {
  templateId: "template-palantir-5-role",
  name: "New Company",
  description: "Palantir 5-role company: FDA / Core SWE / PRE-SRE / FDSE / DS.",
  ownerUserId: null,
  memberUserIds: [],
  roles: palantir5RoleBindings,
  workspaceSkeletonPath: "templates/workspace-skel",
  submodules: ["https://github.com/xaicd/ruoyi-all-next.git"],
};

/** workspace 骨架默认拷贝目标（相对 $HOME）。 */
export const PALANTIR_WORKSPACE_HOME = "~/workspace/xaicd";

export default templatePalantir5Role;
