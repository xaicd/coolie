import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PALANTIR_ROLES,
  ROLE_TEMPLATES,
  roleTemplate,
  type AgentRoleTemplate,
  type PalantirRole,
} from "@paperclipai/agents";
import {
  USER_CONTEXT_FILES,
  getTemplatePath,
  type UserContextFile,
} from "@paperclipai/agents/role-templates/user-context-paths";
import { unprocessable } from "../errors.js";

/**
 * Coolie fork — server-side view of the 5 Palantir employee templates.
 *
 * The templates themselves live in `@paperclipai/agents` (pure data, no server
 * dependency) so the CLI and the register-agents route read the same five
 * descriptions. This module is the validating bridge: it turns a caller-supplied
 * role id into a template, and turns a role list into the deduplicated, ordered
 * template list the bulk-register route materialises onto `agents` rows.
 *
 * wave69 — boss 25:00 OOB 「工坊 5 角色员工描述都去掉」二次确认:
 *   之前 wave65 只删了 UI 渲染, 没动数据写入。这里顺手把 `description`
 *   类的字段(title + 长 capabilities 描述字符串)在写入 agents 行前清空,
 *   只保留 `role`/`label`/`skillRef`/`cli`/`model` 这几个机器可读字段。
 *   老数据(已注册的 agent)的 title 列仍保留(供 skills/CLI 内部用),
 *   新创建时不再写入长描述。
 */

/** The role ids a company can be staffed with. */
export const COMPANY_ROLE_IDS = PALANTIR_ROLES;

export function listRoleTemplates(): readonly AgentRoleTemplate[] {
  return ROLE_TEMPLATES;
}

export function isCompanyRoleId(value: string): value is PalantirRole {
  return (PALANTIR_ROLES as readonly string[]).includes(value);
}

/**
 * Resolve one requested role id to its template. An unknown id is a 422 naming
 * the known roles, so a typo (or a role from a future fork) fails loudly here
 * rather than writing a role id no template describes.
 */
export function resolveRoleTemplate(role: string): AgentRoleTemplate {
  if (!isCompanyRoleId(role)) {
    throw unprocessable(
      `Unknown company role "${role}". Known roles: ${PALANTIR_ROLES.join(", ")}`,
    );
  }
  return roleTemplate(role);
}

/**
 * wave69 — boss 25:00 OOB 「5 角色描述都去掉」: 长描述类字段 (title 头衔
 * 长字符串 + capabilities 长描述字符串) 在写入 agents 行前清空, 只保留
 * 机器可读字段 (role / label / cli / model / backup / skillRef / gates /
 * responsibilities / deliverables / antiPatterns / summary)。
 *
 * wave70 — 第 3 轮彻底清: 「title / description / capabilities」三种
 * 描述类字段全清空。`AgentRoleTemplate` 没有名为 `description` 的字段,
 * 实际存储里 agents 表对应列也是 `title` + `capabilities`, 两者都置
 * 空字符串即可。所有 5 个 Palantir 角色 (fda / core-swe / pre-sre /
 * fdse / ds) 都走这条路径。
 *
 * 返回 shallow clone, 不改 inputs。
 */
export function stripRoleDescription(template: AgentRoleTemplate): AgentRoleTemplate {
  return {
    ...template,
    title: "",
    capabilities: "",
  };
}

/**
 * Resolve a list of requested role ids into templates.
 *
 * Duplicates collapse, and the result keeps the canonical `ROLE_TEMPLATES`
 * order rather than the caller's, so re-running the one-key project script
 * always produces the same staff. An empty list is refused: the caller must ask
 * for someone.
 */
export function resolveRoleTemplates(roles: readonly string[]): AgentRoleTemplate[] {
  if (roles.length === 0) {
    throw unprocessable("At least one role is required");
  }
  const requested = new Set(roles.map((role) => resolveRoleTemplate(role).role));
  return ROLE_TEMPLATES.filter((template) => requested.has(template.role));
}

/**
 * Coolie fork — wave67 (DS 能力同步): 智能体人格模板加载.
 *
 * 同步自 DigitalStaff 的 7 份人格文件 (SOUL.md / IDENTITY.md / USER.md /
 * AGENTS.md / TOOLS.md / HEARTBEAT.md / BOOTSTRAP.md). 文件清单的 single
 * source of truth 在 `packages/agents/role-templates/user-context-paths.ts`
 * (仿 DS 的 `CrushContextPaths.USER_CONTEXT_FILES`), server / CLI / 未来 UI
 * 都从这里读, 不会在三个地方各写一遍漂移掉。
 *
 * 加载规则:
 * - 文件清单固定, 顺序固定, 不按 agent 角色变化 — 因为人格是 *agent* 的,
 *   不是 *role* 的; 同一份 SOUL.md 适用于所有 5 个 Palantir 角色。
 * - `{{name}}` 占位符会被替换成传入的 `agentName`, 允许 IDENTITY.md 等
 *   模板在每位 agent 实例下显示具体名字, 不留未替换变量。其它占位符
 *   (`{{emoji}}` / `{{avatar}}`) 由 agent 自己的初始化流程或后续人工
 *   编辑补全 — 模板里看到未替换的 `{{xxx}}` 是预期的, 不是 bug。
 * - 缺失的模板 (例如 .md 还没翻译到位) 不会 throw — fallback 成一条
 *   `(missing FILE)` 字符串, 让 agent 仍然能启动并把「缺人格」这件事
 *   当场暴露出来, 而不是悄无声息地退化到无人格运行。
 */
export type AgentPersona = Record<UserContextFile, string>;

const TEMPLATES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  // 3 levels up from `server/src/services/role-template.ts` (or its compiled
  // `dist/services/role-template.js`) lands at the repo root, where
  // `packages/agents/role-templates` lives. tsx watch runs the .ts source
  // directly, while a compiled deployment runs .js — both end up here.
  "../../../packages/agents/role-templates",
);

export function loadAgentPersona(roleName: string): AgentPersona {
  const out = {} as AgentPersona;
  for (const file of USER_CONTEXT_FILES) {
    const p = path.join(TEMPLATES_DIR, getTemplatePath(file));
    try {
      out[file] = readFileSync(p, "utf8").replace(/\{\{name\}\}/g, roleName);
    } catch {
      out[file] = `(missing ${file})`;
    }
  }
  return out;
}
