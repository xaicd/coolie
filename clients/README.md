# Coolie clients

Client-side integrations for the Coolie control plane: a typed API client and an
Expo (React Native) mobile app skeleton for creating tasks — including **voice
dispatch** (speak a task, Tencent ASR transcribes it, a task/issue is created).

- [`api-client/`](./api-client) — framework-agnostic TypeScript client for the
  Coolie REST API (auth, tasks, voice dispatch).
- [`expo-app/`](./expo-app) — Expo app skeleton: sign in, list tasks, create a
  task, and voice dispatch.

## Backend it talks to

Everything is the Coolie server REST API under `/api` on your instance
(e.g. `http://100.84.124.71:3100`). The full contract is published as an OpenAPI
document at:

```
GET /api/openapi.json
```

Point your codegen at that URL for exhaustive, always-current types. This
directory ships a small hand-written client covering the mobile happy path.

## Authentication

Coolie authenticates requests two ways; the middleware accepts either on the
`Authorization: Bearer <token>` header, and browser/session flows via cookies.

1. **User session (better-auth).** Email + password sign-in returns a session.
   - `POST /api/auth/sign-in/email` `{ email, password }`
   - `POST /api/auth/sign-up/email` `{ name, email, password }`
   - `GET  /api/auth/get-session` — current session
   better-auth uses cookies by default. In React Native, keep a cookie jar
   (e.g. persist the `Set-Cookie` and send it back), or run behind a session
   proxy. For a pure token flow, use an agent API key (below).

2. **Agent API key (bearer).** A hashed API key scoped to a company, sent as
   `Authorization: Bearer <key>`. Best for programmatic / device clients.
   Keys are minted from the board (Settings → Members / access) or claimed via a
   join-request `claim-api-key` flow. Agent keys are company-scoped and cannot
   cross companies.

The bundled client is transport-agnostic: you give it a `baseUrl` and a
`getAuthHeader()` callback, so it works with either scheme.

## Creating a task

```
POST /api/issues
{
  "companyId": "<uuid>",
  "title": "Fix the login crash",     // required, min length 1
  "description": "…",                  // optional
  "priority": "medium"                 // critical | high | medium | low
}
```

## Voice dispatch (speak a task)

The multimodal plugin exposes a transcription route. With `createIssue: true`
the recognized speech is turned into a task in one call:

```
POST /api/plugins/paperclipai.plugin-multimodal/api/transcriptions
{
  "companyId": "<uuid>",
  "audioBase64": "<base64 audio, <= 3MB, <= 60s>",
  "format": "mp3",              // mp3 | wav | m4a | pcm | flac | ogg-opus
  "createIssue": true,
  "priority": "medium"          // optional, applied to the created task
}
-> { "transcription": { "status": "done", "text": "…" },
     "issue": { "id": "…", "title": "…" } | null }
```

Requires the operator to have configured Tencent Cloud ASR credentials (secret
refs) on the plugin; otherwise the route returns HTTP 501 `ASR_NOT_CONFIGURED`
and the app should fall back to typing the task.

> STT provider is **Tencent Cloud ASR** (one-sentence recognition). The app can
> also record locally and send base64; it never handles the ASR keys itself.

## Notes

- All task/company data is company-scoped; always pass the active `companyId`.
- The Expo app is a **skeleton** for wiring; device/store specifics (audio
  recording permissions, secure token storage) are marked with TODOs.
