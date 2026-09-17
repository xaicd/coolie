/**
 * Roles belong to a person, not to a credential.
 *
 * These are the rules that change when that becomes true: a role change that
 * needs no new key, a suspension that works, and the cases where falling back to
 * the credential's own roles would quietly undo both.
 */
import { canDecide, canWrite, type ApiKeyRecord } from "@paperclipai/ontology-core/auth/credentials.js";
import { knownRoles, resolveIdentity, type MemberRecord } from "@paperclipai/ontology-core/auth/members.js";
import { describe, expect, it } from "vitest";

const KEY: ApiKeyRecord = {
  prefix: "abc123abc123",
  key_hash: "deadbeef",
  scope: "board",
  roles: ["viewer"],
  tenant_id: "t-1",
};

function member(overrides: Partial<MemberRecord> = {}): MemberRecord {
  return {
    id: "m-1",
    tenant_id: "t-1",
    actor_ref: "user:alice",
    display_name: "Alice",
    roles: ["modeler", "reviewer"],
    status: "active",
    ...overrides,
  };
}

describe("identifying a caller", () => {
  it("takes the roles from the member, not from the key", () => {
    // The key says viewer; the person is a modeller. The person wins, which is
    // what makes a role change a row update instead of a new credential.
    const identity = resolveIdentity({ ...KEY, member_id: "m-1" }, member())!;
    expect(identity.roles).toEqual(["modeler", "reviewer"]);
    expect(identity.memberId).toBe("m-1");
    expect(identity.actorRef).toBe("user:alice");
  });

  it("keeps a machine credential working without a member", () => {
    // A key that names nobody is the service case, and it has to stay possible.
    const identity = resolveIdentity(KEY, null)!;
    expect(identity.roles).toEqual(["viewer"]);
    expect(identity.suspended).toBeUndefined();
  });

  it("suspends through the member, defeating the scope", () => {
    // The half that matters: a suspended operator who could still write and
    // decide would have lost their view rights and kept the power to change the
    // thing they can no longer see.
    const identity = resolveIdentity({ ...KEY, member_id: "m-1" }, member({ status: "suspended" }))!;
    expect(identity.roles).toEqual([]);
    expect(identity.suspended).toBe(true);
    expect(canWrite(identity)).toBe(false);
    expect(canDecide(identity)).toBe(false);
  });

  it("treats a removed member as suspended, not as absent", () => {
    // Removal is soft so that who did what survives it; an absent member would
    // otherwise restore the credential own roles.
    const identity = resolveIdentity({ ...KEY, member_id: "m-1" }, member({ is_deleted: true }))!;
    expect(identity.suspended).toBe(true);
    expect(canWrite(identity)).toBe(false);
  });

  it("refuses a member that is missing rather than reviving the key", () => {
    const identity = resolveIdentity({ ...KEY, member_id: "m-gone" }, null)!;
    expect(identity.roles).toEqual([]);
    expect(canWrite(identity)).toBe(false);
  });

  it("refuses a member belonging to another tenant", () => {
    // A key may not borrow an identity from elsewhere, whatever its own tenant
    // column says.
    expect(resolveIdentity({ ...KEY, member_id: "m-1" }, member({ tenant_id: "t-2" }))).toBeUndefined();
  });

  it("leaves an agent an agent, in roles and in power", () => {
    const agent = resolveIdentity({ ...KEY, scope: "agent", roles: [] }, null)!;
    expect(canWrite(agent)).toBe(false);
    expect(canDecide(agent)).toBe(false);
  });
});

describe("the role vocabulary", () => {
  it("drops roles nobody checks", () => {
    // A grant that looks real in a list and does nothing is worse than a refusal.
    expect(knownRoles(["modeler", "admin", "reviewer", ""])).toEqual(["modeler", "reviewer"]);
  });
});
