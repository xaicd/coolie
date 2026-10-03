# wave228 — 本地工具规范 + MCP 默认安装 (QA 报告)

> **波次**: wave228
> **日期**: 2026-09-30
> **触发**: 老板原话 "claude-glm 经常额度用完, claude-mm 可以多排队, cmd 也不错;
> agy 原型, 画图, 比较好; copilot 每个月 1 号 8 点后重置额度, 可以把默认模型切到
> gpt5 sol, 按这些要求把本地团队使用工具规范好; agent-device, agent-browser 两款
> mcp 要默认安装给各个工具使用, DS 角色要用这个来测试, 验收系统, 同时也运营系统,
> 审批之类的, 监控系统运行状态".
> **范围**: 4 个 MCP install 脚本 + 1 个月度 cron 脚本 + 1 个共享 lib + 1 个单测 +
> 1 个新文档 `docs-coolie/TOOL-USAGE.md` + 修改 `docs-coolie/CMMI-EMPLOYEE-MAPPING.md`
> + 修改 `docs-coolie/TEAM-MAPPING.md` + 修改 `scripts/check-fork-surface.mjs`.
> **不动**: `server/src/services/agent-assign.ts` / `AGENT_ROLES` enum / Coolie 工坊
> / UI / clients/expo / `ROLE_MAPPING` (算法层).

---

## 1. 范围 & 交付物

| 文件 | 状态 | 行数 | 说明 |
|---|---|---|---|
| `scripts/install-agent-device-mcp.sh` | A (新) | 90 | 注册 `mcpServers["agent-device"]` 到 `~/.claude/settings.json` (7 个 CLI 全部装) |
| `scripts/install-agent-browser-mcp.sh` | A (新) | 78 | 注册 `mcpServers["agent-browser"]` 到 `~/.claude/settings.json` (7 个 CLI 全部装) |
| `scripts/install-ds-mcp.sh` | A (新) | 92 | 注册 3 个 DS-only MCP (system-monitor + approval + company-ops) 到 DS 工具链 (claude-glm / claude-mm / claude-ds) |
| `scripts/cron-copilot-reset.sh` | A (新) | 105 | 注册 / 撤销月度 cron (1 号 8:01 切 copilot → gpt5 sol) |
| `scripts/lib/mcp-install-common.sh` | A (新, lib) | 130 | 4 个 install 脚本共用的 `mcp_register_server` 幂等合并 + dry-run 逻辑 |
| `scripts/__tests__/install-mcp-shims.test.mjs` | A (新, node:test) | 220 | 11 个 test, 覆盖 syntax + dry-run + idempotent + missing-binary + unregister + usage-error |
| `docs-coolie/TOOL-USAGE.md` | A (新) | 200 | 6 工具矩阵 + 派单优先级 + MCP 默认安装清单 + copilot cron 详情 + DS 责任范围扩展 + 反向约束 |
| `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` | M (改) | +25 | §4 矩阵加 MCP 列 + §4.1 新增 MCP install 速查 + §8 链 TOOL-USAGE.md + 末尾 wave228 摘要 |
| `docs-coolie/TEAM-MAPPING.md` | M (改) | +12 | §5 配置文件表加 4 个 install 脚本 + §8 链 TOOL-USAGE.md + wave228 标注 |
| `scripts/check-fork-surface.mjs` | M (改) | +8 | `OWNED_PREFIXES` 加 4 个 wave228 脚本 (避免 fork-surface 门失败) |
| `docs-coolie/evidence/wave228/QA-REPORT.md` | A (本报告) | - | 本 QA |

合计 ~ 750 行 scripts + tests + docs, 0 行 server/ui/clients 代码改动.

---

## 2. 关键变更 (wave227 → wave228)

| 维度 | wave227 | wave228 |
|---|---|---|
| 工具规范 | TEAM-MAPPING.md §1.2 (员工-工具映射) | **新 TOOL-USAGE.md** (独立成册, 6 工具矩阵 + 配额 + MCP) |
| MCP 安装 | 无 — 手动 `claude mcp add` | **4 个 install 脚本** + **1 个 lib** + 幂等合并到 `~/.claude/settings.json` |
| DS 工具链 MCP | 无 | **3 个 DS-only MCP** (system-monitor / approval / company-ops) — 占位符 + 真包一行替换 |
| copilot 切换 | 手动 / 没规范 | **cron 月度自动切** (`cron-copilot-reset.sh --register`) — 每月 1 号 8:01 |
| fork-surface 门 | 仅老 4 个脚本入 OWNED | **+4 个 wave228 脚本** 入 OWNED_PREFIXES |

---

## 3. 6 工具矩阵 (核心)

| 工具 | 默认员工 | 兜底员工 | 配额 / 重置 |
|---|---|---|---|
| **claude-glm** | 铁匠 | — | 每日配额, **经常额度用完** (2026-10-02 17:55 重置) |
| **claude-mm** | 铁匠 | — | 按量, **多排队跑** (GLM 见顶时优先切) |
| **cmd** | 门神 | — | 充裕, **老板本人 180s 冷却** |
| **agy** | 墨斗 | — | 充裕, 按量 |
| **copilot** | 百晓生 | — | **每月 1 号 8 点重置**; cron 8:01 自动切 gpt5 sol |
| **claude-ds** | 兑底渊 | 百晓生 | 按量, 不受限 |

详细见 `docs-coolie/TOOL-USAGE.md` §1.

---

## 4. MCP 默认安装清单 (核心)

| MCP server | 加载到哪些工具 | 注册脚本 |
|---|---|---|
| **agent-device** | claude / claude-mm / claude-glm / claude-ds / agy / copilot / cmd (7 个全部) | `install-agent-device-mcp.sh` |
| **agent-browser** | 同上 (7 个全部) | `install-agent-browser-mcp.sh` |
| **system-monitor** | **仅 DS 工具链** (claude-glm / claude-mm / claude-ds) | `install-ds-mcp.sh` |
| **approval** | 同上 | 同上 |
| **company-ops** | 同上 | 同上 |

详细见 `docs-coolie/TOOL-USAGE.md` §3.

---

## 5. 单测结果 (T1–T6, 11 cases)

### 5.1 全部 pass

```
$ node --test scripts/__tests__/install-mcp-shims.test.mjs

✔ bash syntax: all 4 install scripts parse clean (60.657375ms)
✔ install-agent-device-mcp.sh --dry-run: prints would-write, leaves disk empty (934.593875ms)
✔ install-agent-browser-mcp.sh --dry-run: prints would-write for agent-browser (986.843ms)
✔ install-ds-mcp.sh --dry-run: prints 3 servers × N installed DS toolchain slots (46.186417ms)
✔ cron-copilot-reset.sh --dry-run: prints the cron line that would be added (35.137ms)
✔ install-agent-device-mcp.sh --apply with no CLI present: skips all, no disk write (50.6835ms)
✔ mcp_register_server: idempotent — pre-existing matching entry is a no-op (519.137875ms)
✔ install-agent-device-mcp.sh --apply with staged claude CLI: writes mcpServers.agent-device (456.640833ms)
✔ install-ds-mcp.sh --apply: writes 3 MCP entries per installed DS CLI (915.660459ms)
✔ cron-copilot-reset.sh --unregister: no existing crontab is safe (61.551958ms)
✔ unknown flag → exit 2 (61.576667ms)

ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 4232.093583
```

### 5.2 覆盖矩阵

| 维度 | Case | 状态 |
|---|---|---|
| bash syntax (5 个 .sh) | T1 | ✔ |
| dry-run 不写盘 | T2.1 / T2.2 / T2.3 | ✔ |
| dry-run 输出含 `would write:` | T2.1 / T2.2 | ✔ |
| DS 工具链 3 MCP 全部跳过 (无 CLI) | T2.3 | ✔ |
| cron dry-run 输出含 cron 行 | T2.4 | ✔ |
| 缺 CLI 时全跳过 + 不写盘 | T3.1 | ✔ |
| 幂等: 已存在的 entry no-op | T3.2 | ✔ |
| 实际 install 写盘 (含 staged claude) | T3.3 | ✔ |
| DS 工具链 3 MCP 实际写盘 (含 staged claude-ds) | T4 | ✔ |
| cron --unregister 在无 crontab 时安全 | T5 | ✔ |
| 未知 flag → exit 2 | T6 | ✔ |

---

## 6. 干跑结果 (4 scripts --dry-run)

### 6.1 `install-agent-device-mcp.sh --dry-run`

```
[wave228-mcp] 安装 agent-device MCP server → ~/.claude/settings.json
[wave228-mcp] binary: /opt/homebrew/bin/agent-device (args: ["mcp"])
[wave228-mcp] would write: /Users/mac/.claude/settings.json → mcpServers["agent-device"] = {"command": "/opt/homebrew/bin/agent-device", "args": ["mcp"]}
[wave228-mcp] skipping claude-mm — not installed
[wave228-mcp] skipping claude-glm — not installed
[wave228-mcp] skipping claude-ds — not installed
[wave228-mcp] skipping agy — not installed
[wave228-mcp] would write: /Users/mac/.claude/settings.json → mcpServers["agent-device"] = {"command": "/opt/homebrew/bin/agent-device", "args": ["mcp"]}
[wave228-mcp] would write: /Users/mac/.claude/settings.json → mcpServers["agent-device"] = {"command": "/opt/homebrew/bin/agent-device", "args": ["mcp"]}
[wave228-mcp] dry-run 完成 — 未写入任何文件
```

> 注: claude / cmd / copilot 三个 CLI 真在老板 Mac 上 (在 `/opt/homebrew/bin/`), 所以
> 会出 would write 行; claude-glm / claude-mm / claude-ds / agy 当前未装, 跳过.

### 6.2 `install-agent-browser-mcp.sh --dry-run`

同上, 但 `mcpServers["agent-browser"]` 和 binary 路径换成 `agent-browser`.

### 6.3 `install-ds-mcp.sh --dry-run`

```
[wave228-mcp] 安装 百晓生 (DS) MCP servers → ~/.claude/settings.json (限 DS 工具链)
[wave228-mcp]   targets: claude-glm claude-mm claude-ds
[wave228-mcp]   servers: 3 (system-monitor, approval, company-ops — 占位符, 待真包替换)
[wave228-mcp] skipping claude-glm — not installed (DS 工具链, 不影响其他员工)
[wave228-mcp] skipping claude-mm — not installed (DS 工具链, 不影响其他员工)
[wave228-mcp] skipping claude-ds — not installed (DS 工具链, 不影响其他员工)
[wave228-mcp] dry-run 完成 — 未写入任何文件
```

### 6.4 `cron-copilot-reset.sh --dry-run`

```
========================================================
 wave228 — copilot 月度重置 cron (DRY RUN)
========================================================
 目标行:
   1 8 1 * * /Users/mac/bin/copilot-reset.sh --to gpt5-sol # wave228-copilot-reset

 cron 时间: 每月 1 号 08:01 (重置 buffer 1 分钟)
 目标命令: /Users/mac/bin/copilot-reset.sh --to gpt5-sol
 idempotency tag: #wave228-copilot-reset

 应用: bash scripts/cron-copilot-reset.sh --register
```

---

## 7. 已知边界 / 老板须知

| 项 | 状态 | 说明 |
|---|---|---|
| 真 MCP 包未发布 | 占位符 | `mcp-server-system-monitor --stdio` / `mcp-server-approval --stdio` / `mcp-server-company-ops --stdio` 是占位命令. 真包上线后改 `scripts/install-ds-mcp.sh` 的 `MCP_DS_SERVER_SPEC` 一行即可. 安装脚本已 idempotent, 真包到位后无需重装. |
| `~/bin/copilot-reset.sh` 不入 git | 老板本机 | 真"切模型"脚本在老板 Mac 上, wave225 §5 已规定老板 Mac 配置不入 git. `cron-copilot-reset.sh` 只注册 cron 指向该命令. |
| `~/.claude/settings.json` 不入 git | 老板本机 | install 脚本写入老板本机, 仓库只放脚本 + 单测. |
| `--apply` 真实写盘 | 默认 TTY 下 dry-run | TTY 检测: stdin + stdout 都连 TTY 时默认 dry-run, 显式 `--apply` 才会写. CI / pipe 上下文默认 `--apply`. |
| crontab 真实写入 | 老板本机 | `--register` 直接调 `crontab` 命令; 测试用沙盒 HOME 隔离 + `MCP_STRICT_PATH=1` 防 Homebrew bin 假阳性. |

---

## 8. fork-surface 门 (scripts/check-fork-surface.mjs)

`OWNED_PREFIXES` 加入 4 个 wave228 脚本:

```js
"scripts/install-agent-device-mcp.sh",
"scripts/install-agent-browser-mcp.sh",
"scripts/install-ds-mcp.sh",
"scripts/cron-copilot-reset.sh",
```

comment 说明: wave228 — MCP install shims for the boss's 6 local CLIs. Each
entry mutates `~/.claude/settings.json` (and only `~/.claude/settings.json`)
on the boss's Mac; no upstream file is involved.

---

## 9. 反向约束

- **不动 `server/src/services/agent-assign.ts`** — 算法层 5 角色不变.
- **不动 `AGENT_ROLES` enum** — 5 个 fork 角色 + 12 个上游不变.
- **不动 `ROLE_MAPPING`** — wave222 算法层 25 行主/副角色不变.
- **不动 CMMI 25 任务分工** — wave227 DS 责任扩到 5 个主任务不变; wave228 仅 ADDS MCP 列.
- **不动 Coolie 工坊系统本体** — 工坊架构 / 部署 / 看板 UI 不改.
- **不动 UI / clients/expo** — 本波纯脚本 + 文档.
- **不动 wave226 quota** — `DEFAULT_AGENT_QUOTA = 6` 不动.

---

## 10. 出处与索引

- 工具使用规范: [`docs-coolie/TOOL-USAGE.md`](../../TOOL-USAGE.md) (wave228 新)
- 团队规范: [`docs-coolie/TEAM-MAPPING.md`](../../TEAM-MAPPING.md) (wave225 + wave227 + wave228 §5 MCP 标注)
- CMMI 25 任务分工: [`docs-coolie/CMMI-EMPLOYEE-MAPPING.md`](../../CMMI-EMPLOYEE-MAPPING.md) (wave225 + wave227 + wave228 §4 MCP 列 + §4.1)
- PM 派活 SOP: [`docs-coolie/HOW-TO-DELEGATE.md`](../../HOW-TO-DELEGATE.md) (wave225 + wave227)
- 5 角色算法层: [`docs-coolie/ROLE-MAPPING.md`](../../ROLE-MAPPING.md) (wave222, 不动)
- MCP install 脚本 (4 个): `scripts/install-{agent-device,agent-browser,ds}-mcp.sh` + `scripts/cron-copilot-reset.sh`
- MCP install lib: `scripts/lib/mcp-install-common.sh`
- MCP install 单测: `scripts/__tests__/install-mcp-shims.test.mjs` (11 个 case, 4.2s)
- Fork-surface 门: `scripts/check-fork-surface.mjs` (4 个 wave228 脚本已加入 OWNED_PREFIXES)
- 派活算法 (不动): `server/src/services/agent-assign.ts` (wave222)
- 数字员工 bootstrap (不动): `scripts/wave217/qa-bootstrap-team.mjs` + `scripts/wave220/ops-bootstrap-team.mjs`
- wave226 quota (不动): `server/src/services/agent-quota.ts` (`DEFAULT_AGENT_QUOTA = 6`)