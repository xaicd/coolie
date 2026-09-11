import { randomUUID } from "node:crypto";
import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import type { ChannelHealthStatus, ChannelProvider } from "./enums.js";

/**
 * AigwStore isolates all AI-gateway persistence and channel selection behind one
 * class. A channel is an upstream provider endpoint; a request for a model is
 * routed to a healthy channel that serves that model, chosen by weighted-random
 * pick (weight defaults to 1; higher priority raises the effective weight),
 * mirroring the DigitalStaff aigw ChannelPool behavior.
 *
 * Runtime SQL constraints enforced by the plugin host:
 *  - db.query   accepts a single SELECT / WITH statement.
 *  - db.execute accepts a single INSERT / UPDATE / DELETE statement.
 * Every object reference is schema-qualified with db.namespace.
 */
export interface AigwChannelInput {
  companyId: string;
  name: string;
  apiUrl: string;
  provider?: ChannelProvider;
  apiKeySecretRef?: string | null;
  model?: string;
  modelsMeta?: Record<string, unknown>;
  priority?: number;
  weight?: number;
  isDefault?: boolean;
  options?: Record<string, unknown>;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface AigwChannelUpdate {
  name?: string;
  apiUrl?: string;
  provider?: ChannelProvider;
  apiKeySecretRef?: string | null;
  model?: string;
  modelsMeta?: Record<string, unknown>;
  enabled?: boolean;
  isDefault?: boolean;
  priority?: number;
  weight?: number;
  options?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AigwChannelRow {
  id: string;
  company_id: string;
  name: string;
  provider: ChannelProvider;
  api_url: string;
  api_key_secret_ref: string | null;
  model: string;
  models_meta: Record<string, unknown>;
  enabled: boolean;
  is_default: boolean;
  priority: number;
  weight: number;
}

export interface AigwUsageInput {
  companyId: string;
  channelId?: string | null;
  model?: string;
  provider?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  latencyMs?: number;
  costCents?: number;
  status?: string;
  actor?: string;
  metadata?: Record<string, unknown>;
}

export interface AigwUsageRow {
  id: string;
  company_id: string;
  channel_id: string | null;
  model: string;
  total_tokens: number;
  latency_ms: number;
  status: string;
  event_at: string;
}

/** Normalize a model key the way models_meta stores it (dots escaped). */
function safeModelKey(model: string): string {
  return model.replace(/\./g, "__dot__");
}

export class AigwStore {
  private readonly db: PluginDatabaseClient;
  private readonly ns: string;

  constructor(db: PluginDatabaseClient) {
    this.db = db;
    this.ns = db.namespace;
  }

  private table(name: string): string {
    return `"${this.ns}".${name}`;
  }

  private static readonly CHANNEL_COLS =
    "id, company_id, name, provider, api_url, api_key_secret_ref, model, " +
    "models_meta, enabled, is_default, priority, weight";

  async createChannel(input: AigwChannelInput): Promise<AigwChannelRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("aigw_channels")}
         (id, company_id, name, provider, api_url, api_key_secret_ref, model,
          models_meta, is_default, priority, weight, options, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb, $13, $13, $14::jsonb)`,
      [
        id,
        input.companyId,
        input.name,
        input.provider ?? "openai-compatible",
        input.apiUrl,
        input.apiKeySecretRef ?? null,
        input.model ?? "",
        JSON.stringify(input.modelsMeta ?? {}),
        input.isDefault ?? false,
        input.priority ?? 0,
        input.weight ?? 1,
        JSON.stringify(input.options ?? { temperature: 0.7, maxTokens: 4096, timeout: 300000 }),
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return (await this.getChannel(input.companyId, id))!;
  }

  async getChannel(companyId: string, channelId: string): Promise<AigwChannelRow | null> {
    const rows = await this.db.query<AigwChannelRow>(
      `SELECT ${AigwStore.CHANNEL_COLS}
         FROM ${this.table("aigw_channels")}
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, channelId],
    );
    return rows[0] ?? null;
  }

  async listChannels(companyId: string, enabledOnly = false): Promise<AigwChannelRow[]> {
    if (enabledOnly) {
      return this.db.query<AigwChannelRow>(
        `SELECT ${AigwStore.CHANNEL_COLS}
           FROM ${this.table("aigw_channels")}
          WHERE company_id = $1 AND is_deleted = false AND enabled = true
          ORDER BY priority DESC, created_at ASC`,
        [companyId],
      );
    }
    return this.db.query<AigwChannelRow>(
      `SELECT ${AigwStore.CHANNEL_COLS}
         FROM ${this.table("aigw_channels")}
        WHERE company_id = $1 AND is_deleted = false
        ORDER BY priority DESC, created_at ASC`,
      [companyId],
    );
  }

  async updateChannel(
    companyId: string,
    channelId: string,
    update: AigwChannelUpdate,
  ): Promise<AigwChannelRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("aigw_channels")}
          SET name               = COALESCE($3, name),
              api_url            = COALESCE($4, api_url),
              provider           = COALESCE($5, provider),
              api_key_secret_ref = CASE WHEN $6::boolean THEN $7 ELSE api_key_secret_ref END,
              model              = COALESCE($8, model),
              models_meta        = CASE WHEN $9::boolean THEN $10::jsonb ELSE models_meta END,
              enabled            = COALESCE($11, enabled),
              is_default         = COALESCE($12, is_default),
              priority           = COALESCE($13, priority),
              weight             = COALESCE($14, weight),
              options            = CASE WHEN $15::boolean THEN $16::jsonb ELSE options END,
              metadata           = CASE WHEN $17::boolean THEN $18::jsonb ELSE metadata END,
              updated_at         = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        channelId,
        update.name ?? null,
        update.apiUrl ?? null,
        update.provider ?? null,
        update.apiKeySecretRef !== undefined,
        update.apiKeySecretRef ?? null,
        update.model ?? null,
        update.modelsMeta !== undefined,
        JSON.stringify(update.modelsMeta ?? {}),
        typeof update.enabled === "boolean" ? update.enabled : null,
        typeof update.isDefault === "boolean" ? update.isDefault : null,
        typeof update.priority === "number" ? update.priority : null,
        typeof update.weight === "number" ? update.weight : null,
        update.options !== undefined,
        JSON.stringify(update.options ?? {}),
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
      ],
    );
    if (res.rowCount === 0) return null;
    return this.getChannel(companyId, channelId);
  }

  /** Update a channel health status snapshot (and reset/keep fail count). */
  async setChannelHealth(
    companyId: string,
    channelId: string,
    status: ChannelHealthStatus,
    detail: { latencyMs?: number | null; errorMessage?: string | null } = {},
  ): Promise<AigwChannelRow | null> {
    const health = {
      status,
      lastCheckTime: new Date().toISOString(),
      latencyMs: detail.latencyMs ?? null,
      errorMessage: detail.errorMessage ?? null,
    };
    const res = await this.db.execute(
      `UPDATE ${this.table("aigw_channels")}
          SET health_status = $3::jsonb,
              fail_count = CASE WHEN $4 THEN 0 ELSE fail_count END,
              enabled = CASE WHEN $5 THEN false ELSE enabled END,
              updated_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, channelId, JSON.stringify(health), status === "healthy", status === "unhealthy"],
    );
    if (res.rowCount === 0) return null;
    return this.getChannel(companyId, channelId);
  }

  /**
   * Return the enabled channels that serve `model` (matched via the primary
   * model field or a models_meta key), highest priority first.
   */
  async getCandidateChannels(companyId: string, model: string): Promise<AigwChannelRow[]> {
    const key = safeModelKey(model);
    return this.db.query<AigwChannelRow>(
      `SELECT ${AigwStore.CHANNEL_COLS}
         FROM ${this.table("aigw_channels")}
        WHERE company_id = $1 AND is_deleted = false AND enabled = true
          AND (model = $2 OR models_meta ? $2 OR models_meta ? $3)
        ORDER BY priority DESC, created_at ASC`,
      [companyId, model, key],
    );
  }

  /**
   * Pick one channel for a model by weighted-random selection. Weight is the
   * channel weight (>=1) multiplied by (priority + 1) so higher-priority
   * channels are favored, matching the DigitalStaff ChannelPool intent.
   * Deterministic when `rng` is supplied (for tests). Returns null if none.
   */
  async selectChannelForModel(
    companyId: string,
    model: string,
    rng: () => number = Math.random,
  ): Promise<AigwChannelRow | null> {
    const candidates = await this.getCandidateChannels(companyId, model);
    if (candidates.length === 0) return null;
    const weighted = candidates.map((c) => ({
      c,
      w: Math.max(1, Number(c.weight) || 1) * (Math.max(0, Number(c.priority) || 0) + 1),
    }));
    const total = weighted.reduce((s, x) => s + x.w, 0);
    let r = rng() * total;
    for (const x of weighted) {
      r -= x.w;
      if (r <= 0) return x.c;
    }
    return weighted[weighted.length - 1]!.c;
  }

  async recordUsage(input: AigwUsageInput): Promise<AigwUsageRow> {
    const id = randomUUID();
    const prompt = input.promptTokens ?? 0;
    const completion = input.completionTokens ?? 0;
    const total = input.totalTokens ?? prompt + completion;
    await this.db.execute(
      `INSERT INTO ${this.table("aigw_usage_logs")}
         (id, company_id, channel_id, model, provider, prompt_tokens, completion_tokens,
          total_tokens, cached_tokens, latency_ms, cost_cents, status, actor, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)`,
      [
        id,
        input.companyId,
        input.channelId ?? null,
        input.model ?? "",
        input.provider ?? "",
        prompt,
        completion,
        total,
        input.cachedTokens ?? 0,
        input.latencyMs ?? 0,
        input.costCents ?? 0,
        input.status ?? "ok",
        input.actor ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const rows = await this.db.query<AigwUsageRow>(
      `SELECT id, company_id, channel_id, model, total_tokens, latency_ms, status, event_at
         FROM ${this.table("aigw_usage_logs")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0]!;
  }

  async listUsage(companyId: string, limit = 100): Promise<AigwUsageRow[]> {
    const capped = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 1000)) : 100;
    return this.db.query<AigwUsageRow>(
      `SELECT id, company_id, channel_id, model, total_tokens, latency_ms, status, event_at
         FROM ${this.table("aigw_usage_logs")}
        WHERE company_id = $1
        ORDER BY event_at DESC
        LIMIT $2`,
      [companyId, capped],
    );
  }

  /** List distinct model ids served by enabled channels (for /v1/models). */
  async listServedModels(companyId: string): Promise<string[]> {
    const channels = await this.listChannels(companyId, true);
    const set = new Set<string>();
    for (const c of channels) {
      if (c.model) set.add(c.model);
      if (c.models_meta && typeof c.models_meta === "object") {
        for (const k of Object.keys(c.models_meta)) set.add(k.replace(/__dot__/g, "."));
      }
    }
    return [...set].sort();
  }
}
