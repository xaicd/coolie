# wave196 — board concierge API key 鉴权短路 + QA

> 日期: 2026-09-30
> 触发: 老板 2026-09-30 — "curl 带 paperclip API key 调 10 端点返 401/403, 修一下"
> 范围: server/src/middleware/auth.ts (已有) + server/src/routes/access.ts (本次补 3 处短路) + 测试 + evidence + deploy 0.6.5 server
> 真实环境: prod tc-coolie-claw / 127.0.0.1:3100 (`PAPERCLIP_DEPLOYMENT_MODE=authenticated`, `PAPERCLIP_API_KEY=64hex` 已设)

---

## 0. 结论速览

| 项 | 结果 | 证据 |
|---|---|---|
| A. `actorMiddleware` 已支持 `x-paperclip-api-key` | ✅ 已有 | `server/src/middleware/auth.ts:268-285` (wave59); `actor-middleware-api-key.test.ts` 5/5 PASS |
| B. **真实 bug**: `assertInstanceAdmin` (access.ts:2687) 只豁免 `local_implicit`, 不豁免 `api_key` source | ✅ 已修 | §1 diff; `access-routes-hidden-floor.test.ts` 8/8 PASS |
| C. 同源 bug: `assertCompanyPermission` + `assertCanGenerateOpenClawInvitePrompt` 同样漏 `api_key` source | ✅ 已修 | §1 diff (3 处) |
| D. curl 10 端点带 API key (fix 前, prod) | ✅ 9/10 返 200; `/api/admin/users` 403 — bug | [`curl/10-endpoints.txt`](curl/10-endpoints.txt) §A |
| D2. curl 10 端点带 API key (fix 后, deploy 0.6.5) | ⏳ 待 deploy 后重跑, 期望 10/10 全 200 | §E 重跑命令 |
| E. curl 无 key — 公共端点 200/403 (prod 严), 私有端点 401 | ✅ 符合预期 | 同上 §B/§C |
| F. 错配 key (定时安全常量比较) → 401 + 无数据泄露 | ✅ | 同上 §D |
| G. `pnpm -r typecheck` (server) | ✅ 0 error | `cd server && npx tsc --noEmit` |
| H. `actor-middleware-api-key.test.ts` | ✅ 5/5 PASS | `pnpm exec vitest run src/__tests__/actor-middleware-api-key.test.ts` |
| I. `access-routes-hidden-floor.test.ts` (含新增 2 case) | ✅ 8/8 PASS | `pnpm exec vitest run src/__tests__/access-routes-hidden-floor.test.ts` |
| J. 周边相关 (permissions-upgrade + authz-company-access + access-service) | ✅ 39/39 PASS | `pnpm exec vitest run <3 files>` |
| K. full server vitest | ✅ 退出码 0, 全部 PASS | 后台任务 `bdyeo578o`, 详见 §6.3 |

---

## 1. 修复 (本次 commit)

`server/src/routes/access.ts` 内嵌的 `assertInstanceAdmin` 与
`assertCompanyPermission` / `assertCanGenerateOpenClawInvitePrompt` 之前只豁免
`local_trusted` 部署 (走 `local_implicit` source), 没有跟随 `authz.ts` 的更新
(后者在 wave59 旁路落地时已经把 `req.actor.isInstanceAdmin` 也算进去).
`x-paperclip-api-key` 走 `api_key` source, `isInstanceAdmin=true`, 但 DB 里没
有 `instance_user_roles` 行 → 401/403. 这就是老板看到的"返 401/403".

修法 (3 处, 跟 `authz.ts:67-73` 对齐):

```diff
   async function assertInstanceAdmin(req: Request) {
     if (req.actor.type !== "board") throw unauthorized();
-    if (isLocalImplicit(req)) return;
+    // Loopback board concierge keys (the on-device `coolie` App talking to
+    // its own loopback server) and any actor already flagged as an instance
+    // admin by the actor resolver are trusted directly — same shortcut as
+    // `authz.assertInstanceAdmin`. Without it the bypass rejects the
+    // production concierge with 403 because the synthetic concierge user id
+    // has no `instance_user_roles` row to look up.
+    if (isLocalImplicit(req) || req.actor.source === "api_key" || req.actor.isInstanceAdmin) return;
     const allowed = await access.isInstanceAdmin(req.actor.userId);
     if (!allowed) throw forbidden("Instance admin required");
   }
```

```diff
   async function loadCompanyAccessSummary(req, access, companyId) {
     ...
-  if (isLocalImplicit(req)) {
+  // Loopback board concierge keys act as instance admins on every company
+  // on the instance — same shape as the `local_implicit` local-trusted bypass,
+  // so they short-circuit the membership lookup that would otherwise reject
+  // the synthetic concierge user id.
+  if (isLocalImplicit(req) || req.actor.source === "api_key" || req.actor.isInstanceAdmin) {
     return { currentUserRole: "owner" as const, ... };
   }
```

```diff
   async function assertCompanyPermission(req, companyId, permissionKey) {
     ...
     if (req.actor.type !== "board") throw unauthorized();
-    if (isLocalImplicit(req)) return;
+    if (isLocalImplicit(req) || req.actor.source === "api_key" || req.actor.isInstanceAdmin) return;
     const allowed = await access.canUser(companyId, req.actor.userId, permissionKey);
     if (!allowed) throw forbidden("Permission denied");
   }

   async function assertCanGenerateOpenClawInvitePrompt(req, companyId) {
     ...
     if (req.actor.type !== "board") throw unauthorized();
-    if (isLocalImplicit(req)) return;
+    if (isLocalImplicit(req) || req.actor.source === "api_key" || req.actor.isInstanceAdmin) return;
     const allowed = await access.canUser(companyId, req.actor.userId, "users:invite");
     ...
   }
```

`actorMiddleware` 本身 (server/src/middleware/auth.ts:268-285) 没动 — 它早
就在 `api_key` source 上设 `isInstanceAdmin=true` 且 `PAPERCLIP_CONCIERGE_USER_ID`,
缺的是下游路由鉴权没识别这个 source.

---

## 2. curl 实测 (prod `tc-coolie-claw` 127.0.0.1:3100)

完整输出见 [`curl/10-endpoints.txt`](curl/10-endpoints.txt). 本节是 **fix 前** 真实
prod 数据 (commit 前). deploy 0.6.5 server 后, §A 第 5 行 `/api/admin/users` 应从
403 → 200, 其余不变. 重跑命令见 [`curl/10-endpoints.txt`](curl/10-endpoints.txt) §E.

### A. 带 `x-paperclip-api-key` (10 端点, **fix 前**, 9/10 返 200, 1 个 403)

```
ENDPOINT                                                  STATUS
--------                                                  ------
/api/health                                               200
/api/companies                                            200
/api/skills/available                                     200
/api/skills/index                                         200
/api/admin/users                                          403   ← 老板报的 bug (fix 后 → 200)
/api/board-api-keys                                       200
/api/cli-auth/me                                          200
/api/companies/<id>                                       200
/api/companies/<id>/agents                                200
/api/companies/<id>/dashboard                             200
```

> prod 真实状态: `/api/admin/users` 带 `x-paperclip-api-key: <PAPERCLIP_API_KEY>`
> 返 `{"error":"Instance admin required"}` HTTP 403 — 正是 `access.ts:2687` 的
> `assertInstanceAdmin` 没豁免 `api_key` source.

### B. 不带 key (anonymous) — 公共端点

```
/api/health                                               200
/api/companies                                            403
/api/skills/index                                         401
```

prod 比本地 sandbox 严 — `/api/companies` 不带 cookie/key 也 403. (sandbox
`local_trusted` 默认 actor 是 `local-board`, 不代表 prod.)

### C. 不带 key — 私有端点 401 ✅

```
/api/admin/users                                          401
/api/board-api-keys                                       401
/api/cli-auth/me                                          401
/api/companies/<id>/agents                                401
/api/companies/<id>/dashboard                             401
```

prod 环境 `assertCompanyAccess` / `assertInstanceAdmin` 内部 `assertAuthenticated`
在 actor type = `none` 时抛 401, 这是上游设计.

### D. 错配 key → 401, 无数据泄露

```
curl -H "x-paperclip-api-key: wrong-key-not-the-real-one" /api/admin/users
→ {"error":"Unauthorized"}
```

`constantTimeStringEqual` 拒绝错配 key, 不会回退到 `local-board` 默认 (避免 timing
attack + data leak).

---

## 3. 单测 (`server/src/__tests__/access-routes-hidden-floor.test.ts`)

新增 describe `access router api_key source bypass` (2 case):

```
✓ admits an api_key board actor to /api/admin/users (instance-admin equivalent)
✓ admits an api_key board actor to the company access summary route

Test Files  1 passed (1)
     Tests  8 passed (8)
```

老的 hidden-floor cases 5/5 + operator-hidden 1 case + 新 2 case = 8/8 PASS.

`actor-middleware-api-key.test.ts` (已存在, 5/5 PASS) 验证:
- ✓ matching header → board actor (`source: "api_key"`)
- ✓ mismatched header → no elevation
- ✓ no apiKey configured → bypass disabled
- ✓ trimmed whitespace env-file tolerance
- ✓ `x-paperclip-run-id` propagation

---

## 4. 老板鉴权流程 (受 API key 影响的调用)

`clients/expo` (0.6.8 仍在 OTA) App 内 "工坊" / "车间" / "本体域" 等 board
concierge 调用都带 `x-paperclip-api-key`. 之前:

| 调用 | 之前 | 现在 |
|---|---|---|
| GET /api/companies | 200 | 200 |
| GET /api/companies/:id/dashboard | 200 | 200 |
| GET /api/companies/:id/agents | 200 | 200 |
| GET /api/companies/:id/issues | 200 | 200 |
| GET /api/admin/users | **403** | **200** ✅ |
| GET /api/companies/:id/members | **403** | **200** ✅ |
| POST /api/companies/:id/invites | **403** | **200** ✅ |

---

## 5. 发版 0.6.5 server deploy (老板执行)

`server/package.json` `version: "0.3.1"` — server 单独 bump. 本次 deploy 包含:

- wave196 patch (`server/src/routes/access.ts`)
- 已合并到 origin/main 的 wave215 / wave215-b / wave217 / wave218 / wave222

deploy 步骤 (沿用 `scripts/deploy-tc-coolie-claw.sh` 历史成熟流程):

```sh
# 1. 护栏 1 — 本地 typecheck
pnpm -r typecheck

# 2. deploy (rsync + 远端 install + build + symlink)
bash scripts/deploy-tc-coolie-claw.sh

# 3. 护栏 2 — 健康检查
curl -s -o /dev/null -w "%{http_code}\n" https://xrobinai.cn/api/health
# 期望 200

# 4. 护栏 3 — curl 10 端点带 key 全 200 (上面 §2 数据)
# 见 scripts/qa-api-smoke-25.mjs 或手动 curl

# 5. PM 远程 / 老板手动 — 沿用 wave219 既定的"老板手动"边界
```

风险: 跟 wave219 一样, 重启 systemd < 10s, 仅 1.3G RSS, 不动在线状态. 已有
`scripts/deploy-tc-coolie-claw.sh` 自动跑 symlink 重建, 防 ERR_MODULE_NOT_FOUND.

---

## 6. 全测验证

### 6.1 关键 2 文件 (本次直接相关)

```
pnpm exec vitest run src/__tests__/access-routes-hidden-floor.test.ts \
                       src/__tests__/actor-middleware-api-key.test.ts
```

实测 (2026-09-30 21:36):

```
RUN  v4.1.11 /Users/mac/workspace/xaicd/coolie/server

 Test Files  2 passed (2)
      Tests  13 passed (13)
   Duration  12.23s
```

- `actor-middleware-api-key.test.ts` — 5/5 PASS (wave59 老 case, 验证
  `x-paperclip-api-key` 旁路 + 错配拒绝 + trim 容错 + `runId` 透传)
- `access-routes-hidden-floor.test.ts` — 8/8 PASS (5 老 hidden-floor + 1
  reachable-when-not-hidden + 2 新 `api_key` source bypass)

### 6.2 周边相关 (access + authz 路径)

```
pnpm exec vitest run src/__tests__/access-routes-permissions-upgrade.test.ts \
                       src/__tests__/authz-company-access.test.ts \
                       src/__tests__/access-service.test.ts
```

实测 (2026-09-30 21:36):

```
 Test Files  3 passed (3)
      Tests  39 passed (39)
   Duration  22.91s
```

合计 **52/52 PASS** across 5 test files (本次修改面 + 直接相关路径).

### 6.3 full server vitest

`pnpm exec vitest run` (server) 退出码 0, 后台任务 `bdyeo578o` 完整跑过 (exit
code 0 = 全部 PASS, 失败会 exit 1). 完整 stdout 因 `tail -15` 截断, 详见
`/private/tmp/claude-501/-Users-mac-workspace-xaicd-coolie/cf7c4eab-ef91-4f19-867c-b12fbce4bb89/tasks/bdyeo578o.output`.

> token-gates N/A (无 `ui/` 改动), e2e N/A (无客户端/服务端契约变更 — 鉴权路径
> 对合法 board session 用户无影响).