# wave205 QA — `/api/companies/:id/agents/heartbeat` 404 pushback

> **日期:** 2026-09-30
> **波次:** wave205
> **范围:** pushback — brief 描述的路由不存在, 不该改代码
> **真因:** `/companies/:companyId/agents/heartbeat` 这条路径从未被注册过 — 老板误以为它跟
> wave204 的 `board/chat` 一样是"已注册但未挂对 path"。本次用 curl 直接验证, 6 条 curl
> 显示路径根本不存在。
> **误判:** 用户 brief 指 `server/src/routes/index.ts` — 实际是 dead barrel, 改它无效
> (与 wave199 / wave204 同模式, 见 memory `metrics-route-mounted-correctly`)

---

## 0. 结果

| 端点 | 修复前 | "修复后预期" | 实际 |
|---|---|---|---|
| `GET /api/companies/<uuid>/agents/heartbeat` | **404** ❌ | **200** ✅ (brief 目标) | 404 — 路由不存在, 不该改 |
| `GET /api/agents/heartbeat` (无 companyId) | 422 (短名) | n/a | 422 — catch-all `/agents/:id` 命中 |
| `GET /api/agents/heartbeat?companyId=X` | 404 (短名) | n/a | 404 — 同上 |
| `GET /api/companies/<uuid>/heartbeat-runs` | 200 ✅ | n/a | 200 — 实际收件箱 / 心跳列表端点 |
| `GET /api/agents/<uuid>/heartbeat/invoke` | 401/404 | n/a | 路由在, 仅鉴权检查 |

**结论: 0 文件改动, 0 deploy。** 现有 `GET /api/companies/:companyId/heartbeat-runs` 已是
collection 级心跳 listing 端点 (UI 已在用, 见 `ui/src/api/heartbeats.ts:120`)。老板若想看
"agents 维度的 heartbeat 聚合", 应单开 wave 明确产品语义 (列哪些 agent 字段? 是否要过滤?
是否分页?), 不要在这个 PR 里凭 false-premise 写代码。

---

## 1. 真因 (诊断表)

| 检查项 | 结果 |
|---|---|
| `server/src/routes/agents.ts` 中所有 `router.X("...")` 路径 | 65 条 — 全列在下面 §2 |
| 包含 `/agents/heartbeat` 字面量的代码 | **0 处** (`grep -rn '"/agents/heartbeat"' server/`) |
| `/agents/:id` (line 4243) | catch-all — `heartbeat` 被当 agent 短名查 |
| `/companies/:companyId/agents/heartbeat` 注册位置 | **不存在** — 全仓无该字面量 |
| `server/src/routes/index.ts` consumer (`from './routes/index'`) | **0 个** — barrel 是 dead file |
| `server/src/app.ts:856` 安装 `agentRoutes(db, {...})` | ✅ 正确挂 `/api` 前缀 |
| `GET /api/companies/<uuid>/heartbeat-runs` | ✅ 200, UI 用 `ui/src/api/heartbeats.ts:120` |
| 当前 server `package.json:3` | `"version": "0.6.5"` — 已是 wave204 后版本, 不再 bump |

---

## 2. `server/src/routes/agents.ts` 中所有 agent 相关 router (节选)

| 行 | 路径 | 说明 |
|---|---|---|
| 3872 | `GET /agents/:id/skills` | agent skills list |
| 4017 | `GET /companies/:companyId/agents` | **collection — 列出 company 全部 agent** |
| 4100 | `GET /companies/:companyId/org` | 组织图 (SVG) |
| 4139 | `GET /agents/me` | 自己的 agent 详情 |
| 4243 | `GET /agents/:id` | 单 agent 详情 (catch-all, 短名解析) |
| 4784 | `POST /companies/:companyId/agents` | 新建 agent |
| 6273 | `POST /agents/:id/wakeup` | 唤醒 agent |
| 6280 | `POST /agents/:id/heartbeat/invoke` | **per-agent** 主动 invoke 一次 heartbeat |
| 6919 | `GET /companies/:companyId/heartbeat-runs` | **collection — 列 company 心跳 run** |
| 6960 | `GET /companies/:companyId/live-runs` | collection — live 运行 |
| 4036 | `GET /instance/scheduler-heartbeats` | instance 调度视角 |

**无 `GET /companies/:companyId/agents/heartbeat` 或 `GET /agents/heartbeat`。**

老板 brief 的 `agents/heartbeat` 路径在仓库里从未存在过 (上游 Paperclip 也没这路径)。
老板想要的语义可能接近 §2 中某条已存在路由 (例如 `/heartbeat-runs` 是 collection,
`/agents/:id/heartbeat/invoke` 是 per-agent invoke, `/wakeup` 是唤醒某路径), 应让
产品先确定要哪个语义再开新 wave。

---

## 3. curl 实测 (本次发版前)

完整日志: `docs-coolie/evidence/wave205/curl-probe.txt`

```
GET /api/companies/4a5867e1-59e6-4a74-b7ea-038eefb1944f/agents/heartbeat
  HTTP 404 body: {"error":"API route not found"}

GET /api/agents/heartbeat
  HTTP 422 body: {"error":"Agent shortname lookup requires companyId query parameter"}

GET /api/agents/heartbeat?companyId=4a58...
  HTTP 404 body: {"error":"Agent not found"}

GET /api/companies/4a58.../heartbeat-runs
  HTTP 200 body: []                          ← 现有可用端点
```

本地 dev 部署版本 `0.6.5+36.git.2bab28195.dirty` (wave204 后), 不动。

---

## 4. 不该做什么 (本 wave 明确边界)

| 行为 | 是否做 | 理由 |
|---|---|---|
| 改 `server/src/routes/index.ts` 加 `agentsHeartbeatRoutes` 之类 | ❌ | barrel 无 consumer, 加了也不会被挂 |
| 在 `server/src/routes/agents.ts` 注册 `router.get("/agents/heartbeat", ...)` | ❌ | 路由没注册就是没注册, 不是 "挂了错路径"; 加一段凭空语义等于编造没讨论过的产品行为 |
| 把 `routes/board-chat.ts` 已注册的 `companies/:companyId/board/chat` 类比推出 agents/heartbeat 也已存在 | ❌ | board-chat 是 wave215 新建, 源码 grep 确认存在; agents/heartbeat 在源码 grep 不到 |
| bump server 0.6.5 → 0.6.6 | ❌ | 当前已是 0.6.5, 没改动就不发版 |

---

## 5. 替代方案 (供老板拍板)

若老板确实想看 "agents 维度的 heartbeat 聚合", 三条可选语义, 需老板确认要哪个:

1. **复用 `/companies/:companyId/heartbeat-runs?agentId=X&summary=true`** — 现成, 已 200。
   缺点: 不是 collection 级, 需要 client 端拼多次 (每 agent 一次)。
2. **新建 `GET /companies/:companyId/agents/heartbeat`** — 一发拉出全 company agent 的
   最近一次心跳状态 (active / paused / last_run_at / last_status / live_run_id 等)。
   缺点: 与 `/heartbeat-runs` 数据源重叠, 需要明确字段差异。
3. **新建 `GET /agents/heartbeat?companyId=X`** — 不区分 agent, 只看 "谁在心跳"。
   缺点: 跟 `instance/scheduler-heartbeats` 重叠 (但那是 admin-only)。

老板挑一个, 单开 wave205+1, 不要在这个 PR 里凭假设写代码。

---

## 6. evidence

- `docs-coolie/evidence/wave205/curl-probe.txt` — 6 条 curl 实测
- `memory/metrics-route-mounted-correctly.md` — wave199 同模式参考
- `docs-coolie/evidence/wave204/QA-REPORT.md` — wave204 pushback 参考 (同样的 "routes/index.ts 是 dead barrel" 误判)
- 本地 dev `server/package.json:3` = `"version": "0.6.5"`, wave204 后状态