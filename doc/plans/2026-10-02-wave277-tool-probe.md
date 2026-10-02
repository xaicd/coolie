# wave277 — 每天早上工具使用探测 (plan)

> 老板原话 (2026-10-02): "你每天早上把所有工具的使用探测做一遍"

## 1. 范围

- **新增** `scripts/daily-tool-probe.sh` (7 工具探测 + 5 字段表格 + 失败修法 + cron 注册/撤销 + JSON 输出)
- **新增** `/Users/mac/bin/daily-tool-probe.sh` symlink wrapper (cron 触发)
- **新增** `docs-coolie/probe/2026-10-02-tool-probe.md` (第一次跑出来的报告)
- **新增** `docs-coolie/DAILY-TOOL-PROBE.md` (操作手册)
- **新增** `docs-coolie/evidence/wave277/QA-REPORT.md` (本报告)
- **新增** `memory/daily-tool-probe.md` (经验记忆)
- **修改** `crontab` — 追加 `0 8 * * *` 行 (本地, 不入 git)

## 2. 不动

- server / ui / clients/expo
- wave270 / 271 / 272 / 273 / 274 / 275 / 276
- v0.6.20 tag
- 5 角色 / AGENT_ROLES enum
- docs-coolie/TOOLS.md (wave272 拍板真值表, 仅引用不重写)

## 3. 7 工具真值 (per `docs-coolie/TOOLS.md` §2)

| # | 工具 | 路径 | 探测规则 |
|---|---|---|---|
| 1 | agy-gemini3.8 | docker:agy-ubuntu-container | inspect State.Running + agy --version + agy -p "test" |
| 2 | claude-mm | /opt/homebrew/bin/claude | ANTHROPIC_MODEL=MiniMax-M3 claude --version + --help |
| 3 | claude-glm | /opt/homebrew/bin/claude | ANTHROPIC_MODEL=glm-5 claude --version + --help |
| 4 | cmd | /opt/homebrew/bin/cmd | cmd --version + -p "test" |
| 5 | copilot | /opt/homebrew/bin/copilot | copilot --version + -p "test" |
| 6 | Hermes | Hermes (PM) | 本会话响应 + ~/bin/dispatch-wave<NNN>.sh 存在 |
| 7 | kiro-cli | /Users/mac/.local/bin/kiro-cli | kiro-cli --version + --help |

## 4. 5 字段表格 (老板硬规矩)

```
| 工具 | 路径 | 版本 | 探测时间 | 状态 |
```

## 5. 失败修法 (按工具)

| 工具 | 修法 |
|---|---|
| agy-gemini3.8 | `docker start agy-ubuntu-container` 或 `docker run -d --name agy-ubuntu-container chw717/ai-agy:latest-arm64` |
| claude-mm / claude-glm | `brew install --cask claude-code` 或重装; 检查 ANTHROPIC_API_KEY |
| cmd | `npm i -g @commandcode/ai` 或重装 |
| copilot | `brew install copilot-cli` 或 `npm i -g @github/copilot`; 月度配额 `scripts/cron-copilot-reset.sh` |
| Hermes | `ln -sf .../dispatch-wave277.sh ~/bin/dispatch-wave277.sh` |
| kiro-cli | `curl -fsSL https://aws.kiro.dev/install.sh | bash` 或重装 |

## 6. Cron

```
0 8 * * * /Users/mac/bin/daily-tool-probe.sh # wave277-tool-probe
```

与 wave276 `*/30 * * * * cron-team-status.sh` 并存, 老板早上 8 点看工具 OK/FAIL.

## 7. macOS 边界 (踩到的 3 个坑)

1. **没 coreutils `timeout`** — 用 `perl -e 'alarm shift; exec @ARGV'` 替代
2. **`crontab file` 偶尔 hang** — `--unregister` 命令超时卡住, `pkill -f crontab` 后 `crontab -e` 手动删
3. **`set -u` + `local tmp` + EXIT trap** — `tmp` 函数返回后 unbound, 报 unbound variable; 修法: 手动 `rm -f` 替代 trap

详见 `memory/daily-tool-probe.md`.

## 8. 与 wave276 整合

- wave276: 每 30 分钟, "谁在跑什么" (员工 / 任务 / 多长时间 / 工具 / 状态)
- wave277: 每天 8 点, "7 工具能不能用" (工具 / 路径 / 版本 / 探测时间 / 状态)
- 两条 cron 都推 weixin (老板本机 ~/bin/*.sh, 不入 git)

## 9. 下一步

老板看完本波格式, 派 wave278:
- 真修本日探测到的工具问题 (无 — 7/7 OK)
- DS 发版 0.6.22 (per wave277 brief 末尾)

## 10. 发版

- 不发 APK (纯脚本 + 文档 + cron)
- push 4 文件 (脚本 + 操作手册 + 报告 + memory) + 1 probe 文件
- cron 自动跑
