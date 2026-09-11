# @paperclipai/plugin-chat

Intelligent chat plugin for the Coolie / Paperclip control plane.

Clean-room implementation of the DigitalStaff `ai-studio` / `orchestration`
conversation capability (domain 1) as a self-contained Paperclip plugin. It owns
its own Postgres namespace and never modifies control-plane core tables.

## Scope

- **Conversations** (`chat_conversations`, DigitalStaff IDESession /
  UserConversationContext parity): a chat session with a `mode`
  (chat / mvp / vibe / build / office), a lifecycle `status`
  (active → idle → suspended → archived), a system prompt, running counters
  (message_count / estimated_tokens), and a multi-turn context budget
  (`max_turns` + `token_budget`).
- **Messages** (`chat_messages`): the ordered turns of a conversation
  (`role` user / assistant / system / tool, content, per-message token count),
  with an auto-incrementing `seq` per conversation.
- **Context window**: `getContextWindow` builds the material for the next LLM
  call — the most recent turns that fit within `max_turns` and `token_budget`,
  in chronological order, with the system prompt separated out and a `truncated`
  flag. This pairs with the AI-gateway plugin (`/v1/chat/completions`) as the
  upstream execution path.

## API routes

Under the plugin API prefix: `conversations` (GET/POST + GET/PATCH
`/:conversationId`, POST `/:conversationId/transition`), messages
(GET/POST `/:conversationId/messages`), and `GET /:conversationId/context`.

## Build

```sh
pnpm --filter @paperclipai/plugin-chat build
pnpm --filter @paperclipai/plugin-chat typecheck
```
