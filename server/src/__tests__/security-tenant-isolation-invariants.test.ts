import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertCompanyAccess,
  hasCompanyAccess,
  getAccessibleResource,
  assertBoardOrAgent,
  assertInstanceAdmin,
} from "../routes/authz.js";
import { HttpError } from "../errors.js";

vi.unmock("http");
vi.unmock("node:http");

/**
 * Palantir FDA (Forward Deployed Architect) & DevSecOps Security Invariants Suite:
 *
 * Core Engineering Rules:
 * 1. Company boundaries MUST be strictly enforced across all routes/services.
 * 2. Cross-company access attempts MUST fail closed (403 for unauthorized company access,
 *    404 for resource queries to prevent tenant existence oracle leaks).
 * 3. Role-based access control (RBAC): Viewer role cannot perform mutating operations.
 * 4. Agent API keys cannot perform operations outside their bound companyId.
 */

const COMPANY_A_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_B_ID = "22222222-2222-4222-8222-222222222222";
const RESOURCE_A_ID = "33333333-3333-4333-8333-333333333333";
const RESOURCE_B_ID = "44444444-4444-4444-8444-444444444444";

const mockGoalService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());
const mockGetTelemetryClient = vi.hoisted(() => vi.fn());

vi.mock("@paperclipai/shared/telemetry", () => ({
  trackGoalCreated: vi.fn(),
}));

vi.mock("../telemetry.js", () => ({
  getTelemetryClient: mockGetTelemetryClient,
}));

vi.mock("../services/index.js", () => ({
  goalService: () => mockGoalService,
  logActivity: mockLogActivity,
}));

let routeModules:
  | Promise<[
      typeof import("../middleware/index.js"),
      typeof import("../routes/goals.js"),
    ]>
  | null = null;

async function loadRouteModules() {
  routeModules ??= Promise.all([
    import("../middleware/index.js"),
    import("../routes/goals.js"),
  ]);
  return routeModules;
}

async function createApp(actor: Record<string, unknown>) {
  const [{ errorHandler }, { goalRoutes }] = await loadRouteModules();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = { ...actor };
    next();
  });
  app.use("/api", goalRoutes({} as any));
  app.use(errorHandler);
  return app;
}

async function requestApp(
  app: express.Express,
  buildRequest: (baseUrl: string) => request.Test,
) {
  const { createServer } = await vi.importActual<typeof import("node:http")>("node:http");
  const server = createServer(app);
  try {
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected HTTP server to listen on a TCP port");
    }
    return await buildRequest(`http://127.0.0.1:${address.port}`);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  }
}

describe.sequential("Security Invariant: Multi-Tenant Company Isolation & Anti-Oracle Defense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
    mockGetTelemetryClient.mockReturnValue({ track: vi.fn() });
    mockGoalService.list.mockResolvedValue([]);
    mockGoalService.getById.mockImplementation(async (id: string) => {
      if (id === RESOURCE_A_ID) {
        return {
          id: RESOURCE_A_ID,
          companyId: COMPANY_A_ID,
          level: "company",
          title: "Company A Strategic Objective",
        };
      }
      if (id === RESOURCE_B_ID) {
        return {
          id: RESOURCE_B_ID,
          companyId: COMPANY_B_ID,
          level: "company",
          title: "Company B Confidential Roadmap",
        };
      }
      return null;
    });
    mockGoalService.create.mockResolvedValue({
      id: "new-goal-id",
      companyId: COMPANY_A_ID,
      title: "New Goal",
    });
  });

  describe("Invariant 1: Direct Authz Gate Checks", () => {
    it("strictly blocks an Agent key belonging to Company A from accessing Company B", () => {
      const agentReq = {
        method: "GET",
        actor: {
          type: "agent",
          agentId: "agent-1",
          companyId: COMPANY_A_ID,
        },
      } as unknown as express.Request;

      // Accessing same company should succeed
      expect(() => assertCompanyAccess(agentReq, COMPANY_A_ID)).not.toThrow();

      // Accessing another company must throw 403 Forbidden
      expect(() => assertCompanyAccess(agentReq, COMPANY_B_ID)).toThrow(
        "Agent key cannot access another company",
      );
    });

    it("strictly blocks Board members without target company membership", () => {
      const boardReq = {
        method: "GET",
        actor: {
          type: "board",
          userId: "user-alice",
          source: "session",
          companyIds: [COMPANY_A_ID],
          memberships: [
            { companyId: COMPANY_A_ID, status: "active", membershipRole: "editor" },
          ],
        },
      } as unknown as express.Request;

      expect(() => assertCompanyAccess(boardReq, COMPANY_A_ID)).not.toThrow();
      expect(() => assertCompanyAccess(boardReq, COMPANY_B_ID)).toThrow(
        "User does not have access to this company",
      );
    });

    it("strictly blocks mutating operations from Viewer role while allowing read operations", () => {
      const viewerReqGet = {
        method: "GET",
        actor: {
          type: "board",
          userId: "viewer-bob",
          source: "session",
          companyIds: [COMPANY_A_ID],
          memberships: [
            { companyId: COMPANY_A_ID, status: "active", membershipRole: "viewer" },
          ],
        },
      } as unknown as express.Request;

      const viewerReqPost = {
        method: "POST",
        actor: {
          type: "board",
          userId: "viewer-bob",
          source: "session",
          companyIds: [COMPANY_A_ID],
          memberships: [
            { companyId: COMPANY_A_ID, status: "active", membershipRole: "viewer" },
          ],
        },
      } as unknown as express.Request;

      expect(() => assertCompanyAccess(viewerReqGet, COMPANY_A_ID)).not.toThrow();
      expect(() => assertCompanyAccess(viewerReqPost, COMPANY_A_ID)).toThrow(
        "Viewer access is read-only",
      );
    });

    it("strictly rejects inactive/removed members from performing write actions", () => {
      const removedReq = {
        method: "PATCH",
        actor: {
          type: "board",
          userId: "ex-user",
          source: "session",
          companyIds: [COMPANY_A_ID],
          memberships: [
            { companyId: COMPANY_A_ID, status: "removed", membershipRole: "editor" },
          ],
        },
      } as unknown as express.Request;

      expect(() => assertCompanyAccess(removedReq, COMPANY_A_ID)).toThrow(
        "User does not have active company access",
      );
    });
  });

  describe("Invariant 2: Anti-Oracle Defense (Uniform 404 across Tenants)", () => {
    it("returns identical 404 response when querying a non-existent resource vs cross-company resource", async () => {
      const companyAActor = {
        type: "board" as const,
        userId: "alice-company-a",
        source: "session" as const,
        companyIds: [COMPANY_A_ID],
        memberships: [
          { companyId: COMPANY_A_ID, status: "active", membershipRole: "editor" },
        ],
      };

      const app = await createApp(companyAActor);

      // Query non-existent resource
      const missingRes = await requestApp(app, (baseUrl) =>
        request(baseUrl).get("/api/goals/00000000-0000-0000-0000-000000000000"),
      );

      // Query cross-company resource (exists in Company B, but Alice is in Company A)
      const crossCompanyRes = await requestApp(app, (baseUrl) =>
        request(baseUrl).get(`/api/goals/${RESOURCE_B_ID}`),
      );

      // Both MUST return 404 Not Found to prevent oracle leak
      expect(missingRes.status).toBe(404);
      expect(crossCompanyRes.status).toBe(404);

      // Both error bodies must be identical ("Goal not found")
      expect(missingRes.body.error).toBe("Goal not found");
      expect(crossCompanyRes.body.error).toBe("Goal not found");

      // Verify that Company A can access its own resource
      const ownRes = await requestApp(app, (baseUrl) =>
        request(baseUrl).get(`/api/goals/${RESOURCE_A_ID}`),
      );
      expect(ownRes.status).toBe(200);
      expect(ownRes.body.id).toBe(RESOURCE_A_ID);
      expect(ownRes.body.companyId).toBe(COMPANY_A_ID);
    });
  });

  describe("Invariant 3: Agent Cross-Company Mutation Denial", () => {
    it("blocks Agent of Company A from creating goals under Company B", async () => {
      const agentAActor = {
        type: "agent" as const,
        agentId: "agent-a",
        companyId: COMPANY_A_ID,
      };

      const app = await createApp(agentAActor);

      const crossPostRes = await requestApp(app, (baseUrl) =>
        request(baseUrl)
          .post(`/api/companies/${COMPANY_B_ID}/goals`)
          .send({ level: "company", title: "Malicious injection" }),
      );

      expect(crossPostRes.status).toBe(403);
      expect(crossPostRes.body.error).toBe("Agent key cannot access another company");
      expect(mockGoalService.create).not.toHaveBeenCalled();
    });

    it("allows Agent of Company A to create goals under Company A", async () => {
      const agentAActor = {
        type: "agent" as const,
        agentId: "agent-a",
        companyId: COMPANY_A_ID,
      };

      const app = await createApp(agentAActor);

      const validPostRes = await requestApp(app, (baseUrl) =>
        request(baseUrl)
          .post(`/api/companies/${COMPANY_A_ID}/goals`)
          .send({ level: "company", title: "Legitimate Goal" }),
      );

      expect(validPostRes.status).toBe(201);
      expect(mockGoalService.create).toHaveBeenCalled();
    });
  });

  describe("Invariant 4: Instance Admin Confinement", () => {
    it("rejects signed-in instance admins without explicit membership from accessing arbitrary companies", () => {
      const adminReq = {
        method: "GET",
        actor: {
          type: "board",
          userId: "super-admin",
          source: "session",
          isInstanceAdmin: true,
          companyIds: [],
          memberships: [],
        },
      } as unknown as express.Request;

      // Instance admins signed in via standard session must not bypass company boundaries
      expect(() => assertCompanyAccess(adminReq, COMPANY_A_ID)).toThrow(
        "User does not have access to this company",
      );
      expect(hasCompanyAccess(adminReq, COMPANY_A_ID)).toBe(false);
    });

    it("permits local_implicit board actor to access company for local development CLI", () => {
      const localReq = {
        method: "GET",
        actor: {
          type: "board",
          source: "local_implicit",
          isInstanceAdmin: true,
        },
      } as unknown as express.Request;

      expect(() => assertCompanyAccess(localReq, COMPANY_A_ID)).not.toThrow();
      expect(hasCompanyAccess(localReq, COMPANY_A_ID)).toBe(true);
    });
  });
});
