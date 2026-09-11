-- AI gateway plugin — channels + usage logs (DigitalStaff aigw / BrainProvider parity).
-- An OpenAI-compatible LLM gateway: channels are upstream provider endpoints;
-- requests are routed to a healthy channel for the requested model with
-- weighted-random failover, and token usage is logged.
-- Namespace schema is host-derived as plugin_<slug>_<sha256(pluginId)[:10]>.
-- For pluginId paperclipai.plugin-aigw with slug aigw this is plugin_aigw_bc8e1b787a.
-- NOTE: no apostrophes in comments (migration validator string stripper treats a
-- single quote as opening a SQL string literal).

CREATE TABLE plugin_aigw_bc8e1b787a.aigw_channels (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider text NOT NULL DEFAULT 'openai-compatible',
  api_url text NOT NULL,
  -- Reference to a secret holding the upstream API key (never store the raw key).
  api_key_secret_ref text,
  model text NOT NULL DEFAULT '',
  models_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 0,
  weight integer NOT NULL DEFAULT 1,
  options jsonb NOT NULL DEFAULT '{"temperature":0.7,"maxTokens":4096,"timeout":300000}'::jsonb,
  health_status jsonb NOT NULL DEFAULT '{"status":"unknown","lastCheckTime":null,"latencyMs":null,"errorMessage":null}'::jsonb,
  fail_count integer NOT NULL DEFAULT 0,
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE INDEX aigw_channels_enabled_idx
  ON plugin_aigw_bc8e1b787a.aigw_channels (company_id, enabled);

CREATE TABLE plugin_aigw_bc8e1b787a.aigw_usage_logs (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES plugin_aigw_bc8e1b787a.aigw_channels(id) ON DELETE SET NULL,
  model text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT '',
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  cached_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  cost_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  actor text NOT NULL DEFAULT 'system',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX aigw_usage_logs_company_time_idx
  ON plugin_aigw_bc8e1b787a.aigw_usage_logs (company_id, event_at);

CREATE INDEX aigw_usage_logs_channel_idx
  ON plugin_aigw_bc8e1b787a.aigw_usage_logs (company_id, channel_id);
