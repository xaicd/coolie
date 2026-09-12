export { default as manifest, PLUGIN_ID, MULTIMODAL_NAMESPACE_SCHEMA } from "./manifest.js";
export { MultimodalStore } from "./store.js";
export type { TranscriptionCreateInput, TranscriptionRow } from "./store.js";
export {
  buildPayload,
  buildAuthorization,
  transcribeTencent,
  ASR_HOST,
  ASR_ACTION,
  ASR_VERSION,
} from "./asr/tencent.js";
export type { TencentAsrCredentials, TranscribeResult } from "./asr/tencent.js";
export {
  ASR_PROVIDERS,
  TRANSCRIPTION_STATUSES,
  AUDIO_FORMATS,
  DEFAULT_ASR_ENGINE_TYPE,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_SECONDS,
  ASR_NOT_CONFIGURED,
} from "./enums.js";
export type { AsrProvider, TranscriptionStatus, AudioFormat } from "./enums.js";
