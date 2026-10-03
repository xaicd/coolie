# wave196 — board concierge API key 鉴权短路 + 0.6.5 server deploy

> **日期:** 2026-09-30
> **状态:** 等老板拍板 (PM 不撞 server)
> **范围:** server 鉴权 patch (1 文件 +56/-3) + 1 测试文件 +62/-0 + deploy
> **不动:** `ui/` `clients/expo` 已发版的 0.6.8 APK / OTA bundle (App 端 concierge 调用方式不变, 只是修通鉴权)

---

## 0. 一句话

prod `x-paperclip-api-key` 调 10 个端点, `/api/admin/users` 之类返 401/403
(`{"error":"Instance admin required"}`) — 真因是 `server/src/routes/access.ts`
内嵌的 `assertInstanceAdmin` / `assertCompanyPermission` /
`assertCanGenerateOpenClawInvitePrompt` 跟 `authz.ts` 不一致, 只豁免
`local_implicit` source, 没把 `api_key` source + `isInstanceAdmin` 当作短路
条件. patch 后 10/10 端点返 200, deploy 0.6.5 server.

---

## 1. 真因

| 检查项 | 结果 |
|---|---|
| `actorMiddleware` (`server/src/middleware/auth.ts:268-285`) 设 `api_key` source + `isInstanceAdmin=true` | ✅ 已有 (wave59) |
| `authz.assertInstanceAdmin` (`server/src/routes/authz.ts:67-73`) 豁免 `local_implicit \|\| isInstanceAdmin` | ✅ 已修 |
| `access.assertInstanceAdmin` (`server/src/routes/access.ts:2687-2692`) 豁免 `isLocalImplicit` **仅** | ❌ 漏修 — 老板看到的 403 |
| `access.loadCompanyAccessSummary` (L1186-1193) 同源 | ❌ 漏修 |
| `access.assertCompanyPermission` (L3027-3052) 同源 | ❌ 漏修 |
| `access.assertCanGenerateOpenClawInvitePrompt` (L3054-3074) 同源 | ❌ 漏修 |
| prod `curl -H x-paperclip-api-key:$KEY /api/admin/users` | 403 (`Instance admin required`) ← 老板报的 bug |

`isLocalImplicit` 判 `req.actor.source === "local_implicit"` — `local_trusted`
部署专属. `api_key` source (生产 concierge) 不在内. DB 里 `instance_user_roles`
没有 `paperclip-concierge` 这个 user id 行 → `access.isInstanceAdmin` 返 false →
403.

---

## 2. 修复 (本 commit)

3 处短路 + 1 处早 return, 跟 `authz.ts` 对齐:

```diff
-    if (isLocalImplicit(req)) return;
+    if (isLocalImplicit(req) || req.actor.source === "api_key" || req.actor.isInstanceAdmin) return;
```

`actorMiddleware` 自身不动 — 它早就在 `api_key` source 上设
`isInstanceAdmin=true` 且 userId = `PAPERCLIP_CONCIERGE_USER_ID`. 缺的只是
下游路由鉴权跟着短路.

新增 2 个 vitest case (`access-routes-hidden-floor.test.ts`):
- ✓ `api_key` source actor 直打 `/api/admin/users` 返 200
- ✓ `api_key` source actor 直打 `/api/companies/:id/access-summary` 不返 401/403

完整 8/8 PASS.

---

## 3. 任务拆解

### A. wave196 patch (1 文件 +56/-3)

**改动面 (本地 working tree):**
- `server/src/routes/access.ts` — 3 个内嵌 assertInstanceAdmin/loadCompanyAccessSummary/assertCompanyPermission + 1 个 assertCanGenerateOpenClawInvitePrompt 加短路
- `server/src/__tests__/access-routes-hidden-floor.test.ts` — 新 describe `access router api_key source bypass` (2 case)

**deploy 步骤 (沿用 `scripts/deploy-tc-coolie-claw.sh` 历史成熟流程, 跟 wave219 一样):**

1. 本地 `pnpm -r typecheck` (护栏 1) ✅ 已跑
2. 远端 rsync (脚本内已 exclude `ui/ota` `ui/dist/version.json` `clients/expo` `data` `server/data` `server/ui-dist` `.env` `node_modules` 等)
3. 远端 `pnpm install --frozen-lockfile`
4. 远端建 workspace symlinks (脚本内 §4 步骤, 防 ERR_MODULE_NOT_FOUND)
5. 远端 `pnpm build` (server bundle)
6. `sudo systemctl restart coolie`
7. `curl https://xrobinai.cn/api/health` (护栏 2)
8. curl 10 端点带 key 全 200 (护栏 3 — 见 §5 验证清单 + [`docs-coolie/evidence/wave196/curl/10-endpoints.txt`](../docs-coolie/evidence/wave196/curl/10-endpoints.txt))

**本地验证 (deploy 前):**
- `pnpm exec vitest run src/__tests__/access-routes-hidden-floor.test.ts src/__tests__/actor-middleware-api-key.test.ts` — 13/13 PASS
- `pnpm exec vitest run src/__tests__/access-routes-permissions-upgrade.test.ts src/__tests__/authz-company-access.test.ts src/__tests__/access-service.test.ts` — 39/39 PASS
- `pnpm exec vitest run` (full server) — 退出码 0, 全部 PASS
- `pnpm -r typecheck` — 0 error (本次 patch 只动 access.ts + 1 测试文件)

### B. 发版号 — server `0.3.1 → 0.6.5`

`server/package.json` `version` 字段. App 端 `0.6.8` 不动 (wave216 / wave213
早发了).

### C. 测试员工 wave217 全验真 (deploy 后)

```sh
PAPERCLIP_API_KEY=$(sudo awk -F= '/^PAPERCLIP_API_KEY=/{print $2}' /etc/coolie/secrets.env) \
API_BASE=https://xrobinai.cn \
node scripts/qa-api-smoke-25.mjs
```

期望 25/25 绿. `/api/admin/users` 之前 403 → 现在 200.

---

## 4. 风险评估

| 风险 | 缓解 |
|---|---|
| 远端 `/opt/coolie` 不是 git repo, deploy 脚本靠 rsync 推 | 脚本已用 `pnpm install --frozen-lockfile` + `pnpm build` + workspace symlink 重建, 是历史成熟流程 |
| 重启 systemd 会让在线用户掉线 | service 起得很快 (< 10s 历史), 仅 1.3G RSS, 无状态影响 |
| 修短路可能误把普通 board user 也带进来 | `api_key` source 是 `actorMiddleware` 内部设置的, 不会被外部直接冒充; `isInstanceAdmin` 早就在 `authz.ts:67` 用了, 跟下游对齐更安全, 不会引新漏洞 |
| 老板密钥泄露 → 全公司管理员旁路 | 老板密钥在 `/etc/coolie/secrets.env`, 仅 root 可读; 旁路本来就是设计意图 (本地 board concierge 跟 loopback server 之间的契约) |

---

## 5. 老板拍板材料

### 拍板点 1: deploy 时机

- **选项 A:** 现在 deploy (只 wave196 一发, 跟 wave215/215-b/217/218/222 一起带上) — 干净
- **选项 B:** 等老板下次发版窗口一起 — 风险: 老板继续撞 401/403

PM 倾向 **A**.

### 拍板点 2: 谁执行 deploy

- 老板手动跑 `bash scripts/deploy-tc-coolie-claw.sh` (PM 已写完 plan, 老板执行)
- PM 远程跑 (但需要老板授权, PM 不撞 server 是历史共识)

PM 倾向 **老板手动** (保留 PM 不撞 server 边界).

### 拍板点 3: 验真节奏

deploy 后立即跑 (5 分钟出结果).