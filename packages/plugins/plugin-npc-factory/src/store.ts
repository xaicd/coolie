import { randomUUID } from "node:crypto";
import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import {
  isValidRunTransition,
  type NpcArtifactType,
  type NpcDriftStatus,
  type NpcJobFamily,
  type NpcLayer,
  type NpcRoleType,
  type NpcRunStatus,
  type NpcStepStatus,
} from "./enums.js";

/**
 * NpcStore isolates all NPC-factory persistence behind one class. Runtime SQL
 * constraints enforced by the host: db.query = single SELECT/WITH; db.execute =
 * single INSERT/UPDATE/DELETE; every reference is schema-qualified with db.namespace.
 */
export interface NpcTemplateInput {
  companyId: string;
  templateKey: string;
  name: string;
  displayName?: string;
  description?: string;
  roleType?: NpcRoleType;
  jobFamily?: NpcJobFamily | null;
  microserviceLayer?: NpcLayer | null;
  artifactType?: NpcArtifactType;
  capabilities?: Record<string, unknown>;
  sop?: unknown[];
  triggers?: unknown[];
  adapterType?: string;
  systemPrompt?: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface NpcTemplateUpdate {
  name?: string;
  displayName?: string;
  description?: string;
  roleType?: NpcRoleType;
  jobFamily?: NpcJobFamily | null;
  microserviceLayer?: NpcLayer | null;
  artifactType?: NpcArtifactType;
  capabilities?: Record<string, unknown>;
  sop?: unknown[];
  triggers?: unknown[];
  adapterType?: string;
  systemPrompt?: string;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export interface NpcTemplateRow {
  id: string;
  company_id: string;
  template_key: string;
  name: string;
  role_type: NpcRoleType;
  job_family: NpcJobFamily | null;
  microservice_layer: NpcLayer | null;
  artifact_type: NpcArtifactType;
  is_active: boolean;
  version: number;
}

export interface NpcWorkflowRunInput {
  companyId: string;
  runKey: string;
  npcId?: string;
  templateId?: string | null;
  jobFamily?: NpcJobFamily | null;
  issueRef?: string | null;
  sessionRef?: string | null;
  ontologyDomainRef?: string | null;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface NpcRunStep {
  stepNo: number;
  action: string;
  tool?: string;
  status?: NpcStepStatus;
  output?: string;
  error?: string;
  [key: string]: unknown;
}

export interface NpcWorkflowRunRow {
  id: string;
  company_id: string;
  run_key: string;
  npc_id: string;
  template_id: string | null;
  job_family: NpcJobFamily | null;
  status: NpcRunStatus;
}

export interface NpcArtifactInput {
  companyId: string;
  artifactKey: string;
  artifactType?: NpcArtifactType;
  path?: string;
  description?: string;
  npcOwnerRef?: string | null;
  businessSystemRef?: string | null;
  subProjectRef?: string | null;
  ontologyDomainRef?: string | null;
  artifacts?: unknown[];
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface NpcArtifactRow {
  id: string;
  company_id: string;
  artifact_key: string;
  artifact_type: NpcArtifactType;
  path: string;
  drift_status: NpcDriftStatus;
}

export class NpcStore {
  private readonly db: PluginDatabaseClient;
  private readonly ns: string;

  constructor(db: PluginDatabaseClient) {
    this.db = db;
    this.ns = db.namespace;
  }

  private table(name: string): string {
    return `"${this.ns}".${name}`;
  }

  // --- templates ---
  private static readonly TEMPLATE_COLS =
    "id, company_id, template_key, name, role_type, job_family, microservice_layer, artifact_type, is_active, version";

  async createTemplate(input: NpcTemplateInput): Promise<NpcTemplateRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("npc_templates")}
         (id, company_id, template_key, name, display_name, description, role_type,
          job_family, microservice_layer, artifact_type, capabilities, sop, triggers,
          adapter_type, system_prompt, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16, $16, $17::jsonb)`,
      [
        id,
        input.companyId,
        input.templateKey,
        input.name,
        input.displayName ?? "",
        input.description ?? "",
        input.roleType ?? "code-maintainer",
        input.jobFamily ?? null,
        input.microserviceLayer ?? null,
        input.artifactType ?? "code",
        JSON.stringify(input.capabilities ?? {}),
        JSON.stringify(input.sop ?? []),
        JSON.stringify(input.triggers ?? []),
        input.adapterType ?? "",
        input.systemPrompt ?? "",
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return (await this.getTemplate(input.companyId, id))!;
  }

  async getTemplate(companyId: string, templateId: string): Promise<NpcTemplateRow | null> {
    const rows = await this.db.query<NpcTemplateRow>(
      `SELECT ${NpcStore.TEMPLATE_COLS} FROM ${this.table("npc_templates")}
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, templateId],
    );
    return rows[0] ?? null;
  }

  async listTemplates(companyId: string, jobFamily?: string): Promise<NpcTemplateRow[]> {
    if (jobFamily) {
      return this.db.query<NpcTemplateRow>(
        `SELECT ${NpcStore.TEMPLATE_COLS} FROM ${this.table("npc_templates")}
          WHERE company_id = $1 AND is_deleted = false AND job_family = $2
          ORDER BY created_at ASC`,
        [companyId, jobFamily],
      );
    }
    return this.db.query<NpcTemplateRow>(
      `SELECT ${NpcStore.TEMPLATE_COLS} FROM ${this.table("npc_templates")}
        WHERE company_id = $1 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId],
    );
  }

  async updateTemplate(
    companyId: string,
    templateId: string,
    update: NpcTemplateUpdate,
  ): Promise<NpcTemplateRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("npc_templates")}
          SET name               = COALESCE($3, name),
              display_name        = COALESCE($4, display_name),
              description         = COALESCE($5, description),
              role_type           = COALESCE($6, role_type),
              job_family          = CASE WHEN $7::boolean THEN $8 ELSE job_family END,
              microservice_layer  = CASE WHEN $9::boolean THEN $10 ELSE microservice_layer END,
              artifact_type       = COALESCE($11, artifact_type),
              capabilities        = CASE WHEN $12::boolean THEN $13::jsonb ELSE capabilities END,
              sop                 = CASE WHEN $14::boolean THEN $15::jsonb ELSE sop END,
              triggers            = CASE WHEN $16::boolean THEN $17::jsonb ELSE triggers END,
              adapter_type        = COALESCE($18, adapter_type),
              system_prompt       = COALESCE($19, system_prompt),
              is_active           = COALESCE($20, is_active),
              version             = version + 1,
              metadata            = CASE WHEN $21::boolean THEN $22::jsonb ELSE metadata END,
              updated_at          = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        templateId,
        update.name ?? null,
        update.displayName ?? null,
        update.description ?? null,
        update.roleType ?? null,
        update.jobFamily !== undefined,
        update.jobFamily ?? null,
        update.microserviceLayer !== undefined,
        update.microserviceLayer ?? null,
        update.artifactType ?? null,
        update.capabilities !== undefined,
        JSON.stringify(update.capabilities ?? {}),
        update.sop !== undefined,
        JSON.stringify(update.sop ?? []),
        update.triggers !== undefined,
        JSON.stringify(update.triggers ?? []),
        update.adapterType ?? null,
        update.systemPrompt ?? null,
        typeof update.isActive === "boolean" ? update.isActive : null,
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
      ],
    );
    if (res.rowCount === 0) return null;
    return this.getTemplate(companyId, templateId);
  }

  // --- workflow runs ---
  private static readonly RUN_COLS =
    "id, company_id, run_key, npc_id, template_id, job_family, status";

  async createRun(input: NpcWorkflowRunInput): Promise<NpcWorkflowRunRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("npc_workflow_runs")}
         (id, company_id, run_key, npc_id, template_id, job_family, issue_ref,
          session_ref, ontology_domain_ref, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11::jsonb)`,
      [
        id,
        input.companyId,
        input.runKey,
        input.npcId ?? "",
        input.templateId ?? null,
        input.jobFamily ?? null,
        input.issueRef ?? null,
        input.sessionRef ?? null,
        input.ontologyDomainRef ?? null,
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return (await this.getRun(input.companyId, id))!;
  }

  async getRun(companyId: string, runId: string): Promise<NpcWorkflowRunRow | null> {
    const rows = await this.db.query<NpcWorkflowRunRow>(
      `SELECT ${NpcStore.RUN_COLS} FROM ${this.table("npc_workflow_runs")}
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, runId],
    );
    return rows[0] ?? null;
  }

  async listRuns(companyId: string, limit = 100): Promise<NpcWorkflowRunRow[]> {
    const capped = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 1000)) : 100;
    return this.db.query<NpcWorkflowRunRow>(
      `SELECT ${NpcStore.RUN_COLS} FROM ${this.table("npc_workflow_runs")}
        WHERE company_id = $1 AND is_deleted = false
        ORDER BY started_at DESC
        LIMIT $2`,
      [companyId, capped],
    );
  }

  /** Advance a run, enforcing the run status transition table. */
  async transitionRun(
    companyId: string,
    runId: string,
    to: NpcRunStatus,
    patch: { error?: string } = {},
  ): Promise<NpcWorkflowRunRow | null> {
    const current = await this.getRun(companyId, runId);
    if (!current) return null;
    if (!isValidRunTransition(current.status, to)) {
      throw new Error(`Illegal run transition: ${current.status} -> ${to}`);
    }
    const terminal = to === "completed" || to === "failed" || to === "cancelled";
    const res = await this.db.execute(
      `UPDATE ${this.table("npc_workflow_runs")}
          SET status = $3,
              error = COALESCE($4, error),
              ended_at = CASE WHEN $5 THEN now() ELSE ended_at END,
              total_duration_ms = CASE WHEN $5
                THEN CAST(EXTRACT(EPOCH FROM (now() - started_at)) * 1000 AS integer)
                ELSE total_duration_ms END,
              updated_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, runId, to, patch.error ?? null, terminal],
    );
    if (res.rowCount === 0) return null;
    return this.getRun(companyId, runId);
  }

  /** Append (or replace) a step by stepNo in the run steps array. */
  async appendRunStep(
    companyId: string,
    runId: string,
    step: NpcRunStep,
  ): Promise<NpcWorkflowRunRow | null> {
    const rows = await this.db.query<{ steps: NpcRunStep[] }>(
      `SELECT steps FROM ${this.table("npc_workflow_runs")}
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, runId],
    );
    if (rows.length === 0) return null;
    const steps = Array.isArray(rows[0]!.steps) ? rows[0]!.steps : [];
    const idx = steps.findIndex((s) => Number(s.stepNo) === Number(step.stepNo));
    if (idx >= 0) steps[idx] = { ...steps[idx], ...step };
    else steps.push(step);
    await this.db.execute(
      `UPDATE ${this.table("npc_workflow_runs")}
          SET steps = $3::jsonb, updated_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, runId, JSON.stringify(steps)],
    );
    return this.getRun(companyId, runId);
  }

  // --- artifact registry ---
  private static readonly ARTIFACT_COLS =
    "id, company_id, artifact_key, artifact_type, path, drift_status";

  async registerArtifact(input: NpcArtifactInput): Promise<NpcArtifactRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("npc_artifact_registry")}
         (id, company_id, artifact_key, artifact_type, path, description, npc_owner_ref,
          business_system_ref, sub_project_ref, ontology_domain_ref, artifacts, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $12, $13::jsonb)`,
      [
        id,
        input.companyId,
        input.artifactKey,
        input.artifactType ?? "code",
        input.path ?? "",
        input.description ?? "",
        input.npcOwnerRef ?? null,
        input.businessSystemRef ?? null,
        input.subProjectRef ?? null,
        input.ontologyDomainRef ?? null,
        JSON.stringify(input.artifacts ?? []),
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<NpcArtifactRow>(
      `SELECT ${NpcStore.ARTIFACT_COLS} FROM ${this.table("npc_artifact_registry")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listArtifacts(companyId: string, driftStatus?: string): Promise<NpcArtifactRow[]> {
    if (driftStatus) {
      return this.db.query<NpcArtifactRow>(
        `SELECT ${NpcStore.ARTIFACT_COLS} FROM ${this.table("npc_artifact_registry")}
          WHERE company_id = $1 AND is_deleted = false AND drift_status = $2
          ORDER BY created_at ASC`,
        [companyId, driftStatus],
      );
    }
    return this.db.query<NpcArtifactRow>(
      `SELECT ${NpcStore.ARTIFACT_COLS} FROM ${this.table("npc_artifact_registry")}
        WHERE company_id = $1 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId],
    );
  }

  async setArtifactDrift(
    companyId: string,
    artifactId: string,
    status: NpcDriftStatus,
    reason = "",
  ): Promise<NpcArtifactRow | null> {
    const synced = status === "synced";
    const res = await this.db.execute(
      `UPDATE ${this.table("npc_artifact_registry")}
          SET drift_status = $3,
              drift_reason = $4,
              last_checked_at = now(),
              last_synced_at = CASE WHEN $5 THEN now() ELSE last_synced_at END,
              updated_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, artifactId, status, reason, synced],
    );
    if (res.rowCount === 0) return null;
    const rows = await this.db.query<NpcArtifactRow>(
      `SELECT ${NpcStore.ARTIFACT_COLS} FROM ${this.table("npc_artifact_registry")}
        WHERE company_id = $1 AND id = $2`,
      [companyId, artifactId],
    );
    return rows[0] ?? null;
  }
}
