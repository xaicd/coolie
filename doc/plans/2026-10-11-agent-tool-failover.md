# 2026-10-11 员工工具故障自动切换 (Agent Tool Failover)

Status: Draft (待老板审批)
Owner: 墨斗 (FDA)
Related:
- `docs-coolie/specs/2026-10-02-tool-health-monitor.md`
- `scripts/dispatch-local-employee.sh`（本地派单已有 fallbackTools 降级链）
- 上游 `doc/plans/2026-04-06-smart-model-routing.md`
- 事故样本：COOA-99（2026-10-10 ~ 10-11）

## 1. 问题

Paperclip 控制面派单（构建流水线、工单唤醒）里，每个员工绑定**一个**工具。工具不可用时：

1. 同一工具重试 3 次（`BOUNDED_TRANSIENT_HEARTBEAT_RETRY_MAX_ATTEMPTS`），全部失败；
2. 员工进入 `error`，工单保持 `in_progress` 但没有运行，即空挂；
3. 没有人收到"该换工具了"的信号，直到老板来问。

### 1.1 COOA-99 事故还原

| 时间 | 事件 |
|---|---|
| 10-10 17:40:21 | COOA-98 完成，铁匠 (`claude_local`) 被唤醒 |
| 17:40:24 / 17:41:03 | 两次运行在会话建立后约 1 秒失败：`acpx_turn_failed`，"ACP agent reported a terminal access failure."，0 token |
| 17:41:03 ~ 17:47:50 | 第 3 次运行实际开工，写了约 6 分钟代码（house / housekeeping 骨架） |
| 17:57:59 | 第 3 次运行被判 `orphaned_running_run` 中断；之后再无运行 |
| 10-11 12:25 | 人工唤醒，claude 通道连续 3 次失败，员工进入 `error` |
| 12:28 | 人工把铁匠 `adapterConfig.agentCommand` 改为 `scripts/adapters/cmd-acp.sh`，恢复运行 |

### 1.2 根因（三层）

1. **错误分类缺失**：claude-agent-acp 上报的是 `category: "access"`（鉴权/访问类，GLM 网关额度耗尽时也会表现为这类）。我们 fork 的 `classifyClaudeTerminalSessionFailure`（`packages/adapters/claude-local/src/server/acp.ts`）只处理 `category === "limit"`，`access` 落到通用 `acpx_turn_failed`，被当作瞬时故障原样重试。
2. **控制面无降级**：重试只会重复同一工具；不存在"换工具"这一步。
3. **健康探测失真**：`.coolie-local/tool-health/latest.json` 对 `claude-glm` 只检查二进制与配置文件存在即标 `ok`，额度耗尽时仍显示 `ok`。

另外，Hermes (`role=pm`) 只有 `canCreateAgents` / `canCreateSkills`；改他人配置需要 `agents:configure`（`server/src/services/authorization.ts`），所以 Hermes 现在不能给员工换工具。

## 2. 上游 Paperclip 调研（upstream/master @ `42ecc9655`，2026-10-10）

| 能力 | 上游状态 | 我们 fork | 对本方案的意义 |
|---|---|---|---|
| 额度类错误识别 `provider_quota` + `retryNotBefore`（claude / codex） | ✅ 已有（#9183、#9634） | ✅ 已有 | 额度耗尽时等到重置时间再试，而不是连挂 3 次 |
| claude `category: "access"` → `acpx_auth_required`，走"需要重新登录"恢复路径 | ✅ 已有 | ❌ **缺失** | 正是 COOA-99 的错误类型；合上游即可避免盲目重试，转为明确的"需人工处理" |
| 重试调度 / 运行时选择抽出独立模块（#15617、#15746） | ✅ 10-08 ~ 10-10 刚重构 | ❌ 未同步 | 自动切换应挂在上游新的 `heartbeat/retries.ts` / runtime selection 扩展点上，避免与上游冲突 |
| 跨工具（跨 adapter）自动降级 | ❌ 没有 | ❌ 没有 | 需要我们自建 |
| 智能模型路由（同一 adapter 内的便宜模型 / fallback 模型） | 📝 仅 Proposed 计划，明确**不做**全局跨 provider 路由；相关分支 `PAP-2837`、`PAP-9825` 未合入 | — | 方向一致：路由逻辑尽量放在 adapter 边界内 |

结论：上游解决了"认出额度/鉴权问题并正确等待或要求登录"，**没有**解决"换另一个工具继续干"。我们 fork 落后上游 433 个提交（merge-base 2026-09-23），连 `access` 分类修复都没拿到。

## 3. 方案

分三期，按风险从低到高。

### 3.1 一期：同步上游 + 正确分类（无新概念）

- 按 `fork-sync` skill 把上游 `access → acpx_auth_required` 分类修复（及 retries / runtime-selection 重构）合进 `main`。
- 效果：claude 鉴权/额度类失败不再盲目重试 3 次，而是进入明确的"需要处理"状态并在工单上可见。
- `tool-health-monitor.sh`：对每个工具**真跑**一次最小提示（规格原本就要求），失败写 `status: fail` + `reason` + `cooldownUntil`。

### 3.2 二期：员工级备选工具链（控制面自动降级）

**配置**（`agents.runtimeConfig`，不改表结构）：

```json
{
  "toolFailover": {
    "enabled": true,
    "chain": [
      { "label": "claude-glm", "adapterConfigPatch": {} },
      { "label": "cmd", "adapterConfigPatch": { "agentCommand": "scripts/adapters/cmd-acp.sh" } },
      { "label": "claude-mm", "adapterConfigPatch": { "agentCommand": "scripts/adapters/claude-mm-acp.sh" } }
    ],
    "switchOn": ["provider_quota", "acpx_auth_required", "adapter_unavailable"],
    "sticky": "until_cooldown_expires"
  }
}
```

**行为**：

1. 运行失败且错误族在 `switchOn` 内 → 当前链节点记冷却（优先用 `retryNotBefore`，否则读 tool-health 的 `cooldownUntil`，再否则 30 分钟）。
2. 下一次重试**换成链上下一个未冷却的节点**，而不是重复同一工具；挂在上游 runtime selection 扩展点上，只叠加 `adapterConfigPatch`，不持久改员工配置。
3. 写 run-log 事件 `tool_failover`（from / to / reason），并在工单发一条系统评论"已自动切换到 cmd"。
4. 全链冷却 → 工单置 `blocked`，unblock owner = 老板，原因写明"全部工具不可用"，并通知（微信 / 🔔）。不再空挂 `in_progress`。
5. 冷却到期后自动回到链首（主力工具）。

**范围约束**：只在同 `adapterType` 内通过 `agentCommand` 等字段切换（铁匠 claude_local → cmd-acp 就是这种）；跨 adapterType 切换放三期再评估。

**Run-log 归类**：`tool_failover` 事件属于 run log（`heartbeat_run_events`，数据留在实例库），按 AGENTS.md §5.7 无需额外隐私评审；不进 Telemetry。

### 3.3 三期：Hermes 受控换工具

- 新增窄权限 `agents:switch-tool`：只允许把**同公司**员工的工具切到该员工 `toolFailover.chain` 白名单内的节点；不能改指令文件、权限、预算、其他配置。
- 两种模式（公司级开关）：
  - `auto`：Hermes 直接切，记 activity log + 通知老板；
  - `propose`：Hermes 发 `request_confirmation` 卡片，老板两字确认（"切换"）后生效。
- Hermes 的派单逻辑读取 tool-health，派单前就避开冷却工具。

### 3.4 顺带修复：cmd-acp 无流式输出

`scripts/adapters/cmd-acp.mjs` 用 `cmd -p` 一次性执行，过程输出要等结束才回传。长任务期间控制面看到的是"无输出"，有被判 orphaned / 卡死的风险（COOA-99 当前 cmd 运行就是这样）。需要：定期发 ACP 心跳状态，或改用 cmd 的流式输出模式（待确认 cmd 1.79 是否支持）。

## 4. 涉及文件（预估）

| 层 | 文件 |
|---|---|
| shared | `packages/shared/src/validators/agent.ts`（`toolFailover` schema）、常量 |
| adapter | `packages/adapters/claude-local/src/server/acp.ts`（同步上游分类）、`scripts/adapters/cmd-acp.mjs`（心跳） |
| server | `server/src/services/heartbeat/retries.ts` + runtime selection（同步上游后挂钩）、`server/src/services/authorization.ts`（`agents:switch-tool`）、run-log 事件 |
| ui | 员工配置页"备选工具链"编辑；运行详情显示切换事件 |
| 脚本 | `scripts/tool-health-monitor.sh`（真跑探测 + 冷却） |
| 文档 | `doc/run-log-events.md`（新增事件）、`docs-coolie/specs/2026-10-02-tool-health-monitor.md` |

## 5. 验证

- 单测：错误分类（access / limit / 其他）→ 是否切换；链遍历、冷却、全链耗尽 → blocked。
- 集成：模拟 claude 首轮 access 失败 → 第二次运行用 cmd，run-log 有 `tool_failover`，工单有系统评论。
- 回归：未配置 `toolFailover` 的员工行为与现在完全一致。
- 最终 `pnpm -r typecheck && pnpm test:run && pnpm build`。

## 6. 风险

| 风险 | 缓解 |
|---|---|
| 与上游刚重构的 heartbeat 模块冲突 | 一期先同步上游，再在新扩展点上开发 |
| 切到能力较弱的工具导致产出质量下降 | 链由老板配置；切换事件可见；冷却后自动回主力工具 |
| 会话不连续（换工具后不能 resume 原会话） | 已有行为：配置变化时跳过 resume；在唤醒上下文里附带工作区路径与上次进度摘要 |
| 权限扩大 | `agents:switch-tool` 只限白名单链节点，默认 `propose` 模式 |

## 7. 待老板拍板

1. 是否先做一期（同步上游 433 个提交，工作量和冲突面不小，需单独排期）？还是先只 cherry-pick `access` 分类修复？
2. 各员工的默认备选链（建议：铁匠 `claude-glm → cmd → claude-mm`；门神 `cmd → claude-mm`；百晓生 `claude-glm → cmd`）。
3. Hermes 换工具默认用 `auto` 还是 `propose`？
