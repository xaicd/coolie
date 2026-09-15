import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import {
  type SchemaSnapshot,
  serializeDomain,
  type SnapshotMetadata,
} from "./snapshots.js";

/**
 * Persistence layer for the 数字副手 (Digital Aide) chat. One session row per
 * (companyId, domainId); messages are append-only and ordered by created_at.
 *
 * Schema lives in migrations/010_aide.sql. All queries are namespace-scoped
 * through `db.namespace` so they follow the plugin's table-isolation rules.
 *
 * Snapshots (migrations/011_aide_snapshots.sql) live in the same store so
 * the restore / list / create lifecycle stays cohesive with the chat
 * persistence — they share the same (companyId, domainId) scope.
 */

export type AideRole = "user" | "assistant";

export interface AideCitation {
  kind: "node-type" | "relation-type" | "node" | "sub-project" | "action-type" | "business-system";
  id: string;
}

export interface AideMessageRecord {
  id: number;
  role: AideRole;
  content: string;
  citations: AideCitation[];
  createdAt: string;
}

export interface AideSessionSummary {
  companyId: string;
  domainId: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export class AideStore {
  constructor(private readonly db: PluginDatabaseClient) {}

  private ns(): string {
    return this.db.namespace;
  }

  /**
   * Idempotently create the session row so that the updated_at column always
   * reflects the latest message even on the very first turn (where the row
   * does not exist yet).
   */
  async ensureSession(companyId: string, domainId: string): Promise<AideSessionSummary> {
    await this.db.execute(
      `INSERT INTO ${this.ns()}.ontology_aide_sessions (company_id, domain_id)
       VALUES ($1, $2)
       ON CONFLICT (company_id, domain_id) DO NOTHING`,
      [companyId, domainId],
    );
    const rows = await this.db.query<{
      created_at: string;
      updated_at: string;
      message_count: number;
    }>(
      `SELECT created_at, updated_at, message_count
         FROM ${this.ns()}.ontology_aide_sessions
        WHERE company_id = $1 AND domain_id = $2`,
      [companyId, domainId],
    );
    const row = rows[0];
    return {
      companyId,
      domainId,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: row.message_count,
    };
  }

  async appendMessage(
    companyId: string,
    domainId: string,
    role: AideRole,
    content: string,
    citations: AideCitation[] = [],
  ): Promise<void> {
    await this.ensureSession(companyId, domainId);
    await this.db.execute(
      `INSERT INTO ${this.ns()}.ontology_aide_messages (company_id, domain_id, role, content, citations)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [companyId, domainId, role, content, JSON.stringify(citations)],
    );
    await this.db.execute(
      `UPDATE ${this.ns()}.ontology_aide_sessions
          SET updated_at = now(),
              message_count = message_count + 1
        WHERE company_id = $1 AND domain_id = $2`,
      [companyId, domainId],
    );
  }

  /**
   * Load full conversation history in chronological order. The worker trims
   * the returned list to the most recent N entries before sending to the LLM
   * so we do not blow past the context window — this method just returns
   * everything in storage.
   */
  async loadHistory(
    companyId: string,
    domainId: string,
    limit = 500,
  ): Promise<AideMessageRecord[]> {
    const rows = await this.db.query<{
      id: number;
      role: AideRole;
      content: string;
      citations: unknown;
      created_at: string;
    }>(
      `SELECT id, role, content, citations, created_at
         FROM ${this.ns()}.ontology_aide_messages
        WHERE company_id = $1 AND domain_id = $2
        ORDER BY created_at ASC, id ASC
        LIMIT $3`,
      [companyId, domainId, limit],
    );
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      citations: parseCitations(row.citations),
      createdAt: row.created_at,
    }));
  }

  /**
   * Hard-clear both the session row and all its messages — bound to the
   * "清空会话" UI affordance. Returns the number of messages deleted so the
   * caller can show a confirmation count. Also drops snapshots — once
   * the session is gone, there's no point keeping historical schemas.
   */
  async clearSession(companyId: string, domainId: string): Promise<{ deletedMessages: number; deletedSnapshots: number }> {
    await this.db.execute(
      `DELETE FROM ${this.ns()}.ontology_aide_messages
        WHERE company_id = $1 AND domain_id = $2`,
      [companyId, domainId],
    );
    const msgRes = await this.db.execute(
      `DELETE FROM ${this.ns()}.ontology_aide_sessions
        WHERE company_id = $1 AND domain_id = $2`,
      [companyId, domainId],
    );
    const snapRes = await this.db.execute(
      `DELETE FROM ${this.ns()}.ontology_aide_snapshots
        WHERE company_id = $1 AND domain_id = $2`,
      [companyId, domainId],
    );
    return {
      deletedMessages: Number(msgRes.rowCount ?? 0),
      deletedSnapshots: Number(snapRes.rowCount ?? 0),
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Snapshots — schema history per (companyId, domainId)              */
  /* ------------------------------------------------------------------ */

  /**
   * Create a snapshot row capturing the *pre-edit* schema. We compute the
   * next version inside the same SQL so concurrent applies cannot pick the
   * same version number — the UNIQUE (company, domain, version) constraint
   * backs us up.
   */
  async createSnapshot(params: {
    companyId: string;
    domainId: string;
    label: string;
    intent: string;
    summary: string;
    opCount: number;
    schema: SchemaSnapshot;
    createdBy: string;
  }): Promise<SnapshotMetadata> {
    const versionRow = await this.db.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
         FROM ${this.ns()}.ontology_aide_snapshots
        WHERE company_id = $1 AND domain_id = $2`,
      [params.companyId, params.domainId],
    );
    const nextVersion = versionRow[0]?.next_version ?? 1;
    const rows = await this.db.query<{
      id: number;
      version: number;
      created_at: string;
    }>(
      `INSERT INTO ${this.ns()}.ontology_aide_snapshots
         (company_id, domain_id, version, label, intent, summary,
          op_count, schema_snapshot, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       RETURNING id, version, created_at`,
      [
        params.companyId,
        params.domainId,
        nextVersion,
        params.label,
        params.intent,
        params.summary,
        params.opCount,
        JSON.stringify(params.schema),
        params.createdBy,
      ],
    );
    const row = rows[0];
    return {
      id: row.id,
      version: row.version,
      label: params.label,
      intent: params.intent,
      summary: params.summary,
      opCount: params.opCount,
      createdAt: row.created_at,
      createdBy: params.createdBy,
    };
  }

  /** List snapshots newest-first, with the schema blob included. */
  async listSnapshots(
    companyId: string,
    domainId: string,
    limit = 50,
  ): Promise<Array<SnapshotMetadata & { schema: SchemaSnapshot }>> {
    const rows = await this.db.query<{
      id: number;
      version: number;
      label: string;
      intent: string;
      summary: string;
      op_count: number;
      schema_snapshot: unknown;
      created_at: string;
      created_by: string;
    }>(
      `SELECT id, version, label, intent, summary, op_count,
              schema_snapshot, created_at, created_by
         FROM ${this.ns()}.ontology_aide_snapshots
        WHERE company_id = $1 AND domain_id = $2
        ORDER BY version DESC
        LIMIT $3`,
      [companyId, domainId, limit],
    );
    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      label: row.label,
      intent: row.intent,
      summary: row.summary,
      opCount: row.op_count,
      schema: parseSchemaSnapshot(row.schema_snapshot),
      createdAt: row.created_at,
      createdBy: row.created_by,
    }));
  }

  /** Fetch a single snapshot — used by the Drawer's Diff / Restore flow. */
  async getSnapshot(
    companyId: string,
    domainId: string,
    version: number,
  ): Promise<(SnapshotMetadata & { schema: SchemaSnapshot }) | null> {
    const rows = await this.db.query<{
      id: number;
      version: number;
      label: string;
      intent: string;
      summary: string;
      op_count: number;
      schema_snapshot: unknown;
      created_at: string;
      created_by: string;
    }>(
      `SELECT id, version, label, intent, summary, op_count,
              schema_snapshot, created_at, created_by
         FROM ${this.ns()}.ontology_aide_snapshots
        WHERE company_id = $1 AND domain_id = $2 AND version = $3`,
      [companyId, domainId, version],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      version: row.version,
      label: row.label,
      intent: row.intent,
      summary: row.summary,
      opCount: row.op_count,
      schema: parseSchemaSnapshot(row.schema_snapshot),
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }

  /** Serialize the live describe-domain result through `serializeDomain` —
   *  thin wrapper kept here so callers don't import `snapshots.ts`
   *  directly. Accepts the structural `DescribeDomainLike` so worker-side
   *  callers can pass the narrower GraphStore shape. */
  buildSchemaSnapshot(domain: import("./snapshots.js").DescribeDomainLike): SchemaSnapshot {
    return serializeDomain(domain);
  }
}

function parseCitations(value: unknown): AideCitation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const obj = entry as { kind?: unknown; id?: unknown };
    if (typeof obj.kind !== "string" || typeof obj.id !== "string") return [];
    return [{ kind: obj.kind as AideCitation["kind"], id: obj.id }];
  });
}

function parseSchemaSnapshot(value: unknown): SchemaSnapshot {
  if (!value || typeof value !== "object") {
    return { nodeTypes: [], relationTypes: [], actionTypes: [] };
  }
  const obj = value as {
    nodeTypes?: unknown;
    relationTypes?: unknown;
    actionTypes?: unknown;
  };
  return {
    nodeTypes: Array.isArray(obj.nodeTypes)
      ? (obj.nodeTypes as SchemaSnapshot["nodeTypes"])
      : [],
    relationTypes: Array.isArray(obj.relationTypes)
      ? (obj.relationTypes as SchemaSnapshot["relationTypes"])
      : [],
    actionTypes: Array.isArray(obj.actionTypes)
      ? (obj.actionTypes as SchemaSnapshot["actionTypes"])
      : [],
  };
}
