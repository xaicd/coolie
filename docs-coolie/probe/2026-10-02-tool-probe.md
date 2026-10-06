# 工具池探测 — 2026-10-02

> wave279 — 改真跑 OK 探测 (老板原话: "工具探测得工具对方有回复 ok
> 才行"). 探测方式 = 真跑 `-p '回复 OK'`, 响应含 ok/OK/ready
> 才算 OK; 超时 30s = FAIL. 替换 wave277 静态 --version.
> 真值表见 [docs-coolie/TOOLS.md](../TOOLS.md) §2.

- 探测时间: `2026-10-02 12:04:05 CST`
- 探测脚本: `scripts/daily-tool-probe.sh` (wave279)
- 探测方式: 真跑 `-p '回复 OK'`
- 超时: 30s/工具; 性能 OK 阈值: <5s

## 1. 5 字段表格

| 工具 | 路径 | 真跑探测 | 响应时间 | 响应结果 | 状态 |
|---|---|---|---|---|---|
| agy-gemini3.8 | `docker:agy-ubuntu-container (容器内 agy-gemini3.8)` | `docker exec agy-ubuntu-container agy -p '回复 OK'` | 14s | OK OK | **OK** |
| claude-mm | `/opt/homebrew/bin/claude` | `ANTHROPIC_MODEL=MiniMax-M3 claude -p '回复 OK'` | 17s | OK [claude-code:unrecognized_model] {"model | **OK** |
| claude-glm | `/opt/homebrew/bin/claude` | `ANTHROPIC_MODEL=glm-5 claude -p '回复 OK'` | 5s | OK [claude-code:unrecognized_model] {"model | **OK** |
| cmd | `/opt/homebrew/bin/cmd` | `cmd -p '回复 OK'` | 4s | OK OK | **OK** |
| copilot | `/opt/homebrew/bin/copilot` | `copilot -p '回复 OK'` | 12s | OK OK | **OK** |
| Hermes | `Hermes (PM 工具: Hermes 自己; 本会话响应)` | `5 字段汇报 (cron-team-status.sh)` | <1s | OK Hermes 响应 + dispatch-wave277.sh 存在 | **OK** |
| kiro-cli | `~/.local/bin/kiro-cli` | `kiro-cli -p '回复 OK'` | 0s | FAIL error: unexpected argument '-p' found | **FAIL** |

## 2. 失败修法 (按工具)

### kiro-cli → FAIL

- 路径: `~/.local/bin/kiro-cli`
- 真跑探测: `kiro-cli -p '回复 OK'`
- 响应时间: 0s
- 响应结果: FAIL error: unexpected argument '-p' found
  → 修法: 检查 ~/.local/bin/ 或 PATH 路径; 重新安装工具

## 3. 关联

- [docs-coolie/TOOLS.md](../TOOLS.md) §2 7 工具池真值 (wave272)
- [docs-coolie/DAILY-TOOL-PROBE.md](../DAILY-TOOL-PROBE.md) 操作手册 (wave279 真跑说明)
- `scripts/cron-team-status.sh --probe` (wave279 新增真跑探测子命令)
- `scripts/daily-tool-probe.sh` (本脚本)
