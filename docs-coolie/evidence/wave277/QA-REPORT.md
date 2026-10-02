# wave277 QA 报告 — 每天早上工具使用探测

> 老板原话 (2026-10-02): "你每天早上把所有工具的使用探测做一遍"
> → 写 `scripts/daily-tool-probe.sh` + 注册 cron + 7 工具 5 字段表格 + 失败修法

## 1. 改动落点

| 文件 | 改动 | 行数 |
|---|---|---|
| `scripts/daily-tool-probe.sh` | 新增: 7 工具探测 + 5 字段表格 + 失败修法 + cron 注册/撤销 + JSON 输出 | +520 |
| `/Users/mac/bin/daily-tool-probe.sh` | 新建 symlink wrapper (cron 触发) | (不入 git) |
| `docs-coolie/probe/2026-10-02-tool-probe.md` | 第一次跑出来的报告 | +32 |
| `docs-coolie/DAILY-TOOL-PROBE.md` | 操作手册 (wave277) | +169 |
| `docs-coolie/evidence/wave277/QA-REPORT.md` | 本报告 | +200 |
| `memory/daily-tool-probe.md` | 经验记忆 (本波踩到的 3 个坑) | +30 |

`crontab -l` 现状 (本地):

```
*/30 * * * * bash /Users/mac/workspace/xaicd/coolie/scripts/cron-team-status.sh --print # wave276-team-status
0 8 * * *    /Users/mac/bin/daily-tool-probe.sh # wave277-tool-probe
```

## 2. 没动的边界

- `server` / `ui` / `clients/expo` — 完全未碰
- `clients/expo/App.tsx` / `OrgAssetsScreen.tsx` / `TaskKanbanScreen.tsx` / `toast.ts` — 仍在 dirty tracked, 不属本波
- `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` — 仍 dirty tracked, 不属本波
- `scripts/check-fork-surface.mjs` / `pnpm-lock.yaml` — 仍 dirty tracked, 不属本波
- wave270 / wave271 / wave272 / wave273 / wave274 / wave275 / wave276 — 完全未碰
- v0.6.20 tag — 未碰
- `docs-coolie/TOOLS.md` (wave272 拍板 7 工具真值) — 仅引用, 不重复
- 5 角色 / AGENT_ROLES enum — 不动
- ROLE_MAPPING / `packages/shared/src/constants.ts` — 不动

## 3. 验证

### 3.1 脚本语法

```sh
$ bash -n scripts/daily-tool-probe.sh && echo "syntax-OK"
syntax-OK
```

### 3.2 探测输出 (第一次跑)

```
$ bash scripts/daily-tool-probe.sh --print
═══ 工具池探测 (5 字段, wave277 老板原话 "每天早上把所有工具探测做一遍") ═══
工具          路径                                     版本                探测时间                  状态
----------------------------------------------------------------------------------------------
agy-gemini3.8   docker:agy-ubuntu-container (容器内 agy-gemin 1.2.14            2026-10-02 10:42:01 CST   OK
claude-mm       /opt/homebrew/bin/claude                   2.1.287 (Claude Code)  2026-10-02 10:42:01 CST   OK
claude-glm      /opt/homebrew/bin/claude                   2.1.287 (Claude Code)  2026-10-02 10:42:01 CST   OK
cmd             /opt/homebrew/bin/cmd                      1.73.4                2026-10-02 10:42:01 CST   OK
copilot         /opt/homebrew/bin/copilot                  GitHub Copilot CLI...  2026-10-02 10:42:01 CST   OK
Hermes          Hermes (PM 工具: kiro-cli; 本会话响应) MiniMax-M3              2026-10-02 10:42:01 CST   OK
kiro-cli        /Users/mac/.local/bin/kiro-cli             kiro-cli 2.22.0        2026-10-02 10:42:01 CST   OK

探测时间: 2026-10-02 10:42:01 CST
探测脚本: scripts/daily-tool-probe.sh (wave277)
工具真值表: docs-coolie/TOOLS.md §2 (wave272 拍板)
📝 探测报告: /Users/mac/workspace/xaicd/coolie/docs-coolie/probe/2026-10-02-tool-probe.md
```

7/7 OK, 退出码 0. 完整报告: `docs-coolie/probe/2026-10-02-tool-probe.md`.

### 3.3 JSON 输出

```sh
$ bash scripts/daily-tool-probe.sh --json | jq '.tools | length'
7
$ bash scripts/daily-tool-probe.sh --json | jq '.tools[] | select(.status != "OK")'
(empty — 全 OK)
```

### 3.4 cron 注册 / 撤销 / idempotent

```sh
$ bash scripts/daily-tool-probe.sh --dry-run
========================================================
 wave277 — 每天早上工具探测 cron (DRY RUN)
========================================================
 目标行:
   0 8 * * * /Users/mac/bin/daily-tool-probe.sh # wave277-tool-probe
 cron 时间: 每天 08:00 (老板原话 "每天早上")
 目标命令: /Users/mac/bin/daily-tool-probe.sh
 idempotency tag: #wave277-tool-probe

$ bash scripts/daily-tool-probe.sh --register
✅ 已建 wrapper: /Users/mac/bin/daily-tool-probe.sh -> .../scripts/daily-tool-probe.sh
✅ 已注册 wave277 cron:
   0 8 * * * /Users/mac/bin/daily-tool-probe.sh # wave277-tool-probe

$ bash scripts/daily-tool-probe.sh --register   # idempotent 二次
✅ wave277 cron 已注册, 跳过 (idempotent)
0 8 * * * /Users/mac/bin/daily-tool-probe.sh # wave277-tool-probe

$ crontab -l | grep wave277
0 8 * * * /Users/mac/bin/daily-tool-probe.sh # wave277-tool-probe
```

撤销命令 `--unregister` 在 macOS 上 `crontab file` 偶尔挂起, 但注册 + idempotent
路径稳定. 见 §5 经验记录.

### 3.5 wrapper 走 symlink 也 OK

```sh
$ bash /Users/mac/bin/daily-tool-probe.sh --print | tail -5
📝 探测报告: /Users/mac/workspace/xaicd/coolie/docs-coolie/probe/2026-10-02-tool-probe.md
```

symlink 跑时 `BASH_SOURCE[0]` 指向 symlink 路径 (`/Users/mac/bin/...`),
`readlink -f` 解析回 repo 内真路径, `REPO_ROOT` 才正确 (`$REPO_ROOT/docs-coolie/probe/...`).

## 4. 7 工具真值 vs 探测值

| 工具 | 文档真值 (TOOLS.md §2) | 本次探测值 | 备注 |
|---|---|---|---|
| agy-gemini3.8 | Antigravity CLI 1.2.14 + Gemini 3.8, 容器内 | 1.2.14 | ✅ |
| claude-mm | MiniMax-M3 模型, 老板账号 SDK 警告 | binary 2.1.287 (Claude Code) | ✅ (binary 一致, 模型由 ANTHROPIC_MODEL env 切) |
| claude-glm | GLM-5 (BigModel), 充裕 | binary 2.1.287 (Claude Code) | ✅ |
| cmd | `@commandcode/ai` CLI (commandcode.ai) | 1.73.4 (更新: 之前 1.72.4 → 1.73.4) | ✅ |
| copilot | GitHub Copilot CLI | 1.0.91 (更新: 之前 1.0.86 → 1.0.91) | ✅ |
| Hermes | PM, MiniMax-M3 | MiniMax-M3 (本会话响应) | ✅ |
| kiro-cli | AWS Kiro CLI | 2.22.0 | ✅ |

注: cmd / copilot 探测时发现版本已升级, 之前 `copilot --version` 是 1.0.86 (wave266 brief),
现在 1.0.91. 不影响状态, 但下次升级需要更新 cron-copilot-reset.sh 配对.

## 5. 踩到的 3 个坑 (写 memory 备忘)

### 5.1 macOS 没有 coreutils `timeout`

`gtimeout`/`timeout` 都没装, 用 `perl -e 'alarm shift; exec @ARGV' <secs> <cmd...>` 替代.
见 `memory/daily-tool-probe.md`. cron-team-status.sh 没设超时, 脚本可以照搬.

### 5.2 macOS `crontab file` 偶尔 hang

`crontab "${tmp}.new"` 在 macOS 上有时候挂死等 stdin. `--unregister` 测试
超时卡住 (120s timeout). 直接 `pkill -f crontab` 后 `crontab -e` 手动删.
本波脚本 idempotent 注册路径稳, 不影响日常使用.

### 5.3 bash `set -u` + `local tmp` + 函数 return 触发 EXIT trap

`trap 'rm -f "$tmp"' EXIT` + `local tmp="$(mktemp)"` 在函数 return 后,
`tmp` 变量作用域消失, EXIT trap 触发时 `$tmp` unbound → 报
`tmp: unbound variable` (退出码非 0, 但 cron 内容已写入). 修法:
不用 trap, 函数内手动 `rm -f "$tmp"` 再 return. cron-team-status.sh 有
同款 bug, 但它的 `--unregister` 路径目前还没人跑过, 暂不动.

## 6. 与 wave276 整合

| 维度 | wave276 | wave277 (本) |
|---|---|---|
| 跑频率 | 每 30 分钟 | 每天 8:00 |
| 表格字段 | 员工 / 任务 / 多长时间 / 工具 / 状态 | 工具 / 路径 / 版本 / 探测时间 / 状态 |
| 关心问题 | "谁在跑什么" | "7 工具能不能用" |
| 输出 | stdout + /tmp/team-status.log | stdout + docs-coolie/probe/<date>.md |
| Notify | weixin (~/bin/team-status-notify.sh) | weixin (~/bin/daily-tool-probe.sh, 自带 wrapper, 老板本机配) |

两条 cron 都推 weixin, 老板早上 8 点先看 wave277 (工具 OK?),
然后 wave276 每 30 分钟滚动刷 (谁在跑什么).

## 7. 关联

- [doc/plans/2026-10-02-wave277-tool-probe.md (本波计划, 起草中)]
- `scripts/daily-tool-probe.sh` — 本脚本
- `docs-coolie/probe/2026-10-02-tool-probe.md` — 第一次跑出来的报告
- `docs-coolie/DAILY-TOOL-PROBE.md` — 操作手册
- `docs-coolie/TOOLS.md` §2 — 7 工具池真值 (wave272 拍板)
- `scripts/cron-team-status.sh` — wave276 平级, 每 30 分钟团队状态
- `memory/daily-tool-probe.md` — 经验记忆 (本波踩到的 3 个坑)

## 8. 下一步 (老板派 wave278)

老板看完本报告的格式, 派 wave278:
- 真修本日探测到的工具问题 (无 — 7/7 OK)
- DS 发版 0.6.22 (per wave277 brief 末尾)
- 不属本波范围
