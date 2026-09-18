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

## Install it on a device

Builds run locally; no EAS project is configured.

```sh
cd clients/expo
npx expo prebuild --platform ios   # generates ios/ (gitignored — never edit it by hand)
npx expo run:ios                   # build + install + launch on a simulator
npx expo run:ios --device          # same, on a plugged-in iPhone
```

- **Simulator:** needs only Xcode and CocoaPods.
- **Physical iPhone:** needs a signing identity. This machine has
  `Apple Development: wei chen (M8BJTC24K4)`, and the phone must be registered in that
  profile — plug it in and let Xcode resolve signing once. An install that does not go
  through a cable (or a shared device) needs an ad-hoc/IPA export with the distribution
  identity instead.
- **Android:** not set up on this machine (no JDK, no Android SDK), so no APK is produced.

### Plain HTTP and iOS App Transport Security

Prebuild writes `NSAllowsArbitraryLoads=false` with `NSAllowsLocalNetworking=true`: plain
HTTP to a **private LAN address** is allowed (`192.168.x.x` — this machine is
`192.168.3.85`), but that is not promised for a Tailscale address, because `100.x` is
CGNAT rather than RFC1918. So:

- phone on the same Wi-Fi: `EXPO_PUBLIC_COOLIE_BASE_URL=http://192.168.3.85:3100`
- phone on the tailnet over plain HTTP: may fail at sign-in with a network error. Give the
  instance HTTPS (which production needs anyway) rather than weakening ATS in a build that
  reaches a customer.

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
- ⚠️ **Voice dispatch is wired end to end; it needs the instance's ASR credentials.**
  The route it calls (`POST /api/plugins/paperclipai.plugin-multimodal/api/transcriptions`)
  used to answer `403 Board access required` to an agent key — the plugin declared it with
  the manifest's POST default of `auth: "board"` while the clients authenticate with agent
  keys. That declaration is now `board-or-agent`, and the same request from the same key
  answers **`501 ASR_NOT_CONFIGURED`**: authentication and company access pass, and what
  remains is that the instance has no Tencent Cloud ASR credentials configured for the
  company. Once an operator sets them, this returns a transcription and a created task.
  Recording itself (`expo-av` → base64) is wired but has never been exercised on a device.
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
