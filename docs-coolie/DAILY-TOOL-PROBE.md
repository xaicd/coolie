# 每天早上工具使用探测 (wave277)

> **目的**: 把老板"每天早上把所有工具的使用探测做一遍"派活模板固化.
> 每天 8:00 cron 跑 `scripts/daily-tool-probe.sh`, 出 5 字段表格 (工具 /
> 路径 / 版本 / 探测时间 / 状态), 失败时给修法, 写到
> `docs-coolie/probe/<YYYY-MM-DD>-tool-probe.md`.
>
> **Why**: 老板原话 (wave277, 2026-10-02):
>
> > "你每天早上把所有工具的使用探测做一遍"
>
> — 派活前先知道哪个工具能用. 之前每次手动 which + 试跑 7 个工具
> ≈ 2 分钟, 现在 1 条 cron + 1 份报告.
>
> **不动**:
> - `server` / `ui` / `clients/expo` — 不动
> - wave270 / wave271 / wave272 / wave273 / wave274 / wave275 / wave276 — 不动
> - v0.6.20 tag — 不动
> - 5 角色 / AGENT_ROLES enum — 不动
> - `docs-coolie/TOOLS.md` §2 (wave272 拍板) — 本表引用其真值, 不重复
> - `scripts/cron-team-status.sh` (wave276 每 30 分钟) — 平级, 不动

---

## 0. 文档约定

- **7 工具池** — 详见 `TOOLS.md` §2: agy-gemini3.8 / claude-mm /
  claude-glm / cmd / copilot / Hermes / kiro-cli. 本表 §1 列出每工具探测
  规则.
- **5 字段表格** — 老板硬规矩: 工具 / 路径 / 版本 / 探测时间 / 状态.
- **失败修法** — 每个工具失败时, 表格下给 1 条具体修法 (例: docker start
  / brew install), 不让老板明天再来回问.

---

## 1. 7 工具探测规则

| # | 工具 | 路径检查 | 版本检查 | 实跑测试 | 失败判定 |
|---|---|---|---|---|---|
| 1 | **agy-gemini3.8** | `docker inspect agy-ubuntu-container` State.Running | `docker exec ... agy --version` | `docker exec ... agy -p "test"` | 容器未运行 / version 空 / test 无 stdout |
| 2 | **claude-mm** | `which claude` | `ANTHROPIC_MODEL=MiniMax-M3 claude --version` | `ANTHROPIC_MODEL=MiniMax-M3 claude --help` | binary 缺 / version 空 / help 无 stdout |
| 3 | **claude-glm** | `which claude` (同 binary) | `ANTHROPIC_MODEL=glm-5 claude --version` | `ANTHROPIC_MODEL=glm-5 claude --help` | 同上; 模型名随 GLM 版本迭代 |
| 4 | **cmd** | `which cmd` | `cmd --version` | `cmd -p "test"` | binary 缺 / version 空 / -p 无 stdout |
| 5 | **copilot** | `which copilot` | `copilot --version` | `copilot -p "test"` | binary 缺 / version 空 / -p 无 stdout; 月度配额见 `cron-copilot-reset.sh` |
| 6 | **Hermes** | (本会话响应 = 默认 OK) | `MiniMax-M3` | 本脚本正在执行 + `~/bin/dispatch-wave<NNNN>.sh` 存在 | dispatch 脚本缺 = WARN |
| 7 | **kiro-cli** | `which kiro-cli` | `kiro-cli --version` | `kiro-cli --help` | binary 缺 / version 空 / help 无 stdout |

**macOS timeout 兼容**: macOS 没有 coreutils `timeout` 命令, 脚本用
`perl -e 'alarm shift; exec @ARGV'` 做超时包装 (默认 15s).

---

## 2. 用法

### 2.1 手动跑

```sh
# 打印 5 字段表格 + 写 docs-coolie/probe/<date>-tool-probe.md
bash scripts/daily-tool-probe.sh --print

# JSON (供 notify / 下游消费)
bash scripts/daily-tool-probe.sh --json | jq .

# 看即将注册的 cron 行 (不真注册)
bash scripts/daily-tool-probe.sh --dry-run
```

### 2.2 注册 cron (idempotent)

```sh
bash scripts/daily-tool-probe.sh --register
```

会做两件事:

1. **建 wrapper** `/Users/mac/bin/daily-tool-probe.sh -> $REPO_ROOT/scripts/daily-tool-probe.sh` (如缺).
2. **追加 cron 行** `0 8 * * * /Users/mac/bin/daily-tool-probe.sh # wave277-tool-probe` (如缺, idempotent 跳过).

### 2.3 撤销 cron

```sh
bash scripts/daily-tool-probe.sh --unregister
```

**注**: macOS `crontab file` 命令偶尔挂起, 若卡住, 直接 `pkill -f crontab` 然后 `crontab -e` 手动删 `wave277-tool-probe` 行.

### 2.4 环境变量

| Env | 默认 | 用途 |
|---|---|---|
| `PROBE_TIMEOUT` | `15` | 每个工具探测超时 (秒) |
| `AGY_DOCKER_CONTAINER` | `agy-ubuntu-container` | agy 容器名 |
| `DAILY_PROBE_CMD` | `$HOME/bin/daily-tool-probe.sh` | cron 触发的命令 |

---

## 3. 输出格式

### 3.1 表格 (stdout)

```
═══ 工具池探测 (5 字段, wave277 老板原话 "每天早上把所有工具探测做一遍") ═══
工具          路径                                     版本                探测时间                  状态
----------------------------------------------------------------------------------------------
agy-gemini3.8   docker:agy-ubuntu-container (容器内 agy-gemin 1.2.14            2026-10-02 10:42:01 CST          OK
claude-mm       /opt/homebrew/bin/claude                   2.1.287 (Claude Code)  2026-10-02 10:42:01 CST          OK
claude-glm      /opt/homebrew/bin/claude                   2.1.287 (Claude Code)  2026-10-02 10:42:01 CST          OK
cmd             /opt/homebrew/bin/cmd                      1.73.4                2026-10-02 10:42:01 CST          OK
copilot         /opt/homebrew/bin/copilot                  GitHub Copilot CLI...  2026-10-02 10:42:01 CST          OK
Hermes          Hermes (PM 工具: kiro-cli; 本会话响应) MiniMax-M3              2026-10-02 10:42:01 CST          OK
kiro-cli        /Users/mac/.local/bin/kiro-cli             kiro-cli 2.22.0        2026-10-02 10:42:01 CST          OK
```

失败时额外在 stderr 输出修法建议:

```
⚠️  1 个工具状态非 OK, 见上方修法建议
  → 修法: docker start agy-ubuntu-container; 或 docker run -d --name agy-ubuntu-container chw717/ai-agy:latest-arm64
```

### 3.2 持久化报告

每次 `--print` 写到 `docs-coolie/probe/<YYYY-MM-DD>-tool-probe.md`:

```markdown
# 工具池探测 — 2026-10-02
... 5 字段表格 ...
## 2. 失败修法 (按工具)
...
## 3. 关联
- docs-coolie/TOOLS.md §2 7 工具池真值 (wave272)
- docs-coolie/DAILY-TOOL-PROBE.md 操作手册
- scripts/cron-team-status.sh (wave276 每 30 分钟团队状态)
- scripts/daily-tool-probe.sh (本脚本)
```

### 3.3 JSON (下游消费)

```json
{
  "timestamp": "2026-10-02T02:42:01Z",
  "source": "scripts/daily-tool-probe.sh",
  "wave": "wave277",
  "tools": [
    {"name": "agy-gemini3.8", "path": "...", "version": "1.2.14", "run": "OK", "status": "OK", "probed_at": "..."},
    ...
  ]
}
```

---

## 4. 与 wave276 整合

| Wave | 脚本 | Cron | 输出 | 用途 |
|---|---|---|---|---|
| wave276 | `scripts/cron-team-status.sh` | `*/30 * * * *` | stdout + /tmp | 每 30 分钟团队状态 (5 字段: 员工 / 任务 / 多长时间 / 工具 / 状态) |
| **wave277 (本)** | `scripts/daily-tool-probe.sh` | `0 8 * * *` | stdout + docs-coolie/probe/ | **每天早上工具可用性 (5 字段: 工具 / 路径 / 版本 / 探测时间 / 状态)** |

两条 cron 都推 weixin (老板本机 `~/bin/team-status-notify.sh` /
`~/bin/daily-tool-probe.sh`, 不入 git). wave276 推 "谁在跑", wave277
推 "7 工具能不能用".

---

## 5. 派活模板 (老板原话 wave277)

老板早上看 wave277 报告, 派活:

```
墨斗, 今天的 FDA 任务用 agy-gemini3.8 — 看 docs-coolie/probe/<今日>-tool-probe.md,
  7 工具都 OK, 派原型
```

或工具 down:

```
墨斗, agy 容器 down — 修法在 probe/<今日>-tool-probe.md §2: docker start ...
  修完后 cmd 兜底
```

---

## 6. 出处

- 老板原话: brief wave277 (2026-10-02)
  - "你每天早上把所有工具的使用探测做一遍"
- 上游依据:
  - `docs-coolie/TOOLS.md` §2 (wave272 拍板) — 7 工具池真值
  - `scripts/cron-team-status.sh` (wave276) — 同 5 字段风格 cron 注册 idiom

**本波 (wave277) 变更摘要**:
- 新增 `scripts/daily-tool-probe.sh` (探测 7 工具 + 5 字段表格 + 失败修法)
- 注册 cron `0 8 * * *` 每天 8:00 跑本脚本
- 新增 `docs-coolie/probe/<date>-tool-probe.md` 持久化报告目录
- 与 wave276 cron-team-status 平级 (5 字段风格, 每 30 分钟 vs 每天 8 点)
- macOS 兼容: perl alarm 替代 coreutils timeout; readlink -f 解 symlink
