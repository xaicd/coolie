/**
 * Tenants and API keys.
 *
 * Two things every deployment of this ontology needs and until now borrowed:
 * who the tenant is, and who the caller is. The plugin gets both from the host;
 * a standalone deployment has to own them, which is the last piece of §6.1.
 *
 * The model is deliberately small, because a credential model nobody can read is
 * one people route around:
 *
 *   - a **tenant** is a row the ontology owns. The tables used to reference the
 *     host's `public.companies`, which meant a standalone deployment had to ship
 *     the host's table to satisfy a foreign key.
 *   - an **API key** is the only credential. It names its tenant, its actor class
 *     (`board` or `agent`) and its roles, so nothing about identity travels in a
 *     request body where a caller could set it.
 *
 * Key handling rules, each of which is a way to get this wrong:
 *
 *   - the secret is shown **once**, at creation, and only its hash is stored;
 *   - the hash is salted with a server-side pepper, so a stolen database is not
 *     a stolen set of credentials;
 *   - comparison is constant-time, so verification does not leak the secret a
 *     byte at a time;
 *   - a key can be revoked and carries a last-used timestamp, because a
 *     credential you cannot inventory is one you cannot withdraw.
 *
 * Pure functions plus a tiny lookup interface, so the rule is testable without a
 * database and identical in the plugin and the standalone server.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** The actor classes the rest of the system already understands. */
export const API_KEY_SCOPES = ["board", "agent"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/** Roles a key may carry, matching the view visibility vocabulary. */
export const API_KEY_ROLES = ["modeler", "reviewer", "viewer", "agent"] as const;
export type ApiKeyRole = (typeof API_KEY_ROLES)[number];

/**
 * `oc_<12-char prefix>_<43-char secret>`.
 *
 * The prefix exists so a key can be listed and revoked without storing anything
 * secret: an operator recognises which key is which, and the database never needs
 * the rest to find it.
 */
const PREFIX_BYTES = 9;
const SECRET_BYTES = 32;
const KEY_PATTERN = /^oc_([A-Za-z0-9_-]{12})_([A-Za-z0-9_-]{43})$/;

export interface GeneratedApiKey {
  /** The one time the caller sees this. Only the hash is stored. */
  secret: string;
  /** Safe to store and to list. */
  prefix: string;
  /** What is written to the database. */
  hash: string;
}

export interface ApiKeyRecord {
  prefix: string;
  key_hash: string;
  scope: ApiKeyScope;
  roles: ApiKeyRole[];
  tenant_id: string;
  revoked_at?: string | null;
  /**
   * The member this credential belongs to, when it belongs to one.
   *
   * Present means the member owns the roles and the key is only a credential, so
   * changing a role does not require re-minting a key and the same person is one
   * actor in the audit trail however many keys they hold.
   */
  member_id?: string | null;
}

export interface AuthenticatedCaller {
  tenantId: string;
  scope: ApiKeyScope;
  roles: ApiKeyRole[];
  /** The key that authenticated, for the audit trail. */
  prefix: string;
}

/**
 * Hash a secret for storage.
 *
 * Salted with a pepper the database does not hold: a dump of the key table then
 * contains no usable credential. `prefix` is mixed in so two keys with the same
 * secret (which the caller should never produce) are still distinct rows.
 */
export function hashApiKey(secret: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${secret}`).digest("hex");
}

export function generateApiKey(options: { pepper: string }): GeneratedApiKey {
  const prefix = randomBytes(PREFIX_BYTES).toString("base64url").slice(0, 12);
  const body = randomBytes(SECRET_BYTES).toString("base64url").slice(0, 43);
  const secret = `oc_${prefix}_${body}`;
  return { secret, prefix, hash: hashApiKey(secret, options.pepper) };
}

/** The prefix of a presented key, without parsing the secret half. */
export function apiKeyPrefix(secret: string): string | undefined {
  return KEY_PATTERN.exec(secret)?.[1];
}

function secretOf(secret: string): string | undefined {
  return KEY_PATTERN.exec(secret)?.[2];
}

/**
 * Check a presented key against a stored record.
 *
 * Returns undefined for every kind of failure — malformed, unknown, revoked,
 * mismatched — because telling a caller *which* part was wrong is a gift to
 * someone guessing.
 */
export function verifyApiKey(
  presented: string,
  record: ApiKeyRecord | null | undefined,
  pepper: string,
): AuthenticatedCaller | undefined {
  const parsed = KEY_PATTERN.exec(presented);
  if (!parsed || !record) return undefined;
  if (record.revoked_at) return undefined;
  if (record.prefix !== parsed[1]) return undefined;

  const expected = Buffer.from(record.key_hash, "hex");
  const actual = Buffer.from(hashApiKey(presented, pepper), "hex");
  if (expected.length !== actual.length) return undefined;
  if (!timingSafeEqual(expected, actual)) return undefined;

  return {
    tenantId: record.tenant_id,
    scope: record.scope,
    roles: record.roles,
    prefix: record.prefix,
  };
}

/**
 * What an identity may do.
 *
 * `board` is full-control operator context, as the host already treats it: it
 * may write and decide, and it holds the human roles. An `agent` may read what
 * it is scoped to and propose — never decide. Both live here so the plugin and
 * the standalone server cannot drift on the one question that matters.
 */
export interface Identity {
  scope: ApiKeyScope;
  roles: readonly string[];
  /**
   * Set when the member behind this identity is suspended or gone.
   *
   * It has to defeat the scope and not only the roles: a suspended operator who
   * could still write and decide would have lost their view rights and kept the
   * ability to change the thing they can no longer see.
   */
  suspended?: boolean;
  /**
   * The credential that acted, when the caller authenticated with one. Identity
   * and credential are different questions: a person may hold several keys, and
   * the audit trail wants both the person and the key.
   */
  prefix?: string;
}

export function canWrite(identity: Identity): boolean {
  return identity.scope === "board" && identity.suspended !== true;
}

/** Deciding a proposal is the one act that publishes; an agent may not. */
export function canDecide(identity: Identity): boolean {
  return identity.scope === "board" && identity.suspended !== true;
}

/**
 * The roles an identity holds.
 *
 * A key may carry roles explicitly; when it does not, the scope decides, which
 * is what keeps an agent from silently inheriting the human roles.
 */
export function rolesOf(identity: Identity): string[] {
  if (identity.roles.length > 0) return [...identity.roles];
  return identity.scope === "agent" ? ["agent"] : ["modeler", "reviewer", "viewer"];
}
