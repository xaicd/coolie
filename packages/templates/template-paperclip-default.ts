import type { CompanyTemplateSeed } from "./types.js";

/**
 * template-paperclip-default —— 旧默认模板（保留兼容）。
 * 最小成员集：一个 owner + 一个默认成员；不预置 Palantir 角色，
 * 也不预置 workspace 骨架，保持与历史建公司行为一致。
 */
export const templatePaperclipDefault: CompanyTemplateSeed = {
  templateId: "template-paperclip-default",
  name: "New Company",
  description: "Default Paperclip company (legacy compatibility).",
  ownerUserId: null,
  memberUserIds: [],
  roles: [],
  workspaceSkeletonPath: null,
  submodules: [],
};

export default templatePaperclipDefault;
