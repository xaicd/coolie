import {
  definePlugin,
  runWorker,
  type PluginApiRequestInput,
  type PluginApiResponse,
  type PluginContext,
} from "@paperclipai/plugin-sdk";
import { MultimodalStore } from "./store.js";
import { transcribeTencent, type TencentAsrCredentials } from "./asr/tencent.js";
import {
  ASR_NOT_CONFIGURED,
  DEFAULT_ASR_ENGINE_TYPE,
  MAX_AUDIO_BYTES,
  type AudioFormat,
} from "./enums.js";

let activeContext: PluginContext | null = null;
let store: MultimodalStore | null = null;

function requireContext(): PluginContext {
  if (!activeContext) throw new Error("Multimodal plugin worker context is not initialized");
  return activeContext;
}
function requireStore(): MultimodalStore {
  if (!store) store = new MultimodalStore(requireContext().db);
  return store;
}
function queryString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}
function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Missing required field: ${field}`);
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

/**
 * Resolve Tencent ASR credentials from operator plugin config. The config
 * stores secret references (never raw keys); resolve them at call time.
 * Returns null when not configured so the route can surface ASR_NOT_CONFIGURED.
 */
async function resolveTencentCreds(
  ctx: PluginContext,
  companyId: string,
): Promise<TencentAsrCredentials | null> {
  const config = await ctx.config.get(companyId);
  const idRef = config.tencentSecretIdRef;
  const keyRef = config.tencentSecretKeyRef;
  if (!idRef || !keyRef) return null;
  try {
    const [secretId, secretKey] = await Promise.all([
      ctx.secrets.resolve(idRef as never, { companyId }),
      ctx.secrets.resolve(keyRef as never, { companyId }),
    ]);
    if (!secretId || !secretKey) return null;
    return { secretId, secretKey };
  } catch (err) {
    ctx.logger.warn("Failed to resolve Tencent ASR secret refs", {
      error: String((err as Error)?.message ?? err),
    });
    return null;
  }
}

const plugin = definePlugin({
  async setup(ctx) {
    activeContext = ctx;
    store = new MultimodalStore(ctx.db);

    ctx.data.register("list-transcriptions", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      return { transcriptions: await requireStore().list(companyId) };
    });

    ctx.logger.info("Multimodal plugin worker started", { namespace: ctx.db.namespace });
  },

  async onHealth() {
    const ctx = activeContext;
    if (!ctx) return { status: "error" as const, message: "worker context not initialized" };
    return { status: "ok" as const, message: "multimodal worker running", details: { namespace: ctx.db.namespace } };
  },

  async onApiRequest(input: PluginApiRequestInput): Promise<PluginApiResponse> {
    const ctx = requireContext();
    const s = requireStore();
    const companyId = input.companyId;

    switch (input.routeKey) {
      case "list-transcriptions":
        return { body: { transcriptions: await s.list(companyId, parseInt10(queryString(input.query.limit))) } };

      case "get-transcription": {
        const row = await s.get(companyId, requireString(input.params.transcriptionId, "transcriptionId"));
        if (!row) return { status: 404, body: { error: "Transcription not found" } };
        return { body: { transcription: row } };
      }

      case "create-transcription": {
        const b = optionalRecord(input.body) ?? {};
        const audioBase64 = requireString(b.audioBase64, "audioBase64");
        const format = (typeof b.format === "string" ? b.format : "mp3") as AudioFormat;
        const engineType = typeof b.engineType === "string" ? b.engineType : DEFAULT_ASR_ENGINE_TYPE;

        // Size gate (Tencent one-sentence recognition: base64 decodes to <= 3MB).
        const audioBytes = Buffer.from(audioBase64, "base64").length;
        if (audioBytes === 0) {
          return { status: 400, body: { error: "audioBase64 did not decode to any bytes" } };
        }
        if (audioBytes > MAX_AUDIO_BYTES) {
          return {
            status: 413,
            body: { error: `audio exceeds ${MAX_AUDIO_BYTES} bytes (got ${audioBytes})` },
          };
        }

        const creds = await resolveTencentCreds(ctx, companyId);
        if (!creds) {
          return {
            status: 501,
            body: {
              error: ASR_NOT_CONFIGURED,
              message: "Tencent ASR credentials are not configured for this company.",
            },
          };
        }

        const record = await s.createPending({
          companyId,
          transcriptionKey:
            typeof b.transcriptionKey === "string" && b.transcriptionKey.trim() !== ""
              ? b.transcriptionKey
              : `asr-${Date.now()}`,
          provider: "tencent",
          engineType,
          audioFormat: format,
          audioBytes,
          sourceRef: typeof b.sourceRef === "string" ? b.sourceRef : null,
        });

        const startedAt = Date.now();
        try {
          const result = await transcribeTencent(
            (url, init) => ctx.http.fetch(url, init),
            creds,
            { audioBase64, format, engineType },
          );
          const done = await s.markDone(companyId, record.id, {
            text: result.text,
            durationMs: Date.now() - startedAt,
            requestId: result.requestId,
          });
          await ctx.activity.log({
            companyId,
            message: `Transcribed audio (${audioBytes} bytes, ${format}) -> ${result.text.length} chars`,
            entityType: "mm_transcription",
            entityId: record.id,
            metadata: { provider: "tencent", requestId: result.requestId },
          });
          try {
            await ctx.events.emit("transcription-completed", companyId, {
              transcriptionId: record.id,
              text: result.text,
              sourceRef: record.source_ref,
            });
          } catch (err) {
            ctx.logger.warn("Failed to emit transcription-completed", {
              error: String((err as Error)?.message ?? err),
            });
          }
          return { status: 201, body: { transcription: done } };
        } catch (err) {
          const failed = await s.markFailed(companyId, record.id, {
            error: String((err as Error)?.message ?? err),
            durationMs: Date.now() - startedAt,
          });
          return { status: 502, body: { transcription: failed, error: "transcription failed" } };
        }
      }

      default:
        return { status: 404, body: { error: `Unknown multimodal route: ${input.routeKey}` } };
    }
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
