import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { auditLog, companies, createDb, issues } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { auditLogRoutes } from "../routes/audit-log.ts";
import { auditService } from "../services/audit.ts";
import { issueService } from "../services/issues.ts";
import { errorHandler } from "../middleware/error-handler.ts";
import { auditActorFromRequest, pickFields } from "../middleware/audit.ts";

/**
 * wave152 governance audit trail end to end against the real schema.
 *
 * Proves three things the brief asks for:
 *   1. the `audit_log` table round-trips before/after snapshots,
 *   2. `GET /api/companies/:companyId/audit-log` filters and is company-scoped,
 *   3. an issue status transition through the real service writes an audit row.
 */
const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres audit-log tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

const COMPANY_A_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_B_ID = "22222222-2222-4222-8222-222222222222";

function boardActor(companyIds: string[]) {
  return {
    type: "board" as const,
    source: "session" as const,
    userId: "alice",
    isInstanceAdmin: false,
    companyIds,
    memberships: companyIds.map((companyId) => ({
      companyId,
      status: "active" as const,
      membershipRole: "editor" as const,
    })),
  };
}

function mountApp(
  db: ReturnType<typeof createDb>,
  actor: Record<string, unknown>,
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { actor: unknown }).actor = actor;
    next();
  });
  app.use("/api", auditLogRoutes(db));
  app.use(errorHandler);
  return app;
}

describeEmbeddedPostgres("audit log (wave152)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-audit-log-");
    db = createDb(tempDb.connectionString);
  }, 30_000);

  afterEach(async () => {
    await db.delete(auditLog);
    await db.delete(issues);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompany(id: string, prefix: string) {
    await db.insert(companies).values({
      id,
      name: `Company ${prefix}`,
      issuePrefix: prefix,
      requireBoardApprovalForNewAgents: false,
    });
  }

  it("round-trips before/after through the service and reads them back filtered", async () => {
    await seedCompany(COMPANY_A_ID, "AA");
    const svc = auditService(db);

    await svc.write(
      { companyId: COMPANY_A_ID, actorUserId: "alice", actorAgentId: null },
      "issue.status_changed",
      { type: "issue", id: "issue-1" },
      { status: "backlog" },
      { status: "todo" },
    );
    await svc.write(
      { companyId: COMPANY_A_ID, actorUserId: null, actorAgentId: null },
      "board_conversation.created",
      { type: "board_conversation", id: "conv-1" },
      null,
      { title: "Kickoff" },
    );

    const app = mountApp(db, boardActor([COMPANY_A_ID]));

    const all = await request(app).get(`/api/companies/${COMPANY_A_ID}/audit-log`);
    expect(all.status).toBe(200);
    expect(all.body.items).toHaveLength(2);
    expect(all.body.nextCursor).toBeNull();

    const filtered = await request(app).get(
      `/api/companies/${COMPANY_A_ID}/audit-log?action=issue.status_changed`,
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].targetType).toBe("issue");
    expect(filtered.body.items[0].before).toEqual({ status: "backlog" });
    expect(filtered.body.items[0].after).toEqual({ status: "todo" });
    expect(filtered.body.items[0].actorUserId).toBe("alice");

    const byTarget = await request(app).get(
      `/api/companies/${COMPANY_A_ID}/audit-log?targetType=board_conversation`,
    );
    expect(byTarget.body.items).toHaveLength(1);
    expect(byTarget.body.items[0].after).toEqual({ title: "Kickoff" });
    expect(byTarget.body.items[0].before).toBeNull();
  });

  it("is board-only and company-scoped (no cross-company read)", async () => {
    await seedCompany(COMPANY_A_ID, "AA");
    await seedCompany(COMPANY_B_ID, "BB");

    const agentApp = mountApp(db, {
      type: "agent",
      agentId: "agent-1",
      companyId: COMPANY_A_ID,
    });
    const agentRes = await request(agentApp).get(`/api/companies/${COMPANY_A_ID}/audit-log`);
    expect(agentRes.status).toBe(403);

    const boardOfA = mountApp(db, boardActor([COMPANY_A_ID]));
    const ownRes = await request(boardOfA).get(`/api/companies/${COMPANY_A_ID}/audit-log`);
    expect(ownRes.status).toBe(200);

    const crossRes = await request(boardOfA).get(`/api/companies/${COMPANY_B_ID}/audit-log`);
    expect(crossRes.status).toBe(403);
  });

  it("writes an audit row for a real issue status transition via the service", async () => {
    await seedCompany(COMPANY_A_ID, "AA");
    const issueId = randomUUID();
    await db.insert(issues).values({
      id: issueId,
      companyId: COMPANY_A_ID,
      title: "Ship the thing",
      status: "backlog",
      priority: "medium",
    });

    const updated = await issueService(db).update(issueId, {
      status: "todo",
      actorUserId: "alice",
    });
    expect(updated?.status).toBe("todo");

    const rows = await db.select().from(auditLog);
    const statusRows = rows.filter((row) => row.action === "issue.status_changed");
    expect(statusRows).toHaveLength(1);
    expect(statusRows[0].companyId).toBe(COMPANY_A_ID);
    expect(statusRows[0].targetId).toBe(issueId);
    expect(statusRows[0].actorUserId).toBe("alice");
    expect(statusRows[0].before).toEqual({ status: "backlog" });
    expect(statusRows[0].after).toEqual({ status: "todo" });
  });
});

describe("audit helpers", () => {
  it("names the actor for board and agent requests", () => {
    const boardReq = { actor: { type: "board", userId: "u1" } } as unknown as express.Request;
    expect(auditActorFromRequest(boardReq)).toEqual({ actorUserId: "u1", actorAgentId: null });

    const localReq = { actor: { type: "board", source: "local_implicit" } } as unknown as express.Request;
    expect(auditActorFromRequest(localReq)).toEqual({ actorUserId: "local-board", actorAgentId: null });

    const agentReq = { actor: { type: "agent", agentId: "a1", companyId: "c1" } } as unknown as express.Request;
    expect(auditActorFromRequest(agentReq)).toEqual({ actorUserId: null, actorAgentId: "a1" });
  });

  it("picks only present fields", () => {
    expect(pickFields({ a: 1, b: 2 }, ["a", "c"])).toEqual({ a: 1 });
    expect(pickFields({}, ["a"])).toBeNull();
    expect(pickFields(null, ["a"])).toBeNull();
  });
});
