import {
  definePlugin,
  runWorker,
  type PluginApiRequestInput,
  type PluginApiResponse,
  type PluginContext,
} from "@paperclipai/plugin-sdk";
import { AigwStore, type AigwChannelRow } from "./store.js";
import type { ChannelProvider } from "./enums.js";

let activeContext: PluginContext | null = null;
let store: AigwStore | null = null;

function requireContext(): PluginContext {
  if (!activeContext) throw new Error("AIGW plugin worker context is not initialized");
  return activeContext;
}
function requireStore(): AigwStore {
  if (!store) store = new AigwStore(requireContext().db);
  return store;
}
function queryString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}
function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required field: ${field}`);
  }
  return value;
}
function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function parseInt10(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Build the upstream chat-completions URL for a channel (OpenAI-compatible). */
function upstreamChatUrl(channel: AigwChannelRow): string {
  const base = String(channel.api_url || "").replace(/\/+$/, "");
  return `${base}/chat/completions`;
}

/**
 * Resolve the upstream API key for a channel from its secret reference.
 * Returns "" when no secret is configured (the caller decides how to proceed).
 */
async function resolveApiKey(ctx: PluginContext, channel: AigwChannelRow): Promise<string> {
  const ref = channel.api_key_secret_ref;
  if (!ref) return "";
  const secrets = (ctx as unknown as { secrets?: { resolve?: (r: string) => Promise<string> } }).secrets;
  if (secrets?.resolve) {
    try {
      return await secrets.resolve(ref);
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * Relay a chat-completions request to candidate channels with failover: try
 * each candidate (weighted-random order) until one returns a non-5xx response.
 * Non-streaming: buffers the JSON body. Records usage + health on the outcome.
 */
async function relayChatCompletion(
  ctx: PluginContext,
  s: AigwStore,
  companyId: string,
  body: Record<string, unknown>,
  actor: string,
): Promise<PluginApiResponse> {
  const model = requireString(body.model, "model");
  // Candidate list in priority order; try up to 3 with a fresh weighted pick each round.
  const attempts = 3;
  const tried = new Set<string>();
  let lastError = "no candidate channel";

  for (let i = 0; i < attempts; i += 1) {
    const channel = await pickUntriedChannel(s, companyId, model, tried);
    if (!channel) break;
    tried.add(channel.id);

    const apiKey = await resolveApiKey(ctx, channel);
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;

    const startedAt = Date.now();
    try {
      const res = await ctx.http.fetch(upstreamChatUrl(channel), {
        method: "POST",
        headers,
        body: JSON.stringify({ ...body, stream: false }),
      });
      const latencyMs = Date.now() - startedAt;
      const text = await res.text();
      if (res.status >= 500) {
        lastError = `upstream ${res.status} from ${channel.name}`;
        await s.setChannelHealth(companyId, channel.id, "unhealthy", { errorMessage: lastError });
        continue;
      }
      let json: Record<string, unknown> | null = null;
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        json = null;
      }
      const usage = optionalRecord(json?.usage) ?? {};
      await s.recordUsage({
        companyId,
        channelId: channel.id,
        model,
        provider: channel.provider,
        promptTokens: Number(usage.prompt_tokens) || 0,
        completionTokens: Number(usage.completion_tokens) || 0,
        totalTokens: Number(usage.total_tokens) || 0,
        cachedTokens:
          Number((optionalRecord(usage.prompt_tokens_details)?.cached_tokens as number) ?? 0) || 0,
        latencyMs,
        status: res.ok ? "ok" : "error",
        actor,
      });
      await s.setChannelHealth(companyId, channel.id, "healthy", { latencyMs });
      return {
        status: res.status,
        headers: { "x-aigw-channel": channel.name },
        body: json ?? { raw: text },
      };
    } catch (err) {
      lastError = String((err as Error)?.message ?? err);
      await s.setChannelHealth(companyId, channel.id, "unhealthy", { errorMessage: lastError });
    }
  }

  return { status: 502, body: { error: `AIGW relay failed: ${lastError}` } };
}

async function pickUntriedChannel(
  s: AigwStore,
  companyId: string,
  model: string,
  tried: Set<string>,
): Promise<AigwChannelRow | null> {
  const candidates = (await s.getCandidateChannels(companyId, model)).filter((c) => !tried.has(c.id));
  if (candidates.length === 0) return null;
  // Weighted-random over the untried candidates.
  const weighted = candidates.map((c) => ({
    c,
    w: Math.max(1, Number(c.weight) || 1) * (Math.max(0, Number(c.priority) || 0) + 1),
  }));
  const total = weighted.reduce((acc, x) => acc + x.w, 0);
  let r = Math.random() * total;
  for (const x of weighted) {
    r -= x.w;
    if (r <= 0) return x.c;
  }
  return weighted[weighted.length - 1]!.c;
}

const plugin = definePlugin({
  async setup(ctx) {
    activeContext = ctx;
    store = new AigwStore(ctx.db);
    ctx.data.register("list-channels", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      return { channels: await requireStore().listChannels(companyId) };
    });

    ctx.data.register("list-usage", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      return { usage: await requireStore().listUsage(companyId, 50) };
    });

    ctx.data.register("served-models", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      return { models: await requireStore().listServedModels(companyId) };
    });

    // Mutating actions backing usePluginAction(...) in the aigw UI.
    ctx.actions.register("create-channel", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const channel = await requireStore().createChannel({
        companyId,
        name: requireString(params.name, "name"),
        apiUrl: requireString(params.apiUrl, "apiUrl"),
        provider: typeof params.provider === "string" ? (params.provider as ChannelProvider) : undefined,
        model: typeof params.model === "string" ? params.model : undefined,
        apiKeySecretRef: typeof params.apiKeySecretRef === "string" ? params.apiKeySecretRef : null,
        isDefault: params.isDefault === true,
      });
      await ctx.activity.log({
        companyId,
        message: `Created aigw channel ${channel.name} (${channel.provider})`,
        entityType: "aigw_channel",
        entityId: channel.id,
      });
      return { channel };
    });

    ctx.actions.register("toggle-channel", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      const channel = await requireStore().updateChannel(
        companyId,
        requireString(params.channelId, "channelId"),
        { enabled: params.enabled === true },
      );
      if (!channel) throw new Error("Channel not found");
      return { channel };
    });

    ctx.logger.info("AIGW plugin worker started", { namespace: ctx.db.namespace });
  },

  async onHealth() {
    const ctx = activeContext;
    if (!ctx) return { status: "error" as const, message: "worker context not initialized" };
    return { status: "ok" as const, message: "aigw worker running", details: { namespace: ctx.db.namespace } };
  },

  async onApiRequest(input: PluginApiRequestInput): Promise<PluginApiResponse> {
    const ctx = requireContext();
    const s = requireStore();
    const companyId = input.companyId;
    const actor = input.actor?.actorType === "agent" ? `agent:${input.actor.agentId ?? ""}` : "board";

    switch (input.routeKey) {
      case "list-channels":
        return { body: { channels: await s.listChannels(companyId) } };

      case "get-channel": {
        const channel = await s.getChannel(companyId, requireString(input.params.channelId, "channelId"));
        if (!channel) return { status: 404, body: { error: "Channel not found" } };
        return { body: { channel } };
      }

      case "create-channel": {
        const b = optionalRecord(input.body) ?? {};
        const channel = await s.createChannel({
          companyId,
          name: requireString(b.name, "name"),
          apiUrl: requireString(b.apiUrl, "apiUrl"),
          provider: typeof b.provider === "string" ? (b.provider as ChannelProvider) : undefined,
          apiKeySecretRef: typeof b.apiKeySecretRef === "string" ? b.apiKeySecretRef : null,
          model: typeof b.model === "string" ? b.model : undefined,
          modelsMeta: optionalRecord(b.modelsMeta),
          priority: typeof b.priority === "number" ? b.priority : undefined,
          weight: typeof b.weight === "number" ? b.weight : undefined,
          isDefault: typeof b.isDefault === "boolean" ? b.isDefault : undefined,
          options: optionalRecord(b.options),
        });
        await ctx.activity.log({
          companyId,
          message: `Created AIGW channel ${channel.name}`,
          entityType: "aigw_channel",
          entityId: channel.id,
        });
        return { status: 201, body: { channel } };
      }

      case "update-channel": {
        const b = optionalRecord(input.body) ?? {};
        const channel = await s.updateChannel(companyId, requireString(input.params.channelId, "channelId"), {
          name: typeof b.name === "string" ? b.name : undefined,
          apiUrl: typeof b.apiUrl === "string" ? b.apiUrl : undefined,
          provider: typeof b.provider === "string" ? (b.provider as ChannelProvider) : undefined,
          apiKeySecretRef: "apiKeySecretRef" in b ? (b.apiKeySecretRef as string | null) : undefined,
          model: typeof b.model === "string" ? b.model : undefined,
          modelsMeta: optionalRecord(b.modelsMeta),
          enabled: typeof b.enabled === "boolean" ? b.enabled : undefined,
          isDefault: typeof b.isDefault === "boolean" ? b.isDefault : undefined,
          priority: typeof b.priority === "number" ? b.priority : undefined,
          weight: typeof b.weight === "number" ? b.weight : undefined,
          options: optionalRecord(b.options),
          metadata: optionalRecord(b.metadata),
        });
        if (!channel) return { status: 404, body: { error: "Channel not found" } };
        return { body: { channel } };
      }

      case "list-usage":
        return { body: { usage: await s.listUsage(companyId, parseInt10(queryString(input.query.limit))) } };

      case "openai-models": {
        const models = await s.listServedModels(companyId);
        return {
          body: {
            object: "list",
            data: models.map((id) => ({ id, object: "model", owned_by: "aigw" })),
          },
        };
      }

      case "openai-chat-completions": {
        const body = optionalRecord(input.body) ?? {};
        return relayChatCompletion(ctx, s, companyId, body, actor);
      }

      default:
        return { status: 404, body: { error: `Unknown aigw route: ${input.routeKey}` } };
    }
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
