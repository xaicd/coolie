import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  companies,
  createDb,
  issueWorkProducts,
  issues,
  projects,
} from "@paperclipai/db";
import { eq } from "drizzle-orm";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { workProductsRoutes } from "../routes/work-products.ts";
import { errorHandler } from "../middleware/error-handler.ts";

/**
 * Work-products routes end-to-end (wave215 + wave237 top-level alias).
 *
 * wave215 added `/work-products`, `/work-products/:id`, and
 * `/work-products/artifacts/code`. wave237 added the top-level
 * `/artifacts/code` alias so the 17-endpoint smoke probe (which calls
 * `/api/companies/:cid/artifacts/code` directly) gets 200 instead of 404.
 *
 * Both paths share the same `type="code"` filter and the same response
 * shape; this test asserts both paths return identical rows for the same
 * company state.
 */
const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres work-products route tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("work-products routes (wave215 + wave237 alias)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let app!: express.Express;
  let companyId: string;
  let agentId: string;
  let issueId: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-work-products-");
    db = createDb(tempDb.connectionString);
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { actor: unknown }).actor = {
        type: "board",
        source: "local_implicit",
        actorId: "test-board",
        companyIds: [],
      };
      next();
    });
    app.use("/api", workProductsRoutes(db));
    app.use(errorHandler);

    companyId = randomUUID();
    agentId = randomUUID();
    issueId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Work Products Co",
      issuePrefix: `W${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Test Worker",
      role: "engineer",
      adapter: "test",
      status: "active",
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Carrier issue",
      status: "todo",
      priority: "medium",
      assigneeAgentId: agentId,
    });

    // Seed: 2 code-type + 1 attachment-type work products.
    await db.insert(issueWorkProducts).values([
      {
        id: randomUUID(),
        companyId,
        issueId,
        type: "code",
        provider: "github",
        title: "PR #101",
        status: "ready",
        versionNumber: 1,
        isLatest: true,
      },
      {
        id: randomUUID(),
        companyId,
        issueId,
        type: "code",
        provider: "github",
        title: "Commit abc123",
        status: "ready",
        versionNumber: 1,
        isLatest: true,
      },
      {
        id: randomUUID(),
        companyId,
        issueId,
        type: "attachment",
        provider: "local",
        title: "Screenshot.png",
        status: "ready",
        versionNumber: 1,
        isLatest: true,
      },
    ]);
  }, 30_000);

  afterEach(async () => {
    // No mutations in this suite beyond the seeded inserts.
  });

  afterAll(async () => {
    await db.delete(issueWorkProducts).where(eq(issueWorkProducts.companyId, companyId));
    await db.delete(issues).where(eq(issues.companyId, companyId));
    await db.delete(agents).where(eq(agents.companyId, companyId));
    await db.delete(projects).where(eq(projects.companyId, companyId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await tempDb?.cleanup();
  });

  it("GET /work-products returns all three work-products", async () => {
    const res = await request(app).get(`/api/companies/${companyId}/work-products`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(3);
  });

  it("GET /work-products?type=code filters to code rows", async () => {
    const res = await request(app).get(`/api/companies/${companyId}/work-products?type=code`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(2);
    for (const item of res.body.items) expect(item.type).toBe("code");
  });

  it("GET /work-products/artifacts/code (wave215) returns the same code rows", async () => {
    const res = await request(app).get(`/api/companies/${companyId}/work-products/artifacts/code`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(2);
    for (const item of res.body.items) expect(item.type).toBe("code");
  });

  it("wave237: GET /artifacts/code (top-level alias) returns the same code rows", async () => {
    const res = await request(app).get(`/api/companies/${companyId}/artifacts/code`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(2);
    for (const item of res.body.items) expect(item.type).toBe("code");
  });

  it("wave237: the two artifacts/code paths return identical item ids", async () => {
    const sub = await request(app).get(`/api/companies/${companyId}/work-products/artifacts/code`);
    const top = await request(app).get(`/api/companies/${companyId}/artifacts/code`);
    expect(sub.status).toBe(200);
    expect(top.status).toBe(200);
    const subIds = sub.body.items.map((i: { id: string }) => i.id).sort();
    const topIds = top.body.items.map((i: { id: string }) => i.id).sort();
    expect(subIds).toEqual(topIds);
  });
});
