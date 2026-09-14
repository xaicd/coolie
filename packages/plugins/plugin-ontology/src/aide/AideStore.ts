import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";

/**
 * Persistence layer for the 数字副手 (Digital Aide) chat. One session row per
 * (companyId, domainId); messages are append-only and ordered by created_at.
 *
 * Schema lives in migrations/010_aide.sql. All queries are namespace-scoped
 * through `db.namespace` so they follow the plugin's table-isolation rules.
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
   * caller can show a confirmation count.
   */
  async clearSession(companyId: string, domainId: string): Promise<{ deletedMessages: number }> {
    await this.db.execute(
      `DELETE FROM ${this.ns()}.ontology_aide_messages
        WHERE company_id = $1 AND domain_id = $2`,
      [companyId, domainId],
    );
    const res = await this.db.execute(
      `DELETE FROM ${this.ns()}.ontology_aide_sessions
        WHERE company_id = $1 AND domain_id = $2`,
      [companyId, domainId],
    );
    return { deletedMessages: Number(res.rowCount ?? 0) };
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