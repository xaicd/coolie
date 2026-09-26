import { Router } from "express";
import type { Db } from "@paperclipai/db";
import type { DeploymentMode } from "@paperclipai/shared";
import { badRequest, conflict, notFound } from "../errors.js";
import {
  createBuildPlanIssues,
  detectBuildTrigger,
  detectDomainTrigger,
  domainPromptSubject,
  generateBuildPlan,
  type BuildActor,
} from "../services/build-orchestrator.js";
import {
  decomposeSpecIntoBuildIssues,
} from "../services/ontology-spec-decomposition.js";
import {
  generateOntologySpec,
} from "../services/ontology-spec-planner.js";
import {
  ontologyProvisioner,
  OntologyPluginUnavailableError,
  type OntologyProvisioner,
} from "../services/ontology-provisioner.js";
import { specDomainSlug, specDocumentForProvisioning } from "../services/ontology-spec.js";
import {
  ONTOLOGY_SPEC_DOCUMENT_KEY,
  ONTOLOGY_SPEC_FORMAT,
  ontologySpecDocumentTitle,
  readOntologySpec,
  saveOntologySpec,
} from "../services/ontology-spec-store.js";
import { approvalService } from "../services/approvals.js";
import { documentService } from "../services/documents.js";
import { issueApprovalService } from "../services/issue-approvals.js";
import { issueService } from "../services/index.js";
import type { PluginWorkerManager } from "../services/plugin-worker-manager.js";
import type { IssueAssignmentWakeupDeps } from "../services/issue-assignment-wakeup.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

/**
 * Build mode routes.
 *
 * `POST /build/start` (mounted under `/api`) turns one "build <x>" ask from the
 * board room into a sequenced chain of issue cards. It mirrors the board-chat
 * relay's preconditions: the same deployment gate, because it also spawns the
 * operator's `hermes` CLI with request-supplied text, and the same company
 * scoping.
 *
 * The `/build/spec/*` routes are the other half: a "建域 <x>" ask becomes an
 * ontology *model* rather than code, and a model needs a person to approve it
 * before it exists. So the shape is plan → approve → instantiate, with nothing
 * written to the ontology in between. See `ontology-spec.ts` for why the
 * document's vocabulary is the plugin's and not this process's.
 */
export function buildRoutes(
  db: Db,
  opts: {
    deploymentMode: DeploymentMode;
    heartbeat?: IssueAssignmentWakeupDeps;
    apiUrl?: string;
    pluginWorkerManager?: PluginWorkerManager;
  },
) {
  const router = Router();
  const issueSvc = issueService(db);
  const approvals = approvalService(db);
  const issueApprovals = issueApprovalService(db);

  /** Both modes spawn the operator's CLI with request-supplied text. */
  function assertBuildModeDeploymentAllowed(res: import("express").Response): boolean {
    if (
      opts.deploymentMode !== "local_trusted" &&
      opts.deploymentMode !== "authenticated"
    ) {
      res.status(403).json({
        error: "Build mode is only available on local single-operator instances",
        code: "DEPLOYMENT_MODE_UNSUPPORTED",
      });
      return false;
    }
    return true;
  }

  function actorFromRequest(req: import("express").Request): BuildActor {
    const actor = getActorInfo(req);
    return {
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
    };
  }

  const provisionerFrom = (): OntologyProvisioner =>
    ontologyProvisioner({ db, workerManager: opts.pluginWorkerManager });

  router.post("/build/start", async (req, res) => {
    if (!assertBuildModeDeploymentAllowed(res)) return;

    const { companyId, prompt, projectId } = (req.body ?? {}) as {
      companyId?: string;
      prompt?: string;
      /** Coolie fork: bind build-plan issues under this project. */
      projectId?: string;
    };

    if (!companyId || typeof companyId !== "string") {
      throw badRequest("companyId is required");
    }
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      throw badRequest("prompt is required");
    }

    assertCompanyAccess(req, companyId);
    assertBoard(req);

    if (!detectBuildTrigger(prompt)) {
      throw badRequest("prompt is not a build request", {
        code: "NOT_A_BUILD_TRIGGER",
      });
    }

    const { plan, source } = await generateBuildPlan({
      companyId,
      prompt: prompt.trim(),
      apiUrl: opts.apiUrl,
    });

    const buildActor = actorFromRequest(req);

    const result = await createBuildPlanIssues(
      { db, heartbeat: opts.heartbeat },
      { companyId, prompt: prompt.trim(), plan, actor: buildActor, projectId },
    );

    res.status(201).json({
      buildId: result.buildId,
      plan: result.plan,
      planSource: source,
      unassignedAgentTypes: result.unassignedAgentTypes,
    });
  });

  /**
   * Plan a domain. Nothing is written unless the plan is usable, so a request
   * that produces no spec leaves no trace to clean up — no issue, no approval,
   * and certainly no rows in the ontology.
   *
   * The spec's validity is decided by the ontology plugin's own validator, not
   * here: the server does not carry the ontology's vocabulary. A spec that the
   * plugin refuses comes back as `planSource: "rejected"` with the plugin's
   * findings, which is the point at which a human should be looking at the
   * request rather than the model.
   */
  router.post("/build/spec/start", async (req, res) => {
    if (!assertBuildModeDeploymentAllowed(res)) return;

    const { companyId, prompt } = (req.body ?? {}) as {
      companyId?: string;
      prompt?: string;
    };

    if (!companyId || typeof companyId !== "string") {
      throw badRequest("companyId is required");
    }
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      throw badRequest("prompt is required");
    }

    assertCompanyAccess(req, companyId);
    assertBoard(req);

    if (!detectDomainTrigger(prompt)) {
      throw badRequest("prompt is not a domain request", {
        code: "NOT_A_DOMAIN_TRIGGER",
      });
    }

    const buildActor = actorFromRequest(req);

    let planned;
    try {
      planned = await generateOntologySpec({
        companyId,
        prompt: prompt.trim(),
        apiUrl: opts.apiUrl,
        // Provisional: the build id does not exist until the spec is worth
        // keeping, so the final origin is stamped below, once there is one.
        origin: "build_spec",
        validate: async (document) => {
          const validated = await provisionerFrom().validateDocument(document, buildActor, companyId);
          return { problems: validated.problems };
        },
      });
    } catch (error) {
      if (error instanceof OntologyPluginUnavailableError) {
        // 503 rather than a bad request: the request was fine, the ontology is
        // not reachable. A caller can retry this one.
        res.status(503).json({ error: error.message, code: error.code });
        return;
      }
      throw error;
    }

    if (!planned.spec) {
      res.status(200).json({
        planSource: "rejected",
        spec: null,
        specId: null,
        problems: planned.problems,
      });
      return;
    }

    const spec = planned.spec;
    const parent = await issueSvc.create(companyId, {
      title: `构建本体: ${spec.document.name}`,
      description:
        `本体构建计划: ${spec.document.name}\n\n` +
        `原始需求: ${prompt.trim()}\n\n` +
        `对象类型 ${spec.document.objectTypes?.length ?? 0} 个 / 关系类型 ${spec.document.relationTypes?.length ?? 0} 条\n` +
        `审批通过前不会写入本体。`,
      status: "todo",
      priority: "medium",
      originKind: "build_plan",
      ...(buildActor.agentId ? { createdByAgentId: buildActor.agentId } : {}),
      ...(buildActor.actorType === "user"
        ? {
            createdByUserId: buildActor.actorId,
            responsibleUserId: buildActor.actorId,
            trustExplicitResponsibleUserId: true,
          }
        : {}),
      ...(buildActor.runId ? { actorRunId: buildActor.runId } : {}),
    });

    // The final origin, now that there is an id to name, plus the timestamp the
    // document format expects. The plugin was already asked about this document
    // with the provisional origin, and neither field is part of what makes a
    // document valid, so re-stamping costs no re-check.
    const stamped = {
      ...spec,
      document: {
        ...spec.document,
        exportedAt: new Date().toISOString(),
        source: { ...(spec.document.source ?? {}), origin: `build_spec:${parent.id}` },
      },
    };

    const saved = await saveOntologySpec(db, {
      issueId: parent.id,
      spec: stamped,
      actor: buildActor,
      changeSummary: "初版规范",
    });

    const approval = await approvals.create(companyId, {
      type: "ontology_spec",
      payload: {
        buildId: parent.id,
        documentKey: ONTOLOGY_SPEC_DOCUMENT_KEY,
        documentId: saved.documentId,
        revisionNumber: saved.revisionNumber,
        domainSlug: specDomainSlug(stamped),
        specVersion: stamped.specVersion,
        objectTypes: (stamped.document.objectTypes ?? []).map((type) => type.key),
        relationTypes: (stamped.document.relationTypes ?? []).map((relation) => relation.key),
      },
      requestedByUserId: buildActor.actorType === "user" ? buildActor.actorId : null,
      requestedByAgentId: buildActor.agentId,
      status: "pending",
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: null,
      updatedAt: new Date(),
    });
    await issueApprovals.linkManyForApproval(approval.id, [parent.id], {
      agentId: buildActor.agentId,
      userId: buildActor.actorType === "user" ? buildActor.actorId : null,
    });

    res.status(201).json({
      specId: parent.id,
      planSource: "hermes",
      spec: stamped,
      problems: planned.problems,
      approvalId: approval.id,
      documentId: saved.documentId,
    });
  });

  router.get("/build/spec/:specId", async (req, res) => {
    const specId = req.params.specId as string;
    const issue = await issueSvc.getById(specId);
    if (!issue) throw notFound("Build spec not found");
    assertCompanyAccess(req, issue.companyId);
    assertBoard(req);

    const stored = await readOntologySpec(db, specId);
    const linked = await issueApprovals.listApprovalsForIssue(specId);
    const result = await documentService(db).getIssueDocumentByKey(specId, "ontology-spec-result");

    res.json({
      specId,
      spec: stored?.spec ?? null,
      documentId: stored?.documentId ?? null,
      revisionNumber: stored?.revisionNumber ?? null,
      approvals: linked.map((row) => ({
        id: row.id,
        type: row.type,
        status: row.status,
        decisionNote: row.decisionNote,
        decidedAt: row.decidedAt,
      })),
      result: result ? safeJson(result.body) : null,
    });
  });

  /**
   * Write the approved model, then turn it into work.
   *
   * Two things happen here that cannot happen earlier: the ontology is written,
   * and the build chain is created. Both are gated on the approval, because an
   * unapproved spec is a proposal and a proposal is not a change.
   */
  router.post("/build/spec/:specId/instantiate", async (req, res) => {
    if (!assertBuildModeDeploymentAllowed(res)) return;

    const specId = req.params.specId as string;
    const issue = await issueSvc.getById(specId);
    if (!issue) throw notFound("Build spec not found");
    assertCompanyAccess(req, issue.companyId);
    assertBoard(req);

    const stored = await readOntologySpec(db, specId);
    if (!stored) throw notFound("This issue holds no ontology spec");

    const linked = await issueApprovals.listApprovalsForIssue(specId);
    const specApproval = linked.find((row) => row.type === "ontology_spec");
    if (!specApproval) {
      throw conflict("This spec has no approval attached", { code: "SPEC_APPROVAL_MISSING" });
    }
    if (specApproval.status !== "approved") {
      // The gate. Everything downstream of this line writes a model, so the
      // refusal has to be here rather than a policy described in a comment.
      throw conflict("The ontology spec has not been approved", {
        code: "SPEC_NOT_APPROVED",
        status: specApproval.status,
      });
    }

    const buildActor = actorFromRequest(req);

    let imported;
    try {
      imported = await provisionerFrom().importDocument(
        specDocumentForProvisioning(stored.spec),
        buildActor,
        issue.companyId,
      );
    } catch (error) {
      if (error instanceof OntologyPluginUnavailableError) {
        res.status(503).json({ error: error.message, code: error.code });
        return;
      }
      throw error;
    }

    const decomposition = await decomposeSpecIntoBuildIssues(
      { db, heartbeat: opts.heartbeat },
      {
        companyId: issue.companyId,
        buildId: specId,
        spec: stored.spec,
        actor: buildActor,
      },
    );

    // Where the domain went. Kept as a document for the same reason the spec is:
    // one mechanism, versioned, and readable by whoever has the issue.
    const resultDocument = await documentService(db).upsertIssueDocument({
      issueId: specId,
      key: "ontology-spec-result",
      title: `本体落地结果: ${imported.slug}`,
      format: ONTOLOGY_SPEC_FORMAT,
      body: JSON.stringify(
        {
          domainId: imported.domainId,
          slug: imported.slug,
          reused: imported.reused,
          created: imported.created,
          specRevisionNumber: stored.revisionNumber,
        },
        null,
        2,
      ),
      changeSummary: `instantiated from revision ${stored.revisionNumber}`,
      createdByAgentId: buildActor.agentId,
      createdByUserId: buildActor.actorType === "user" ? buildActor.actorId : null,
      createdByRunId: buildActor.runId,
    });

    res.status(201).json({
      specId,
      domainId: imported.domainId,
      slug: imported.slug,
      reused: imported.reused,
      created: imported.created,
      resultDocumentId: resultDocument.document.id,
      issues: decomposition.issues,
      unassignedAgentTypes: decomposition.unassignedAgentTypes,
      domainTitle: ontologySpecDocumentTitle(stored.spec),
    });
  });

  return router;
}

/** A document body that is not JSON is reported as null rather than thrown on. */
function safeJson(body: string | undefined): unknown {
  if (typeof body !== "string" || !body.trim()) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
