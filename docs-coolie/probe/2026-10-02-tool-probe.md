# 工具池探测 — 2026-10-02

> wave277 — 每天早上工具使用探测 (老板原话: "你每天早上把所有工具
> 的使用探测做一遍"). 真值表见 [docs-coolie/TOOLS.md](../TOOLS.md) §2.

- 探测时间: `2026-10-02 10:42:01 CST`
- 探测脚本: `scripts/daily-tool-probe.sh`
- 探测耗时: ~105s 上限

## 1. 5 字段表格

| 工具 | 路径 | 版本 | 探测时间 | 状态 |
|---|---|---|---|---|
| agy-gemini3.8 | `docker:agy-ubuntu-container (容器内 agy-gemini3.8)` | `1.2.14` | 2026-10-02 10:42:01 CST | **OK** |
| claude-mm | `/opt/homebrew/bin/claude` | `2.1.287 (Claude Code)` | 2026-10-02 10:42:01 CST | **OK** |
| claude-glm | `/opt/homebrew/bin/claude` | `2.1.287 (Claude Code)` | 2026-10-02 10:42:01 CST | **OK** |
| cmd | `/opt/homebrew/bin/cmd` | `1.73.4` | 2026-10-02 10:42:01 CST | **OK** |
| copilot | `/opt/homebrew/bin/copilot` | `GitHub Copilot CLI 1.0.91.` | 2026-10-02 10:42:01 CST | **OK** |
| Hermes | `Hermes (PM 工具: kiro-cli; 本会话响应)` | `MiniMax-M3` | 2026-10-02 10:42:01 CST | **OK** |
| kiro-cli | `/Users/mac/.local/bin/kiro-cli` | `kiro-cli 2.22.0` | 2026-10-02 10:42:01 CST | **OK** |

## 2. 失败修法 (按工具)

全 7 工具状态 OK, 无需修法.

## 3. 关联

- [docs-coolie/TOOLS.md](../TOOLS.md) §2 7 工具池真值 (wave272)
- [docs-coolie/DAILY-TOOL-PROBE.md](../DAILY-TOOL-PROBE.md) 操作手册
- `scripts/cron-team-status.sh` (wave276 每 30 分钟团队状态)
- `scripts/daily-tool-probe.sh` (本脚本)
