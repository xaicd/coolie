# 工具池探测 — 2026-10-03

> wave279 — 改真跑 OK 探测 (老板原话: "工具探测得工具对方有回复 ok
> 才行"). 探测方式 = 真跑 `-p '回复 OK'`, 响应含 ok/OK/ready
> 才算 OK; 超时 30s = FAIL. 替换 wave277 静态 --version.
> 真值表见 [docs-coolie/TOOLS.md](../TOOLS.md) §2.

- 探测时间: `2026-10-03 08:00:00 CST`
- 探测脚本: `scripts/daily-tool-probe.sh` (wave279)
- 探测方式: 真跑 `-p '回复 OK'`
- 超时: 30s/工具; 性能 OK 阈值: <5s

## 1. 5 字段表格

| 工具 | 路径 | 真跑探测 | 响应时间 | 响应结果 | 状态 |
|---|---|---|---|---|---|
| agy-gemini3.8 | `docker:agy-ubuntu-container` | `docker exec agy-ubuntu-container agy -p '回复 OK'` | - | FAIL 容器未运行 (inspect=) | **FAIL** |
| claude-mm | `(not in PATH)` | `claude -p '回复 OK'` | - | FAIL binary not in PATH | **FAIL** |
| claude-glm | `(not in PATH)` | `ANTHROPIC_MODEL=glm-5 claude -p '回复 OK'` | - | FAIL binary not in PATH | **FAIL** |
| cmd | `(not in PATH)` | `cmd -p '回复 OK'` | - | FAIL binary not in PATH | **FAIL** |
| copilot | `(not in PATH)` | `copilot -p '回复 OK'` | - | FAIL binary not in PATH | **FAIL** |
| Hermes | `Hermes (PM 工具: kiro-cli; 本会话响应)` | `5 字段汇报 (cron-team-status.sh)` | <1s | OK Hermes 响应 + dispatch-wave277.sh 存在 | **OK** |
| kiro-cli | `(not in PATH)` | `kiro-cli -p '回复 OK'` | - | FAIL binary not in PATH | **FAIL** |

## 2. 失败修法 (按工具)

### agy-gemini3.8 → FAIL

- 路径: `docker:agy-ubuntu-container`
- 真跑探测: `docker exec agy-ubuntu-container agy -p '回复 OK'`
- 响应时间: -
- 响应结果: FAIL 容器未运行 (inspect=)
  → 修法: docker start agy-ubuntu-container; 或 docker run -d --name agy-ubuntu-container chw717/ai-agy:latest-arm64

### claude-mm → FAIL

- 路径: `(not in PATH)`
- 真跑探测: `claude -p '回复 OK'`
- 响应时间: -
- 响应结果: FAIL binary not in PATH
  → 修法: brew install --cask claude-code 或重装 /opt/homebrew/bin/claude; 检查 ANTHROPIC_API_KEY

### claude-glm → FAIL

- 路径: `(not in PATH)`
- 真跑探测: `ANTHROPIC_MODEL=glm-5 claude -p '回复 OK'`
- 响应时间: -
- 响应结果: FAIL binary not in PATH
  → 修法: brew install --cask claude-code 或重装 /opt/homebrew/bin/claude; 检查 ANTHROPIC_API_KEY

### cmd → FAIL

- 路径: `(not in PATH)`
- 真跑探测: `cmd -p '回复 OK'`
- 响应时间: -
- 响应结果: FAIL binary not in PATH
  → 修法: npm i -g @commandcode/ai 或重装 /opt/homebrew/bin/cmd

### copilot → FAIL

- 路径: `(not in PATH)`
- 真跑探测: `copilot -p '回复 OK'`
- 响应时间: -
- 响应结果: FAIL binary not in PATH
  → 修法: brew install copilot-cli 或 npm i -g @github/copilot; 月度配额跑 scripts/cron-copilot-reset.sh

### kiro-cli → FAIL

- 路径: `(not in PATH)`
- 真跑探测: `kiro-cli -p '回复 OK'`
- 响应时间: -
- 响应结果: FAIL binary not in PATH
  → 修法: 检查 ~/.local/bin/ 或 PATH 路径; 重新安装工具

## 3. 关联

- [docs-coolie/TOOLS.md](../TOOLS.md) §2 7 工具池真值 (wave272)
- [docs-coolie/DAILY-TOOL-PROBE.md](../DAILY-TOOL-PROBE.md) 操作手册 (wave279 真跑说明)
- `scripts/cron-team-status.sh --probe` (wave279 新增真跑探测子命令)
- `scripts/daily-tool-probe.sh` (本脚本)
