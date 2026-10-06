# 每天早上工具使用探测 (wave277 + wave279 真跑 OK)

> **目的**: 把老板"每天早上把所有工具的使用探测做一遍"派活模板固化.
> 每天 8:00 cron 跑 `scripts/daily-tool-probe.sh`, 出 5 字段表格 (工具 /
> 路径 / 真跑探测 / 响应时间 / 状态), 失败时给修法, 写到
> `docs-coolie/probe/<YYYY-MM-DD>-tool-probe.md`.
>
> **Why**: 老板原话 (wave277, 2026-10-02):
>
> > "你每天早上把所有工具的使用探测做一遍"
>
> wave279 (2026-10-02) 老板反讲:
>
> > "工具探测得工具对方有回复 ok 才行"
>
> 之前探测 (wave277) 用 `--version` 静态验 — boss 说不行: binary 在 PATH
> 不代表真能跑 (RPC/认证/网络/quota 都可能坏). 改 wave279 **真跑 + 真回
> 复 OK**:
>
> - 真跑 = 跑 `-p '回复 OK'` 真提问, 等工具真回应
> - 真回复 OK = 输出含 `ok` / `OK` / `ready` (大小写不敏感)
> - 响应时间记录 (默认 30s 超时, <5s 标 "<5s" 快)
>
> 派活前先知道哪个工具能用. 之前每次手动 which + 试跑 7 个工具 ≈ 2 分钟,
> 现在 1 条 cron + 1 份报告.
>
> **不动**:
> - `server` / `ui` / `clients/expo` — 不动
> - wave270 / wave271 / wave272 / wave273 / wave274 / wave275 / wave276 / wave277 / wave278 — 不动
> - v0.6.20 / v0.6.21 tag — 不动
> - 5 角色 / AGENT_ROLES enum — 不动
> - `docs-coolie/TOOLS.md` §2 (wave272 拍板) — 本表引用其真值, 不重复
> - `scripts/cron-team-status.sh` (wave276) — 仅扩 `--probe` 子命令
> - `docs-coolie/PM-REPORTING-FORMAT.md` — 仅加 wave279 真跑说明

---

## 0. 文档约定

- **7 工具池** — 详见 `TOOLS.md` §2: agy-gemini3.8 / claude-mm /
  claude-glm / cmd / copilot / Hermes / kiro-cli. 本表 §1 列出每工具探测
  规则.
- **5 字段表格** — boss 硬规矩: 工具 / 路径 / 真跑探测 / 响应时间 / 状态
  (wave279 改: 真跑探测 = `-p '回复 OK'` 命令, 响应时间 = 秒数 / `<5s`).
- **失败修法** — 每个工具失败时, 表格下给 1 条具体修法 (例: docker start
  / brew install), 不让老板明天再来回问.

---

## 1. 7 工具真跑 OK 探测规则 (wave279)

| # | 工具 | 路径检查 | 真跑探测命令 | 解析规则 | 失败判定 |
|---|---|---|---|---|---|
| 1 | **agy-gemini3.8** | `docker inspect agy-ubuntu-container` State.Running | `docker exec ... agy -p '回复 OK'` | 输出含 ok/OK/ready → OK | 容器未运行 / 30s 超时 / 输出不含 ok → FAIL |
| 2 | **claude-mm** | `which claude` | `ANTHROPIC_MODEL=MiniMax-M3 claude -p '回复 OK'` | 同上 | binary 缺 / 30s 超时 / 输出不含 ok → FAIL |
| 3 | **claude-glm** | `which claude` (同 binary) | `ANTHROPIC_MODEL=glm-5 claude -p '回复 OK'` | 同上 | 同上; 模型名随 GLM 版本迭代 |
| 4 | **cmd** | `which cmd` | `cmd -p '回复 OK'` | 同上 | binary 缺 / 30s 超时 / 输出不含 ok → FAIL |
| 5 | **copilot** | `which copilot` | `copilot -p '回复 OK'` | 同上 | binary 缺 / 30s 超时 / 输出不含 ok → FAIL; 月度配额见 `cron-copilot-reset.sh` |
| 6 | **Hermes** | (本会话响应 = 默认 OK) | `5 字段汇报 (cron-team-status.sh)` | 本脚本执行 + `~/bin/dispatch-wave277.sh` 存在 = OK | dispatch 脚本缺 = WARN |
| 7 | **kiro-cli** | `which kiro-cli` | `kiro-cli -p '回复 OK'` | 同上 | binary 缺 / 30s 超时 / 输出不含 ok → FAIL (注: kiro-cli 2.x 默认 interactive, `-p` 可能返回 `unexpected argument`, 真值反映此) |

**macOS timeout 兼容**: macOS 没有 coreutils `timeout` 命令, 脚本用
`perl -e 'alarm shift; exec @ARGV'` 做超时包装 (默认 30s, wave279).

---

## 2. 用法

### 2.1 手动跑

```sh
# 打印 5 字段表格 + 写 docs-coolie/probe/<date>-tool-probe.md
bash scripts/daily-tool-probe.sh --print

# JSON (供 notify / 下游消费)
bash scripts/daily-tool-probe.sh --json

# 看即将注册的 cron 行 (不真注册)
bash scripts/daily-tool-probe.sh --dry-run
```

### 2.2 注册 cron (idempotent)

```sh
bash scripts/daily-tool-probe.sh --register
```

会做两件事:

1. **建 wrapper** `~/bin/daily-tool-probe.sh -> $REPO_ROOT/scripts/daily-tool-probe.sh` (如缺).
2. **追加 cron 行** `0 8 * * * $HOME/bin/daily-tool-probe.sh # wave277-tool-probe` (如缺, idempotent 跳过).

### 2.3 撤销 cron

```sh
bash scripts/daily-tool-probe.sh --unregister
```

**注**: macOS `crontab file` 命令偶尔挂起, 若卡住, 直接 `pkill -f crontab` 然后 `crontab -e` 手动删 `wave277-tool-probe` 行.

### 2.4 真跑 OK 探测子命令 (via cron-team-status, wave279)

```sh
# 转调 daily-tool-probe.sh 真跑; 不动 wave276 cron-team-status 主体
bash scripts/cron-team-status.sh --probe
```

子命令 `--probe` = wave279 加的, 不改 wave276 cron-team-status 主体的
`--print` / `--json` / `--dry-run` / `--register` / `--unregister`. 失败
自动告警 (返回非 0 + 输出到 stderr).

### 2.5 环境变量

| Env | 默认 | 用途 |
|---|---|---|
| `PROBE_TIMEOUT` | `30` | 每个工具真跑超时 (秒, wave279) |
| `PROBE_FAST_SECS` | `5` | 性能 OK 阈值 (秒内返回 = 快, 标 `<5s`) |
| `PROBE_PROMPT` | `回复 OK` | 真跑 prompt (boss 原话) |
| `AGY_DOCKER_CONTAINER` | `agy-ubuntu-container` | agy 容器名 |
| `DAILY_PROBE_CMD` | `$HOME/bin/daily-tool-probe.sh` | cron 触发的命令 |

---

## 3. 输出格式

### 3.1 表格 (stdout)

```
═══ 工具池探测 (5 字段, wave279 老板原话 "工具探测得工具对方有回复 ok 才行") ═══
工具          路径                                      真跑探测                                       响应时间 响应结果                 状态
--------------------------------------------------------------------------------------------------------------------------------------
agy-gemini3.8   docker:agy-ubuntu-container (容器内 agy- docker exec agy-ubuntu-container agy -p '回复 OK' 12s   OK OK                          OK
claude-mm       /opt/homebrew/bin/claude                ANTHROPIC_MODEL=MiniMax-M3 claude -p '回复 OK'    4s    OK [claude-code:unrecognized_ OK
claude-glm      /opt/homebrew/bin/claude                ANTHROPIC_MODEL=glm-5 claude -p '回复 OK'         4s    OK [claude-code:unrecognized_ OK
cmd             /opt/homebrew/bin/cmd                   cmd -p '回复 OK'                                   4s    OK OK                          OK
copilot         /opt/homebrew/bin/copilot               copilot -p '回复 OK'                                11s  OK OK                          OK
Hermes          Hermes (PM 工具: Hermes 自己; 本会话响应) 5 字段汇报 (cron-team-status.sh)                   <1s  OK Hermes 响应 + dispatch-wav OK
kiro-cli        ~/.local/bin/kiro-cli          kiro-cli -p '回复 OK'                               0s    FAIL error: unexpected argumen FAIL
  → 修法: 检查 ~/.local/bin/ 或 PATH 路径; 重新安装工具
```

失败时额外在 stderr 输出修法建议:

```
⚠️  1 个工具状态非 OK, 见上方修法建议
  → 修法: 检查 ~/.local/bin/ 或 PATH 路径; 重新安装工具
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
- scripts/daily-tool-probe.sh (本脚本, wave279 真跑探测)
```

### 3.3 JSON (下游消费)

```json
{
  "timestamp": "2026-10-02T03:52:00Z",
  "source": "scripts/daily-tool-probe.sh",
  "wave": "wave279",
  "probe_mode": "real_run_ok",
  "prompt": "回复 OK",
  "timeout_seconds": 30,
  "fast_seconds": 5,
  "tools": [
    {"name": "agy-gemini3.8", "path": "...", "run_probe": "docker exec agy-ubuntu-container agy -p '回复 OK'", "run_seconds": "12s", "run_result": "OK OK", "status": "OK"},
    ...
  ]
}
```

---

## 4. 与 wave276 整合

| Wave | 脚本 | Cron | 输出 | 用途 |
|---|---|---|---|---|
| wave276 | `scripts/cron-team-status.sh` | `*/30 * * * *` | stdout + /tmp | 每 30 分钟团队状态 (5 字段: 员工 / 任务 / 多长时间 / 工具 / 状态) |
| **wave277** | `scripts/daily-tool-probe.sh` | `0 8 * * *` | stdout + docs-coolie/probe/ | 每天早上工具可用性 (5 字段: 工具 / 路径 / 真跑探测 / 响应时间 / 状态) |
| **wave279 (本)** | `scripts/daily-tool-probe.sh --print` (真跑 OK) | (同 wave277 cron 调) | 同上, 探测方式改 | 真跑 OK 探测 (替换 wave277 静态 --version) |
| **wave279** | `scripts/cron-team-status.sh --probe` | (手动, 不注册 cron) | 转调 daily-tool-probe | 团队状态下加真跑子命令 |

两条 cron 都推 weixin (老板本机 `~/bin/team-status-notify.sh` /
`~/bin/daily-tool-probe.sh`, 不入 git). wave276 推 "谁在跑", wave277 推
"7 工具能不能真跑 OK".

---

## 5. 派活模板 (老板原话 wave277 + wave279)

老板早上看 wave277 + wave279 报告, 派活:

```
墨斗, 今天的 FDA 任务用 agy-gemini3.8 — 看 docs-coolie/probe/<今日>-tool-probe.md,
  7 工具都真跑 OK, 派原型
```

或工具 down:

```
墨斗, agy 容器 down — 修法在 probe/<今日>-tool-probe.md §2: docker start ...
  修完后 cmd 兜底
```

---

## 6. 出处

- 老板原话 (wave277, 2026-10-02): "你每天早上把所有工具的使用探测做一遍"
- 老板原话 (wave279, 2026-10-02): "工具探测得工具对方有回复 ok 才行"
- 上游依据:
  - `docs-coolie/TOOLS.md` §2 (wave272 拍板) — 7 工具池真值
  - `scripts/cron-team-status.sh` (wave276) — 同 5 字段风格 cron 注册 idiom

**本波 (wave277) 变更摘要**:
- 新增 `scripts/daily-tool-probe.sh` (探测 7 工具 + 5 字段表格 + 失败修法)
- 注册 cron `0 8 * * *` 每天 8:00 跑本脚本
- 新增 `docs-coolie/probe/<date>-tool-probe.md` 持久化报告目录
- 与 wave276 cron-team-status 平级 (5 字段风格, 每 30 分钟 vs 每天 8 点)
- macOS 兼容: perl alarm 替代 coreutils timeout; readlink -f 解 symlink

**本波 (wave279) 变更摘要**:
- 改探测方式: `--version` + `-p "test"` 静态 → `-p '回复 OK'` 真跑真答
- 解析: 输出含 `ok`/`OK`/`ready` (大小写不敏感) → 状态 OK
- 响应时间记录 (默认 30s 超时, <5s 标 "<5s")
- `scripts/cron-team-status.sh` 扩 `--probe` 子命令 (不动主体, 转调本脚本)
- macOS perl alarm 在 sub-shell 隔离 (BASH_XTRACEFD=-1) 防 trace 污染
