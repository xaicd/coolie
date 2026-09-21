import type { AgentRoleTemplate, PalantirRole } from "../types.js";
import { ROLE_TEMPLATE as fda } from "./fda.js";
import { ROLE_TEMPLATE as coreSwe } from "./core-swe.js";
import { ROLE_TEMPLATE as preSre } from "./pre-sre.js";
import { ROLE_TEMPLATE as fdse } from "./fdse.js";
import { ROLE_TEMPLATE as ds } from "./ds.js";

/** The five employee templates, in the canonical hand-off order. */
export const ROLE_TEMPLATES: readonly AgentRoleTemplate[] = [fda, coreSwe, preSre, fdse, ds];

/** Look up one employee template by role id. */
export function roleTemplate(role: PalantirRole): AgentRoleTemplate {
  const template = ROLE_TEMPLATES.find((entry) => entry.role === role);
  if (!template) {
    throw new Error(`No role template for "${role}"`);
  }
  return template;
}

export { fda, coreSwe, preSre, fdse, ds };
