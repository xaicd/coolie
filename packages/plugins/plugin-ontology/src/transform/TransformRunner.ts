/**
 * TransformRunner — executes ontology transforms against the live
 * Postgres connection. Phase 4 ships SQL transforms only; Python
 * transforms are stubbed with a "would execute" log line because we
 * don't ship a Python runtime in this plugin.
 *
 * Contract:
 *   - Reads each input dataset's `data_schema` (a JSON declaration
 *     of columns). The runner does NOT materialise rows — the
 *     transform's `code` field is expected to declare its own data
 *     sources via a single SELECT statement.
 *   - Statements are wrapped in a SAVEPOINT so a runtime error can't
 *     poison the shared connection pool. Multi-statement SQL is
 *     rejected.
 *   - On success: the output dataset's `metadata` gets
 *     `{ lastRowCount, lastSample, lastExecutedAt }`; the transform's
 *     status flips to 'success' and `last_executed_at` is set.
 *   - On failure: status flips to 'failed' with `lastError`.
 *
 * Synchronous from the worker's perspective — returns a plain object,
 * no streams. Long-running transforms should move to a background
 * job runner in a later phase.
 */
import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import type { GraphStore } from "../graph/GraphStore.js";

export interface TransformRunResult {
  ok: boolean;
  transformId: string;
  rowCount?: number;
  sample?: Record<string, unknown>[];
  error?: string;
  executedAt: string;
}

const MAX_SAMPLE_ROWS = 5;

export async function runTransform(
  store: GraphStore,
  db: PluginDatabaseClient,
  companyId: string,
  domainId: string,
  transformId: string,
): Promise<TransformRunResult> {
  // Read the transform row via a single-row query — listTransforms
  // returns OntologyTransformRow which doesn't include `code`, so we
  // issue a focused SELECT. Phase 8+ can add store.getTransform().
  const rows = (await db.query<{
    id: string;
    transform_type: string;
    code: string | null;
    output_dataset_id: string | null;
  }>(
    `SELECT id, transform_type, code, output_dataset_id
       FROM ${store.table("ontology_transforms")}
      WHERE company_id = $1 AND domain_id = $2 AND id = $3 AND is_deleted = false`,
    [companyId, domainId, transformId],
  ).catch(() => [])) as Array<{
    id: string;
    transform_type: string;
    code: string | null;
    output_dataset_id: string | null;
  }>;

  const row = rows[0];
  if (!row) {
    return {
      ok: false,
      transformId,
      error: "Transform not found",
      executedAt: new Date().toISOString(),
    };
  }

  // Python transforms are out of scope for Phase 4 — record a clear
  // stub result in metadata so the user knows the surface exists but
  // is not implemented.
  if (row.transform_type === "python") {
    const executedAt = new Date().toISOString();
    await store.updateTransform(companyId, transformId, {
      markExecuted: true,
      metadata: {
        lastError: "Python transforms are not implemented in this build",
        lastExecutedAt: executedAt,
      },
    });
    return {
      ok: false,
      transformId,
      error: "Python transforms are not implemented in this build",
      executedAt,
    };
  }

  const code = row.code?.trim() ?? "";
  if (!code) {
    return markFailed(store, companyId, transformId, "Transform has no SQL code to execute");
  }
  if (!/^\s*SELECT/i.test(code)) {
    return markFailed(
      store,
      companyId,
      transformId,
      "Only SELECT statements are allowed in transform code",
    );
  }
  if (/;\s*\S/.test(code)) {
    return markFailed(
      store,
      companyId,
      transformId,
      "Multi-statement SQL is not allowed; rewrite as a single SELECT",
    );
  }

  const executedAt = new Date().toISOString();
  try {
    await db.execute("SAVEPOINT transform_run");
    let resultRows: Record<string, unknown>[] = [];
    try {
      const result = (await db.query(code, [])) as unknown;
      resultRows = Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
      await db.execute("RELEASE SAVEPOINT transform_run");
    } catch (e) {
      await db.execute("ROLLBACK TO SAVEPOINT transform_run").catch(() => undefined);
      await db.execute("RELEASE SAVEPOINT transform_run").catch(() => undefined);
      throw e;
    }

    const sample = resultRows.slice(0, MAX_SAMPLE_ROWS);

    if (row.output_dataset_id) {
      await store.updateDataset(companyId, row.output_dataset_id, {
        metadata: {
          lastRowCount: resultRows.length,
          lastSample: sample,
          lastExecutedAt: executedAt,
        },
      });
    }

    await store.updateTransform(companyId, transformId, {
      markExecuted: true,
      metadata: {
        lastRowCount: resultRows.length,
        lastExecutedAt: executedAt,
      },
    });

    return {
      ok: true,
      transformId,
      rowCount: resultRows.length,
      sample,
      executedAt,
    };
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    await markFailed(store, companyId, transformId, message, executedAt);
    return { ok: false, transformId, error: message, executedAt };
  }
}

async function markFailed(
  store: GraphStore,
  companyId: string,
  transformId: string,
  message: string,
  executedAt?: string,
): Promise<TransformRunResult> {
  const ts = executedAt ?? new Date().toISOString();
  await store.updateTransform(companyId, transformId, {
    markExecuted: true,
    metadata: {
      lastError: message,
      lastExecutedAt: ts,
    },
  });
  return {
    ok: false,
    transformId,
    error: message,
    executedAt: ts,
  };
}
