# PM 汇报真格式 (wave276 老板原话 + wave280 修正, 2026-10-02)

> **wave280 修正** (2026-10-02 老板原话 "Hermes 肯定用 Hermes 自己啊"):
> - **§6 5 员工 + 7 工具池真配表** Hermes 默认工具: **kiro-cli** → **Hermes** (与 TOOLS.md / CMMI-EMPLOYEE-MAPPING.md / which-tool.sh / cron-team-status.sh 同步)
> - **不动** §1-§5 / §7-§9 全部 (5 字段汇报模板 + cron 注册 + 推断规则 + 出处)
>
> **目的**: 把老板要的"定时汇报真格式"落到文档. 老板原话 (wave276, 2026-10-02):
>
> > "咱们团队信息, 你定时回复的消息中要包含员工名, 正在进行的任务,
> > 多长时间, 使用什么工具".
>
> 之前 PM 汇报格式是 "进程: 0 个在跑" 这种空话 — 老板说不够, 要员工信息.
> 本文档定义 5 字段汇报模板 (员工 / 任务 / 多长时间 / 工具 / 状态),
> 替换之前"0 进程在跑"汇报.
>
> **不动**:
> - `TOOLS.md` (wave272 拍板, 7 工具池不动)
> - `CMMI-EMPLOYEE-MAPPING.md` (5 员工分工不动)
> - `server/src/services/agent-assign.ts` / `AGENT_ROLES` enum / Coolie 工坊 / UI / clients/expo
> - wave270 / wave271 / wave272 / wave273 / wave274 / wave275 (在跑 / 已发版)
> - v0.6.20 tag

---

## 0. 老板要的 5 字段

老板原话拆 5 个字段 (PM 每次汇报必填):

| # | 字段 | 取值 | 来源 |
|---|---|---|---|
| 1 | **员工名** | Hermes / 墨斗 / 铁匠 / 铁匠贰号 / 门神 / 兑底渊 / 百晓生 / `?` | 推断 (`scripts/cron-team-status.sh` 的 `infer_employee`) |
| 2 | **正在进行的任务** | `waveXXX` / `prototype` / `修法` / `?` | 推断 (命令行里的 `# waveXXX: ...`) |
| 3 | **多长时间** | `1h23m` / `2d5h` / `-` (等派活) | `ps -o etime` 实时算 |
| 4 | **使用工具** | agy-gemini3.8 / claude-glm / claude-mm / cmd / copilot / kiro-cli / Hermes / `Claude (未定)` | 推断 (wave272 7 工具池) |
| 5 | **状态** | 跑 / 卡 / 完成 | ETIME 阈值推断 (默认 4h+ = 卡) |

老板之前反馈"什么进展" / "如何了" / "啥情况" / "跑了啥" — PM 必用本表回.

---

## 1. PM 汇报模板 (5 字段表)

每次老板问 "什么进展" "如何了" "啥情况" "跑了啥" — PM 必须用下表:

```
| 员工 | 任务 | 多长时间 | 工具 | 状态 |
|---|---|---|---|---|
| Hermes | wave275 | 1h23m | Hermes 自己 (wave280) | 跑 |
| 墨斗 | wave273 | 2h15m | agy-gemini3.8 | 跑 |
| 兑底渊 | - | - | copilot | 等派活 |
```

或简洁版 (老板 weixin / cron 自动推):

```
Hermes: wave276 / 1h23m / Hermes 自己 (wave280) / 跑
墨斗:   wave273 / 2h15m / agy-gemini3.8 / 跑
兑底渊: - / - / copilot / 等派活
```

无 6 CLI 跑时 (PM 上一次答的 "0 进程在跑" 是这个场景):

```
全员: - / - / - / 等派活
```

---

## 2. 老板 vs PM 真值对照

| 之前 (PM 错答) | 现在 (PM 正答) | 真因 |
|---|---|---|
| "0 进程在跑" | "全员 / - / - / 等派活" | 没有"员工"信息, 老板要员工名 |
| "进程状态 + commit + tag + APK" | 5 字段表 | 缺员工 / 任务 / 工具 / 状态 4 字段 |
| "Hermes 在跑" | "Hermes / wave275 / 1h23m / Hermes 自己 (wave280) / 跑" | 缺任务 / 工具 / 时长 / 状态 |
| "在跑" | "跑" 或 "卡" | "卡" 是 ETIME > 4h 才标 (老板硬规矩: 卡 = 通知) |

---

## 3. cron 自动推 (每 30 分钟)

老板硬规矩: 派活必带 notify, 跑完通知. 因此 cron 跑本脚本 (cron-team-status.sh),
每 30 分钟打印 5 字段表:

```cron
*/30 * * * * bash $REPO_ROOT/scripts/cron-team-status.sh --print # wave276-team-status
```

通知路径 (`TEAM_STATUS_CMD` 环境变量, 默认 `$HOME/bin/team-status-notify.sh`):
- 默认指向老板本机的 `team-status-notify.sh` (老板本机配置, **不入 git** — 同
  `cron-copilot-reset.sh` 的 `~/bin/copilot-reset.sh` 模式)
- 若 ~/bin/team-status-notify.sh 不存在, 退化为 stdout + 写到 `/tmp/team-status.log`
- 真值通知渠道 (weixin / paperclip / slack) 由老板本机配置决定

注册 / 撤销:

```bash
bash scripts/cron-team-status.sh --register     # 注册 (幂等)
bash scripts/cron-team-status.sh --unregister   # 撤销
bash scripts/cron-team-status.sh --dry-run      # 看 cron 行 (不写)
```

---

## 4. PM 问"什么进展"标准回复

PM 收到老板问话后, 按以下三步答:

1. **跑 cron-team-status.sh** (取真实时数据, 不是凭印象):

   ```bash
   bash scripts/which-tool.sh status   # 转发到 cron-team-status.sh --print
   ```

2. **整理成 5 字段表** (见 §1 模板). 注意:
   - "等派活" = 当前无该员工在跑进程, 工具列空
   - "卡" = ETIME > 4h, 必须**立即通知老板** (老板硬规矩)
   - "完成" = 该 wave 在 commit log 里有 `release: v...` 或 `feat(...): waveXXX` 但
     进程已退出, 表里不列 (PM 手动报告)

3. **加一句人话总结** (例: "波 275 在跑 11 分钟, 还没出 APK, 我去看下").

---

## 5. 推断规则 (PM 答疑用)

PM 自己被老板反问 "你怎么知道是墨斗" 时, 用本节答复.

| 字段 | 推断来源 | 优先级 |
|---|---|---|
| 员工 | (1) wave 编号 → `WAVE_EMPLOYEE_PRIORITY` 表<br>(2) 命令行关键词 (墨斗 / 铁匠 / 兑底渊 / 门神 / 百晓生 / Hermes)<br>(3) 工具默认员工 (copilot → 兑底渊, agy → 墨斗, ...) | wave 编号 > 关键词 > 工具兜底 |
| 任务 | 命令行里 `# waveXXX: ...` 标题 → `extract_task` | 显式 > 模糊 |
| 工具 | (1) wave 编号 → `WAVE_TOOL_PRIORITY` 表<br>(2) 命令行二进制 basename + 子型号关键词<br>(3) `claude -c` → Hermes; `claude --dangerously` → Hermes (wave280, 不再 kiro-cli) | wave 编号 > 关键词 > 默认 |
| 多长时间 | `ps -o etime` (macOS ps 的 ELAPSED 字段, dd-hh:mm:ss / hh:mm:ss / mm:ss / ss) | 实时 |
| 状态 | ETIME > `STUCK_THRESHOLD_HOURS` (默认 4h) → 卡; 否则跑 | 阈值 |

完整推断函数在 `scripts/cron-team-status.sh` § "推断函数".

---

## 6. 5 员工 + 7 工具池真配 (wave272 拍板)

> **真值** (PM 派活工具速查, 完整见 `docs-coolie/TOOLS.md`):

| 员工 | 本体角色 | 默认工具 | 兜底工具 |
|---|---|---|---|
| Hermes (PM) | (PM, 不算 5 角色) | **Hermes 自己** (wave280 修正, 不配 kiro-cli) | Hermes |
| 墨斗 (Inkstick) | `fda` | **agy-gemini3.8** | cmd |
| 铁匠 (Forge) | `core-swe` | **claude-glm** | claude-mm |
| 铁匠贰号 (Forge II) | `core-swe` (副) | **claude-mm** | - |
| 门神 (Guardian) | `fdse` | **cmd** | - |
| 兑底渊 (Operator) | `pre-sre` | **copilot** | claude-mm |
| 百晓生 (Sage) | `ds` | **claude-mm** | claude-glm / copilot / claude-ds |

---

## 7. 与其他文档的关系

| 文档 | 关系 |
|---|---|
| `docs-coolie/TOOLS.md` (wave272) | 7 工具池定义 (本表字段 4 的真值源) |
| `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` | 5 员工 × CMMI 25 任务 (本表字段 1 的真值源) |
| `scripts/cron-team-status.sh` (wave276 新) | 本表字段的实时推断 (cron 自动跑) |
| `scripts/which-tool.sh` (wave272 + wave276 扩) | `status` 子命令转发到 cron-team-status.sh |
| `scripts/cron-copilot-reset.sh` (wave228) | 同模式 cron 注册脚本 (本波参考其 idempotent 写法) |
| `docs-coolie/PM-DISPATCH-QUICKCARD.md` | PM 派活工具切换规则 (§3 / §6) |

---

## 8. 出处 + 变更摘要

**出处**: wave276 老板原话 (2026-10-02)

**wave279 扩展** (老板原话 "工具探测得工具对方有回复 ok 才行"):
- `scripts/daily-tool-probe.sh` 探测方式改: `--version` 静态 → `-p '回复 OK'` 真跑真答
- `scripts/cron-team-status.sh` 扩 `--probe` 子命令 (转调 daily-tool-probe.sh, 不动主体)
- 真跑规则: 输出含 ok/OK/ready → OK; 响应 <5s 标 "<5s"; 超时 30s → FAIL
- 见 [docs-coolie/DAILY-TOOL-PROBE.md](./DAILY-TOOL-PROBE.md) §1 + §3

**新增**:
- `scripts/cron-team-status.sh` (新, 5 字段汇报 + cron 注册/撤销)
- `docs-coolie/PM-REPORTING-FORMAT.md` (本文件)
- `scripts/which-tool.sh` 扩 `status` 子命令

**不动**:
- `TOOLS.md` / `CMMI-EMPLOYEE-MAPPING.md` / `PM-DISPATCH-QUICKCARD.md` (本波仅引用)
- `server/src/services/agent-assign.ts` / `AGENT_ROLES` enum
- wave270 / wave271 / wave272 / wave273 / wave274 / wave275 (在跑 / 已发版)
- v0.6.20 tag

**PM 反讲**:
> 老板说"定时回复" = 改汇报格式, 不改波. 派活看 wave277 真值.
> 5 字段 = 员工 / 任务 / 多长时间 / 工具 / 状态 — 5 行表替 1 行"0 进程在跑".

---

## 9. 下一步

1. 老板看本格式 (`PM-REPORTING-FORMAT.md` + cron-team-status.sh 输出)
2. 派 wave277 真修 + DS 发版 0.6.22 (per 老板硬规矩)
3. cron 自动跑 (本波已注册) → 老板 weixin 收 5 字段表 (老板本机配置)

跑通验证:

```bash
bash scripts/cron-team-status.sh --print        # 当前团队状态
bash scripts/cron-team-status.sh --register      # 注册 cron (幂等)
bash scripts/cron-team-status.sh --unregister    # 撤销
bash scripts/which-tool.sh status                # 转发到 cron-team-status.sh
```
