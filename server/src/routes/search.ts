import { Router } from "express";
import { and, desc, eq, ilike } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, documents, issues } from "@paperclipai/db";
import { assertBoard, assertCompanyAccess } from "./authz.js";

const MAX_QUERY_LENGTH = 100;
const PER_KIND_LIMIT = 10;

function readParam(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) return "";
  return value.trim();
}

/**
 * Global mobile search across the three things a board user looks for by name:
 * agents, tasks, and documents. Deliberately simpler than the full
 * `/companies/:id/search` (no relevance ranking, filters, or snippet
 * highlights) — the app needs a fast, grouped top-N lookup to jump to a detail
 * screen, not the web search surface.
 */
export function searchRoutes(db: Db) {
  const router = Router();

  router.get("/search", async (req, res) => {
    assertBoard(req);
    const companyId = readParam(req.query.companyId, "companyId");
    if (!companyId) {
      res.status(400).json({ error: "companyId is required" });
      return;
    }
    assertCompanyAccess(req, companyId);

    const q = readParam(req.query.q, "q").slice(0, MAX_QUERY_LENGTH);
    if (q.length === 0) {
      res.json({ query: "", agents: [], tasks: [], documents: [] });
      return;
    }

    const pattern = `%${q}%`;
    const [agentRows, taskRows, documentRows] = await Promise.all([
      db
        .select({ id: agents.id, name: agents.name, role: agents.role, status: agents.status })
        .from(agents)
        .where(and(eq(agents.companyId, companyId), ilike(agents.name, pattern)))
        .orderBy(agents.name)
        .limit(PER_KIND_LIMIT),
      db
        .select({
          id: issues.id,
          title: issues.title,
          status: issues.status,
          priority: issues.priority,
          updatedAt: issues.updatedAt,
        })
        .from(issues)
        .where(and(eq(issues.companyId, companyId), ilike(issues.title, pattern)))
        .orderBy(desc(issues.updatedAt))
        .limit(PER_KIND_LIMIT),
      db
        .select({ id: documents.id, title: documents.title, updatedAt: documents.updatedAt })
        .from(documents)
        .where(and(eq(documents.companyId, companyId), ilike(documents.title, pattern)))
        .orderBy(desc(documents.updatedAt))
        .limit(PER_KIND_LIMIT),
    ]);

    res.json({
      query: q,
      agents: agentRows,
      tasks: taskRows,
      documents: documentRows.map((row) => ({
        id: row.id,
        title: row.title ?? "(未命名文档)",
        updatedAt: row.updatedAt,
      })),
    });
  });

  return router;
}
