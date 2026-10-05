import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { activityLog, issues } from "@paperclipai/db";
import { projectToolContext } from "../services/project-tool-context.js";
import { persistActivity, publishActivity } from "../services/activity-log.js";
import { z } from "zod";
import { normalizeProjectRepositoryUrl, resolveProjectRepositorySelection } from "../services/project-repositories.js";
import { getDefaultPatTarget, ensureRemoteRepository } from "../services/git-pat.js";
import { MAX_ATTACHMENT_BYTES, formatAttachmentSize } from "../attachment-types.js";
import {
  analyzeProjectDocument,
  landProjectDocument,
  listProjectDocuments,
  sanitizeProjectDocumentFilename,
} from "../services/project-documents.js";
import { scheduleProjectDocumentEnrichment } from "../services/project-document-enrichment.js";
import multer from "multer";
import { runTolerantMultipartUpload } from "../lib/multipart-upload.js";
import { toolAccessService } from "../services/tool-access.js";
import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import {
  buildWbsMainline,
  createProjectSchema,
  createProjectWorkspaceSchema,
  evaluateWbsGates,
  findWorkspaceCommandDefinition,
  isUuidLike,
  matchWorkspaceRuntimeServiceToCommand,
  updateProjectSchema,
  updateProjectWorkspaceSchema,
  workspaceRuntimeControlTargetSchema,
} from "@paperclipai/shared";
import type { WorkspaceRuntimeDesiredState, WorkspaceRuntimeServiceStateMap } from "@paperclipai/shared";
import { trackProjectCreated } from "@paperclipai/shared/telemetry";
import { validate } from "../middleware/validate.js";
import { accessService, issueService, projectService, logActivity, workspaceOperationService } from "../services/index.js";
import { conflict, forbidden, unprocessable } from "../errors.js";
import { externalObjectService } from "../services/external-objects.js";
import { instanceSettingsService } from "../services/instance-settings.js";
import { assertBoard, assertCompanyAccess, getAccessibleResource, getActorInfo } from "./authz.js";
import {
  buildWorkspaceRuntimeDesiredStatePatch,
  listConfiguredRuntimeServiceEntries,
  runWorkspaceJobForControl,
  startRuntimeServicesForWorkspaceControl,
  stopRuntimeServicesForProjectWorkspace,
} from "../services/workspace-runtime.js";
import {
  assertNoAgentHostWorkspaceCommandMutation,
  collectProjectExecutionWorkspaceCommandPaths,
  collectProjectWorkspaceCommandPaths,
} from "./workspace-command-authz.js";
import { assertCanManageProjectWorkspaceRuntimeServices } from "./workspace-runtime-service-authz.js";
import { getTelemetryClient } from "../telemetry.js";
import { appendWithCap } from "../adapters/utils.js";
import { assertEnvironmentSelectionForCompany } from "./environment-selection.js";
import { environmentService } from "../services/environments.js";
import { secretService } from "../services/secrets.js";
import { ensureProjectOntologyDomain } from "../services/project-ontology-bootstrap.js";

const WORKSPACE_CONTROL_OUTPUT_MAX_CHARS = 256 * 1024;
const SHARED_WORKSPACE_STOP_AND_RESTART_ACTIONS = new Set(["stop", "restart"]);

export function projectRoutes(db: Db) {
  const router = Router();
  const svc = projectService(db);
  // Same multipart shape and size cap as issue attachments (`file` field),
  // reusing MAX_ATTACHMENT_BYTES so the two upload paths cannot drift.
  const documentUpload = multer({
    storage: multer.memoryStorage(),
    // React Native and browser FormData send filenames as raw UTF-8.
    defParamCharset: "utf8",
    limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
  });

  async function repositoryViewer(req: Request) {
    if (req.actor.type === "board") return { userId: req.actor.userId ?? null, localTrusted: req.actor.source === "local_implicit" };
    const context = await projectToolContext(db, req.actor);
    if (!context.userId) throw forbidden("Repository access requires a responsible user");
    return context;
  }

  async function selectedRepositories(req: Request, companyId: string, ids: string[], existing: import("@paperclipai/shared").ProjectWorkspace[] = []) {
    const viewer = await repositoryViewer(req);
    if (!ids.length) return [];
    const available = await toolAccessService(db).listProjectRepositories(companyId, viewer.userId, viewer.localTrusted);
    return resolveProjectRepositorySelection(ids, available.repositories, existing);
  }
  const access = accessService(db);
  const secretsSvc = secretService(db);
  const workspaceOperations = workspaceOperationService(db);
  const instanceSettings = instanceSettingsService(db);
  const externalObjectsSvc = externalObjectService(db, {
    enabled: async () => (await instanceSettings.getExperimental()).enableExternalObjects === true,
  });
  const strictSecretsMode = process.env.PAPERCLIP_SECRETS_STRICT_MODE === "true";
  const environmentsSvc = environmentService(db);

  /**
   * Managed-sandbox-only policy (`enableManagedSandboxOnly`): a project
   * workspace `cwd` is an absolute path on the execution host. When the policy
   * is on every agent runs in the platform-managed environment, so there is no
   * host for a user to point at and a write that carries a path is refused
   * rather than stored and silently ignored. This is the floor behind the
   * hidden UI field, and it applies to every actor, mirroring how
   * `assertNoAgentHostWorkspaceCommandMutation` floors host-executed commands
   * on these same routes.
   *
   * `cwd: null` still passes: clearing a stale path is exactly what an instance
   * that just turned the policy on needs to do. The settings read only happens
   * when the payload actually carries a path.
   */
  async function assertNoManagedSandboxWorkspacePath(workspacePatch: unknown) {
    if (typeof workspacePatch !== "object" || workspacePatch === null || Array.isArray(workspacePatch)) return;
    const patch = workspacePatch as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(patch, "cwd")) return;
    if (patch.cwd === null || patch.cwd === undefined) return;
    if ((await instanceSettings.getExperimental()).enableManagedSandboxOnly !== true) return;
    throw unprocessable(
      "This instance runs agents only in the platform-managed environment; local folders are not configurable.",
    );
  }

  async function assertProjectEnvironmentSelection(companyId: string, environmentId: string | null | undefined) {
    if (environmentId === undefined || environmentId === null) return;
    await assertEnvironmentSelectionForCompany(environmentsSvc, companyId, environmentId, {
      allowedDrivers: ["local", "ssh", "sandbox"],
    });
  }

  function readProjectPolicyEnvironmentId(policy: unknown): string | null | undefined {
    if (!policy || typeof policy !== "object" || !("environmentId" in policy)) {
      return undefined;
    }
    const environmentId = (policy as { environmentId?: unknown }).environmentId;
    return typeof environmentId === "string" || environmentId === null ? environmentId : undefined;
  }

  async function resolveCompanyIdForProjectReference(req: Request) {
    const companyIdQuery = req.query.companyId;
    const requestedCompanyId =
      typeof companyIdQuery === "string" && companyIdQuery.trim().length > 0
        ? companyIdQuery.trim()
        : null;
    if (requestedCompanyId) {
      assertCompanyAccess(req, requestedCompanyId);
      return requestedCompanyId;
    }
    if (req.actor.type === "agent" && req.actor.companyId) {
      return req.actor.companyId;
    }
    return null;
  }

  async function normalizeProjectReference(req: Request, rawId: string) {
    if (isUuidLike(rawId)) return rawId;
    const companyId = await resolveCompanyIdForProjectReference(req);
    if (!companyId) return rawId;
    const resolved = await svc.resolveByReference(companyId, rawId);
    if (resolved.ambiguous) {
      throw conflict("Project shortname is ambiguous in this company. Use the project ID.");
    }
    return resolved.project?.id ?? rawId;
  }

  async function assertProjectReadAllowed(req: Request, res: Response, project: { id: string; companyId: string }) {
    const decision = await access.decide({
      actor: req.actor,
      action: "project:read",
      resource: { type: "project", companyId: project.companyId, projectId: project.id },
    });
    if (decision.allowed) return true;
    res.status(403).json({ error: "Project is outside this actor's authorization boundary" });
    return false;
  }

  async function assertRuntimeManageAllowed(req: Request, res: Response, companyId: string) {
    const decision = await access.decide({
      actor: req.actor,
      action: "runtime:manage",
      resource: { type: "company", companyId },
    });
    if (decision.allowed) return true;
    res.status(403).json({ error: "Runtime service control is outside this actor's authorization boundary" });
    return false;
  }

  async function filterProjectsForActor<T extends { id: string; companyId: string }>(req: Request, rows: T[]) {
    const decisions = await Promise.all(rows.map((project) =>
      access.decide({
        actor: req.actor,
        action: "project:read",
        resource: { type: "project", companyId: project.companyId, projectId: project.id },
      })
    ));
    return rows.filter((_, index) => decisions[index]?.allowed);
  }

  router.param("id", async (req, _res, next, rawId) => {
    try {
      req.params.id = await normalizeProjectReference(req, rawId);
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get("/companies/:companyId/project-repositories", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const viewer = await repositoryViewer(req);
    res.json(await toolAccessService(db).listProjectRepositories(companyId, viewer.userId, viewer.localTrusted));
  });

  router.put("/projects/:id/repositories", validate(z.object({ repositoryIds: z.array(z.string().regex(/^\d+$/)) })), async (req, res) => {
    assertBoard(req);
    const project = await getAccessibleResource(req, res, svc.getById(req.params.id as string), "Project not found");
    if (!project) return;
    const repositories = await selectedRepositories(req, project.companyId, req.body.repositoryIds, project.workspaces);
    const updated = await svc.replaceRepositories(project.id, repositories);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId, actorType: actor.actorType, actorId: actor.actorId,
      action: "project.repositories_updated", entityType: "project", entityId: project.id,
      details: { repositoryIds: repositories.map((repo) => repo.id) },
    });
    res.json(updated);
  });

  router.get("/companies/:companyId/projects", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const includeArchived = req.query.includeArchived === "true";
    const result = await svc.list(companyId, { includeArchived });
    res.json(await filterProjectsForActor(req, result));
  });

  router.get("/projects/:id", async (req, res) => {
    const id = req.params.id as string;
    const project = await getAccessibleResource(req, res, svc.getById(id), "Project not found");
    if (!project) return;
    if (!(await assertProjectReadAllowed(req, res, project))) return;
    res.json(project);
  });

  router.get("/projects/:id/external-object-summary", async (req, res) => {
    const id = req.params.id as string;
    const project = await getAccessibleResource(req, res, svc.getById(id), "Project not found");
    if (!project) return;
    const summary = await externalObjectsSvc.getProjectSummary(project.id);
    res.json(summary);
  });

  router.get("/git-pat/target", async (_req, res) => {
    const target = await getDefaultPatTarget();
    res.json(target);
  });

  router.post("/companies/:companyId/projects", validate(createProjectSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    type CreateProjectPayload = Parameters<typeof svc.create>[1] & {
      workspace?: Parameters<typeof svc.createWorkspace>[1];
      repositoryIds?: string[];
    };

    const { workspace, repositoryIds, repositoryUrls, idempotencyKey, hostedRemote, ...projectData } = req.body as CreateProjectPayload & { idempotencyKey?: string; repositoryUrls?: string[]; hostedRemote?: boolean };
    const runContext = req.actor.type === "agent" && req.actor.source === "agent_jwt" && req.actor.runId
      ? await projectToolContext(db, req.actor, true) : null;
    await assertProjectEnvironmentSelection(
      companyId,
      readProjectPolicyEnvironmentId(projectData.executionWorkspacePolicy),
    );
    assertNoAgentHostWorkspaceCommandMutation(
      req,
      [
        ...collectProjectExecutionWorkspaceCommandPaths(projectData.executionWorkspacePolicy),
        ...collectProjectWorkspaceCommandPaths(workspace, "workspace"),
      ],
    );
    await assertNoManagedSandboxWorkspacePath(workspace);
    if (projectData.env !== undefined) {
      projectData.env = await secretsSvc.normalizeEnvBindingsForPersistence(
        companyId,
        projectData.env,
        { strictMode: strictSecretsMode, fieldPath: "env" },
      );
    }
    if (workspace && (repositoryIds || repositoryUrls)) throw unprocessable("Use either workspace or repositoryIds/repositoryUrls when creating a project");
    let urlRepositories = (repositoryUrls ?? []).map(normalizeProjectRepositoryUrl);
    // 组织托管 (hostedRemote) is an independent attribute from the code source.
    // `true` always provisions the startup PAT org's repo for this project —
    // even alongside a git URL to clone or a local directory — so "local source
    // + hosted remote" composes. `false` explicitly opts out, even for a
    // source-less project. Absent keeps the legacy default (provision only when
    // no explicit source was given) so callers that never send the flag are
    // unchanged.
    const shouldAutoProvisionRemote = hostedRemote === true
      || (hostedRemote !== false && !workspace && (!repositoryIds || repositoryIds.length === 0) && urlRepositories.length === 0);
    if (shouldAutoProvisionRemote) {
      try {
        const remoteRepo = await ensureRemoteRepository(projectData.name, projectData.description ?? undefined);
        if (remoteRepo) {
          urlRepositories = [...urlRepositories, normalizeProjectRepositoryUrl(remoteRepo.cloneUrl)];
        }
      } catch (err) {
        console.warn("[git-pat] Auto-provisioning remote repository skipped:", err);
      }
    }
    const repositories = repositoryIds ? await selectedRepositories(req, companyId, repositoryIds) : null;
    const actor = getActorInfo(req);
    const fingerprint = createHash("sha256").update(JSON.stringify({ projectData, workspace, repositoryIds, repositoryUrls, hostedRemote })).digest("hex");
    const receiptKey = idempotencyKey ? `project:${companyId}:${actor.actorId}:${runContext?.issue.id ?? "board"}:${idempotencyKey}` : null;
    const result = await db.transaction(async (tx) => {
      if (receiptKey) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${receiptKey}, 0))`);
        const [prior] = await tx.select().from(activityLog).where(and(
          eq(activityLog.companyId, companyId), eq(activityLog.action, "project.created"),
          sql`${activityLog.details}->>'idempotencyKey' = ${receiptKey}`,
        ));
        if (prior) {
          if (prior.details?.fingerprint !== fingerprint) throw conflict("Project idempotency key was used with different inputs");
          const project = await projectService(tx as unknown as Db).getById(prior.entityId);
          if (!project) throw conflict("Previously created project is no longer available");
          return { project, publication: null, duplicate: true };
        }
      }
      if (runContext) await projectToolContext(tx as unknown as Db, req.actor, true);
      const service = projectService(tx as unknown as Db);
      const project = repositories ? await service.createWithRepositories(companyId, projectData, repositories) : await service.create(companyId, projectData);
      const attachedUrls = new Set((repositories ?? []).map(repo => repo.url.toLowerCase()));
      const registeredUrls: typeof urlRepositories = [];
      for (const repo of urlRepositories) {
        if (attachedUrls.has(repo.url.toLowerCase())) continue;
        attachedUrls.add(repo.url.toLowerCase());
        await service.createWorkspace(project.id, { name: repo.fullName, repoUrl: repo.url });
        registeredUrls.push(repo);
      }
      const createdWorkspace = workspace ? await service.createWorkspace(project.id, workspace) : null;
      if (workspace && !createdWorkspace) throw unprocessable("Invalid project workspace payload");
      // wave302 宪法第2条：项目进厂即本体域。Rides this same transaction, so the
      // project, its same-named ontology domain, and the project→domain link
      // commit together or not at all. Skips (never fails) when the ontology
      // plugin is absent on this instance.
      const ontologyDomain = await ensureProjectOntologyDomain(tx as unknown as Db, {
        companyId,
        projectId: project.id,
        projectName: project.name,
        description: project.description,
        icon: project.icon,
        createdBy: actor.actorId,
      });
      const hydrated = await service.getById(project.id);
      const activity = await persistActivity(tx as unknown as Db, {
        companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId,
        runId: actor.runId, issueId: runContext?.issue.id,
        action: "project.created", entityType: "project", entityId: project.id,
        details: {
          name: project.name, description: project.description, icon: project.icon,
          sourceIssueId: runContext?.issue.id ?? null,
          repositories: [...(repositories ?? []).map(repo => ({ id: repo.id, name: repo.fullName, url: repo.url })), ...registeredUrls.map(repo => ({ id: repo.url, name: repo.fullName, url: repo.url })),
            ...(createdWorkspace?.repoUrl ? [{ id: createdWorkspace.id, name: createdWorkspace.name, url: createdWorkspace.repoUrl }] : []),
          ],
          workspaceId: createdWorkspace?.id ?? null,
          envKeys: project.env ? Object.keys(project.env).sort() : [],
          ontologyDomain: ontologyDomain.status === "created"
            ? { id: ontologyDomain.domainId, slug: ontologyDomain.slug }
            : { skipped: ontologyDomain.reason },
          ...(receiptKey ? { idempotencyKey: receiptKey, fingerprint } : {}),
        },
      });
      return { project: hydrated ?? project, publication: activity.publication, duplicate: false };
    });
    if (result.publication) publishActivity(result.publication);
    if (result.project.env) await secretsSvc.syncEnvBindingsForTarget?.(companyId, { targetType: "project", targetId: result.project.id }, result.project.env);
    if (result.duplicate) { res.status(200).json(result.project); return; }
    const telemetryClient = getTelemetryClient();
    if (telemetryClient) {
      trackProjectCreated(telemetryClient);
    }
    res.status(result.duplicate ? 200 : 201).json(result.project);
  });

  // Requirement docs / screenshots uploaded alongside 立项. Multipart, same
  // `file` field and size cap as issue attachments; the file lands in the
  // project's plain-storage docs directory
  // `<instanceRoot>/projects/<companyId>/<projectId>/coolie-docs/`, a sibling
  // of the managed repo checkout, so an upload never dirties a checkout.
  router.post(
    "/companies/:companyId/projects/:projectId/documents",
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const projectId = req.params.projectId as string;
      assertCompanyAccess(req, companyId);
      const project = await getAccessibleResource(req, res, svc.getById(projectId), "Project not found");
      if (!project) return;
      if (project.companyId !== companyId) {
        res.status(422).json({ error: "Project does not belong to company" });
        return;
      }
      if (!(await assertProjectReadAllowed(req, res, project))) return;

      try {
        await runTolerantMultipartUpload(documentUpload, req, res, MAX_ATTACHMENT_BYTES);
      } catch (err) {
        if (err instanceof multer.MulterError) {
          res.status(err.code === "LIMIT_FILE_SIZE" ? 422 : 400).json({
            error: err.code === "LIMIT_FILE_SIZE"
              ? `Document is larger than the ${formatAttachmentSize(MAX_ATTACHMENT_BYTES)} limit`
              : err.message,
          });
          return;
        }
        throw err;
      }

      const file = (req as Request & { file?: { buffer: Buffer; originalname: string; mimetype?: string } }).file;
      if (!file) {
        res.status(400).json({ error: "Missing file field 'file'" });
        return;
      }
      if (file.buffer.length <= 0) {
        res.status(422).json({ error: "Document is empty" });
        return;
      }

      const filename = sanitizeProjectDocumentFilename(file.originalname ?? "");
      if (!filename) {
        res.status(422).json({ error: "Invalid document filename" });
        return;
      }

      const landed = await landProjectDocument({
        companyId: project.companyId,
        projectId: project.id,
        filename,
        body: file.buffer,
        originalFilename: file.originalname ?? null,
      });

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "project.document_added",
        entityType: "project",
        entityId: project.id,
        details: {
          relativePath: landed.relativePath,
          filename: landed.filename,
          byteSize: landed.byteSize,
          originalFilename: file.originalname,
        },
      });

      // wave123: the upload returns now; the heavy read/parse/backfill runs off
      // the request path and backfills the project's description and 建设目标.
      scheduleProjectDocumentEnrichment({
        db,
        companyId: project.companyId,
        projectId: project.id,
        filename: landed.filename,
        body: file.buffer,
        contentType: file.mimetype,
        relativePath: landed.relativePath,
      });

      res.status(201).json(landed);
    },
  );

  // List the requirement docs landed for a project. Minimal on purpose: the
  // board UI reads this to show what was attached at 立项 time.
  router.get("/companies/:companyId/projects/:projectId/documents", async (req, res) => {
    const companyId = req.params.companyId as string;
    const projectId = req.params.projectId as string;
    assertCompanyAccess(req, companyId);
    const project = await getAccessibleResource(req, res, svc.getById(projectId), "Project not found");
    if (!project) return;
    if (project.companyId !== companyId) {
      res.status(422).json({ error: "Project does not belong to company" });
      return;
    }
    if (!(await assertProjectReadAllowed(req, res, project))) return;

    const documents = await listProjectDocuments({ companyId: project.companyId, projectId: project.id });
    res.json({ projectId: project.id, documents });
  });

  // ── wave140: CMMI WBS 拆解 + 里程碑主线 ──────────────────────────────────────
  //
  // The WBS draft is produced off the request path by the document enrichment and
  // stored on `projects.wbs_draft`. These routes are the human side of it: read
  // the milestone mainline (+ per-issue gate state), adopt the draft into real
  // issues, or dismiss it. Adoption is never automatic — 不静默乱建.

  const loadWbsProject = async (req: Request, res: Response, companyId: string, projectId: string) => {
    const project = await getAccessibleResource(req, res, svc.getById(projectId), "Project not found");
    if (!project) return null;
    if (project.companyId !== companyId) {
      res.status(422).json({ error: "Project does not belong to company" });
      return null;
    }
    if (!(await assertProjectReadAllowed(req, res, project))) return null;
    return project;
  };

  router.get("/companies/:companyId/projects/:projectId/wbs", async (req, res) => {
    const companyId = req.params.companyId as string;
    const projectId = req.params.projectId as string;
    assertCompanyAccess(req, companyId);
    const project = await loadWbsProject(req, res, companyId, projectId);
    if (!project) return;

    const projectIssues = await issueService(db).list(companyId, { projectId: project.id });
    const wbsIssues = projectIssues.map((issue) => ({
      id: issue.id,
      title: issue.title,
      status: issue.status,
      wbsCode: issue.wbsCode,
      wbsType: issue.wbsType,
      isMilestone: issue.isMilestone,
      milestone: issue.milestone,
    }));
    res.json({
      projectId: project.id,
      draft: project.wbsDraft ?? null,
      mainline: buildWbsMainline(wbsIssues),
      gateStates: Object.fromEntries(evaluateWbsGates(wbsIssues)),
    });
  });

  router.post("/companies/:companyId/projects/:projectId/wbs/adopt", async (req, res) => {
    const companyId = req.params.companyId as string;
    const projectId = req.params.projectId as string;
    assertCompanyAccess(req, companyId);
    const project = await loadWbsProject(req, res, companyId, projectId);
    if (!project) return;

    const draft = project.wbsDraft ?? null;
    if (!draft || draft.items.length === 0) {
      res.status(409).json({ error: "No WBS draft to adopt" });
      return;
    }
    const already = await db
      .select({ id: issues.id })
      .from(issues)
      .where(and(eq(issues.projectId, project.id), eq(issues.isMilestone, true)))
      .limit(1);
    if (already.length > 0) {
      res.status(409).json({ error: "WBS already adopted" });
      return;
    }

    // Item order is phase → its work packages → its milestone, so each child's
    // code resolves to an already-created parent id. Milestones serve the
    // project's primary goal; a 需求 work package matching a goal title links to
    // that goal, so "一个里程碑服务于哪个目标" is answerable.
    const goalIdByTitle = new Map(
      (project.goals ?? []).map((goal) => [goal.title.trim().toLowerCase(), goal.id] as const),
    );
    const primaryGoalId = project.goalIds?.[0] ?? null;
    const issueSvc = issueService(db);
    const idByCode = new Map<string, string>();
    const createdIds: string[] = [];
    const createdMilestones: string[] = [];

    for (const item of draft.items) {
      const parentId = item.parentCode ? idByCode.get(item.parentCode) ?? null : null;
      const goalId = item.isMilestone
        ? primaryGoalId
        : item.type === "work_package"
          ? goalIdByTitle.get(item.title.trim().toLowerCase()) ?? null
          : null;
      const created = await issueSvc.create(companyId, {
        projectId: project.id,
        title: item.title,
        description: item.description ?? undefined,
        status: "backlog",
        parentId,
        goalId,
        wbsCode: item.code,
        wbsType: item.type,
        isMilestone: item.isMilestone,
        milestone: item.milestone ?? undefined,
        allowDuplicate: true,
        idempotencyKey: `wbs-adopt:${project.id}:${item.code}`,
      });
      idByCode.set(item.code, created.id);
      createdIds.push(created.id);
      if (item.isMilestone) createdMilestones.push(created.id);
    }

    await svc.update(project.id, { wbsDraft: null });
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "project.wbs_adopted",
      entityType: "project",
      entityId: project.id,
      details: {
        itemCount: createdIds.length,
        milestoneCount: createdMilestones.length,
        source: draft.source,
      },
    });

    res.status(201).json({
      projectId: project.id,
      createdIssueIds: createdIds,
      milestoneIssueIds: createdMilestones,
      itemCount: createdIds.length,
    });
  });

  router.delete("/companies/:companyId/projects/:projectId/wbs/draft", async (req, res) => {
    const companyId = req.params.companyId as string;
    const projectId = req.params.projectId as string;
    assertCompanyAccess(req, companyId);
    const project = await loadWbsProject(req, res, companyId, projectId);
    if (!project) return;
    if (project.wbsDraft == null) {
      res.status(404).json({ error: "No WBS draft" });
      return;
    }

    await svc.update(project.id, { wbsDraft: null });
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "project.wbs_draft_dismissed",
      entityType: "project",
      entityId: project.id,
      details: { itemCount: project.wbsDraft.items.length },
    });
    res.status(204).end();
  });

  // Auto-recognize an uploaded requirement doc so the create-project flow can
  // prefill 项目名称 (Req C). Multipart, same `file` field and size cap as the
  // document upload above. Deterministic and local — no LLM call: the title/H1
  // becomes the display name, an ASCII slug is derived and made unique against
  // the company's existing projects, and one summary line is returned.
  router.post("/companies/:companyId/projects/analyze-document", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    try {
      await runTolerantMultipartUpload(documentUpload, req, res, MAX_ATTACHMENT_BYTES);
    } catch (err) {
      if (err instanceof multer.MulterError) {
        res.status(err.code === "LIMIT_FILE_SIZE" ? 422 : 400).json({
          error: err.code === "LIMIT_FILE_SIZE"
            ? `Document is larger than the ${formatAttachmentSize(MAX_ATTACHMENT_BYTES)} limit`
            : err.message,
        });
        return;
      }
      throw err;
    }

    const file = (req as Request & { file?: { buffer: Buffer; originalname: string; mimetype?: string } }).file;
    if (!file) {
      res.status(400).json({ error: "Missing file field 'file'" });
      return;
    }
    if (file.buffer.length <= 0) {
      res.status(422).json({ error: "Document is empty" });
      return;
    }

    const existing = await svc.list(companyId, { includeArchived: true });
    const analysis = await analyzeProjectDocument({
      body: file.buffer,
      filename: file.originalname ?? "",
      contentType: file.mimetype,
      existingProjectNames: existing.map((project) => project.name),
    });
    res.json(analysis);
  });

  router.patch("/projects/:id", validate(updateProjectSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getById(id), "Project not found");
    if (!existing) return;
    const body = { ...req.body };
    assertNoAgentHostWorkspaceCommandMutation(
      req,
      collectProjectExecutionWorkspaceCommandPaths(body.executionWorkspacePolicy),
    );
    await assertProjectEnvironmentSelection(
      existing.companyId,
      readProjectPolicyEnvironmentId(body.executionWorkspacePolicy),
    );
    if (typeof body.archivedAt === "string") {
      body.archivedAt = new Date(body.archivedAt);
    }
    if (body.env !== undefined) {
      body.env = await secretsSvc.normalizeEnvBindingsForPersistence(existing.companyId, body.env, {
        strictMode: strictSecretsMode,
        fieldPath: "env",
      });
    }
    const project = await svc.update(id, body);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (body.env !== undefined) {
      await secretsSvc.syncEnvBindingsForTarget?.(
        project.companyId,
        { targetType: "project", targetId: project.id },
        project.env,
      );
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.updated",
      entityType: "project",
      entityId: project.id,
      details: {
        changedKeys: Object.keys(req.body).sort(),
        envKeys:
          body.env && typeof body.env === "object" && !Array.isArray(body.env)
            ? Object.keys(body.env as Record<string, unknown>).sort()
            : undefined,
      },
    });

    res.json(project);
  });

  router.get("/projects/:id/workspaces", async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getById(id), "Project not found");
    if (!existing) return;
    const workspaces = await svc.listWorkspaces(id);
    res.json(workspaces);
  });

  router.post("/projects/:id/workspaces", validate(createProjectWorkspaceSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getById(id), "Project not found");
    if (!existing) return;
    assertNoAgentHostWorkspaceCommandMutation(
      req,
      collectProjectWorkspaceCommandPaths(req.body),
    );
    await assertNoManagedSandboxWorkspacePath(req.body);
    const workspace = await svc.createWorkspace(id, req.body);
    if (!workspace) {
      res.status(422).json({ error: "Invalid project workspace payload" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.workspace_created",
      entityType: "project",
      entityId: id,
      details: {
        workspaceId: workspace.id,
        name: workspace.name,
        cwd: workspace.cwd,
        isPrimary: workspace.isPrimary,
      },
    });

    res.status(201).json(workspace);
  });

  router.patch(
    "/projects/:id/workspaces/:workspaceId",
    validate(updateProjectWorkspaceSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const workspaceId = req.params.workspaceId as string;
      const existing = await getAccessibleResource(req, res, svc.getById(id), "Project not found");
      if (!existing) return;
      assertNoAgentHostWorkspaceCommandMutation(
        req,
        collectProjectWorkspaceCommandPaths(req.body),
      );
      await assertNoManagedSandboxWorkspacePath(req.body);
      const workspaceExists = (await svc.listWorkspaces(id)).some((workspace) => workspace.id === workspaceId);
      if (!workspaceExists) {
        res.status(404).json({ error: "Project workspace not found" });
        return;
      }
      const workspace = await svc.updateWorkspace(id, workspaceId, req.body);
      if (!workspace) {
        res.status(422).json({ error: "Invalid project workspace payload" });
        return;
      }

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: existing.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.workspace_updated",
        entityType: "project",
        entityId: id,
        details: {
          workspaceId: workspace.id,
          changedKeys: Object.keys(req.body).sort(),
        },
      });

      res.json(workspace);
    },
  );

  async function handleProjectWorkspaceRuntimeCommand(req: Request, res: Response) {
    const id = req.params.id as string;
    const workspaceId = req.params.workspaceId as string;
    const action = String(req.params.action ?? "").trim().toLowerCase();
    if (action !== "start" && action !== "stop" && action !== "restart" && action !== "run") {
      res.status(404).json({ error: "Workspace command action not found" });
      return;
    }

    const project = await getAccessibleResource(req, res, svc.getById(id), "Project not found");
    if (!project) return;

    const workspace = project.workspaces.find((entry) => entry.id === workspaceId) ?? null;
    if (!workspace) {
      res.status(404).json({ error: "Project workspace not found" });
      return;
    }
    if (!(await assertRuntimeManageAllowed(req, res, project.companyId))) return;

    const isSharedWorkspace = Boolean(workspace.sharedWorkspaceKey);
    if (
      req.actor.type === "agent"
      && isSharedWorkspace
      && SHARED_WORKSPACE_STOP_AND_RESTART_ACTIONS.has(action)
    ) {
      throw forbidden("Missing permission to manage workspace runtime services");
    }

    await assertCanManageProjectWorkspaceRuntimeServices(db, req, {
      companyId: project.companyId,
      projectWorkspaceId: workspace.id,
    });

    const workspaceCwd = workspace.cwd;
    if (!workspaceCwd) {
      res.status(422).json({ error: "Project workspace needs a local path before Paperclip can run workspace commands" });
      return;
    }

    const runtimeConfig = workspace.runtimeConfig?.workspaceRuntime ?? null;
    const target = req.body as { workspaceCommandId?: string | null; runtimeServiceId?: string | null; serviceIndex?: number | null };
    const configuredServices = runtimeConfig ? listConfiguredRuntimeServiceEntries({ workspaceRuntime: runtimeConfig }) : [];
    const workspaceCommand = runtimeConfig
      ? findWorkspaceCommandDefinition(runtimeConfig, target.workspaceCommandId ?? null)
      : null;
    if (target.workspaceCommandId && !workspaceCommand) {
      res.status(404).json({ error: "Workspace command not found for this project workspace" });
      return;
    }
    if (target.runtimeServiceId && !(workspace.runtimeServices ?? []).some((service) => service.id === target.runtimeServiceId)) {
      res.status(404).json({ error: "Runtime service not found for this project workspace" });
      return;
    }
    const matchedRuntimeService =
      workspaceCommand?.kind === "service" && !target.runtimeServiceId
        ? matchWorkspaceRuntimeServiceToCommand(workspaceCommand, workspace.runtimeServices ?? [])
        : null;
    const selectedRuntimeServiceId = target.runtimeServiceId ?? matchedRuntimeService?.id ?? null;
    const selectedServiceIndex =
      workspaceCommand?.kind === "service"
        ? workspaceCommand.serviceIndex
        : target.serviceIndex ?? null;
    if (
      selectedServiceIndex !== undefined
      && selectedServiceIndex !== null
      && (selectedServiceIndex < 0 || selectedServiceIndex >= configuredServices.length)
    ) {
      res.status(422).json({ error: "Selected runtime service is not defined in this project workspace runtime config" });
      return;
    }
    if (workspaceCommand?.kind === "job" && action !== "run") {
      res.status(422).json({ error: `Workspace job "${workspaceCommand.name}" can only be run` });
      return;
    }
    if (workspaceCommand?.kind === "service" && action === "run") {
      res.status(422).json({ error: `Workspace service "${workspaceCommand.name}" should be started or restarted, not run` });
      return;
    }
    if (action === "run" && !workspaceCommand) {
      res.status(422).json({ error: "Select a workspace job to run" });
      return;
    }
    if ((action === "start" || action === "restart") && !runtimeConfig) {
      res.status(422).json({ error: "Project workspace has no workspace command configuration" });
      return;
    }

    const actor = getActorInfo(req);
    const recorder = workspaceOperations.createRecorder({ companyId: project.companyId });
    let runtimeServiceCount = workspace.runtimeServices?.length ?? 0;
    let stdout = "";
    let stderr = "";

    const operation = await recorder.recordOperation({
      phase: action === "stop" ? "workspace_teardown" : "workspace_provision",
      command: workspaceCommand?.command ?? `workspace command ${action}`,
      cwd: workspace.cwd,
      metadata: {
        action,
        projectId: project.id,
        projectWorkspaceId: workspace.id,
        workspaceCommandId: workspaceCommand?.id ?? target.workspaceCommandId ?? null,
        workspaceCommandKind: workspaceCommand?.kind ?? null,
        workspaceCommandName: workspaceCommand?.name ?? null,
        runtimeServiceId: selectedRuntimeServiceId,
        serviceIndex: selectedServiceIndex,
      },
      run: async () => {
        if (action === "run") {
          if (!workspaceCommand || workspaceCommand.kind !== "job") {
            throw new Error("Workspace job selection is required");
          }
          return await runWorkspaceJobForControl({
            actor: {
              id: actor.agentId ?? null,
              name: actor.actorType === "user" ? "Board" : "Agent",
              companyId: project.companyId,
            },
            issue: null,
            workspace: {
              baseCwd: workspaceCwd,
              source: "project_primary",
              projectId: project.id,
              workspaceId: workspace.id,
              repoUrl: workspace.repoUrl,
              repoRef: workspace.repoRef,
              strategy: "project_primary",
              cwd: workspaceCwd,
              branchName: workspace.defaultRef ?? workspace.repoRef ?? null,
              worktreePath: null,
              warnings: [],
              created: false,
              branchCreatedByRuntime: false,
            },
            command: workspaceCommand.rawConfig,
            adapterEnv: {},
            recorder,
            metadata: {
              action,
              projectId: project.id,
              projectWorkspaceId: workspace.id,
              workspaceCommandId: workspaceCommand.id,
            },
          }).then((nestedOperation) => ({
            status: "succeeded" as const,
            exitCode: 0,
            metadata: {
              nestedOperationId: nestedOperation?.id ?? null,
              runtimeServiceCount,
            },
          }));
        }

        const onLog = async (stream: "stdout" | "stderr", chunk: string) => {
          if (stream === "stdout") stdout = appendWithCap(stdout, chunk, WORKSPACE_CONTROL_OUTPUT_MAX_CHARS);
          else stderr = appendWithCap(stderr, chunk, WORKSPACE_CONTROL_OUTPUT_MAX_CHARS);
        };

        if (action === "stop" || action === "restart") {
          await stopRuntimeServicesForProjectWorkspace({
            db,
            projectWorkspaceId: workspace.id,
            runtimeServiceId: selectedRuntimeServiceId,
          });
        }

        if (action === "start" || action === "restart") {
          const startedServices = await startRuntimeServicesForWorkspaceControl({
            db,
            actor: {
              id: actor.agentId ?? null,
              name: actor.actorType === "user" ? "Board" : "Agent",
              companyId: project.companyId,
            },
            issue: null,
            workspace: {
              baseCwd: workspaceCwd,
              source: "project_primary",
              projectId: project.id,
              workspaceId: workspace.id,
              repoUrl: workspace.repoUrl,
              repoRef: workspace.repoRef,
              strategy: "project_primary",
              cwd: workspaceCwd,
              branchName: workspace.defaultRef ?? workspace.repoRef ?? null,
              worktreePath: null,
              warnings: [],
              created: false,
              branchCreatedByRuntime: false,
            },
            config: { workspaceRuntime: runtimeConfig },
            adapterEnv: {},
            onLog,
            serviceIndex: selectedServiceIndex,
            runtimeServiceId: selectedRuntimeServiceId,
          });
          runtimeServiceCount = startedServices.length;
        } else {
          runtimeServiceCount = selectedRuntimeServiceId ? Math.max(0, (workspace.runtimeServices?.length ?? 1) - 1) : 0;
        }

        const currentDesiredState: WorkspaceRuntimeDesiredState =
          workspace.runtimeConfig?.desiredState
          ?? ((workspace.runtimeServices ?? []).some((service) =>
            service.status === "provisioning" || service.status === "starting" || service.status === "running"
          )
            ? "running"
            : "stopped");
        const nextRuntimeState: {
          desiredState: WorkspaceRuntimeDesiredState;
          serviceStates: WorkspaceRuntimeServiceStateMap | null | undefined;
        } = selectedRuntimeServiceId && (selectedServiceIndex === undefined || selectedServiceIndex === null)
          ? {
              desiredState: currentDesiredState,
              serviceStates: workspace.runtimeConfig?.serviceStates ?? null,
            }
          : buildWorkspaceRuntimeDesiredStatePatch({
              config: { workspaceRuntime: runtimeConfig },
              currentDesiredState,
              currentServiceStates: workspace.runtimeConfig?.serviceStates ?? null,
              action,
              serviceIndex: selectedServiceIndex,
            });
        await svc.updateWorkspace(project.id, workspace.id, {
          runtimeConfig: {
            desiredState: nextRuntimeState.desiredState,
            serviceStates: nextRuntimeState.serviceStates,
          },
        });

        return {
          status: "succeeded",
          stdout,
          stderr,
          system:
            action === "stop"
              ? "Stopped project workspace runtime services.\nThis does not pause issue work or held wake scheduling."
              : action === "restart"
                ? "Restarted project workspace runtime services.\nThis does not pause issue work or held wake scheduling."
                : "Started project workspace runtime services.\n",
          metadata: {
            runtimeServiceCount,
            workspaceCommandId: workspaceCommand?.id ?? target.workspaceCommandId ?? null,
            runtimeServiceId: selectedRuntimeServiceId,
            serviceIndex: selectedServiceIndex,
          },
        };
      },
    });

    const updatedWorkspace = (await svc.listWorkspaces(project.id)).find((entry) => entry.id === workspace.id) ?? workspace;

    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: `project.workspace_runtime_${action}`,
      entityType: "project",
      entityId: project.id,
      details: {
        projectWorkspaceId: workspace.id,
        runtimeServiceCount,
        workspaceCommandId: workspaceCommand?.id ?? target.workspaceCommandId ?? null,
        workspaceCommandKind: workspaceCommand?.kind ?? null,
        workspaceCommandName: workspaceCommand?.name ?? null,
        runtimeServiceId: selectedRuntimeServiceId,
        serviceIndex: selectedServiceIndex,
      },
    });

    res.json({
      workspace: updatedWorkspace,
      operation,
    });
  }

  router.post("/projects/:id/workspaces/:workspaceId/runtime-services/:action", validate(workspaceRuntimeControlTargetSchema), handleProjectWorkspaceRuntimeCommand);
  router.post("/projects/:id/workspaces/:workspaceId/runtime-commands/:action", validate(workspaceRuntimeControlTargetSchema), handleProjectWorkspaceRuntimeCommand);

  router.delete("/projects/:id/workspaces/:workspaceId", async (req, res) => {
    const id = req.params.id as string;
    const workspaceId = req.params.workspaceId as string;
    const existing = await getAccessibleResource(req, res, svc.getById(id), "Project not found");
    if (!existing) return;
    const workspace = await svc.removeWorkspace(id, workspaceId);
    if (!workspace) {
      res.status(404).json({ error: "Project workspace not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.workspace_deleted",
      entityType: "project",
      entityId: id,
      details: {
        workspaceId: workspace.id,
        name: workspace.name,
      },
    });

    res.json(workspace);
  });

  router.delete("/projects/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getById(id), "Project not found");
    if (!existing) return;
    const project = await svc.remove(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.deleted",
      entityType: "project",
      entityId: project.id,
    });

    res.json(project);
  });

  return router;
}
