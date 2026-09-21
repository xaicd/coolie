import {
  PALANTIR_ROLES,
  ROLE_TEMPLATES,
  roleTemplate,
  type AgentRoleTemplate,
  type PalantirRole,
} from "@paperclipai/agents";
import { unprocessable } from "../errors.js";

/**
 * Coolie fork — server-side view of the 5 Palantir employee templates.
 *
 * The templates themselves live in `@paperclipai/agents` (pure data, no server
 * dependency) so the CLI and the register-agents route read the same five
 * descriptions. This module is the validating bridge: it turns a caller-supplied
 * role id into a template, and turns a role list into the deduplicated, ordered
 * template list the bulk-register route materialises onto `agents` rows.
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
