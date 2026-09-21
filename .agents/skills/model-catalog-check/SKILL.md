---
name: model-catalog-check
description: 派工前检查 CLI 工具的 model catalog 支持。Use when 派活给 claude / cmd / agy 时，先确认 model 在该 CLI 的枚举里。Coolie fork 默认用 cmd（MiniMax-M3 在 claude code catalog 之外）。
---

# Model Catalog Check — 派工前必查

## 1. 老板 2026-09-21 撞过的坑

派铁匠 claude 跑验收 brief：
- `claude -p "..." --allow-dangerously-skip-permissions`
- 报错：`[claude-code:unrecognized_model] "MiniMax-M3" isn't described by this version's model catalog`
- 200 turns 全空跑（model catalog 错误每次都触发）
- 浪费 ~30 分钟

## 2. 真因

`MiniMax-M3` 是我们平台 model id，但 Anthropic Claude Code v1.x 的 model 枚举里只有 Anthropic 官方 model（claude-3.5-sonnet / claude-3-opus / ...），**MiniMax-M3 / GLM / MiniMax 都不在枚举里**。

Claude Code 用 MiniMax-M3 → 自动 catalog 错误 → turn 被吞掉 → 空跑。

## 3. 哪些 CLI 跑哪些 model 没问题

| CLI | 推荐 model | 真值 |
|---|---|---|
| **cmd (1.58.1)** | 任意 | ✅ cmd 用自家 catalog，不撞 Anthropic 枚举 |
| **agy (容器)** | Gemini 官方 | ✅ 但 agy 09-23 恢复前不可用 |
| **claude (铁匠)** | Claude 官方 | ❌ 我们用 MiniMax-M3 会撞 |
| **claude + settings.json override** | 任意 | ⚠️ 可能能 map 但不稳定 |

## 4. 派工前决策

```
派活 → 问: 接收方 CLI 是哪个?

if cmd: 直接派 (model catalog 不会撞)
if claude: 必须用 Claude 官方 model (claude-3-5-sonnet-...); 不派 MiniMax-M3 / GLM 任务
if agy: 等 09-23 恢复后再说
```

## 5. fallback

如果必须用 Claude Code 跑非 Claude model，**临时改 model**：

```bash
# ~/.claude/settings.jsonmm 改 model 字段 (临时)
# 但实测 MiniMax-M3 还是报 "unrecognized_model"
# → 必须 fallback 到 cmd
```

PM 拍板：**以后 Coolie fork 默认派 cmd，不用 claude。** claude 只在真需要 Claude model 时用。

## 6. 与 ai-workshop-dispatch 协同

`~/.hermes/skills/autonomous-ai-agents/ai-workshop-dispatch` 的匠人映射要更新：
- cmd → 优先 (1.58.1)
- claude → 备用（仅 Claude 官方 model 任务）
- agy → 等 09-23 恢复

## 7. 实操流程

```bash
# 派工前查 catalog
which claude && claude --version
# v1.x → 警告: claude -p MiniMax-M3 会撞

# 改用 cmd
cmd -p "..." -t --yolo --max-turns N
```

## 8. 实测过的踩坑（按时间）：

- 2026-09-21 派 claude 跑测试 wave1 → 200 turns 空跑 → 改 cmd → 成功
- 2026-09-21 派 claude 跑 OTA publish → 同样问题 → 改 cmd → 成功