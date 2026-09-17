/**
 * Members: the identity behind a credential.
 *
 * Roles used to live on the API key, which answers "what may this credential do"
 * and not "what may this person do". The difference shows up in three places that
 * all matter in practice:
 *
 *   - **changing a role required re-minting a key.** The old key stayed valid with
 *     its old roles, which is the opposite of what a role change is for.
 *   - **there was no way to stop someone.** A credential could be revoked; the
 *     person holding it could not be suspended while keeping their history.
 *   - **identity was per-credential**, so the same human with two keys was two
 *     unrelated actors in the audit trail.
 *
 * So a member holds the roles and the status, and a key may name the member it
 * belongs to. A key that names nobody keeps its own roles — that is the
 * machine-credential case, and it should stay possible.
 *
 * The rules are pure functions here so the plugin and the standalone server
 * cannot disagree about them.
 */

import type { ApiKeyRecord, ApiKeyRole, ApiKeyScope, Identity } from "./credentials.js";

export const MEMBER_STATUSES = ["active", "suspended"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export interface MemberRecord {
  id: string;
  tenant_id: string;
  /** The caller identity the surrounding system uses: a host user id, or any stable external id. */
  actor_ref: string;
  display_name: string;
  roles: string[];
  status: string;
  is_deleted?: boolean;
}

export interface ResolvedIdentity extends Identity {
  /** Set when the credential named a member: the person, not the key. */
  memberId?: string;
  /** The member was suspended or removed, so nothing is allowed. */
  suspended?: boolean;
  actorRef?: string;
}

/**
 * Who the caller is, given the key and the member it names.
 *
 * Returns `undefined` when the credential is valid but must not act at all — a
 * suspended member, or a key pointing at a member of another tenant. Refusing is
 * the point: falling back to the key's own roles would quietly restore the access
 * that suspension was meant to take away.
 */
export function resolveIdentity(
  key: ApiKeyRecord,
  member: MemberRecord | null | undefined,
): ResolvedIdentity | undefined {
  const base: ResolvedIdentity = {
    scope: key.scope,
    roles: key.roles,
    prefix: key.prefix,
  };
  if (!key.member_id) return base;

  // A named member that cannot be found is not a reason to fall back to the
  // credential's roles: the credential was issued on the understanding that the
  // member decides them.
  if (!member) return { ...base, memberId: key.member_id, roles: [], suspended: true };
  if (member.tenant_id !== key.tenant_id) return undefined;
  if (member.is_deleted || member.status !== "active") {
    return { ...base, memberId: member.id, roles: [], suspended: true };
  }

  return {
    ...base,
    // The member owns the roles; the key's own list is ignored while it names one.
    roles: member.roles,
    memberId: member.id,
    actorRef: member.actor_ref,
  };
}

/**
 * A credential with no member behind it: roles come from the key, unless the key
 * named a member and we were given the wrong one.
 */
export function rolesFromMember(member: MemberRecord | null | undefined): string[] | undefined {
  if (!member) return undefined;
  if (member.is_deleted || member.status !== "active") return [];
  return member.roles;
}

/** Roles that are in the known vocabulary. An unknown role is a typo, not a grant. */
export function knownRoles(roles: readonly string[]): ApiKeyRole[] {
  const known = new Set<string>(["modeler", "reviewer", "viewer", "agent"]);
  return roles.filter((role) => known.has(role)) as ApiKeyRole[];
}

export function isValidScope(scope: string): scope is ApiKeyScope {
  return scope === "board" || scope === "agent";
}

export function isValidStatus(status: string): status is MemberStatus {
  return (MEMBER_STATUSES as readonly string[]).includes(status);
}
