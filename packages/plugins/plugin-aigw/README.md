# @paperclipai/plugin-aigw

AI gateway plugin for the Coolie / Paperclip control plane.

Clean-room implementation of the DigitalStaff `aigw` module (domain 4) — an
OpenAI-compatible LLM gateway — as a self-contained Paperclip plugin. It owns its
own Postgres namespace and never modifies control-plane core tables.

## Scope

- **Channels** (`aigw_channels`): upstream provider endpoints (DigitalStaff
  BrainProvider parity). Each channel has a provider family, base API URL, an
  **API key secret reference** (never a raw key), a primary `model` plus a
  `models_meta` map of additional served models, `enabled`, `priority`, `weight`,
  request `options`, and a `health_status` snapshot.
- **Usage logs** (`aigw_usage_logs`): per-request token accounting (prompt /
  completion / total / cached tokens, latency, cost, status).
- **Routing**: for a requested model, candidate channels are resolved (by primary
  model or a `models_meta` key), then one is chosen by **weighted-random pick**
  (weight × (priority + 1)). Requests relay to the upstream with **failover** —
  on a 5xx or transport error the channel is marked unhealthy (auto-disabled) and
  the next candidate is tried.

## API routes

Mounted under the plugin API prefix:

| Method | Path                      | Route key                 | Description |
|--------|---------------------------|---------------------------|-------------|
| GET    | `/channels`               | `list-channels`           | List channels |
| POST   | `/channels`               | `create-channel`          | Create a channel |
| GET    | `/channels/:channelId`    | `get-channel`             | Get one channel |
| PATCH  | `/channels/:channelId`    | `update-channel`          | Update a channel |
| GET    | `/usage`                  | `list-usage`              | Recent usage logs |
| GET    | `/v1/models`              | `openai-models`           | OpenAI-compatible model list |
| POST   | `/v1/chat/completions`    | `openai-chat-completions` | OpenAI-compatible chat (relay + failover) |

## Security

Upstream API keys are never stored raw — a channel holds an
`api_key_secret_ref` and the worker resolves it at call time via the host secret
resolver. Outbound relay uses `ctx.http.fetch` (gated by the `http.outbound`
capability).

## Build

```sh
pnpm --filter @paperclipai/plugin-aigw build
pnpm --filter @paperclipai/plugin-aigw typecheck
```
