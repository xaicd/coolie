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
  `pnpm bundle` — 574 modules, ~1.65 MB Hermes bundle).
- ✅ Auth via agent API key (bearer), stored in `expo-secure-store`. The key is
  **validated with `GET /api/agents/me` before it is stored**, so a bad key reports the
  reason instead of showing up later as an empty task list. A key revoked since last
  launch sends you back to the sign-in screen rather than into a screen of errors.
- ✅ The key names its own company, so the task list and the company header come from it.
  **There is no company picker on purpose** — an agent key is scoped to one company and
  cannot even list companies (that route is board-only and answers 403).
- ✅ Task list, **task detail** (tap a row), create task with title, optional description
  and priority.
- ❌ **Voice dispatch fails, and it is not a bug in this app.** The route it calls
  (`POST /api/plugins/paperclipai.plugin-multimodal/api/transcriptions`) is declared
  with the manifest default `auth: "board"` and the host enforces `assertBoard` on it,
  while the app sends an **agent** key: measured `403 Board access required` against the
  live instance. Fix either by relaxing that route to `board-or-agent` or by signing in
  as a session. Recording itself (`expo-av` → base64) is wired but has never been
  exercised on a device.
- ⏳ TODO: **navigation library** (the screen is chosen from state, so there is no back
  stack and no deep linking, and `app.json`'s `coolie` scheme is declared but unused),
  email/password session sign-in, push/live updates, enforcing the Tencent limits
  (≤60s / ≤3 MB) client-side, editing or transitioning a task from the detail screen,
  error/empty state polish.

## How the above was checked

Every API call the app makes was run against the live local instance with a real agent
key, using `@coolie/api-client` directly (it is framework-agnostic) rather than a
simulator:

| call | result |
| --- | --- |
| `getAgentIdentity()` | pass — the key resolved to its agent and company |
| `getCompany()` | pass — the company name for the header |
| `listIssues()` | pass — read the real task list |
| `createIssue()` | pass — created a task (then deleted it) |
| `voiceDispatch()` | **403 Board access required** |

This is how the four route bugs fixed in `@coolie/api-client` were found: the client
had been calling `/api/issues` and `/api/companies`, which either do not exist or are
board-only, so nothing but the sign-in screen would ever have worked.

Still unverified: anything on a device. The recorder has never run on real hardware, and
"cannot be verified from CI" is not the same as verified.
