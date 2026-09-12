# @paperclipai/plugin-multimodal

Multimodal intake plugin. First capability: **speech-to-text (STT)** via
**Tencent Cloud ASR** one-sentence recognition (`SentenceRecognition`), turning
voice into text for voice dispatch.

Clean-room migration of the DigitalStaff ai-studio multimodal capability — the
DS↔coolie overlap audit found this is the only STT/vision-understanding
increment coolie's host does not already cover.

## What it does

- `POST /transcriptions` — accepts `audioBase64` + `format`, runs Tencent ASR,
  persists a transcription record, returns the recognized text.
- `GET /transcriptions` — recent transcription history.
- Emits `transcription-completed` on the cross-plugin event bus (payload carries
  the text) so downstream plugins (chat, dispatch) can react.
- Voice UI page + sidebar entry.

## Boundaries

- **STT provider:** Tencent Cloud ASR (per the standing decision that STT uses
  Tencent, not Alibaba Paraformer). Engine defaults to `16k_zh`.
- **Limits:** one-sentence recognition — audio ≤ 60s and ≤ 3MB (base64 direct
  upload, `SourceType=1`).
- **Credentials:** `SecretId` / `SecretKey` are resolved from operator plugin
  config as **secret refs** (`ctx.secrets.resolve`), never entered in the UI or
  stored raw. When unconfigured the create route returns HTTP 501 with
  `ASR_NOT_CONFIGURED` and the UI degrades to text-only.
- **Network:** the Tencent call goes through `ctx.http.fetch` (requires the
  `http.outbound` capability). The plugin never spawns a process or container;
  audio bytes are never persisted (only length + derived text).

## Namespace

`plugin_multimodal_c8039d857b` (host-derived; kept in sync with
`migrations/001_multimodal.sql`).
