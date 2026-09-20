# Security Audit — Coolie server + Coolie App (`release/0.5.0`)

- **Date:** 2026-09-20
- **Branch:** `release/0.5.0`
- **Scope:** `server/` (auth middleware, authz, auth routes, plugin install/secrets routes, secrets service) and `clients/expo/` (native client credential handling). Local scratch files reachable from the host.
- **Mode:** Read-only. No code changed by this audit.
- **Method:** Manual review of the files named in the brief plus their direct call paths (actor middleware, board-mutation guard, HTTP log redaction, plugin UI static serving).

Severity legend: **Critical** = full operator compromise with no prerequisite. **High** = credential/secret exposure or a missing controlled-actor safeguard. **Medium** = weakens defense in depth, exploitable only in combination.

---

## 1. Live board API key persisted in world-readable local scratch (`/tmp`)

- **Severity:** Critical
- **Where:** `/tmp/.pap-tok` (mode `0644`, owner `mac`), with companions `/tmp/.pap-co` and `/tmp/.pap-pid`; `/tmp/audio_url.txt` also holds a signed CDN URL carrying an access token.
- **Evidence:**
  - `/tmp/.pap-tok` contains a plaintext board key in the exact generated format `pcp_board_912f19a6…4186b` (`server/src/services/board-auth.ts:32` mints `pcp_board_${randomBytes(24).toString("hex")}`).
  - `/tmp/.pap-co` holds a company UUID, `/tmp/.pap-pid` an agent UUID — the two identifiers the key is paired with.
  - `/tmp/audio_url.txt` holds a `douyinvod.com` media URL with a signed query string.
- **Impact:** A board key is treated as full-control operator context (`actorMiddleware`, `server/src/middleware/auth.ts:307-327`; `assertInstanceAdmin`/`assertBoardOrgAccess` in `server/src/routes/authz.ts`). Any local user or process that can read `/tmp` can act as the instance admin. The `0644` mode makes it readable by every account on the host, not just the owner. There is no expiry on the board key, so the exposure persists until explicitly revoked.
- **Fix:**
  1. Delete the scratch files: `rm -f /tmp/.pap-tok /tmp/.pap-co /tmp/.pap-pid /tmp/audio_url.txt`.
  2. **Revoke and rotate** that board key — treat it as compromised (`board_api_keys` revocation path in `server/src/services/board-auth.ts`), then verify the old key 401s.
  3. Stop writing credentials to `/tmp` from helper scripts; pass them via env or a `0600` file under the instance home directory.
  4. Rotate anything the leaked key could reach if it was used (agent keys, secrets) since the key could have been replayed.

---

## 2. Cloud trusted-header bearer is written to logs in cleartext

- **Severity:** High
- **Where:** `server/src/middleware/auth.ts:600` (reads the header) / `server/src/middleware/http-log-redaction.ts:1-22` (redact list) / `server/src/middleware/redact-sensitive.ts:14-90` (key allowlist).
- **Evidence:**
  - `resolveCloudTenantActorOnce` authenticates by comparing `x-paperclip-cloud-tenant-token` against `PAPERCLIP_CLOUD_TENANT_SERVER_TOKEN` (`auth.ts:597-601`) — a reusable bearer that can assume any tenant user.
  - `HTTP_LOG_REDACT_PATHS` covers `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, `x-csrf-token`, `x-xsrf-token`, `x-api-key`, and `x-telegram-bot-api-secret-token` — but **not** `x-paperclip-cloud-tenant-token`.
  - `pino-http`'s request serializer, spread as `...req` in `logger.ts:95-105`, includes `req.headers`, so all request headers are logged unless redacted by exact path.
  - `redactSensitive` matches keys by **exact** lowercase equality (`redact-sensitive.ts:111-113`), so the generic `"token"` entry does not catch the verbatim header name.
- **Impact:** Any request carrying the Cloud tenant token writes that token to the log sink, including failure logs. On a managed/cloud stack this is a credential that authenticates as an arbitrary user of the instance — a log reader becomes an account holder.
- **Fix:**
  1. Add `'req.headers["x-paperclip-cloud-tenant-token"]'` to `HTTP_LOG_REDACT_PATHS`.
  2. Add `"x-paperclip-cloud-tenant-token"` to `SENSITIVE_KEYS` in `redact-sensitive.ts` so recursive body/context copies are covered too.
  3. Add a redaction test asserting the header value never appears in an emitted log line.

---

## 3. Reading a secret value is not audit-logged (and the secrets surface has no rate limit)

- **Severity:** High
- **Where:** `server/src/routes/secrets.ts:336-359` (`POST /agents/me/secrets/:key/value`).
- **Evidence:**
  - The value endpoint resolves a plaintext secret via `resolveSecretValueForAgentAccess` and returns it (`secrets.ts:341-358`) but never calls `logActivity`.
  - The sibling *list* endpoint does log — `secrets.ts:317-327` writes `action: "secret.access.listed"` — so the sensitive read path is the one left unlogged.
  - No `rateLimit`/`rateLimiter`/`consume(` appears anywhere in `secrets.ts`, so the value endpoint is unthrottled. The only related limiter is inside the plugin worker handler (`server/src/services/plugin-secrets-handler.ts:175-189`), and it is an in-process `Map` with no eviction (grows unbounded, resets on restart).
- **Impact:** Secret reads are invisible in the activity log, so exfiltration by a compromised agent key has no trail. Unthrottled reads turn a single compromised agent into an enumeration/harvest channel.
- **Fix:**
  1. After a successful resolution, write `logActivity` with `action: "secret.access.resolved"`, `entityType: "secret"`, `entityId: secret.secretId`, and details `{ key, version, runId, configPath }` — mirroring the `secret.access.listed` entry.
  2. Add a bounded per-actor rate limit on `/agents/me/secrets/:key/value` (reuse `createInviteRateLimiter` / a shared limiter with TTL eviction).
  3. Give `createRateLimiter` in `plugin-secrets-handler.ts` TTL eviction so the map cannot grow without bound.

---

## 4. Auth rate limiting is off on the default deployment mode

- **Severity:** Medium-High
- **Where:** `server/src/auth/better-auth.ts:71-90` (`shouldEnableAuthRateLimit`) and `server/src/config.ts:176`.
- **Evidence:**
  - `shouldEnableAuthRateLimit` returns `input.deploymentMode === "authenticated"` when no override is set (`better-auth.ts:80`).
  - The default deployment mode is `local_trusted` (`config.ts:176`: `… ?? "local_trusted"`), so out of the box the better-auth limiter is **disabled**.
  - The only override is `PAPERCLIP_AUTH_RATE_LIMIT_ENABLED` (`better-auth.ts:319`), which an operator must set by hand.
- **Impact:** Credential endpoints (`/api/auth/sign-in/email`, etc.) accept unlimited attempts on a default install. A self-hosted instance reachable off-loopback has no brute-force protection, and any login rate limiting that an operator expects from an auth provider is absent.
- **Fix:** Flip the default so rate limiting is enabled unless it is explicitly disabled **and** the instance is loopback-only. Concretely, enable when `deploymentMode === "authenticated"` **or** the bind/exposure is not loopback, and keep `PAPERCLIP_AUTH_RATE_LIMIT_ENABLED=false` as the explicit opt-out.

---

## 5. Unauthenticated plugin UI serving + wildcard CORS

- **Severity:** Medium
- **Where:** `server/src/routes/plugin-ui-static.ts:243` (route), `:302-312` (optional auth), `:509` (`Access-Control-Allow-Origin: *`); mounted outside the guarded API router at `server/src/app.ts:992-996`.
- **Evidence:**
  - `GET /_plugins/:pluginId/ui/*filePath` is mounted with `app.use(...)`, not under the `/api` router, so `boardMutationGuard` and any future API-wide auth never apply.
  - Inside the handler, `assertCompanyAccess` runs **only when a `companyId` query param is present** (`plugin-ui-static.ts:309-312`); when the caller omits `companyId`, no authorization check runs before the bundle is served.
  - The response unconditionally sets `Access-Control-Allow-Origin: *` (`:509`), letting any web origin read the bundle.
- **Impact:** Plugin UI bundles are readable by unauthenticated callers from any origin. Bundles are shipped code rather than secrets, so confidentiality impact is limited, but this is exactly the "missing auth on route" + "missing CORS tightening" pattern and it weakens the boundary the rest of the `/api` surface enforces.
- **Fix:**
  1. Require authentication for the route regardless of `companyId` (e.g. `assertAuthenticated(req)`, or scope to a known plugin install and call `assertCompanyAccess` unconditionally when a company scope exists).
  2. Replace `Access-Control-Allow-Origin: *` with the trusted-origin echo already available from `trustedBoardMutationOrigin` (`server/src/middleware/board-mutation-guard.ts:65-74`), or drop the header and rely on same-origin serving.
  3. Consider mounting the route under the guarded `/api` router unless plugin UI genuinely needs a non-`/api` path.

---

## Checked and found already handled (no finding)

- **CSRF on state-changing board routes:** `boardMutationGuard` (`server/src/middleware/board-mutation-guard.ts:76-107`) is mounted on the API router (`app.ts:677`) and rejects cookie-session board mutations lacking a trusted origin/referer. Bearer/agent/cloud sources are intentionally exempt.
- **Secret rotation path exists:** `POST /api/secrets/:id/rotate` (`server/src/routes/secrets.ts:992-1030`) with `secret.rotated` activity logging — the "no rotation path" gap does not apply.
- **Credential headers in request logs:** `authorization`/`cookie`/`set-cookie` are redacted (`http-log-redaction.ts:1-22`); request URLs are query-stripped (`redact-sensitive.ts:119-135`).
- **Native client token storage:** the Expo client stores the bearer in `SecureStore` (keychain/keystore), not plaintext, and clears it on sign-out (`clients/expo/src/coolie.ts`).

## Notes on scratch material reviewed

- `/tmp/keys.txt`, `/tmp/keys_HEAD.txt`, `/tmp/keys_WORK.txt` contain StyleSheet token **names only** (no values) — not secret material.
- `/tmp/auth2.json`, `/tmp/auth_test.json` contain only `{"error":"Board access required"}` — not secret material.
- `/tmp/.pap-tok` is the one scratch file carrying real credential material (finding 1).
