import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { agents, companies, createDb, defectKb, issues } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { defectKbRoutes } from "../routes/defect-kb.ts";
import { DEFECT_PLAYBOOK_THRESHOLD, defectFingerprint } from "../services/defect-kb.ts";
import { issueService } from "../services/issues.ts";
import { errorHandler } from "../middleware/error-handler.ts";

/**
 * wave152 (D) — the defect knowledge base and its close hook, against the real
 * schema: three closures of the same defect aggregate onto one fingerprint and
 * open exactly one playbook task.
 */
const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres defect-kb tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

const COMPANY_A_ID = "11111111-1111-4111-8111-111111111111";

describe("defectFingerprint", () => {
  it("collapses whitespace and case, and folds in severity", () => {
    expect(defectFingerprint({ title: "Login  Timeout", severity: "P1" })).toBe(
      defectFingerprint({ title: "  login timeout ", severity: "p1" }),
    );
    // different severity → different fingerprint
    expect(defectFingerprint({ title: "Login timeout", severity: "P1" })).not.toBe(
      defectFingerprint({ title: "Login timeout", severity: "P0" }),
    );
    // different defect → different fingerprint
    expect(defectFingerprint({ title: "Login timeout", severity: "P1" })).not.toBe(
      defectFingerprint({ title: "Signup timeout", severity: "P1" }),
    );
  });
});

describeEmbeddedPostgres("defect KB (wave152 D)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let app!: express.Express;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-defect-kb-");
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
        memberships: [{ companyId: COMPANY_A_ID, status: "active", membershipRole: "editor" }],
      };
      next();
    });
    app.use("/api", defectKbRoutes(db));
    app.use(errorHandler);
  }, 30_000);

  afterEach(async () => {
    await db.delete(defectKb);
    await db.delete(issues);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompany() {
    await db.insert(companies).values({
      id: COMPANY_A_ID,
      name: "A",
      issuePrefix: "AA",
      requireBoardApprovalForNewAgents: false,
    });
  }

  async function seedDefect(title: string) {
    const id = randomUUID();
    await db.insert(issues).values({
      id,
      companyId: COMPANY_A_ID,
      title,
      status: "todo",
      priority: "medium",
      defect: { severity: "P1", source: "web_walkthrough", reproSteps: null, evidenceAttachmentIds: [] },
    });
    return id;
  }

  it("aggregates repeated closures and opens one playbook task at the threshold", async () => {
    await seedCompany();
    const svc = issueService(db);

    // Two closures: aggregate grows, no playbook yet.
    for (let i = 0; i < DEFECT_PLAYBOOK_THRESHOLD - 1; i += 1) {
      const id = await seedDefect("Login  timeout");
      await svc.update(id, { status: "done" });
    }
    const before = await db.select().from(defectKb);
    expect(before).toHaveLength(1);
    expect(before[0].count).toBe(2);
    expect(before[0].playbookTaskId).toBeNull();

    // Third closure hits the threshold.
    const thirdId = await seedDefect("  login timeout ");
    await svc.update(thirdId, { status: "done" });

    const after = await db.select().from(defectKb);
    expect(after).toHaveLength(1);
    expect(after[0].count).toBe(3);
    expect(after[0].suggestedPlaybook).toBeTruthy();
    expect(after[0].playbookTaskId).toBeTruthy();

    // Exactly one playbook task exists, and it is actionable.
    const playbook = await db
      .select()
      .from(issues)
      .then((rows) => rows.filter((row) => row.title.includes("应写 playbook")));
    expect(playbook).toHaveLength(1);
    expect(playbook[0].status).toBe("backlog");
    expect(playbook[0].id).toBe(after[0].playbookTaskId);

    // A fourth closure must NOT open a second playbook task.
    const fourthId = await seedDefect("login TIMEOUT");
    await svc.update(fourthId, { status: "done" });
    const playbookAfterFourth = await db
      .select()
      .from(issues)
      .then((rows) => rows.filter((row) => row.title.includes("应写 playbook")));
    expect(playbookAfterFourth).toHaveLength(1);
  });

  it("does not touch the KB for a non-defect task", async () => {
    await seedCompany();
    const id = randomUUID();
    await db.insert(issues).values({
      id, companyId: COMPANY_A_ID, title: "Ordinary task", status: "todo", priority: "medium",
    });
    await issueService(db).update(id, { status: "done" });
    expect(await db.select().from(defectKb)).toHaveLength(0);
  });

  it("exposes the KB over the API, company-scoped and board-only", async () => {
    await seedCompany();
    const svc = issueService(db);
    const id = await seedDefect("Export fails");
    await svc.update(id, { status: "done" });

    const res = await request(app).get(`/api/companies/${COMPANY_A_ID}/defect-kb`);
    expect(res.status).toBe(200);
    expect(res.body.playbookThreshold).toBe(DEFECT_PLAYBOOK_THRESHOLD);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].count).toBe(1);
    expect(res.body.items[0].fingerprint).toBe(
      defectFingerprint({ title: "Export fails", severity: "P1" }),
    );

    const cross = await request(app).get(
      "/api/companies/22222222-2222-4222-8222-222222222222/defect-kb",
    );
    expect(cross.status).toBe(403);
  });
});
