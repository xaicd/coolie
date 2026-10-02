# 派活一屏卡 (wave278, 2026-10-02)

> **目的**: 微信里 5 秒看完派活。详档见 `EMPLOYEE-OBJECTS.md` (7 维度) + `PM-DISPATCH-QUICKCARD.md` (25 任务)

## 1. 6 老板团队 × 7 工具池 (派活唯一查这表)

| 员工 | 角色 | 默认 | 兜底 | CMMI 主 |
|---|---|---|---|---|
| **Hermes** PM | — | **Hermes 自己** (Claude Code v2.1.287 + MiniMax-M3 SDK) | — | 拍板 1.5 / 5.5 |
| **墨斗** Inkstick | fda | **agy v1.2.14** (容器) | cmd 紧急 | Phase 1: 1.1/1.2/1.3/1.4 |
| **铁匠** Forge | core-swe | **claude-glm** (GLM-5.3) | claude-mm (铁匠贰号) | Phase 3+4 全 + 5.4 (11) |
| **铁匠贰号** | core-swe 副 | claude-mm (MiniMax-M3) | — | 铁匠换工具, 不派单 |
| **门神** Guardian | fdse | **cmd v1.73.4** | — | 4.3 审查 + 5.3 金标 |
| **兑底渊** Operator | pre-sre | **copilot v1.0.91** | claude-mm | 2.1/3.4/4.5/5.1 (4) |
| **百晓生** Sage | ds | **claude-mm** | glm→copi→ds | 2.5/3.5/5.2/5.3/5.5 (5) |

工具池 7 个: ① agy-gemini3.8 ② claude-mm ③ claude-glm ④ cmd ⑤ copilot ⑥ **Hermes 自己** ⑦ **kiro-cli** (Hermes 跟 kiro-cli 并列, 不是主子)。

> **Hermes 工具修正** (老板 wave279b 微信实证, @session:default/20260918_173157_681eafbb):
> - ❌ PM 之前配 (错): `Hermes (PM) → kiro-cli`
> - ✅ 老板原话: "**Hermes 肯定用 Hermes 自己啊, 为啥 kiro-cli**"
> - ✅ 修正: **Hermes 本身是工具 (第 6 个), kiro-cli 是独立工具 (第 7 个), 两者并列, 不归 Hermes 管**

## 2. 一句话派活 (查这 8 行)

| 老板说 | 派给 | 用啥 |
|---|---|---|
| 修 bug / 写代码 | 铁匠 | claude-glm |
| 画原型 / 选型 / 选 X vs Y | 墨斗 | agy |
| 部署 / OTA / 发版 / 看 manifest | 兑底渊 | copilot |
| 看监控 / 告警 / 数据分析 | 百晓生 | claude-mm |
| 测试 / 撞机 / 验收 | 百晓生 (金标门神) | claude-mm |
| 风险预案 / 写 spec / 拆 WBS | 百晓生 / 铁匠 | claude-mm / claude-glm |
| 复盘 | 百晓生 + Hermes | claude-mm |
| **紧急 / 真机金标** | **门神** | **cmd** |

## 3. PM 派活 7 步

1. 听老板 → 查 §2 一句话
2. 锁 CMMI Phase + 任务
3. 写 brief 7 要素 (背景/目标/分支/白名单/步骤/验收/规则)
4. 存 `~/bin/dispatch-waveXXX.sh`
5. `bash ~/bin/dispatch-waveXXX.sh`
6. `~/bin/monitor-waveXXX.sh`
7. 5 字段表回报 §4

## 4. 5 字段汇报 (老板问"啥进展"必回, cron 每 30 分钟自动推)

```
| 员工   | 任务    | 时长   | 工具          | 状态 |
| Hermes | wave275 | 1h23m  | Hermes 自己   | 跑   |
| 墨斗   | wave273 | 2h15m  | agy-gemini3.8 | 跑   |
| 兑底渊 | -       | -      | copilot       | 等派活 |
```
ETIME > 4h = 卡 (立即通知)。命令: `bash scripts/cron-team-status.sh --print`。

## 5. 派单硬规矩

- 间隔 ≥3min (cmd 180s 冷却) / ≥30s (claude)
- brief 缺要素 → cmd 拒接
- "紧急" → 切门神 cmd, **老板不亲自跑** (wave229)
- 老板金标 → 门神 cmd 跑通, 老板看 PM 截图
- 卡死 = ETIME > 4h (立即通知)

## 6. 反向约束 (派单 wave 不动)

`server/src/services/agent-assign.ts` / `AGENT_ROLES` enum / `ROLE_MAPPING` / wave217+220 数字员工 / UI / clients/expo / `~/.claude/settings.json` / `~/bin/*.sh`。

## 7. 详细档跳转

- 7 维度员工档案: `EMPLOYEE-OBJECTS.md` (身份/工具/技能/环境/使用/数据/约束)
- 25 任务路由: `CMMI-EMPLOYEE-MAPPING.md` §2
- 5 字段 cron: `PM-REPORTING-FORMAT.md` (wave276)
- 派单 7 要素: `PM-DISPATCH-QUICKCARD.md` §6

**出处**: wave278 (合订 wave222/225/227/228/229/234/236/245/258/272/276)。不动上述 7 份原文档。
