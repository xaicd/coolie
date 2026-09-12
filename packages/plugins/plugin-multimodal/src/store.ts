import { randomUUID } from "node:crypto";
import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import type { AsrProvider, AudioFormat, TranscriptionStatus } from "./enums.js";

/**
 * MultimodalStore isolates transcription persistence. Runtime SQL constraints
 * enforced by the host: db.query = single SELECT/WITH; db.execute = single
 * INSERT/UPDATE/DELETE; every reference is schema-qualified with db.namespace.
 * Audio bytes are never stored — only length and the derived text.
 */
export interface TranscriptionCreateInput {
  companyId: string;
  transcriptionKey: string;
  provider?: AsrProvider;
  engineType?: string;
  audioFormat?: AudioFormat | string;
  audioBytes?: number;
  sourceRef?: string | null;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface TranscriptionRow {
  id: string;
  company_id: string;
  transcription_key: string;
  provider: AsrProvider;
  engine_type: string;
  audio_format: string;
  audio_bytes: number;
  status: TranscriptionStatus;
  text: string;
  error: string;
  duration_ms: number;
  request_id: string;
  source_ref: string | null;
  created_at: string;
}

export class MultimodalStore {
  private readonly db: PluginDatabaseClient;
  private readonly ns: string;

  constructor(db: PluginDatabaseClient) {
    this.db = db;
    this.ns = db.namespace;
  }

  private table(name: string): string {
    return `"${this.ns}".${name}`;
  }

  private static readonly COLS =
    "id, company_id, transcription_key, provider, engine_type, audio_format, " +
    "audio_bytes, status, text, error, duration_ms, request_id, source_ref, created_at";

  /** Create a pending transcription record. Idempotent by transcription_key. */
  async createPending(input: TranscriptionCreateInput): Promise<TranscriptionRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("mm_transcriptions")}
         (id, company_id, transcription_key, provider, engine_type, audio_format,
          audio_bytes, source_ref, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10::jsonb)`,
      [
        id,
        input.companyId,
        input.transcriptionKey,
        input.provider ?? "tencent",
        input.engineType ?? "16k_zh",
        (input.audioFormat ?? "mp3").toString().toLowerCase(),
        input.audioBytes ?? 0,
        input.sourceRef ?? null,
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return (await this.get(input.companyId, id))!;
  }

  async get(companyId: string, id: string): Promise<TranscriptionRow | null> {
    const rows = await this.db.query<TranscriptionRow>(
      `SELECT ${MultimodalStore.COLS} FROM ${this.table("mm_transcriptions")}
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, id],
    );
    return rows[0] ?? null;
  }

  async list(companyId: string, limit = 100): Promise<TranscriptionRow[]> {
    const capped = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 100;
    return this.db.query<TranscriptionRow>(
      `SELECT ${MultimodalStore.COLS} FROM ${this.table("mm_transcriptions")}
        WHERE company_id = $1 AND is_deleted = false
        ORDER BY created_at DESC
        LIMIT $2`,
      [companyId, capped],
    );
  }

  /** Mark a transcription done with the recognized text. */
  async markDone(
    companyId: string,
    id: string,
    patch: { text: string; durationMs: number; requestId?: string },
  ): Promise<TranscriptionRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("mm_transcriptions")}
          SET status = 'done', text = $3, duration_ms = $4, request_id = $5, updated_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, id, patch.text, patch.durationMs, patch.requestId ?? ""],
    );
    if (res.rowCount === 0) return null;
    return this.get(companyId, id);
  }

  /** Mark a transcription failed with an error reason. */
  async markFailed(
    companyId: string,
    id: string,
    patch: { error: string; durationMs: number },
  ): Promise<TranscriptionRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("mm_transcriptions")}
          SET status = 'failed', error = $3, duration_ms = $4, updated_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, id, patch.error, patch.durationMs],
    );
    if (res.rowCount === 0) return null;
    return this.get(companyId, id);
  }
}
