# Coolie Expo app

A minimal Expo (React Native) app for Coolie: connect with an agent API key, pick a
company, list/create tasks, and **voice dispatch** (record → Tencent ASR → task). Built
on the shared [`@coolie/api-client`](../api-client).

## Run

This package installs **standalone** — it is deliberately not a pnpm workspace member
(an RN dependency tree in the root lockfile is merge surface the fork does not need,
and it would fight the repo's react version). So:

```sh
cd clients/expo
NODE_ENV=development pnpm install --ignore-workspace   # devDeps matter: typescript, babel-preset-expo
pnpm typecheck                                          # tsc --noEmit
pnpm bundle                                             # expo export → proves Metro can build it
pnpm start                                              # Expo dev server
```

Two config files exist for reasons worth keeping:

- `.npmrc` sets `node-linker=hoisted`. Metro walks a flat `node_modules` and does not
  follow pnpm's symlinked store, so with the default linker the bundle fails on
  `@babel/runtime/helpers/interopRequireDefault`.
- `metro.config.js` adds `../` as a watch folder and this app's `node_modules` as a
  resolution path. `@coolie/api-client` is a symlink to `../api-client`, which is
  outside the project root, and that package has no `node_modules` of its own.

`@coolie/api-client` is consumed with `link:` (a real symlink), not `file:` — with
`file:` pnpm copies the package, so every edit to the api-client needs a reinstall.

## Point it at an instance

`EXPO_PUBLIC_COOLIE_BASE_URL` overrides the base URL at bundle time; the default is this
machine's Tailscale address, so a phone on the tailnet reaches the dev instance without
editing code:

```sh
EXPO_PUBLIC_COOLIE_BASE_URL=http://my-instance:3100 pnpm start
```

## What works / TODO

- ✅ Installs, typechecks and bundles from a clean checkout (`pnpm typecheck`,
  `pnpm bundle` — 574 modules, ~1.6 MB Hermes bundle).
- ✅ Auth via agent API key (bearer), stored in `expo-secure-store`.
- ✅ Company picker, task list, create task (title only).
- ⚠️ **Voice dispatch does not work yet with the auth this app uses.** The route it
  calls (`POST /api/plugins/paperclipai.plugin-multimodal/api/transcriptions`) is
  declared with the manifest default `auth: "board"`, and the host enforces
  `assertBoard` on it — while the app sends an **agent** API key, so the call is
  rejected 403. Fix either by relaxing that route to `board-or-agent` or by signing in
  as a session. Recording itself (`expo-av` → base64) is wired but has never been
  exercised on a device.
- ⏳ TODO: task detail screen (list rows are not tappable), fields beyond title on
  create, email/password session sign-in, navigation library, push/live updates,
  enforcing the Tencent limits (≤60s / ≤3 MB) client-side, error/empty states.

> "Cannot be verified on a device from CI" is not the same as verified. The checks above
> are what has actually been run; the device path is still unverified.
