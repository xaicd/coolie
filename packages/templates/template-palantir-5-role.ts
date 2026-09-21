import type { CompanyTemplateRoleBinding, CompanyTemplateSeed } from "./types.js";

/**
 * 5 角色主备绑定（与 templates/workspace-skel/models.yaml 保持同源）。
 * 第二波 service 用它批量 POST /api/companies/<id>/agents。
 */
export const palantir5RoleBindings: CompanyTemplateRoleBinding[] = [
  { role: "fda", cli: "cmd", model: "glm-5.3", skillRef: ".agents/skills/fda/" },
  { role: "core-swe", cli: "cmd", model: "glm-5.3", skillRef: ".agents/skills/core-swe/" },
  { role: "pre-sre", cli: "claude", model: "claude-sonnet-4-5", skillRef: ".agents/skills/pre-sre/" },
  { role: "fdse", cli: "claude", model: "claude-sonnet-4-5", skillRef: ".agents/skills/fdse/" },
  { role: "ds", cli: "claude", model: "claude-opus-4-5", skillRef: ".agents/skills/ds/" },
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
