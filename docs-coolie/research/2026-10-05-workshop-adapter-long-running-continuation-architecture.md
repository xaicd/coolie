# Coolie 工坊全 Adapter 体系长任务执行与断点接力架构白皮书 (Universal Adapter Continuation)

> **对齐标准**：Palantir Apollo 控制面 · Paperclip Adapter 协议 · CMMI 5 高成熟度  
> **核心命题**：超越单一 CLI 工具思维，从工坊产品 Adapter 体系全局彻底解决 18-20 分钟长耗时任务的防误杀、超时滑动续期与无缝断点接力。

---

## 一、从单一 CLI 到工坊 Adapter 体系的核心认知升维

老板最高指示：
> 「不只是 claude 工具，其他的也一样 ，在coolie工坊中 就是 adapter ,你要认真看看」

在 Coolie 平台控制面中，**所有数字员工与底层模型的交互，都被严格抽象为统一的 `Adapter` 机制**（定义于 `packages/adapters/`、`packages/adapter-utils/` 与 `server/src/adapters/`）。
无论是本地进程类（`claude_local`, `codex_local`, `cursor`, `pi_local`）、网关代理类（`openclaw_gateway`, `hermes`），还是内置引擎（`coolie_native`），都共同遵循统一的控制面生命周期。

```mermaid
flowchart TD
    subgraph ControlPlane["🏛️ Coolie 控制面中枢 (Server & Heartbeat)"]
        HB["Heartbeat 运行时调度<br/>(HeartbeatRuns)"]
        WD["Watchdog 监控与租约管理<br/>(Lease & Timeout)"]
        CE["执行延续信封<br/>(ExecutionContinuationEnvelope)"]
    end

    subgraph AdapterLayer["🔌 统一 Adapter 执行体系 (CONVERSATION_ADAPTER_TYPES)"]
        Claude["claude_local"]
        Codex["codex_local"]
        Cursor["cursor"]
        Gemini["gemini_local"]
        Pi["pi_local"]
        Hermes["hermes_local"]
    end

    HB -->|统一分发 execute(context)| AdapterLayer
    AdapterLayer -->|增量上报 stdout/usage| HB
    WD -.->|超时硬杀 (旧病灶)| AdapterLayer
    CE ==>|断点接力 continue_conversation_v1| AdapterLayer
```

---

## 二、工坊 Adapter 运行 18-20 分钟被误判 Kill 的三大病灶

在工坊实际运行长达 18-20 分钟的任务时，往往遭遇以下三层截杀，导致 Hermes 和控制面误判为“被 kill / 失败”：

### 1. Watchdog 固定硬超时截杀 (Turn Timeout Hard Cap)
- **底层病灶**：在 `server/src/services/heartbeat.ts` 中，Agent 的 `runtimeConfig.timeoutSec` 默认设定为 900 秒（15分钟）或 1200 秒（20分钟）。
- **误杀机理**：无论 Adapter 内部任务完成度是 80% 还是 95%，只要单次执行越过固定时钟阈值，Watchdog 会向 Adapter 进程下发 `SIGTERM` / `SIGKILL` 强行击毙，并将状态记录为 `outcome: "timed_out"` / `errorCode: "timeout"`。

### 2. 深度思考与长耗时编译时的“假死误杀” (Silent Progress False Death)
- **底层病灶**：当模型进行深度长链思考（如 DeepSeek/GLM 思考 3 分钟），或正在执行大型代码编译（如 Gradle/Next.js build），终端在数分钟内没有新输出吐出。
- **误杀机理**：心跳监控（`legacyControllerLease` / `board-hygiene-watchdog`）检测到租约静默无进展，误判为“僵尸进程（Zombie Run）”，强行回收并重置任务，造成“幽灵掉线”。

### 3. 会话单轮 Max Turns 退出与工单状态脱节
- **底层病灶**：主流大模型 CLI 在单轮执行中均存在最大轮数或输出 Token 限制（如 `maxTurns` 达到 30 轮自动退出）。
- **误杀机理**：Adapter 正常退出（Code 0），但任务的完整逻辑尚差最后两步结单。调度器若未自动将工单流转为下一轮延续 Heartbeat，工单就会停滞在 `in_progress`，被下次巡检判定为异常退出。

---

## 三、全 Adapter 统一长任务防护与断点接力四大机制

为确保所有 Adapter 在工坊中稳定执行长耗时任务，必须在控制面全面贯彻以下四大工程机制：

### 1. 动态滑动超时窗口 (Adaptive Sliding Watchdog Window)
- **机制**：废除死硬单次超时！
- **规则**：只要 Adapter 在持续消耗 CPU/Token，或每隔 60 秒上报一次有效进度输出，系统的 Watchdog 自动将超时时间向后滑动续期 10 分钟（单任务最大允许滑动至 60 分钟），彻底消除“正在干活却被计时器卡死”的荒谬现象。

### 2. 静默长任务安全避风港协议 (Safe Harbor Protocol)
- **机制**：针对长耗时编译、测试与深度思考步骤，Adapter 内部定期向控制面注入轻量心跳（Keepalive Ping）；
- **规则**：租约管理器在检测到 Safe Harbor 状态时，冻结僵尸判定，保障复杂运算平稳完成。

### 3. 全 Adapter 统一断点延续协议 (Universal Continuation Envelope)
- **机制**：深度激活系统内置的 `CONVERSATION_CONTINUATION_POLICY ("continue_conversation_v1")`；
- **规则**：当任何 Adapter（Claude / Codex / Gemini / Cursor）因为单轮达到上限退出时：
  1. 必须保存当前的 `sessionIdAfter`；
  2. 工作区所有 Git 改动原地保留，严禁 `git reset`；
  3. 系统自动封装 `ExecutionContinuationEnvelope`，将当前进度注入下一轮 Heartbeat 唤醒，自动接力完成剩余工作。

### 4. 高管【继续】指令直通 Adapter 唤醒通道
- **机制**：高管在微信、工坊会话或任务看板发出【继续】指令；
- **规则**：系统直接调用 `POST /api/companies/:companyId/issues/:issueId/wake`，注入持久化唤醒凭证（`durableWakeup`），秒级恢复当前 Adapter 运行。

---

## 四、落地路线与产品化收敛

1. **统一契约标准**：在 `packages/adapter-utils/src/` 中固化 `AdapterContinuationPolicy`，所有 Adapter 必须实现断点状态回传接口；
2. **法典硬性约束**：在《Coolie 平台工程宪法》第六章明确写入全 Adapter 防误杀与接力铁律；
3. **管局守卫护航**：通过自动化守卫确保所有长任务接力过程具备证据账本记录，彻底实现企业级控制面的稳健运行。
