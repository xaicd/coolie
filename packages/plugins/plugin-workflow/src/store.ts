import { randomUUID } from "node:crypto";
import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import {
  isValidExecutionTransition,
  type WorkflowConfigStatus,
  type WorkflowEngineMode,
  type WorkflowExecutionMode,
  type WorkflowExecutionStatus,
  type WorkflowNodeStatus,
} from "./enums.js";

/**
 * WorkflowStore isolates all workflow-center persistence behind one class.
 * A config is a node-DAG definition; an execution runs a config with a run
 * state machine and per-node status. Runtime SQL constraints enforced by the
 * host: db.query = single SELECT/WITH; db.execute = single INSERT/UPDATE/DELETE;
 * every reference is schema-qualified with db.namespace.
 */
export interface WorkflowConfigInput {
  companyId: string;
  configKey: string;
  name: string;
  description?: string;
  category?: string;
  nodes?: unknown[];
  edges?: unknown[];
  execution?: Record<string, unknown>;
  executionMode?: WorkflowEngineMode;
  triggers?: unknown[];
  isTemplate?: boolean;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowConfigUpdate {
  name?: string;
  description?: string;
  category?: string;
  nodes?: unknown[];
  edges?: unknown[];
  execution?: Record<string, unknown>;
  executionMode?: WorkflowEngineMode;
  triggers?: unknown[];
  status?: WorkflowConfigStatus;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface WorkflowConfigRow {
  id: string;
  company_id: string;
  config_key: string;
  name: string;
  category: string;
  execution_mode: WorkflowEngineMode;
  status: WorkflowConfigStatus;
  version: number;
  enabled: boolean;
}

export interface WorkflowExecutionInput {
  companyId: string;
  executionKey: string;
  workflowId?: string | null;
  workflowName?: string;
  workflowVersion?: string;
  triggerType?: string;
  inputs?: Record<string, unknown>;
  sessionRef?: string | null;
  issueRef?: string | null;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowNodeExecution {
  nodeId: string;
  status?: WorkflowNodeStatus;
  agentName?: string;
  output?: unknown;
  error?: string;
  [key: string]: unknown;
}

export interface WorkflowExecutionRow {
  id: string;
  company_id: string;
  execution_key: string;
  workflow_id: string | null;
  workflow_name: string;
  status: WorkflowExecutionStatus;
}

export class WorkflowStore {
  private readonly db: PluginDatabaseClient;
  private readonly ns: string;

  constructor(db: PluginDatabaseClient) {
    this.db = db;
    this.ns = db.namespace;
  }

  private table(name: string): string {
    return `"${this.ns}".${name}`;
  }

  // --- configs ---
  private static readonly CONFIG_COLS =
    "id, company_id, config_key, name, category, execution_mode, status, version, enabled";

  async createConfig(input: WorkflowConfigInput): Promise<WorkflowConfigRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("workflow_configs")}
         (id, company_id, config_key, name, description, category, nodes, edges,
          execution, execution_mode, triggers, is_template, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11::jsonb, $12, $13, $13, $14::jsonb)`,
      [
        id,
        input.companyId,
        input.configKey,
        input.name,
        input.description ?? "",
        input.category ?? "custom",
        JSON.stringify(input.nodes ?? []),
        JSON.stringify(input.edges ?? []),
        JSON.stringify(
          input.execution ?? {
            mode: "sequential",
            timeoutSec: 600,
            continueOnError: false,
            trackProgress: true,
          },
        ),
        input.executionMode ?? "hybrid",
        JSON.stringify(input.triggers ?? []),
        input.isTemplate ?? false,
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return (await this.getConfig(input.companyId, id))!;
  }

  async getConfig(companyId: string, configId: string): Promise<WorkflowConfigRow | null> {
    const rows = await this.db.query<WorkflowConfigRow>(
      `SELECT ${WorkflowStore.CONFIG_COLS} FROM ${this.table("workflow_configs")}
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, configId],
    );
    return rows[0] ?? null;
  }

  async listConfigs(companyId: string, category?: string): Promise<WorkflowConfigRow[]> {
    if (category) {
      return this.db.query<WorkflowConfigRow>(
        `SELECT ${WorkflowStore.CONFIG_COLS} FROM ${this.table("workflow_configs")}
          WHERE company_id = $1 AND is_deleted = false AND category = $2
          ORDER BY created_at ASC`,
        [companyId, category],
      );
    }
    return this.db.query<WorkflowConfigRow>(
      `SELECT ${WorkflowStore.CONFIG_COLS} FROM ${this.table("workflow_configs")}
        WHERE company_id = $1 AND is_deleted = false
        ORDER BY created_at ASC`,
      [companyId],
    );
  }

  /** Update mutable config fields and bump its version. */
  async updateConfig(
    companyId: string,
    configId: string,
    update: WorkflowConfigUpdate,
  ): Promise<WorkflowConfigRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("workflow_configs")}
          SET name           = COALESCE($3, name),
              description     = COALESCE($4, description),
              category        = COALESCE($5, category),
              nodes           = CASE WHEN $6::boolean THEN $7::jsonb ELSE nodes END,
              edges           = CASE WHEN $8::boolean THEN $9::jsonb ELSE edges END,
              execution       = CASE WHEN $10::boolean THEN $11::jsonb ELSE execution END,
              execution_mode  = COALESCE($12, execution_mode),
              triggers        = CASE WHEN $13::boolean THEN $14::jsonb ELSE triggers END,
              status          = COALESCE($15, status),
              enabled         = COALESCE($16, enabled),
              version         = version + 1,
              metadata        = CASE WHEN $17::boolean THEN $18::jsonb ELSE metadata END,
              updated_at      = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        configId,
        update.name ?? null,
        update.description ?? null,
        update.category ?? null,
        update.nodes !== undefined,
        JSON.stringify(update.nodes ?? []),
        update.edges !== undefined,
        JSON.stringify(update.edges ?? []),
        update.execution !== undefined,
        JSON.stringify(update.execution ?? {}),
        update.executionMode ?? null,
        update.triggers !== undefined,
        JSON.stringify(update.triggers ?? []),
        update.status ?? null,
        typeof update.enabled === "boolean" ? update.enabled : null,
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
      ],
    );
    if (res.rowCount === 0) return null;
    return this.getConfig(companyId, configId);
  }

  // --- executions ---
  private static readonly EXECUTION_COLS =
    "id, company_id, execution_key, workflow_id, workflow_name, status";

  async createExecution(input: WorkflowExecutionInput): Promise<WorkflowExecutionRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("workflow_executions")}
         (id, company_id, execution_key, workflow_id, workflow_name, workflow_version,
          trigger_type, inputs, session_ref, issue_ref, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $11, $12::jsonb)`,
      [
        id,
        input.companyId,
        input.executionKey,
        input.workflowId ?? null,
        input.workflowName ?? "",
        input.workflowVersion ?? "1.0.0",
        input.triggerType ?? "manual",
        JSON.stringify(input.inputs ?? {}),
        input.sessionRef ?? null,
        input.issueRef ?? null,
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return (await this.getExecution(input.companyId, id))!;
  }

  async getExecution(companyId: string, executionId: string): Promise<WorkflowExecutionRow | null> {
    const rows = await this.db.query<WorkflowExecutionRow>(
      `SELECT ${WorkflowStore.EXECUTION_COLS} FROM ${this.table("workflow_executions")}
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, executionId],
    );
    return rows[0] ?? null;
  }

  async listExecutions(companyId: string, limit = 100): Promise<WorkflowExecutionRow[]> {
    const capped = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 1000)) : 100;
    return this.db.query<WorkflowExecutionRow>(
      `SELECT ${WorkflowStore.EXECUTION_COLS} FROM ${this.table("workflow_executions")}
        WHERE company_id = $1 AND is_deleted = false
        ORDER BY start_time DESC
        LIMIT $2`,
      [companyId, capped],
    );
  }

  /** Advance an execution, enforcing the execution status transition table. */
  async transitionExecution(
    companyId: string,
    executionId: string,
    to: WorkflowExecutionStatus,
    patch: { error?: string; outputs?: Record<string, unknown> } = {},
  ): Promise<WorkflowExecutionRow | null> {
    const current = await this.getExecution(companyId, executionId);
    if (!current) return null;
    if (!isValidExecutionTransition(current.status, to)) {
      throw new Error(`Illegal execution transition: ${current.status} -> ${to}`);
    }
    const terminal = to === "completed" || to === "failed" || to === "cancelled";
    const res = await this.db.execute(
      `UPDATE ${this.table("workflow_executions")}
          SET status = $3,
              error = COALESCE($4, error),
              outputs = CASE WHEN $5::boolean THEN $6::jsonb ELSE outputs END,
              end_time = CASE WHEN $7 THEN now() ELSE end_time END,
              execution_time_ms = CASE WHEN $7
                THEN CAST(EXTRACT(EPOCH FROM (now() - start_time)) * 1000 AS integer)
                ELSE execution_time_ms END,
              updated_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        executionId,
        to,
        patch.error ?? null,
        patch.outputs !== undefined,
        JSON.stringify(patch.outputs ?? {}),
        terminal,
      ],
    );
    if (res.rowCount === 0) return null;
    return this.getExecution(companyId, executionId);
  }

  /** Upsert a per-node execution record by nodeId in the node_executions array. */
  async updateNodeExecution(
    companyId: string,
    executionId: string,
    node: WorkflowNodeExecution,
  ): Promise<WorkflowExecutionRow | null> {
    const rows = await this.db.query<{ node_executions: WorkflowNodeExecution[] }>(
      `SELECT node_executions FROM ${this.table("workflow_executions")}
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, executionId],
    );
    if (rows.length === 0) return null;
    const list = Array.isArray(rows[0]!.node_executions) ? rows[0]!.node_executions : [];
    const idx = list.findIndex((n) => String(n.nodeId) === String(node.nodeId));
    if (idx >= 0) list[idx] = { ...list[idx], ...node };
    else list.push(node);
    await this.db.execute(
      `UPDATE ${this.table("workflow_executions")}
          SET node_executions = $3::jsonb, updated_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, executionId, JSON.stringify(list)],
    );
    return this.getExecution(companyId, executionId);
  }
}
