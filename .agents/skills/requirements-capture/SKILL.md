---
name: requirements-capture
description: 从老板 / 用户一句话诉求转结构化需求(spec)的 skill。Use when 老板说"做个 X"或工坊 chat 收到 build 触发, 需要先把诉求拆成可验证需求、用户场景、文件范围、验收标准、再决定派单。
---

# Requirements Capture

把口头诉求 / chat 描述 / bug 报告 → 可派活的需求规格(spec)。

## When to use

- 老板在 weixin 说"做个 X" / "修一下 Y"
- 工坊 chat 收到 "build xxx" 触发
- 客服 / 用户报 bug, 描述含"什么情况下什么不对"
- 产品文档写新功能前
- 任何「一句话」需要变成「多文件可派单」之前

## Inputs

- 老板口头原文（weixin 截图 / 复制粘贴）
- 或工坊 chat 完整对话
- 或 bug 报告（logcat / 错误文字 / 截图）
- 项目背景（git log --oneline -10，docs-coolie/PM-ROADMAP.md）

## Outputs

写到 `docs-coolie/specs/YYYY-MM-DD-<slug>.md`，包含 6 要素：

```markdown
# Spec: <一句话目标>

## 1. 背景
<老板原话 + 关联 commit / 文档>

## 2. 目标
<一句话可测, 含具体数值>

## 3. 用户场景
- 场景 1: <谁 + 什么动作 + 期望>
- 场景 2: ...
- 场景 3: ...

## 4. 文件范围(白名单)
- path/to/file1.tsx
- path/to/file2.ts

## 5. 不动项
- <列出避免触动的区域>

## 6. 验收 gate
- [ ] tsc 0 errors
- [ ] commit 模板: feat(...): ...
- [ ] <具体可测项>
- [ ] 老板 weixin 回签
```

## Process

### Step 1: 收集原文

把老板话原封不动复制粘贴进 spec 第 1 节,**不改字**。如果老板话里包含截图, 把截图文件路径 (相对仓库) 也写进去。

### Step 2: 提取目标

老板原话 → 一句话目标。**避免范围蔓延**：不要把"做个 X"扩展成"做 X + Y + Z"。

格式：「老板想要 + 可测的指标」。例如：
- ❌ "做个反馈页"
- ✅ "在 App 内 Settings 入口加一个'反馈'按钮 → 提交后调 POST /api/feedback → 老板在工坊 chat 看到'收到新反馈'通知"

### Step 3: 用户场景（最少 3 个）

- **happy path**：主流程
- **edge case 1**：边界情况（如空输入、网络断、超长文本）
- **edge case 2**：错误路径（如权限不够、重复提交）

每个场景要描述「谁 / 什么动作 / 期望结果」三段。

### Step 4: 文件白名单

**只在能列清楚时做这一节**。规则：
- 改什么 → 必须列（这是匠人范围）
- 不改什么 → 列出不动项（避免触雷）

如果文件范围不确定 → **回到 Step 3 加场景**，不要把不确定的范围硬派。

### Step 5: 不动项

必填。至少 3 类：
- 已发版的版本不要乱动（如 0.5.0 已发 OTA）
- 其他匠人正在改的区域
- 老板说"先不做的"

### Step 6: 验收 gate

**全 24 项参考 PM-RELEASE-CHECKLIST.md**, 但 spec 里只列与本任务相关的子集。

## Anti-patterns

- ❌ spec 写到一半就开始派活（PM-FAILURE-CASES F5）
- ❌ 文件白名单写成"相关模块"（必须绝对路径）
- ❌ 不动项省略（匠人会乱动）
- ❌ 验收标准模糊（"差不多就行" / "看起来对"）
- ❌ 一个 spec 包多个不相关任务（拆 spec）
- ❌ 老板原话改写（信息丢失）

## After write

PM 把 spec 路径写进 PM-DISPATCH-LOG-YYYY-MM-DD.md：
```
14:50 | <pid> | 门神 | <spec 路径> + brief | 🔨 后台跑
```

然后用 PM-DISPATCH-RULES.md 模板派单。匠人 commit message 必含 spec 路径：
```
feat(feedback): per docs-coolie/specs/2026-09-21-feedback-page.md
```

## Output template (full)

看 docs-coolie/specs/ 目录最新文件。

## Reference

- PM-DISPATCH-RULES.md — 简报模板
- PM-RELEASE-CHECKLIST.md — 24 项 gate
- PM-FAILURE-CASES.md — 15 失败 + 修法
- ds-learn/2026-09-20-ontology-and-spec-driven.md — DS 同款 spec 设计哲学