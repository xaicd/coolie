# COOA-177 — 底座自愈与防穿透端到端验收 + 高并发防重实证

承接 [COOA-137](/COOA/issues/COOA-137) 主线 C（底座稳定性专项）第二轮增量。本件把四项
待办从"代码存在"升级为"可机检的端到端证据"：每一项都由一个新的 vitest 套件在真实进程 /
真实 WebSocket 通道 / 真实嵌入式 Postgres 上断言，而不是单元级桩。

## 交付物清单

| WP | 主张 | 套件 | 结果 |
| --- | --- | --- | --- |
| WP1 | kill -9 强杀持有人后，签出锁在 5 分钟租约内自动解挂 + 恢复审计 | `server/src/__tests__/cooa177-checkout-lock-selfheal-kill9.test.ts` | ✅ pass |
| WP2 | 静默长任务经**真实 WebSocket** 至少每 10s 收到 `heartbeat.run.progress` | `server/src/__tests__/cooa177-idle-heartbeat-ws.test.ts` | ✅ pass |
| WP3 | 全盘 schema 的 `company_id` / `project_id` 双隔离面可机检 | `packages/db/src/tenant-scope-inventory.test.ts` | ✅ pass |
| WP4 | 并发签出/派单零重复执行 | `server/src/__tests__/cooa177-concurrent-checkout-dedup.test.ts` | ✅ pass |

机检 JSON：`docs-coolie/evidence/cooa177/cooa177-evidence.json`

## WP1 — 强杀自愈（真实进程）

既有 `recovery-stale-issue-lock-sweep` 用伪造的巨大 pid（`2_000_000_000`，永不存活）证明
进程死亡权威。本套件改用**真实子进程**：

1. `spawn` 一个长活 node 子进程，把它的**真实 pid** 写入持有工单签出锁的 `heartbeat_runs` 行；
2. 进程存活时扫描：`cleared === 0`、`terminalizedRunIds === []` —— 不发生提前误解挂；
3. `SIGKILL`（`kill -9`）后等待 OS 回收，扫描得到 `terminalizedRunIds === [runId]`、`cleared === 1`，且 kill→解挂耗时 `< 300s` 租约窗口；
4. 断言运行终态 `interrupted` / `errorCode === orphaned_running_run`，工单 `checkout_run_id` / `execution_run_id` / `execution_locked_at` 全部清空；
5. 断言 `activity_log` 写入 `issue.stale_lock_cleared`，`details.source === recovery.sweep_stale_issue_locks`，并携带被释放的 run id。

结论：真实强杀不会让任务被永久签出，恢复审计事件同步落盘。

## WP2 — 真实 WebSocket 心跳（补齐最后一跳）

原有两个套件分别只证明了"定时器触发 `onTick`"和"发布器写到进程内 emitter"，**没有任何测试**
真正连到 `/api/companies/:id/events/ws` 的 socket 上收帧。本套件补齐：

- 绑定真实的 `setupLiveEventsWebSocketServer`（`local_trusted` 模式）；
- 用真实 `ws` 客户端连接；
- 用**生产同款** `onTick: (status) => publishHeartbeatRunRuntimeProgress(status)` 驱动
  `startHeartbeatRunIdleHeartbeat`；
- 断言客户端收到 `>= 5` 帧 `heartbeat.run.progress`，帧内携带 `{companyId, runId, agentId, issueId}`，
  相邻到达间隔 `max gap < 10000ms`，并断言生产常量 `ACTIVE_RUN_IDLE_HEARTBEAT_INTERVAL_MS === 10000`。

为了让测试绑定到真正的生产发布函数而非复刻其 payload，把 `publishHeartbeatRunRuntimeProgress`
从 `server/src/services/heartbeat.ts` 导出（单行 `export`，无逻辑改动）。

## WP3 — 双隔离面全盘机检

`packages/db/src/tenant-scope-inventory.test.ts` 把 AGENTS.md §5 规则 1 变成构建门禁：遍历
schema barrel 的每一张 Drizzle 表，非公司域表必须在手工评审的 `NON_COMPANY_SCOPED_TABLES`
白名单中。本轮新增两道闸门：

- **nullable `company_id` 评审闸**：任何 `company_id` 可空的表必须在 `NULLABLE_COMPANY_SCOPE_TABLES`
  中登记理由，否则构建失败。本轮评审确认 6 张表属实例级设计：`company_transfer_runs`、`invites`、
  `plugin_entities`、`plugin_job_runs`、`plugin_logs`、`plugin_webhook_deliveries`。
- **project→company 锚定闸**：任何带 `project_id` 的表必须同时带 `company_id`（全盘 0 张越界），
  杜绝"仅凭 project id 即为完整边界"的越权面。

结论：新增的表无法在无人评审的情况下悄悄绕过租户边界或引入跨项目越权面。

## WP4 — 并发防重实证

- 8 个**各自的真实 running run** 同时抢同一张 `todo` 工单：恰有 1 个 `checkout` 成功、7 个被拒；
  工单锁归属唯一的胜者 run；
- 只有胜者能通过 `assertCheckoutOwner`（所有代理写路径的准入闸），其余全部被拒 —— 这正是
  "零重复执行"的服务层证据；
- 同一 run 并发 6 次重复签出全部幂等成功、锁不翻转。

## 验证

- `pnpm --filter @paperclipai/db typecheck` → **pass**
- `pnpm --filter @paperclipai/server typecheck` → **pass**（EXIT=0）
- 定向 vitest 批次（本件 4 套 + `recovery-stale-issue-lock-sweep` + `heartbeat-runtime-state`
  + `live-events-ws` + `security-tenant-isolation-invariants`）→ 见运行日志

已知无关失败：`pnpm -r typecheck` 在 `packages/mcp-server/src/tools.ts`（本件未触碰的文件）
因 zod 类型漂移报错，属既有基线问题，非本件引入。

## 复现

```sh
npx vitest run server/src/__tests__/cooa177-*.test.ts packages/db/src/tenant-scope-inventory.test.ts
pnpm --filter @paperclipai/db typecheck
pnpm --filter @paperclipai/server typecheck
```
