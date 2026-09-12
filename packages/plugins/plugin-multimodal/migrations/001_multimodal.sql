-- Multimodal plugin — speech-to-text transcriptions (DigitalStaff ai-studio
-- multimodal parity). One row per transcription attempt: audio metadata,
-- provider, lifecycle status, and the resulting text. The audio bytes
-- themselves are never persisted (privacy); only length and derived text.
-- Namespace schema is host-derived as plugin_<slug>_<sha256(pluginId)[:10]>.
-- For pluginId paperclipai.plugin-multimodal with slug multimodal this is
-- plugin_multimodal_c8039d857b.
-- NOTE: no apostrophes in comments (migration validator string stripper).

CREATE TABLE plugin_multimodal_c8039d857b.mm_transcriptions (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  transcription_key text NOT NULL,
  provider text NOT NULL DEFAULT 'tencent',
  engine_type text NOT NULL DEFAULT '16k_zh',
  audio_format text NOT NULL DEFAULT 'mp3',
  audio_bytes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  text text NOT NULL DEFAULT '',
  error text NOT NULL DEFAULT '',
  duration_ms integer NOT NULL DEFAULT 0,
  request_id text NOT NULL DEFAULT '',
  source_ref text,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, transcription_key)
);

CREATE INDEX mm_transcriptions_status_idx
  ON plugin_multimodal_c8039d857b.mm_transcriptions (company_id, status);

CREATE INDEX mm_transcriptions_created_idx
  ON plugin_multimodal_c8039d857b.mm_transcriptions (company_id, created_at DESC);
