---
name: requirements-capture
description: 用 Kiro Feature Spec 模式收需求(boss-utterance → EARS 标注的 requirements.md)。Use when 老板说"做个 X" / 工坊 chat 收到 build 触发 / 客服提需求 / 写新功能前。产物 requirements.md 给下游 system-design-spec 接。
---

# Requirements Capture（学 Kiro Feature Spec）

## Kiro 核心思想（Feature Spec 第一阶段）

把需求拆成 **user stories + acceptance criteria + EARS 标注**。三个文件序列：

- `requirements.md`（本文档产出）—— 用户故事 + 验收标准
- `design.md`（由 system-design-spec 产出）—— 架构 + 数据流 + 接口
- `tasks.md`（由匠人产出）—— 离散可执行任务 + 依赖图

**EARS 标注法**（Easy Approach to Requirements Syntax）—— 一种结构化需求写法，让 AI 模型无歧义理解：

```
WHEN <trigger>
  AND <condition>
THEN <system> SHALL <behavior>
```

例：
- WHEN 用户在工坊 tab 发送文本气泡, AND 网络在线, THEN 系统 SHALL 调 POST /api/board/chat/stream 并显示流式回复。
- WHEN 用户未登录, THEN 系统 SHALL 重定向到登录页。

## When to use

- 老板在 weixin 说"做个 X"
- 工坊 chat 收到 "build xxx" 触发
- 客服 / 用户提功能请求
- 写新功能前
- 任何「一句话」需要变成「多文件可派单」之前

**不要用于：**
- ❌ 修 bug（用 bug-fix-flow）
- ❌ 性能优化 / 重构（用 system-design-spec）
- ❌ 已知 spec 仅做技术方案（用 system-design-spec）

## Inputs

- 老板原话（weixin 截图 / 复制粘贴）—— **不改字**
- 工坊 chat 完整对话
- 客服需求描述
- 项目背景：`git log --oneline -10`，`docs-coolie/PM-ROADMAP.md`

## Outputs

写到 `docs-coolie/specs/YYYY-MM-DD-<slug>.md`，结构：

```markdown
# Feature: <一句话目标>

## 1. 背景
<老板原话 + 关联 commit / 文档>

## 2. User Stories
<用「作为 <谁>, 我想 <做什么>, 这样 <什么价值>」格式>

## 3. Acceptance Criteria (EARS)
- WHEN <触发条件>, AND <条件>, THEN <系统> SHALL <行为>.
- WHEN <触发>, THEN <系统> SHALL NOT <禁忌行为>.
- WHILE <持续状态>, <系统> SHALL <持续行为>.

## 4. 边界 / Out of Scope
<不做的明确列出>

## 5. 文件范围(白名单)
- path/to/file1.tsx
- path/to/file2.ts

## 6. 不动项
- <列出避免触动的区域>

## 7. 验收 gate (PM-RELEASE-CHECKLIST 子集)
- [ ] tsc 0 errors
- [ ] 用户故事 acceptance 全过
- [ ] commit 模板: feat(...)
- [ ] 老板 weixin 回签
```

第 7 节（技术方案）由 `system-design-spec` skill 接手,本 spec 不写。

## Process

### Step 1: 收集原文

把老板话原封不动复制粘贴进 spec 第 1 节,**不改字**。如果老板话里包含截图, 把截图文件路径 (相对仓库) 也写进去。

### Step 2: 提取 User Stories

老板原话 → 1-3 个 user story, 格式: 「作为 <谁>, 我想 <做什么>, 这样 <价值>」

格式三要素缺一不可:
- 谁: 用户角色 (boss / 员工 / 系统)
- 想: 期望动作
- 价值: 为什么 (驱动设计决策)

### Step 3: 写 EARS 验收标准

每个 user story → 3-5 个 acceptance criteria。EARS 五种模式:

| 模式 | 模板 | 用途 |
|---|---|---|
| **Event-driven** | WHEN <event> THEN system SHALL <response> | 主流程 |
| **State-driven** | WHILE <state> system SHALL <behavior> | 持续状态 (如 "保持连接") |
| **Optional** | WHERE <feature> system SHALL <behavior> | 条件功能 |
| **Unwanted** | IF <condition> THEN system SHALL NOT <behavior> | 禁止行为 |
| **Ubiquitous** | system SHALL <always-true-property> | 不变属性 |

### Step 4: 列边界 / Out of Scope

- 不做的: 「国际化」「邮件通知」「移动端 push」
- 推迟的: 「v2 才上」
- 不确定的: 「需要老板确认」

避免范围蔓延: 老板说"做个 X" 不等于 "做 X + Y + Z"。

### Step 5: 文件白名单

**只在能列清楚时做这一节**。规则:
- 改什么 → 必须列
- 不改什么 → 列出不动项

### Step 6: 验收 gate

24 项 PM-RELEASE-CHECKLIST.md, 这里只列本任务相关的子集。

## Anti-patterns

- ❌ 一句话目标不写验收标准 → 匠人不知"做完"长什么样
- ❌ EARS 用 "should" / "could" → 必须是 SHALL
- ❌ 边界/Out of Scope 省略 → 范围蔓延
- ❌ 文件白名单写"相关模块" → 必须绝对路径
- ❌ 老板原话改写 → 信息丢失
- ❌ 一个 spec 包多个不相关需求 → 拆

## Output 模板(完整)

看 `docs-coolie/specs/2026-09-20-spec-workflow-rollout.md` (作为示例)。

## 与 system-design-spec 协同

| 顺序 | skill | 输出 |
|---|---|---|
| Step 1 | **requirements-capture** (本) | spec 1-6 节(需求) |
| Step 2 | system-design-spec | spec 7 节(技术) |
| Step 3 | (PM 派单) | docs-coolie/briefs/Y.md 引用 spec |
| Step 4 | 匠人按 spec 干活 | commit + tsc |
| Step 5 | (PM 验收) | PM-RELEASE-CHECKLIST 24 项 |

## 参考

- Kiro Specs: https://kiro.dev/docs/specs/
- EARS 标注: https://alistairmavin.com/ears/
- bug-fix-flow — 修 bug 用(类似结构)
- system-design-spec — 接本 skill 产出
- PM-DISPATCH-RULES.md — 派单模板
- PM-RELEASE-CHECKLIST.md — 24 项 gate