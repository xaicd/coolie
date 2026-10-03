# wave206 QA — `/api/companies/:id/issues/:id/comments` 404 pushback

> **日期:** 2026-09-30
> **波次:** wave206
> **范围:** pushback — brief 描述的 URL 在仓库从未注册, 不该改代码
> **真因:** `/companies/:companyId/issues/:id/comments` 这条路径从未被注册过 — 老板 brief 误以为
> 它跟 wave204 的 `board/chat` 一样是"已注册但未挂对 path"。本次用 curl 直接验证, 路由以
> 裸 `/issues/:id/comments` 形式存在, 一直 200; 用户给的 URL 路径没有注册。
> **误判:** 用户 brief 指 `server/src/routes/index.ts` — 实际是 dead barrel, 改它无效
> (与 wave199 / wave204 / wave205 同模式, 见 memory `metrics-route-mounted-correctly`)
> **本地 dev:** `server/package.json:3` = `"version": "0.6.5"` (wave204 后), 不 bump
> **prod:** tc-coolie-claw @ xrobinai.cn (上次 deploy wave204 已上 0.6.5)

---

## 0. 结果

| 端点 | 修复前 | brief 预期 | 实测 |
|---|---|---|---|
| `GET /api/companies/<uuid>/issues/<uuid>/comments` | **404** ❌ | **200** ✅ | 404 — 路由不存在 |
| `GET /api/issues/<uuid>/comments` (裸路径, 实际挂载) | **200** ✅ | n/a | 200 — 返回真实评论 |
| `GET /api/issues/<uuid>/comments?status=pending` (UI 用) | 200 | n/a | 200 |

**结论: 0 文件改动, 0 deploy。** 现有 `GET /api/issues/:id/comments` 一直是正确的、可用的
board/agent 评论拉取端点 (issues.ts:15417, 在 `server/src/app.ts:989` 通过 `api.use(issueRoutes(...))`
挂在 `/api` 前缀下)。UI / CLI / agent / 测试**全部**调的是这条裸路径, 没有调用方使用
`/companies/:companyId/issues/:id/comments` (全仓 grep 0 命中)。

老板 brief 的"404"是事实, 但"路由已注册但没挂对 path"是误判。路由的 path 一直是
`/issues/:id/comments`, 没挪过位置, 没改过。

---

## 1. 真因 (诊断表)

| 检查项 | 结果 |
|---|---|
| `server/src/routes/issues.ts` 中含 `/comments` 字面量的所有 router.X | 11 处 (含 POST/GET/DELETE/PATCH, 列在 §2) |
| 含 `/companies/:companyId/issues/:id/comments` 字面量 | **0 处** (`grep -rn '"/companies/:companyId/issues/.*comments"' server/src/` = 0 hit) |
| `router.get("/issues/:id/comments", ...)` 注册位置 | ✅ **issues.ts:15417** — 已注册, 已挂载 |
| `server/src/routes/index.ts` consumer (`from './routes/index'`) | **0 个** — barrel 是 dead file |
| `server/src/app.ts:989` `api.use(issueRoutes(...))` | ✅ 正确挂 `/api` 前缀 |
| `router.param("id", issues.ts:7783)` 解析短名 `PAP-39` → UUID | ✅ 已工作 |
| 当前 server `package.json:3` | `"version": "0.6.5"` — wave204 后版本, 不再 bump |
| 全仓 grep `/companies/.*/issues/.*/comments` (`grep -rn` 全代码库) | **0 命中** |
| 全仓 grep `/issues/.*/comments` (UI + clients + tests) | **9 处, 全是裸路径** (UI `issues.ts:379`/`534`, 测试 `agent-conversations.test.ts:235` 等) |
| 客户端 `clients/expo` 用哪个 URL | `/issues/${id}/comments` (裸路径) |
| prod `tsx` 跑的代码 | 本地 HEAD `09679cd43` + wave204 wave215 wave215-b wave217 wave218 — 含 issues.ts:15417 |

---

## 2. `server/src/routes/issues.ts` 中所有 comments / queued-comments 路由

| 行 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 15417 | `GET` | `/issues/:id/comments` | **列 issue 评论** — brief 想要的实际行为 |
| 15499 | `GET` | `/issues/:id/queued-comments` | 列执行中排队评论 |
| 15520 | `PATCH` | `/issues/:id/queued-comments/:commentId` | 编辑排队评论 |
| 15552 | `POST` | `/issues/:id/queued-comments/order` | 重排 |
| 15583 | `POST` | `/issues/:id/queued-comments/interrupt` | 中断 active run |
| 15653 | `POST` | `/issues/:id/queued-comments/:commentId/steer` | 引导运行 |
| 15924 | `DELETE` | `/issues/:id/queued-comments/:commentId` | 撤回 |
| 17026 | `GET` | `/issues/:id/comments/:commentId` | 单评论详情 |
| 17047 | `DELETE` | `/issues/:id/comments/:commentId` | 软删评论 |
| 17401 | `POST` | `/issues/:id/comments` | 发评论 |
| 9969 | `GET` | `/issues/:id/documents/:key/annotations/:threadId/comments` | 文档注释评论 (无关) |

**11 条, 全部以裸 `/issues/:id/...` 开头, 无一例外。** 仓库内不曾有过 companyId 命名空间的
comments 路由, 上游 Paperclip 也没有 (`grep -rn` 全仓确认)。

---

## 3. curl 实测

### 3.1 本地 dev (Mac `127.0.0.1:3100`, `local_trusted`, HEAD `09679cd43`)

```
$ CID=$(curl -s http://localhost:3100/api/companies | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
$ IID=$(curl -s http://localhost:3100/api/companies/$CID/issues | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if isinstance(d,list) else d.get('items',[{}])[0].get('id',''))")
$ CID=32f4d79d-c2fd-4712-bcd6-4cbd7a1ec328
$ IID=cb5b3bfb-792f-42e3-b575-64439c60f79c

GET /api/companies/$CID/issues/$IID/comments       # brief claim
  HTTP 404 body: {"error":"API route not found"}

GET /api/issues/$IID/comments                      # actual registered path
  HTTP 200 body: [...]                             # 真评论 JSON 数组
```

### 3.2 prod (`tc-coolie-claw` @ xrobinai.cn, 已 deploy 0.6.5 wave204 后)

完整日志: `docs-coolie/evidence/wave206/curl-probe.txt`

```
$ ssh tc-coolie-claw 'TOKEN=...; CID=b0080331-...; IID=8fdcbd42-...'

=== A. /api/companies/:cid/issues/:iid/comments (user brief claim — 404) ===
HTTP 404
body: {"error":"API route not found"}

=== B. /api/issues/:iid/comments (actual registered path — issues.ts:15417) ===
HTTP 200
body: [
  {"id":"448783e3-81c5-4cd4-b913-3caa88bb6fb7", ... "body":"工坊今日花销..."},
  {"id":"09a09f33-b207-4fbf-af81-b9c38aac0080", ... "body":"工坊今日花销"}
]
```

**结论: prod 与本地完全一致** — 路由 `/issues/:id/comments` 工作, `/companies/:cid/issues/:id/comments` 从未存在过。

---

## 4. 不该做什么 (本 wave 明确边界)

| 行为 | 是否做 | 理由 |
|---|---|---|
| 改 `server/src/routes/index.ts` 加 `issueCommentsRoutes` 或调整 export | ❌ | barrel 无 consumer, 加/改都不会被挂 (wave199 / wave204 / wave205 同模式, 4 次了) |
| 在 `server/src/routes/issues.ts` 加 `router.get("/companies/:companyId/issues/:id/comments", ...)` | ❌ | 没有调用方需要这条路径; UI 全用裸路径, 客户端/测试/脚本全用裸路径 |
| bump server 0.6.5 → 0.6.6 | ❌ | 当前已是 0.6.5 (wave204 后), 没改动就不发版 |
| deploy 任何东西 | ❌ | 没改动, 部署 = 无效重启 |

---

## 5. 替代方案 (供老板拍板)

若老板确实在某个地方看到 404, 可能是三种情况之一:

1. **老板手动 curl 写错了 path** — 用裸 `/api/issues/<uuid>/comments` 即可, 不需要 wave 改动。
2. **某个没提交 / 没在仓库的脚本走的是坏 URL** — 这种应在客户端修, 不是 server 端加路由。
3. **老板想要"按 companyId 强隔离"语义** (例如防跨 company 错拉评论) — 这是新功能, 应单开
   wave 明确: 是仅用 companyId 当鉴权闸 (复用裸路径内 `assertIssueReadAllowed`), 还是真要
   落新路由? 不在本 wave 处理。

---

## 6. 与历史 wave 的关系

| wave | brief 描述 | 真因 | 这次走的动作 |
|---|---|---|---|
| wave199 | `/api/companies/:id/metrics` 404, 改 routes/index.ts | 路由已挂 `/companies/:companyId/metrics` (`metrics.ts:35`, `app.ts:876`), **0 文件改动** | pushback |
| wave204 | `/api/companies/:id/board/chat` 404, 改 routes/index.ts | 路由已注册 (`board-chat.ts:1231`), **deploy 缺口** (prod 没 reload wave215) | 真部署 + bump 0.6.5 |
| wave205 | `/api/companies/:id/agents/heartbeat` 404, 改 routes/index.ts | 路由从未注册 (上游也没), **0 文件改动** | pushback |
| **wave206** | **`/api/companies/:id/issues/:id/comments` 404, 改 routes/index.ts** | **路由以裸 `/issues/:id/comments` 存在 (`issues.ts:15417`), UI/测试/CLI 全用裸路径; brief claim 的 URL 从未注册** | **pushback (本次)** |

---

## 7. evidence

- `docs-coolie/evidence/wave206/curl-probe.txt` — 本地 + prod 各 2 条 curl 实测
- `memory/metrics-route-mounted-correctly.md` — 4-wave 模式总结
- `docs-coolie/evidence/wave204/QA-REPORT.md` — wave204 pushback 模板参考
- `docs-coolie/evidence/wave205/QA-REPORT.md` — wave205 pushback 模板参考 (本次同模式)
- `server/src/routes/issues.ts:15417` — 路由真源 (已工作, `router.get("/issues/:id/comments", ...)`)
- `ui/src/api/issues.ts:379, 534` — UI 调用方, 用裸路径