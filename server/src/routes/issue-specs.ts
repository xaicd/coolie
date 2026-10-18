import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { issues as issueRows } from "@paperclipai/db";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  buildSpecTree,
  createSpecFromTemplateSchema,
  isUuidLike,
  issueSpecDraftSchema,
  issueSpecSchema,
  specTemplateSkeleton,
  specTreeQuerySchema,
  type CreateSpecFromTemplateInput,
  type IssueSpec,
  type IssueSpecKind,
  type SpecTreeRow,
} from "@paperclipai/shared";
import { notFound, unprocessable } from "../errors.js";
import { issueService, logActivity } from "../services/index.js";
import { documentService } from "../services/documents.js";
import { assertCompanyAccess, getAccessibleResource, getActorInfo } from "./authz.js";
import { recordAudit } from "../middleware/audit.js";

const SPEC_TITLES: Record<IssueSpecKind, string> = {
  requirement: "需求：待填写",
  bugfix: "缺陷：待填写",
  design: "设计：待填写",
  task: "任务：待填写",
};

function specToMarkdown(title: string, spec: IssueSpec): string {
  const kind = spec.kind;
  let md = `# ${title}\n\n`;
  md += `> 规格类型: \`${kind}\`\n\n`;
  if (kind === "requirement" && spec.requirement) {
    md += `## 需求描述\n${spec.requirement.body || ""}\n\n`;
    if (Array.isArray(spec.requirement.acceptanceCriteria) && spec.requirement.acceptanceCriteria.length > 0) {
      md += `## 验收准则 (Acceptance Criteria)\n`;
      for (const ac of spec.requirement.acceptanceCriteria) {
        md += `- [ ] ${ac}\n`;
      }
      md += `\n`;
    }
  } else if (kind === "bugfix" && spec.bugfix) {
    md += `## 复现步骤\n${spec.bugfix.reproSteps || ""}\n\n`;
    md += `## 预期行为\n${spec.bugfix.expectedBehavior || ""}\n\n`;
    md += `## 实际行为\n${spec.bugfix.actualBehavior || ""}\n\n`;
  } else if (kind === "design" && spec.design) {
    md += `## 方案说明\n${spec.design.approach || ""}\n\n`;
    if (Array.isArray(spec.design.tradeoffs) && spec.design.tradeoffs.length > 0) {
      md += `## 方案权衡 (Trade-offs)\n`;
      for (const t of spec.design.tradeoffs) {
        md += `- ${t}\n`;
      }
      md += `\n`;
    }
    if (spec.design.apiSurface) {
      md += `## 接口契约与边界 (API Surface)\n\`\`\`\n${spec.design.apiSurface}\n\`\`\`\n\n`;
    }
  } else if (kind === "task" && spec.task) {
    if (Array.isArray(spec.task.files) && spec.task.files.length > 0) {
      md += `## 涉及文件白名单\n`;
      for (const f of spec.task.files) {
        md += `- \`${f}\`\n`;
      }
      md += `\n`;
    }
    if (Array.isArray(spec.task.steps) && spec.task.steps.length > 0) {
      md += `## 执行步骤\n`;
      for (const s of spec.task.steps) {
        md += `- [ ] ${s}\n`;
      }
      md += `\n`;
    }
  }
  return md;
}

/**
 * Spec-driven development routes (wave147).
 *
 * A spec is stored on the issue itself (`issues.spec_kind` + `issues.spec`), so
 * this module reads and writes those two columns directly rather than widening
 * the issue service's create input. The chain is the parent issue id: a task's
 * `spec.parentSpecId` names its design issue, a design's names the requirement
 * or bugfix it answers. CMMI (G1–G5) is untouched — this is the lighter
 * development-plane layer.
 */
export function issueSpecRoutes(db: Db) {
  const router = Router();
  const issueSvc = issueService(db);
  const docSvc = documentService(db);

  function readSpecRow(id: string) {
    return db
      .select({
        id: issueRows.id,
        companyId: issueRows.companyId,
        identifier: issueRows.identifier,
        title: issueRows.title,
        status: issueRows.status,
        projectId: issueRows.projectId,
        parentId: issueRows.parentId,
        specKind: issueRows.specKind,
        spec: issueRows.spec,
      })
      .from(issueRows)
      .where(eq(issueRows.id, id))
      .then((rows) => rows[0] ?? null);
  }

  async function writeSpec(
    issueId: string,
    spec: IssueSpec,
    title?: string,
    actor?: ReturnType<typeof getActorInfo>,
  ): Promise<void> {
    await db
      .update(issueRows)
      .set({ specKind: spec.kind, spec, updatedAt: new Date() })
      .where(eq(issueRows.id, issueId));

    try {
      const issueTitle =
        title ||
        (await db
          .select({ title: issueRows.title })
          .from(issueRows)
          .where(eq(issueRows.id, issueId))
          .then((r) => r[0]?.title)) ||
        "未命名规格";
      await docSvc.upsertIssueDocument({
        issueId,
        key: "spec",
        title: `[Spec] ${issueTitle}`,
        format: "markdown",
        body: specToMarkdown(issueTitle, spec),
        changeSummary: `Dual-write sync to official issue_documents (kind: ${spec.kind})`,
        createdByAgentId: actor?.agentId ?? null,
        createdByUserId: actor?.actorType === "user" ? actor.actorId : null,
        createdByRunId: actor?.runId ?? null,
      });
    } catch (err) {
      console.warn(`[issue-specs] Failed to mirror spec to official issue_documents for issue ${issueId}:`, err);
    }
  }

  router.get("/issues/:id/spec", async (req, res) => {
    const id = req.params.id as string;
    if (!isUuidLike(id)) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    const issue = await getAccessibleResource(req, res, readSpecRow(id), "Issue not found");
    if (!issue) return;

    let specKind = issue.specKind ?? null;
    let spec = (issue.spec as IssueSpec | null) ?? null;

    if (!spec) {
      try {
        const doc = await docSvc.getIssueDocumentByKey(id, "spec");
        if (doc?.body) {
          specKind = "requirement";
          spec = {
            kind: "requirement",
            requirement: {
              body: doc.body,
              acceptanceCriteria: [],
            },
          };
        }
      } catch {
        // ignore and fallback
      }
    }

    res.json({
      issueId: issue.id,
      specKind,
      spec,
    });
  });

  /**
   * Write the spec on one issue. The body is the spec itself: strict by default,
   * lenient with `?draft=1` so an editor can persist a half-written spec.
   */
  router.post("/issues/:id/spec", async (req, res) => {
    const id = req.params.id as string;
    if (!isUuidLike(id)) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    const issue = await getAccessibleResource(req, res, readSpecRow(id), "Issue not found");
    if (!issue) return;

    const isDraft = req.query.draft === "1" || req.query.draft === "true";
    const parsed = isDraft ? issueSpecDraftSchema.parse(req.body) : issueSpecSchema.parse(req.body);
    const kind = parsed.kind ?? null;
    if (!kind) throw unprocessable("spec.kind is required");

    const parentSpecId = parsed.parentSpecId ?? null;
    if (parentSpecId) {
      if (parentSpecId === issue.id) {
        throw unprocessable("spec.parentSpecId cannot reference the issue itself");
      }
      const parent = await readSpecRow(parentSpecId);
      if (!parent || parent.companyId !== issue.companyId) {
        throw unprocessable("spec.parentSpecId must reference an issue in the same company");
      }
    }

    const stored = { ...(parsed as IssueSpec), kind, parentSpecId };
    const actor = getActorInfo(req);
    await writeSpec(issue.id, stored, issue.title, actor);

    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      agentApiKeyId: actor.agentApiKeyId,
      action: "issue.spec_saved",
      entityType: "issue",
      entityId: issue.id,
      issueId: issue.id,
      details: { kind, draft: isDraft, parentSpecId },
    });
    await recordAudit(db, req, {
      companyId: issue.companyId,
      action: "issue.spec_saved",
      target: { type: "issue", id: issue.id },
      before: { specKind: issue.specKind ?? null, spec: (issue.spec as unknown) ?? null },
      after: { specKind: kind, spec: stored },
    });

    res.json({ issueId: issue.id, specKind: kind, spec: stored });
  });

  /** The whole spec forest for a company, optionally scoped to one project. */
  router.get("/companies/:companyId/specs/tree", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = specTreeQuerySchema.parse(req.query);

    const rows = await db
      .select({
        id: issueRows.id,
        identifier: issueRows.identifier,
        title: issueRows.title,
        status: issueRows.status,
        projectId: issueRows.projectId,
        specKind: issueRows.specKind,
        spec: issueRows.spec,
      })
      .from(issueRows)
      .where(and(eq(issueRows.companyId, companyId), isNotNull(issueRows.specKind)));

    const specRows: SpecTreeRow[] = [];
    for (const row of rows) {
      if (!row.specKind || !row.spec) continue;
      if (query.projectId && row.projectId !== query.projectId) continue;
      const spec = row.spec as IssueSpec;
      specRows.push({
        issueId: row.id,
        identifier: row.identifier,
        title: row.title,
        status: row.status,
        specKind: row.specKind,
        spec,
        parentSpecId: spec.parentSpecId ?? null,
      });
    }

    res.json({ roots: buildSpecTree(specRows) });
  });

  /** Start a spec from its template: create the issue, then store the skeleton. */
  router.post("/companies/:companyId/specs/from-template", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const input = createSpecFromTemplateSchema.parse(req.body);
    const kind = input.kind;
    const spec = specTemplateSkeleton(input.templateName ?? kind);

    let parentIssueId: string | null = null;
    if (input.parentIssueId) {
      const parent = await readSpecRow(input.parentIssueId);
      if (!parent || parent.companyId !== companyId) {
        throw unprocessable("parentIssueId must reference an issue in this company");
      }
      parentIssueId = parent.id;
    }

    const created = await issueSvc.create(companyId, {
      title: input.title ?? SPEC_TITLES[kind],
      ...(input.description ? { description: input.description } : {}),
      status: "backlog",
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(parentIssueId ? { parentId: parentIssueId } : {}),
      ...(input.assigneeAgentId ? { assigneeAgentId: input.assigneeAgentId } : {}),
      allowDuplicate: true,
    });
    if (!created) throw notFound("Issue not created");

    const stored: IssueSpec = { ...spec, kind, parentSpecId: parentIssueId };
    const actor = getActorInfo(req);
    await writeSpec(created.id, stored, created.title, actor);

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      agentApiKeyId: actor.agentApiKeyId,
      action: "issue.spec_created_from_template",
      entityType: "issue",
      entityId: created.id,
      issueId: created.id,
      details: { kind, templateName: input.templateName ?? kind, parentSpecId: parentIssueId },
    });
    await recordAudit(db, req, {
      companyId,
      action: "issue.spec_created",
      target: { type: "issue", id: created.id },
      before: null,
      after: { specKind: kind, spec: stored },
    });

    res.status(201).json({ issueId: created.id, specKind: kind, spec: stored });
  });

  // wave215 alias: the coolie App's 老板面板 calls
  // `/api/companies/:companyId/issue-specs`. Reuse the tree endpoint's logic
  // so callers don't need to know about the `/specs/` (plural) URL.
  router.get("/companies/:companyId/issue-specs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = specTreeQuerySchema.parse(req.query);

    const rows = await db
      .select({
        id: issueRows.id,
        identifier: issueRows.identifier,
        title: issueRows.title,
        status: issueRows.status,
        projectId: issueRows.projectId,
        specKind: issueRows.specKind,
        spec: issueRows.spec,
      })
      .from(issueRows)
      .where(and(eq(issueRows.companyId, companyId), isNotNull(issueRows.specKind)));

    const specRows: SpecTreeRow[] = [];
    for (const row of rows) {
      if (!row.specKind || !row.spec) continue;
      if (query.projectId && row.projectId !== query.projectId) continue;
      const spec = row.spec as IssueSpec;
      specRows.push({
        issueId: row.id,
        identifier: row.identifier,
        title: row.title,
        status: row.status,
        specKind: row.specKind,
        spec,
        parentSpecId: spec.parentSpecId ?? null,
      });
    }

    res.json({ roots: buildSpecTree(specRows) });
  });

  return router;
}
