# Coolie Expo app (skeleton)

A minimal Expo (React Native) app for Coolie: connect with an agent API key,
pick a company, list/create tasks, and **voice dispatch** (record → Tencent ASR
→ task). Built on the shared [`@coolie/api-client`](../api-client).

## Run

```sh
cd clients/expo
npm install          # or pnpm install from repo root
npx expo start
```

Set your instance URL in `src/coolie.ts` (`COOLIE_BASE_URL`). For a real build,
move it to `expo-constants` / EAS env.

## What works / TODO

- ✅ Auth via agent API key (bearer), stored in `expo-secure-store`.
- ✅ Company picker, task list, create task, voice dispatch.
- ✅ Voice: `expo-av` records m4a → base64 → `voiceDispatch()`; handles the
  `ASR_NOT_CONFIGURED` fallback.
- ⏳ TODO: email/password session sign-in (cookie jar), navigation library,
  push/live updates, enforce Tencent limits (≤60s / ≤3MB) before dispatch,
  error/empty states polish.

> Skeleton for wiring; cannot be verified on a device from CI. Verify on a
> simulator/device: `npx expo run:ios` / `run:android`.
