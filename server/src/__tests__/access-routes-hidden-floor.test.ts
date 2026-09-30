import express from "express";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * Operator-hidden Access surface floor (`instance.access` in
 * PAPERCLIP_HIDDEN_SETTINGS): instance-admin user management routes reject
 * with a stable code while the rest of the access router stays untouched.
 * The floor throws before any data access, so a stub db suffices; the
 * unfloored happy paths are covered by the embedded-postgres access tests.
 */

const stubDb = {
  select: () => ({
    from: () => {
      const chain = {
        orderBy: async () => [] as unknown[],
        where: async () => [] as unknown[],
      };
      return chain;
    },
  }),
} as never;

async function createApp() {
  const [{ accessRoutes }, { errorHandler }] = await Promise.all([
    import("../routes/access.js"),
    import("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = {
      type: "board",
      userId: "instance-admin-1",
      source: "local_implicit",
      companyIds: ["company-1"],
      memberships: [{ companyId: "company-1", membershipRole: "owner", status: "active" }],
      isInstanceAdmin: true,
    } as Express.Request["actor"];
    next();
  });
  app.use("/api", accessRoutes(stubDb, {
    deploymentMode: "authenticated",
    deploymentExposure: "private",
    bindHost: "127.0.0.1",
    allowedHostnames: [],
  }));
  app.use(errorHandler);
  return app;
}

describe("operator-hidden access admin floor", () => {
  let app: express.Express;

  // The access router is a large module; import and build the app once so the
  // cost is not charged to the first test's timeout on slow CI runners.
  beforeAll(async () => {
    app = await createApp();
  }, 30_000);

  afterEach(() => {
    delete process.env.PAPERCLIP_HIDDEN_SETTINGS;
  });

  const attempts: Array<[string, () => request.Test]> = [
    ["promote", () => request(app).post("/api/admin/users/user-1/promote-instance-admin")],
    ["demote", () => request(app).post("/api/admin/users/user-1/demote-instance-admin")],
    [
      "company access write",
      () => request(app).put("/api/admin/users/user-1/company-access").send({ companyIds: [] }),
    ],
    ["user listing", () => request(app).get("/api/admin/users")],
    ["company access read", () => request(app).get("/api/admin/users/user-1/company-access")],
  ];

  it.each(attempts)(
    "floors the %s route when the operator hides the surface",
    async (_name, buildRequest) => {
      process.env.PAPERCLIP_HIDDEN_SETTINGS = "instance.access";

      const res = await buildRequest();

      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect(res.body.details).toMatchObject({ code: "settings_operator_managed" });
    },
  );

  it("keeps the routes reachable when the surface is not hidden", async () => {
    const res = await request(app).get("/api/admin/users");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("access router api_key source bypass", () => {
  // Wave196: the on-device `coolie` App's board concierge authenticates with
  // `x-paperclip-api-key`, which the actor resolver surfaces as a board actor
  // with `source: "api_key"` and `isInstanceAdmin: true`. The synthetic
  // concierge user id has no `instance_user_roles` row, so the per-router
  // `assertInstanceAdmin` must short-circuit on that source rather than
  // running the DB membership check that ends in a 403.

  async function buildAppWithActor(actor: Express.Request["actor"]) {
    const [{ accessRoutes }, { errorHandler }] = await Promise.all([
      import("../routes/access.js"),
      import("../middleware/index.js"),
    ]);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.actor = actor;
      next();
    });
    app.use("/api", accessRoutes(stubDb, {
      deploymentMode: "authenticated",
      deploymentExposure: "private",
      bindHost: "127.0.0.1",
      allowedHostnames: [],
    }));
    app.use(errorHandler);
    return app;
  }

  it("admits an api_key board actor to /api/admin/users (instance-admin equivalent)", async () => {
    const app = await buildAppWithActor({
      type: "board",
      userId: "paperclip-concierge",
      userName: "Paperclip Board Concierge",
      userEmail: null,
      isInstanceAdmin: true,
      source: "api_key",
    });
    const res = await request(app).get("/api/admin/users");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("admits an api_key board actor to the company access summary route", async () => {
    // /api/companies/:companyId/members needs deeper DB joins the stub
    // backend doesn't model; cover the same bypass on the simpler
    // company-access summary route, which exercises `loadCompanyAccessSummary`
    // (the early return added in wave196) and returns a deterministic stub.
    const app = await buildAppWithActor({
      type: "board",
      userId: "paperclip-concierge",
      userName: "Paperclip Board Concierge",
      userEmail: null,
      isInstanceAdmin: true,
      source: "api_key",
    });
    const res = await request(app)
      .get("/api/companies/company-1/access-summary")
      .query({ userId: "paperclip-concierge" });
    // Stub db returns empty membership rows, so we only assert the bypass
    // passed the auth check (anything but 401/403 means the concierge was
    // admitted past `loadCompanyAccessSummary`'s owner short-circuit).
    expect([401, 403]).not.toContain(res.status);
  });
});
