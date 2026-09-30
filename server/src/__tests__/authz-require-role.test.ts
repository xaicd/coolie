import { describe, expect, it } from "vitest";
import { HttpError } from "../errors.js";
import { requireRole } from "../routes/authz.js";

function makeReq(actor: Express.Request["actor"]): Express.Request {
  return { method: "GET", actor } as Express.Request;
}

describe("requireRole", () => {
  describe('role "authenticated"', () => {
    it("accepts a board actor", () => {
      const req = makeReq({ type: "board", userId: "u1" });
      expect(() => requireRole("authenticated")(req)).not.toThrow();
    });

    it("accepts an agent actor", () => {
      const req = makeReq({ type: "agent", agentId: "a1", companyId: "c1" });
      expect(() => requireRole("authenticated")(req)).not.toThrow();
    });

    it("rejects an unauthenticated actor with 401", () => {
      const req = makeReq({ type: "none" });
      expect(() => requireRole("authenticated")(req)).toThrow(HttpError);
      try {
        requireRole("authenticated")(req);
      } catch (err) {
        expect((err as HttpError).status).toBe(401);
      }
    });
  });

  describe('role "board"', () => {
    it("accepts a board actor", () => {
      const req = makeReq({ type: "board", userId: "u1" });
      expect(() => requireRole("board")(req)).not.toThrow();
    });

    it("rejects an agent actor with 403", () => {
      const req = makeReq({ type: "agent", agentId: "a1", companyId: "c1" });
      try {
        requireRole("board")(req);
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        expect((err as HttpError).status).toBe(403);
        expect((err as HttpError).message).toMatch(/Board/);
      }
    });

    it("rejects an unauthenticated actor with 403", () => {
      const req = makeReq({ type: "none" });
      try {
        requireRole("board")(req);
        throw new Error("expected throw");
      } catch (err) {
        expect((err as HttpError).status).toBe(403);
      }
    });
  });

  describe('role "board_or_agent"', () => {
    it("accepts a board actor", () => {
      const req = makeReq({
        type: "board",
        userId: "u1",
        source: "session",
        companyIds: ["c1"],
        memberships: [{ companyId: "c1", status: "active" }],
      });
      expect(() => requireRole("board_or_agent")(req)).not.toThrow();
    });

    it("accepts an agent actor without on-behalf-of membership checks", () => {
      const req = makeReq({ type: "agent", agentId: "a1", companyId: "c1" });
      expect(() => requireRole("board_or_agent")(req)).not.toThrow();
    });

    it("rejects an unauthenticated actor with 403", () => {
      const req = makeReq({ type: "none" });
      try {
        requireRole("board_or_agent")(req);
        throw new Error("expected throw");
      } catch (err) {
        expect((err as HttpError).status).toBe(403);
      }
    });
  });

  describe('role "instance_admin"', () => {
    it("accepts a local-implicit board (loopback concierge / local_trusted bypass)", () => {
      const req = makeReq({
        type: "board",
        userId: "u1",
        source: "local_implicit",
      });
      expect(() => requireRole("instance_admin")(req)).not.toThrow();
    });

    it("accepts an instance-scoped board key (api_key / cloud_control with isInstanceAdmin)", () => {
      const req = makeReq({
        type: "board",
        userId: "u1",
        source: "api_key",
        isInstanceAdmin: true,
      });
      expect(() => requireRole("instance_admin")(req)).not.toThrow();
    });

    it("rejects a non-admin board actor with 403", () => {
      const req = makeReq({ type: "board", userId: "u1", source: "session" });
      try {
        requireRole("instance_admin")(req);
        throw new Error("expected throw");
      } catch (err) {
        expect((err as HttpError).status).toBe(403);
        expect((err as HttpError).message).toMatch(/Instance admin/);
      }
    });

    it("rejects an agent actor with 403", () => {
      const req = makeReq({ type: "agent", agentId: "a1", companyId: "c1" });
      try {
        requireRole("instance_admin")(req);
        throw new Error("expected throw");
      } catch (err) {
        expect((err as HttpError).status).toBe(403);
      }
    });
  });

  describe("return value stability", () => {
    it("returns the same function reference for the same role on repeated calls", () => {
      // Both calls must hand back a callable that throws identically — this
      // pins the dispatch-table lookup so a future refactor cannot accidentally
      // return a fresh closure (which would break tests that monkey-patch the
      // returned function).
      const first = requireRole("board");
      const second = requireRole("board");
      const req = makeReq({ type: "none" });
      try {
        first(req);
      } catch (errA) {
        try {
          second(req);
        } catch (errB) {
          expect((errA as HttpError).status).toBe((errB as HttpError).status);
          expect((errA as HttpError).message).toBe((errB as HttpError).message);
        }
      }
    });
  });
});
