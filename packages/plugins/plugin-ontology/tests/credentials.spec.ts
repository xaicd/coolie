/**
 * Tenants and API keys.
 *
 * The ontology used to borrow both from the host: its tables referenced
 * `public.companies` for the tenant, and the host decided who the caller was.
 * A deployment without Paperclip has neither, which is what this closes.
 *
 * The property worth testing hardest is the negative one: a caller cannot become
 * someone else by asking. Every identity flows from a credential, and every
 * failure looks the same from outside.
 */
import { describe, expect, it } from "vitest";
import {
  API_KEY_ROLES,
  apiKeyPrefix,
  canDecide,
  canWrite,
  generateApiKey,
  hashApiKey,
  rolesOf,
  verifyApiKey,
  type ApiKeyRecord,
} from "@paperclipai/ontology-core/auth/credentials.js";

const PEPPER = "server-side-pepper";
const OTHER_PEPPER = "a-different-pepper";

const record = (over: Partial<ApiKeyRecord> = {}): ApiKeyRecord => ({
  prefix: "AAAAAAAAAAAA",
  key_hash: "0".repeat(64),
  scope: "board",
  roles: [],
  tenant_id: "t1",
  revoked_at: null,
  ...over,
});

describe("generating a key", () => {
  it("shows the secret once and stores only a hash", () => {
    const key = generateApiKey({ pepper: PEPPER });
    expect(key.secret).toMatch(/^oc_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/);
    expect(key.hash).not.toContain(key.secret);
    expect(key.hash).toHaveLength(64);
    // The secret half of the stored hash input is what must never be recoverable.
    expect(key.hash).not.toContain(key.secret.split("_")[2]!);
  });

  it("gives every key a distinct prefix and secret", () => {
    const keys = Array.from({ length: 25 }, () => generateApiKey({ pepper: PEPPER }));
    expect(new Set(keys.map((k) => k.prefix)).size).toBe(25);
    expect(new Set(keys.map((k) => k.secret)).size).toBe(25);
  });

  it("reads the prefix back out of a key, without the secret", () => {
    const key = generateApiKey({ pepper: PEPPER });
    expect(apiKeyPrefix(key.secret)).toBe(key.prefix);
    expect(apiKeyPrefix("not-a-key")).toBeUndefined();
    expect(apiKeyPrefix("")).toBeUndefined();
  });
});

describe("hashing", () => {
  it("is salted with the server's pepper", () => {
    // A dump of the key table must not be a set of usable credentials.
    const secret = "oc_AAAAAAAAAAAA_" + "x".repeat(43);
    expect(hashApiKey(secret, PEPPER)).not.toBe(hashApiKey(secret, OTHER_PEPPER));
  });

  it("is stable for the same secret and pepper", () => {
    expect(hashApiKey("s", PEPPER)).toBe(hashApiKey("s", PEPPER));
  });
});

describe("verifying a key", () => {
  const mint = (over: Partial<ApiKeyRecord> = {}) => {
    const key = generateApiKey({ pepper: PEPPER });
    return {
      secret: key.secret,
      record: record({ prefix: key.prefix, key_hash: key.hash, ...over }),
    };
  };

  it("authenticates a good key and reports what it is", () => {
    const { secret, record: row } = mint({ scope: "agent", tenant_id: "t9" });
    const caller = verifyApiKey(secret, row, PEPPER);
    expect(caller).toEqual({ tenantId: "t9", scope: "agent", roles: [], prefix: row.prefix });
  });

  it("rejects a key signed with a different pepper", () => {
    // The check that makes a stolen database insufficient.
    const { secret, record: row } = mint();
    expect(verifyApiKey(secret, row, OTHER_PEPPER)).toBeUndefined();
  });

  it("rejects a key whose secret was altered but prefix kept", () => {
    const { secret, record: row } = mint();
    const tampered = `${secret.slice(0, -1)}${secret.endsWith("A") ? "B" : "A"}`;
    expect(verifyApiKey(tampered, row, PEPPER)).toBeUndefined();
  });

  it("rejects a revoked key", () => {
    const { secret, record: row } = mint({ revoked_at: new Date().toISOString() });
    expect(verifyApiKey(secret, row, PEPPER)).toBeUndefined();
  });

  it("rejects a malformed key rather than trying to hash it", () => {
    for (const bad of ["", "oc_", "oc_short_x", "Bearer oc_a_b", "null", "undefined"]) {
      expect(verifyApiKey(bad, record(), PEPPER), bad).toBeUndefined();
    }
  });

  it("rejects an unknown key without distinguishing it from a wrong one", () => {
    // Telling a caller which part was wrong is a gift to someone guessing.
    const { secret } = mint();
    expect(verifyApiKey(secret, null, PEPPER)).toBeUndefined();
    expect(verifyApiKey(secret, undefined, PEPPER)).toBeUndefined();
  });

  it("does not accept a key whose prefix does not match the record", () => {
    const { secret, record: row } = mint({ prefix: "BBBBBBBBBBBB" });
    expect(verifyApiKey(secret, row, PEPPER)).toBeUndefined();
  });
});

describe("what an identity may do", () => {
  it("lets the board write and decide", () => {
    expect(canWrite({ scope: "board", roles: [] })).toBe(true);
    expect(canDecide({ scope: "board", roles: [] })).toBe(true);
  });

  it("lets an agent do neither", () => {
    // Proposing is the agent's write, and it goes through a gate; deciding is
    // publishing and belongs to a human or a rule.
    expect(canWrite({ scope: "agent", roles: [] })).toBe(false);
    expect(canDecide({ scope: "agent", roles: [] })).toBe(false);
  });

  it("holds the agent role for an agent, never the human ones", () => {
    // The bug this prevents: an agent silently inheriting modeler and seeing
    // every restricted view.
    expect(rolesOf({ scope: "agent", roles: [] })).toEqual(["agent"]);
    expect(rolesOf({ scope: "board", roles: [] })).toEqual(["modeler", "reviewer", "viewer"]);
  });

  it("honours roles a key carries explicitly", () => {
    expect(rolesOf({ scope: "agent", roles: ["reviewer"] })).toEqual(["reviewer"]);
  });

  it("keeps every role name in one vocabulary", () => {
    // The view visibility rules and the credential roles are the same list.
    expect(API_KEY_ROLES).toEqual(["modeler", "reviewer", "viewer", "agent"]);
  });
});
