-- Chat plugin — conversations + messages (DigitalStaff ai-studio / orchestration parity).
-- A conversation is a chat session (mode chat/mvp/vibe/build/office) with a
-- lifecycle status and a multi-turn context budget. Messages are the ordered
-- turns (user/assistant/system/tool) that make up the conversation.
-- Namespace schema is host-derived as plugin_<slug>_<sha256(pluginId)[:10]>.
-- For pluginId paperclipai.plugin-chat with slug chat this is plugin_chat_78bb3789f8.
-- NOTE: no apostrophes in comments (migration validator string stripper treats a
-- single quote as opening a SQL string literal).

CREATE TABLE plugin_chat_78bb3789f8.chat_conversations (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_key text NOT NULL,
  name text NOT NULL DEFAULT 'New conversation',
  mode text NOT NULL DEFAULT 'chat',
  status text NOT NULL DEFAULT 'active',
  user_ref text,
  agent_ref text,
  system_prompt text NOT NULL DEFAULT '',
  message_count integer NOT NULL DEFAULT 0,
  estimated_tokens integer NOT NULL DEFAULT 0,
  max_turns integer NOT NULL DEFAULT 20,
  token_budget integer NOT NULL DEFAULT 16000,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system',
  updated_by text NOT NULL DEFAULT 'system',
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by text,
  remark text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, conversation_key)
);

CREATE INDEX chat_conversations_status_idx
  ON plugin_chat_78bb3789f8.chat_conversations (company_id, status, last_active_at);

CREATE INDEX chat_conversations_mode_idx
  ON plugin_chat_78bb3789f8.chat_conversations (company_id, mode);

CREATE TABLE plugin_chat_78bb3789f8.chat_messages (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES plugin_chat_78bb3789f8.chat_conversations(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  role text NOT NULL DEFAULT 'user',
  content text NOT NULL DEFAULT '',
  tokens integer NOT NULL DEFAULT 0,
  tool_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, conversation_id, seq)
);

CREATE INDEX chat_messages_conversation_idx
  ON plugin_chat_78bb3789f8.chat_messages (company_id, conversation_id, seq);
