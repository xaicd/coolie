/**
 * Saved views and their visibility.
 *
 * A view is a *reading* of the model — which perspective, what it focuses on —
 * never facts, so the rules here are about who sees an arrangement rather than
 * who sees the ontology. The visibility rule is deliberately small: shared, or
 * restricted to a list of roles.
 */
import { describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import {
  VIEW_KINDS,
  VIEW_ROLES,
  canOpenView,
  normaliseView,
  validateView,
  visibleViews,
  withheldViews,
  type ViewRecord,
} from "@paperclipai/ontology-core/views.js";

const view = (over: Partial<ViewRecord> = {}): ViewRecord => ({
  key: "runtime-overview",
  name: "运行架构总览",
  kind: "runtime",
  config: { focus: ["order-service"] },
  visibility: "shared",
  roles: [],
  ...over,
});

describe("opening a shared view", () => {
  it("lets anyone with the domain open it", () => {
    expect(canOpenView(view(), { roles: ["viewer"] })).toBe(true);
    // Even an actor with no roles: a shared view is shared.
    expect(canOpenView(view(), { roles: [] })).toBe(true);
  });
});

describe("opening a restricted view", () => {
  it("lets a role that is listed", () => {
    const restricted = view({ visibility: "restricted", roles: ["reviewer"] });
    expect(canOpenView(restricted, { roles: ["reviewer"] })).toBe(true);
    expect(canOpenView(restricted, { roles: ["modeler"] })).toBe(false);
  });

  it("lets an actor who holds one of several roles", () => {
    const restricted = view({ visibility: "restricted", roles: ["modeler", "reviewer"] });
    expect(canOpenView(restricted, { roles: ["viewer", "reviewer"] })).toBe(true);
  });

  it("hides an empty role list from everyone but the creator", () => {
    // An empty list is how someone says "not ready to share yet" — and it has to
    // stay usable by the person who just made it.
    const privateForNow = view({ visibility: "restricted", roles: [], created_by: "alice" });
    expect(canOpenView(privateForNow, { roles: ["modeler"], actor: "alice" })).toBe(true);
    expect(canOpenView(privateForNow, { roles: ["modeler"], actor: "bob" })).toBe(false);
  });

  it("keeps the creator's access whatever their roles are", () => {
    const restricted = view({ visibility: "restricted", roles: ["reviewer"], created_by: "alice" });
    expect(canOpenView(restricted, { roles: [], actor: "alice" })).toBe(true);
  });

  it("does not let a missing actor match a missing creator", () => {
    // Two `undefined`s must not be treated as the same person.
    const orphan = view({ visibility: "restricted", roles: ["viewer"], created_by: undefined });
    expect(canOpenView(orphan, { roles: [] })).toBe(false);
    expect(canOpenView(orphan, { roles: [] })).toBe(false);
  });
});

describe("listing what an actor can see", () => {
  const views = [
    view({ key: "b-shared", name: "B 共享" }),
    view({ key: "a-restricted", name: "A 受限", visibility: "restricted", roles: ["modeler"] }),
    view({ key: "c-locked", name: "C 仅创建者", visibility: "restricted", roles: [], created_by: "bob" }),
  ];

  it("returns what is visible, in a stable order", () => {
    expect(visibleViews(views, { roles: ["modeler"], actor: "alice" }).map((v) => v.key)).toEqual([
      "a-restricted",
      "b-shared",
    ]);
  });

  it("reports what was withheld instead of dropping it silently", () => {
    // A view the actor cannot see is a fact about their access, not an absence.
    expect(withheldViews(views, { roles: ["viewer"], actor: "alice" }).map((v) => v.key)).toEqual([
      "a-restricted",
      "c-locked",
    ]);
  });
});

describe("validating a view", () => {
  it("accepts a normal one", () => {
    expect(validateView(view()).ok).toBe(true);
  });

  it("refuses a key that is not a slug", () => {
    // The key is what a URL fragment and a share link carry.
    for (const key of ["Order Runtime", "", "UPPER", "with/slash"]) {
      expect(validateView(view({ key })).ok, key).toBe(false);
    }
  });

  it("refuses an unknown perspective, which could not be opened", () => {
    expect(validateView(view({ kind: "wizard" as never })).errors.join(" ")).toContain("kind");
  });

  it("refuses a role that does not exist", () => {
    // A restricted view listing a role nobody holds looks shared and behaves locked.
    const result = validateView(view({ visibility: "restricted", roles: ["admin" as never] }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("admin");
  });

  it("refuses a focus list that could not be applied", () => {
    expect(validateView(view({ config: { focus: "order-service" } })).ok).toBe(false);
    expect(validateView(view({ config: { focus: [1, 2] } })).ok).toBe(false);
    expect(validateView(view({ config: { focus: ["a", "b"] } })).ok).toBe(true);
  });

  it("requires a name and a known visibility", () => {
    expect(validateView(view({ name: "  " })).ok).toBe(false);
    expect(validateView(view({ visibility: "secret" as never })).ok).toBe(false);
  });

  it("names the supported perspectives and roles in its messages", () => {
    // The error is the documentation for whoever is writing the view.
    const errors = validateView({}).errors.join(" ");
    for (const kind of VIEW_KINDS) expect(errors, kind).toContain(kind);
    void VIEW_ROLES;
  });
});

describe("normalising a view", () => {
  it("drops roles from a shared view, which does not consult them", () => {
    // Keeping them would suggest they matter and invite someone to rely on them.
    const normalised = normaliseView(view({ visibility: "shared", roles: ["reviewer"] }));
    expect(normalised.roles).toEqual([]);
  });

  it("keeps roles on a restricted view", () => {
    expect(
      normaliseView(view({ visibility: "restricted", roles: ["reviewer"] })).roles,
    ).toEqual(["reviewer"]);
  });

  it("defaults to a shared runtime view", () => {
    const normalised = normaliseView({ key: "k", name: "n" });
    expect(normalised).toMatchObject({ visibility: "shared", kind: "runtime", roles: [] });
  });

  it("trims what a person typed", () => {
    expect(normaliseView({ key: " k ", name: " n " })).toMatchObject({ key: "k", name: "n" });
  });
});

describe("who the caller is decides what they see", () => {
  /**
   * The mapping from actor class to roles, which is the part that has to be
   * right for a restriction to mean anything: granting both classes every role
   * makes a restricted view visible to everyone, a restriction in name only.
   */
  async function bootWithViews(): Promise<TestHarness> {
    const harness = createTestHarness({ manifest });
    const row = (key: string, visibility: string, roles: string[]) => ({
      id: `id-${key}`,
      company_id: "c1",
      domain_id: "d1",
      key,
      name: key,
      description: "",
      kind: "runtime",
      config: {},
      visibility,
      roles,
      created_by: "user",
    });
    harness.ctx.db.query = (async (sql: string) => {
      if (sql.includes("ontology_views")) {
        return [
          row("shared-view", "shared", []),
          row("modeler-only", "restricted", ["modeler"]),
          row("agent-only", "restricted", ["agent"]),
        ] as never;
      }
      return [] as never;
    }) as typeof harness.ctx.db.query;
    await plugin.definition.setup(harness.ctx);
    return harness;
  }

  it("gives a board actor the human roles", async () => {
    const harness = await bootWithViews();
    const result = (await harness.getData("list-views", {
      companyId: "c1",
      domainId: "d1",
      actorKind: "board",
    })) as { views: Array<{ key: string }>; withheld: Array<{ key: string }> };
    expect(result.views.map((v) => v.key)).toEqual(["modeler-only", "shared-view"]);
    expect(result.withheld.map((v) => v.key)).toEqual(["agent-only"]);
  });

  it("withholds a human-restricted view from an agent", async () => {
    const harness = await bootWithViews();
    const result = (await harness.getData("list-views", {
      companyId: "c1",
      domainId: "d1",
      actorKind: "agent",
    })) as { views: Array<{ key: string }>; withheld: Array<{ key: string }> };
    // The restriction works both ways: an agent reaches the view meant for it
    // and not the one meant for modellers. A blanket grant would show all three.
    expect(result.views.map((v) => v.key)).toEqual(["agent-only", "shared-view"]);
    // Reported, not dropped: a view somebody cannot find should read as
    // restricted rather than imagined.
    expect(result.withheld.map((v) => v.key)).toEqual(["modeler-only"]);
  });
});
