# wave382 — claude-mm / claude-glm 全字段补齐 (老板拍 a=两工具必须能用)

- 波次: wave382
- 触发: 老板拍"a 这两工具必须能用" — claude-glm 与 claude-mm 必须能用, 警告也要消
- 执行员工: 铁匠贰号 (forge-ii-core-swe, Core SWE fallback)
- 分支: main
- 结论: **已补齐** — 两套 `~/.claude/settings.json{mm,glm}` 全字段对齐; `claude-mm` 真跑返回 `ok-mm` 且人读警告消失; `claude-glm` 配置与警告均干净 (唯一失败为智谱账号级 429 配额, 非配置问题, 2026-10-16 17:55 自动重置)。

---

## 1. 真因 (Root Cause): 那个警告是什么

`claude --settings ~/.claude/settings.jsonmm` 原先在 stderr 打印:

```
Claude Code doesn't recognize the model "MiniMax-M3", so it assumes a context window of 200k tokens.
Update Claude Code, or see https://code.claude.com/docs/en/model-config#correct-the-window-for-a-gateway-or-custom-model-id to set the window.
```

反编译 `claude` 二进制 (`/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/node_modules/@anthropic-ai/claude-code-darwin-arm64/claude`) 得到判定逻辑:

```js
// 人读警告仅当 ee.recognized===false 时生成
function OGt(e,n){ return !e.optIn1mHonored && !_Be(e.model) && !n && !e.recognized }
```

`MiniMax-M3` / `glm-5` 均非 Claude Code 内置目录 (first-party catalog) 中的 model id，故 `recognized=false`，触发提示。**解法 = 显式声明窗口**，即 `CLAUDE_CODE_AUTO_COMPACT_WINDOW`(或 `CLAUDE_CODE_MAX_CONTEXT_TOKENS`)。

实测 (见 §4)：`CLAUDE_CODE_AUTO_COMPACT_WINDOW=1048576` 与人读警告消失**强相关且可复现**；
`glm` 配置文件本就带该字段, 所以 glm 从未出现人读警告, 只有 mm 缺。

## 2. 变更 (Changes)

### 2.1 宿主机实时配置 (不在 git 内, 直接修补)

`~/.claude/settings.jsonmm` (即 `settings.json` 软链接目标, MiniMax 主线):

| 字段 | 变更前 | 变更后 |
| --- | --- | --- |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | `MiniMax-M3` | `MiniMax-M2.7` |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | — (缺) | `1048576` (1M 上下文) |
| `API_TIMEOUT_MS` | — (缺) | `3000000` |
| `CLAUDE_CODE_SUBAGENT_MODEL` | `MiniMax-M3` | `MiniMax-M3` (保留) |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | `32000` | `32000` (保留) |
| `hooks.PreToolUse` (`rtk hook claude`) | 已有 | 已有 (保留, 无需补) |

`~/.claude/settings.jsonglm` (GLM 智谱线):

| 字段 | 变更前 | 变更后 |
| --- | --- | --- |
| `CLAUDE_CODE_SUBAGENT_MODEL` | — (缺) | `glm-5` |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | — (缺) | `32000` |
| `hooks.PreToolUse` (`rtk hook claude`) | — (缺) | 已补, 与 mm 对齐 |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | `1048576` | `1048576` (保留) |
| `API_TIMEOUT_MS` / `HAIKU=glm-5-turbo` | 已有 | 已有 (保留) |

> 注: 任务书第 1 步写 mm "缺 rtk hook", 实测 mm 早已挂载 `rtk hook claude`, 故未重复添加 (只做真实缺口)。

### 2.2 仓库生成器 (跨机复刻持久化, 保证 bootstrap 产物与实机一致)

`~/.claude/settings.json*` 不进 git；仓库内由两个脚本模板生成, 已同步:

- `scripts/bootstrap-coolie-dev-host.sh`: glm/mm 两段 heredoc 补齐全字段 + hooks
- `scripts/install-all-cli-tools.sh`: glm/mm 两段 heredoc 补齐全字段 + hooks; glm `glm-5.3[1m]` → `glm-5` (与实机/文档对齐)

### 2.3 文档同步 (docs = 实机真相)

- `docs-coolie/TOOLS.md` §1.2 规格表 / §1.3 真实配置拆解 / §1.4 范式 B: glm 模型 `glm-5.3[1m]` → `glm-5`; 补 `CLAUDE_CODE_AUTO_COMPACT_WINDOW` / `API_TIMEOUT_MS` / `CLAUDE_CODE_SUBAGENT_MODEL` / `CLAUDE_CODE_MAX_OUTPUT_TOKENS` / `hooks`; mm Haiku 标注 `MiniMax-M2.7`。
- `scripts/which-tool.sh`: claude-glm 自述模型 `glm-5.3[1m]` → `glm-5`。

## 3. 变更文件

| 文件 | 说明 |
| --- | --- |
| `~/.claude/settings.jsonmm` | 补 `AUTO_COMPACT_WINDOW` + `API_TIMEOUT_MS`, Haiku→`MiniMax-M2.7` (实机) |
| `~/.claude/settings.jsonglm` | 补 `SUBAGENT_MODEL` + `MAX_OUTPUT_TOKENS` + `rtk hook` (实机) |
| `scripts/bootstrap-coolie-dev-host.sh` | glm/mm 生成模板补齐全字段 |
| `scripts/install-all-cli-tools.sh` | glm/mm 生成模板补齐全字段 |
| `scripts/which-tool.sh` | glm 自述模型对齐 `glm-5` |
| `docs-coolie/TOOLS.md` | §1.2/§1.3/§1.4 配置文档对齐实机 |

## 4. 验证 (Verification)

实测命令 (真跑 `-p`):

```sh
# claude-mm
claude --settings ~/.claude/settings.jsonmm -p 'echo ok-mm'
# -> stderr: [claude-code:unrecognized_model] {"model":"MiniMax-M3","query_source":"sdk"}
# -> stdout: ok-mm          EXIT=0   人读警告=0 ✅

# claude-glm
claude --settings ~/.claude/settings.jsonglm -p 'echo ok-glm'
# -> stderr: [claude-code:unrecognized_model] {"model":"glm-5","query_source":"sdk"}
# -> API Error: Request rejected (429) [1310] 已达每周/每月上限, 2026-10-16 17:55:41 重置
# EXIT=1   人读警告=0 ✅
```

补充对照实验 (证明 `AUTO_COMPACT_WINDOW` 就是消警告的开关):

| 变体 | 人读警告 | 返回 |
| --- | --- | --- |
| 原 `settings.jsonmm` (未改) | 有 | ok-mm |
| + `CLAUDE_CODE_AUTO_COMPACT_WINDOW=1048576` | **无** | ok-mm |
| + `CLAUDE_CODE_MAX_CONTEXT_TOKENS=1048576` | **无** | ok-mm |
| 两者都加 | **无** | ok-mm |

模型名真实性核验 (直击 MiniMax `/anthropic/v1/messages`):

- `MiniMax-M2.7` → 200 且响应 `"model":"MiniMax-M2.7"` (真模型, 非兜底)
- 对照 `totally-bogus-model-xyz` → 200 但响应 `"model":"MiniMax-M3"` (服务端静默兜底, 佐证 M2.7 是真实条目)

静态校验:

- `bash -n scripts/bootstrap-coolie-dev-host.sh` → OK
- `bash -n scripts/install-all-cli-tools.sh` → OK
- 两脚本 heredoc JSON 全部 `json.loads` 通过
- `jq -e .` 两个实机配置均通过

## 5. 遗留说明 (Honest Gaps)

### 5.1 glm 429 配额

智谱账号当前处于"每周/每月使用上限"状态, `2026-10-16 17:55:41` 重置, 属**账号级外部配额**, 非配置缺陷。
判据: 请求已抵达 API 并收到结构化业务错误 (HTTP 级配额码 1310), 说明二进制挂载、端点、鉴权、模型名全部正确; 配置正常的情况下重置后即可用。

### 5.2 剩余的 `[claude-code:unrecognized_model]` 行

这是 Claude Code 在 headless/SDK 模式对"非 first-party model id"打印的**结构化诊断信号** (前缀 `[claude-code:...]`), **不是**老板要消的人读警告。已穷举尝试, 无法用配置关闭:

- `[1m]` 模型名后缀 (`MiniMax-M3[1m]`) → 仍在
- `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1` → 仍在
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` → 仍在
- `CLAUDE_CODE_SESSION_KIND=bg` → 仍在
- 反编译确认无对应关闭开关 (`CLAUDE_CODE_MODEL_CATALOG` 仅是 remote catalog 的 kill-switch, 不能自定义模型窗口)

彻底消除只能改用一个 first-party model id (会牺牲 MiniMax/GLM 真实能力), 故**保留并如实上报**。

## 6. 未做 / 边界

- 未 `git reset --hard`; 未触碰既存 dirty 文件 `clients/expo/src/screens/BoardChatScreen.tsx` 与未跟踪 `docs-coolie/probe/2026-10-15-tool-probe.md`。
- 未改任何 token/密钥; 报告中一律脱敏。
- 未变更 glm 主线模型 id 的**取值决策** (仅将模板/文档与实机 `glm-5` 对齐, 不再残留 `glm-5.3[1m]` 幽灵值)。
