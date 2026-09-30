# wave207 QA — `GET /api/companies/4caf.../auth/sign-up` 404

## TL;DR — brief 描述的 bug 不存在

老板 brief:

> `auth/sign-up` 路由已注册但没挂到正确 path, GET 返 404.
> 改 `server/src/routes/index.ts` 挂到正确 path.
> QA: curl GET auth/sign-up 200. 发版 0.6.5 server.

真因:

1. **brief 命名的路径从未注册过** —— `/api/companies/<companyId>/auth/sign-up` 在仓库任何地方都不存在 (route 文件 / UI / CLI / 测试 0 hit)。
2. **真正的 sign-up endpoint 是 `/api/auth/sign-up/email`** (Better Auth 挂载点), UI 在用 (`ui/src/pages/Auth.tsx:130`, `ui/src/pages/InviteLanding.tsx:713`)。
3. **`server/src/routes/index.ts` 是 dead barrel** —— `server/src/` 内零 importer, 编辑它 = no-op。
4. **本地 404 是 by-design** —— dev server 跑 `local_trusted` mode, `server/src/app.ts:299,631` 故意不挂 `betterAuthHandler`, `server/src/auth/better-auth.ts:554` 返 501 (sign-up 在 trusted 本地模式下不可用)。
5. **server 是 0.6.2, 不是 0.6.5** —— health response 实测 `version: 0.6.2+36.git.2bab28195.dirty`。5 个同模式 wave 都未发布过 0.6.5。

## 老板在 1 天内发了 6 次同模板 brief, 每次真因都不同

| Wave | Brief 声称 | 实际真因 | 处置 |
|---|---|---|---|
| wave199 | `GET /api/companies/:cid/metrics` 404, 改 routes/index.ts | 路由已正确挂载 (metrics.ts:35, app.ts:876), routes/index.ts 是 dead barrel | pushback curl |
| wave204 | `GET /api/companies/:cid/board/chat` 404 | deploy gap (prod 没 reload wave215 代码) | 修 deploy |
| wave205 | `GET /api/companies/:cid/agents/heartbeat` 404 | 这条路径从未注册 (UI 调的是 `/companies/:cid/heartbeat-runs` 集合端点) | pushback 写 QA |
| wave206 | `GET /api/companies/:cid/issues/:id/comments` 404 | 这条路径从未注册 (UI/CLI/tests 全部用裸 `/issues/:id/comments`) | pushback 写 QA |
| wave207 | `GET /api/companies/:cid/auth/sign-up` 404 | 这条路径从未注册 (sign-up 永远只在 `/api/auth/sign-up/email`, 由 Better Auth 挂载) | **本报告 pushback** |

## curl 实证

dev server 健康 + 真实身份:
```
$ curl http://localhost:3100/api/health
version: 0.6.2+36.git.2bab28195.dirty
deploymentMode: local_trusted
localAiLoginSupported: true
authReady: true
bootstrapStatus: ready
```

**Brief 命名的路径 (404 by design — path 不存在):**
```
GET  /api/companies/4cafebad-.../auth/sign-up   = 404
POST /api/companies/4cafebad-.../auth/sign-up   = 404
```

**真实的 sign-up endpoint (404 是 local_trusted 的 expected behavior):**
```
POST /api/auth/sign-up/email                    = 404   ← Better Auth 未挂载
                                                     (local_trusted 模式故意不挂,
                                                      auth/better-auth.ts:554 返 501)
```

**同一 prefix 下确实在工作的真实路由:**
```
POST /api/auth/register                         = 400   (路由存在, body 不合法返 400
                                                      而不是 404 — 证明 register 在用)
GET  /api/auth/get-session                      = 200
```

**注意区分:** `/api/auth/register` 是 *mobile self-registration* (创建账户 + 第一个 company, 在 trusted/local_trusted 下也跑), 它和 `/api/auth/sign-up/email` 是两个不同的端点, 后者是 Better Auth 自己挂载的。

## 为什么改 `routes/index.ts` 不会修任何东西

```
$ grep -rn 'routes/index' server/src/ | grep -v routes/index.ts
$ # (空 — 零 importer)
```

`server/src/routes/index.ts` 只是 re-export barrel, `server/src/app.ts:120-130` 直接 import 各具体 route 文件 (`authRoutes`、`metricsRoutes` 等), 永远不经过这个 barrel。编辑它 = 文件 dead-letter-office 上班。

真实路由挂载在 `server/src/app.ts`:
- `app.use("/api/auth", authRoutes(db, ...))` — line 630
- `app.all("/api/auth/{*authPath}", betterAuthHandler)` — line 632 (仅在非 local_trusted 模式)
- `app.use(metricsRoutes(db))` — line 876

## 客户端调用的真实路径 (反证 brief 路径是 fabricate)

```
$ grep -rn '/auth/sign-up' ui/src/ cli/
ui/src/pages/Auth.tsx:130:            action={mode === "sign_up" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email"}
ui/src/pages/InviteLanding.tsx:713:                  action={authMode === "sign_up" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email"}
```

UI 从来没有调用过 `/api/companies/<cid>/auth/sign-up`。这条路径是 brief 作者的想象。

## 处置建议 (给老板)

如果老板看到的 404 来自 **prod (`tc-coolie-claw`)**, 那也跟本 wave 无关:

- prod 跑的是 `authenticated` mode (per memory `paperclip-board-concierge-bypass`), Better Auth handler **会**被挂载, `/api/auth/sign-up/email` 应该 200/4xx, 不会 404。
- prod 唯一可能 404 的来源: 老板 curl 时把 `/api/auth/...` 拼错成 `/api/companies/<cid>/auth/...` (e.g. 从某个错误 dashboard 复制 URL)。

**正确修法:** 直接 curl 老板看到的 404 来源 URL + 真实 URL `/api/auth/sign-up/email`, 把两条结果对比贴在 issue 评论里, 让老板确认到底想看哪个 endpoint, 而不是按 brief 字面改 dead barrel + 推一个 0.6.5 服务端版本 (会引入回归风险)。

## 本 wave 不做的事

- 不改 `server/src/routes/index.ts` (dead file, 改了 = no-op)
- 不发布 0.6.5 server (5 同模式 wave 累积下来的 brief 错误, 真因各异, 盲目 bump version 会掩盖真实的 deploy gap / 路由缺口)
- 不动 `server/src/app.ts` 的挂载顺序 (现状是 well-tested 的, wave152 metrics-routes 测试覆盖了 mount-after-companies 的 fall-through)

## 关联

- `metrics-route-mounted-correctly.md` — wave199 同模式 pushback, 列出 "how to apply" 流程
- `docs-coolie/evidence/wave206/QA-REPORT.md` — wave206 同模式 pushback, "路径从未注册"
- `docs-coolie/evidence/wave205/QA-REPORT.md` — wave205 同模式 pushback, 路由缺口 + 真实端点是 `/heartbeat-runs`
