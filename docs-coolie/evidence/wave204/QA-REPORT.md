# wave204 QA — board/chat 404 修复 + 0.6.5 server deploy

> **日期:** 2026-09-30
> **commit:** `fe68cdb5f` (server 0.6.5)
> **deploy:** `tc-coolie-claw` @ ~22:00 UTC+8
> **范围:** server 端 wave215 routes deploy (board/chat + 6 新 routes)
> **真因:** wave215 commit `23a56c944` 未 deploy; prod `tsx` 还在 19:40 启动时的旧 src
> **误判:** 用户 brief 指 `server/src/routes/index.ts` — 实际是 dead barrel, 改它无效

---

## 0. 结果

| 端点 | 修复前 | 修复后 | 说明 |
|---|---|---|---|
| `GET /api/companies/4caf.../board/chat` | **404** ❌ | **200** ✅ | 老板报告的 bug |
| `POST /api/board/chat/issue` | 404 ❌ | 200 ✅ | 工坊新建对话 |
| `GET /api/companies/4caf.../board/conversations` | 200 ✅ | 200 ✅ | 老路由未受影响 |
| `GET /api/companies/4caf.../quotas` | 404 ❌ | 200 ✅ | wave215 新端点 |
| `GET /api/companies/4caf.../work-products` | 404 ❌ | 200 ✅ | wave215 新端点 |
| `GET /api/companies/4caf.../sandboxes` | 404 ❌ | 200 ✅ | wave215 新端点 |
| `GET /api/companies/4caf.../cycle-time` | 404 ❌ | 200 ✅ | wave215 新端点 |
| `GET /api/companies/4caf.../milestones` | 404 ❌ | 200 ✅ | wave215 新端点 |
| `GET /api/inbox?companyId=...` | 200 ✅ | 200 ✅ | 老路由回归 |

**7/7 端点 404 → 200, 老路由无回归。**

---

## 1. 真因 (诊断表)

| 检查项 | 结果 |
|---|---|
| `git log origin/main` HEAD | `54cf8ba33` (wave217) — 含 wave215 commit `23a56c944` |
| 本地 `server/src/routes/board-chat.ts:1231` `router.all("/companies/:companyId/board/chat", ...)` | ✅ 已注册 (HEAD 已有) |
| 本地 `server/src/app.ts:904` `api.use(boardChatRoutes(db, {...}))` | ✅ 已挂 `/api` |
| prod `/opt/coolie/server/src/routes/board-chat.ts` 行数 | 1630 (本地 1664, 少 34 行 wave215 段) |
| prod `curl GET /api/companies/4caf.../board/chat` 修复前 | `404 {"error":"API route not found"}` |
| prod `curl GET /api/companies/4caf.../board/conversations` 修复前 | `200` (老路由还在) |
| prod `/opt/coolie/server/src/routes/` ls | 缺 6 个 wave215 新 routes (dispatch/quotas/work-products/sandboxes/cycle-time/milestones) |
| `systemctl status coolie` 启动时间 | `Wed 2026-09-30 19:40:45 CST` — 早于 wave215 push (20:29) |

**结论:** server 自 19:40 启动后没再 reload, wave215 推完后没跟上 deploy 节奏。
是 **deploy 缺口, 不是代码缺口**。本仓库 `server/src/routes/index.ts` 是 dead barrel
(零 import, 见 memory `metrics-route-mounted-correctly`), 改它无效。

---

## 2. 改动面

3 文件 (本次 commit `fe68cdb5f`):

- `server/package.json` — `version: "0.3.1" → "0.6.5"` 对齐 `clients/expo-paperclip-web@0.6.5`
- `server/CHANGELOG.md` — 加 `## 0.6.5` 段
- `doc/plans/2026-09-30-wave204-board-chat-deploy.md` — 本 wave plan

不动 (已正确):
- `server/src/routes/board-chat.ts` — HEAD 已是 wave215 后的代码 (1664 行)
- `server/src/app.ts` — HEAD 已挂 `boardChatRoutes`
- `server/src/routes/index.ts` — dead barrel, 不动

---

## 3. deploy 流水

| 步骤 | 结果 |
|---|---|
| `pnpm -r typecheck` (护栏 1) | ✅ 0 error |
| 本地 `pnpm test:run board-chat-*` | ✅ 25/25 PASS |
| 远端 `pnpm install --frozen-lockfile` | ✅ 13.9s |
| 远端 workspace symlinks 重建 | ✅ (脚本 §4 步骤) |
| 远端 `pnpm build` (UI) | ✅ 3.27s |
| `sudo systemctl restart coolie` | ✅ active 43s 后 ready |
| `curl /api/health` (护栏 2) | ✅ `status=ok, bootstrapStatus=ready` |
| 7 端点 2xx (护栏 3) | ✅ 7/7 |

总耗时: 约 8 分钟 (pm install 5 + build 2 + restart 1)。

---

## 4. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 重启 systemd 掉线 | service < 10s 起, RSS 1.8G, 无状态影响 |
| wave196/225/226 等 in-flight 工作被 rsync 上 prod | deploy 前 `git stash` 隔离; working tree 仅 3 文件 commit 改动 + HEAD |
| 版本 bump 0.3.1 → 0.6.5 跳过中间版本号 | user-facing 对齐, App 校验只比字符串, 安全 |

---

## 5. 已知未做 (明确边界)

- ❌ 不顺带 deploy wave196 (10 个鉴权端点 403) — 老板 brief 没要求, 单开 wave
- ❌ 不顺带 deploy wave226 (agent quota) — scope 大, 另开 wave
- ❌ 不动 `ui/` / `clients/expo` — 0.6.8 已发版, 老板真机验真走 OTA

---

## 6. 后续 (post-deploy)

- [ ] 老板真机重启 App (Android) → 拉 0.6.8 OTA bundle → 工坊入口看 wave204 修复
- [ ] 老板拍板 wave196 (deploy 鉴权短路) 跟 wave226 (agent quota) 另开 wave 发版
- [ ] wave217 测试员工跑 `node scripts/qa-api-smoke-25.mjs` (5 分钟)

---

## 7. evidence

- `curl/board-chat-fix.txt` — 6 端点 200 实测 + 修复前 404 baseline
- `doc/plans/2026-09-30-wave204-board-chat-deploy.md` — 完整诊断 + 任务拆解 + 验证清单
