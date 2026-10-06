# wave357 标准 ACP 调度协议栈与 Hermes 微信执行总线 — 架构设计

> **CMMI 门禁**: Phase 1.4 选型研判 (§2) / Phase 3.1 系统设计 (§3)
> **责任人**: 墨斗 (FDA, 前线架构师) · **券**: COOA-53 · **基线**: 8241bcdeb (wave357)
> **验证存证**: `docs-coolie/evidence/wave357/` (真机 ACP 握手 / 工具矩阵 / 治理守卫)

---

## 0. Echo 价值定义 (为什么做)

### 0.1 核心业务阻碍 (改前真凶)

| # | 阻碍 | 物理表现 | 业务代价 |
|---|---|---|---|
| 1 | **调度"两张皮"** | 平台控制面走 acpx-engine (packages/adapter-utils)，本地施工队走 bash 直启 CLI (PTY 刮 stdout)，同一工具两套调用形状 | 员工行为不可比、回执口径分裂、每加一个工具要维护两遍 |
| 2 | **PTY 终端挂死** | 裸 spawn CLI 无结构化协议：ANSI 码刮取、交互权限确认卡死、stdin 悬空、僵尸进程 | wave356 前后多次 run "terminal access failure" 直接失败；老板微信看到的"卡"无法归因 |
| 3 | **新增工具集成地狱** | 每个 CLI 参数体系/流式输出/权限逻辑各异，接一个写一个专用封装 | 7 工具池扩张成本线性上涨，维护面发散 |
| 4 | **执行无证据链** | 本地派单结果散落在终端里，没有结构化回执与守卫门禁 | 高管无法验收"CMMI 产物 + 真实执行"闭环 |

### 0.2 高管交付 Outcome (改后可验收)

1. **一个协议**：所有工具（agy / cmd / copilot / codex / claude-mm / claude-glm / gemini / kimi）统一走标准 ACP (Agent Client Protocol, JSON-RPC 2.0 over stdio)——本地脚本面与平台控制面**物理同轨**（§3.5 并轨映射表）。
2. **一个命令形状**：Hermes 派单只有一条稳定入口 `scripts/dispatch-local-employee.sh`，结构化回执落 `.coolie-local/dispatch/`，完工硬过 `pnpm check:governance`（wave298 铁律，脚本内建）。
3. **挂死归零**：结构化流式通知替代 PTY 刮取；`< /dev/null` 防 stdin 悬空；acpx 引擎层 60s 握手死线 + 30s 双工丢失取消死线兜底。
4. **微信执行总线闭环**：老板微信 → Hermes 派单 → ACP 执行 → 回执台账 → `cron-team-status.sh` 5 字段 (员工名/任务/时长/工具/状态) 回推微信。
5. **防退化守卫固化**：管局审计第 9 节 (wave357) 把"协议栈形状"钉进 CI 级门禁，任何退化回 PTY 直启的改动当场红。

---

## 1. 术语与真值锚点

| 术语 | 物理真值 |
|---|---|
| **ACP** | Agent Client Protocol — JSON-RPC 2.0 over stdio 的智能体客户端协议；方法面: `initialize` / `session/new` / `session/prompt` / `session/update`(通知流) / `session/cancel` |
| **acpx** | ACP 客户端执行器 (v0.13.1, repo 内 `node_modules/.bin/acpx`)；headless one-shot (`exec -f`) 与常驻会话两种形态 |
| **适配器** | `scripts/adapters/` 下 8 文件 6 工具族；无原生 ACP 的工具由 `@agentclientprotocol/sdk` 自建 agent server 桥接 |
| **回执 (receipt)** | `.coolie-local/dispatch/*.json` — queued/running/done/blocked/failed + commit/evidence/verification 字段 |
| **Hermes 微信执行总线** | 老板微信 → (cron push prompt) Hermes → dispatch 脚本 → ACP 执行 → 回执 → `scripts/cron-team-status.sh` 推断 5 字段 → 微信回报 (格式宪法见 `docs-coolie/PM-WECHAT-NOTIFY.md`) |

---

## 2. 选型研判 (Phase 1.4)

### 2.1 候选对比

| 候选 | 机制 | 优势 | 致命短板 | 裁决 |
|---|---|---|---|---|
| A. 万能网桥 (Universal Gateway) | 常驻中间服务代理全部 CLI | 单点封装、集中管控 | **SPOF**：网桥崩 = 6 员工全线瘫痪；上游 CLI 高速迭代 → 适配维护地狱；缓冲区死锁/流截断新卡点 (老板拍: 删) | ❌ 宪法第 0 节明弃 |
| B. PTY 直启 + 输出刮取 (现状·改前) | bash 直接 spawn CLI，刮 stdout | 零抽象成本 | ANSI 解析脆、权限交互卡死、stdin 悬空、无结构化事件、**无法 cancel**——本次 "terminal access failure" 根因族 | ❌ 真凶，淘汰 |
| C. 每工具专用协议 | 各 CLI 各写一套封装 | 贴合各工具特性 | N 套集成 N 套维护；无统一会话/取消/能力模型 | ❌ 维护面发散 |
| D. **标准 ACP + 薄适配器** | JSON-RPC 2.0 stdio 标准协议；原生支持者直连，缺位者用官方 SDK 写 <200 行桥接 | 结构化流式事件；统一 initialize/session/prompt/cancel 生命周期；能力协商；**claude/gemini/copilot/codex/kimi 官方原生支持** → 适配只做给 agy/cmd/claude-* 三族；协议由 Zed 主导跨厂商演进，非自有轮子 | 协议面比裸 spawn 多一层 (握手 ~2s)；需守护协议形状防退化 (→ §5 守卫) | ✅ **选定** |

### 2.2 选型决议依据

1. **组合优先 (宪法第 5 条)**：ACP 不是新造轮子——平台 acpx-engine (packages/adapter-utils) 已是 ACP 客户端实现；wave357 只是把本地脚本面**并轨**到同一个已存在的协议上，零新增表、零新增服务。
2. **消灭真凶**：候选 B 的 PTY 挂死是改前 run 失败的第一根因 (本券由 "terminal access failure" 重试唤起，即活体证据)。
3. **升级路径平滑**：gemini `--acp` / copilot `--acp --stdio` / kimi `acp` / claude-agent-acp / codex-acp 全部是各官方 CLI 的一等形态；适配层只承担三族缺位工具，且每个 <200 行 (fork-surface.json 预算内)。
4. **代价已知且受控**：见 §3.6 失败模式表与 §4 风险清单，全部有守卫或演进路线。

---

## 3. 系统设计 (Phase 3.1)

### 3.1 分层架构总图

```
┌──────────────────────────────────────────────────────────────────────────┐
│ L0 老板终端 (微信)                                                        │
│    意图下发 ↓                                    ↑ 5 字段状态回报          │
├──────────────────────────────────────────────────────────────────────────┤
│ L1 Hermes 微信执行总线                                                    │
│    cron push prompt → Hermes (PM 总调度, 宪法第 7 条)                     │
│    状态回报: scripts/cron-team-status.sh (infer_employee/工具/ETIME/状态)  │
├──────────────────────────────────────────────────────────────────────────┤
│ L2 派单收据中枢  scripts/dispatch-local-employee.sh (唯一命令形状)         │
│    prompt 组装 + 上下文总线注入 → .coolie-local/dispatch/{id}.json 回执    │
│    queued → running → (done|blocked|failed)；完工硬门禁 check:governance  │
├──────────────────────────────────────────────────────────────────────────┤
│ L3 标准 ACP 调度层  acpx (客户端, JSON-RPC 2.0 stdio)                     │
│    initialize → session/new → session/prompt → session/update 流 → end    │
│    握手死线 60s · 双工丢失取消死线 30s (packages/adapter-utils/constants)  │
├──────────────────────────────────────────────────────────────────────────┤
│ L4 ACP 适配器族  scripts/adapters/ (每工具一个薄桥, stdio agent server)    │
│    docker-agy-acp / cmd-acp (自建, @agentclientprotocol/sdk)              │
│    claude-mm-acp / claude-glm-acp (profile symlink 切换 + claude-agent-acp)│
│    copilot-acp (copilot --acp --stdio) / codex-acp (codex-acp bin)        │
├──────────────────────────────────────────────────────────────────────────┤
│ L5 执行引擎 (CLI 二进制真身)                                              │
│    agy (agy-ubuntu-container docker exec) · cmd · claude (+settings 软链)  │
│    copilot · codex · gemini --acp · kimi acp                              │
└──────────────────────────────────────────────────────────────────────────┘
  并轨面: 平台控制面 acpx-engine (packages/adapter-utils/acpx-engine/)
  与 L2-L4 走**同一** acpx 客户端 + **同一**适配器族 → 两张皮消灭 (§3.5)
```

### 3.2 组件契约

| 层 | 关键文件 | 契约要点 |
|---|---|---|
| L2 派单 | `scripts/dispatch-local-employee.sh` | `--agent <subagent> --task <task> [--execute]`；工具→适配器映射唯一 (`case "$TOOL"`)；acpx 缺位时才降级 local-cli/host-cli (降级路径必须保留，容器内/裸机兜底)；执行一律 `< /dev/null` |
| L3 客户端 | `node_modules/.bin/acpx` (v0.13.1) | one-shot: `acpx [--timeout N] --agent <adapter.sh> exec -f <prompt_file>`；全局选项必须在子命令前 (本次实测踩点: `exec --timeout` 会 unknown option) |
| L4 适配器 | `scripts/adapters/*.mjs/.sh` | 必须实现 `initialize`(回 `PROTOCOL_VERSION` + agentCapabilities) / `session/new` / `session/prompt` / `session/cancel`；prompt 数组块拼接；stdout/stderr 转 `agent_message_chunk` 通知；进程 close code==0 → `end_turn` 否则 `error` |
| L5 引擎 | 各 CLI 真身 | 非交互自主权限: agy `--dangerously-skip-permissions`；cmd `--yolo --tools-all -t`；claude 族由 profile 软链决定 provider (见 §4 R1) |
| 控制面 | `packages/adapter-utils/src/acpx-engine/{constants,execute}.ts` | `ACPX_ADAPTER_AGENT_IDS`: claude_local/codex_local/gemini_local/kimi_local/**copilot_local**/**agy_local**/**cmd_local**/custom_acp → acpx agent id；`resolveBuiltInAgentCommand`: agy→`scripts/adapters/docker-agy-acp.sh`, cmd→`scripts/adapters/cmd-acp.sh`, copilot→`copilot --acp --stdio` |
| 数据面 | `agents` 表 | `adapter_type` (默认 process) + `adapter_config` JSONB — 数字员工 ↔ 适配器绑定落库 (seed: `scripts/seed-agent-roles.ts` 波次维护) |

### 3.3 一次派单的端到端时序 (真机已验)

```
老板微信 "做下架构设计"
  → Hermes 收单, 组装 prompt (含上下文总线注入, --no-context 可关)
  → dispatch-local-employee.sh --agent modou-fda --task ... --execute
      → 回执 {status: queued} → 选路: TOOL=agy-gemini3.8
      → EXEC_CMD = acpx --agent scripts/adapters/docker-agy-acp.sh exec -f prompt.txt
      → 回执 {status: running, pid}
          → acpx 启动 docker-agy-acp.sh → node docker-agy-acp.mjs (ACP agent server)
          → JSON-RPC: initialize (PROTOCOL_VERSION 握手) → session/new
          → session/prompt → 适配器 docker exec -i agy-ubuntu-container agy -p ... 
          → stdout 流式 → agent_message_chunk 通知 → acpx 终端回显
          → close(0) → stopReason=end_turn
      → git rev-parse HEAD 入回执 → check:governance 硬门禁 (fail → blocked+exit 2)
      → 回执 {status: done, commit, verification}
  → cron-team-status.sh 推断 5 字段 → 微信回报 "完: waveXXX 落仓 <hash> | ..."
```

### 3.4 会话与生命周期模型

- **one-shot 语义**：L4 自建适配器的 session 为内存 Map (`{activeProcess}`)，每 `session/prompt` 拉起一个 CLI 子进程，close 即终局；`loadSession: false`——适配本地派单的一次性语义，**不承诺**跨进程会话恢复。
- **取消**：`session/cancel` → SIGTERM activeProcess（现有实现）；宿主侧 acpx 有双工丢失取消死线 30s 兜底 (constants.ts)。
- **握手预算**：60s (`ACPX_HANDSHAKE_TIMEOUT_MS`)，250ms 传输轮询——握手与整 turn 超时分离，避免"慢握手"被误判为死锁。

### 3.5 两张皮并轨映射表 (本次架构的核心交付)

| 调度关切 | 改前·本地施工队 | 改前·平台控制面 | wave357 并轨后 |
|---|---|---|---|
| 协议 | PTY spawn + stdout 刮取 | acpx (ACP) | **同一 ACP** |
| 客户端 | bash case 逐工具拼 argv | acpx-engine execute.ts | 同一 acpx 二进制 + `--agent` 适配器 |
| agy 接入 | `docker exec ... agy -p` 内联 | 无 (agy_local 未注册) | 两侧共用 `docker-agy-acp.sh` (execute.ts:862 直指同一文件) |
| cmd 接入 | `cmd -p --yolo --tools-all -t` 内联 | cmd_local 未注册 | 两侧共用 `cmd-acp.sh` |
| 权限开关 | 散落 argv | permission mode 常量 | 适配器内聚 (agy `--dangerously-skip-permissions`; cmd `--yolo`) |
| 挂死防御 | `< /dev/null` | handshake/duplex 死线 | 两者叠加 (脚本层 + 引擎层) |

### 3.6 失败模式与防御表

| 失败模式 | 触发条件 | 防御 | 层 |
|---|---|---|---|
| stdin 悬空挂死 | 无 TTY 后台执行 | `< /dev/null` 重定向 (守卫 §5-R4) | L2 |
| 权限交互卡死 | CLI 弹权限确认 | `--dangerously-skip-permissions` / `--yolo --tools-all` (守卫 §5-R5) | L4/L5 |
| 慢握手/假死 agent | 适配器不回 initialize | 60s 握手死线 + 250ms 轮询 | L3 |
| 双工通道丢失 | agent 停止应答 | 30s 内 turn.cancel 不答则宿主终局 | L3 |
| 容器不在 | agy-ubuntu-container 停 | 适配器三级降级: 容器内 agy → docker exec → 裸 agy (docker-agy-acp.mjs:71-90)；L2 保留 local-cli/host-cli 兜底 | L4/L2 |
| prompt 编码 | 中文 argv 替换坑 (wave290) | `-f <prompt_file>` 文件传递, 不走 argv | L2/L3 |
| 治理退化 | 任务"完成"但违反管局规范 | 完工硬门禁 check:governance, fail → 回执 blocked + exit 2 (wave298 铁律) | L2 |

### 3.7 安全与权限模型

1. **扁平化无套娃** (宪法第 7 条)：6 大员工是一级 Worker，CLI 仅为执行引擎；`register-employees-cron.sh` 禁止在 Claude 内嵌套 subagent (守卫已有规则)。
2. **自主权限最小集**：仅后台免交互必需的两个旗标受守卫保护；acpx 侧另有 `--approve-all/--deny-all/--non-interactive-permissions` 策略面可供收紧（当前派单路径用适配器内聚旗标）。
3. **回执即审计链**：每次派单 queued→done 全程留 JSON 回执 (pid/commit/verification/blocked_reason)，`.coolie-local/dispatch/` 可 `--list/--show` 追溯。

---

## 4. 已知风险与演进路线 (架构隔离否决权保留项)

| # | 风险 | 现状 | 建议 (P1/P2) |
|---|---|---|---|
| R1 | **profile symlink 全局竞态**: claude-glm/claude-mm 适配器执行前 `ln -sf settings.json{glm,mm} ~/.claude/settings.json`——两个 claude 族任务并发时 provider 可能被对方翻面 (铁匠 glm 与铁匠贰号 mm 同跑即撞) | 已知取舍 (TOOLS.md §1 如实记载) | **P1**: 派单层对 claude 族按 profile 互斥排队；或改用 `CLAUDE_CONFIG_DIR` 会话级隔离彻底去掉全局软链 |
| R2 | cancel 只杀适配器 spawn 的 `docker exec` 客户端进程，容器内 agy 进程可能存活 | 实现现状 | **P2**: 适配器改按进程组 kill / 容器内侧超时 |
| R3 | 适配器会话为内存 Map，适配器进程重启即失 | one-shot 语义下无害 | **P2**: 若未来接交互式长会话，需 session 持久化 (对齐平台 session-reuse-store 语义) |
| R4 | claude-agent-acp / codex-acp 走 `npx -y @^ver` 兜底, 首次冷启动拉网 | 仅缺 bin 时触发 | **P3**: 固化进 devDependencies 或 install-check |

---

## 5. 守卫军规 (Dev 反向传播, 已固化)

管局审计新增 **第 9 节「wave357 标准 ACP 调度协议栈防退化守卫」** (`scripts/check-governance-audit.mjs`)，把本设计的协议形状钉死：

| # | 规则 | 防的退化 |
|---|---|---|
| R1 | 6 大 ACP 适配器启动脚本存在且可执行 | 适配器文件被误删/去权限 |
| R2 | dispatch 脚本 acpx 选路段含 6 工具适配器路由 | 派单退化回逐工具内联 argv |
| R3 | 控制面注册表含 agy_local/cmd_local/copilot_local 且 agy/cmd 指向 repo 适配器 | 平台侧与脚本面再次分叉 (两张皮复活) |
| R4 | `< /dev/null` stdin 防悬空守卫 (已有, 划入本节语义) | 后台执行 stdin 挂死回归 |
| R5 | 适配器保自主权限旗标 (agy `--dangerously-skip-permissions` / cmd `--yolo --tools-all`) | 权限交互卡死回归 |
| R6 | 自建适配器保持 ACP 协议面 (`PROTOCOL_VERSION` + `initialize` + `session/prompt`) | 适配器塌缩成裸 PTY spawn |
| R7 | `which-tool.sh` 与 `TOOLS.md` ACP 矩阵章节在册 | 文档/探针与实现漂移 |

验收口径: `pnpm check:governance` 全绿 (含新增第 9 节) — 全量输出存证 `docs-coolie/evidence/wave357/governance.log`。

---

## 6. Delta 真实验证存证 (真机命令与结果)

| 探针 | 命令 | 结果 | 存证 |
|---|---|---|---|
| **ACP 端到端握手** (L0→L5 全栈真机) | `acpx --timeout 150 --agent scripts/adapters/docker-agy-acp.sh exec -f <prompt>` | `initialize → session/new → OK → [done] end_turn`, exit 0 (真 agy 容器内返回) | `evidence/wave357/acp-handshake-agy-smoke.txt` |
| 工具矩阵与运行时 | `which-tool.sh acp`; `acpx --version`; `docker inspect agy-ubuntu-container`; `bash -n dispatch`; 适配器可执行位 | 矩阵 6 工具族全列; acpx 0.13.1; 容器 Running; 语法 OK; 8 文件全 `-rwxr-xr-x` | `evidence/wave357/acp-matrix-and-runtime.txt` |
| 治理守卫 (含新增第 9 节) | `pnpm check:governance` | 🎉 全绿通过 (9 节全 PASS) | `evidence/wave357/governance.log` |
| 验证报告 | — | 见同目录 `verification.md` | `evidence/wave357/verification.md` |

---

## 7. 结论

wave357 用**已存在的标准** (ACP) 而非新造中间层，把"本地施工队"与"平台控制面"物理并轨到同一个协议、同一个客户端、同一族适配器上；PTY 挂死真凶被结构化协议 + 双层死线 + stdin 重定向三层防御消灭；执行证据链 (回执 → 守卫 → 存证 → 微信回报) 闭环到老板手机。遗留风险 R1 (symlink 竞态) 为当前最高优先演进项，已持架构否决权记录在案，不阻塞本波验收。
