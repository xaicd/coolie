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

describe("memberStore integration with digital employees (agents)", () => {
  it("projects agents from public.agents as first-class Digital Employees", async () => {
    const { createMemberStore } = await import("@paperclipai/ontology-core/auth/memberStore.js");
    const mockDb: any = {
      namespace: "plugin_ontology",
      query: async (queryText: string, params?: any[]) => {
        if (queryText.includes("public.agents")) {
          const all = [
            { id: "agent-1", company_id: "t-1", name: "墨斗", role: "fda", title: "前线架构师", status: "idle" },
            { id: "agent-2", company_id: "t-1", name: "铁匠", role: "core-swe", title: "平台核心研发", status: "idle" },
          ];
          if (params && params[1]) {
            return all.filter((a) => a.id === params[1]);
          }
          return all;
        }
        return [];
      },
      execute: async () => ({ rowCount: 1 }),
    };

    const store = createMemberStore(mockDb);
    const members = await store.list("t-1");
    expect(members).toHaveLength(2);
    expect(members[0].id).toBe("agent-1");
    expect(members[0].actor_ref).toBe("agent:agent-1");
    expect(members[0].display_name).toBe("墨斗 (前线架构师)");
    expect(members[0].roles).toEqual(["fda"]);
    expect(members[0].status).toBe("active");

    const single = await store.getById("t-1", "agent-1");
    expect(single?.display_name).toBe("墨斗 (前线架构师)");

    const byRef = await store.getByRef("t-1", "agent:agent-2");
    expect(byRef?.display_name).toBe("铁匠 (平台核心研发)");
  });
});

