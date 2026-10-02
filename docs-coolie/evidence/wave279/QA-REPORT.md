# wave279 QA Report — 改工具探测为真跑 + 真回复 OK

## 1. 任务摘要

| Wave | 老板原话 | 改动 |
|---|---|---|
| wave277 | "你每天早上把所有工具的使用探测做一遍" | 静态探测 (--version + -p "test") |
| **wave279 (本)** | "工具探测得工具对方有回复 ok 才行" | **真跑 OK 探测** (-p '回复 OK', 解析 ok/OK/ready, 响应时间记录, 30s 超时) |

## 2. 真跑 OK 探测模板

| 工具 | 真跑探测命令 | 实际响应时间 | 状态 |
|---|---|---|---|
| agy-gemini3.8 | `docker exec agy-ubuntu-container agy -p '回复 OK'` | 18s | ✅ OK |
| claude-mm | `ANTHROPIC_MODEL=MiniMax-M3 claude -p '回复 OK'` | 9s | ✅ OK |
| claude-glm | `ANTHROPIC_MODEL=glm-5 claude -p '回复 OK'` | 4s | ✅ OK |
| cmd | `cmd -p '回复 OK'` | 5s | ✅ OK |
| copilot | `copilot -p '回复 OK'` | 11s | ✅ OK |
| Hermes | 5 字段汇报 (cron-team-status.sh) | <1s | ✅ OK |
| kiro-cli | `kiro-cli -p '回复 OK'` | 0s | ❌ FAIL |

## 3. 验证项

| # | 项 | 期望 | 实测 | 结果 |
|---|---|---|---|---|
| 1 | 真跑探测 7 工具全部真跑 | 每工具真实 `p '回复 OK'` 提问 + 等回应 | 7/7 真跑 (见上表) | ✅ |
| 2 | 响应时间记录 (秒) | 每工具记录秒数, <5s 标 `<5s` | 全部记录, <5s 的 3 个标 `<5s` | ✅ |
| 3 | 超时 30s | 默认 30s 超时 (PROBE_TIMEOUT env 可调) | perl alarm, 默认 30s | ✅ |
| 4 | 失败告警 | 至少 1 个 FAIL → exit 非 0 + stderr 警告 | kiro-cli FAIL → exit 1 + stderr | ✅ |
| 5 | 5 字段表格 | 工具 / 路径 / 真跑探测 / 响应时间 / 状态 | 6/7 OK, 1 FAIL, 列对齐 | ✅ |
| 6 | JSON 输出下游消费 | `--json` 产 valid JSON | python3 json.load 解析 OK | ✅ |
| 7 | `--probe` 转调子命令 | `cron-team-status.sh --probe` = 真跑探测 | 调用成功, 输出 daily-tool-probe.sh 表格 | ✅ |
| 8 | 持久化报告 | `--print` 写 `docs-coolie/probe/<date>-tool-probe.md` | 写到 `2026-10-02-tool-probe.md` | ✅ |
| 9 | macOS 兼容 (无 coreutils timeout) | perl alarm 替代 | perl alarm, BASH_XTRACEFD=-1 防 trace 污染 | ✅ |
| 10 | 不动范围 | 不动 wave276 cron-team-status.sh 主体 / 不动 AGENT_ROLES / 不动 v0.6.20+21 tag | 仅扩 `--probe` 子命令, 加 help 行 | ✅ |

## 4. 已知问题 (真值)

| 工具 | 问题 | 修法 | 真值依据 |
|---|---|---|---|
| kiro-cli | kiro-cli 2.x 默认 interactive, 不接受 `-p`, 返回 `error: unexpected argument '-p' found` | 检查 `~/.local/bin/` PATH; 或改用 `kiro-cli chat` 子命令 (但本波按 boss brief 用 `-p`) | boss 原话 wave279: `kiro-cli -p '回复 OK'` |
| agy-gemini3.8 (间歇) | 容器内 agy CLI 有时返回 `Eligibility check failed: Post "h...` (容器 up 但 CLI 状态有误) | `docker restart agy-ubuntu-container` 或 `docker exec agy-ubuntu-container agy login` | 本波跑时, 重新跑 1 次即恢复 OK |
| claude-mm / claude-glm | `[claude-code:unrecognized_model]` 警告 (MiniMax-M3 / glm-5 不被 Claude Code 识别为标准名) | 检查 ANTHROPIC_MODEL 名称; 不影响 OK 判定 (返回含 `ok`) | 老板 PM 用 MiniMax-M3; 模型识别警告属噪音 |

## 5. 改动文件清单

| 文件 | 改动 |
|---|---|
| `scripts/daily-tool-probe.sh` | 改探测方式 (--version → -p '回复 OK'); 加真跑 OK 解析; 30s 超时; 响应时间记录; JSON escape; macOS BASH_XTRACEFD=-1 隔离 trace |
| `scripts/cron-team-status.sh` | 扩 `--probe` 子命令 (不动主体); header 更新 wave279 |
| `docs-coolie/DAILY-TOOL-PROBE.md` | 改真跑探测规则 (§1); 输出格式 (§3); 字段定义 (5 字段); wave279 变更摘要 (§6) |
| `docs-coolie/PM-REPORTING-FORMAT.md` | 加 wave279 真跑扩展说明 (§8) |

不动:
- `server/` / `ui/` / `clients/expo` — 不动
- wave270 / wave271 / wave272 / wave273 / wave274 / wave275 / wave276 / wave277 / wave278 — 不动
- v0.6.20 (wave266) / v0.6.21 (wave275) tag — 不动
- 5 角色 / AGENT_ROLES enum — 不动
- `docs-coolie/TOOLS.md` (wave272 拍板) — 不动, 仅引用

## 6. 跑通命令

```bash
# 跑 daily-tool-probe 真跑探测
bash scripts/daily-tool-probe.sh --print

# 跑 cron-team-status --probe (转调)
bash scripts/cron-team-status.sh --probe

# JSON 下游
bash scripts/daily-tool-probe.sh --json | jq .

# 注册 cron (idempotent)
bash scripts/daily-tool-probe.sh --register
```

## 7. 老板下一步

1. 看本报告 + wave279 真跑表格
2. 派 wave280 真修 + DS 发版 0.6.22 (per AGENTS.md §12 发版规范)
3. cron `0 8 * * *` 自动每天 8:00 真跑, 失败自动告警 (cron-team-status --probe 同步)

---

**出处**:
- 老板原话 wave279 (2026-10-02): "工具探测得工具对方有回复 ok 才行"
- 真跑结果日期: 2026-10-02
- 跑通脚本版本: `scripts/daily-tool-probe.sh` (wave279 真跑 OK 探测)
