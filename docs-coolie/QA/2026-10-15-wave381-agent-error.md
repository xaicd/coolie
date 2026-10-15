# wave381 — 墨斗 (agy_local) status=error 真因定位与修复

- 波次: wave381
- 触发: 老板拍"看看 coolie-dev 员工" → 看到 墨斗 status=error
- 执行员工: 铁匠贰号 (forge-ii-core-swe, Core SWE fallback)
- 分支: main
- 结论: **真因已定位并修复** — 不是 adb/agy 配额，也不是 mcp watchdog，而是 ACP 适配器脚本顶层静态 import 在仓库根解析不到 `@agentclientprotocol/sdk`，进程在 `initialize` 之前就 `ERR_MODULE_NOT_FOUND` 退出。

---

## 1. 真因 (Root Cause)

墨斗实际记录:

- agent id: `09af00a0-f1cd-4a17-8ef5-3a8bcba381d7`
- companyId: `da2e705c-c80a-411b-b2ae-e39372b1251f`
- adapterType: `agy_local`
- adapterConfig.agentCommand: `scripts/adapters/docker-agy-acp.sh`
- `error_reason` (截断):

```
ACP agent exited before initialize completed (exit=1, signal=null):
node:internal/modules/package_json_reader:301
  throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base), null);
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@agentclientprotocol/sdk'
imported from /Users/mac/workspace/xaicd/coolie/scripts/adapters/docker-agy-acp.mjs
```

`docker-agy-acp.sh` → `node scripts/adapters/docker-agy-acp.mjs`。该 `.mjs` 顶层是**静态 import**:

```js
import * as acp from "@agentclientprotocol/sdk";
```

`@agentclientprotocol/sdk` 未被 pnpm 提升到仓库根 `node_modules/@agentclientprotocol`（它在 `.pnpm` 虚拟store 与 `packages/paperclip-runner` 下存在），因此 Node 在加载阶段直接抛 `ERR_MODULE_NOT_FOUND`，`initialize` 从未开始，ACP 宿主记为 "exited before initialize completed"。

对照: 同目录 `cmd-acp.mjs` / `claude-profile-acp.mjs` 用的是**懒加载 + 候选路径回退**，因此不受影响。只有 `docker-agy-acp.mjs` 漏了这套兜底。

## 2. 复现 (Repro)

```sh
node scripts/adapters/docker-agy-acp.mjs </dev/null
# -> throw new ERR_MODULE_NOT_FOUND ... imported from scripts/adapters/docker-agy-acp.mjs
```

## 3. 修复 (Fix)

`scripts/adapters/docker-agy-acp.mjs`: 去掉顶层静态 import，改为与兄弟适配器一致的
`createRequire` + `await import()` + 候选路径回退 (paperclip-runner / claude-local /
codex-local / `node_modules/.pnpm/node_modules` / 仓库根)。

修复后握手验证:

```sh
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{}}}' \
  | node scripts/adapters/docker-agy-acp.mjs
# -> {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":true},"serverInfo":{"name":"docker-agy-acp","version":"1.0.0"}}}
```

## 4. lastError 暴露 (员工详情真因可见)

- 服务端 `GET /agents/:id` 早已返回 `error_reason`（字段名 `errorReason`），web 端
  `ui/src/components/AgentProperties.tsx` 已展示「Error reason」。MCP 工具
  `packages/mcp-server/src/tools.ts` 的 `paperclipGetAgent` 返回整条 agent，已含
  `errorReason`（无需新增 `paperclipGetAgentDetails`；`server/src/mcp/tools/agents.ts`
  该路径不存在）。
- 缺口在移动端: `clients/api-client` 的 `Agent` 类型未声明 `errorReason`，Expo
  员工详情屏因此只能显示「异常」而看不到真因。
- 本次补齐:
  - `clients/api-client/src/types.ts`: `Agent` 增加 `errorReason?: string | null`
    （沿用服务端既有字段名，不新增重复字段，遵老板「零功能膨胀」）。
  - `clients/expo/src/screens/AgentsScreen.tsx` (员工详情浮层) 与
    `clients/expo/src/screens/AgentDetailScreen.tsx` (员工详情屏): `status === "error"
    && errorReason` 时红色「异常原因」块展示真因。

## 5. 生成状态修复 (stale error 清理)

真因修复后，墨斗的 `error_reason` 是历史残留（其 `runtimeConfig.heartbeat.enabled=false`，
不会自动重跑覆盖）。已通过 board 端点清理:

```sh
curl -X POST .../agents/09af00a0-f1cd-4a17-8ef5-3a8bcba381d7/clear-error
# -> status=idle, errorReason=null
curl .../agents/09af00a0-.../?companyId=da2e705c-...  # -> name=墨斗 status=idle errorReason=None
```

## 6. 变更文件

| 文件 | 说明 |
| --- | --- |
| `scripts/adapters/docker-agy-acp.mjs` | 静态 import → 懒加载 + 候选路径回退 (真因修复) |
| `clients/api-client/src/types.ts` | `Agent.errorReason` 类型暴露 |
| `clients/expo/src/screens/AgentsScreen.tsx` | 员工详情浮层「异常原因」 |
| `clients/expo/src/screens/AgentDetailScreen.tsx` | 员工详情屏「异常原因」 |

## 7. 验证 (Verification)

- `cd clients/api-client && pnpm typecheck` → EXIT 0
- `cd clients/expo && pnpm typecheck` → EXIT 0
- 适配器 `initialize` 握手返回 result（见 §3）
- `node scripts/check-fork-surface.mjs --range=HEAD` → `docker-agy-acp.mjs ok 33/220`（在预算内）
- 墨斗 `GET /agents/:id` → `status=idle, errorReason=null`

## 8. 未做 / 说明

- 未 `git reset --hard`；未触碰既存 dirty 文件（`BoardChatScreen.tsx`、`packages/mcp-server/*`、
  `scripts/fork-surface.json`、`server/src/middleware/auth.ts`、`actor-middleware-api-key.test.ts`）。
- fork-surface 门禁的 1 处 `NEW` 属既存 dirty 文件 `server/src/__tests__/actor-middleware-api-key.test.ts`，
  非本波次变更。
- 未做 repo 级全量 `pnpm -r typecheck`（`clients/expo` 不在 workspace，单独 typecheck 已通过）。
