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

`EXPO_PUBLIC_COOLIE_BASE_URL` overrides the base URL at bundle time. The default is the
live HTTPS instance, so a build handed to someone works out of the box:

```sh
# default: https://xrobinai.cn
EXPO_PUBLIC_COOLIE_BASE_URL=http://192.168.3.85:3100 npx expo run:ios --device   # local dev
```

## Signing in

Two ways in, for two different people:

- **Email and password (what the sign-in screen shows)**, a normal session. Use this for
  anyone who was handed the app. The session cookie lives in the platform's own cookie
  jar, so it survives relaunches.
- **A bearer key**, behind "Use an API key instead" — an **agent** key (scoped to exactly
  one company) or a **board** key (company memberships). For scripted use and for driving
  the app as an agent. Both kinds arrive as `Authorization: Bearer`, and the host prefers
  board keys, so the app tells them apart by using them: `GET /api/agents/me` answers 200
  only for an agent key. A key that fails both probes is reported as rejected rather than
  showing an empty task list.

Which companies you get is then resolved, not configured — an agent key's single company,
or the memberships of a board key or session. **Zero memberships is a real state** and the
app says so instead of showing an empty board; one company is entered directly; several
are a list to pick from.

### The `Origin` header, which native clients must send

A native app is not a browser and sends no `Origin`. The host's CSRF guard
(`server/src/middleware/board-mutation-guard.ts`) then refuses **cookie-authenticated
mutations** with `403 Board mutation requires trusted browser origin` — measured on this
repo's own route: the same session cookie POSTing an issue is 403 without the header and
201 with it. Reads are unaffected, which is why the failure looks like "sign-in worked,
but nothing can be created".

So the app declares `Origin: <its own instance origin>` on every request
(`COOLIE_ORIGIN` in `src/coolie.ts`, derived from the base URL rather than configured, so
it cannot drift). Better Auth's `sign-out` needs the same header — `403 Missing or null
Origin` without it — even though `sign-in` does not, because at sign-in there is no
session cookie to protect yet. Web clients leave this unset: browsers set the header
themselves and forbid code from overriding it.

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

## OTA 增量热更新 (expo-updates)

本项目集成了 `expo-updates` 实现了针对 JS/React Native 层的免重新发版增量热更新。

### 1. 更新源与策略配置 (`app.json`)

- **自建更新源 URL**: `https://xrobinai.cn/ota/manifest`
- **更新渠道**: `production` (通过 `requestHeaders["expo-channel-name"]` 声明)
- **检查策略**: `checkAutomatically: "ON_LOAD"` (启动时自动在后台请求更新源检查新版本)
- **缓存回退与启动耗时**: `fallbackToCacheTimeout: 0` (避免等待网络请求阻塞应用启动，首屏先载入本地缓存 bundle，后台静默下载更新)
- **运行时版本控制**: `runtimeVersion.policy: "appVersion"` (严格基于原生 App 版本号匹配，保障原生模块兼容性)

### 2. 客户端监听与手动检查 (`src/OTA.ts`)

- **全局事件监听**: 在 `App.tsx` 根部挂载 `setupOTAListener()`，当后台静默下载完毕新版本 (`isUpdatePending`) 时，主动弹出系统原生弹窗提示用户立即重启生效。
- **手动检查更新**: 驾驶舱效能页 (`DashboardScreen`) 右上角集成「检查更新」按钮，通过 `useOTA()` hook 提供即时查询反馈。
- **安全与审计**:
  - 请求中自动注入客户端唯一标识 (`device_id` extra param 来自 `Constants.installationId` / `sessionId`)，便于服务端访问日志分析与灰度追踪。
  - *TODO (生产加固)*: 后续可接入 Expo Code Signing 公钥数字签名校验机制 (`updates.codeSigningCertificate`)，实现端到端防篡改验签。

### 3. 发布 OTA 更新包流程 (`scripts/publish-ota.sh`)

服务端由 Caddy 直接提供静态文件服务，映射路径为：
`https://xrobinai.cn/ota/` 对应服务器目录 `/opt/coolie/ui/ota/`。

**一键发布命令**:
```sh
# 方式 1: 在 clients/expo 目录执行
bash scripts/publish-ota.sh [all|ios|android]

# 方式 2: 在仓库根目录执行
bash scripts/publish-ota.sh [all|ios|android]
```

**发布脚本执行逻辑**:
1. 执行 `expo export --platform all --output-dir dist`，编译生成离线 JS Bundle 和资产映射文件。
2. 自动解析 `app.json` 和 `dist/metadata.json`，生成符合 Expo Updates Protocol v0 规范的 `dist/manifest`、`dist/manifest.json` 及平台专属清单。
3. 通过 rsync 经 SSH (`tc-coolie-claw`) 安全推送到生产服务器 `/opt/coolie/ui/ota/`。
4. 校验远端 manifest 文件可读性，完成秒级无缝热更发布。

## What works / TODO

- ✅ Installs, typechecks and bundles from a clean checkout (`pnpm typecheck`,
  `pnpm bundle` — 574 modules, ~1.65 MB Hermes bundle).
- ✅ **OTA 增量热更新支持**: 自建更新源 `https://xrobinai.cn/ota/manifest`、后台静默拉取、下载完成弹窗重启、效能大盘右上角手动检查更新。
- ✅ **Sign in with email and password (session), or paste a bearer key** — agent or board.
  A stored key is **validated before it is stored**, so a bad key reports the reason instead
  of showing up later as an empty task list, and a key revoked since last launch sends you
  back to the sign-in screen rather than into a screen of errors.
- ✅ **The company is resolved from the credential, not chosen up front**: an agent key's one
  company, a board key's or session's memberships. Zero, one and many are all handled — an
  account with no membership is told so, rather than shown an empty board.
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
  push/live updates, enforcing the Tencent limits
  (≤60s / ≤3 MB) client-side, editing or transitioning a task from the detail screen,
  error/empty state polish, strings for the people who will actually use this (the UI is
  English today).

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
| `voiceDispatch()` | **501 ASR_NOT_CONFIGURED** — past auth, needs the instance's ASR keys |

The session and key paths were checked the same way, against the live instance, from a
non-browser client (curl, so no cookie jar magic to hide behind): `sign-in/email` returns
200 with no `Origin` and sets the session cookie; `get-session` and `GET /api/companies`
then work with **only** that cookie; a new account correctly lists **no** companies. The
CSRF guard was measured with and without `Origin` on a real mutation, which is where the
`originHeader` option comes from.

The app itself was built, installed and launched on an iPhone 17 Pro simulator
(`npx expo run:ios`), and the sign-in screen of this change was captured as
`screenshots/expo-signin-email.png` — **that file is local-only, `screenshots/` is
gitignored**, so a reader of this repo will not have it; rebuild the app and the screen
is one command away. What that capture does **not** cover: nobody has typed
credentials into it, so the app-side wiring of sign-in (cookie jar, `Origin` header through
RN's fetch) is reasoned-plus-measured-elsewhere rather than observed in the app.

This is how the four route bugs fixed in `@coolie/api-client` were found: the client
had been calling `/api/issues` and `/api/companies`, which either do not exist or are
board-only, so nothing but the sign-in screen would ever have worked.

Still unverified: anything on a device. The recorder has never run on real hardware, and
"cannot be verified from CI" is not the same as verified.
