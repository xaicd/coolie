# RTK 集成方案 (Token 降本)

> **目标**：把 [rtk-ai/rtk](https://github.com/rtk-ai/rtk)（Rust Token Killer, Apache-2.0）集成进 coolie，
> 在 Agent 执行 shell 命令时压缩输出（砍 60–90% bash 输出噪音），降低 LLM token 成本。
> **许可兼容**：rtk = Apache-2.0，coolie = MIT，**兼容**。
> **本文件**：新增文档，未改动 paperclip/coolie 核心代码。

---

## 1. rtk 是什么

单体 Rust CLI 代理，坐在「AI Agent ↔ shell」之间，在命令输出进入 LLM context 前先过滤/压缩：

- 100+ 命令支持（git / cargo / pytest / jest / docker / kubectl / aws / tsc / eslint …）
- `<10ms` 开销，无运行时依赖
- 通过 **PreToolUse hook / plugin** 把 `git status` 透明改写成 `rtk git status`，Agent 无感

> ⚠️ **作用范围**：hook 只作用于 **Bash 工具调用**。Claude Code 的 `Read/Grep/Glob` 等内置工具不走 Bash hook，不会被自动改写（rtk 官方明确限制）。省的是「命令执行输出」这块。
>
> 省的是「bash 输出字节数」60–90%，不等于账单降 60–90%（bash 输出只是输入 token 的一部分，输入 token 又只是账单的一部分）。收益真实但会逐级稀释。

## 2. 为什么适合 coolie

- coolie 编排的每个 Agent 会跑大量 shell 命令，输出直接进模型 → rtk 直接降本。
- **rtk 已原生支持 coolie 用的多个适配器**：Claude Code、Codex、Gemini、Cursor、OpenCode、Pi、Hermes、OpenClaw 都在 rtk 的 16 个支持列表里。
- 这些适配器跑的 Agent，**装上 rtk + `rtk init` 即可受益，基本零改造 coolie 核心**。

## 3. 集成方案（三层，从易到难）

### L1 — 运行时注入（推荐先做，验证收益）
在 Agent 的执行工作区 / 沙箱环境里预装 rtk 二进制并执行 `rtk init`，
让对应适配器的 PreToolUse hook 自动改写命令。

- 侵入性：极低，不改 coolie 核心
- 做法：`curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh` → `rtk init -g --agent <adapter>`
- 验证：跑几条命令后 `rtk gain` 看实际压缩率

### L2 — 沙箱镜像内置（规模化）
把 rtk 装进 coolie 的 sandbox-provider 镜像（`packages/plugins/sandbox-providers/` 下的 Docker / e2b / daytona / kubernetes 等），
新建执行环境自带 rtk，所有 Agent 默认启用。

- 侵入性：低，只动 provider 镜像/配置
- 落点：对应 provider 的 Dockerfile / 启动脚本

### L3 — 成本闭环联动（量化收益）
把 `rtk gain --format json` 的省 token 数据接入 coolie 的 `cost_events` / dashboard，
在看板上量化「rtk 省了多少 token / 折算多少钱」。

- 侵入性：中，写一个 coolie plugin（`packages/plugins/`）
- 数据源：`rtk gain --all --format json`

## 4. rtk 配置要点

`~/.config/rtk/config.toml`：

```toml
[hooks]
exclude_commands = ["curl", "playwright"]   # 跳过改写

[tee]
enabled = true          # 命令失败时保存完整原始输出，供 LLM 无需重跑即可查看
mode = "failures"       # failures / always / never
```

- 关闭 telemetry（默认关，需显式 opt-in）：`export RTK_TELEMETRY_DISABLED=1`
- 单命令跳过：`RTK_DISABLED=1 git status`
- Hook 契约：**永不阻断命令**，所有错误路径 exit 0（graceful degradation）

## 5. 建议执行顺序

1. **L1 冒烟**：在一个 coolie 执行环境里装 rtk + `rtk init`，用一个 Agent 跑几条命令，`rtk gain` 确认真实压缩率。
2. 收益确认后 → **L2** 进沙箱镜像规模化。
3. 想在看板展示降本收益 → **L3** 写成本联动 plugin。

## 6. 风险 / 注意

- 仅 Bash 工具调用被改写；内置文件工具不受益。
- 绝对 token 数是 `bytes/4` 估算（rtk 不带 tokenizer），**百分比可靠、绝对值近似**。
- 沙箱内需有 `rg`(ripgrep)，部分过滤器会 shell out 到它。
