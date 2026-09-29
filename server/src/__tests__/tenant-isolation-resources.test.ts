import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { boardConversations, companies, createDb, instanceSettings, issues } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { issueSpecRoutes } from "../routes/issue-specs.ts";
import { boardChatRoutes } from "../routes/board-chat.ts";
import { errorHandler } from "../middleware/error-handler.ts";

/**
 * wave152 (B) — data isolation for the four resource families the brief names:
 * attachment / spec / work_product / conversation.
 *
 * Attachment isolation is already proven by `issue-attachment-routes.test.ts`
 * ("rejects cross-company attachment content reads" → 404, and the
 * cross-issue artifact metadata case). This file closes the remaining gap with
 * executable proof for spec and conversation, against a real Postgres:
 *
 *   - spec:         a board user of company A cannot read or write company B's
 *                   spec (uniform 404, no existence oracle).
 *   - conversation: a board user of company A cannot list company B's
 *                   conversations (403 — the company id is a route parameter,
 *                   not a resource id, so there is no oracle to protect).
 *
 * work_product routes go through the same `getAccessibleResource` helper as
 * attachments, and are covered by the shared anti-oracle unit tests in
 * `security-tenant-isolation-invariants.test.ts`.
 */
const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres tenant-isolation tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

const COMPANY_A_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_B_ID = "22222222-2222-4222-8222-222222222222";

describeEmbeddedPostgres("tenant isolation: spec / conversation (wave152 B)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let app!: express.Express;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-tenant-resources-");
    db = createDb(tempDb.connectionString);
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { actor: unknown }).actor = {
        type: "board",
        source: "session",
        userId: "alice",
        isInstanceAdmin: false,
        companyIds: [COMPANY_A_ID],
        memberships: [
          { companyId: COMPANY_A_ID, status: "active", membershipRole: "editor" },
        ],
      };
      next();
    });
    app.use("/api", issueSpecRoutes(db));
    app.use(
      "/api",
      boardChatRoutes(db, { deploymentMode: "local_trusted" }),
    );
    app.use(errorHandler);
  }, 30_000);

  afterEach(async () => {
    await db.delete(boardConversations);
    await db.delete(issues);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seed() {
    await db.insert(companies).values([
      { id: COMPANY_A_ID, name: "A", issuePrefix: "AA", requireBoardApprovalForNewAgents: false },
      { id: COMPANY_B_ID, name: "B", issuePrefix: "BB", requireBoardApprovalForNewAgents: false },
    ]);
    // A seeded singleton row already exists (a migration inserts it), so update
    // it in place; insert only when the table is empty.
    const updated = await db
      .update(instanceSettings)
      .set({ experimental: { enableConferenceRoomChat: true }, updatedAt: new Date() })
      .returning({ id: instanceSettings.id });
    if (updated.length === 0) {
      await db
        .insert(instanceSettings)
        .values({ experimental: { enableConferenceRoomChat: true } });
    }
    const issueInA = randomUUID();
    const issueInB = randomUUID();
    await db.insert(issues).values([
      { id: issueInA, companyId: COMPANY_A_ID, title: "A task", status: "backlog", priority: "medium" },
      { id: issueInB, companyId: COMPANY_B_ID, title: "B secret", status: "backlog", priority: "medium" },
    ]);
    return { issueInA, issueInB };
  }

  it("returns the same 404 for a cross-company spec read as for a missing one", async () => {
    const { issueInA, issueInB } = await seed();

    const own = await request(app).get(`/api/issues/${issueInA}/spec`);
    expect(own.status).toBe(200);

    const cross = await request(app).get(`/api/issues/${issueInB}/spec`);
    const missing = await request(app).get(`/api/issues/${randomUUID()}/spec`);
    expect(cross.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(cross.body).toEqual(missing.body);
    expect(cross.body.error).toBe("Issue not found");
  });

  it("refuses a cross-company spec write", async () => {
    const { issueInB } = await seed();

    const res = await request(app)
      .post(`/api/issues/${issueInB}/spec`)
      .send({
        kind: "requirement",
        requirement: { body: "injected", acceptanceCriteria: ["WHEN x THEN y"] },
      });
    expect(res.status).toBe(404);

    const stored = await db.select().from(issues);
    expect(stored.find((row) => row.id === issueInB)?.spec ?? null).toBeNull();
  });

  it("refuses to list another company's conversations", async () => {
    await seed();
    await db.insert(boardConversations).values({
      companyId: COMPANY_B_ID,
      title: "B private thread",
    });

    const cross = await request(app).get(`/api/companies/${COMPANY_B_ID}/board/conversations`);
    expect(cross.status).toBe(403);

    const own = await request(app).get(`/api/companies/${COMPANY_A_ID}/board/conversations`);
    expect(own.status).toBe(200);
    expect(own.body).toEqual([]);
  });
});
