# 工具池探测 — 2026-10-17

> wave279 — 改真跑 OK 探测 (老板原话: "工具探测得工具对方有回复 ok
> 才行"). 探测方式 = 真跑 `-p '回复 OK'`, 响应含 ok/OK/ready
> 才算 OK; 超时 30s = FAIL. 替换 wave277 静态 --version.
> 真值表见 [docs-coolie/TOOLS.md](../TOOLS.md) §2.

- 探测时间: `2026-10-17 08:07:04 CST`
- 探测脚本: `scripts/daily-tool-probe.sh` (wave279)
- 探测方式: 真跑 `-p '回复 OK'`
- 超时: 30s/工具; 性能 OK 阈值: <5s

## 1. 5 字段表格

| 工具 | 路径 | 真跑探测 | 响应时间 | 响应结果 | 状态 |
|---|---|---|---|---|---|
| agy-gemini3.8 | `docker:agy-ubuntu-container (容器内 agy-gemini3.8)` | `docker exec agy-ubuntu-container agy -p '回复 OK'` | 16s | OK OK | **OK** |
| claude-mm | `/opt/homebrew/bin/claude` | `claude --settings ~/.claude/settings.jsonmm -p '回复 OK'` | 5s | OK [claude-code:unrecognized_model] {"model | **OK** |
| claude-glm | `/opt/homebrew/bin/claude` | `claude --settings ~/.claude/settings.jsonglm -p '回复 OK'` | 9s | OK [claude-code:unrecognized_model] {"model | **OK** |
| cmd | `/opt/homebrew/bin/cmd` | `cmd -p '回复 OK'` | 4s | FAIL Error: Command Code 额度不足。 | **FAIL** |
| copilot | `/opt/homebrew/bin/copilot` | `copilot -p '回复 OK'` | 2s | FAIL Error: No authentication information fou | **FAIL** |
| Hermes | `Hermes (PM 主调度中枢, 人即工具)` | `调度脚本 (dispatch-local-employee.sh)` | <1s | OK Hermes 调度中枢在线 | **OK** |

## 2. 失败修法 (按工具)

### cmd → FAIL

- 路径: `/opt/homebrew/bin/cmd`
- 真跑探测: `cmd -p '回复 OK'`
- 响应时间: 4s
- 响应结果: FAIL Error: Command Code 额度不足。
  → 修法: npm i -g @commandcode/ai 或重装 /opt/homebrew/bin/cmd

### copilot → FAIL

- 路径: `/opt/homebrew/bin/copilot`
- 真跑探测: `copilot -p '回复 OK'`
- 响应时间: 2s
- 响应结果: FAIL Error: No authentication information fou
  → 修法: brew install copilot-cli 或 npm i -g @github/copilot; 月度配额跑 scripts/cron-copilot-reset.sh

## 3. 关联

- [docs-coolie/TOOLS.md](../TOOLS.md) §2 7 工具池真值 (wave272)
- [docs-coolie/DAILY-TOOL-PROBE.md](../DAILY-TOOL-PROBE.md) 操作手册 (wave279 真跑说明)
- `scripts/cron-team-status.sh --probe` (wave279 新增真跑探测子命令)
- `scripts/daily-tool-probe.sh` (本脚本)
