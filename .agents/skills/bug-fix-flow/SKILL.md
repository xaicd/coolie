---
name: bug-fix-flow
description: 用 Kiro 的 Bugfix Spec 模式修 Coolie bug。三段式：当前行为 / 期望行为 / 不变行为。Use when 老板说"X 有 bug" / "工坊 chat 断了" / "语音派发失败" / 任何 regression 报告。
---

# Bug Fix Flow（学 Kiro）

## Kiro 核心思想（抄过来）

修 bug 不是改代码，是 **3 段精确描述 + 1 套属性测试**：

1. **Current Behavior（当前行为）**——「什么情况下出什么错」
2. **Expected Behavior（期望行为）**——「什么情况下应该出什么」
3. **Unchanged Behavior（不变行为）**——「什么情况下必须保持原样」

第 3 段是关键：**没有它，「外科手术式修复」就是一句空话**。属性测试（PBT）会基于这 3 段各生成一组，确保修复既消 bug 又不引入回归。

## When to use

- 老板说「X 有 bug」/「X 突然断了」/「回归了」
- 工坊 chat 用户报：「语音派发失败」「Object is not a function」
- 自动化测试抓到的 regression
- e2e 跑挂了
- prod 监控触发告警

**不要用于：**
- ❌ 新功能（用 requirements-capture）
- ❌ 性能优化（用 system-design-spec）
- ❌ 已知 bug 但 root cause 不知道 → 先用 diagnose-why-work-stopped

## Inputs

- **bug 现象**：logcat / Alert 文案 / 截图 / 复现路径
- **最近 commit**：`git log --oneline -10`
- **相关文件**：grep 已知模块
- **相关 spec**（如有）：`docs-coolie/specs/<feature>.md`

## Outputs

写到 `docs-coolie/specs/YYYY-MM-DD-<bug>.md`，结构：

```markdown
# Bug: <一句话症状>

## 1. 背景
<复现路径 + 老板原话 + logcat / 错误文字>

## 2. Current Behavior
「当 X 时, 系统发生 Y」

## 3. Expected Behavior
「当 X 时, 系统应该 Y」

## 4. Unchanged Behavior
「当 X 时, 系统必须继续保持 Y」

## 5. 根因(待定) / 设计
<PM 写的初判,或工匠填的 root cause>

## 6. 文件范围(白名单)
- path/to/fix.ts

## 7. 不动项
- <列出避免触动的区域>

## 8. 属性测试
- bug 存在性: input X → output Y
- bug 已修: input X → output Z
- 不回归: input W → output W (不变)

## 9. 验收 gate
- [ ] bug spec 通过率 100%
- [ ] 不变行为测试全过
- [ ] tsc 0 errors
- [ ] 老板 weixin 回签
```

## Process

### Step 1: 收集现象

老板原话一字不改,放第 1 节。如果有截图/日志/错误文字,**附原文,不要改写**。

### Step 2: 三段精确描述

| 段 | 问自己的问题 | 写不出来怎么办 |
|---|---|---|
| Current | 在什么输入下,系统现在输出什么? 错误原文? | 复现一遍,看 logcat / stderr |
| Expected | 正确的输出应该是什么? | 查 spec / 文档 / 老板意图 |
| Unchanged | 哪些代码路径不在 bug 范围,但要保持不破? | 列出所有可能的相关路径,挑出会碰到的 |

### Step 3: 找 root cause (工匠填)

PM 不亲自查 — 派活给匠人,要求「找到最小修复」+ 「列回归风险」。

### Step 4: 设计最小修复

匠人回答:
- 修哪行 / 哪个函数
- 为什么不修其他地方
- 回归测试覆盖什么

### Step 5: 派活 + 验收

PM 用 PM-DISPATCH-RULES.md 派单。匠人 commit message 必含 spec 路径:

```
fix(voice): per docs-coolie/specs/2026-09-20-voice-dispatch.md
```

验收要跑:
- 复现老板报的路径 → bug 应消失
- Unchanged 路径 → 行为不变
- tsc 0 errors + 属性测试全过

## Anti-patterns (Kiro 反复警告的)

- ❌ 「修一下 X」 → 没 spec,没不变行为,门神会拒 (F5)
- ❌ 「把那个 bug 修了」 → 没文件范围,匠人找不到
- ❌ 改范围比 bug 大 → 引入新 bug (Unchanged 没列)
- ❌ 不写属性测试 → 修复没法验证
- ❌ 复制粘贴既有代码不思考 (Unchanged 没具体路径)
- ❌ 「差不多就行」 → 验收标准模糊

## 与现有 PM 文档的协同

| skill | 何时用 | 产出 |
|---|---|---|
| **requirements-capture** | 新功能 / build xxx | spec 1-6 节 |
| **system-design-spec** | 新功能技术方案 | spec 7 节 |
| **bug-fix-flow** (本) | 修 bug | bugfix spec 8 节 |
| diagnose-why-work-stopped | bug 但不知 root cause | root cause + spec |

## 实际案例(0.3.6 chat 热修)

当时老板说「普通对话都不行」, 没 spec 就派单 → 门神拒 (合理)。
**正确做法应是:**

```markdown
# Bug: 0.3.5 chat "普通对话都不行"

## 1. 背景
Boss 装 0.3.5, 在工坊 tab 发文本气泡断 (截图).

## 2. Current Behavior
WHEN 用户在工坊 tab 点发送按钮,
THEN 系统报 "Object is not a function" 或无响应.

## 3. Expected Behavior
WHEN 用户在工坊 tab 点发送按钮,
THEN 系统调 POST /api/board/chat/stream 返回 SSE chunk, 气泡流式显示.

## 4. Unchanged Behavior
WHEN 用户在工坊 tab 点语音按钮,
THEN 系统行为不变(继续走 0.3.4 修复的代码路径).
WHEN 审批气泡出现, 内嵌 Approve/Reject 按钮仍正常 (0.3.4 fix 不能坏).
WHEN build orchestrator BuildProgressCard 显示 (1ad05c8be), 仍正常.

## 5. 根因
待匠人填 (PM 不查)

## 6. 文件范围
- clients/expo/src/screens/BoardChatScreen.tsx (主要嫌疑)

## 7. 不动项
- voice useRecorder.ts (老板的 WIP)
- BuildProgressCard 组件
- 审批 V2 内嵌按钮
- stage A 抽的 12 个 ui 组件

## 8. 属性测试
- P1: 发送文本 → 收到 SSE chunk (验证修复)
- P2: 发送语音 → 转写 + 建任务 (验证 voice 路径不变)
- P3: 审批气泡显示 → 内嵌按钮可点 (验证 0.3.4 不破)
- P4: build 触发 "build xxx" → BuildProgressCard 显示 (验证 0.5.0 不破)

## 9. 验收
- tsc 0 errors
- P1-P4 全过
- 老板实测
```

## Reference

- Kiro Bugfix Specs: https://kiro.dev/docs/specs/bugfix-specs/
- PM-DISPATCH-RULES.md — 派单模板
- PM-RELEASE-CHECKLIST.md — 24 项 gate
- PM-FAILURE-CASES.md — 15 失败复盘
- diagnose-why-work-stopped — 项目级 skill
- requirements-capture / system-design-spec — 项目级 skill