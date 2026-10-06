# Coolie 7 工具池物理规范与执行手册 (TOOLS.md)

> **老板原话拍板 (wave272 / wave280 / wave356)**:
> 1. *"万能网桥 也是个 中间卡点了吧 得维护，本质还是 tool 工具的 详细使用说明"* (wave356)
> 2. *"claude-glm 其实 是claude 指定 settings 配置文件，这些要写清楚啊"* (wave356)
> 3. *"Hermes 肯定用 Hermes 自己啊, 为啥 kiro-cli"* (wave280)
> 4. *"agy-gemini3.8 与 claude-mm, claude-glm, cmd, copilot, Hermes, kiro-cli 一样都是工具"* (wave272)
> 5. *"谁负责原型" → "a" = 墨斗 (FDA 匠人) 用 agy-gemini3.8* (wave272)

---

## 0. 核心设计哲学：消灭“万能网桥”中间卡点，活体工具规范（Tool Playbook）即唯一真理

在智能体平台工程演进中，很多系统习惯于设计一个重型“万能网桥 / Universal Bridge / Gateway”服务作为中间件，试图将各种外部 CLI（Claude Code, CommandCode, Copilot, Antigravity 等）抽象封装为统一的 RPC 或 WebSocket 代理。

**Coolie 平台最高工程法典（公理一 & 人机工程学）坚决摒弃“万能网桥”：**
1. **消灭单点脆弱性 (SPOF)**：网桥服务一旦发生进程崩溃、端口占用、OOM 或网络重试风暴，6 大数字员工将瞬间全线瘫痪；
2. **终结适配维护地狱**：各类底层 CLI（如 Anthropic Claude Code、GitHub Copilot、CommandCode）处于高速迭代期，其参数体系、流式输出协议、ANSI 码、交互式权限确认逻辑各异。重型网桥会成为最沉重、最易腐化的技术债务；
3. **消除中间缓冲与假死卡点**：Prompt 与代码经过网桥转发，经常面临缓冲区死锁、流式截断与非预期挂死；
4. **释放 Agent 原生 Bash 自治原力**：现代大模型（Hermes、铁匠等）天生具备强大的终端环境交互与 Shell 执行能力。**“本质还是 tool 工具的详细使用说明”**——只要将各工具真实的**物理位置、底层二进制、配置文件路径与切换机制、环境变量、防悬挂参数（`--dangerously-skip-permissions`, `--yolo`, `< /dev/null`）、超时退出机制**彻底写透、形成不可动摇的契约，Agent 即可通过轻量透明的调用脚本（如 `scripts/dispatch-local-employee.sh`）以最小代价直达底层工具，达成 100% 确定性执行！

---

## 1. 解密 `claude-*` 工具族物理本质：一个 Claude CLI 二进制与三套 `settings.json<suffix>` 配置切换机制

### 1.1 现实物理真相 (Ground Truth)
在 Mac 宿主机上，**只有一个官方 Claude Code CLI 可执行二进制程序**：
- 路径：`/opt/homebrew/bin/claude`（当前版本 2.1.287）
- **根本不存在名为 `claude-glm` 或 `claude-mm` 的独立二进制程序！**

所谓的 `claude-glm`、`claude-mm` 与 `claude-ds`，实质是**同一个 `claude` CLI 通过切换宿主机 `~/.claude/settings.json` 软链接（symlink）所指向的不同提供商配置文件**！

```
                      ┌───> settings.jsonglm ───> 智谱 BigModel API (glm-5.3[1m])
                      │
~/.claude/settings.json ───> settings.jsonmm  ───> MiniMax API (MiniMax-M3)
  (符号链接 symlink)    │
                      └───> settings.jsonds  ───> DeepSeek API (deepseek-v4-pro)
```

### 1.2 三大配置文件规格全景表

| 工具名称 (`--tool`) | 软链接目标文件 | 服务商与 API 基础端点 | 核心模型规格 | 配置亮点与适用场景 |
|---|---|---|---|---|
| **`claude-glm`** | `~/.claude/settings.jsonglm` | **智谱 BigModel**<br>`https://open.bigmodel.cn/api/anthropic` | `glm-5.3[1m]`<br>(Haiku: `glm-5-turbo`) | **铁匠 (Core SWE) 主力工具**。<br>拥有 1M 超长上下文，自动压缩窗口 1048576，长上下文工程代码与架构重构极其稳定。 |
| **`claude-mm`** | `~/.claude/settings.jsonmm` | **MiniMax 官方**<br>`https://api.minimaxi.com/anthropic` | `MiniMax-M3` | **铁匠贰号 (Core SWE 兜底) / 百晓生 (DS 备用)**。<br>最大输出支持 32000 tokens，挂载 `rtk hook claude`，长期按量充裕，抗高并发。 |
| **`claude-ds`** | `~/.claude/settings.jsonds` | **DeepSeek 官方**<br>`https://api.deepseek.com/anthropic` | `deepseek-v4-pro` | **应急备选**（已退出日常 7 工具池，配置文件就绪留底）。 |

### 1.3 宿主机真实配置内容拆解

#### ① `~/.claude/settings.jsonglm` (GLM 智谱配置)
```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "f111499a79a6407eb9ebe2a89bfab50d.tzbjj1u9u3PF4BIi",
    "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": 1,
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-5-turbo",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-5.3[1m]",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5.3[1m]",
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "1048576"
  }
}
```

#### ② `~/.claude/settings.jsonmm` (MiniMax 配置)
```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "sk-cp-Cj_FyeuMZ-Xpc2O4-...",
    "ANTHROPIC_BASE_URL": "https://api.minimaxi.com/anthropic",
    "ANTHROPIC_MODEL": "MiniMax-M3",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "MiniMax-M3",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "MiniMax-M3",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "MiniMax-M3",
    "CLAUDE_CODE_SUBAGENT_MODEL": "MiniMax-M3",
    "CLAUDE_CODE_MAX_OUTPUT_TOKENS": "32000"
  },
  "permissions": {
    "allow": [],
    "deny": []
  },
  "alwaysThinkingEnabled": false,
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "rtk hook claude"
          }
        ]
      }
    ]
  }
}
```

### 1.4 两种标准执行范式

#### 范式 A：软链接切换法 (Symlink Switch Mode，`dispatch-local-employee.sh` 官方采用)
在执行 `claude` 命令前，原子切换 `settings.json` 指向：
```bash
# 1. 切换为 claude-glm (铁匠主力)
ln -sf ~/.claude/settings.jsonglm ~/.claude/settings.json
claude -p "$PROMPT" --dangerously-skip-permissions < /dev/null

# 2. 切换为 claude-mm (铁匠贰号 / 百晓生)
ln -sf ~/.claude/settings.jsonmm ~/.claude/settings.json
claude -p "$PROMPT" --dangerously-skip-permissions < /dev/null
```

#### 范式 B：子进程内联环境变量法 (Inline Env Mode，临时无干扰)
若避免修改全局 `settings.json`，可在单次子进程中直接覆盖环境变量：
```bash
# 调 GLM
ANTHROPIC_BASE_URL="https://open.bigmodel.cn/api/anthropic" \
ANTHROPIC_AUTH_TOKEN="f111499a79a6407eb9ebe2a89bfab50d.tzbjj1u9u3PF4BIi" \
ANTHROPIC_DEFAULT_SONNET_MODEL="glm-5.3[1m]" \
claude -p "$PROMPT" --dangerously-skip-permissions < /dev/null
```

---

## 2. 7 工具池物理生态与执行真配手册 (Tool Execution Playbook)

| # | 工具名称 (`--tool`) | 真实物理位置 | 底层可执行文件 | 核心配置与参数 | 物理调用命令模板 (带防挂死标志) |
|---|---|---|---|---|---|
| 1 | **`Hermes`** | 通用 (宿主/容器) | Hermes 自身 | PM 唯一调度中枢 | `scripts/dispatch-local-employee.sh` / 会话直驱 |
| 2 | **`agy-gemini3.8`** | Mac 宿主机 Docker 容器 | `/root/.local/bin/agy` (v1.3.0) 容器内 | Antigravity Inc + Gemini 3.8 | 宿主 base64 包装 -> `docker cp` -> 容器内 `LANG=C.UTF-8` -> `agy --dangerously-skip-permissions -p "$PROMPT"` |
| 3 | **`claude-glm`** | Mac 宿主机 | `/opt/homebrew/bin/claude` | `~/.claude/settings.jsonglm` | `ln -sf ~/.claude/settings.jsonglm ~/.claude/settings.json && claude -p "$PROMPT" --dangerously-skip-permissions < /dev/null` |
| 4 | **`claude-mm`** | Mac 宿主机 | `/opt/homebrew/bin/claude` | `~/.claude/settings.jsonmm` | `ln -sf ~/.claude/settings.jsonmm ~/.claude/settings.json && claude -p "$PROMPT" --dangerously-skip-permissions < /dev/null` |
| 5 | **`cmd`** | Mac 宿主机 | `/opt/homebrew/bin/cmd` (v1.74.3) | CommandCode CLI 全自主 | `cmd -p "$PROMPT" --yolo --tools-all -t < /dev/null` |
| 6 | **`copilot`** | Mac 宿主机 | `/opt/homebrew/bin/copilot` (v1.0.91) | GitHub Copilot CLI | `copilot -p "$PROMPT" --yolo < /dev/null` |
| 7 | **`kiro-cli`** | Mac 宿主机 | AWS Kiro CLI | 老板专属保留 (架构大重构) | `kiro-cli -p "$PROMPT" < /dev/null` |

### 2.1 各工具关键避坑与执行细节

#### 1. `agy-gemini3.8` (墨斗 FDA 专属)
- **容器环境**：容器名 `agy-ubuntu-container`，运行于 Mac 宿主机 Docker。
- **致命坑点（编码乱码）**：若直接通过 `docker exec agy-ubuntu-container agy -p "中文需求"`，macOS bash argv 会将中文字符串全部替换为 `?` 导致模型输入全毁！
- **标准解法（三步防损管道）**：
  1. 宿主机将 Prompt 写入文件并执行 `base64 -i prompt.txt -o prompt.b64`；
  2. `docker cp prompt.b64 agy-ubuntu-container:/tmp/prompt.b64`；
  3. 容器内执行脚本显式声明：
     ```bash
     export LANG=C.UTF-8
     export LC_ALL=C.UTF-8
     PROMPT="$(base64 -d /tmp/prompt.b64)"
     agy --dangerously-skip-permissions --output-format text --print-timeout 1800s -p "$PROMPT"
     ```

#### 2. `cmd` (门神 FDSE 专属)
- **参数铁律**：必须带 `--yolo --tools-all -t`。
- **重定向铁律**：末尾必须带 `< /dev/null`，防止子进程试图等待终端输入导致超时挂死。

#### 3. `copilot` (兑底渊 PRE-SRE 专属)
- **参数铁律**：必须带 `--yolo` 允许自动执行命令。
- **配额重置**：每月 1 号自动通过 `scripts/cron-copilot-reset.sh` 重置为 `gpt5-sol`。

---

## 3. 6 老板团队 (含铁匠贰号) 与 5 大本体角色

| # | 团队成员 | 别名 | CMMI 本体角色 | 默认工具 (主线) | 兜底工具 | 主要职责 |
|---|---|---|---|---|---|---|
| 1 | **Hermes (PM)** | Hermes / 黑哥 / XRobinAI | (PM 调度总指挥) | **Hermes 自己** (wave280 拍板) | - | 拍板决策、拆分意图、派单派活、验收汇总 |
| 2 | **墨斗 (Inkstick)** | Inkstick | `fda` (前线架构师) | **`agy-gemini3.8`** (wave272 拍板) | `cmd` (紧急兜底) | 方案选型、数据隔离设计、原型草图、架构研判 |
| 3 | **铁匠 (Forge)** | Forge | `core-swe` (核心研发) | **`claude-glm`** (wave272 恢复) | `claude-mm` (= 铁匠贰号) | 核心业务代码、契约守护、复杂逻辑集成 |
| 4 | **铁匠贰号 (Forge II)** | Forge II | `core-swe` (副/兜底) | **`claude-mm`** (wave272 固化) | - | 铁匠主线额度见顶或并发时接力 (同角色换工具) |
| 5 | **门神 (Guardian)** | Guardian | `fdse` (前线全栈部署) | **`cmd`** (`@commandcode/ai`) | - | 自动化脚本、全栈单测、E2E 浏览器旅程回归 |
| 6 | **兑底渊 (Operator)** | Operator | `pre-sre` (产品可靠性) | **`copilot`** (wave272 拍板) | `claude-mm` | 发版打包、OTA 巡检、容器健康、生产环境指纹 |
| 7 | **百晓生 (Sage)** | Sage | `ds` (部署战略专家) | **`claude-glm`** / `claude-mm` | `agy-gemini3.8` | 端到端真实业务闭环验收、一票否决权 |

> **关键澄清**：
> - 铁匠与铁匠贰号是同一个 `core-swe` 岗位，铁匠贰号是“使用 `claude-mm` 兜底工具时的铁匠”；
> - 百晓生拥有终审与验收一票否决权，只以真实业务用户视角审查，不以纯编译通过为结单标准。

---

## 4. 6 老板团队 × 7 工具池 真配矩阵 (wave272 拍板)

```
                          ┌───> 墨斗 (FDA)       ───> agy-gemini3.8 (Docker 容器)
                          ├───> 铁匠 (Core SWE)  ───> claude-glm (Mac 宿主 / GLM-5.3 1M)
                          ├───> 铁匠贰号 (Core SWE)─> claude-mm (Mac 宿主 / MiniMax-M3)
Hermes (PM / Hermes自己) ─┼───> 门神 (FDSE)      ───> cmd (Mac 宿主 / CommandCode)
                          ├───> 兑底渊 (PRE-SRE) ───> copilot (Mac 宿主 / Copilot CLI)
                          └───> 百晓生 (DS)      ───> claude-glm / claude-mm (终审验收)
                               [备用储备]        ───> kiro-cli (老板专属架构保留)
```

---

## 5. PM 派活工具池 SOP 与免死锁调度规范

### 5.1 派单五步法
1. **核验任务所属角色**：查阅 `CMMI-EMPLOYEE-MAPPING.md` 确定任务责任人；
2. **确认角色首选工具**：查阅本表 §4 真配矩阵；
3. **探针健康速查**：执行 `bash scripts/which-tool.sh check` 或 `bash scripts/tool-health-monitor.sh --print`；
4. **生成工单并派单**：
   ```bash
   bash scripts/dispatch-local-employee.sh \
     --agent forge-core-swe \
     --task "修复本体数据流水线死循环缺陷" \
     --wave wave356
   ```
5. **真实启动执行**：
   ```bash
   bash scripts/dispatch-local-employee.sh \
     --agent forge-core-swe \
     --task "修复本体数据流水线死循环缺陷" \
     --execute
   ```

### 5.2 免死锁与后台免交互三大铁律
1. **权限静默铁律**：严禁触发任何 CLI 的终端 `[Y/n]` 确认。Claude 必须带 `--dangerously-skip-permissions`，cmd/copilot 必须带 `--yolo`；
2. **stdin 阻断铁律**：后台或自动化执行任何 CLI 时，命令末尾必须添加 `< /dev/null` 重定向，彻底杜绝无头运行时 stdin 挂起死锁；
3. **门禁阻断硬挂钩**：工单标记 `done` 前，必须通过 `scripts/check-governance-audit.sh` 与 `scripts/gate-evidence-ledger.sh` 门禁，严禁口头结单。

---

## 6. MCP 默认安装 (wave228 + wave278 全清版)

每个工具启动时自动加载的 MCP servers，统一写入 `~/.claude/settings.json` 的 `mcpServers` 子树。

| MCP Server | 注册脚本 | 加载目标工具 | 核心用途 |
|---|---|---|---|
| **agent-device** | `scripts/install-agent-device-mcp.sh` | 7 工具全量装载 | 真机设备自动化 (iOS / Android / macOS) |
| **agent-browser** | `scripts/install-agent-browser-mcp.sh` | 7 工具全量装载 | 浏览器端到端 E2E 自动化走查 |
| **system-monitor** | `scripts/install-ds-mcp.sh` | 仅 DS 工具链 (百晓生) | 监控宿主 CPU / 内存 / 服务健康 |
| **approval** | `scripts/install-ds-mcp.sh` | 仅 DS 工具链 (百晓生) | 关键变更审批门禁 |
| **company-ops** | `scripts/install-ds-mcp.sh` | 仅 DS 工具链 (百晓生) | 工坊自动化运营与报表 |

---

## 7. Copilot 月度重置 Cron (wave228)

每月 1 号 8:01，自动执行 `~/bin/copilot-reset.sh --to gpt5-sol`，将 `~/.copilot/config` 的默认模型切回 `gpt5-sol`。

```cron
1 8 1 * * /Users/mac/bin/copilot-reset.sh --to gpt5-sol # wave228-copilot-reset
```

---

## 8. 标准化 ACP (Agent Client Protocol) 协议接入与双模执行矩阵 (Tier 1 ACP + Tier 2 CLI)

为了兼顾「自动化流水线的高可靠结构化流式通信（ACP）」与「开发者本地极简单次调试（CLI）」，Coolie 统一支持 **双模执行矩阵**：

### 8.1 什么是 ACP 以及为什么 Coolie 拥抱它？
- **传统 CLI 交互的缺陷**：外部程序驱动 CLI 时需建立虚拟终端（PTY），解析 ANSI 颜色代码、用正则匹配 `>` 提示符，经常因终端换行或缓冲区截断而挂死。
- **ACP 标准协议规范**：由 Zed 团队与开源社区共同制定的标准化 JSON-RPC 2.0 协议（[agentclientprotocol.com](https://agentclientprotocol.com)）。它通过标准输入输出（stdio）实现：
  1. `initialize`：握手协商协议版本与能力集；
  2. `session/new` / `session/prompt`：下发结构化任务；
  3. `session/update`：实时推送模型思考（Thinking）、工具调用（ToolCall）、代码变更（Diff）；
  4. 权限与审批结构化处理，彻底消灭 PTY 终端刮取与进程假死。

### 8.2 6 大工具 ACP 适配器与驱动矩阵

平台在 `scripts/adapters/` 沉淀了各工具的标准化 ACP 适配启动器，并由 `packages/adapter-utils/src/acpx-engine` 统一调度：

| 工具名称 | ACP 适配驱动路径 | 底层实现原理 | 驱动命令 (`acpx`) |
|---|---|---|---|
| **`docker agy`** | [`scripts/adapters/docker-agy-acp.sh`](file:///host-workspace/xaicd/coolie/scripts/adapters/docker-agy-acp.sh) | 封装 `@agentclientprotocol/sdk`，自动穿透 Docker `agy-ubuntu-container` 调用 Google Antigravity (Gemini 3.8) | `acpx --agent scripts/adapters/docker-agy-acp.sh "<prompt>"` |
| **`cmd`** | [`scripts/adapters/cmd-acp.sh`](file:///host-workspace/xaicd/coolie/scripts/adapters/cmd-acp.sh) | 封装 `@agentclientprotocol/sdk`，驱动 CommandCode (`cmd`) 非交互流式执行 | `acpx --agent scripts/adapters/cmd-acp.sh "<prompt>"` |
| **`copilot`** | [`scripts/adapters/copilot-acp.sh`](file:///host-workspace/xaicd/coolie/scripts/adapters/copilot-acp.sh) | 原生支持 `copilot --acp --stdio` 协议端点 | `acpx copilot "<prompt>"` |
| **`codex`** | [`scripts/adapters/codex-acp.sh`](file:///host-workspace/xaicd/coolie/scripts/adapters/codex-acp.sh) | 官方 `@agentclientprotocol/codex-acp` 适配器 | `acpx codex "<prompt>"` |
| **`claude-mm`** | [`scripts/adapters/claude-mm-acp.sh`](file:///host-workspace/xaicd/coolie/scripts/adapters/claude-mm-acp.sh) | 自动加载 MiniMax 配置 (`settings.jsonmm`)，驱动 `@agentclientprotocol/claude-agent-acp` | `acpx claude "<prompt>"` (MiniMax Profile) |
| **`claude-glm`** | [`scripts/adapters/claude-glm-acp.sh`](file:///host-workspace/xaicd/coolie/scripts/adapters/claude-glm-acp.sh) | 自动加载 GLM 配置 (`settings.jsonglm`)，驱动 `@agentclientprotocol/claude-agent-acp` | `acpx claude "<prompt>"` (GLM Profile) |

### 8.3 双模使用指南
1. **模式 A：Tier 1 ACP 结构化流式模式（系统生产/工单长会话推荐）**：
   ```bash
   # 例如由 acpx 或 Coolie Server 驱动 docker agy
   ./packages/adapter-utils/node_modules/.bin/acpx --agent scripts/adapters/docker-agy-acp.sh exec "分析数据隔离设计"
   ```
2. **模式 B：Tier 2 CLI 极简免交互模式（本地快速调试/脚本触发推荐）**：
   ```bash
   # 使用 which-tool.sh 快速查看
   bash scripts/which-tool.sh acp
   ```

---

## 9. 规范出处与决策记录

1. **wave356 (2026-10-06)**: 老板拍板消灭万能网桥中间卡点，明确指出本质是 Tool 的详细使用说明，深度阐明 `claude-glm` 是 `claude` 指定 `settings.json` 配置文件的底层物理真相；全面落地 ACP 标准协议，支持 `docker agy`, `copilot`, `cmd`, `codex`, `claude-mm`, `claude-glm` 全工具池标准驱动。
2. **wave280 (2026-10-02)**: 老板拍板解除 Hermes 与 kiro-cli 的误配，确立 Hermes = Hermes 自己（人即工具），kiro-cli 留作老板架构备用。
3. **wave272 (2026-10-02)**: 老板拍板 7 工具池（agy-gemini3.8, claude-mm, claude-glm, cmd, copilot, Hermes, kiro-cli）与 6 团队成员真配矩阵。