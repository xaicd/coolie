/**
 * Saved views, and who may open them.
 *
 * "针对不同角色用户 可以显示 不同视图": the same material, arranged for different
 * readers — and the arrangement itself is worth keeping. A view records the
 * *reading* (which perspective, what it focuses on), never facts, so losing one
 * costs a reading and never the model.
 *
 * The visibility rule is deliberately small and total: a view is either shared
 * with everyone who can see the domain, or restricted to a list of roles. There
 * is no inheritance and no per-view exception list, because a permission model
 * nobody can hold in their head is one people work around instead of with.
 *
 * Pure, so the rule can be tested without a database — and so a standalone
 * deployment applies exactly the same rule as the plugin.
 */

/** The perspectives a view can open. Mirrors the workbench's own choices. */
export const VIEW_KINDS = ["product", "runtime", "deployment", "instances"] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];

/**
 * The roles a view can be restricted to.
 *
 * These are *audiences*, not host permissions: the host still decides who is a
 * board member and who is an agent, and maps its actor onto one of these. A
 * standalone deployment does the same with its own identities.
 */
export const VIEW_ROLES = ["modeler", "reviewer", "viewer", "agent"] as const;
export type ViewRole = (typeof VIEW_ROLES)[number];

export const VIEW_VISIBILITIES = ["shared", "restricted"] as const;
export type ViewVisibility = (typeof VIEW_VISIBILITIES)[number];

export interface ViewRecord {
  key: string;
  name: string;
  description?: string;
  kind: ViewKind;
  config: Record<string, unknown>;
  visibility: ViewVisibility;
  roles: ViewRole[];
  created_by?: string;
}

export interface ViewAudience {
  /** The roles this actor holds. An actor may hold several. */
  roles: readonly string[];
  /** The actor's own name, so a creator keeps access to what they made. */
  actor?: string;
}

/**
 * Whether an actor may open a view.
 *
 * The creator keeps access to their own restricted view regardless of role:
 * otherwise saving a view with no roles — which is what an empty list means —
 * would hide it from the person who just made it.
 */
export function canOpenView(view: ViewRecord, audience: ViewAudience): boolean {
  if (view.visibility === "shared") return true;
  if (audience.actor !== undefined && view.created_by === audience.actor) return true;
  // An empty role list on a restricted view means the creator only, which is
  // what makes the empty list a usable way to say "not yet".
  if (view.roles.length === 0) return false;
  const held = new Set(audience.roles);
  return view.roles.some((role) => held.has(role));
}

/** The views an actor may open, in a stable order. */
export function visibleViews<T extends ViewRecord>(
  views: T[],
  audience: ViewAudience,
): T[] {
  return views
    .filter((view) => canOpenView(view, audience))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The views an actor may NOT open. Reported, so a gap is visible rather than silent. */
export function withheldViews<T extends ViewRecord>(views: T[], audience: ViewAudience): T[] {
  return views.filter((view) => !canOpenView(view, audience));
}

export interface ViewValidation {
  ok: boolean;
  errors: string[];
}

/**
 * Validate a view before it is stored.
 *
 * The config is the one free-form part, so it is checked for the mistakes that
 * would make a view useless rather than for a schema nobody would keep up to
 * date: a focus list that is not a list of keys cannot be applied, and an
 * unknown perspective cannot be opened at all.
 */
export function validateView(view: Partial<ViewRecord>): ViewValidation {
  const errors: string[] = [];
  if (!view.key || !/^[a-z0-9][a-z0-9_-]*$/.test(view.key)) {
    errors.push("key must be a lowercase slug (a-z, 0-9, _, -)");
  }
  if (!view.name || view.name.trim() === "") errors.push("name is required");
  if (!view.kind || !(VIEW_KINDS as readonly string[]).includes(view.kind)) {
    errors.push(`kind must be one of: ${VIEW_KINDS.join(", ")}`);
  }
  if (view.visibility && !(VIEW_VISIBILITIES as readonly string[]).includes(view.visibility)) {
    errors.push(`visibility must be one of: ${VIEW_VISIBILITIES.join(", ")}`);
  }
  for (const role of view.roles ?? []) {
    if (!(VIEW_ROLES as readonly string[]).includes(role)) {
      errors.push(`unknown role: ${role}`);
    }
  }
  const focus = (view.config ?? {}).focus;
  if (focus !== undefined) {
    if (!Array.isArray(focus) || focus.some((entry) => typeof entry !== "string")) {
      errors.push("config.focus must be a list of keys");
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Fill in what a caller may reasonably omit, and refuse what would be a lie.
 *
 * A restricted view with no roles is allowed — it means "the creator for now",
 * which is what someone who is still arranging a view wants. A restricted view
 * with roles that do not exist is refused: it would look shared and behave
 * locked.
 */
export function normaliseView(view: Partial<ViewRecord>): ViewRecord {
  const visibility: ViewVisibility = view.visibility ?? "shared";
  return {
    key: (view.key ?? "").trim(),
    name: (view.name ?? "").trim(),
    ...(view.description ? { description: view.description } : {}),
    kind: (view.kind ?? "runtime") as ViewKind,
    config: view.config ?? {},
    visibility,
    roles: visibility === "shared" ? [] : ((view.roles ?? []) as ViewRole[]),
    ...(view.created_by ? { created_by: view.created_by } : {}),
  };
}
