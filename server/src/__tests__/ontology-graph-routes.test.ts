import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  agents,
  assets,
  boardConversations,
  companies,
  createDb,
  entityRelations,
  issueAttachments,
  issueWorkProducts,
  issues,
  projects,
} from "@paperclipai/db";
import { eq } from "drizzle-orm";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { ontologyGraphRoutes } from "../routes/ontology-graph.ts";
import { errorHandler } from "../middleware/error-handler.ts";

/**
 * Ontology graph routes end to end (wave154) against the real schema.
 *
 * Seeds the objects and the links the backfill/runtime would produce, then walks
 * the graph, searches paths and reads stats through a real Express mount. This
 * proves the migration's table and the service's traversal agree on the wire
 * shape, not merely that they compile.
 */
const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres ontology-graph tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("ontology graph routes (wave154)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let app!: express.Express;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-ontology-graph-");
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
    app.use("/api", ontologyGraphRoutes(db));
    app.use(errorHandler);
  }, 30_000);

  afterEach(async () => {
    // assets has no cascade to companies, so it must go first (its delete
    // cascades the issue_attachments rows). issue_work_products cascade from
    // issues; agents are referenced by issues so they precede companies;
    // board_conversations and entity_relations cascade from companies.
    await db.delete(assets);
    await db.delete(activityLog);
    await db.delete(issues);
    await db.delete(agents);
    await db.delete(projects);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompany(name: string) {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name,
      issuePrefix: `W${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    return companyId;
  }

  async function link(input: {
    companyId: string;
    srcType: string;
    srcId: string;
    relation: string;
    targetType: string;
    targetId: string;
    weight?: number;
  }) {
    await db.insert(entityRelations).values({ ...input, weight: input.weight ?? 1 });
  }

  it("walks a project subgraph, searches a path, and reports stats", async () => {
    const companyId = await seedCompany("Ontology");
    const projectId = randomUUID();
    await db.insert(projects).values({ id: projectId, companyId, name: "产融" });

    const parentIssueId = randomUUID();
    const specIssueId = randomUUID();
    await db.insert(issues).values([
      { id: parentIssueId, companyId, projectId, title: "Parent task", status: "todo", priority: "medium" },
      {
        id: specIssueId,
        companyId,
        projectId,
        title: "Requirement spec",
        status: "backlog",
        priority: "medium",
        specKind: "requirement",
        spec: { kind: "requirement", requirement: { body: "x", acceptanceCriteria: [] } },
      },
    ]);

    const workProductId = randomUUID();
    await db.insert(issueWorkProducts).values({
      id: workProductId,
      companyId,
      projectId,
      issueId: parentIssueId,
      type: "attachment",
      provider: "local",
      title: "Deliverable",
      status: "ready",
    });

    const assetId = randomUUID();
    await db.insert(assets).values({
      id: assetId,
      companyId,
      provider: "local",
      objectKey: `key-${assetId}`,
      contentType: "text/plain",
      byteSize: 3,
      sha256: "abc",
      originalFilename: "notes.txt",
    });
    const attachmentId = randomUUID();
    await db.insert(issueAttachments).values({ id: attachmentId, companyId, issueId: parentIssueId, assetId });

    const conversationId = randomUUID();
    await db.insert(boardConversations).values({
      id: conversationId,
      companyId,
      projectId,
      issueId: parentIssueId,
      title: "Board Operations",
    });

    await link({ companyId, srcType: "issue", srcId: parentIssueId, relation: "belongs_to", targetType: "project", targetId: projectId, weight: 3 });
    await link({ companyId, srcType: "spec", srcId: specIssueId, relation: "belongs_to", targetType: "project", targetId: projectId, weight: 2 });
    await link({ companyId, srcType: "work_product", srcId: workProductId, relation: "attached_to", targetType: "issue", targetId: parentIssueId });
    await link({ companyId, srcType: "attachment", srcId: attachmentId, relation: "attached_to", targetType: "issue", targetId: parentIssueId });
    await link({ companyId, srcType: "issue", srcId: parentIssueId, relation: "discussed_in", targetType: "conversation", targetId: conversationId });

    const graph = await request(app).get(
      `/api/companies/${companyId}/ontology/graph?root_type=project&root_id=${projectId}&depth=3`,
    );
    expect(graph.status).toBe(200);
    const types = new Set((graph.body.nodes as Array<{ type: string }>).map((node) => node.type));
    for (const expected of ["project", "issue", "spec", "work_product", "attachment", "conversation"]) {
      expect(types.has(expected)).toBe(true);
    }
    expect(graph.body.edges).toHaveLength(5);
    // The spec node shares its issue's id but must not fuse with the issue node.
    const specNode = (graph.body.nodes as Array<{ type: string; label: string }>).find((node) => node.type === "spec");
    expect(specNode?.label).toContain("需求");

    const paths = await request(app).get(
      `/api/companies/${companyId}/ontology/paths?src_type=work_product&src_id=${workProductId}&target_type=conversation&target_id=${conversationId}`,
    );
    expect(paths.status).toBe(200);
    expect(paths.body.paths).toHaveLength(1);
    expect(paths.body.paths[0].length).toBe(2);

    const stats = await request(app).get(`/api/companies/${companyId}/ontology/stats`);
    expect(stats.status).toBe(200);
    const counts = Object.fromEntries(
      (stats.body.nodeCounts as Array<{ entityType: string; count: number }>).map((entry) => [entry.entityType, entry.count]),
    );
    expect(counts.issue).toBe(2);
    expect(counts.spec).toBe(1);
    expect(counts.project).toBe(1);
    expect(counts.conversation).toBe(1);
    expect(stats.body.totalRelations).toBe(5);
  });

  it("never returns another company's objects through the graph route", async () => {
    const companyId = await seedCompany("OntologyA");
    const otherCompanyId = await seedCompany("OntologyB");
    const otherProjectId = randomUUID();
    await db.insert(projects).values({ id: otherProjectId, companyId: otherCompanyId, name: "Other" });
    const otherIssueId = randomUUID();
    await db.insert(issues).values({ id: otherIssueId, companyId: otherCompanyId, projectId: otherProjectId, title: "Other issue", status: "todo", priority: "medium" });
    await link({ companyId: otherCompanyId, srcType: "issue", srcId: otherIssueId, relation: "belongs_to", targetType: "project", targetId: otherProjectId });

    const graph = await request(app).get(
      `/api/companies/${companyId}/ontology/graph?root_type=issue&root_id=${otherIssueId}&depth=3`,
    );
    expect(graph.status).toBe(200);
    expect(graph.body.edges).toHaveLength(0);
    // The foreign object is not hydrated: only a bare placeholder for the root.
    expect(graph.body.nodes.every((node: { label: string }) => !node.label.includes("Other issue"))).toBe(true);
  });

  it("rejects a malformed query and an unsupported depth", async () => {
    const companyId = await seedCompany("OntologyC");
    const badRoot = await request(app).get(
      `/api/companies/${companyId}/ontology/graph?root_type=project&root_id=not-a-uuid`,
    );
    expect(badRoot.status).toBe(400);

    const badDepth = await request(app).get(
      `/api/companies/${companyId}/ontology/graph?root_type=project&root_id=${randomUUID()}&depth=9`,
    );
    expect(badDepth.status).toBe(400);
  });

  it("wave237: GET /ontology/graph without a root returns a flat company snapshot", async () => {
    const companyId = await seedCompany("OntologyDefault");
    const projectId = randomUUID();
    await db.insert(projects).values({ id: projectId, companyId, name: "Snap" });
    const issueId = randomUUID();
    await db.insert(issues).values({
      id: issueId,
      companyId,
      projectId,
      title: "Snap issue",
      status: "todo",
      priority: "medium",
    });
    await link({
      companyId,
      srcType: "issue",
      srcId: issueId,
      relation: "belongs_to",
      targetType: "project",
      targetId: projectId,
      weight: 1,
    });

    // No params at all — the 17-endpoint smoke probe lands here.
    const flat = await request(app).get(`/api/companies/${companyId}/ontology/graph`);
    expect(flat.status).toBe(200);
    expect(flat.body.root).toBeNull();
    expect(flat.body.edges.length).toBeGreaterThanOrEqual(1);
    // Hydrated nodes for both endpoints must be present.
    const nodeTypes = new Set((flat.body.nodes as Array<{ type: string }>).map((n) => n.type));
    expect(nodeTypes.has("project")).toBe(true);
    expect(nodeTypes.has("issue")).toBe(true);

    // Providing only one of root_type/root_id is still a 400 (must travel together).
    const halfRoot = await request(app).get(
      `/api/companies/${companyId}/ontology/graph?root_type=project`,
    );
    expect(halfRoot.status).toBe(400);
  });

  it("derives the implied links from existing rows and is idempotent (wave155)", async () => {
    const companyId = await seedCompany("Backfill");
    const projectId = randomUUID();
    await db.insert(projects).values({ id: projectId, companyId, name: "产融" });

    const agentId = randomUUID();
    await db.insert(agents).values({ id: agentId, companyId, name: "产品经理", role: "pm" });

    const issueId = randomUUID();
    await db.insert(issues).values({
      id: issueId,
      companyId,
      projectId,
      title: "Parent task",
      status: "todo",
      priority: "medium",
      assigneeAgentId: agentId,
    });

    const specIssueId = randomUUID();
    await db.insert(issues).values({
      id: specIssueId,
      companyId,
      projectId,
      title: "Requirement spec",
      status: "backlog",
      priority: "medium",
      specKind: "requirement",
      spec: { kind: "requirement", requirement: { body: "x", acceptanceCriteria: [] } },
    });

    await db.insert(issueWorkProducts).values({
      id: randomUUID(),
      companyId,
      projectId,
      issueId,
      type: "attachment",
      provider: "local",
      title: "Deliverable",
      status: "ready",
    });

    const assetId = randomUUID();
    await db.insert(assets).values({
      id: assetId,
      companyId,
      provider: "local",
      objectKey: `key-${assetId}`,
      contentType: "text/plain",
      byteSize: 3,
      sha256: "abc",
      originalFilename: "notes.txt",
    });
    await db.insert(issueAttachments).values({
      id: randomUUID(),
      companyId,
      issueId,
      assetId,
    });

    await db.insert(boardConversations).values({
      id: randomUUID(),
      companyId,
      projectId,
      issueId,
      title: "Board Operations",
    });

    // Nothing has been linked yet — the objects exist but were never related.
    const before = await request(app).get(`/api/companies/${companyId}/ontology/stats`);
    expect(before.body.totalRelations).toBe(0);

    // issue→project ×2 (both the task and the spec issue carry the project),
    // spec→project, work_product→issue, attachment→issue, conversation→project,
    // issue→conversation, issue→agent = 8 edges.
    const first = await request(app).post(`/api/companies/${companyId}/ontology/backfill`);
    expect(first.status).toBe(200);
    expect(first.body.totalInserted).toBe(8);
    expect(first.body.totalRelations).toBe(8);
    const relations = Object.fromEntries(
      (first.body.buckets as Array<{ relation: string; inserted: number }>).map((b) => [b.relation, b.inserted]),
    );
    expect(relations.attached_to).toBe(2);
    expect(relations.assigned_to).toBe(1);

    // A second pass writes nothing: the edge key makes re-runs a no-op.
    const second = await request(app).post(`/api/companies/${companyId}/ontology/backfill`);
    expect(second.status).toBe(200);
    expect(second.body.totalInserted).toBe(0);
    expect(second.body.totalRelations).toBe(8);
  });

  it("labels agent nodes and narrows the graph by preset view (wave155)", async () => {
    const companyId = await seedCompany("AgentView");
    const projectId = randomUUID();
    await db.insert(projects).values({ id: projectId, companyId, name: "产融" });

    const agentId = randomUUID();
    await db.insert(agents).values({ id: agentId, companyId, name: "产品经理", role: "pm" });

    const issueId = randomUUID();
    await db.insert(issues).values({
      id: issueId,
      companyId,
      projectId,
      title: "Owned task",
      status: "todo",
      priority: "medium",
      assigneeAgentId: agentId,
    });
    await link({ companyId, srcType: "issue", srcId: issueId, relation: "belongs_to", targetType: "project", targetId: projectId, weight: 3 });
    await link({ companyId, srcType: "issue", srcId: issueId, relation: "assigned_to", targetType: "agent", targetId: agentId, weight: 2 });

    const graph = await request(app).get(
      `/api/companies/${companyId}/ontology/graph?root_type=agent&root_id=${agentId}&view=agent_dashboard`,
    );
    expect(graph.status).toBe(200);
    expect(graph.body.view).toBe("agent_dashboard");
    expect(graph.body.depth).toBe(2);
    const agentNode = (graph.body.nodes as Array<{ type: string; label: string }>).find((node) => node.type === "agent");
    // A real name, never a truncated uuid.
    expect(agentNode?.label).toBe("产品经理");
  });

  // wave156 (audit remediation): a Board backfill writes one activity log
  // entry; an agent caller gets a 403 instead.
  it("wave156: backfill writes an ontology.backfill activity log entry", async () => {
    const companyId = await seedCompany("Audit");

    const res = await request(app).post(`/api/companies/${companyId}/ontology/backfill`);
    expect(res.status).toBe(200);

    const rows = await db
      .select()
      .from(activityLog)
      .where(eq(activityLog.action, "ontology.backfill"));
    const ourRow = rows.find((row) => row.companyId === companyId);
    expect(ourRow).toBeDefined();
    expect(ourRow?.entityType).toBe("company");
    expect(ourRow?.entityId).toBe(companyId);
  });

  it("wave156: agent API key is rejected with 403 on /backfill", async () => {
    const companyId = await seedCompany("AgentAudit");

    const agentApp = express();
    agentApp.use(express.json());
    agentApp.use((req, _res, next) => {
      (req as unknown as { actor: unknown }).actor = {
        type: "agent",
        source: "agent_key",
        actorId: "agent-audit",
        companyId,
        agentId: "agent-audit",
        onBehalfOfUserId: null,
      };
      next();
    });
    agentApp.use("/api", ontologyGraphRoutes(db));
    agentApp.use(errorHandler);

    const res = await request(agentApp)
      .post(`/api/companies/${companyId}/ontology/backfill`);
    expect(res.status).toBe(403);
  });
});
