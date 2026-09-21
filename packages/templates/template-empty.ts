import type { CompanyTemplateSeed } from "./types.js";

/**
 * template-empty —— 最小公司模板：只有名字 + owner。
 * 不预置角色、不预置 workspace 骨架；用于「先建个空壳，后面再配」的场景。
 */
export const templateEmpty: CompanyTemplateSeed = {
  templateId: "template-empty",
  name: "New Company",
  description: null,
  ownerUserId: null,
  memberUserIds: [],
  roles: [],
  workspaceSkeletonPath: null,
  submodules: [],
};

export default templateEmpty;
