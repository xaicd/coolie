# wave276 QA 报告 — 定时汇报真格式 (5 字段)

> **波次**: wave276
> **日期**: 2026-10-02
> **触发**: 老板原话 "咱们团队信息, 你定时回复的消息中要包含员工名, 正在进行的任务,
> 多长时间, 使用什么工具".
> **任务边界**: 只改汇报格式, 不改波. 不动 server / ui / clients/expo / v0.6.20 tag /
> wave270..275 / 5 角色 / AGENT_ROLES enum.

---

## 1. 范围 & 交付物

| 文件 | 状态 | 说明 |
|---|---|---|
| `scripts/cron-team-status.sh` | A (新, ~430 行) | 5 字段推断 + 表格/JSON 渲染 + cron 注册/撤销 |
| `scripts/which-tool.sh` | M (扩) | `status` 子命令转发到 cron-team-status.sh |
| `docs-coolie/PM-REPORTING-FORMAT.md` | A (新) | 5 字段模板 + 老板 vs PM 真值对照 + cron 自动推规范 |
| `docs-coolie/evidence/wave276/QA-REPORT.md` | A (本报告) | - |

合计 ~ 600 行 scripts + docs, **0 行** server/ui/clients 代码改动.

---

## 2. 关键变更 (之前 PM 汇报 → wave276)

| 维度 | 之前 (PM 错答) | 现在 (PM 正答) |
|---|---|---|
| 老板问 "什么进展" | "0 进程在跑" / "进程状态 + commit + tag + APK" | 5 字段表 (员工 / 任务 / 多长时间 / 工具 / 状态) |
| 员工信息 | 无 | 6 老板团队 (Hermes / 墨斗 / 铁匠 / 门神 / 兑底渊 / 百晓生) |
| 工具信息 | 无 | 7 工具池 (agy-gemini3.8 / claude-glm / claude-mm / cmd / copilot / kiro-cli / Hermes) |
| 状态 | 无 | 跑 / 卡 (ETIME > 4h) / 等派活 |
| 自动推 | 无 | cron 每 30 分钟 (`*/30 * * * *`) 跑本脚本 |

---

## 3. 5 字段推断矩阵 (核心)

老板要的 5 字段, 真值源:

| # | 字段 | 推断源 | 优先级 |
|---|---|---|---|
| 1 | 员工 | wave 编号 → `WAVE_EMPLOYEE_PRIORITY`; 命令行关键词; 工具默认员工 | wave 编号 > 关键词 > 工具兜底 |
| 2 | 任务 | `# waveXXX: ...` 标题 → `extract_task` | 显式 > `?` |
| 3 | 多长时间 | `ps -o etime` (dd-hh:mm:ss / hh:mm:ss / mm:ss / ss) | 实时 |
| 4 | 工具 | wave 编号 → `WAVE_TOOL_PRIORITY`; 命令行 basename + 子型号关键词; `claude -c` / `claude --dangerously` 默认 | wave 编号 > 关键词 > 默认 |
| 5 | 状态 | ETIME > `STUCK_THRESHOLD_HOURS` (默认 4h) = 卡; 否则 = 跑 | 阈值 |

完整推断函数在 `scripts/cron-team-status.sh` § "推断函数".

---

## 4. 推断规则细节

### 4.1 wave 编号 → 员工 (`WAVE_EMPLOYEE_PRIORITY`)

| wave | 员工 | 出处 |
|---|---|---|
| wave276 | Hermes | 本波 (PM 拍板 + 派活模板) |
| wave275 | 兑底渊 | brief: "b = DS = 兑底渊" |
| wave274 | 兑底渊 | 占位 (DS 运维波) |
| wave273 | 墨斗 | brief: "墨斗 agy 真审" |
| wave272 | Hermes | 7 工具池拍板 (PM 拍板) |
| wave271 | Hermes | 撞机找缺陷 (PM 跑撞机) |
| wave270 | 墨斗 | agy 全量审计 (墨斗 FDA 视角) |
| wave277..279 | Hermes | 占位 (后续 PM 派活) |

### 4.2 wave 编号 → 工具 (`WAVE_TOOL_PRIORITY`)

| wave | 工具 | 出处 |
|---|---|---|
| wave276 | kiro-cli | per wave272: Hermes PM 工具 |
| wave275 | copilot | per wave272 + brief: 兑底渊 SRE 工具 |
| wave274 | copilot | 占位 |
| wave273 | agy-gemini3.8 | per brief + wave272: 墨斗 FDA 工具 |
| wave272 | kiro-cli | per wave272: PM 拍板 |
| wave271 | kiro-cli | per wave272: PM 跑撞机 |
| wave270 | agy-gemini3.8 | per wave272: 墨斗 FDA |
| wave277..279 | kiro-cli | 占位 |

### 4.3 工具 → 默认员工兜底 (per wave272)

| 工具 | 默认员工 |
|---|---|
| agy-gemini3.8 | 墨斗 |
| copilot | 兑底渊 |
| cmd | 门神 |
| claude-glm | 铁匠 |
| claude-mm | 铁匠贰号 |
| kiro-cli / Hermes | Hermes |

---

## 5. 实跑验证 (5 字段表格)

跑 `bash scripts/cron-team-status.sh --print`, 当前团队状态:

```
═══ 团队状态 (5 字段, wave276 老板原话) ═══
PID     员工       任务       工具         多长时间 状态
-------------------------------------------------------------------
28389   兑底渊    wave275      copilot        17m          跑   
29263   Hermes       wave276      kiro-cli       15m          跑   
32378   Hermes       wave277      kiro-cli       9m           跑   
77452   Hermes       wave276      kiro-cli       0m           跑   
63449   Hermes       ?            Hermes         11h34m       卡   
```

| 验证点 | 结果 |
|---|---|
| 5 字段全 (PID / 员工 / 任务 / 多长时间 / 工具 / 状态) | ✅ |
| 兑底渊 (wave275 brief) → 兑底渊 + copilot (per wave272) | ✅ |
| Hermes (wave276 = 本波) → Hermes + kiro-cli (per wave272) | ✅ |
| wave277 → Hermes + kiro-cli (per 占位 + 推断) | ✅ |
| 11h34m 卡 (超过 4h 阈值) → 状态 = 卡 | ✅ |
| `claude -c` 交互式 (无 wave) → Hermes + Hermes | ✅ |

---

## 6. 模式 (5 字段对比)

### 6.1 PM 之前错答 (空)

```
老板: "什么进展"
PM (旧): "进程: 0 个在跑"   # 无员工 / 任务 / 工具 / 状态
```

### 6.2 PM 现在正答 (5 字段)

```
老板: "什么进展"
PM (新): "团队: Hermes/墨斗/... (5 字段模板)"

| 员工 | 任务 | 多长时间 | 工具 | 状态 |
|---|---|---|---|---|
| Hermes | wave275 | 1h23m | kiro-cli | 跑 |
| 墨斗 | wave273 | 2h15m | agy-gemini3.8 | 跑 |
| 兑底渊 | - | - | copilot | 等派活 |
```

---

## 7. cron 注册验证

```bash
$ bash scripts/cron-team-status.sh --dry-run
========================================================
 wave276 — 团队状态定时汇报 cron (DRY RUN)
========================================================
 目标行:
   */30 * * * * bash /Users/mac/workspace/xaicd/coolie/scripts/cron-team-status.sh --print # wave276-team-status

 cron 时间: 每 30 分钟 (老板硬规矩: 派活必带 notify)
 目标命令: bash /Users/mac/workspace/xaicd/coolie/scripts/cron-team-status.sh --print
 默认 notify 脚本: /Users/mac/bin/team-status-notify.sh (老板本机配置, 不入 git)
 idempotency tag: #wave276-team-status

 应用: bash scripts/cron-team-status.sh --register

$ bash scripts/cron-team-status.sh --register
✅ 已注册 wave276 cron:
   */30 * * * * bash /Users/mac/workspace/xaicd/coolie/scripts/cron-team-status.sh --print # wave276-team-status

 验证: crontab -l | grep wave276-team-status

$ crontab -l
*/30 * * * * bash /Users/mac/workspace/xaicd/coolie/scripts/cron-team-status.sh --print # wave276-team-status
0 8 * * * /Users/mac/bin/daily-tool-probe.sh # wave277-tool-probe
```

| 验证点 | 结果 |
|---|---|
| cron 行注册到 crontab | ✅ |
| idempotent (重跑 `--register` 不重复) | ✅ (代码层同 cron-copilot-reset.sh 模式) |
| 与 wave277 daily-tool-probe cron 共存 (不互冲) | ✅ |

---

## 8. 测试矩阵

| # | 测试 | 命令 | 结果 |
|---|---|---|---|
| T1 | 帮助 | `bash scripts/cron-team-status.sh --help` | ✅ |
| T2 | 默认打印 (表格) | `bash scripts/cron-team-status.sh` | ✅ |
| T3 | 显式 --print | `bash scripts/cron-team-status.sh --print` | ✅ |
| T4 | JSON 输出 | `bash scripts/cron-team-status.sh --json` | ✅ (合法 JSON, 含 timestamp / rows) |
| T5 | dry-run | `bash scripts/cron-team-status.sh --dry-run` | ✅ |
| T6 | register (幂等) | `bash scripts/cron-team-status.sh --register` (×2) | ✅ (第二次 "已注册, 跳过") |
| T7 | unregister | `bash scripts/cron-team-status.sh --unregister` | ✅ |
| T8 | which-tool.sh status 子命令 | `bash scripts/which-tool.sh status` | ✅ (转发) |
| T9 | 空环境 (PATH=/usr/bin:/bin, HOME set) | cron 跑场景模拟 | ✅ (HOME set 即可; macOS cron 自动 set) |
| T10 | 解析 ETIME octal bug | ETIME 含 `08` 数字 | ✅ (10# 前缀修复) |

---

## 9. 不动 / 反约束验证

| 维度 | 验证 |
|---|---|
| server 业务 | ✅ 0 行 server 改动 |
| UI / clients/expo | ✅ 0 行 UI / expo 改动 |
| wave270..275 | ✅ 全不动 (本波只审计在跑的进程命令行, 不改它们) |
| v0.6.20 tag | ✅ 不动 |
| 5 角色 / AGENT_ROLES enum | ✅ 不动 |
| Coolie 工坊 / Paperclip 算法层 | ✅ 不动 |

---

## 10. PM 反讲 (给老板的话)

> **老板问 "什么进展"**, 之前 PM 答 "0 进程在跑" — 老板说不够, 要员工信息.
>
> 现在 PM 答 5 字段表 (员工 / 任务 / 多长时间 / 工具 / 状态), 跑
> `bash scripts/cron-team-status.sh --print` 拿实时数据, 或
> `bash scripts/which-tool.sh status` 转发.
>
> cron 已注册 `*/30 * * * *` (每 30 分钟跑本脚本), 老板本机
> `~/bin/team-status-notify.sh` (老板本机配置, 不入 git) 收通知 (默认 stdout +
> `/tmp/team-status.log` 退化路径).
>
> 不动任何波 (PM 反讲: 老板说"定时回复" = 改汇报格式, 不改波). 不动 5 角色 /
> AGENT_ROLES enum. 不动 v0.6.20 tag.

---

## 11. 下一步

1. 老板看 5 字段表 (`bash scripts/which-tool.sh status`)
2. 老板看 PM-REPORTING-FORMAT.md (`docs-coolie/PM-REPORTING-FORMAT.md`)
3. 派 wave277 真修 + DS 发版 0.6.22 (per 老板硬规矩)
4. cron 自动跑 (本波已注册) → 老板 weixin 收 5 字段表 (老板本机配置)

跑通验证:

```bash
bash scripts/cron-team-status.sh --print        # 当前团队状态
bash scripts/cron-team-status.sh --register      # 注册 cron (幂等, 已注册)
bash scripts/cron-team-status.sh --unregister    # 撤销 (若要退)
bash scripts/which-tool.sh status                # 转发
crontab -l | grep wave276-team-status            # 验证 cron 已注册
```
