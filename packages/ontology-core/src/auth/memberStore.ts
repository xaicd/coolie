/**
 * The SQL behind members.
 *
 * Separate from the graph store because members are identity, not the business
 * map: they are read on every authenticated request, they never take part in a
 * domain, and they must not move the schema version.
 *
 * Still only the `SqlClient` port, so this works as a plugin and standalone.
 */

import { randomUUID } from "node:crypto";
import type { SqlClient } from "../graph/SqlClient.js";
import { MEMBER_STATUSES, knownRoles, type MemberRecord } from "./members.js";

const MEMBER_COLS = `id, tenant_id, actor_ref, display_name, roles, status`;

/** jsonb arrives as a parsed array through `pg` and as text through some hosts. */
function parseRoles(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toRecord(row: Record<string, unknown>): MemberRecord {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    actor_ref: String(row.actor_ref ?? ""),
    display_name: String(row.display_name ?? ""),
    roles: parseRoles(row.roles),
    status: String(row.status ?? "active"),
    is_deleted: row.is_deleted === true,
  };
}

export interface MemberStore {
  create(input: {
    tenantId: string;
    actorRef: string;
    displayName?: string;
    roles?: string[];
    status?: string;
    createdBy?: string;
  }): Promise<MemberRecord>;
  getById(tenantId: string, id: string): Promise<MemberRecord | null>;
  getByRef(tenantId: string, actorRef: string): Promise<MemberRecord | null>;
  list(tenantId: string): Promise<MemberRecord[]>;
  update(
    tenantId: string,
    id: string,
    update: { roles?: string[]; status?: string; displayName?: string },
  ): Promise<MemberRecord | null>;
  /** Soft: who did this has to survive the decision to stop them. */
  remove(tenantId: string, id: string): Promise<boolean>;
}

export function createMemberStore(db: SqlClient): MemberStore {
  const table = `"${db.namespace}".ontology_members`;

  const read = async (sql: string, params: unknown[]): Promise<MemberRecord | null> => {
    const rows = await db.query<Record<string, unknown>>(sql, params);
    return rows[0] ? toRecord(rows[0]) : null;
  };

  return {
    async create(input) {
      const id = randomUUID();
      // Unknown roles are dropped rather than stored: a role nobody will ever
      // check is a grant that looks real in a list and does nothing.
      const roles = knownRoles(input.roles ?? []);
      await db.execute(`INSERT INTO ${table} (id, tenant_id, actor_ref, display_name, roles, status, created_by) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`, [
        id,
        input.tenantId,
        input.actorRef,
        input.displayName ?? "",
        JSON.stringify(roles),
        input.status ?? "active",
        input.createdBy ?? "system",
      ]);
      const created = await read(
        `SELECT ${MEMBER_COLS} FROM ${table} WHERE tenant_id = $1 AND id = $2`,
        [input.tenantId, id],
      );
      if (!created) throw new Error("Member was not found after insert");
      return created;
    },

    getById: (tenantId, id) =>
      read(`SELECT ${MEMBER_COLS} FROM ${table} WHERE tenant_id = $1 AND id = $2 AND is_deleted = false`, [tenantId, id]),

    getByRef: (tenantId, actorRef) =>
      read(
        `SELECT ${MEMBER_COLS} FROM ${table} WHERE tenant_id = $1 AND actor_ref = $2 AND is_deleted = false`,
        [tenantId, actorRef],
      ),

    async list(tenantId) {
      const rows = await db.query<Record<string, unknown>>(
        `SELECT ${MEMBER_COLS} FROM ${table} WHERE tenant_id = $1 AND is_deleted = false ORDER BY actor_ref`,
        [tenantId],
      );
      return rows.map(toRecord);
    },

    async update(tenantId, id, update) {
      const sets: string[] = [];
      const params: unknown[] = [tenantId, id];
      if (update.roles !== undefined) {
        params.push(JSON.stringify(knownRoles(update.roles)));
        sets.push(`roles = $${params.length}::jsonb`);
      }
      if (update.status !== undefined) {
        params.push(update.status);
        sets.push(`status = $${params.length}`);
      }
      if (update.displayName !== undefined) {
        params.push(update.displayName);
        sets.push(`display_name = $${params.length}`);
      }
      if (sets.length === 0) return this.getById(tenantId, id);
      await db.execute(
        `UPDATE ${table} SET ${sets.join(", ")}, updated_at = now() WHERE tenant_id = $1 AND id = $2 AND is_deleted = false`,
        params,
      );
      return this.getById(tenantId, id);
    },

    async remove(tenantId, id) {
      const result = await db.execute(
        `UPDATE ${table} SET is_deleted = true, updated_at = now() WHERE tenant_id = $1 AND id = $2 AND is_deleted = false`,
        [tenantId, id],
      );
      return result.rowCount > 0;
    },
  };
}

export { MEMBER_STATUSES };
