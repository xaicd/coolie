// Multimodal intake enums (speech-to-text first).

/** ASR provider. Tencent Cloud ASR is the standing choice for STT. */
export const ASR_PROVIDERS = ["tencent"] as const;
export type AsrProvider = (typeof ASR_PROVIDERS)[number];

/** Transcription lifecycle. */
export const TRANSCRIPTION_STATUSES = ["pending", "done", "failed"] as const;
export type TranscriptionStatus = (typeof TRANSCRIPTION_STATUSES)[number];

/**
 * Audio formats accepted by Tencent SentenceRecognition (mapped to VoiceFormat).
 * Kept permissive; the provider validates the actual bytes.
 */
export const AUDIO_FORMATS = ["mp3", "wav", "m4a", "pcm", "flac", "ogg-opus"] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];

/** Tencent ASR engine model (env-overridable). Default: 16k Chinese general. */
export const DEFAULT_ASR_ENGINE_TYPE = "16k_zh";

/** Tencent one-sentence recognition hard limits (base64 direct upload). */
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024; // 3MB
export const MAX_AUDIO_SECONDS = 60;

/** Standard error code when ASR credentials are not configured (route -> 501). */
export const ASR_NOT_CONFIGURED = "ASR_NOT_CONFIGURED";
